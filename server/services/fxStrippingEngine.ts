/**
 * FX Stripping Engine
 *
 * Separates pass-through employment costs from FX markup revenue in invoices.
 *
 * Business context:
 *   EG invoices clients in USD (or client settlement currency).
 *   Employment costs are incurred in local currency (GBP, EUR, JPY, etc.).
 *   The invoice includes:
 *     1. Pass-through cost: actual employment cost converted at mid-market rate
 *     2. FX markup: difference between mid-market rate and the rate charged to client
 *     3. Service fee: EG's management/processing fee
 *
 * This engine:
 *   - Calculates the FX markup revenue per invoice
 *   - Calculates the pass-through cost (at mid-market rate)
 *   - Strips out FX markup as a separate revenue line for P&L
 *   - Supports multi-currency invoices (employees in different countries)
 *
 * Formula:
 *   passThroughCostUsd = localCurrencyTotal / midMarketRate
 *   fxMarkupRevenue = localCurrencyTotal * (1/exchangeRate - 1/exchangeRateWithMarkup)
 *                    = (settlementAmount - passThroughCostUsd)  [simplified]
 *   netServiceFeeRevenue = serviceFeeTotal
 *   totalRevenue = fxMarkupRevenue + netServiceFeeRevenue
 */
import { eq, and, sql, gte, lt } from "drizzle-orm";
import { getDb } from "../db";
import {
  invoices,
  invoiceItems,
  vendorBills,
  type Invoice,
} from "../../drizzle/schema";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface FxBreakdown {
  invoiceId: number;
  invoiceNumber: string;
  customerId: number;
  channelPartnerId: number | null;
  invoiceLayer: string;
  currency: string;
  localCurrency: string | null;
  /** Total invoice amount in settlement currency */
  invoiceTotal: number;
  /** Employment cost subtotal (pass-through) in settlement currency */
  employmentCostSettlement: number;
  /** Employment cost in local currency */
  employmentCostLocal: number;
  /** Mid-market exchange rate (raw, no markup) */
  midMarketRate: number;
  /** Rate charged to client (with markup) */
  clientRate: number;
  /** FX markup percentage */
  fxMarkupPercent: number;
  /** Pass-through cost at mid-market rate (in settlement currency) */
  passThroughCostUsd: number;
  /** FX markup revenue = employmentCostSettlement - passThroughCostUsd */
  fxMarkupRevenue: number;
  /** Service fee revenue */
  serviceFeeRevenue: number;
  /** Total EG net revenue = fxMarkupRevenue + serviceFeeRevenue */
  totalNetRevenue: number;
  /** Invoice month */
  invoiceMonth: string | null;
}

export interface FxSummary {
  /** Total pass-through costs (not EG revenue) */
  totalPassThrough: number;
  /** Total FX markup revenue */
  totalFxMarkupRevenue: number;
  /** Total service fee revenue */
  totalServiceFeeRevenue: number;
  /** Total net revenue (FX markup + service fee) */
  totalNetRevenue: number;
  /** FX markup as % of total invoice amount */
  fxMarkupPercentOfTotal: number;
  /** Breakdown by invoice */
  invoiceBreakdowns: FxBreakdown[];
  /** Breakdown by currency pair */
  currencyPairSummary: CurrencyPairSummary[];
  /** Breakdown by month */
  monthlyTrend: MonthlyFxSummary[];
}

export interface CurrencyPairSummary {
  localCurrency: string;
  settlementCurrency: string;
  totalLocalAmount: number;
  totalSettlementAmount: number;
  avgMidMarketRate: number;
  avgClientRate: number;
  avgMarkupPercent: number;
  totalFxMarkupRevenue: number;
  invoiceCount: number;
}

export interface MonthlyFxSummary {
  month: string;
  totalPassThrough: number;
  totalFxMarkupRevenue: number;
  totalServiceFeeRevenue: number;
  totalNetRevenue: number;
  invoiceCount: number;
}

// ────────────────────────────────────────────────────────────────
// Core FX Stripping
// ────────────────────────────────────────────────────────────────

/**
 * Calculate FX breakdown for a single invoice.
 */
