/**
 * Credit Note Service
 *
 * Generates credit notes (贷项通知单) to offset/reverse existing invoices.
 * Credit notes can be full or partial, and are linked to the original invoice via relatedInvoiceId.
 * All amounts on a credit note are negative.
 */
import { getDb } from "../db";
import {
  invoices,
  invoiceItems,
  type InsertInvoice,
  type InsertInvoiceItem,
} from "../../drizzle/schema";
import { eq, like, and, ne, sql } from "drizzle-orm";
import { getInvoiceById, listInvoiceItemsByInvoice, getBillingEntityById, getCustomerById } from "../db";
import { walletService } from "./walletService";

export async function approveCreditNote(creditNoteId: number, approvedBy?: number, disposition?: "to_wallet" | "to_bank") {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  return await db.transaction(async (tx) => {
    // 1. Get the credit note
    const creditNote = await tx.query.invoices.findFirst({
      where: eq(invoices.id, creditNoteId),
    });

    if (!creditNote) throw new Error("Credit note not found");
    if (creditNote.invoiceType !== "credit_note" && creditNote.invoiceType !== "deposit_refund") {
      throw new Error("Invalid invoice type for credit note approval");
    }
    if (creditNote.status === "paid") {
      throw new Error("Credit note is already processed");
    }

    // Update disposition if provided
    const finalDisposition = disposition || creditNote.creditNoteDisposition || "to_wallet";
    if (disposition) {
      await tx.update(invoices).set({ creditNoteDisposition: disposition }).where(eq(invoices.id, creditNoteId));
    }

    // 2. Handle Deposit Release (Debit Frozen Wallet)
    if (creditNote.relatedInvoiceId) {
      const relatedInvoice = await getInvoiceById(creditNote.relatedInvoiceId);
      if (relatedInvoice && relatedInvoice.invoiceType === 'deposit') {
         // This is a Deposit Release CN. We must debit the Frozen Wallet.
         // We use the credit note total (absolute value)
         const releaseAmount = Math.abs(parseFloat(creditNote.total)).toFixed(2);
         
         await walletService.releaseDepositToCreditNote(
            creditNote.customerId,
            creditNote.currency,
            releaseAmount,
            creditNote.id,
            "Deposit Release Approved",
            approvedBy,
            tx  // Pass outer transaction to avoid nested db.transaction() (SQLITE_BUSY)
         );
      }
    }

    // 3. Handle Disposition (Credit Main Wallet or Bank)
    if (finalDisposition === "to_wallet") {
      // Calculate credit amount (absolute value)
      const creditAmount = Math.abs(parseFloat(creditNote.total));

      // Credit to wallet — pass tx to avoid nested transaction (SQLITE_BUSY)
      const wallet = await walletService.getWallet(creditNote.customerId, creditNote.currency, tx);
      await walletService.transact({
        walletId: wallet.id,
        type: "credit_note_in",
        amount: creditAmount.toFixed(2),
        direction: "credit",
        referenceId: creditNote.id,
        referenceType: "credit_note",
        description: `Credit Note #${creditNote.invoiceNumber} approved`,
        createdBy: approvedBy,
      }, tx);
    } else {
      // to_bank: Funds leave the system (or rather, are marked for external payment).
      // We don't touch the wallet.
      // We might want to create a "payout" record if we want to track it, but usually CN Paid means done.
      // Log it.
      console.log(`Credit Note #${creditNote.invoiceNumber} approved for Bank Refund.`);
    }

    // 4. Mark credit note as paid/processed
    await tx
      .update(invoices)
      .set({
        status: "paid",
        paidDate: new Date(),
        paidAmount: creditNote.total, // Negative amount
        amountDue: "0",
      })
      .where(eq(invoices.id, creditNoteId));

    return { success: true, message: `Credit note approved (${finalDisposition})` };
  });
}


export interface CreditNoteLineItem {
  originalItemId?: number;
  description: string;
  amount: string; // Positive value — will be negated in the credit note
  employeeId?: number;
  countryCode?: string;
  itemType?: string;
}

/**
 * Generate a credit note for an existing invoice
 *
 * @param originalInvoiceId - The invoice to credit
 * @param reason - Reason for the credit note
 * @param lineItems - Optional specific line items to credit (if empty, full credit)
 * @param isFullCredit - If true, credit the entire invoice
 */
/**
 * Generate a sequential credit note number: CN-{prefix}{YYYYMM}-{seq}
 */
