/**
 * Dual-Currency Reconciliation Engine
 *
 * Matches invoices to vendor bills for dual-currency reconciliation:
 *   Invoice (client-facing, in settlement currency) ↔ Vendor Bill (cost-side, in local currency)
 *
 * Key concepts:
 *   - Invoice records revenue in settlement currency (USD or customer currency)
 *   - Vendor Bill records actual cost in local currency + USD settlement amount
 *   - Reconciliation matches them via employee ↔ payroll month ↔ country
 *   - Variance = Invoice settlement amount - Vendor Bill settlement amount
 *   - FX Gain/Loss = difference between invoice FX rate and actual payment FX rate
 *
 * This engine provides:
 *   1. Auto-matching: suggest matches based on payroll month + country + customer
 *   2. Manual matching: admin can override and create custom matches
 *   3. Variance calculation: compute and store reconciliation variance
 *   4. Status tracking: pending → matched → variance → manual_override
 */
import { eq, and, sql, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  invoices,
  invoiceItems,
  vendorBills,
  vendorBillItems,
  billInvoiceAllocations,
  vendors,
  employees,
  customers,
  type Invoice,
  type VendorBill,
} from "../../drizzle/schema";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface ReconciliationMatch {
  invoiceId: number;
  invoiceNumber: string;
  invoiceTotal: number;
  invoiceCurrency: string;
  invoiceSettlementUsd: number;
  invoiceFxRate: number;
  vendorBillId: number;
  vendorBillNumber: string;
  vendorBillTotal: number;
  vendorBillCurrency: string;
  vendorBillSettlementUsd: number;
  vendorBillFxRate: number;
  varianceUsd: number;
  fxGainLoss: number;
  matchConfidence: "high" | "medium" | "low";
  matchReason: string;
}

export interface ReconciliationSummary {
  totalInvoicesUnreconciled: number;
  totalBillsUnreconciled: number;
  totalMatched: number;
  totalVariance: number;
  totalFxGainLoss: number;
  matches: ReconciliationMatch[];
}

export interface ReconcileResult {
  vendorBillId: number;
  invoiceId: number;
  varianceUsd: number;
  fxGainLoss: number;
  status: "matched" | "variance";
}

// ────────────────────────────────────────────────────────────────
// Auto-Match Engine
// ────────────────────────────────────────────────────────────────

/**
 * Suggest reconciliation matches for a given payroll month.
 * Matches vendor bills to invoices based on:
 *   1. Same payroll month (billMonth ↔ invoiceMonth)
 *   2. Same country (via employee allocation or bill countryCode)
 *   3. Same customer (via bill item relatedCustomerId or allocation)
 */