export function calculateFxBreakdown(inv: Invoice): FxBreakdown {
  const invoiceTotal = parseFloat(inv.total);
  const serviceFeeRevenue = parseFloat(inv.serviceFeeTotal || "0");
  const employmentCostSettlement = invoiceTotal - serviceFeeRevenue - parseFloat(inv.tax || "0");
  const employmentCostLocal = parseFloat(inv.localCurrencyTotal || "0");

  const midMarketRate = parseFloat(inv.exchangeRate || "1");
  const clientRate = parseFloat(inv.exchangeRateWithMarkup || inv.exchangeRate || "1");
  const fxMarkupRate = parseFloat(inv.fxMarkupRate || "0");

  // Calculate pass-through cost at mid-market rate
  // If local currency data is available, use it; otherwise fall back to settlement amount
  let passThroughCostUsd: number;
  let fxMarkupRevenue: number;

  if (employmentCostLocal > 0 && midMarketRate > 0) {
    // passThroughCostUsd = localAmount / midMarketRate (USD per 1 local unit)
    // But our rates are stored as USD→Local, so: passThroughCostUsd = localAmount / midMarketRate
    passThroughCostUsd = employmentCostLocal / midMarketRate;
    fxMarkupRevenue = employmentCostSettlement - passThroughCostUsd;
  } else {
    // No local currency data — cannot strip FX, treat all employment cost as pass-through
    passThroughCostUsd = employmentCostSettlement;
    fxMarkupRevenue = 0;
  }

  // Ensure non-negative (rounding errors)
  if (fxMarkupRevenue < 0) fxMarkupRevenue = 0;

  const fxMarkupPercent = passThroughCostUsd > 0
    ? (fxMarkupRevenue / passThroughCostUsd) * 100
    : 0;

  const totalNetRevenue = fxMarkupRevenue + serviceFeeRevenue;

  return {
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    channelPartnerId: inv.channelPartnerId,
    invoiceLayer: inv.invoiceLayer,
    currency: inv.currency,
    localCurrency: inv.localCurrency,
    invoiceTotal,
    employmentCostSettlement,
    employmentCostLocal,
    midMarketRate,
    clientRate,
    fxMarkupPercent: Math.round(fxMarkupPercent * 100) / 100,
    passThroughCostUsd: Math.round(passThroughCostUsd * 100) / 100,
    fxMarkupRevenue: Math.round(fxMarkupRevenue * 100) / 100,
    serviceFeeRevenue: Math.round(serviceFeeRevenue * 100) / 100,
    totalNetRevenue: Math.round(totalNetRevenue * 100) / 100,
    invoiceMonth: inv.invoiceMonth,
  };
}

/**
 * Get FX stripping summary for a date range.
 */
