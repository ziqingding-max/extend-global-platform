import { z } from "zod";
import { router } from "../_core/trpc";
import { userProcedure, operationsManagerProcedure, financeManagerProcedure, adminProcedure } from "../procedures";
import {
  getDashboardStats,
  getEmployeeCountByStatus,
  getEmployeeCountByCountry,
  listAuditLogs,
  getDb,
} from "../db";
import {
  customers,
  employees,
  employeeContracts,
  payrollRuns,
  invoices,
  invoiceItems,
  adjustments,
  leaveRecords,
} from "../../drizzle/schema";
import { eq, and, gte, lte, lt, sql, count, sum, desc, inArray, isNotNull } from "drizzle-orm";

/**
 * Generate an array of YYYY-MM strings for the last N months (inclusive of current).
 */
function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export const dashboardRouter = router({
  // ── Existing endpoints (backward compatible) ──
  stats: userProcedure.query(async () => {
    return await getDashboardStats();
  }),

  employeesByStatus: userProcedure.query(async () => {
    return await getEmployeeCountByStatus();
  }),

  employeesByCountry: userProcedure.query(async () => {
    return await getEmployeeCountByCountry();
  }),

  recentActivity: adminProcedure.query(async () => {
    const { data } = await listAuditLogs(undefined, 20, 0);
    return data;
  }),

  // ── NEW: Monthly Trends (last 12 months) ──
  monthlyTrends: userProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { months: [], employeeTrend: [], customerTrend: [], invoiceTrend: [], payrollTrend: [] };

    const months = getLastNMonths(12);

    // Employee count trend: count employees created on or before end of each month
    const employeeTrend: number[] = [];
    const customerTrend: number[] = [];
    const invoiceTrend: number[] = [];
    const payrollTrend: number[] = [];

    for (const m of months) {
      const [y, mo] = m.split("-").map(Number);
      const monthEnd = new Date(y, mo, 0, 23, 59, 59); // Last day of month
      const monthStart = `${m}-01`;
      const nextMonth = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;

      // Cumulative employee count (active/contract_signed/onboarding at month end)
      const [empResult] = await db.select({ count: count() }).from(employees)
        .where(and(
          sql`${employees.createdAt} <= ${monthEnd}`,
          inArray(employees.status, ["active", "contract_signed", "onboarding", "offboarding"]),
        ));
      employeeTrend.push(empResult?.count ?? 0);

      // Cumulative active customer count
      const [custResult] = await db.select({ count: count() }).from(customers)
        .where(and(
          sql`${customers.createdAt} <= ${monthEnd}`,
          eq(customers.status, "active"),
        ));
      customerTrend.push(custResult?.count ?? 0);

      // Invoices created in this month
      const [invResult] = await db.select({ count: count() }).from(invoices)
        .where(and(
          sql`${invoices.createdAt} >= ${monthStart}`,
          sql`${invoices.createdAt} < ${nextMonth}`,
        ));
      invoiceTrend.push(invResult?.count ?? 0);

      // Payroll runs for this month
      const [prResult] = await db.select({ count: count() }).from(payrollRuns)
        .where(and(
          sql`${payrollRuns.payrollMonth} >= ${monthStart}`,
          sql`${payrollRuns.payrollMonth} < ${nextMonth}`,
        ));
      payrollTrend.push(prResult?.count ?? 0);
    }

    return { months, employeeTrend, customerTrend, invoiceTrend, payrollTrend };
  }),

  // ── NEW: Finance Overview ──
  financeOverview: financeManagerProcedure.query(async () => {
    const db = await getDb();
    if (!db) return {
      totalRevenue: "0", totalServiceFeeRevenue: "0", totalPaidInvoices: 0,
      totalOutstandingAmount: "0", totalOverdueAmount: "0",
      totalDeferredRevenue: "0", totalDepositInvoices: 0,
      monthlyRevenue: [] as { month: string; totalRevenue: string; serviceFeeRevenue: string; invoiceCount: number }[],
    };

    // Total paid invoice revenue (EXCLUDE deposits and credit notes from revenue)
    // Deposits are deferred revenue/liability, not income per GAAP/IFRS
    // Credit notes reduce revenue (negative amounts)
    const [paidTotal] = await db.select({
      total: sql<string>`COALESCE(SUM(${invoices.total}), 0)`,
      count: count(),
    }).from(invoices).where(and(
      eq(invoices.status, "paid"),
      sql`${invoices.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`,
    ));

    // Deferred revenue: total from deposit invoices (paid, not refunded)
    // Refunded deposits are no longer liabilities
    const [depositTotal] = await db.select({
      total: sql<string>`COALESCE(SUM(${invoices.total}), 0)`,
      count: count(),
    }).from(invoices).where(and(
      eq(invoices.status, "paid"),
      eq(invoices.invoiceType, "deposit"),
    ));

    // Total service fee revenue (from paid invoices' service fee items, excluding deposits)
    const [serviceFeeTotal] = await db.select({
      total: sql<string>`COALESCE(SUM(ii.amount), 0)`,
    }).from(invoices)
      .innerJoin(sql`invoice_items ii`, sql`ii.invoiceId = ${invoices.id}`)
      .where(and(
        eq(invoices.status, "paid"),
        sql`${invoices.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`,
        sql`ii.itemType IN ('eor_service_fee', 'visa_eor_service_fee', 'aor_service_fee')`,
      ));

    // Outstanding (sent + overdue)
    const [outstanding] = await db.select({
      total: sql<string>`COALESCE(SUM(${invoices.total}), 0)`,
    }).from(invoices).where(inArray(invoices.status, ["sent", "overdue"]));

    // Overdue only
    const [overdue] = await db.select({
      total: sql<string>`COALESCE(SUM(${invoices.total}), 0)`,
    }).from(invoices).where(eq(invoices.status, "overdue"));

    // Monthly revenue breakdown (last 12 months)
    const months = getLastNMonths(12);
    const monthlyRevenue: { month: string; totalRevenue: string; serviceFeeRevenue: string; invoiceCount: number }[] = [];

    for (const m of months) {
      const [y, mo] = m.split("-").map(Number);
      const monthStart = `${m}-01`;
      const nextMonth = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;

      // Total revenue from paid invoices in this month (excluding deposits)
      const [monthTotal] = await db.select({
        total: sql<string>`COALESCE(SUM(${invoices.total}), 0)`,
        count: count(),
      }).from(invoices).where(and(
        eq(invoices.status, "paid"),
        sql`${invoices.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`,
        sql`(${invoices.paidDate} >= ${monthStart} AND ${invoices.paidDate} < ${nextMonth})
            OR (${invoices.paidDate} IS NULL AND ${invoices.createdAt} >= ${monthStart} AND ${invoices.createdAt} < ${nextMonth})`,
      ));

      // Service fee revenue for this month (excluding deposits)
      const [monthServiceFee] = await db.select({
        total: sql<string>`COALESCE(SUM(ii.amount), 0)`,
      }).from(invoices)
        .innerJoin(sql`invoice_items ii`, sql`ii.invoiceId = ${invoices.id}`)
        .where(and(
          eq(invoices.status, "paid"),
          sql`${invoices.invoiceType} NOT IN ('deposit', 'deposit_refund', 'credit_note')`,
          sql`ii.itemType IN ('eor_service_fee', 'visa_eor_service_fee', 'aor_service_fee')`,
          sql`(${invoices.paidDate} >= ${monthStart} AND ${invoices.paidDate} < ${nextMonth})
              OR (${invoices.paidDate} IS NULL AND ${invoices.createdAt} >= ${monthStart} AND ${invoices.createdAt} < ${nextMonth})`,
        ));

      monthlyRevenue.push({
        month: m,
        totalRevenue: monthTotal?.total ?? "0",
        serviceFeeRevenue: monthServiceFee?.total ?? "0",
        invoiceCount: monthTotal?.count ?? 0,
      });
    }

    return {
      totalRevenue: paidTotal?.total ?? "0",
      totalServiceFeeRevenue: serviceFeeTotal?.total ?? "0",
      totalPaidInvoices: paidTotal?.count ?? 0,
      totalOutstandingAmount: outstanding?.total ?? "0",
      totalOverdueAmount: overdue?.total ?? "0",
      totalDeferredRevenue: depositTotal?.total ?? "0",
      totalDepositInvoices: depositTotal?.count ?? 0,
      monthlyRevenue,
    };
  }),

  // ── NEW: Operations Overview ──
  operationsOverview: operationsManagerProcedure.query(async () => {
    const db = await getDb();
    if (!db) return {
      payrollByStatus: [] as { status: string; count: number }[],
      pendingApprovals: { payrolls: 0, adjustments: 0, leaves: 0 },
      recentPayrollRuns: [] as any[],
      employeeOnboarding: 0,
      employeeOffboarding: 0,
    };

    // Payroll runs by status
    const payrollByStatus = await db.select({
      status: payrollRuns.status,
      count: count(),
    }).from(payrollRuns).groupBy(payrollRuns.status);

    // Pending approvals
    const [pendingPayrolls] = await db.select({ count: count() }).from(payrollRuns)
      .where(eq(payrollRuns.status, "pending_approval"));
    const [pendingAdj] = await db.select({ count: count() }).from(adjustments)
      .where(eq(adjustments.status, "submitted"));
    const [pendingLeaves] = await db.select({ count: count() }).from(leaveRecords)
      .where(eq(leaveRecords.status, "submitted"));

    // Recent payroll runs (last 10)
    const recentPayrollRuns = await db.select({
      id: payrollRuns.id,
      countryCode: payrollRuns.countryCode,
      payrollMonth: payrollRuns.payrollMonth,
      status: payrollRuns.status,
      totalGrossSalary: payrollRuns.totalGross,
      totalEmployerCost: payrollRuns.totalDeductions,
      createdAt: payrollRuns.createdAt,
    }).from(payrollRuns).orderBy(desc(payrollRuns.createdAt)).limit(10);

    // Employees in onboarding/offboarding
    const [onboarding] = await db.select({ count: count() }).from(employees)
      .where(inArray(employees.status, ["pending_review", "documents_incomplete", "onboarding", "contract_signed"]));
    const [offboarding] = await db.select({ count: count() }).from(employees)
      .where(eq(employees.status, "offboarding"));

    return {
      payrollByStatus: payrollByStatus.map(r => ({ status: r.status, count: r.count })),
      pendingApprovals: {
        payrolls: pendingPayrolls?.count ?? 0,
        adjustments: pendingAdj?.count ?? 0,
        leaves: pendingLeaves?.count ?? 0,
      },
      recentPayrollRuns,
      employeeOnboarding: onboarding?.count ?? 0,
      employeeOffboarding: offboarding?.count ?? 0,
    };
  }),

  // ── NEW: HR & Leave Overview ──
  hrOverview: operationsManagerProcedure.query(async () => {
    const db = await getDb();
    if (!db) return {
      // Workforce KPIs
      activeEmployees: 0,
      onLeaveEmployees: 0,
      newHiresThisMonth: 0,
      terminationsThisMonth: 0,
      onboardingEmployees: 0,
      offboardingEmployees: 0,
      // Contract expiry alerts
      contractExpiry30: [] as { employeeId: number; employeeName: string; employeeCode: string; expiryDate: string; contractType: string | null }[],
      contractExpiry60: [] as { employeeId: number; employeeName: string; employeeCode: string; expiryDate: string; contractType: string | null }[],
      contractExpiry90: [] as { employeeId: number; employeeName: string; employeeCode: string; expiryDate: string; contractType: string | null }[],
      // Monthly workforce trend
      monthlyWorkforce: [] as { month: string; active: number; newHires: number; terminations: number; onLeave: number }[],
      // Existing
      leaveByStatus: [] as { status: string; count: number }[],
      adjustmentByStatus: [] as { status: string; count: number }[],
      adjustmentByType: [] as { type: string; count: number; totalAmount: string }[],
      monthlyLeave: [] as { month: string; count: number; totalDays: string }[],
    };

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonthStart = now.getMonth() === 11
      ? `${now.getFullYear() + 1}-01-01`
      : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, "0")}-01`;

    // ── Workforce KPIs ──
    const [activeResult] = await db.select({ count: count() }).from(employees)
      .where(eq(employees.status, "active"));
    const [onLeaveResult] = await db.select({ count: count() }).from(employees)
      .where(eq(employees.status, "on_leave"));
    const [onboardingResult] = await db.select({ count: count() }).from(employees)
      .where(inArray(employees.status, ["pending_review", "documents_incomplete", "onboarding", "contract_signed"]));
    const [offboardingResult] = await db.select({ count: count() }).from(employees)
      .where(eq(employees.status, "offboarding"));

    // New hires this month (startDate in current month)
    const [newHiresResult] = await db.select({ count: count() }).from(employees)
      .where(and(
        sql`${employees.startDate} >= ${currentMonthStart}`,
        sql`${employees.startDate} < ${nextMonthStart}`,
      ));

    // Terminations this month
    const [terminationsResult] = await db.select({ count: count() }).from(employees)
      .where(and(
        eq(employees.status, "terminated"),
        sql`${employees.updatedAt} >= ${currentMonthStart}`,
        sql`${employees.updatedAt} < ${nextMonthStart}`,
      ));

    // ── Contract Expiry Alerts ──
    const getExpiringContracts = async (daysAhead: number) => {
      const futureDate = new Date(now);
      futureDate.setDate(futureDate.getDate() + daysAhead);
      const futureDateStr = futureDate.toISOString().slice(0, 10);

      const results = await db.select({
        employeeId: employeeContracts.employeeId,
        expiryDate: employeeContracts.expiryDate,
        contractType: employeeContracts.contractType,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
        .from(employeeContracts)
        .innerJoin(employees, eq(employeeContracts.employeeId, employees.id))
        .where(and(
          isNotNull(employeeContracts.expiryDate),
          sql`${employeeContracts.expiryDate} >= ${todayStr}`,
          sql`${employeeContracts.expiryDate} <= ${futureDateStr}`,
          eq(employeeContracts.status, "signed"),
          inArray(employees.status, ["active", "on_leave"]),
        ))
        .orderBy(employeeContracts.expiryDate);

      return results.map(r => ({
        employeeId: r.employeeId,
        employeeName: `${r.firstName} ${r.lastName}`,
        employeeCode: r.employeeCode || "",
        expiryDate: r.expiryDate || "",
        contractType: r.contractType,
      }));
    };

    const contractExpiry30 = await getExpiringContracts(30);
    const contractExpiry60 = await getExpiringContracts(60);
    const contractExpiry90 = await getExpiringContracts(90);

    // ── Monthly Workforce Trend (last 12 months) ──
    const months = getLastNMonths(12);
    const monthlyWorkforce: { month: string; active: number; newHires: number; terminations: number; onLeave: number }[] = [];

    for (const m of months) {
      const [y, mo] = m.split("-").map(Number);
      const monthEnd = new Date(y, mo, 0, 23, 59, 59);
      const monthStart = `${m}-01`;
      const mNextMonth = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;

      // Active employees at end of month
      const [activeAtMonth] = await db.select({ count: count() }).from(employees)
        .where(and(
          sql`${employees.createdAt} <= ${monthEnd}`,
          inArray(employees.status, ["active", "on_leave", "offboarding"]),
        ));

      // New hires in this month
      const [newInMonth] = await db.select({ count: count() }).from(employees)
        .where(and(
          sql`${employees.startDate} >= ${monthStart}`,
          sql`${employees.startDate} < ${mNextMonth}`,
        ));

      // Terminations in this month
      const [termInMonth] = await db.select({ count: count() }).from(employees)
        .where(and(
          eq(employees.status, "terminated"),
          sql`${employees.updatedAt} >= ${monthStart}`,
          sql`${employees.updatedAt} < ${mNextMonth}`,
        ));

      // On leave at end of month
      const [onLeaveAtMonth] = await db.select({ count: count() }).from(employees)
        .where(and(
          sql`${employees.createdAt} <= ${monthEnd}`,
          eq(employees.status, "on_leave"),
        ));

      monthlyWorkforce.push({
        month: m,
        active: activeAtMonth?.count ?? 0,
        newHires: newInMonth?.count ?? 0,
        terminations: termInMonth?.count ?? 0,
        onLeave: onLeaveAtMonth?.count ?? 0,
      });
    }

    // ── Existing Leave & Adjustment data ──
    const leaveByStatus = await db.select({
      status: leaveRecords.status,
      count: count(),
    }).from(leaveRecords).groupBy(leaveRecords.status);

    const adjustmentByStatus = await db.select({
      status: adjustments.status,
      count: count(),
    }).from(adjustments).groupBy(adjustments.status);

    const adjustmentByType = await db.select({
      type: adjustments.adjustmentType,
      count: count(),
      totalAmount: sql<string>`COALESCE(SUM(${adjustments.amount}), 0)`,
    }).from(adjustments).groupBy(adjustments.adjustmentType);

    const monthlyLeave: { month: string; count: number; totalDays: string }[] = [];
    for (const m of months) {
      const [y, mo] = m.split("-").map(Number);
      const monthStart = `${m}-01`;
      const mNextMonth = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;

      const [result] = await db.select({
        count: count(),
        totalDays: sql<string>`COALESCE(SUM(${leaveRecords.days}), 0)`,
      }).from(leaveRecords).where(and(
        sql`${leaveRecords.startDate} >= ${monthStart}`,
        sql`${leaveRecords.startDate} < ${mNextMonth}`,
      ));

      monthlyLeave.push({
        month: m,
        count: result?.count ?? 0,
        totalDays: result?.totalDays ?? "0",
      });
    }

    return {
      activeEmployees: activeResult?.count ?? 0,
      onLeaveEmployees: onLeaveResult?.count ?? 0,
      newHiresThisMonth: newHiresResult?.count ?? 0,
      terminationsThisMonth: terminationsResult?.count ?? 0,
      onboardingEmployees: onboardingResult?.count ?? 0,
      offboardingEmployees: offboardingResult?.count ?? 0,
      contractExpiry30,
      contractExpiry60,
      contractExpiry90,
      monthlyWorkforce,
      leaveByStatus: leaveByStatus.map(r => ({ status: r.status, count: r.count })),
      adjustmentByStatus: adjustmentByStatus.map(r => ({ status: r.status, count: r.count })),
      adjustmentByType: adjustmentByType.map(r => ({ type: r.type, count: r.count, totalAmount: r.totalAmount })),
      monthlyLeave,
    };
  }),
});
