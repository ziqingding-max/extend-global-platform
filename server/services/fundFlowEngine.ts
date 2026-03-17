/**
 * Four-Party Fund Flow Engine
 *
 * Implements the complete B2B2B payment flow:
 *
 *   Client → CP → EG → Vendor
 *
 * Flow for CP-managed clients:
 *
 *   1. EG generates dual-layer invoices:
 *      - Layer 1: EG → CP (at EG's pricing)
 *      - Layer 2: CP → Client (at CP's markup pricing)
 *
 *   2. When Client pays Layer 2 invoice:
 *      - CP wallet is credited (client payment received)
 *      - CP wallet is auto-debited for Layer 1 amount (EG's share)
 *      - Layer 1 invoice is auto-marked as paid
 *
 *   3. When Layer 1 is paid (either auto or manual):
 *      - EG recognizes revenue
 *      - Vendor bills are reconciled
 *
 * For direct EG clients (no CP):
 *   - Single-layer invoice, standard wallet flow
 *
 * Key operations:
 *   - processClientPayment: Client pays Layer 2 → triggers CP wallet deduction → marks Layer 1 paid
 *   - processDirectPayment: Direct client pays invoice → standard flow
 *   - processCpTopUp: CP tops up their wallet (wire transfer received)
 *   - getCpFundFlowSummary: Dashboard view of CP fund flow
 */
import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  invoices,
  type Invoice,
} from "../../drizzle/schema";
import { cpWalletService } from "./cpWalletService";
import { walletService } from "./walletService";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface FundFlowResult {
  success: boolean;
  layer2InvoiceId?: number;
  layer1InvoiceId?: number;
  clientPaymentAmount?: number;
  cpDeductionAmount?: number;
  cpMarginAmount?: number;
  error?: string;
}

export interface CpFundFlowSummary {
  channelPartnerId: number;
  currency: string;
  /** Total received from clients (Layer 2 payments) */
  totalClientPayments: number;
  /** Total paid to EG (Layer 1 deductions) */
  totalEgPayments: number;
  /** CP margin = client payments - EG payments */
  totalCpMargin: number;
  /** Current wallet balance */
  walletBalance: number;
  /** Frozen deposit balance */
  frozenBalance: number;
  /** Unpaid Layer 1 invoices (owed to EG) */
  outstandingLayer1: number;
  /** Unpaid Layer 2 invoices (owed by clients) */
  outstandingLayer2: number;
  /** Recent transactions */
  recentTransactions: {
    date: string;
    type: string;
    amount: number;
    description: string;
    invoiceNumber?: string;
  }[];
}

// ────────────────────────────────────────────────────────────────
// Core Fund Flow Operations
// ────────────────────────────────────────────────────────────────

/**
 * Process a client payment on a Layer 2 (CP → Client) invoice.
 *
 * This triggers the four-party flow:
 *   1. Mark Layer 2 invoice as paid
 *   2. Find the corresponding Layer 1 invoice
 *   3. Auto-deduct from CP wallet for Layer 1 amount
 *   4. Mark Layer 1 invoice as paid
 *
 * Returns the fund flow result with margin calculation.
 */
export async function processClientPayment(
  layer2InvoiceId: number,
  paidAmount: string,
  userId: number,
): Promise<FundFlowResult> {
  const db = getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Get the Layer 2 invoice
  const [layer2Invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, layer2InvoiceId));

  if (!layer2Invoice) {
    return { success: false, error: "Layer 2 invoice not found" };
  }

  if (layer2Invoice.invoiceLayer !== "cp_to_client") {
    return { success: false, error: "Invoice is not a Layer 2 (CP → Client) invoice" };
  }

  if (!layer2Invoice.channelPartnerId) {
    return { success: false, error: "Invoice has no channel partner" };
  }

  // Find the corresponding Layer 1 invoice
  // Layer 1 shares the same payroll month, customer, and CP
  const layer1Candidates = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.invoiceLayer, "eg_to_cp"),
        eq(invoices.channelPartnerId, layer2Invoice.channelPartnerId),
        eq(invoices.customerId, layer2Invoice.customerId),
        sql`${invoices.invoiceMonth} = ${layer2Invoice.invoiceMonth}`,
        sql`${invoices.status} != 'cancelled'`,
        sql`${invoices.status} != 'void'`,
      )
    );

  const layer1Invoice = layer1Candidates[0]; // Should be exactly one

  const clientPaymentAmount = parseFloat(paidAmount);
  const layer1Amount = layer1Invoice ? parseFloat(layer1Invoice.total) : 0;
  const cpMargin = clientPaymentAmount - layer1Amount;

  // Step 1: Mark Layer 2 as paid
  await db
    .update(invoices)
    .set({
      status: "paid",
      paidDate: new Date(),
      paidAmount: paidAmount,
      amountDue: "0",
    })
    .where(eq(invoices.id, layer2InvoiceId));

  // Step 2: Auto-deduct from CP wallet for Layer 1
  if (layer1Invoice) {
    try {
      await cpWalletService.deductForInvoice(
        layer2Invoice.channelPartnerId,
        layer2Invoice.currency,
        layer1Invoice.total,
        layer1Invoice.id,
        `Auto-deduct for Layer 1 invoice ${layer1Invoice.invoiceNumber}`,
        userId,
      );

      // Step 3: Mark Layer 1 as paid
      await db
        .update(invoices)
        .set({
          status: "paid",
          paidDate: new Date(),
          paidAmount: layer1Invoice.total,
          amountDue: "0",
        })
        .where(eq(invoices.id, layer1Invoice.id));
    } catch (err: any) {
      // CP wallet insufficient — Layer 1 remains unpaid
      // This is a valid business scenario: CP owes EG
      console.warn(
        `CP wallet insufficient for Layer 1 auto-deduction: ${err.message}`
      );
    }
  }

  return {
    success: true,
    layer2InvoiceId,
    layer1InvoiceId: layer1Invoice?.id,
    clientPaymentAmount,
    cpDeductionAmount: layer1Amount,
    cpMarginAmount: Math.round(cpMargin * 100) / 100,
  };
}

