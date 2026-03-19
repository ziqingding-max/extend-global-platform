/**
 * CP Portal Dashboard Router (Task Group E)
 *
 * Provides profit analytics for the CP Dashboard:
 * - L2 Revenue (CP→Client invoices)
 * - L1 Cost (EG→CP invoices)
 * - Gross Profit = L2 Revenue - L1 Cost
 * - Margin %
 * - Monthly trend data
 *
 * All data is scoped to the authenticated CP's channelPartnerId.
 */

import { z } from "zod";
import { eq, and, inArray, sql, count } from "drizzle-orm";
import {
  protectedCpProcedure,
  cpFinanceProcedure,
  cpPortalRouter,
} from "../cpPortalTrpc";
import { getDb } from "../../db";
import {
  invoices,
  customers,
  employees,
} from "../../../drizzle/schema";

export const cpPortalDashboardRouter = cpPortalRouter({
  /**
   * Profit overview — L2 revenue, L1 cost, gross profit, margin.
   */
  profitOverview: cpFinanceProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) {
      return {
        l2Revenue: 0,
        l1Cost: 0,
        grossProfit: 0,
        marginPercent: 0,
        l2RevenueThisMonth: 0,
        l1CostThisMonth: 0,
        grossProfitThisMonth: 0,
      };
    }

    const cpId = ctx.cpUser.channelPartnerId;

    // Get all invoices for this CP
    const allInvoices = await db
      .select({
        invoiceLayer: invoices.invoiceLayer,
        total: invoices.total,
        status: invoices.status,
        invoiceMonth: invoices.invoiceMonth,
        paidDate: invoices.paidDate,
      })
      .from(invoices)
      .where(eq(invoices.channelPartnerId, cpId));

    // Current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let l2Revenue = 0;
    let l1Cost = 0;
    let l2RevenueThisMonth = 0;
    let l1CostThisMonth = 0;

    for (const inv of allInvoices) {
      const amount = parseFloat(inv.total || "0");
      const isPaid = inv.status === "paid" || inv.status === "partially_paid";
      const month = inv.invoiceMonth?.slice(0, 7) || "";

      if (inv.invoiceLayer === "cp_to_client" && isPaid) {
        l2Revenue += amount;
        if (month === currentMonth) l2RevenueThisMonth += amount;
      } else if (inv.invoiceLayer === "eg_to_cp" && isPaid) {
        l1Cost += amount;
        if (month === currentMonth) l1CostThisMonth += amount;
      }
    }

    const grossProfit = l2Revenue - l1Cost;
    const marginPercent = l2Revenue > 0 ? (grossProfit / l2Revenue) * 100 : 0;
    const grossProfitThisMonth = l2RevenueThisMonth - l1CostThisMonth;

    return {
      l2Revenue: Math.round(l2Revenue * 100) / 100,
      l1Cost: Math.round(l1Cost * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      marginPercent: Math.round(marginPercent * 10) / 10,
      l2RevenueThisMonth: Math.round(l2RevenueThisMonth * 100) / 100,
      l1CostThisMonth: Math.round(l1CostThisMonth * 100) / 100,
      grossProfitThisMonth: Math.round(grossProfitThisMonth * 100) / 100,
    };
  }),

  /**
   * Monthly trend data for profit chart.
   * Returns last 12 months of L1 cost, L2 revenue, and gross profit.
   */
  monthlyTrend: cpFinanceProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { months: [] };

    const cpId = ctx.cpUser.channelPartnerId;

    // Get all paid invoices for this CP
    const paidInvoices = await db
      .select({
        invoiceLayer: invoices.invoiceLayer,
        total: invoices.total,
        invoiceMonth: invoices.invoiceMonth,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.channelPartnerId, cpId),
          // Only paid invoices
          sql`${invoices.status} IN ('paid', 'partially_paid')`
        )
      );

    // Build monthly aggregation for last 12 months
    const now = new Date();
    const months: Array<{
      month: string;
      l2Revenue: number;
      l1Cost: number;
      grossProfit: number;
    }> = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ month: monthKey, l2Revenue: 0, l1Cost: 0, grossProfit: 0 });
    }

    const monthMap = new Map(months.map((m) => [m.month, m]));

    for (const inv of paidInvoices) {
      const monthKey = inv.invoiceMonth?.slice(0, 7) || "";
      const entry = monthMap.get(monthKey);
      if (!entry) continue;

      const amount = parseFloat(inv.total || "0");
      if (inv.invoiceLayer === "cp_to_client") {
        entry.l2Revenue += amount;
      } else if (inv.invoiceLayer === "eg_to_cp") {
        entry.l1Cost += amount;
      }
    }

    // Calculate gross profit
    months.forEach((m) => {
      m.l2Revenue = Math.round(m.l2Revenue * 100) / 100;
      m.l1Cost = Math.round(m.l1Cost * 100) / 100;
      m.grossProfit = Math.round((m.l2Revenue - m.l1Cost) * 100) / 100;
    });

    return { months };
  }),

  /**
   * Quick stats for the dashboard header.
   */
  quickStats: protectedCpProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) {
      return {
        totalClients: 0,
        activeEmployees: 0,
        pendingInvoices: 0,
        overdueInvoices: 0,
      };
    }

    const cpId = ctx.cpUser.channelPartnerId;

    const [clientCount, empCount, pendingInv, overdueInv] = await Promise.all([
      db
        .select({ total: count() })
        .from(customers)
        .where(eq(customers.channelPartnerId, cpId)),
      db
        .select({ total: count() })
        .from(employees)
        .where(
          and(
            eq(employees.channelPartnerId, cpId),
            sql`${employees.status} IN ('active', 'on_leave')`
          )
        ),
      db
        .select({ total: count() })
        .from(invoices)
        .where(
          and(
            eq(invoices.channelPartnerId, cpId),
            eq(invoices.invoiceLayer, "cp_to_client"),
            eq(invoices.status, "sent")
          )
        ),
      db
        .select({ total: count() })
        .from(invoices)
        .where(
          and(
            eq(invoices.channelPartnerId, cpId),
            eq(invoices.invoiceLayer, "cp_to_client"),
            eq(invoices.status, "overdue")
          )
        ),
    ]);

    return {
      totalClients: clientCount[0]?.total ?? 0,
      activeEmployees: empCount[0]?.total ?? 0,
      pendingInvoices: pendingInv[0]?.total ?? 0,
      overdueInvoices: overdueInv[0]?.total ?? 0,
    };
  }),
});