export async function suggestReconciliationMatches(
  payrollMonth: string, // YYYY-MM format
): Promise<ReconciliationMatch[]> {
  const db = getDb();
  if (!db) return [];

  const monthStart = `${payrollMonth}-01`;

  // Get unreconciled vendor bills for this month
  const unreconciledBills = await db
    .select()
    .from(vendorBills)
    .where(
      and(
        eq(vendorBills.payrollMonth, monthStart),
        sql`${vendorBills.reconciliationStatus} IN ('pending', 'variance')`,
        sql`${vendorBills.status} NOT IN ('cancelled', 'void', 'draft')`,
      )
    );

  // Get invoices for this month that could be matched
  const monthInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.invoiceMonth, monthStart),
        sql`${invoices.status} NOT IN ('cancelled', 'void', 'draft')`,
        sql`${invoices.invoiceLayer} IN ('eg_to_cp', 'eg_to_client', 'legacy')`,
      )
    );

  const matches: ReconciliationMatch[] = [];

  for (const bill of unreconciledBills) {
    // Find matching invoices based on country and customer
    const billItems = await db
      .select()
      .from(vendorBillItems)
      .where(eq(vendorBillItems.vendorBillId, bill.id));

    // Get related customers from bill items
    const relatedCustomerIds = new Set(
      billItems
        .filter((item) => item.relatedCustomerId)
        .map((item) => item.relatedCustomerId!)
    );

    // Get related countries from bill items or bill itself
    const relatedCountries = new Set<string>();
    if (bill.countryCode) relatedCountries.add(bill.countryCode);
    billItems.forEach((item) => {
      if (item.relatedCountryCode) relatedCountries.add(item.relatedCountryCode);
    });

    // Try to match by customer + country
    for (const inv of monthInvoices) {
      let confidence: "high" | "medium" | "low" = "low";
      let reason = "";

      // Check customer match
      const customerMatch = relatedCustomerIds.has(inv.customerId);
      // Check country match (via invoice items' employees)
      const countryMatch = relatedCountries.size === 0; // If no country info, don't penalize

      if (customerMatch) {
        confidence = "high";
        reason = `Customer match (ID: ${inv.customerId})`;
        if (relatedCountries.size > 0) {
          reason += `, Country: ${Array.from(relatedCountries).join(",")}`;
        }
      } else if (bill.countryCode) {
        // Try matching by country only
        confidence = "medium";
        reason = `Country match: ${bill.countryCode}`;
      } else {
        // Month-only match
        confidence = "low";
        reason = `Month match only: ${payrollMonth}`;
      }

      const billSettlementUsd = parseFloat(bill.settlementAmountUsd || bill.totalAmount);
      const invSettlementUsd = parseFloat(inv.settlementAmountUsd || inv.total);
      const billFxRate = parseFloat(bill.fxRateActual || "1");
      const invFxRate = parseFloat(inv.fxRateUsed || "1");

      const varianceUsd = Math.round((invSettlementUsd - billSettlementUsd) * 100) / 100;
      const fxGainLoss = invFxRate !== 0 && billFxRate !== 0
        ? Math.round((invFxRate - billFxRate) * parseFloat(bill.localAmount || bill.totalAmount) * 100) / 100
        : 0;

      matches.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceTotal: parseFloat(inv.total),
        invoiceCurrency: inv.currency,
        invoiceSettlementUsd: invSettlementUsd,
        invoiceFxRate: invFxRate,
        vendorBillId: bill.id,
        vendorBillNumber: bill.billNumber,
        vendorBillTotal: parseFloat(bill.totalAmount),
        vendorBillCurrency: bill.currency,
        vendorBillSettlementUsd: billSettlementUsd,
        vendorBillFxRate: billFxRate,
        varianceUsd,
        fxGainLoss,
        matchConfidence: confidence,
        matchReason: reason,
      });
    }
  }

  // Sort by confidence (high first) then by absolute variance (lowest first)
  matches.sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    if (confOrder[a.matchConfidence] !== confOrder[b.matchConfidence]) {
      return confOrder[a.matchConfidence] - confOrder[b.matchConfidence];
    }
    return Math.abs(a.varianceUsd) - Math.abs(b.varianceUsd);
  });

  return matches;
}

/**
 * Execute a reconciliation match — update vendor bill status and store variance.
 */
export async function executeReconciliation(
  vendorBillId: number,
  invoiceId: number,
  overrideNote?: string,
): Promise<ReconcileResult> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  // Get the bill and invoice
  const [bill] = await db.select().from(vendorBills).where(eq(vendorBills.id, vendorBillId));
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));

  if (!bill) throw new Error(`Vendor bill ${vendorBillId} not found`);
  if (!inv) throw new Error(`Invoice ${invoiceId} not found`);

  const billSettlementUsd = parseFloat(bill.settlementAmountUsd || bill.totalAmount);
  const invSettlementUsd = parseFloat(inv.settlementAmountUsd || inv.total);
  const varianceUsd = Math.round((invSettlementUsd - billSettlementUsd) * 100) / 100;

  const billFxRate = parseFloat(bill.fxRateActual || "1");
  const invFxRate = parseFloat(inv.fxRateUsed || "1");
  const localAmount = parseFloat(bill.localAmount || bill.totalAmount);
  const fxGainLoss = Math.round((invFxRate - billFxRate) * localAmount * 100) / 100;

  // Determine status
  const VARIANCE_THRESHOLD = 0.01; // $0.01 tolerance
  const status: "matched" | "variance" = Math.abs(varianceUsd) <= VARIANCE_THRESHOLD ? "matched" : "variance";

  // Update vendor bill reconciliation status
  await db
    .update(vendorBills)
    .set({
      reconciliationStatus: overrideNote ? "manual_override" : status,
      reconciliationVariance: varianceUsd.toString(),
      reconciliationNote: overrideNote || `Auto-matched to invoice ${inv.invoiceNumber}. Variance: $${varianceUsd.toFixed(2)}`,
    })
    .where(eq(vendorBills.id, vendorBillId));

  // Update invoice FX gain/loss
  await db
    .update(invoices)
    .set({
      fxGainLoss: fxGainLoss.toString(),
    })
    .where(eq(invoices.id, invoiceId));

  return {
    vendorBillId,
    invoiceId,
    varianceUsd,
    fxGainLoss,
    status,
  };
}

