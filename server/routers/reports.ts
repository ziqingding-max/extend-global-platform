import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure } from "../procedures";
import { getDb } from "../db";
import {
  invoices as invoicesTable,
  vendorBills as vendorBillsTable,
  vendors as vendorsTable,
  customers as customersTable,
  billInvoiceAllocations,
  employees as employeesTable,
} from "../../drizzle/schema";
import { eq, and, sql, gte, lt, inArray, count } from "drizzle-orm";

/**
 * Helper: get last N months as "YYYY-MM" strings
 */
function getLastNMonths(n: number, fromDate?: Date): string[] {
  const d = fromDate ? new Date(fromDate) : new Date();
  const months: string[] = [];
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    months.unshift(`${y}-${String(m).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}

export const reportsRouter = router({
  /**
   * Profit & Loss Report
   * Aggregates revenue (from invoices) and expenses (from vendor_bills) by month.
   */
  profitAndLoss: financeManagerProcedure
    .input(
      z.object({
        startMonth: z.string().optional(), // YYYY-MM
        endMonth: z.string().optional(), // YYYY-MM
        months: z.number().default(12), // Default last 12 months
        currency: z.string().default("USD"), // Reporting currency
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          summary: {
            totalRevenue: 0,
            totalExpenses: 0,
            netProfit: 0,
            profitMargin: 0,
          },
          monthlyBreakdown: [] as {
            month: string;
            revenue: number;
            expenses: number;
            netProfit: number;
            invoiceCount: number;
            billCount: number;
          }[],
          revenueByType: [] as { type: string; amount: number }[],
          expensesByCategory: [] as { category: string; amount: number }[],
          expensesByVendor: [] as { vendorId: number; vendorName: string; amount: number }[],
          revenueByCustomer: [] as { customerId: number; customerName: string; amount: number }[],
        };
      }

      // Determine month range
      let months: string[];
      if (input.startMonth && input.endMonth) {
        months = [];
        const [sy, sm] = input.startMonth.split("-").map(Number);
        const [ey, em] = input.endMonth.split("-").map(Number);
        let cy = sy, cm = sm;
        while (cy < ey || (cy === ey && cm <= em)) {
          months.push(`${cy}-${String(cm).padStart(2, "0")}`);
          cm++;
          if (cm > 12) { cm = 1; cy++; }
        }
      } else {
        months = getLastNMonths(input.months);
      }

      const monthlyBreakdown: {
        month: string;
        revenue: number;
        expenses: number;
        netProfit: number;
        invoiceCount: number;
        billCount: number;
      }[] = [];

      let totalRevenue = 0;
      let totalExpenses = 0;

      for (const m of months) {
        const [y, mo] = m.split("-").map(Number);
        const monthStart = `${m}-01`;
        const nextMonth = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;

        // ── Revenue: sum of paid invoices (excluding deposits & deposit refunds) ──
        // Credit notes have negative totals, so they naturally reduce revenue
        const revenueResult = await db
          .select({
            total: sql<string>`COALESCE(SUM(${invoicesTable.total}), 0)`,
            cnt: count(),
          })
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.status, "paid"),
              sql`${invoicesTable.invoiceMonth} >= ${monthStart}`,
              sql`${invoicesTable.invoiceMonth} < ${nextMonth}`,
              // Exclude deposit & deposit_refund — they are not revenue
              sql`${invoicesTable.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`
            )
          );

        const monthRevenue = parseFloat(revenueResult[0]?.total ?? "0");
        const invoiceCount = revenueResult[0]?.cnt ?? 0;

        // ── Expenses: sum of paid/approved vendor bills ──
        const expenseResult = await db
          .select({
            total: sql<string>`COALESCE(SUM(${vendorBillsTable.totalAmount}), 0)`,
            cnt: count(),
          })
          .from(vendorBillsTable)
          .where(
            and(
              inArray(vendorBillsTable.status, ["paid", "approved", "partially_paid"]),
              sql`${vendorBillsTable.billMonth} >= ${monthStart}`,
              sql`${vendorBillsTable.billMonth} < ${nextMonth}`
            )
          );

        const monthExpenses = parseFloat(expenseResult[0]?.total ?? "0");
        const billCount = expenseResult[0]?.cnt ?? 0;

        const netProfit = monthRevenue - monthExpenses;

        monthlyBreakdown.push({
          month: m,
          revenue: Math.round(monthRevenue * 100) / 100,
          expenses: Math.round(monthExpenses * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100,
          invoiceCount,
          billCount,
        });

        totalRevenue += monthRevenue;
        totalExpenses += monthExpenses;
      }

      const netProfit = totalRevenue - totalExpenses;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      // ── Revenue breakdown by invoice type ──
      const globalStart = `${months[0]}-01`;
      const lastMonth = months[months.length - 1].split("-").map(Number);
      const globalEnd = lastMonth[1] === 12
        ? `${lastMonth[0] + 1}-01-01`
        : `${lastMonth[0]}-${String(lastMonth[1] + 1).padStart(2, "0")}-01`;

      const revenueByTypeResult = await db
        .select({
          type: invoicesTable.invoiceType,
          amount: sql<string>`COALESCE(SUM(${invoicesTable.total}), 0)`,
        })
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.status, "paid"),
            sql`${invoicesTable.invoiceMonth} >= ${globalStart}`,
            sql`${invoicesTable.invoiceMonth} < ${globalEnd}`,
            sql`${invoicesTable.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`
          )
        )
        .groupBy(invoicesTable.invoiceType);

      // ── Expense breakdown by category ──
      const expensesByCategoryResult = await db
        .select({
          category: vendorBillsTable.category,
          amount: sql<string>`COALESCE(SUM(${vendorBillsTable.totalAmount}), 0)`,
        })
        .from(vendorBillsTable)
        .where(
          and(
            inArray(vendorBillsTable.status, ["paid", "approved", "partially_paid"]),
            sql`${vendorBillsTable.billMonth} >= ${globalStart}`,
            sql`${vendorBillsTable.billMonth} < ${globalEnd}`
          )
        )
        .groupBy(vendorBillsTable.category);

      // ── Expense breakdown by vendor ──
      const expensesByVendorResult = await db
        .select({
          vendorId: vendorBillsTable.vendorId,
          vendorName: vendorsTable.name,
          amount: sql<string>`COALESCE(SUM(${vendorBillsTable.totalAmount}), 0)`,
        })
        .from(vendorBillsTable)
        .innerJoin(vendorsTable, eq(vendorBillsTable.vendorId, vendorsTable.id))
        .where(
          and(
            inArray(vendorBillsTable.status, ["paid", "approved", "partially_paid"]),
            sql`${vendorBillsTable.billMonth} >= ${globalStart}`,
            sql`${vendorBillsTable.billMonth} < ${globalEnd}`
          )
        )
        .groupBy(vendorBillsTable.vendorId, vendorsTable.name);

      // ── Revenue breakdown by customer ──
      const revenueByCustomerResult = await db
        .select({
          customerId: invoicesTable.customerId,
          customerName: customersTable.companyName,
          amount: sql<string>`COALESCE(SUM(${invoicesTable.total}), 0)`,
        })
        .from(invoicesTable)
        .innerJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
        .where(
          and(
            eq(invoicesTable.status, "paid"),
            sql`${invoicesTable.invoiceMonth} >= ${globalStart}`,
            sql`${invoicesTable.invoiceMonth} < ${globalEnd}`,
            sql`${invoicesTable.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`
          )
        )
        .groupBy(invoicesTable.customerId, customersTable.companyName);

      // ── Customer Profit Analysis (via allocations) ──
      const customerProfitResult = await db
        .select({
          customerId: invoicesTable.customerId,
          customerName: customersTable.companyName,
          revenue: sql<string>`COALESCE(SUM(DISTINCT ${invoicesTable.total}), 0)`,
          costAllocated: sql<string>`COALESCE(SUM(${billInvoiceAllocations.allocatedAmount}), 0)`,
        })
        .from(invoicesTable)
        .innerJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
        .leftJoin(billInvoiceAllocations, eq(billInvoiceAllocations.invoiceId, invoicesTable.id))
        .where(
          and(
            eq(invoicesTable.status, "paid"),
            sql`${invoicesTable.invoiceMonth} >= ${globalStart}`,
            sql`${invoicesTable.invoiceMonth} < ${globalEnd}`,
            sql`${invoicesTable.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`
          )
        )
        .groupBy(invoicesTable.customerId, customersTable.companyName);

      // ── Unallocated expenses (operational costs) ──
      const unallocatedResult = await db
        .select({
          total: sql<string>`COALESCE(SUM(${vendorBillsTable.unallocatedAmount}), 0)`,
        })
        .from(vendorBillsTable)
        .where(
          and(
            inArray(vendorBillsTable.status, ["paid", "approved", "partially_paid"]),
            sql`${vendorBillsTable.billMonth} >= ${globalStart}`,
            sql`${vendorBillsTable.billMonth} < ${globalEnd}`
          )
        );

      const totalUnallocated = Math.round(parseFloat(unallocatedResult[0]?.total ?? "0") * 100) / 100;

      return {
        summary: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalExpenses: Math.round(totalExpenses * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100,
          profitMargin: Math.round(profitMargin * 100) / 100,
          totalUnallocated,
        },
        monthlyBreakdown,
        revenueByType: revenueByTypeResult.map((r) => ({
          type: r.type || "unknown",
          amount: Math.round(parseFloat(r.amount) * 100) / 100,
        })),
        expensesByCategory: expensesByCategoryResult.map((r) => ({
          category: r.category || "other",
          amount: Math.round(parseFloat(r.amount) * 100) / 100,
        })),
        expensesByVendor: expensesByVendorResult.map((r) => ({
          vendorId: r.vendorId,
          vendorName: r.vendorName || "Unknown",
          amount: Math.round(parseFloat(r.amount) * 100) / 100,
        })),
        revenueByCustomer: revenueByCustomerResult.map((r) => ({
          customerId: r.customerId,
          customerName: r.customerName || "Unknown",
          amount: Math.round(parseFloat(r.amount) * 100) / 100,
        })),
        customerProfit: customerProfitResult.map((r) => {
          const rev = Math.round(parseFloat(r.revenue) * 100) / 100;
          const cost = Math.round(parseFloat(r.costAllocated) * 100) / 100;
          const profit = Math.round((rev - cost) * 100) / 100;
          const margin = rev > 0 ? Math.round((profit / rev) * 10000) / 100 : 0;
          return {
            customerId: r.customerId,
            customerName: r.customerName || "Unknown",
            revenue: rev,
            costAllocated: cost,
            profit,
            margin,
            isLoss: profit < 0,
          };
        }).sort((a, b) => b.revenue - a.revenue),
      };
    }),

  /**
   * Quick financial summary for dashboard integration
   */
  financialSummary: financeManagerProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        currentMonthRevenue: 0,
        currentMonthExpenses: 0,
        currentMonthProfit: 0,
        previousMonthRevenue: 0,
        previousMonthExpenses: 0,
        previousMonthProfit: 0,
        totalOutstandingBills: 0,
        totalOutstandingInvoices: 0,
      };
    }

    const now = new Date();
    const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonthStart = now.getMonth() === 11
      ? `${now.getFullYear() + 1}-01-01`
      : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, "0")}-01`;

    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-01`;

    // Current month revenue
    const [curRevenue] = await db
      .select({ total: sql<string>`COALESCE(SUM(${invoicesTable.total}), 0)` })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.status, "paid"),
          sql`${invoicesTable.invoiceMonth} >= ${currentMonthStart}`,
          sql`${invoicesTable.invoiceMonth} < ${nextMonthStart}`,
          sql`${invoicesTable.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`
        )
      );

    // Current month expenses
    const [curExpenses] = await db
      .select({ total: sql<string>`COALESCE(SUM(${vendorBillsTable.totalAmount}), 0)` })
      .from(vendorBillsTable)
      .where(
        and(
          inArray(vendorBillsTable.status, ["paid", "approved", "partially_paid"]),
          sql`${vendorBillsTable.billMonth} >= ${currentMonthStart}`,
          sql`${vendorBillsTable.billMonth} < ${nextMonthStart}`
        )
      );

    // Previous month revenue
    const [prevRevenue] = await db
      .select({ total: sql<string>`COALESCE(SUM(${invoicesTable.total}), 0)` })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.status, "paid"),
          sql`${invoicesTable.invoiceMonth} >= ${prevMonthStart}`,
          sql`${invoicesTable.invoiceMonth} < ${currentMonthStart}`,
          sql`${invoicesTable.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`
        )
      );

    // Previous month expenses
    const [prevExpenses] = await db
      .select({ total: sql<string>`COALESCE(SUM(${vendorBillsTable.totalAmount}), 0)` })
      .from(vendorBillsTable)
      .where(
        and(
          inArray(vendorBillsTable.status, ["paid", "approved", "partially_paid"]),
          sql`${vendorBillsTable.billMonth} >= ${prevMonthStart}`,
          sql`${vendorBillsTable.billMonth} < ${currentMonthStart}`
        )
      );

    // Outstanding bills (pending_approval + approved + overdue)
    const [outstandingBills] = await db
      .select({ total: sql<string>`COALESCE(SUM(${vendorBillsTable.totalAmount}), 0)` })
      .from(vendorBillsTable)
      .where(inArray(vendorBillsTable.status, ["pending_approval", "approved", "overdue"]));

    // Outstanding invoices (sent + overdue)
    const [outstandingInvoices] = await db
      .select({ total: sql<string>`COALESCE(SUM(${invoicesTable.total}), 0)` })
      .from(invoicesTable)
      .where(
        and(
          inArray(invoicesTable.status, ["sent", "overdue"]),
          sql`${invoicesTable.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`
        )
      );

    const curRev = parseFloat(curRevenue?.total ?? "0");
    const curExp = parseFloat(curExpenses?.total ?? "0");
    const prevRev = parseFloat(prevRevenue?.total ?? "0");
    const prevExp = parseFloat(prevExpenses?.total ?? "0");

    return {
      currentMonthRevenue: Math.round(curRev * 100) / 100,
      currentMonthExpenses: Math.round(curExp * 100) / 100,
      currentMonthProfit: Math.round((curRev - curExp) * 100) / 100,
      previousMonthRevenue: Math.round(prevRev * 100) / 100,
      previousMonthExpenses: Math.round(prevExp * 100) / 100,
      previousMonthProfit: Math.round((prevRev - prevExp) * 100) / 100,
      totalOutstandingBills: Math.round(parseFloat(outstandingBills?.total ?? "0") * 100) / 100,
      totalOutstandingInvoices: Math.round(parseFloat(outstandingInvoices?.total ?? "0") * 100) / 100,
    };
  }),
});