export async function getFxStrippingSummary(
  startMonth: string, // YYYY-MM
  endMonth: string,   // YYYY-MM
  channelPartnerId?: number,
  customerId?: number,
): Promise<FxSummary> {
  const db = getDb();
  if (!db) {
    return {
      totalPassThrough: 0,
      totalFxMarkupRevenue: 0,
      totalServiceFeeRevenue: 0,
      totalNetRevenue: 0,
      fxMarkupPercentOfTotal: 0,
      invoiceBreakdowns: [],
      currencyPairSummary: [],
      monthlyTrend: [],
    };
  }

  const startDate = `${startMonth}-01`;
  const [ey, em] = endMonth.split("-").map(Number);
  const nextMonth = em === 12 ? `${ey + 1}-01-01` : `${ey}-${String(em + 1).padStart(2, "0")}-01`;

  // Build conditions
  const conditions = [
    sql`${invoices.invoiceMonth} >= ${startDate}`,
    sql`${invoices.invoiceMonth} < ${nextMonth}`,
    sql`${invoices.status} NOT IN ('cancelled', 'void', 'draft')`,
    sql`${invoices.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`,
  ];

  if (channelPartnerId) {
    conditions.push(eq(invoices.channelPartnerId, channelPartnerId));
  }
  if (customerId) {
    conditions.push(eq(invoices.customerId, customerId));
  }

  const allInvoices = await db
    .select()
    .from(invoices)
    .where(and(...conditions));

  // Calculate breakdown for each invoice
  const invoiceBreakdowns = allInvoices.map(calculateFxBreakdown);

  // Aggregate totals
  let totalPassThrough = 0;
  let totalFxMarkupRevenue = 0;
  let totalServiceFeeRevenue = 0;
  let totalInvoiceAmount = 0;

  for (const bd of invoiceBreakdowns) {
    totalPassThrough += bd.passThroughCostUsd;
    totalFxMarkupRevenue += bd.fxMarkupRevenue;
    totalServiceFeeRevenue += bd.serviceFeeRevenue;
    totalInvoiceAmount += bd.invoiceTotal;
  }

  const totalNetRevenue = totalFxMarkupRevenue + totalServiceFeeRevenue;
  const fxMarkupPercentOfTotal = totalInvoiceAmount > 0
    ? (totalFxMarkupRevenue / totalInvoiceAmount) * 100
    : 0;

  // Currency pair summary
  const currencyPairMap = new Map<string, CurrencyPairSummary>();
  for (const bd of invoiceBreakdowns) {
    const key = `${bd.localCurrency || "USD"}-${bd.currency}`;
    const existing = currencyPairMap.get(key) || {
      localCurrency: bd.localCurrency || "USD",
      settlementCurrency: bd.currency,
      totalLocalAmount: 0,
      totalSettlementAmount: 0,
      avgMidMarketRate: 0,
      avgClientRate: 0,
      avgMarkupPercent: 0,
      totalFxMarkupRevenue: 0,
      invoiceCount: 0,
    };
    existing.totalLocalAmount += bd.employmentCostLocal;
    existing.totalSettlementAmount += bd.employmentCostSettlement;
    existing.totalFxMarkupRevenue += bd.fxMarkupRevenue;
    existing.avgMidMarketRate += bd.midMarketRate;
    existing.avgClientRate += bd.clientRate;
    existing.avgMarkupPercent += bd.fxMarkupPercent;
    existing.invoiceCount += 1;
    currencyPairMap.set(key, existing);
  }

  const currencyPairSummary = Array.from(currencyPairMap.values()).map((cp) => ({
    ...cp,
    avgMidMarketRate: cp.invoiceCount > 0 ? Math.round((cp.avgMidMarketRate / cp.invoiceCount) * 10000) / 10000 : 0,
    avgClientRate: cp.invoiceCount > 0 ? Math.round((cp.avgClientRate / cp.invoiceCount) * 10000) / 10000 : 0,
    avgMarkupPercent: cp.invoiceCount > 0 ? Math.round((cp.avgMarkupPercent / cp.invoiceCount) * 100) / 100 : 0,
    totalLocalAmount: Math.round(cp.totalLocalAmount * 100) / 100,
    totalSettlementAmount: Math.round(cp.totalSettlementAmount * 100) / 100,
    totalFxMarkupRevenue: Math.round(cp.totalFxMarkupRevenue * 100) / 100,
  }));

  // Monthly trend
  const monthlyMap = new Map<string, MonthlyFxSummary>();
  for (const bd of invoiceBreakdowns) {
    const month = bd.invoiceMonth || "unknown";
    const existing = monthlyMap.get(month) || {
      month,
      totalPassThrough: 0,
      totalFxMarkupRevenue: 0,
      totalServiceFeeRevenue: 0,
      totalNetRevenue: 0,
      invoiceCount: 0,
    };
    existing.totalPassThrough += bd.passThroughCostUsd;
    existing.totalFxMarkupRevenue += bd.fxMarkupRevenue;
    existing.totalServiceFeeRevenue += bd.serviceFeeRevenue;
    existing.totalNetRevenue += bd.totalNetRevenue;
    existing.invoiceCount += 1;
    monthlyMap.set(month, existing);
  }

  const monthlyTrend = Array.from(monthlyMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      ...m,
      totalPassThrough: Math.round(m.totalPassThrough * 100) / 100,
      totalFxMarkupRevenue: Math.round(m.totalFxMarkupRevenue * 100) / 100,
      totalServiceFeeRevenue: Math.round(m.totalServiceFeeRevenue * 100) / 100,
      totalNetRevenue: Math.round(m.totalNetRevenue * 100) / 100,
    }));

  return {
    totalPassThrough: Math.round(totalPassThrough * 100) / 100,
    totalFxMarkupRevenue: Math.round(totalFxMarkupRevenue * 100) / 100,
    totalServiceFeeRevenue: Math.round(totalServiceFeeRevenue * 100) / 100,
    totalNetRevenue: Math.round(totalNetRevenue * 100) / 100,
    fxMarkupPercentOfTotal: Math.round(fxMarkupPercentOfTotal * 100) / 100,
    invoiceBreakdowns,
    currencyPairSummary,
    monthlyTrend,
  };
}

/**
 * Get FX breakdown for a single invoice by ID.
 */
export async function getInvoiceFxBreakdown(invoiceId: number): Promise<FxBreakdown | null> {
  const db = getDb();
  if (!db) return null;

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return null;

  return calculateFxBreakdown(inv);
}
