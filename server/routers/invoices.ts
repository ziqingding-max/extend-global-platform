import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure, userProcedure } from "../procedures";
import {
  createInvoice,
  getInvoiceById,
  getInvoiceByNumber,
  listInvoices,
  updateInvoice,
  listInvoiceItemsByInvoice,
  getRelatedInvoices,
  createInvoiceItem,
  updateInvoiceItem,
  deleteInvoiceItem,
  deleteInvoice,
  logAuditAction,
  getDb,
  listBillingEntities,
} from "../db";
import { invoices as invoicesTable, customers as customersTable } from "../../drizzle/schema";
import { eq, and, sql, between } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { generateInvoiceNumber, generateDepositInvoiceNumber } from "../services/invoiceNumberService";
import { generateCreditNote, approveCreditNote, type CreditNoteLineItem } from "../services/creditNoteService";
import { generateDepositRefund } from "../services/depositRefundService";
import { notifyOwner } from "../_core/notification";
import { notificationService } from "../services/notificationService";
import { getExchangeRate } from "../services/exchangeRateService";
import { walletService } from "../services/walletService";
import { markContractorInvoicesPaidByClientInvoice } from "../db";

const invoiceItemTypeEnum = z.enum([
  "eor_service_fee",
  "visa_eor_service_fee",
  "aor_service_fee",
  "employment_cost",
  "deposit",
  "equipment_procurement_fee",
  "onboarding_fee",
  "offboarding_fee",
  "admin_setup_fee",
  "contract_termination_fee",
  "payroll_processing_fee",
  "tax_filing_fee",
  "hr_advisory_fee",
  "legal_compliance_fee",
  "visa_immigration_fee",
  "relocation_fee",
  "benefits_admin_fee",
  "bank_transfer_fee",
  "consulting_fee",
  "management_consulting_fee",
]);

/**
 * Recalculate invoice totals from line items.
 *
 * KEY RULE: Line items store amounts in their LOCAL currency (unitPrice, localAmount).
 * The invoice total must be in the SETTLEMENT currency (invoice.currency, typically USD).
 * For items with a foreign localCurrency, we convert using exchangeRateWithMarkup (or exchangeRate).
 * Service fee items are already in settlement currency (no conversion needed).
 */
async function recalculateInvoiceTotals(invoiceId: number) {
  const invoice = await getInvoiceById(invoiceId);
  const items = await listInvoiceItemsByInvoice(invoiceId);
  const settlementCurrency = invoice?.currency || 'USD';

  let subtotal = 0;
  let taxTotal = 0;
  let serviceFeeTotal = 0;

  const serviceFeeTypes = ["eor_service_fee", "visa_eor_service_fee", "aor_service_fee"];

  for (const item of items) {
    const qty = parseFloat(item.quantity?.toString() ?? "1");
    const rate = parseFloat(item.unitPrice?.toString() ?? "0");
    const vatRate = parseFloat((item as any).vatRate?.toString() ?? "0");
    const localCurrency = item.localCurrency || null;
    const itemExchangeRateWithMarkup = parseFloat((item as any).exchangeRateWithMarkup?.toString() ?? "0");
    const itemExchangeRate = parseFloat(item.exchangeRate?.toString() ?? "0");

    // Determine conversion rate: use exchangeRateWithMarkup if available, else exchangeRate
    // exchangeRate direction is localCurrency → settlementCurrency (e.g. CNY→USD = 0.1455)
    let conversionRate = 1;
    if (localCurrency && localCurrency !== settlementCurrency) {
      if (itemExchangeRateWithMarkup > 0) {
        conversionRate = itemExchangeRateWithMarkup;
      } else if (itemExchangeRate > 0) {
        conversionRate = itemExchangeRate;
      }
    }

    const baseAmountLocal = qty * rate;
    const baseAmountSettlement = baseAmountLocal * conversionRate;

    // Service fees are NOT subject to VAT and are already in settlement currency
    const isServiceFee = serviceFeeTypes.includes(item.itemType);
    const taxAmountSettlement = isServiceFee ? 0 : baseAmountSettlement * (vatRate / 100);

    if (isServiceFee) {
      serviceFeeTotal += baseAmountSettlement;
    } else {
      subtotal += baseAmountSettlement;
    }
    taxTotal += taxAmountSettlement;

    // Update the line item's amount field to reflect the settlement currency value (including tax)
    const lineItemTotalSettlement = baseAmountSettlement + taxAmountSettlement;
    await updateInvoiceItem(item.id, { amount: lineItemTotalSettlement.toFixed(2) });
  }

  // total = subtotal (employment costs in settlement ccy) + serviceFeeTotal + tax
  const total = subtotal + serviceFeeTotal + taxTotal;

  // Also update invoice-level exchange rate from line items
  const foreignItems = items.filter(item => item.localCurrency && item.localCurrency !== settlementCurrency);
  // Recalculate amountDue: total minus any wallet applied amount
  const walletApplied = parseFloat(invoice?.walletAppliedAmount?.toString() || "0");
  const paidAmount = parseFloat(invoice?.paidAmount?.toString() || "0");
  const newAmountDue = Math.max(0, total - walletApplied - paidAmount);

  const updateData: Record<string, string> = {
    subtotal: subtotal.toFixed(2),
    serviceFeeTotal: serviceFeeTotal.toFixed(2),
    tax: taxTotal.toFixed(2),
    total: total.toFixed(2),
    amountDue: newAmountDue.toFixed(2),
  };

  if (foreignItems.length > 0) {
    // Use the exchange rate from the first foreign currency item
    const firstForeign = foreignItems[0];
    if (firstForeign.exchangeRate) {
      updateData.exchangeRate = firstForeign.exchangeRate.toString();
    }
    if ((firstForeign as any).exchangeRateWithMarkup) {
      updateData.exchangeRateWithMarkup = (firstForeign as any).exchangeRateWithMarkup.toString();
    }
  }

  await updateInvoice(invoiceId, updateData);

  return { subtotal, serviceFeeTotal, tax: taxTotal, total };
}