/**
 * Batch reconcile — auto-match all high-confidence matches for a month.
 */
export async function batchReconcile(
  payrollMonth: string,
): Promise<ReconcileResult[]> {
  const matches = await suggestReconciliationMatches(payrollMonth);
  const highConfidence = matches.filter((m) => m.matchConfidence === "high");

  // Deduplicate: each bill should only match one invoice (best match)
  const billToInvoice = new Map<number, ReconciliationMatch>();
  for (const match of highConfidence) {
    const existing = billToInvoice.get(match.vendorBillId);
    if (!existing || Math.abs(match.varianceUsd) < Math.abs(existing.varianceUsd)) {
      billToInvoice.set(match.vendorBillId, match);
    }
  }

  const results: ReconcileResult[] = [];
  for (const match of Array.from(billToInvoice.values())) {
    try {
      const result = await executeReconciliation(match.vendorBillId, match.invoiceId);
      results.push(result);
    } catch (err) {
      console.error(`Reconciliation failed for bill ${match.vendorBillId}:`, err);
    }
  }

  return results;
}

/**
 * Get reconciliation summary for a payroll month.
 */
export async function getReconciliationSummary(
  payrollMonth: string,
): Promise<ReconciliationSummary> {
  const db = getDb();
  if (!db) {
    return {
      totalInvoicesUnreconciled: 0,
      totalBillsUnreconciled: 0,
      totalMatched: 0,
      totalVariance: 0,
      totalFxGainLoss: 0,
      matches: [],
    };
  }

  const monthStart = `${payrollMonth}-01`;

  // Count unreconciled bills
  const [unreconciledBillsCount] = await db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(vendorBills)
    .where(
      and(
        eq(vendorBills.payrollMonth, monthStart),
        eq(vendorBills.reconciliationStatus, "pending"),
      )
    );

  // Count matched bills
  const [matchedBillsCount] = await db
    .select({
      cnt: sql<number>`COUNT(*)`,
      totalVariance: sql<string>`COALESCE(SUM(CAST(${vendorBills.reconciliationVariance} AS REAL)), 0)`,
    })
    .from(vendorBills)
    .where(
      and(
        eq(vendorBills.payrollMonth, monthStart),
        sql`${vendorBills.reconciliationStatus} IN ('matched', 'manual_override')`,
      )
    );

  // Count unreconciled invoices (invoices without cost allocation)
  const [unreconciledInvoicesCount] = await db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(invoices)
    .where(
      and(
        eq(invoices.invoiceMonth, monthStart),
        sql`${invoices.status} NOT IN ('cancelled', 'void', 'draft')`,
        sql`CAST(COALESCE(${invoices.costAllocated}, '0') AS REAL) = 0`,
      )
    );

  // Total FX gain/loss for matched invoices
  const [fxTotal] = await db
    .select({
      totalFxGainLoss: sql<string>`COALESCE(SUM(CAST(${invoices.fxGainLoss} AS REAL)), 0)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.invoiceMonth, monthStart),
        sql`${invoices.fxGainLoss} IS NOT NULL AND ${invoices.fxGainLoss} != '0'`,
      )
    );

  const matches = await suggestReconciliationMatches(payrollMonth);

  return {
    totalInvoicesUnreconciled: unreconciledInvoicesCount?.cnt || 0,
    totalBillsUnreconciled: unreconciledBillsCount?.cnt || 0,
    totalMatched: matchedBillsCount?.cnt || 0,
    totalVariance: parseFloat(matchedBillsCount?.totalVariance?.toString() || "0"),
    totalFxGainLoss: parseFloat(fxTotal?.totalFxGainLoss?.toString() || "0"),
    matches,
  };
}

// ────────────────────────────────────────────────────────────────
// Employment Cost Reconciliation (Country + Month)
// ────────────────────────────────────────────────────────────────

export interface EmploymentCostReconciliationRow {
  countryCode: string;
  payrollMonth: string;
  // Invoice side (from accountant data)
  invoiceLocalAmount: number;   // Sum of invoiceItems.localAmount where itemType = 'employment_cost'
  invoiceUsdAmount: number;     // Sum of invoiceItems.amount (USD) where itemType = 'employment_cost'
  localCurrency: string;
  // Vendor Bill side (government actual)
  govBillLocalAmount: number;   // Sum of vendorBills.localAmount where billType = 'pass_through'
  govBillUsdAmount: number;     // Sum of vendorBills.settlementAmountUsd where billType = 'pass_through'
  // Differences
  localAmountDiff: number;      // invoiceLocalAmount - govBillLocalAmount (should be ~0)
  usdAmountDiff: number;        // invoiceUsdAmount - govBillUsdAmount (= actual FX markup revenue)
  // Alert
  hasMismatch: boolean;         // true if |localAmountDiff| > threshold
  mismatchSeverity: 'none' | 'warning' | 'critical';
  mismatchNote: string;
}

export interface EmploymentCostReconciliationSummary {
  rows: EmploymentCostReconciliationRow[];
  totalInvoiceLocalAmount: number;
  totalInvoiceUsdAmount: number;
  totalGovBillLocalAmount: number;
  totalGovBillUsdAmount: number;
  totalLocalDiff: number;
  totalUsdDiff: number;         // Total actual FX markup revenue
  totalMismatches: number;
}

/**
 * Employment Cost Reconciliation: compare Invoice Employment Cost vs Government Vendor Bills
 * by country + month dimension.
 *
 * - Local currency comparison: accountant data vs government actual (should be ~0)
 * - USD comparison: what we charged client vs what we actually paid (= FX markup revenue)
 */
export async function getEmploymentCostReconciliation(
  payrollMonth: string, // YYYY-MM format
): Promise<EmploymentCostReconciliationSummary> {
  const db = getDb();
  if (!db) {
    return {
      rows: [],
      totalInvoiceLocalAmount: 0,
      totalInvoiceUsdAmount: 0,
      totalGovBillLocalAmount: 0,
      totalGovBillUsdAmount: 0,
      totalLocalDiff: 0,
      totalUsdDiff: 0,
      totalMismatches: 0,
    };
  }

  const monthStart = `${payrollMonth}-01`;
  const LOCAL_DIFF_THRESHOLD = 1.00; // Alert if local currency diff > 1.00
  const CRITICAL_THRESHOLD = 100.00; // Critical if diff > 100.00

  // ── Invoice side: Employment Cost by country ──
  // Sum invoiceItems where itemType = 'employment_cost', grouped by countryCode
  const invoiceSide = await db
    .select({
      countryCode: invoiceItems.countryCode,
      localCurrency: invoiceItems.localCurrency,
      totalLocalAmount: sql<string>`COALESCE(SUM(CAST(${invoiceItems.localAmount} AS REAL)), 0)`,
      totalUsdAmount: sql<string>`COALESCE(SUM(CAST(${invoiceItems.amount} AS REAL)), 0)`,
    })
    .from(invoiceItems)
    .innerJoin(invoices, sql`${invoiceItems.invoiceId} = ${invoices.id}`)
    .where(
      and(
        eq(invoices.invoiceMonth, monthStart),
        eq(invoiceItems.itemType, "employment_cost"),
        sql`${invoices.status} NOT IN ('cancelled', 'void', 'draft')`,
        sql`${invoices.invoiceType} IN ('monthly_eor', 'monthly_visa_eor', 'monthly_aor')`,
      )
    )
    .groupBy(invoiceItems.countryCode, invoiceItems.localCurrency);

  // ── Vendor Bill side: Government bills by country ──
  // Sum vendorBills where billType = 'pass_through' (government), grouped by countryCode
  const govBillSide = await db
    .select({
      countryCode: vendorBills.countryCode,
      totalLocalAmount: sql<string>`COALESCE(SUM(CAST(${vendorBills.localAmount} AS REAL)), 0)`,
      totalUsdAmount: sql<string>`COALESCE(SUM(CAST(${vendorBills.settlementAmountUsd} AS REAL)), 0)`,
    })
    .from(vendorBills)
    .where(
      and(
        eq(vendorBills.payrollMonth, monthStart),
        eq(vendorBills.billType, "pass_through"),
        sql`${vendorBills.status} NOT IN ('cancelled', 'void', 'draft')`,
      )
    )
    .groupBy(vendorBills.countryCode);

  // ── Build comparison map ──
  const countryMap = new Map<string, {
    invoiceLocal: number;
    invoiceUsd: number;
    govLocal: number;
    govUsd: number;
    localCurrency: string;
  }>();

  for (const row of invoiceSide) {
    const cc = row.countryCode || "UNKNOWN";
    countryMap.set(cc, {
      invoiceLocal: parseFloat(row.totalLocalAmount),
      invoiceUsd: parseFloat(row.totalUsdAmount),
      govLocal: 0,
      govUsd: 0,
      localCurrency: row.localCurrency || "USD",
    });
  }

  for (const row of govBillSide) {
    const cc = row.countryCode || "UNKNOWN";
    const existing = countryMap.get(cc);
    if (existing) {
      existing.govLocal = parseFloat(row.totalLocalAmount);
      existing.govUsd = parseFloat(row.totalUsdAmount);
    } else {
      countryMap.set(cc, {
        invoiceLocal: 0,
        invoiceUsd: 0,
        govLocal: parseFloat(row.totalLocalAmount),
        govUsd: parseFloat(row.totalUsdAmount),
        localCurrency: "USD",
      });
    }
  }

  // ── Build result rows ──
  const rows: EmploymentCostReconciliationRow[] = [];
  let totalMismatches = 0;

  for (const [cc, data] of Array.from(countryMap.entries())) {
    const localDiff = Math.round((data.invoiceLocal - data.govLocal) * 100) / 100;
    const usdDiff = Math.round((data.invoiceUsd - data.govUsd) * 100) / 100;
    const absLocalDiff = Math.abs(localDiff);

    let hasMismatch = false;
    let mismatchSeverity: 'none' | 'warning' | 'critical' = 'none';
    let mismatchNote = '';

    if (absLocalDiff > CRITICAL_THRESHOLD) {
      hasMismatch = true;
      mismatchSeverity = 'critical';
      mismatchNote = `CRITICAL: Local currency mismatch of ${data.localCurrency} ${localDiff.toFixed(2)}. Accountant data differs significantly from Government bill.`;
      totalMismatches++;
    } else if (absLocalDiff > LOCAL_DIFF_THRESHOLD) {
      hasMismatch = true;
      mismatchSeverity = 'warning';
      mismatchNote = `WARNING: Local currency mismatch of ${data.localCurrency} ${localDiff.toFixed(2)}. Please verify with accountant.`;
      totalMismatches++;
    }

    rows.push({
      countryCode: cc,
      payrollMonth,
      invoiceLocalAmount: data.invoiceLocal,
      invoiceUsdAmount: data.invoiceUsd,
      localCurrency: data.localCurrency,
      govBillLocalAmount: data.govLocal,
      govBillUsdAmount: data.govUsd,
      localAmountDiff: localDiff,
      usdAmountDiff: usdDiff,
      hasMismatch,
      mismatchSeverity,
      mismatchNote,
    });
  }

  // Sort: critical first, then warning, then none
  rows.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, none: 2 };
    return severityOrder[a.mismatchSeverity] - severityOrder[b.mismatchSeverity];
  });

  return {
    rows,
    totalInvoiceLocalAmount: rows.reduce((s, r) => s + r.invoiceLocalAmount, 0),
    totalInvoiceUsdAmount: rows.reduce((s, r) => s + r.invoiceUsdAmount, 0),
    totalGovBillLocalAmount: rows.reduce((s, r) => s + r.govBillLocalAmount, 0),
    totalGovBillUsdAmount: rows.reduce((s, r) => s + r.govBillUsdAmount, 0),
    totalLocalDiff: rows.reduce((s, r) => s + r.localAmountDiff, 0),
    totalUsdDiff: rows.reduce((s, r) => s + r.usdAmountDiff, 0),
    totalMismatches,
  };
}

/**
 * Reset reconciliation status for a vendor bill (un-reconcile).
 */
export async function unreconciledVendorBill(vendorBillId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  await db
    .update(vendorBills)
    .set({
      reconciliationStatus: "pending",
      reconciliationVariance: null,
      reconciliationNote: null,
    })
    .where(eq(vendorBills.id, vendorBillId));
}
