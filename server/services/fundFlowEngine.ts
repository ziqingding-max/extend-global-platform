/**
 * Four-Party Fund Flow Engine
 *
 * Implements the B2B2B payment tracking flow:
 *
 *   Client → CP → EG → Vendor
 *
 * Flow for CP-managed clients:
 *
 *   1. EG generates dual-layer invoices:
 *      - Layer 1: EG → CP (at EG's pricing)
 *      - Layer 2: CP → Client (at CP's markup pricing)
 *
 *   2. Layer 2 invoice (CP → Client):
 *      - CP manually marks as Paid when client payment is received
 *      - Money goes to CP's own bank account (outside the system)
 *      - System only tracks the status change
 *
 *   3. Layer 1 invoice (EG → CP):
 *      - CP manually initiates payment from their wallet
 *      - System deducts from CP wallet balance ONLY when CP clicks "Pay"
 *      - NO automatic deduction — all wallet operations require CP manual action
 *
 *   4. CP Wallet:
 *      - CP tops up wallet via wire transfer (Admin confirms receipt)
 *      - CP manually pays Layer 1 invoices from wallet balance
 *      - System never auto-deducts; CP always initiates
 *
 * Key operations:
 *   - payLayer1FromWallet: CP manually pays a Layer 1 invoice from wallet
 *   - getCpFundFlowSummary: Dashboard view of CP fund flow
 *   - getLayer1OutstandingForCp: List unpaid Layer 1 invoices for a CP
 */
import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  invoices,
  type Invoice,
} from "../../drizzle/schema";
import { cpWalletService } from "./cpWalletService";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface FundFlowResult {
  success: boolean;
  layer1InvoiceId?: number;
  cpDeductionAmount?: number;
  walletBalanceAfter?: number;
  error?: string;
}

export interface CpFundFlowSummary {
  channelPartnerId: number;
  currency: string;
  /** Total received from clients (Layer 2 payments marked as paid) */
  totalClientPayments: number;
  /** Total paid to EG (Layer 1 wallet deductions) */
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

export interface OutstandingLayer1Invoice {
  id: number;
  invoiceNumber: string;
  invoiceMonth: string;
  customerName: string;
  total: string;
  currency: string;
  status: string;
  dueDate: string | null;
  createdAt: Date | null;
}

// ────────────────────────────────────────────────────────────────
// Core Fund Flow Operations
// ────────────────────────────────────────────────────────────────

/**
 * CP manually pays a Layer 1 (EG → CP) invoice from their wallet.
 *
 * This is the ONLY way Layer 1 invoices get paid in the system.
 * CP must have sufficient wallet balance.
 * CP must explicitly initiate this action — no auto-deduction.
 */
export async function payLayer1FromWallet(
  layer1InvoiceId: number,
  userId: number,
): Promise<FundFlowResult> {
  const db = getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Get the Layer 1 invoice
  const [layer1Invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, layer1InvoiceId));

  if (!layer1Invoice) {
    return { success: false, error: "Invoice not found" };
  }

  if (layer1Invoice.invoiceLayer !== "eg_to_cp") {
    return { success: false, error: "This is not a Layer 1 (EG → CP) invoice" };
  }

  if (!layer1Invoice.channelPartnerId) {
    return { success: false, error: "Invoice has no channel partner" };
  }

  // Check if already paid
  if (layer1Invoice.status === "paid") {
    return { success: false, error: "Invoice is already paid" };
  }

  const amountToPay = layer1Invoice.amountDue || layer1Invoice.total;

  // Deduct from CP wallet (will throw if insufficient balance)
  try {
    await cpWalletService.deductForInvoice(
      layer1Invoice.channelPartnerId,
      layer1Invoice.currency,
      amountToPay,
      layer1Invoice.id,
      userId,
    );
  } catch (err: any) {
    return {
      success: false,
      error: `Wallet balance insufficient: ${err.message}`,
    };
  }

  // Mark Layer 1 invoice as paid
  await db
    .update(invoices)
    .set({
      status: "paid",
      paidDate: new Date(),
      paidAmount: amountToPay,
      amountDue: "0",
    })
    .where(eq(invoices.id, layer1InvoiceId));

  // Get updated wallet balance
  const wallet = await cpWalletService.getWallet(
    layer1Invoice.channelPartnerId,
    layer1Invoice.currency,
  );

  return {
    success: true,
    layer1InvoiceId,
    cpDeductionAmount: parseFloat(amountToPay),
    walletBalanceAfter: parseFloat(wallet.balance),
  };
}

/**
 * Get list of unpaid Layer 1 invoices for a CP.
 * Used in CP Portal for the "Pay from Wallet" feature.
 */
export async function getLayer1OutstandingForCp(
  channelPartnerId: number,
  currency?: string,
): Promise<OutstandingLayer1Invoice[]> {
  const db = getDb();
  if (!db) return [];

  const conditions = [
    eq(invoices.channelPartnerId, channelPartnerId),
    eq(invoices.invoiceLayer, "eg_to_cp"),
    sql`${invoices.status} IN ('sent', 'overdue', 'partially_paid')`,
  ];

  if (currency) {
    conditions.push(eq(invoices.currency, currency));
  }

  const results = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      invoiceMonth: invoices.invoiceMonth,
      total: invoices.total,
      currency: invoices.currency,
      status: invoices.status,
      dueDate: invoices.dueDate,
      createdAt: invoices.createdAt,
      customerId: invoices.customerId,
    })
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt));

  return results.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber || `#${inv.id}`,
    invoiceMonth: inv.invoiceMonth || "",
    customerName: "", // Will be enriched in the router
    total: inv.total,
    currency: inv.currency || "USD",
    status: inv.status,
    dueDate: inv.dueDate ? String(inv.dueDate) : null,
    createdAt: inv.createdAt,
  }));
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
