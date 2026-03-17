/**
 * Portal Dashboard Router
 *
 * All queries are SCOPED to ctx.portalUser.customerId.
 * No cross-customer data access is possible.
 */

import { sql, eq, and, count, inArray } from "drizzle-orm";
import {
  protectedPortalProcedure,
  portalRouter,
} from "../portalTrpc";
import { getDb } from "../../db";
import {
  employees,
  invoices,
  adjustments,
  leaveRecords,
  countriesConfig,
  customerLeavePolicies,
  payrollRuns,
  payrollItems,
  contractors,
  reimbursements,
} from "../../../drizzle/schema";

export const portalDashboardRouter = portalRouter({
  /**
   * Dashboard summary stats — scoped to customerId
   */
  stats: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const cid = ctx.portalUser.customerId;

    // Active employees count
    const [empCount] = await db
      .select({ count: count() })
      .from(employees)
      .where(and(eq(employees.customerId, cid), eq(employees.status, "active")));

    // Bug 3: Active contractors count
    const [contractorCount] = await db
      .select({ count: count() })
      .from(contractors)
      .where(and(eq(contractors.customerId, cid), eq(contractors.status, "active")));

    // Active countries (distinct country codes of active employees)
    const activeCountries = await db
      .select({ countryCode: employees.country })
      .from(employees)
      .where(and(eq(employees.customerId, cid), eq(employees.status, "active")))
      .groupBy(employees.country);

    // Pending onboarding
    const [onboardingCount] = await db
      .select({ count: count() })
      .from(employees)
      .where(
        and(
          eq(employees.customerId, cid),
          inArray(employees.status, ["pending_review", "documents_incomplete", "onboarding"])
        )
      );

    // Pending adjustments (submitted, not yet locked)
    const [adjCount] = await db
      .select({ count: count() })
      .from(adjustments)
      .where(and(eq(adjustments.customerId, cid), eq(adjustments.status, "submitted")));

    // Pending leave requests (join through employees to scope by customerId)
    const [leaveCount] = await db
      .select({ count: count() })
      .from(leaveRecords)
      .innerJoin(employees, eq(leaveRecords.employeeId, employees.id))
      .where(and(eq(employees.customerId, cid), eq(leaveRecords.status, "submitted")));

    // Overdue invoices
    const [overdueCount] = await db
      .select({ count: count() })
      .from(invoices)
      .where(and(eq(invoices.customerId, cid), eq(invoices.status, "overdue")));

    // Unpaid invoices (sent but not paid)
    const [unpaidCount] = await db
      .select({ count: count() })
      .from(invoices)
      .where(and(eq(invoices.customerId, cid), eq(invoices.status, "sent")));

    // Pending reimbursements (submitted, awaiting client approval)
    const [reimbursementCount] = await db
      .select({ count: count() })
      .from(reimbursements)
      .where(and(eq(reimbursements.customerId, cid), eq(reimbursements.status, "submitted")));

    // Countries with leave policies that have NOT been confirmed by the client
    // A country needs attention if any of its policies have clientConfirmed = false
    const unconfirmedPolicyCountries = await db
      .select({ countryCode: customerLeavePolicies.countryCode })
      .from(customerLeavePolicies)
      .where(and(
        eq(customerLeavePolicies.customerId, cid),
        eq(customerLeavePolicies.clientConfirmed, false)
      ))
      .groupBy(customerLeavePolicies.countryCode);

    return {
      activeEmployees: (empCount?.count ?? 0) + (contractorCount?.count ?? 0),
      activeEorEmployees: empCount?.count ?? 0,
      activeContractors: contractorCount?.count ?? 0,
      activeCountries: activeCountries.length,
      pendingOnboarding: onboardingCount?.count ?? 0,
      pendingAdjustments: adjCount?.count ?? 0,
      pendingLeave: leaveCount?.count ?? 0,
      overdueInvoices: overdueCount?.count ?? 0,
      unpaidInvoices: unpaidCount?.count ?? 0,
      pendingReimbursements: reimbursementCount?.count ?? 0,
      unconfiguredLeavePolicyCountries: unconfirmedPolicyCountries.length,
    };
  }),

  /**
   * Employee distribution by country — for the world map
   */
  employeesByCountry: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const cid = ctx.portalUser.customerId;

    const result = await db
      .select({
      countryCode: employees.country,
      countryName: countriesConfig.countryName,
        count: count(),
      })
      .from(employees)
    .leftJoin(countriesConfig, eq(employees.country, countriesConfig.countryCode))
    .where(and(eq(employees.customerId, cid), eq(employees.status, "active")))
    .groupBy(employees.country, countriesConfig.countryName);

    return result.map((r) => ({
      countryCode: r.countryCode,
      countryName: r.countryName || r.countryCode,
      employeeCount: r.count,
    }));
  }),

  /**
   * Recent activity feed — last 20 events across employees, adjustments, leave
   */
  recentActivity: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const cid = ctx.portalUser.customerId;

    // Get recent employee changes
    const recentEmployees = await db
      .select({
        id: employees.id,
        type: sql<string>`'employee'`,
        title: sql<string>`(${employees.firstName} || ' ' || ${employees.lastName})`,
        status: employees.status,
        date: employees.updatedAt,
      })
      .from(employees)
      .where(eq(employees.customerId, cid))
      .orderBy(sql`${employees.updatedAt} DESC`)
      .limit(10);

    // Get recent adjustments
    const recentAdj = await db
      .select({
        id: adjustments.id,
        type: sql<string>`'adjustment'`,
        title: adjustments.adjustmentType,
        status: adjustments.status,
        date: adjustments.updatedAt,
      })
      .from(adjustments)
      .where(eq(adjustments.customerId, cid))
      .orderBy(sql`${adjustments.updatedAt} DESC`)
      .limit(10);

    // Get recent leave records
    const recentLeave = await db
      .select({
        id: leaveRecords.id,
        type: sql<string>`'leave'`,
        title: sql<string>`('Leave #' || ${leaveRecords.id})`,
        status: leaveRecords.status,
        date: leaveRecords.updatedAt,
      })
      .from(leaveRecords)
      .innerJoin(employees, eq(leaveRecords.employeeId, employees.id))
      .where(eq(employees.customerId, cid))
      .orderBy(sql`${leaveRecords.updatedAt} DESC`)
      .limit(10);

    // Merge and sort by date
    const all = [...recentEmployees, ...recentAdj, ...recentLeave]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);

    return all;
  }),

  /**
   * Monthly payroll cost trend — last 12 months
   * Payroll runs are per-country, so we aggregate via payrollItems -> employees -> customerId
   */
  payrollTrend: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const cid = ctx.portalUser.customerId;

    const result = await db
      .select({
        month: payrollRuns.payrollMonth,
        totalGross: sql<string>`COALESCE(SUM(${payrollItems.gross}), 0)`,
        totalNet: sql<string>`COALESCE(SUM(${payrollItems.net}), 0)`,
        totalEmployerCost: sql<string>`COALESCE(SUM(${payrollItems.totalEmploymentCost}), 0)`,
        currency: payrollRuns.currency,
      })
      .from(payrollItems)
      .innerJoin(payrollRuns, eq(payrollItems.payrollRunId, payrollRuns.id))
      .innerJoin(employees, eq(payrollItems.employeeId, employees.id))
      .where(
        and(
          eq(employees.customerId, cid),
          sql`${payrollRuns.status} IN ('approved', 'locked', 'paid')`,
          sql`${payrollRuns.payrollMonth} >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`
        )
      )
      .groupBy(payrollRuns.payrollMonth, payrollRuns.currency)
      .orderBy(payrollRuns.payrollMonth);

    return result.map((r) => ({
      month: r.month,
      totalGross: Number(r.totalGross),
      totalNet: Number(r.totalNet),
      totalEmployerCost: Number(r.totalEmployerCost),
      currency: r.currency,
    }));
  }),

  /**
   * Employee status distribution — for pie/donut chart
   */
  employeeStatusDistribution: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const cid = ctx.portalUser.customerId;

    const result = await db
      .select({
        status: employees.status,
        count: count(),
      })
      .from(employees)
      .where(eq(employees.customerId, cid))
      .groupBy(employees.status);

    return result.map((r) => ({
      status: r.status,
      count: r.count,
    }));
  }),
});
