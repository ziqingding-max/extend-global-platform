/**
 * Deposit Refund Service
 *
 * Generates a deposit_refund invoice when an employee is terminated.
 * The refund amount equals the original deposit invoice total.
 * The refund invoice is linked to the original deposit via relatedInvoiceId.
 */
import { getDb } from "../db";
import { invoices, invoiceItems, type InsertInvoice, type InsertInvoiceItem } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getEmployeeById, getCustomerById, getBillingEntityById } from "../db";
import { generateDepositInvoiceNumber } from "./invoiceNumberService";

/**
 * Find the original deposit invoice for an employee
 */
async function findDepositInvoice(employeeId: number) {
  const db = await getDb();
  if (!db) return null;

  // Find the deposit invoice that has a line item for this employee
  const items = await db
    .select({
      invoiceId: invoiceItems.invoiceId,
    })
    .from(invoiceItems)
    .where(
      and(
        eq(invoiceItems.employeeId, employeeId),
        eq(invoiceItems.itemType, "deposit")
      )
    );

  if (items.length === 0) return null;

  // Get the invoice
  const invoice = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, items[0].invoiceId),
        eq(invoices.invoiceType, "deposit")
      )
    );

  return invoice.length > 0 ? invoice[0] : null;
}

/**
 * Check if a deposit refund already exists for this employee
 */
async function hasDepositRefund(employeeId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const items = await db
    .select({ invoiceId: invoiceItems.invoiceId })
    .from(invoiceItems)
    .where(
      and(
        eq(invoiceItems.employeeId, employeeId),
        eq(invoiceItems.itemType, "deposit")
      )
    );

  if (items.length === 0) return false;

  // Verify the invoice is actually a deposit_refund type and not void/cancelled
  for (const item of items) {
    const inv = await db
      .select({ invoiceType: invoices.invoiceType, status: invoices.status })
      .from(invoices)
      .where(eq(invoices.id, item.invoiceId));
    if (
      inv.length > 0 &&
      inv[0].invoiceType === "deposit_refund" &&
      inv[0].status !== "cancelled"
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Generate a deposit refund invoice for a terminated employee
 *
 * @param employeeId - The employee being terminated
 * @returns Object with invoiceId and message
 */
export async function generateDepositRefund(
  employeeId: number
): Promise<{ invoiceId: number | null; message: string }> {
  const db = await getDb();
  if (!db) return { invoiceId: null, message: "Database not available" };

  try {
    // 1. Get employee and verify terminated status
    const employee = await getEmployeeById(employeeId);
    if (!employee) {
      return { invoiceId: null, message: "Employee not found" };
    }
    if (employee.status !== "terminated") {
      return { invoiceId: null, message: "Employee must be in 'terminated' status before generating a deposit refund" };
    }

    // 2. Check for duplicate
    const exists = await hasDepositRefund(employeeId);
    if (exists) {
      return { invoiceId: null, message: "Deposit refund already exists for this employee" };
    }

    // 3. Find original deposit invoice
    const depositInvoice = await findDepositInvoice(employeeId);
    if (!depositInvoice) {
      return { invoiceId: null, message: "No deposit invoice found for this employee" };
    }

    // 3b. Mutual exclusion: check if a credit note already exists for this deposit
    const existingCreditNotes = await db
      .select({ id: invoices.id, status: invoices.status })
      .from(invoices)
      .where(
        and(
          eq(invoices.relatedInvoiceId, depositInvoice.id),
          eq(invoices.invoiceType, "credit_note")
        )
      );
    const hasActiveCreditNote = existingCreditNotes.some(
      (cn) => cn.status !== "cancelled"
    );
    if (hasActiveCreditNote) {
      return {
        invoiceId: null,
        message: "This deposit has already been converted to a credit note. Cannot create a refund for a deposit that has been credited (refund and credit note are mutually exclusive).",
      };
    }

    const customer = await getCustomerById(employee.customerId);
    if (!customer) {
      return { invoiceId: null, message: "Customer not found" };
    }

    // 4. Calculate refund amount (same as original deposit, but negative conceptually)
    const refundAmount = parseFloat(depositInvoice.total?.toString() ?? "0");
    const originalCurrency = depositInvoice.currency || "USD";

    // 5. Generate invoice number
    const billingEntityId = depositInvoice.billingEntityId || customer.billingEntityId || null;
    const invoiceNumber = await generateDepositInvoiceNumber(billingEntityId);

    // 6. Deposit Refund: no due date
    const dueDate = null;

    // 7. Create refund invoice (amounts are negative to indicate refund)
    const invoiceData: InsertInvoice = {
      customerId: employee.customerId,
      billingEntityId,
      invoiceNumber,
      invoiceType: "deposit_refund",
      currency: originalCurrency,
      exchangeRate: depositInvoice.exchangeRate?.toString() || "1",
      exchangeRateWithMarkup: depositInvoice.exchangeRateWithMarkup?.toString() || "1",
      subtotal: (-refundAmount).toFixed(2),
      serviceFeeTotal: "0",
      tax: "0",
      total: (-refundAmount).toFixed(2),
      status: "draft",
      dueDate,
      relatedInvoiceId: depositInvoice.id,
      invoiceMonth: new Date().toISOString().slice(0, 10), // text column: use YYYY-MM-DD string
      amountDue: (-refundAmount).toFixed(2),
      notes: `Deposit refund for terminated employee ${employee.firstName} ${employee.lastName} (${employee.employeeCode}). Original deposit: ${depositInvoice.invoiceNumber}`,
    };

    const invoiceResult = await db.insert(invoices).values(invoiceData).returning({ id: invoices.id });
    const invoiceId = invoiceResult[0]?.id;
    if (!invoiceId) throw new Error("Failed to get deposit refund invoice ID after insert");

    // 8. Create refund line item
    const lineItem: InsertInvoiceItem = {
      invoiceId,
      employeeId,
      description: `Deposit Refund - ${employee.employeeCode || ''} ${employee.firstName} ${employee.lastName}`,
      quantity: "1",
      unitPrice: (-refundAmount).toFixed(2),
      amount: (-refundAmount).toFixed(2),
      itemType: "deposit",
      countryCode: employee.country,
    };

    await db.insert(invoiceItems).values(lineItem);

    return {
      invoiceId,
      message: `Deposit refund invoice ${invoiceNumber} created for ${employee.firstName} ${employee.lastName} (${(-refundAmount).toFixed(2)} ${originalCurrency})`,
    };
  } catch (error) {
    console.error("[DepositRefund] Error generating deposit refund:", error);
    return {
      invoiceId: null,
      message: `Failed to generate deposit refund: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
