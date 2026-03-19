/**
 * Net P&L Report Router (Refactored)
 *
 * True profit calculation based on actual USD cash flows:
 *
 * === Recurring Business (Core EOR) ===
 *   Service Fee Revenue           [Invoice serviceFeeTotal]
 *   FX Markup Revenue (Actual)    [Invoice Employment Cost USD - Government Vendor Bill settlementAmountUsd]
 *   (=) Total Recurring Revenue
 *   (-) Vendor Service Fees       [billType = service_fee]
 *   (-) Bank Charges              [billType = bank_charge]
 *   (=) Core Operating Profit
 *
 * === Non-recurring Business ===
 *   Non-recurring Invoice Revenue [invoiceType = visa_service, manual]
 *   (-) Non-recurring Vendor Cost [equipment_provider / hr_recruitment vendor bills]
 *   (=) Non-recurring Margin
 *
 * === Other Expenses ===
 *   (-) Penalties / Late Payment Fees
 *   (-) Other Operational Costs
 *
 * === Net Profit ===
 *   Core Operating Profit + Non-recurring Margin - Other Expenses
 *
 * Dual-dimension reconciliation (by country + month):
 *   - Local currency variance: Invoice Employment Cost (local) vs Government Bill (local)
 *   - Actual FX gain: Invoice Employment Cost (USD) vs Government Bill (settlementAmountUsd)
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure } from "../procedures";
import { getDb } from "../db";
import {
  invoices as invoicesTable,
  invoiceItems as invoiceItemsTable,
  vendorBills as vendorBillsTable,
  vendors as vendorsTable,
  customers as customersTable,
  channelPartners as cpTable,
  billInvoiceAllocations,
} from "../../drizzle/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { calculateFxBreakdown } from "../services/fxStrippingEngine";

const RECURRING_INVOICE_TYPES = ["monthly_eor", "monthly_visa_eor", "monthly_aor"];
const NON_RECURRING_INVOICE_TYPES = ["visa_service", "manual"];

function getMonthRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  let cy = sy, cm = sm;
  while (cy < ey || (cy === ey && cm <= em)) {
    months.push(`${cy}-${String(cm).padStart(2, "0")}`);
    cm++;
    if (cm > 12) { cm = 1; cy++; }
  }
  return months;
}

function getLastNMonths(n: number): string[] {
  const d = new Date();
  const months: string[] = [];
  for (let i = 0; i < n; i++) {
    months.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const netPnlRouter = router({
  /**
   * Net P&L Report — the core financial report for EG.
   */
  report: financeManagerProcedure
    .input(
      z.object({
        startMonth: z.string().optional(),
        endMonth: z.string().optional(),
        months: z.number().default(12),
        channelPartnerId: z.number().optional(),
        customerId: z.number().optional(),
        countryCode: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const emptySummary = {
        // Recurring
        grossInvoiceTotal: 0,
        recurringInvoiceRevenue: 0,
        serviceFeeRevenue: 0,
        fxMarkupRevenue: 0,
        actualEmploymentCostUsd: 0,
        grossMargin: 0,
        totalRecurringRevenue: 0,
        vendorServiceFees: 0,
        bankCharges: 0,
        coreOperatingProfit: 0,
        // Non-recurring
        nonRecurringInvoiceRevenue: 0,
        nonRecurringVendorCost: 0,
        nonRecurringMargin: 0,
        // Other expenses
        penalties: 0,
        otherOperationalCosts: 0,
        totalOtherExpenses: 0,
        // Bottom line
        netProfit: 0,
        netProfitMargin: 0,
        // Legacy fields for backward compatibility
        passThroughCost: 0,
        totalNetRevenue: 0,
        unallocatedCosts: 0,
        totalOperatingExpenses: 0,
      };

      if (!db) {
        return {
          summary: emptySummary,
          monthlyBreakdown: [],
          byCustomer: [],
          byChannelPartner: [],
          byCountry: [],
          byInvoiceLayer: [],
          fxReconciliation: [],
        };
      }

      // Determine month range
      let months: string[];
      if (input.startMonth && input.endMonth) {
        months = getMonthRange(input.startMonth, input.endMonth);
      } else {
        months = getLastNMonths(input.months);
      }

      const globalStart = `${months[0]}-01`;
      const lastMonth = months[months.length - 1].split("-").map(Number);
      const globalEnd = lastMonth[1] === 12
        ? `${lastMonth[0] + 1}-01-01`
        : `${lastMonth[0]}-${String(lastMonth[1] + 1).padStart(2, "0")}-01`;

      // ── Get all qualifying invoices ──
      const invoiceConditions = [
        sql`${invoicesTable.invoiceMonth} >= ${globalStart}`,
        sql`${invoicesTable.invoiceMonth} < ${globalEnd}`,
        sql`${invoicesTable.status} NOT IN ('cancelled', 'void', 'draft')`,
        sql`${invoicesTable.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`,
      ];

      if (input.channelPartnerId) {
        invoiceConditions.push(eq(invoicesTable.channelPartnerId, input.channelPartnerId));
      }
      if (input.customerId) {
        invoiceConditions.push(eq(invoicesTable.customerId, input.customerId));
      }

      const allInvoices = await db
        .select()
        .from(invoicesTable)
        .where(and(...invoiceConditions));

      // Separate recurring vs non-recurring invoices
      const recurringInvoices = allInvoices.filter(inv => RECURRING_INVOICE_TYPES.includes(inv.invoiceType));
      const nonRecurringInvoices = allInvoices.filter(inv => NON_RECURRING_INVOICE_TYPES.includes(inv.invoiceType));

      // Calculate FX breakdown for recurring invoices
      const recurringBreakdowns = recurringInvoices.map(calculateFxBreakdown);

      // ── Get all invoice items for Employment Cost aggregation (by country + month) ──
      const recurringInvoiceIds = recurringInvoices.map(inv => inv.id);
      let invoiceItemsByCountryMonth = new Map<string, { localAmountTotal: number; usdAmountTotal: number }>();

      if (recurringInvoiceIds.length > 0) {
        const items = await db
          .select()
          .from(invoiceItemsTable)
          .where(
            and(
              inArray(invoiceItemsTable.invoiceId, recurringInvoiceIds),
              eq(invoiceItemsTable.itemType, "employment_cost")
            )
          );

        // Build a map: invoiceId -> invoice (for country/month lookup)
        const invoiceMap = new Map(recurringInvoices.map(inv => [inv.id, inv]));

        for (const item of items) {
          const invoice = invoiceMap.get(item.invoiceId);
          if (!invoice) continue;
          const countryCode = (invoice as any).countryCode || (invoice as any).localCurrency || "UNKNOWN";
          const month = invoice.invoiceMonth?.substring(0, 7) || "unknown";
          const key = `${countryCode}::${month}`;

          const existing = invoiceItemsByCountryMonth.get(key) || { localAmountTotal: 0, usdAmountTotal: 0 };
          existing.localAmountTotal += parseFloat((item as any).localAmount || "0");
          existing.usdAmountTotal += parseFloat(item.amount || "0");
          invoiceItemsByCountryMonth.set(key, existing);
        }
      }

      // ── Get vendor bills (expenses) ──
      const billConditions = [
        sql`${vendorBillsTable.billMonth} >= ${globalStart}`,
        sql`${vendorBillsTable.billMonth} < ${globalEnd}`,
        inArray(vendorBillsTable.status, ["paid", "approved", "partially_paid"]),
      ];

      const allBills = await db
        .select({
          bill: vendorBillsTable,
          vendorType: vendorsTable.vendorType,
        })
        .from(vendorBillsTable)
        .leftJoin(vendorsTable, eq(vendorBillsTable.vendorId, vendorsTable.id))
        .where(and(...billConditions));

      // ── Categorize vendor bills with CORRECT USD amounts ──
      let vendorServiceFees = 0;
      let bankCharges = 0;
      let actualEmploymentCostUsd = 0; // Government pass-through in USD
      let nonRecurringVendorCost = 0;
      let penalties = 0;
      let otherOperationalCosts = 0;

      // Government bills by country+month for FX reconciliation
      const govBillsByCountryMonth = new Map<string, { localAmountTotal: number; settlementUsdTotal: number }>();

      for (const { bill, vendorType } of allBills) {
        // CRITICAL FIX: Use settlementAmountUsd for pass_through bills, not totalAmount
        const usdAmount = bill.billType === "pass_through"
          ? parseFloat(bill.settlementAmountUsd || "0")
          : parseFloat(bill.totalAmount || "0");

        switch (bill.billType) {
          case "service_fee":
            vendorServiceFees += usdAmount;
            break;
          case "bank_charge":
            bankCharges += usdAmount;
            break;
          case "pass_through":
            actualEmploymentCostUsd += usdAmount;
            // Track by country+month for reconciliation
            {
              const countryCode = bill.countryCode || "UNKNOWN";
              const month = bill.billMonth?.substring(0, 7) || bill.payrollMonth || "unknown";
              const key = `${countryCode}::${month}`;
              const existing = govBillsByCountryMonth.get(key) || { localAmountTotal: 0, settlementUsdTotal: 0 };
              existing.localAmountTotal += parseFloat(bill.localAmount || "0");
              existing.settlementUsdTotal += parseFloat(bill.settlementAmountUsd || "0");
              govBillsByCountryMonth.set(key, existing);
            }
            break;
          default:
            // Categorize by vendor type or bill category
            if (vendorType === "equipment_provider" || vendorType === "hr_recruitment") {
              nonRecurringVendorCost += usdAmount;
            } else if (bill.category === "penalty" || bill.category === "late_payment_fee") {
              penalties += usdAmount;
            } else {
              otherOperationalCosts += usdAmount;
            }
        }
      }

      // ── Aggregate recurring invoice revenue ──
      let grossInvoiceTotal = 0;
      let recurringInvoiceRevenue = 0;
      let totalPassThrough = 0;
      let totalFxMarkupRevenueTheoretical = 0;
      let totalServiceFeeRevenue = 0;

      for (const bd of recurringBreakdowns) {
        grossInvoiceTotal += bd.invoiceTotal;
        recurringInvoiceRevenue += bd.invoiceTotal;
        totalPassThrough += bd.passThroughCostUsd;
        totalFxMarkupRevenueTheoretical += bd.fxMarkupRevenue;
        totalServiceFeeRevenue += bd.serviceFeeRevenue;
      }

      // ── Calculate ACTUAL FX Markup Revenue ──
      // Actual FX Markup = Invoice Employment Cost (USD) - Government Vendor Bill (settlementAmountUsd)
      // Aggregated by country + month
      let actualFxMarkupRevenue = 0;
      const fxReconciliation: Array<{
        countryCode: string;
        month: string;
        invoiceEmploymentCostLocal: number;
        govBillLocalAmount: number;
        localCurrencyVariance: number;
        invoiceEmploymentCostUsd: number;
        govBillSettlementUsd: number;
        actualFxGain: number;
        hasMismatch: boolean;
      }> = [];

      // Merge keys from both maps
      const allKeys = new Set([
        ...Array.from(invoiceItemsByCountryMonth.keys()),
        ...Array.from(govBillsByCountryMonth.keys()),
      ]);

      for (const key of Array.from(allKeys)) {
        const [countryCode, month] = key.split("::");
        const invoiceSide = invoiceItemsByCountryMonth.get(key) || { localAmountTotal: 0, usdAmountTotal: 0 };
        const govSide = govBillsByCountryMonth.get(key) || { localAmountTotal: 0, settlementUsdTotal: 0 };

        const localVariance = invoiceSide.localAmountTotal - govSide.localAmountTotal;
        const fxGain = invoiceSide.usdAmountTotal - govSide.settlementUsdTotal;
        actualFxMarkupRevenue += fxGain;

        fxReconciliation.push({
          countryCode,
          month,
          invoiceEmploymentCostLocal: round2(invoiceSide.localAmountTotal),
          govBillLocalAmount: round2(govSide.localAmountTotal),
          localCurrencyVariance: round2(localVariance),
          invoiceEmploymentCostUsd: round2(invoiceSide.usdAmountTotal),
          govBillSettlementUsd: round2(govSide.settlementUsdTotal),
          actualFxGain: round2(fxGain),
          hasMismatch: Math.abs(localVariance) > 1.0,
        });
      }

      // If no government bills yet, fall back to theoretical FX markup from invoice calculation
      const fxMarkupRevenue = govBillsByCountryMonth.size > 0 ? actualFxMarkupRevenue : totalFxMarkupRevenueTheoretical;

      // ── Non-recurring revenue ──
      let nonRecurringInvoiceRevenue = 0;
      for (const inv of nonRecurringInvoices) {
        nonRecurringInvoiceRevenue += parseFloat(inv.total || "0");
        grossInvoiceTotal += parseFloat(inv.total || "0");
      }

      // ── Final P&L calculations ──
      const totalRecurringRevenue = totalServiceFeeRevenue + fxMarkupRevenue;
      const coreOperatingProfit = totalRecurringRevenue - vendorServiceFees - bankCharges;
      const nonRecurringMargin = nonRecurringInvoiceRevenue - nonRecurringVendorCost;
      const totalOtherExpenses = penalties + otherOperationalCosts;
      const netProfit = coreOperatingProfit + nonRecurringMargin - totalOtherExpenses;
      const grossMargin = recurringInvoiceRevenue - actualEmploymentCostUsd;
      const totalOperatingExpenses = vendorServiceFees + bankCharges + penalties + otherOperationalCosts + nonRecurringVendorCost;
      const netProfitMargin = (totalRecurringRevenue + nonRecurringInvoiceRevenue) > 0
        ? (netProfit / (totalRecurringRevenue + nonRecurringInvoiceRevenue)) * 100
        : 0;

      // ── Monthly breakdown ──
      type MonthlyEntry = {
        month: string;
        grossInvoiceTotal: number;
        recurringInvoiceRevenue: number;
        serviceFeeRevenue: number;
        fxMarkupRevenue: number;
        grossMargin: number;
        vendorServiceFees: number;
        bankCharges: number;
        coreOperatingProfit: number;
        nonRecurringRevenue: number;
        nonRecurringCost: number;
        nonRecurringMargin: number;
        penalties: number;
        otherOpex: number;
        netProfit: number;
        invoiceCount: number;
        // Legacy fields
        passThroughCost: number;
        totalNetRevenue: number;
      };

      const monthlyMap = new Map<string, MonthlyEntry>();
      for (const m of months) {
        monthlyMap.set(m, {
          month: m,
          grossInvoiceTotal: 0,
          recurringInvoiceRevenue: 0,
          serviceFeeRevenue: 0,
          fxMarkupRevenue: 0,
          grossMargin: 0,
          vendorServiceFees: 0,
          bankCharges: 0,
          coreOperatingProfit: 0,
          nonRecurringRevenue: 0,
          nonRecurringCost: 0,
          nonRecurringMargin: 0,
          penalties: 0,
          otherOpex: 0,
          netProfit: 0,
          invoiceCount: 0,
          passThroughCost: 0,
          totalNetRevenue: 0,
        });
      }

      // Recurring invoice data by month
      for (const bd of recurringBreakdowns) {
        const month = bd.invoiceMonth?.substring(0, 7) || "unknown";
        const entry = monthlyMap.get(month);
        if (entry) {
          entry.grossInvoiceTotal += bd.invoiceTotal;
          entry.recurringInvoiceRevenue += bd.invoiceTotal;
          entry.serviceFeeRevenue += bd.serviceFeeRevenue;
          entry.fxMarkupRevenue += bd.fxMarkupRevenue; // theoretical, will be overridden if gov bills exist
          entry.passThroughCost += bd.passThroughCostUsd;
          entry.totalNetRevenue += bd.totalNetRevenue;
          entry.invoiceCount += 1;
        }
      }

      // Non-recurring invoice data by month
      for (const inv of nonRecurringInvoices) {
        const month = inv.invoiceMonth?.substring(0, 7) || "unknown";
        const entry = monthlyMap.get(month);
        if (entry) {
          const amount = parseFloat(inv.total || "0");
          entry.grossInvoiceTotal += amount;
          entry.nonRecurringRevenue += amount;
          entry.invoiceCount += 1;
        }
      }

      // Vendor bill expenses by month
      for (const { bill, vendorType } of allBills) {
        const month = bill.billMonth?.substring(0, 7) || "unknown";
        const entry = monthlyMap.get(month);
        if (!entry) continue;

        const usdAmount = bill.billType === "pass_through"
          ? parseFloat(bill.settlementAmountUsd || "0")
          : parseFloat(bill.totalAmount || "0");

        switch (bill.billType) {
          case "service_fee":
            entry.vendorServiceFees += usdAmount;
            break;
          case "bank_charge":
            entry.bankCharges += usdAmount;
            break;
          case "pass_through":
            // Gross margin = recurring revenue - actual employment cost
            entry.grossMargin -= usdAmount; // will add revenue side below
            break;
          default:
            if (vendorType === "equipment_provider" || vendorType === "hr_recruitment") {
              entry.nonRecurringCost += usdAmount;
            } else if (bill.category === "penalty" || bill.category === "late_payment_fee") {
              entry.penalties += usdAmount;
            } else {
              entry.otherOpex += usdAmount;
            }
        }
      }

      // Calculate monthly P&L
      for (const entry of Array.from(monthlyMap.values())) {
        entry.grossMargin += entry.recurringInvoiceRevenue; // revenue - cost (cost was subtracted above)
        entry.coreOperatingProfit = entry.serviceFeeRevenue + entry.fxMarkupRevenue - entry.vendorServiceFees - entry.bankCharges;
        entry.nonRecurringMargin = entry.nonRecurringRevenue - entry.nonRecurringCost;
        entry.netProfit = entry.coreOperatingProfit + entry.nonRecurringMargin - entry.penalties - entry.otherOpex;
      }

      const monthlyBreakdown = Array.from(monthlyMap.values()).map((e) => ({
        month: e.month,
        grossInvoiceTotal: round2(e.grossInvoiceTotal),
        recurringInvoiceRevenue: round2(e.recurringInvoiceRevenue),
        serviceFeeRevenue: round2(e.serviceFeeRevenue),
        fxMarkupRevenue: round2(e.fxMarkupRevenue),
        grossMargin: round2(e.grossMargin),
        vendorServiceFees: round2(e.vendorServiceFees),
        bankCharges: round2(e.bankCharges),
        coreOperatingProfit: round2(e.coreOperatingProfit),
        nonRecurringRevenue: round2(e.nonRecurringRevenue),
        nonRecurringCost: round2(e.nonRecurringCost),
        nonRecurringMargin: round2(e.nonRecurringMargin),
        penalties: round2(e.penalties),
        otherOpex: round2(e.otherOpex),
        netProfit: round2(e.netProfit),
        invoiceCount: e.invoiceCount,
        // Legacy fields for backward compatibility
        passThroughCost: round2(e.passThroughCost),
        totalNetRevenue: round2(e.totalNetRevenue),
      }));

      // ── By Customer ──
      const customerMap = new Map<number, {
        customerId: number;
        customerName: string;
        grossInvoiceTotal: number;
        passThroughCost: number;
        fxMarkupRevenue: number;
        serviceFeeRevenue: number;
        totalNetRevenue: number;
        invoiceCount: number;
      }>();

      const customerIds = Array.from(new Set(recurringBreakdowns.map((b) => b.customerId)));
      const customerNames = new Map<number, string>();
      if (customerIds.length > 0) {
        const custs = await db
          .select({ id: customersTable.id, name: customersTable.companyName })
          .from(customersTable)
          .where(inArray(customersTable.id, customerIds));
        custs.forEach((c) => customerNames.set(c.id, c.name));
      }

      for (const bd of recurringBreakdowns) {
        const existing = customerMap.get(bd.customerId) || {
          customerId: bd.customerId,
          customerName: customerNames.get(bd.customerId) || "Unknown",
          grossInvoiceTotal: 0,
          passThroughCost: 0,
          fxMarkupRevenue: 0,
          serviceFeeRevenue: 0,
          totalNetRevenue: 0,
          invoiceCount: 0,
        };
        existing.grossInvoiceTotal += bd.invoiceTotal;
        existing.passThroughCost += bd.passThroughCostUsd;
        existing.fxMarkupRevenue += bd.fxMarkupRevenue;
        existing.serviceFeeRevenue += bd.serviceFeeRevenue;
        existing.totalNetRevenue += bd.totalNetRevenue;
        existing.invoiceCount += 1;
        customerMap.set(bd.customerId, existing);
      }

      const byCustomer = Array.from(customerMap.values())
        .map((c) => ({
          ...c,
          grossInvoiceTotal: round2(c.grossInvoiceTotal),
          passThroughCost: round2(c.passThroughCost),
          fxMarkupRevenue: round2(c.fxMarkupRevenue),
          serviceFeeRevenue: round2(c.serviceFeeRevenue),
          totalNetRevenue: round2(c.totalNetRevenue),
        }))
        .sort((a, b) => b.totalNetRevenue - a.totalNetRevenue);

      // ── By Channel Partner ──
      const cpMap = new Map<number | null, {
        channelPartnerId: number | null;
        channelPartnerName: string;
        grossInvoiceTotal: number;
        passThroughCost: number;
        fxMarkupRevenue: number;
        serviceFeeRevenue: number;
        totalNetRevenue: number;
        invoiceCount: number;
      }>();

      const cpIds = Array.from(new Set(recurringBreakdowns.filter((b) => b.channelPartnerId).map((b) => b.channelPartnerId!)));
      const cpNames = new Map<number, string>();
      if (cpIds.length > 0) {
        const cps = await db
          .select({ id: cpTable.id, name: cpTable.companyName })
          .from(cpTable)
          .where(inArray(cpTable.id, cpIds));
        cps.forEach((c) => cpNames.set(c.id, c.name));
      }

      for (const bd of recurringBreakdowns) {
        const cpId = bd.channelPartnerId;
        const existing = cpMap.get(cpId) || {
          channelPartnerId: cpId,
          channelPartnerName: cpId ? (cpNames.get(cpId) || "Unknown CP") : "EG Direct",
          grossInvoiceTotal: 0,
          passThroughCost: 0,
          fxMarkupRevenue: 0,
          serviceFeeRevenue: 0,
          totalNetRevenue: 0,
          invoiceCount: 0,
        };
        existing.grossInvoiceTotal += bd.invoiceTotal;
        existing.passThroughCost += bd.passThroughCostUsd;
        existing.fxMarkupRevenue += bd.fxMarkupRevenue;
        existing.serviceFeeRevenue += bd.serviceFeeRevenue;
        existing.totalNetRevenue += bd.totalNetRevenue;
        existing.invoiceCount += 1;
        cpMap.set(cpId, existing);
      }

      const byChannelPartner = Array.from(cpMap.values())
        .map((c) => ({
          ...c,
          grossInvoiceTotal: round2(c.grossInvoiceTotal),
          passThroughCost: round2(c.passThroughCost),
          fxMarkupRevenue: round2(c.fxMarkupRevenue),
          serviceFeeRevenue: round2(c.serviceFeeRevenue),
          totalNetRevenue: round2(c.totalNetRevenue),
        }))
        .sort((a, b) => b.totalNetRevenue - a.totalNetRevenue);

      // ── By Country ──
      const countryMap = new Map<string, {
        countryCode: string;
        grossInvoiceTotal: number;
        passThroughCost: number;
        fxMarkupRevenue: number;
        serviceFeeRevenue: number;
        totalNetRevenue: number;
        invoiceCount: number;
      }>();

      for (const bd of recurringBreakdowns) {
        const country = bd.localCurrency || bd.currency || "USD";
        const existing = countryMap.get(country) || {
          countryCode: country,
          grossInvoiceTotal: 0,
          passThroughCost: 0,
          fxMarkupRevenue: 0,
          serviceFeeRevenue: 0,
          totalNetRevenue: 0,
          invoiceCount: 0,
        };
        existing.grossInvoiceTotal += bd.invoiceTotal;
        existing.passThroughCost += bd.passThroughCostUsd;
        existing.fxMarkupRevenue += bd.fxMarkupRevenue;
        existing.serviceFeeRevenue += bd.serviceFeeRevenue;
        existing.totalNetRevenue += bd.totalNetRevenue;
        existing.invoiceCount += 1;
        countryMap.set(country, existing);
      }

      const byCountry = Array.from(countryMap.values())
        .map((c) => ({
          ...c,
          grossInvoiceTotal: round2(c.grossInvoiceTotal),
          passThroughCost: round2(c.passThroughCost),
          fxMarkupRevenue: round2(c.fxMarkupRevenue),
          serviceFeeRevenue: round2(c.serviceFeeRevenue),
          totalNetRevenue: round2(c.totalNetRevenue),
        }))
        .sort((a, b) => b.totalNetRevenue - a.totalNetRevenue);

      // ── By Invoice Layer ──
      const layerMap = new Map<string, {
        layer: string;
        grossInvoiceTotal: number;
        passThroughCost: number;
        fxMarkupRevenue: number;
        serviceFeeRevenue: number;
        totalNetRevenue: number;
        invoiceCount: number;
      }>();

      for (const bd of recurringBreakdowns) {
        const layer = bd.invoiceLayer;
        const existing = layerMap.get(layer) || {
          layer,
          grossInvoiceTotal: 0,
          passThroughCost: 0,
          fxMarkupRevenue: 0,
          serviceFeeRevenue: 0,
          totalNetRevenue: 0,
          invoiceCount: 0,
        };
        existing.grossInvoiceTotal += bd.invoiceTotal;
        existing.passThroughCost += bd.passThroughCostUsd;
        existing.fxMarkupRevenue += bd.fxMarkupRevenue;
        existing.serviceFeeRevenue += bd.serviceFeeRevenue;
        existing.totalNetRevenue += bd.totalNetRevenue;
        existing.invoiceCount += 1;
        layerMap.set(layer, existing);
      }

      const byInvoiceLayer = Array.from(layerMap.values())
        .map((l) => ({
          ...l,
          grossInvoiceTotal: round2(l.grossInvoiceTotal),
          passThroughCost: round2(l.passThroughCost),
          fxMarkupRevenue: round2(l.fxMarkupRevenue),
          serviceFeeRevenue: round2(l.serviceFeeRevenue),
          totalNetRevenue: round2(l.totalNetRevenue),
        }));

      return {
        summary: {
          grossInvoiceTotal: round2(grossInvoiceTotal),
          recurringInvoiceRevenue: round2(recurringInvoiceRevenue),
          serviceFeeRevenue: round2(totalServiceFeeRevenue),
          fxMarkupRevenue: round2(fxMarkupRevenue),
          actualEmploymentCostUsd: round2(actualEmploymentCostUsd),
          grossMargin: round2(grossMargin),
          totalRecurringRevenue: round2(totalRecurringRevenue),
          vendorServiceFees: round2(vendorServiceFees),
          bankCharges: round2(bankCharges),
          coreOperatingProfit: round2(coreOperatingProfit),
          nonRecurringInvoiceRevenue: round2(nonRecurringInvoiceRevenue),
          nonRecurringVendorCost: round2(nonRecurringVendorCost),
          nonRecurringMargin: round2(nonRecurringMargin),
          penalties: round2(penalties),
          otherOperationalCosts: round2(otherOperationalCosts),
          totalOtherExpenses: round2(totalOtherExpenses),
          netProfit: round2(netProfit),
          netProfitMargin: round2(netProfitMargin),
          // Legacy fields for backward compatibility
          passThroughCost: round2(totalPassThrough),
          totalNetRevenue: round2(totalRecurringRevenue),
          unallocatedCosts: 0,
          totalOperatingExpenses: round2(totalOperatingExpenses),
        },
        monthlyBreakdown,
        byCustomer,
        byChannelPartner,
        byCountry,
        byInvoiceLayer,
        fxReconciliation: fxReconciliation.sort((a, b) => {
          if (a.month !== b.month) return a.month.localeCompare(b.month);
          return a.countryCode.localeCompare(b.countryCode);
        }),
      };
    }),
});
