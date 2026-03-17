/**
 * Net P&L Report Router
 *
 * Provides a comprehensive net-revenue P&L report that separates:
 *   1. Pass-through costs (employment costs at mid-market FX rate — not EG revenue)
 *   2. FX markup revenue (difference between client rate and mid-market rate)
 *   3. Service fee revenue (EG management/processing fees)
 *   4. Vendor service fees (accounting firm fees — EG operating expense)
 *   5. Bank charges (wire fees — financial expense)
 *   6. Unallocated vendor costs (operational overhead)
 *
 * Multi-dimensional breakdowns:
 *   - By month (time series)
 *   - By customer
 *   - By channel partner
 *   - By country
 *   - By invoice layer (eg_to_cp vs legacy)
 *
 * This replaces the legacy gross P&L which treated total invoice amount as revenue.
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure } from "../procedures";
import { getDb } from "../db";
import {
  invoices as invoicesTable,
  vendorBills as vendorBillsTable,
  vendors as vendorsTable,
  customers as customersTable,
  channelPartners as cpTable,
  employees as employeesTable,
  billInvoiceAllocations,
} from "../../drizzle/schema";
import { eq, and, sql, inArray, count } from "drizzle-orm";
import { calculateFxBreakdown } from "../services/fxStrippingEngine";

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
      if (!db) {
        return {
          summary: {
            grossInvoiceTotal: 0,
            passThroughCost: 0,
            fxMarkupRevenue: 0,
            serviceFeeRevenue: 0,
            totalNetRevenue: 0,
            vendorServiceFees: 0,
            bankCharges: 0,
            unallocatedCosts: 0,
            totalOperatingExpenses: 0,
            netProfit: 0,
            netProfitMargin: 0,
          },
          monthlyBreakdown: [],
          byCustomer: [],
          byChannelPartner: [],
          byCountry: [],
          byInvoiceLayer: [],
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

      // Calculate FX breakdown for each invoice
      const breakdowns = allInvoices.map(calculateFxBreakdown);

      // ── Get vendor bills (expenses) ──
      const billConditions = [
        sql`${vendorBillsTable.billMonth} >= ${globalStart}`,
        sql`${vendorBillsTable.billMonth} < ${globalEnd}`,
        inArray(vendorBillsTable.status, ["paid", "approved", "partially_paid"]),
      ];

      const allBills = await db
        .select()
        .from(vendorBillsTable)
        .where(and(...billConditions));

      // Categorize vendor bills
      let vendorServiceFees = 0;
      let bankCharges = 0;
      let passThroughBillCosts = 0;
      let otherOperationalCosts = 0;

      for (const bill of allBills) {
        const amount = parseFloat(bill.totalAmount);
        switch (bill.billType) {
          case "service_fee":
            vendorServiceFees += amount;
            break;
          case "bank_charge":
            bankCharges += amount;
            break;
          case "pass_through":
            passThroughBillCosts += amount;
            break;
          default:
            otherOperationalCosts += amount;
        }
      }

      // Unallocated costs
      const unallocatedCosts = allBills.reduce(
        (sum, b) => sum + parseFloat(b.unallocatedAmount || "0"),
        0
      );

      // ── Aggregate summary ──
      let grossInvoiceTotal = 0;
      let totalPassThrough = 0;
      let totalFxMarkupRevenue = 0;
      let totalServiceFeeRevenue = 0;

      for (const bd of breakdowns) {
        grossInvoiceTotal += bd.invoiceTotal;
        totalPassThrough += bd.passThroughCostUsd;
        totalFxMarkupRevenue += bd.fxMarkupRevenue;
        totalServiceFeeRevenue += bd.serviceFeeRevenue;
      }

      const totalNetRevenue = totalFxMarkupRevenue + totalServiceFeeRevenue;
      const totalOperatingExpenses = vendorServiceFees + bankCharges;
      const netProfit = totalNetRevenue - totalOperatingExpenses;
      const netProfitMargin = totalNetRevenue > 0 ? (netProfit / totalNetRevenue) * 100 : 0;

      // ── Monthly breakdown ──
      const monthlyMap = new Map<string, {
        month: string;
        grossInvoiceTotal: number;
        passThroughCost: number;
        fxMarkupRevenue: number;
        serviceFeeRevenue: number;
        totalNetRevenue: number;
        vendorServiceFees: number;
        bankCharges: number;
        netProfit: number;
        invoiceCount: number;
      }>();

      for (const m of months) {
        monthlyMap.set(m, {
          month: m,
          grossInvoiceTotal: 0,
          passThroughCost: 0,
          fxMarkupRevenue: 0,
          serviceFeeRevenue: 0,
          totalNetRevenue: 0,
          vendorServiceFees: 0,
          bankCharges: 0,
          netProfit: 0,
          invoiceCount: 0,
        });
      }

      for (const bd of breakdowns) {
        const month = bd.invoiceMonth?.substring(0, 7) || "unknown";
        const entry = monthlyMap.get(month);
        if (entry) {
          entry.grossInvoiceTotal += bd.invoiceTotal;
          entry.passThroughCost += bd.passThroughCostUsd;
          entry.fxMarkupRevenue += bd.fxMarkupRevenue;
          entry.serviceFeeRevenue += bd.serviceFeeRevenue;
          entry.totalNetRevenue += bd.totalNetRevenue;
          entry.invoiceCount += 1;
        }
      }

      // Add bill expenses to monthly breakdown
      for (const bill of allBills) {
        const month = bill.billMonth?.substring(0, 7) || "unknown";
        const entry = monthlyMap.get(month);
        if (entry) {
          const amount = parseFloat(bill.totalAmount);
          if (bill.billType === "service_fee") entry.vendorServiceFees += amount;
          if (bill.billType === "bank_charge") entry.bankCharges += amount;
        }
      }

      // Calculate net profit per month
      for (const entry of Array.from(monthlyMap.values())) {
        entry.netProfit = entry.totalNetRevenue - entry.vendorServiceFees - entry.bankCharges;
      }

      const monthlyBreakdown = Array.from(monthlyMap.values()).map((e) => ({
        ...e,
        grossInvoiceTotal: Math.round(e.grossInvoiceTotal * 100) / 100,
        passThroughCost: Math.round(e.passThroughCost * 100) / 100,
        fxMarkupRevenue: Math.round(e.fxMarkupRevenue * 100) / 100,
        serviceFeeRevenue: Math.round(e.serviceFeeRevenue * 100) / 100,
        totalNetRevenue: Math.round(e.totalNetRevenue * 100) / 100,
        vendorServiceFees: Math.round(e.vendorServiceFees * 100) / 100,
        bankCharges: Math.round(e.bankCharges * 100) / 100,
        netProfit: Math.round(e.netProfit * 100) / 100,
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

      // Get customer names
      const customerIds = Array.from(new Set(breakdowns.map((b) => b.customerId)));
      const customerNames = new Map<number, string>();
      if (customerIds.length > 0) {
        const custs = await db
          .select({ id: customersTable.id, name: customersTable.companyName })
          .from(customersTable)
          .where(inArray(customersTable.id, customerIds));
        custs.forEach((c) => customerNames.set(c.id, c.name));
      }

      for (const bd of breakdowns) {
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
          grossInvoiceTotal: Math.round(c.grossInvoiceTotal * 100) / 100,
          passThroughCost: Math.round(c.passThroughCost * 100) / 100,
          fxMarkupRevenue: Math.round(c.fxMarkupRevenue * 100) / 100,
          serviceFeeRevenue: Math.round(c.serviceFeeRevenue * 100) / 100,
          totalNetRevenue: Math.round(c.totalNetRevenue * 100) / 100,
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

      // Get CP names
      const cpIds = Array.from(new Set(breakdowns.filter((b) => b.channelPartnerId).map((b) => b.channelPartnerId!)));
      const cpNames = new Map<number, string>();
      if (cpIds.length > 0) {
        const cps = await db
          .select({ id: cpTable.id, name: cpTable.companyName })
          .from(cpTable)
          .where(inArray(cpTable.id, cpIds));
        cps.forEach((c) => cpNames.set(c.id, c.name));
      }

      for (const bd of breakdowns) {
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
          grossInvoiceTotal: Math.round(c.grossInvoiceTotal * 100) / 100,
          passThroughCost: Math.round(c.passThroughCost * 100) / 100,
          fxMarkupRevenue: Math.round(c.fxMarkupRevenue * 100) / 100,
          serviceFeeRevenue: Math.round(c.serviceFeeRevenue * 100) / 100,
          totalNetRevenue: Math.round(c.totalNetRevenue * 100) / 100,
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

      for (const bd of breakdowns) {
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
          grossInvoiceTotal: Math.round(c.grossInvoiceTotal * 100) / 100,
          passThroughCost: Math.round(c.passThroughCost * 100) / 100,
          fxMarkupRevenue: Math.round(c.fxMarkupRevenue * 100) / 100,
          serviceFeeRevenue: Math.round(c.serviceFeeRevenue * 100) / 100,
          totalNetRevenue: Math.round(c.totalNetRevenue * 100) / 100,
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

      for (const bd of breakdowns) {
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
          grossInvoiceTotal: Math.round(l.grossInvoiceTotal * 100) / 100,
          passThroughCost: Math.round(l.passThroughCost * 100) / 100,
          fxMarkupRevenue: Math.round(l.fxMarkupRevenue * 100) / 100,
          serviceFeeRevenue: Math.round(l.serviceFeeRevenue * 100) / 100,
          totalNetRevenue: Math.round(l.totalNetRevenue * 100) / 100,
        }));

      return {
        summary: {
          grossInvoiceTotal: Math.round(grossInvoiceTotal * 100) / 100,
          passThroughCost: Math.round(totalPassThrough * 100) / 100,
          fxMarkupRevenue: Math.round(totalFxMarkupRevenue * 100) / 100,
          serviceFeeRevenue: Math.round(totalServiceFeeRevenue * 100) / 100,
          totalNetRevenue: Math.round(totalNetRevenue * 100) / 100,
          vendorServiceFees: Math.round(vendorServiceFees * 100) / 100,
          bankCharges: Math.round(bankCharges * 100) / 100,
          unallocatedCosts: Math.round(unallocatedCosts * 100) / 100,
          totalOperatingExpenses: Math.round(totalOperatingExpenses * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100,
          netProfitMargin: Math.round(netProfitMargin * 100) / 100,
        },
        monthlyBreakdown,
        byCustomer,
        byChannelPartner,
        byCountry,
        byInvoiceLayer,
      };
    }),
});