async function generateCreditNoteNumber(
  billingEntityId: number | null | undefined,
  invoiceMonth: Date
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const yearMonth = `${invoiceMonth.getFullYear()}${String(invoiceMonth.getMonth() + 1).padStart(2, "0")}`;

  let bePrefix = "";
  if (billingEntityId) {
    const be = await getBillingEntityById(billingEntityId);
    if (be?.invoicePrefix) {
      bePrefix = be.invoicePrefix;
      if (!bePrefix.endsWith("-") && !bePrefix.endsWith("_")) {
        bePrefix += "-";
      }
    }
  }

  const prefix = `CN-${bePrefix}`;
  const pattern = `${prefix}${yearMonth}-%`;

  const existing = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(like(invoices.invoiceNumber, pattern));

  let maxSeq = 0;
  for (const row of existing) {
    const parts = row.invoiceNumber.split("-");
    const lastPart = parts[parts.length - 1];
    const seq = parseInt(lastPart, 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}${yearMonth}-${nextSeq.toString().padStart(3, "0")}`;
}

export async function generateCreditNote(params: {
  originalInvoiceId: number;
  reason: string;
  lineItems?: CreditNoteLineItem[];
  isFullCredit?: boolean;
}): Promise<{ invoiceId: number | null; message: string }> {
  const db = await getDb();
  if (!db) return { invoiceId: null, message: "Database not available" };

  try {
    // 1. Get original invoice
    const originalInvoice = await getInvoiceById(params.originalInvoiceId);
    if (!originalInvoice) {
      throw new Error("Original invoice not found");
    }

    // 2. Validate original invoice status — can only credit paid invoices
    if (originalInvoice.status !== "paid") {
      throw new Error(`Cannot create credit note for invoice in '${originalInvoice.status}' status. Only paid invoices can be credited.`);
    }

    // 2a. Type restriction: cannot create credit note for credit_note or deposit_refund
    if (["credit_note", "deposit_refund"].includes(originalInvoice.invoiceType || "")) {
      throw new Error(`Cannot create credit note for a ${originalInvoice.invoiceType} invoice.`);
    }

    // 2b. If original invoice is a deposit, verify the employee is terminated
    if (originalInvoice.invoiceType === "deposit") {
      const originalItems = await listInvoiceItemsByInvoice(params.originalInvoiceId);
      const depositItem = originalItems.find(item => item.employeeId);
      if (depositItem?.employeeId) {
        const { getEmployeeById: getEmp } = await import("../db");
        const employee = await getEmp(depositItem.employeeId);
        if (employee && employee.status !== "terminated") {
          throw new Error("Employee must be in 'terminated' status before creating a credit note for a deposit invoice");
        }
      }

      // 2c. Deposit mutual exclusion: check if a deposit_refund already exists
      const existingRefunds = await db
        .select({ id: invoices.id, status: invoices.status })
        .from(invoices)
        .where(
          and(
            eq(invoices.relatedInvoiceId, params.originalInvoiceId),
            eq(invoices.invoiceType, "deposit_refund")
          )
        );
      const hasActiveRefund = existingRefunds.some(
        (r) => r.status !== "cancelled"
      );
      if (hasActiveRefund) {
        throw new Error("This deposit has already been refunded. Cannot create a credit note for a refunded deposit.");
      }

      // 2d. Deposit: only full-amount credit note allowed
      if (!params.isFullCredit) {
        throw new Error("Deposit invoices only support full-amount credit notes. Partial credit is not allowed for deposits.");
      }

      // 2e. Deposit: check if a credit note already exists (only one allowed)
      const existingCreditNotes = await db
        .select({ id: invoices.id, status: invoices.status })
        .from(invoices)
        .where(
          and(
            eq(invoices.relatedInvoiceId, params.originalInvoiceId),
            eq(invoices.invoiceType, "credit_note")
          )
        );
      const hasActiveCreditNote = existingCreditNotes.some(
        (cn) => cn.status !== "cancelled"
      );
      if (hasActiveCreditNote) {
        throw new Error("This deposit already has a credit note. Only one credit note is allowed per deposit.");
      }
    }

    // 2f. Cumulative credit note limit: total credit notes for one invoice cannot exceed invoice total
    if (originalInvoice.invoiceType !== "deposit") {
      const existingCreditNotes = await db
        .select({ total: invoices.total, status: invoices.status })
        .from(invoices)
        .where(
          and(
            eq(invoices.relatedInvoiceId, params.originalInvoiceId),
            eq(invoices.invoiceType, "credit_note")
          )
        );
      const existingCreditTotal = existingCreditNotes
        .filter((cn) => cn.status !== "cancelled")
        .reduce((sum, cn) => sum + Math.abs(parseFloat(cn.total?.toString() ?? "0")), 0);

      const originalTotal = Math.abs(parseFloat(originalInvoice.total?.toString() ?? "0"));

      // Calculate how much credit we're about to create
      let pendingCreditAmount: number;
      if (params.isFullCredit) {
        pendingCreditAmount = originalTotal;
      } else if (params.lineItems && params.lineItems.length > 0) {
        pendingCreditAmount = params.lineItems.reduce(
          (sum, item) => sum + Math.abs(parseFloat(item.amount)),
          0
        );
      } else {
        pendingCreditAmount = 0;
      }

      if (existingCreditTotal + pendingCreditAmount > originalTotal + 0.01) {
        const remaining = (originalTotal - existingCreditTotal).toFixed(2);
        throw new Error(`Cumulative credit notes (${existingCreditTotal.toFixed(2)} existing + ${pendingCreditAmount.toFixed(2)} new) would exceed the original invoice total (${originalTotal.toFixed(2)}). Maximum remaining credit: ${remaining}.`);
      }
    }

    // 3. Get customer info
    const customer = await getCustomerById(originalInvoice.customerId);

    // 4. Determine credit amount
    let creditTotal: number;
    let creditItems: InsertInvoiceItem[] = [];

    if (params.isFullCredit) {
      // Full credit — negate the entire invoice
      creditTotal = parseFloat(originalInvoice.total?.toString() ?? "0");

      // Get all original line items and negate them
      const originalItems = await listInvoiceItemsByInvoice(params.originalInvoiceId);
      creditItems = originalItems.map((item) => ({
        invoiceId: 0, // Will be set after invoice creation
        employeeId: item.employeeId,
        description: `Credit: ${item.description}`,
        quantity: item.quantity?.toString() || "1",
        unitPrice: (-Math.abs(parseFloat(item.unitPrice?.toString() ?? "0"))).toFixed(2),
        amount: (-Math.abs(parseFloat(item.amount?.toString() ?? "0"))).toFixed(2),
        itemType: (item.itemType || "employment_cost") as any,
        countryCode: item.countryCode,
        localCurrency: item.localCurrency,
        localAmount: item.localAmount
          ? (-Math.abs(parseFloat(item.localAmount.toString()))).toFixed(2)
          : undefined,
        exchangeRate: item.exchangeRate?.toString(),
        exchangeRateWithMarkup: item.exchangeRateWithMarkup?.toString(),
      }));
    } else if (params.lineItems && params.lineItems.length > 0) {
      // Partial credit — use provided line items
      creditTotal = params.lineItems.reduce(
        (sum, item) => sum + Math.abs(parseFloat(item.amount)),
        0
      );

      creditItems = params.lineItems.map((item) => ({
        invoiceId: 0,
        employeeId: item.employeeId,
        description: item.description,
        quantity: "1",
        unitPrice: (-Math.abs(parseFloat(item.amount))).toFixed(2),
        amount: (-Math.abs(parseFloat(item.amount))).toFixed(2),
        itemType: (item.itemType || "employment_cost") as any,
        countryCode: item.countryCode,
      }));
    } else {
      throw new Error("Either isFullCredit must be true or lineItems must be provided");
    }

    // 5. Generate credit note number with its own CN- sequence
    const billingEntityId = originalInvoice.billingEntityId || customer?.billingEntityId || null;
    const creditNoteNumber = await generateCreditNoteNumber(
      billingEntityId,
      originalInvoice.invoiceMonth
        ? new Date(originalInvoice.invoiceMonth)
        : new Date()
    );

    // 6. Credit Note: no due date
    const dueDate = null;

    // 7. Create credit note invoice (all amounts negative)
    // Credit Note status should be 'sent' immediately to appear in Release Tasks
    const invoiceData: InsertInvoice = {
      customerId: originalInvoice.customerId,
      billingEntityId,
      invoiceNumber: creditNoteNumber,
      invoiceType: "credit_note",
      invoiceMonth: originalInvoice.invoiceMonth || undefined, // already a string from DB
      currency: originalInvoice.currency || "USD",
      exchangeRate: originalInvoice.exchangeRate?.toString() || "1",
      exchangeRateWithMarkup: originalInvoice.exchangeRateWithMarkup?.toString() || "1",
      subtotal: (-creditTotal).toFixed(2),
      serviceFeeTotal: "0",
      tax: "0",
      total: (-creditTotal).toFixed(2),
      status: "sent", // CHANGED from 'draft' to 'sent'
      sentDate: new Date(), // Set sentDate immediately
      dueDate,
      relatedInvoiceId: params.originalInvoiceId,
      notes: `Credit Note for ${originalInvoice.invoiceNumber}. Reason: ${params.reason}`,
    };

    const invoiceResult = await db.insert(invoices).values(invoiceData).returning({ id: invoices.id });
    const invoiceId = invoiceResult[0]?.id;
    if (!invoiceId) {
      throw new Error("Failed to get credit note invoice ID after insert");
    }

    // 8. Create credit note line items
    for (const item of creditItems) {
      await db.insert(invoiceItems).values({
        ...item,
        invoiceId,
      });
    }

    return {
      invoiceId,
      message: `Credit note ${creditNoteNumber} created (Sent). Please process in Release Tasks.`,
    };
  } catch (error) {
    console.error("[CreditNote] Error generating credit note:", error);
    // Re-throw the error so the caller (TRPC) catches it and sends 500/400 to client
    throw error;
  }
}