export const invoicesRouter = router({
  list: userProcedure
    .input(
      z.object({
        customerId: z.number().optional(),
        status: z.string().optional(),
        invoiceType: z.string().optional(),
        invoiceMonth: z.string().optional(),
        excludeCreditNotes: z.boolean().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      return await listInvoices(
        {
          customerId: input.customerId,
          status: input.status,
          invoiceType: input.invoiceType,
          invoiceMonth: input.invoiceMonth,
          excludeCreditNotes: input.excludeCreditNotes,
        },
        input.limit,
        input.offset
      );
    }),

  get: userProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const invoice = await getInvoiceById(input.id);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      return invoice;
    }),

  getByNumber: userProcedure
    .input(z.object({ invoiceNumber: z.string() }))
    .query(async ({ input }) => {
      const invoice = await getInvoiceByNumber(input.invoiceNumber);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      return invoice;
    }),

  getItems: userProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ input }) => {
      return await listInvoiceItemsByInvoice(input.invoiceId);
    }),

  /**
   * Get real-time exchange rate reference for an invoice
   * Checks line items for foreign currency (non-USD localCurrency)
   * Fetches live rate and compares with invoice markup rate
   * For finance manager reference only - not shown on PDF or client-facing pages
   */
  getRealTimeRateReference: financeManagerProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ input }) => {
      const invoice = await getInvoiceById(input.invoiceId);
      if (!invoice) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }

      // Check line items for foreign currency
      const items = await listInvoiceItemsByInvoice(input.invoiceId);
      const foreignCurrencies = Array.from(new Set(
        items
          .map(item => (item as any).localCurrency)
          .filter((c: string | null | undefined): c is string => !!c && c !== 'USD')
      ));

      // No foreign currency in line items = no exchange rate comparison needed
      if (foreignCurrencies.length === 0) {
        return {
          foreignCurrency: null,
          invoiceCurrency: invoice.currency || 'USD',
          invoiceTotal: invoice.total?.toString() || '0',
          invoiceExchangeRate: invoice.exchangeRate?.toString() || '1',
          invoiceExchangeRateWithMarkup: invoice.exchangeRateWithMarkup?.toString() || '1',
          liveRate: null,
          liveRateSource: null,
          liveUsdEquivalent: null,
          invoiceUsdEquivalent: invoice.total?.toString() || '0',
          amountDiff: null,
          amountDiffPercent: null,
          fetchedAt: new Date().toISOString(),
        };
      }

      // Use the primary foreign currency (first non-USD localCurrency found)
      const foreignCurrency = foreignCurrencies[0];

      // Fetch live rate: convert to XXX→USD direction (same as invoice exchangeRate)
      // API returns USD→XXX (e.g., 1 USD = 31.08 THB), we need XXX→USD (e.g., 1 THB = 0.0322 USD)
      let liveRate: number | null = null;
      let liveRateSource: string | null = null;
      try {
        const response = await fetch(`https://open.er-api.com/v6/latest/USD`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          const data = await response.json() as { result: string; rates: Record<string, number> };
          if (data.result === 'success' && data.rates[foreignCurrency] && data.rates[foreignCurrency] > 0) {
            // Convert from USD→XXX to XXX→USD
            liveRate = 1 / data.rates[foreignCurrency];
            liveRateSource = 'ExchangeRate-API (open.er-api.com)';
          }
        }
      } catch {
        // Fallback to Frankfurter
        try {
          const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${foreignCurrency}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(10000),
          });
          if (response.ok) {
            const data = await response.json() as { rates: Record<string, number> };
            if (data.rates[foreignCurrency] && data.rates[foreignCurrency] > 0) {
              // Convert from USD→XXX to XXX→USD
              liveRate = 1 / data.rates[foreignCurrency];
              liveRateSource = 'Frankfurter (ECB)';
            }
          }
        } catch {
          // Both APIs failed
        }
      }

      const invoiceTotal = parseFloat(invoice.total?.toString() || "0");
      const invoiceRate = parseFloat(invoice.exchangeRateWithMarkup?.toString() || invoice.exchangeRate?.toString() || '1');

      // Calculate: what would the total be at live rate vs invoice markup rate?
      // Invoice items are in foreignCurrency, converted to USD using invoiceRate
      // Sum of local amounts = invoiceTotal (USD) * invoiceRate (foreignCurrency/USD) = total in foreign currency
      // At live rate: total in foreign currency / liveRate = USD equivalent
      let liveUsdEquivalent: number | null = null;
      let amountDiff: number | null = null;
      let amountDiffPercent: number | null = null;

      if (liveRate && liveRate > 0 && invoiceRate > 0) {
        // Both invoiceRate and liveRate are now in XXX→USD direction
        // invoiceTotal is in USD. To get local total: localTotal = invoiceTotal / invoiceRate
        // At live rate: liveUsdEquivalent = localTotal * liveRate
        const localTotal = invoiceTotal / invoiceRate;
        liveUsdEquivalent = localTotal * liveRate;
        amountDiff = invoiceTotal - liveUsdEquivalent;
        amountDiffPercent = liveUsdEquivalent > 0 ? ((invoiceTotal - liveUsdEquivalent) / liveUsdEquivalent) * 100 : 0;
      }

      return {
        foreignCurrency,
        invoiceCurrency: invoice.currency || 'USD',
        invoiceTotal: invoiceTotal.toFixed(2),
        invoiceExchangeRate: invoice.exchangeRate?.toString() || '1',
        invoiceExchangeRateWithMarkup: invoiceRate.toFixed(6),
        liveRate: liveRate?.toFixed(6) || null,
        liveRateSource,
        liveUsdEquivalent: liveUsdEquivalent?.toFixed(2) || null,
        invoiceUsdEquivalent: invoiceTotal.toFixed(2),
        amountDiff: amountDiff?.toFixed(2) || null,
        amountDiffPercent: amountDiffPercent?.toFixed(2) || null,
        fetchedAt: new Date().toISOString(),
      };
    }),

  getRelated: userProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ input }) => {
      return await getRelatedInvoices(input.invoiceId);
    }),

  create: financeManagerProcedure
    .input(
      z.object({
        customerId: z.number(),
        billingEntityId: z.number().optional(),
        invoiceType: z.enum(["deposit", "monthly_eor", "monthly_visa_eor", "monthly_aor", "visa_service", "deposit_refund", "credit_note", "manual"]),
        invoiceMonth: z.string().optional(),
        currency: z.string(),
        exchangeRate: z.string().default("1"),
        exchangeRateWithMarkup: z.string().default("1"),
        subtotal: z.string(),
        serviceFeeTotal: z.string().default("0"),
        tax: z.string().default("0"),
        notes: z.string().optional(),
        internalNotes: z.string().optional(),
        dueDate: z.string().optional(),
        relatedInvoiceId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Validate that the customer exists
      const db = await getDb();
      const [customer] = await db!.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.id, input.customerId)).limit(1);
      if (!customer) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Customer with ID ${input.customerId} does not exist` });
      }

      const subtotal = parseFloat(input.subtotal);
      const serviceFeeTotal = parseFloat(input.serviceFeeTotal);
      const tax = parseFloat(input.tax);
      const total = subtotal + serviceFeeTotal + tax;

      // Generate sequential invoice number based on billing entity
      const invoiceNumber = input.invoiceType === "deposit"
        ? await generateDepositInvoiceNumber(input.billingEntityId)
        : await generateInvoiceNumber(input.billingEntityId, input.invoiceMonth || new Date().toISOString());

      // invoiceMonth and dueDate are text columns in schema — pass strings, not Date objects
      const invoiceMonthStr = input.invoiceMonth || new Date().toISOString().slice(0, 10);

      const result = await createInvoice({
        customerId: input.customerId,
        billingEntityId: input.billingEntityId,
        invoiceNumber,
        invoiceType: input.invoiceType,
        invoiceMonth: invoiceMonthStr,
        currency: input.currency,
        exchangeRate: input.exchangeRate,
        exchangeRateWithMarkup: input.exchangeRateWithMarkup,
        subtotal: input.subtotal,
        serviceFeeTotal: input.serviceFeeTotal,
        tax: input.tax,
        total: total.toString(),
        status: "draft",
        amountDue: total.toString(),
        notes: input.notes,
        internalNotes: input.internalNotes,
        dueDate: input.dueDate || undefined,
        relatedInvoiceId: input.relatedInvoiceId,
      });

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "create",
        entityType: "invoice",
        changes: JSON.stringify(input),
      });

      return result;
    }),

  /**
   * Update invoice metadata (only draft invoices can be fully edited)
   */
  update: financeManagerProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          notes: z.string().nullable().optional(),
          internalNotes: z.string().nullable().optional(),
          dueDate: z.string().nullable().optional(),
          billingEntityId: z.number().nullable().optional(),
          customerId: z.number().optional(),
          currency: z.string().optional(),
          invoiceType: z.enum(["deposit", "monthly_eor", "monthly_visa_eor", "monthly_aor", "visa_service", "deposit_refund", "credit_note", "manual"]).optional(),
          invoiceMonth: z.string().nullable().optional(),
          exchangeRate: z.string().optional(),
          exchangeRateWithMarkup: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // sentDate and paidDate are NOT editable here (managed by status transitions)
      const updateData: any = {};

      // Whitelist approach: only draft and pending_review allow external notes editing
      const existingInvoice = await getInvoiceById(input.id);
      const postSentStatuses = ["sent", "paid", "overdue", "void"];
      const isPostSent = existingInvoice && postSentStatuses.includes(existingInvoice.status);
      const canEditExternalNotes = !isPostSent;

      // Copy simple fields (block external notes unless in draft/pending_review)
      if (input.data.notes !== undefined) {
        if (canEditExternalNotes) {
          updateData.notes = input.data.notes;
        }
        // Silently ignore external notes changes for non-editable statuses
      }
      if (input.data.internalNotes !== undefined) updateData.internalNotes = input.data.internalNotes;
      if (input.data.billingEntityId !== undefined) updateData.billingEntityId = input.data.billingEntityId;
      if (input.data.customerId !== undefined) updateData.customerId = input.data.customerId;
      if (input.data.currency !== undefined) updateData.currency = input.data.currency;
      if (input.data.invoiceType !== undefined) updateData.invoiceType = input.data.invoiceType;
      if (input.data.exchangeRate !== undefined) updateData.exchangeRate = input.data.exchangeRate;
      if (input.data.exchangeRateWithMarkup !== undefined) updateData.exchangeRateWithMarkup = input.data.exchangeRateWithMarkup;

      // Date fields — dueDate and invoiceMonth are text columns, pass strings directly
      if (input.data.dueDate !== undefined) {
        updateData.dueDate = input.data.dueDate || null;
      }
      if (input.data.invoiceMonth !== undefined) {
        updateData.invoiceMonth = input.data.invoiceMonth || null;
      }

      await updateInvoice(input.id, updateData);

      // If exchangeRateWithMarkup changed, sync to all foreign-currency line items and recalculate totals
      if (input.data.exchangeRateWithMarkup !== undefined) {
        const currentInvoice = await getInvoiceById(input.id);
        const allItems = await listInvoiceItemsByInvoice(input.id);
        const settlementCurrency = currentInvoice?.currency || 'USD';

        for (const item of allItems) {
          if (item.localCurrency && item.localCurrency !== settlementCurrency) {
            await updateInvoiceItem(item.id, {
              exchangeRateWithMarkup: input.data.exchangeRateWithMarkup,
            });
          }
        }

        await recalculateInvoiceTotals(input.id);
      }

      // If billingEntityId changed, regenerate invoice number
      if (input.data.billingEntityId !== undefined) {
        const invoice = await getInvoiceById(input.id);
        if (invoice && invoice.status === "draft") {
          const newNumber = await generateInvoiceNumber(
            input.data.billingEntityId,
            invoice.invoiceMonth || new Date().toISOString().slice(0, 10)
          );
          await updateInvoice(input.id, { invoiceNumber: newNumber });
        }
      }

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update",
        entityType: "invoice",
        entityId: input.id,
        changes: JSON.stringify(input.data),
      });

      return { success: true };
    }),

  updateStatus: financeManagerProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["draft", "pending_review", "sent", "paid", "cancelled"]),
        paidAmount: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Guard: credit_note and deposit_refund cannot be marked as paid
      // NOTE: With the new wallet system, credit_note invoices are marked as paid automatically
      // when approved via approveCreditNote service. Manual status update for CNs is restricted.
      if (input.status === "paid") {
        const invoice = await getInvoiceById(input.id);
        if (invoice && (invoice.invoiceType === "credit_note" || invoice.invoiceType === "deposit_refund")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Cannot manually mark ${invoice.invoiceType} as paid. Please use the approval workflow.`,
          });
        }
      }

      // Wallet Logic: Handle transitions
      const invoice = await getInvoiceById(input.id);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const oldStatus = invoice.status;
      const newStatus = input.status;

      // Validate status transition
      const validTransitions: Record<string, string[]> = {
        draft: ["pending_review", "cancelled"],
        pending_review: ["sent", "draft", "cancelled"],
        sent: ["paid", "cancelled"],
        overdue: ["paid", "cancelled"],
      };
      const allowed = validTransitions[oldStatus || "draft"] || [];
      if (!allowed.includes(newStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from '${oldStatus}' to '${newStatus}'`,
        });
      };

      // 1. Draft -> Pending Review: Manual review only
      if (oldStatus === "draft" && newStatus === "pending_review") {
        // No auto-deduction logic here anymore.
        // User must manually pay via wallet in the UI if they wish to use balance.
      }

      // 2. Pending Review -> Draft (Rejected): Refund wallet deduction
      if (oldStatus === "pending_review" && newStatus === "draft") {
        const walletApplied = parseFloat(invoice.walletAppliedAmount || "0");
        if (walletApplied > 0) {
          await walletService.refundDeduction(
            invoice.id,
            invoice.customerId,
            invoice.currency,
            invoice.walletAppliedAmount || "0"
          );
          
          // Reset invoice fields
          await updateInvoice(invoice.id, {
            walletAppliedAmount: "0",
            amountDue: invoice.total, // Reset to full total
          });
        }
      }

      // 3. Mark as Paid: Overpayment wallet credit is handled below after paymentResult calculation
      // to ensure consistent effectiveAmountDue baseline.

      const updateData: any = { status: input.status };
      let paymentResult: { type: "exact" | "underpayment" | "overpayment"; difference: string; invoiceTotal: string } | undefined;

      if (input.status === "sent") {
        updateData.sentDate = new Date();
        
        // Trigger notification
        const invoice = await getInvoiceById(input.id);
        if (invoice) {
          notificationService.send({
            type: "invoice_sent",
            customerId: invoice.customerId,
            data: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              amount: invoice.total,
              currency: invoice.currency,
              dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A"
            }
          }).catch(err => console.error("Failed to send invoice notification:", err));
        }
      } else if (input.status === "paid") {
        // Require paidAmount for paid status
        if (!input.paidAmount) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Payment amount is required when marking as paid" });
        }
        updateData.paidDate = new Date();
        updateData.paidAmount = input.paidAmount;
        // If paid, ensure amountDue is 0
        updateData.amountDue = "0";

        // Compare paid amount with effective amount due (total minus wallet applied)
        const invoice = await getInvoiceById(input.id);
        if (invoice) {
          const invoiceTotal = parseFloat(invoice.total?.toString() ?? "0");
          const walletApplied = parseFloat(invoice.walletAppliedAmount?.toString() ?? "0");
          const effectiveAmountDue = walletApplied > 0
            ? parseFloat(invoice.amountDue?.toString() ?? (invoiceTotal - walletApplied).toFixed(2))
            : invoiceTotal;
          const paidAmt = parseFloat(input.paidAmount);
          const diff = paidAmt - effectiveAmountDue;

          if (Math.abs(diff) < 0.01) {
            paymentResult = { type: "exact", difference: "0.00", invoiceTotal: effectiveAmountDue.toFixed(2) };
          } else if (diff < 0) {
            paymentResult = { type: "underpayment", difference: Math.abs(diff).toFixed(2), invoiceTotal: effectiveAmountDue.toFixed(2) };
          } else {
            paymentResult = { type: "overpayment", difference: diff.toFixed(2), invoiceTotal: effectiveAmountDue.toFixed(2) };
          }
        }
      }

      await updateInvoice(input.id, updateData);

      // Handle Deposit Invoice -> Frozen Wallet when manually marked as paid
      // If it's a deposit invoice being marked as paid, funds should move to Frozen Wallet.
      if (input.status === 'paid' && input.paidAmount) {
        const invoiceForDeposit = await getInvoiceById(input.id);
        if (invoiceForDeposit && invoiceForDeposit.invoiceType === 'deposit') {
          await walletService.depositToFrozen(
            invoiceForDeposit.customerId,
            invoiceForDeposit.currency,
            input.paidAmount,
            invoiceForDeposit.id,
            ctx.user.id
          );
        }
      }

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update_status",
        entityType: "invoice",
        entityId: input.id,
        changes: JSON.stringify({ status: input.status, paidAmount: input.paidAmount }),
      });

      // Auto follow-up actions for payment discrepancies
      let followUpInvoiceId: number | undefined;
      let creditNoteId: number | undefined;

      if (paymentResult && input.status === "paid") {
        const invoice = await getInvoiceById(input.id);
        if (invoice) {
          if (paymentResult.type === "underpayment") {
            // Create a follow-up invoice for the outstanding balance
            const followUpMonth = new Date();
            followUpMonth.setMonth(followUpMonth.getMonth() + 1);
            followUpMonth.setDate(1);

            const followUpNumber = await generateInvoiceNumber(
              invoice.billingEntityId,
              followUpMonth.toISOString()
            );

            const followUpResult = await createInvoice({
              customerId: invoice.customerId,
              billingEntityId: invoice.billingEntityId,
              invoiceNumber: followUpNumber,
              invoiceType: "manual",
              invoiceMonth: followUpMonth,
              currency: invoice.currency || "USD",
              exchangeRate: "1",
              exchangeRateWithMarkup: "1",
              subtotal: paymentResult.difference,
              serviceFeeTotal: "0",
              tax: "0",
              total: paymentResult.difference,
              status: "draft",
              relatedInvoiceId: input.id,
              notes: `Outstanding balance from ${invoice.invoiceNumber}. Original total: ${invoice.currency} ${paymentResult.invoiceTotal}, Paid: ${invoice.currency} ${input.paidAmount}, Shortfall: ${invoice.currency} ${paymentResult.difference}`,
              dueDate: new Date(followUpMonth.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            });

            followUpInvoiceId = (followUpResult as any)?.[0]?.id;

            // Add a single line item for the outstanding balance
            if (followUpInvoiceId) {
              await createInvoiceItem({
                invoiceId: followUpInvoiceId,
                description: `Outstanding balance from invoice ${invoice.invoiceNumber}`,
                quantity: "1",
                unitPrice: paymentResult.difference,
                amount: paymentResult.difference,
                itemType: "employment_cost" as any,
              });

              await logAuditAction({
                userId: ctx.user.id, userName: ctx.user.name || null,
                action: "auto_create",
                entityType: "invoice",
                entityId: followUpInvoiceId,
                changes: JSON.stringify({
                  type: "underpayment_followup",
                  originalInvoiceId: input.id,
                  shortfall: paymentResult.difference,
                }),
              });

              // Notify finance manager about follow-up invoice
              notifyOwner({
                title: `Follow-up Invoice Created (Underpayment)`,
                content: `A follow-up invoice has been automatically created for underpayment on invoice ${invoice.invoiceNumber}.\n\nOriginal Invoice: ${invoice.invoiceNumber}\nInvoice Total: ${invoice.currency} ${paymentResult.invoiceTotal}\nAmount Paid: ${invoice.currency} ${input.paidAmount}\nShortfall: ${invoice.currency} ${paymentResult.difference}\nFollow-up Invoice ID: #${followUpInvoiceId}\n\nPlease review and send the follow-up invoice to the client.`,
              }).catch((err) => console.warn("[Notification] Failed to notify about follow-up invoice:", err));
            }
          } else if (paymentResult.type === "overpayment") {
            // Credit overpayment to customer's wallet using the unified effectiveAmountDue baseline
            const overpaymentAmount = paymentResult.difference;
            const wallet = await walletService.getWallet(invoice.customerId, invoice.currency);
            await walletService.transact({
              walletId: wallet.id,
              type: "overpayment_in",
              amount: overpaymentAmount,
              direction: "credit",
              referenceId: invoice.id,
              referenceType: "invoice",
              description: `Overpayment for Invoice #${invoice.invoiceNumber}`,
              createdBy: ctx.user.id,
            });
            
            await logAuditAction({
              userId: ctx.user.id, userName: ctx.user.name || null,
              action: "auto_create",
              entityType: "wallet_transaction",
              entityId: invoice.id,
              changes: JSON.stringify({
                type: "overpayment_to_wallet",
                originalInvoiceId: input.id,
                excess: paymentResult.difference,
              }),
            });

            // Notify finance manager about wallet credit
            notifyOwner({
              title: `Overpayment Credited to Wallet`,
              content: `An overpayment on invoice ${invoice.invoiceNumber} has been credited to the customer's wallet.\n\nOriginal Invoice: ${invoice.invoiceNumber}\nInvoice Total: ${invoice.currency} ${paymentResult.invoiceTotal}\nAmount Paid: ${invoice.currency} ${input.paidAmount}\nExcess Credited: ${invoice.currency} ${paymentResult.difference}`,
            }).catch((err) => console.warn("[Notification] Failed to notify about wallet credit:", err));
          }
        }
      }

      // ── AOR Payment Sync: When a monthly_aor client invoice is paid,
      //    automatically mark associated contractor invoices as 'paid' ──
      if (input.status === "paid") {
        const paidInvoice = await getInvoiceById(input.id);
        if (paidInvoice && paidInvoice.invoiceType === "monthly_aor") {
          try {
            const syncedCount = await markContractorInvoicesPaidByClientInvoice(input.id);
            if (syncedCount > 0) {
              console.log(`[AOR Sync] Marked ${syncedCount} contractor invoices as paid (client invoice #${input.id})`);
              await logAuditAction({
                userId: ctx.user.id,
                userName: ctx.user.name || null,
                action: "aor_payment_sync",
                entityType: "invoice",
                entityId: input.id,
                changes: JSON.stringify({
                  type: "contractor_invoices_paid",
                  clientInvoiceId: input.id,
                  contractorInvoicesSynced: syncedCount,
                }),
              });
            }
          } catch (err) {
            console.error(`[AOR Sync] Failed to sync contractor invoice payment for client invoice #${input.id}:`, err);
            // Don't throw - the client invoice payment succeeded, sync failure is logged but not blocking
          }
        }
      }

      return { success: true, paymentResult, followUpInvoiceId, creditNoteId };
    }),

  // ── Line Item CRUD ──────────────────────────────────────────────────

  addItem: financeManagerProcedure
    .input(
      z.object({
        invoiceId: z.number(),
        employeeId: z.number().optional(),
        description: z.string(),
        quantity: z.string().default("1"),
        unitPrice: z.string(),
        amount: z.string(),
        itemType: invoiceItemTypeEnum,
        vatRate: z.string().default("0"),
        countryCode: z.string().optional(),
        localCurrency: z.string().optional(),
        localAmount: z.string().optional(),
        exchangeRate: z.string().optional(),
        exchangeRateWithMarkup: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify invoice is in draft status
      const invoice = await getInvoiceById(input.invoiceId);
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      if (invoice.status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Can only add items to draft invoices",
        });
      }

      // Currency validation: max 2 currencies per invoice (invoice currency + at most 1 foreign currency)
      if (input.localCurrency && input.localCurrency !== invoice.currency) {
        const existingItems = await listInvoiceItemsByInvoice(input.invoiceId);
        const existingForeignCurrencies = new Set(
          existingItems
            .map((item) => item.localCurrency)
            .filter((c) => c && c !== invoice.currency)
        );
        const foreignArr = Array.from(existingForeignCurrencies);
        if (foreignArr.length > 0 && !existingForeignCurrencies.has(input.localCurrency)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Invoice already has foreign currency ${foreignArr[0]}. Only invoice currency (${invoice.currency}) or ${foreignArr[0]} allowed.`,
          });
        }
      }

      // Auto-fetch exchange rate if line item has foreign currency but no rate provided
      if (input.localCurrency && input.localCurrency !== 'USD' && input.localCurrency !== invoice.currency) {
        if (!input.exchangeRate || input.exchangeRate === '1' || input.exchangeRate === '0') {
          const rateData = await getExchangeRate(input.localCurrency, invoice.currency || 'USD');
          if (rateData) {
            input.exchangeRate = rateData.rate.toFixed(6);
            input.exchangeRateWithMarkup = rateData.rateWithMarkup.toFixed(6);
          }
        }
      }

      const result = await createInvoiceItem(input);

      // Recalculate invoice totals (also syncs exchange rate to invoice level)
      await recalculateInvoiceTotals(input.invoiceId);

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "create",
        entityType: "invoice_item",
        changes: JSON.stringify(input),
      });

      return result;
    }),

  updateItem: financeManagerProcedure
    .input(
      z.object({
        id: z.number(),
        invoiceId: z.number(),
        data: z.object({
          description: z.string().optional(),
          quantity: z.string().optional(),
          unitPrice: z.string().optional(),
          amount: z.string().optional(),
          itemType: invoiceItemTypeEnum.optional(),
          vatRate: z.string().optional(),
          employeeId: z.number().nullable().optional(),
          countryCode: z.string().optional(),
          localCurrency: z.string().optional(),
          localAmount: z.string().optional(),
          exchangeRate: z.string().optional(),
          exchangeRateWithMarkup: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify invoice is in draft status
      const invoice = await getInvoiceById(input.invoiceId);
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      if (invoice.status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Can only edit items on draft invoices",
        });
      }

      // Auto-fetch exchange rate if line item has foreign currency but no rate provided
      if (input.data.localCurrency && input.data.localCurrency !== 'USD' && input.data.localCurrency !== invoice.currency) {
        if (!input.data.exchangeRate || input.data.exchangeRate === '1' || input.data.exchangeRate === '0') {
          const rateData = await getExchangeRate(input.data.localCurrency, invoice.currency || 'USD');
          if (rateData) {
            input.data.exchangeRate = rateData.rate.toFixed(6);
            input.data.exchangeRateWithMarkup = rateData.rateWithMarkup.toFixed(6);
          }
        }
      }

      await updateInvoiceItem(input.id, input.data);

      // Recalculate invoice totals (also syncs exchange rate to invoice level)
      await recalculateInvoiceTotals(input.invoiceId);

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update",
        entityType: "invoice_item",
        entityId: input.id,
        changes: JSON.stringify(input.data),
      });

      return { success: true };
    }),

  deleteItem: financeManagerProcedure
    .input(
      z.object({
        id: z.number(),
        invoiceId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify invoice is in draft status
      const invoice = await getInvoiceById(input.invoiceId);
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      if (invoice.status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Can only delete items from draft invoices",
        });
      }

      await deleteInvoiceItem(input.id);

      // Recalculate invoice totals
      await recalculateInvoiceTotals(input.invoiceId);

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "delete",
        entityType: "invoice_item",
        entityId: input.id,
      });

      return { success: true };
    }),

  pay: financeManagerProcedure
    .input(z.object({
      id: z.number(),
      walletAmount: z.string().optional(),
      externalAmount: z.string().optional(),
      externalReference: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const invoice = await getInvoiceById(input.id);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      if (invoice.status === 'paid' || invoice.status === 'cancelled' || invoice.status === 'void') {
         throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Invoice is already ${invoice.status}` });
      }

      const walletAmt = parseFloat(input.walletAmount || "0");
      const externalAmt = parseFloat(input.externalAmount || "0");
      const totalPay = walletAmt + externalAmt;

      if (totalPay <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment amount must be greater than 0" });

      // 1. Handle Wallet Deduction
      if (walletAmt > 0) {
         // Deduct from wallet
         const wallet = await walletService.getWallet(invoice.customerId, invoice.currency);
         if (parseFloat(wallet.balance) < walletAmt) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Insufficient wallet balance" });
         }
         
         await walletService.transact({
            walletId: wallet.id,
            type: "invoice_deduction",
            amount: walletAmt.toFixed(2),
            direction: "debit",
            referenceId: invoice.id,
            referenceType: "invoice",
            description: `Payment for Invoice #${invoice.invoiceNumber}`,
            createdBy: ctx.user.id
         });
      }

      // 2. Update Invoice Status & Amounts
      const currentPaid = parseFloat(invoice.paidAmount || "0");
      const currentWalletApplied = parseFloat(invoice.walletAppliedAmount || "0");
      
      const newPaid = currentPaid + externalAmt;
      const newWalletApplied = currentWalletApplied + walletAmt;
      
      const total = parseFloat(invoice.total);
      const totalPaidSoFar = newPaid + newWalletApplied;
      const remainingDue = total - totalPaidSoFar;
      
      // Determine new status
      let newStatus = invoice.status;
      if (remainingDue <= 0.01) { // Floating point tolerance
         newStatus = 'paid';
      } else {
         newStatus = 'partially_paid';
      }

      const updateData: any = {
         paidAmount: newPaid.toFixed(2),
         walletAppliedAmount: newWalletApplied.toFixed(2),
         amountDue: Math.max(0, remainingDue).toFixed(2),
         status: newStatus,
         paidDate: newStatus === 'paid' ? new Date() : undefined,
      };

      await updateInvoice(invoice.id, updateData);

      // 3. Handle Deposit Invoice -> Frozen Wallet
      // If it's a deposit invoice, funds should move to Frozen Wallet.
      // We credit the Frozen Wallet with the amount just paid (totalPay).
      if (invoice.invoiceType === 'deposit') {
         await walletService.depositToFrozen(
            invoice.customerId, 
            invoice.currency, 
            totalPay.toFixed(2), 
            invoice.id, 
            ctx.user.id
         );
      }

      await logAuditAction({
         userId: ctx.user.id, userName: ctx.user.name || null,
         action: "pay",
         entityType: "invoice",
         entityId: invoice.id,
         changes: JSON.stringify({ 
            walletAmount: walletAmt, 
            externalAmount: externalAmt, 
            newStatus, 
            remainingDue: updateData.amountDue 
         }),
      });

      return { success: true, newStatus, remainingDue: updateData.amountDue };
    }),

  /**
   * Delete invoice — any draft or cancelled invoice can be deleted
   * Auto-generated invoices can be recreated via Regenerate if needed
   */
  delete: financeManagerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const invoice = await getInvoiceById(input.id);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      const deletableStatuses = ["draft", "cancelled"];
      if (!deletableStatuses.includes(invoice.status || "")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Only draft or cancelled invoices can be deleted. Current status: ${invoice.status}`,
        });
      }

      // Safe Delete Check: Ensure no downstream dependencies
      
      // 1. Check if this invoice has wallet funds applied
      if (parseFloat(invoice.walletAppliedAmount || '0') > 0) {
         throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cannot delete invoice with wallet funds applied. Void/Cancel instead." });
      }

      // 2. Check if linked to another invoice (e.g. it is a follow-up or related)
      // Only isolated invoices can be deleted
      if (invoice.relatedInvoiceId) {
         throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cannot delete linked invoice (has related invoice). Void/Cancel instead." });
      }

      // 3. Check if other invoices link TO this one (credit notes, follow-ups, etc.)
      const db = getDb();
      if (db) {
        const children = await db.select().from(invoicesTable).where(eq(invoicesTable.relatedInvoiceId, input.id));
        if (children.length > 0) {
           throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cannot delete invoice referenced by other invoices. Void/Cancel downstream invoices first." });
        }
      }

      // Delete invoice items first, then the invoice
      await deleteInvoice(input.id);

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "delete",
        entityType: "invoice",
        entityId: input.id,
        changes: JSON.stringify({
          invoiceNumber: invoice.invoiceNumber,
          invoiceType: invoice.invoiceType,
          status: invoice.status,
          total: invoice.total,
        }),
      });
      return { success: true };
    }),

  /**
   * Monthly overview: aggregated invoice data per month
   * Returns months with invoice counts, totals, and status breakdown
   */
  monthlyOverview: userProcedure
    .input(
      z.object({
        year: z.number().optional(),
        limit: z.number().default(12),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Get all invoices with paidAmount for collection tracking
      const allInvoices = await db
        .select({
          id: invoicesTable.id,
          invoiceMonth: invoicesTable.invoiceMonth,
          invoiceType: invoicesTable.invoiceType,
          status: invoicesTable.status,
          total: invoicesTable.total,
          currency: invoicesTable.currency,
          customerId: invoicesTable.customerId,
          billingEntityId: invoicesTable.billingEntityId,
          createdAt: invoicesTable.createdAt,
          paidAmount: invoicesTable.paidAmount,
        })
        .from(invoicesTable)
        .orderBy(sql`${invoicesTable.invoiceMonth} DESC, ${invoicesTable.createdAt} DESC`);

      // Group by month
      interface CurrencyBreakdown {
        currency: string;
        totalAmount: number; // Revenue (Monthly, Visa, Manual)
        paidAmount: number;
        depositAmount: number; // Deposits (Liability)
        depositPaidAmount: number;
        depositCount: number;
        invoiceCount: number;
        collectionRate: number;
      }

      const monthMap = new Map<string, {
        month: string;
        invoiceCount: number;
        statusBreakdown: Record<string, number>;
        typeBreakdown: Record<string, number>;
        customerCount: number;
        customers: Set<number>;
        currencyBreakdowns: Map<string, { totalAmount: number; paidAmount: number; depositAmount: number; depositPaidAmount: number; depositCount: number; invoiceCount: number }>;
      }>();

      for (const inv of allInvoices) {
        let monthKey = "unknown";
        if (inv.invoiceMonth) {
          // invoiceMonth may be "2026-03" (YYYY-MM) or "2026-03-01" (full date)
          // If it already looks like YYYY-MM, use it directly; otherwise parse as Date
          if (/^\d{4}-\d{2}$/.test(inv.invoiceMonth)) {
            monthKey = inv.invoiceMonth;
          } else {
            const d = new Date(inv.invoiceMonth);
            monthKey = isNaN(d.getTime()) ? "unknown" : d.toISOString().slice(0, 7);
          }
        } else if (inv.createdAt) {
          const d = new Date(inv.createdAt);
          monthKey = isNaN(d.getTime()) ? "unknown" : d.toISOString().slice(0, 7);
        }

        if (!monthMap.has(monthKey)) {
          monthMap.set(monthKey, {
            month: monthKey,
            invoiceCount: 0,
            statusBreakdown: {},
            typeBreakdown: {},
            customerCount: 0,
            customers: new Set(),
            currencyBreakdowns: new Map(),
          });
        }

        const entry = monthMap.get(monthKey)!;
        entry.invoiceCount++;
        entry.statusBreakdown[inv.status || "draft"] = (entry.statusBreakdown[inv.status || "draft"] || 0) + 1;
        entry.typeBreakdown[inv.invoiceType || "monthly"] = (entry.typeBreakdown[inv.invoiceType || "monthly"] || 0) + 1;
        if (inv.customerId) entry.customers.add(inv.customerId);

        // Track per-currency amounts
        const ccy = inv.currency || "USD";
        if (!entry.currencyBreakdowns.has(ccy)) {
          entry.currencyBreakdowns.set(ccy, { totalAmount: 0, paidAmount: 0, depositAmount: 0, depositPaidAmount: 0, depositCount: 0, invoiceCount: 0 });
        }
        const ccyEntry = entry.currencyBreakdowns.get(ccy)!;
        const invTotal = parseFloat(inv.total?.toString() ?? "0");
        
        // Only count non-cancelled invoices in totals
        if (inv.status !== "cancelled") {
          
          if (inv.invoiceType === "deposit") {
            ccyEntry.depositAmount += invTotal;
            ccyEntry.depositCount++;
            if (inv.status === "paid" && inv.paidAmount) {
              ccyEntry.depositPaidAmount += parseFloat(inv.paidAmount.toString());
            }
          } else if (inv.invoiceType === "credit_note" || inv.invoiceType === "deposit_refund") {
            // Ignore credit notes and refunds in revenue overview
          } else {
            // Revenue invoices
            ccyEntry.invoiceCount++; // Only count revenue invoices
            ccyEntry.totalAmount += invTotal;
            if (inv.status === "paid" && inv.paidAmount) {
              ccyEntry.paidAmount += parseFloat(inv.paidAmount.toString());
            }
          }
        }
      }

      // Convert to array
      const result = Array.from(monthMap.values())
        .map(({ customers, currencyBreakdowns, ...rest }) => {
          const currencies: CurrencyBreakdown[] = Array.from(currencyBreakdowns.entries())
            .map(([currency, data]) => ({
              currency,
              totalAmount: data.totalAmount,
              paidAmount: data.paidAmount,
              depositAmount: data.depositAmount,
              depositPaidAmount: data.depositPaidAmount,
              depositCount: data.depositCount,
              invoiceCount: data.invoiceCount,
              collectionRate: data.totalAmount > 0 ? Math.round((data.paidAmount / data.totalAmount) * 10000) / 100 : 0,
            }))
            .sort((a, b) => b.totalAmount - a.totalAmount);

          return {
            ...rest,
            customerCount: customers.size,
            currencies,
          };
        })
        .sort((a, b) => b.month.localeCompare(a.month))
        .slice(0, input.limit);

      return result;
    }),

  // ── Credit Note ──────────────────────────────────────────────────────

  /**
   * Create a credit note for an existing invoice
   * Can be full credit (negate entire invoice) or partial (specific line items)
   */
  createCreditNote: financeManagerProcedure
    .input(
      z.object({
        originalInvoiceId: z.number(),
        reason: z.string().min(1, "Reason is required"),
        isFullCredit: z.boolean().default(false),
        lineItems: z
          .array(
            z.object({
              description: z.string(),
              amount: z.string(),
              employeeId: z.number().optional(),
              countryCode: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only allow credit notes for paid invoices
      const originalInvoice = await getInvoiceById(input.originalInvoiceId);
      if (!originalInvoice) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Original invoice not found' });
      }
      if (originalInvoice.status !== 'paid') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Credit notes can only be created for paid invoices. Current status: ${originalInvoice.status}`,
        });
      }

      const result = await generateCreditNote({
        originalInvoiceId: input.originalInvoiceId,
        reason: input.reason,
        isFullCredit: input.isFullCredit,
        lineItems: input.lineItems as CreditNoteLineItem[],
      });

      if (result.invoiceId) {
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "generate",
          entityType: "invoice",
          entityId: result.invoiceId,
          changes: JSON.stringify({
            type: "credit_note",
            originalInvoiceId: input.originalInvoiceId,
            reason: input.reason,
            isFullCredit: input.isFullCredit,
          }),
        });

        // Notify finance manager about manually created credit note
        const originalInvoice = await getInvoiceById(input.originalInvoiceId);
        notifyOwner({
          title: `Credit Note Created${input.isFullCredit ? " (Full)" : " (Partial)"}`,
          content: `A ${input.isFullCredit ? "full" : "partial"} credit note has been created for invoice ${originalInvoice?.invoiceNumber || `#${input.originalInvoiceId}`}.\n\nReason: ${input.reason}\nCredit Note ID: #${result.invoiceId}\nType: ${input.isFullCredit ? "Full Credit" : "Partial Credit"}\n\nPlease review and process accordingly.`,
        }).catch((err) => console.warn("[Notification] Failed to notify about credit note:", err));
      }

      return result;
    }),

  /**
   * Approve a credit note (e.g. Deposit Release)
   * Disposition:
   * - to_wallet: Credit amount to Main Wallet
   * - to_bank: Mark as refunded externally
   */
  approveCreditNote: financeManagerProcedure
    .input(z.object({
      creditNoteId: z.number(),
      disposition: z.enum(["to_wallet", "to_bank"]),
    }))
    .mutation(async ({ input, ctx }) => {
      await approveCreditNote(input.creditNoteId, ctx.user.id, input.disposition);
      
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "approve",
        entityType: "invoice",
        entityId: input.creditNoteId,
        changes: JSON.stringify({ disposition: input.disposition }),
      });

      return { success: true };
    }),

  // ── Deposit Refund (manual trigger) ─────────────────────────────────

  /**
   * Manually generate a deposit refund for an employee
   * Usually auto-triggered on termination, but can be manually created
   */
  createDepositRefund: financeManagerProcedure
    .input(
      z.object({
        employeeId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await generateDepositRefund(input.employeeId);

      if (result.invoiceId) {
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "generate",
          entityType: "invoice",
          entityId: result.invoiceId,
          changes: JSON.stringify({
            type: "deposit_refund",
            employeeId: input.employeeId,
            trigger: "manual",
          }),
        });
      }

      return result;
    }),

  // ── Batch Operations ────────────────────────────────────────────────

  /**
   * Batch update invoice status
   * Supports batch send, batch mark as paid, batch cancel
   */
  batchUpdateStatus: financeManagerProcedure
    .input(
      z.object({
        invoiceIds: z.array(z.number()).min(1),
        status: z.enum(["pending_review", "sent", "paid", "cancelled"]),
        paidAmount: z.string().optional(), // For batch mark as paid
      })
    )
    .mutation(async ({ input, ctx }) => {
      const results: { id: number; success: boolean; message: string }[] = [];

      // Define valid status transitions
      // Cancel allowed for all pre-paid statuses; overdue is system-only (auto-detected)
      const validTransitions: Record<string, string[]> = {
        draft: ["pending_review", "cancelled"],
        pending_review: ["sent", "draft", "cancelled"],
        sent: ["paid", "cancelled"],
        overdue: ["paid", "cancelled"],
      };

      for (const invoiceId of input.invoiceIds) {
        try {
          const invoice = await getInvoiceById(invoiceId);
          if (!invoice) {
            results.push({ id: invoiceId, success: false, message: "Invoice not found" });
            continue;
          }

          // Guard: credit_note and deposit_refund cannot be marked as paid
          if (input.status === "paid" && (invoice.invoiceType === "credit_note" || invoice.invoiceType === "deposit_refund")) {
            results.push({
              id: invoiceId,
              success: false,
              message: `Cannot mark ${invoice.invoiceType?.replace("_", " ")} as paid`,
            });
            continue;
          }

          // Validate transition
          const allowed = validTransitions[invoice.status || "draft"] || [];
          if (!allowed.includes(input.status)) {
            results.push({
              id: invoiceId,
              success: false,
              message: `Cannot transition from '${invoice.status}' to '${input.status}'`,
            });
            continue;
          }

          const updateData: any = { status: input.status };
          if (input.status === "sent") {
            updateData.sentDate = new Date();
          } else if (input.status === "paid") {
            if (!input.paidAmount) {
              results.push({ id: invoiceId, success: false, message: "Payment amount is required when marking as paid" });
              continue;
            }
            updateData.paidDate = new Date();
            updateData.paidAmount = input.paidAmount;
          }

          await updateInvoice(invoiceId, updateData);
          results.push({ id: invoiceId, success: true, message: `Status updated to ${input.status}` });
        } catch (error) {
          results.push({
            id: invoiceId,
            success: false,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      // Log batch action
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "batch_update",
        entityType: "invoice",
        changes: JSON.stringify({
          invoiceIds: input.invoiceIds,
          targetStatus: input.status,
          results: results.map((r) => ({ id: r.id, success: r.success })),
        }),
      });

      const successCount = results.filter((r) => r.success).length;
      return {
        results,
        summary: {
          total: input.invoiceIds.length,
          success: successCount,
          failed: input.invoiceIds.length - successCount,
        },
      };
    }),

  // [REMOVED] Credit Note Apply Mechanism — replaced by Wallet-based flow.
  // Credit notes are now approved via Release Tasks → credited to customer Wallet.
  // Customers use Wallet balance to pay invoices. No direct CN→Invoice apply.
});