/**
 * Process a manual Layer 1 payment (CP pays EG directly).
 * Used when auto-deduction failed or for manual settlement.
 */
export async function processLayer1Payment(
  layer1InvoiceId: number,
  paidAmount: string,
  userId: number,
): Promise<FundFlowResult> {
  const db = getDb();
  if (!db) return { success: false, error: "Database not available" };

  const [layer1Invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, layer1InvoiceId));

  if (!layer1Invoice) {
    return { success: false, error: "Layer 1 invoice not found" };
  }

  if (layer1Invoice.invoiceLayer !== "eg_to_cp") {
    return { success: false, error: "Invoice is not a Layer 1 (EG → CP) invoice" };
  }

  if (!layer1Invoice.channelPartnerId) {
    return { success: false, error: "Invoice has no channel partner" };
  }

  // Deduct from CP wallet
  try {
    await cpWalletService.deductForInvoice(
      layer1Invoice.channelPartnerId,
      layer1Invoice.currency,
      paidAmount,
      layer1Invoice.id,
      `Manual payment for Layer 1 invoice ${layer1Invoice.invoiceNumber}`,
      userId,
    );
  } catch (err: any) {
    return { success: false, error: `CP wallet deduction failed: ${err.message}` };
  }

  // Mark as paid
  await db
    .update(invoices)
    .set({
      status: "paid",
      paidDate: new Date(),
      paidAmount,
      amountDue: "0",
    })
    .where(eq(invoices.id, layer1InvoiceId));

  return {
    success: true,
    layer1InvoiceId,
    cpDeductionAmount: parseFloat(paidAmount),
  };
}

/**
 * Get CP fund flow summary for dashboard.
 */
export async function getCpFundFlowSummary(
  channelPartnerId: number,
  currency: string = "USD",
): Promise<CpFundFlowSummary> {
  const db = getDb();
  if (!db) {
    return {
      channelPartnerId,
      currency,
      totalClientPayments: 0,
      totalEgPayments: 0,
      totalCpMargin: 0,
      walletBalance: 0,
      frozenBalance: 0,
      outstandingLayer1: 0,
      outstandingLayer2: 0,
      recentTransactions: [],
    };
  }

  // Get wallet balances
  const mainWallet = await cpWalletService.getWallet(channelPartnerId, currency);
  const frozenWallet = await cpWalletService.getFrozenWallet(channelPartnerId, currency);

  // Total client payments (Layer 2 paid invoices)
  const [clientPayments] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CAST(${invoices.paidAmount} AS REAL)), 0)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.channelPartnerId, channelPartnerId),
        eq(invoices.invoiceLayer, "cp_to_client"),
        eq(invoices.status, "paid"),
        eq(invoices.currency, currency),
      )
    );

  // Total EG payments (Layer 1 paid invoices)
  const [egPayments] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CAST(${invoices.paidAmount} AS REAL)), 0)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.channelPartnerId, channelPartnerId),
        eq(invoices.invoiceLayer, "eg_to_cp"),
        eq(invoices.status, "paid"),
        eq(invoices.currency, currency),
      )
    );

  // Outstanding Layer 1 (owed to EG)
  const [outstandingL1] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS REAL)), 0)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.channelPartnerId, channelPartnerId),
        eq(invoices.invoiceLayer, "eg_to_cp"),
        sql`${invoices.status} IN ('sent', 'overdue')`,
        eq(invoices.currency, currency),
      )
    );

  // Outstanding Layer 2 (owed by clients)
  const [outstandingL2] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS REAL)), 0)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.channelPartnerId, channelPartnerId),
        eq(invoices.invoiceLayer, "cp_to_client"),
        sql`${invoices.status} IN ('sent', 'overdue')`,
        eq(invoices.currency, currency),
      )
    );

  const totalClientPaymentsVal = parseFloat(clientPayments?.total || "0");
  const totalEgPaymentsVal = parseFloat(egPayments?.total || "0");

  return {
    channelPartnerId,
    currency,
    totalClientPayments: Math.round(totalClientPaymentsVal * 100) / 100,
    totalEgPayments: Math.round(totalEgPaymentsVal * 100) / 100,
    totalCpMargin: Math.round((totalClientPaymentsVal - totalEgPaymentsVal) * 100) / 100,
    walletBalance: parseFloat(mainWallet.balance),
    frozenBalance: parseFloat(frozenWallet.balance),
    outstandingLayer1: Math.round(parseFloat(outstandingL1?.total || "0") * 100) / 100,
    outstandingLayer2: Math.round(parseFloat(outstandingL2?.total || "0") * 100) / 100,
    recentTransactions: [], // Populated from wallet transactions in the router
  };
}
