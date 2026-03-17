/**
 * Portal Payroll Router
 *
 * All queries are SCOPED to ctx.portalUser.customerId.
 * Portal users can view approved payroll runs for their employees.
 * They CANNOT see payroll runs in draft or pending_approval status.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, count, inArray } from "drizzle-orm";
import {
  protectedPortalProcedure,
  portalRouter,
} from "../portalTrpc";
import { getDb } from "../../db";
import {
  payrollRuns,
  payrollItems,
  employees,
} from "../../../drizzle/schema";

export const portalPayrollRouter = portalRouter({
  /**
   * List payroll runs that include the customer's employees
   * Only shows approved payroll runs
   */
  list: protectedPortalProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        year: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const cid = ctx.portalUser.customerId;

      // Get distinct payroll run IDs that have items for this customer's employees
      // Only show approved payroll runs
      const subquery = db
        .select({ payrollRunId: payrollItems.payrollRunId })
        .from(payrollItems)
        .innerJoin(employees, eq(payrollItems.employeeId, employees.id))
        .where(eq(employees.customerId, cid))
        .groupBy(payrollItems.payrollRunId);

      const runIds = (await subquery).map((r) => r.payrollRunId);
      if (runIds.length === 0) return { items: [], total: 0 };

      const conditions: any[] = [
        inArray(payrollRuns.id, runIds),
        eq(payrollRuns.status, "approved"),
      ];

      if (input.year) {
        conditions.push(
          sql`substr(${payrollRuns.payrollMonth}, 1, 4) = ${String(input.year)}`
        );
      }

      const where = and(...conditions);

      const [totalResult] = await db
        .select({ count: count() })
        .from(payrollRuns)
        .where(where);

      const runs = await db
        .select({
          id: payrollRuns.id,
          countryCode: payrollRuns.countryCode,
          payrollMonth: payrollRuns.payrollMonth,
          currency: payrollRuns.currency,
          status: payrollRuns.status,
          totalGross: payrollRuns.totalGross,
          totalDeductions: payrollRuns.totalDeductions,
          totalNet: payrollRuns.totalNet,
          approvedAt: payrollRuns.approvedAt,
          notes: payrollRuns.notes,
        })
        .from(payrollRuns)
        .where(where)
        .orderBy(sql`${payrollRuns.payrollMonth} DESC`)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      // For each run, get the count of this customer's employees
      const enrichedRuns = await Promise.all(
        runs.map(async (run) => {
          const [empCount] = await db
            .select({ count: count() })
            .from(payrollItems)
            .innerJoin(employees, eq(payrollItems.employeeId, employees.id))
            .where(
              and(
                eq(payrollItems.payrollRunId, run.id),
                eq(employees.customerId, cid)
              )
            );

          // Get customer-specific totals (not the whole run totals)
          const [customerTotals] = await db
            .select({
              totalGross: sql<string>`COALESCE(SUM(${payrollItems.gross}), 0)`,
              totalNet: sql<string>`COALESCE(SUM(${payrollItems.net}), 0)`,
              totalDeductions: sql<string>`COALESCE(SUM(${payrollItems.deductions} + ${payrollItems.taxDeduction} + ${payrollItems.socialSecurityDeduction} + ${payrollItems.unpaidLeaveDeduction}), 0)`,
              totalEmployerCost: sql<string>`COALESCE(SUM(${payrollItems.totalEmploymentCost}), 0)`,
            })
            .from(payrollItems)
            .innerJoin(employees, eq(payrollItems.employeeId, employees.id))
            .where(
              and(
                eq(payrollItems.payrollRunId, run.id),
                eq(employees.customerId, cid)
              )
            );

          return {
            ...run,
            employeeCount: empCount?.count ?? 0,
            customerTotalGross: customerTotals?.totalGross ?? "0",
            customerTotalNet: customerTotals?.totalNet ?? "0",
            customerTotalDeductions: customerTotals?.totalDeductions ?? "0",
            customerTotalEmployerCost: customerTotals?.totalEmployerCost ?? "0",
          };
        })
      );

      return {
        items: enrichedRuns,
        total: totalResult?.count ?? 0,
      };
    }),

  /**
   * Get payroll run detail with employee-level breakdown
   * Only shows this customer's employees
   */
  detail: protectedPortalProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Get the payroll run (must be approved)
      const [run] = await db
        .select({
          id: payrollRuns.id,
          countryCode: payrollRuns.countryCode,
          payrollMonth: payrollRuns.payrollMonth,
          currency: payrollRuns.currency,
          status: payrollRuns.status,
          approvedAt: payrollRuns.approvedAt,
          notes: payrollRuns.notes,
        })
        .from(payrollRuns)
        .where(
          and(
            eq(payrollRuns.id, input.id),
            eq(payrollRuns.status, "approved")
          )
        );

      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run not found" });
      }

      // Get this customer's employee items only
      const items = await db
        .select({
          id: payrollItems.id,
          employeeId: payrollItems.employeeId,
          employeeName: sql<string>`(${employees.firstName} || ' ' || ${employees.lastName})`,
          employeeCode: employees.employeeCode,
          jobTitle: employees.jobTitle,
          baseSalary: payrollItems.baseSalary,
          bonus: payrollItems.bonus,
          allowances: payrollItems.allowances,
          reimbursements: payrollItems.reimbursements,
          deductions: payrollItems.deductions,
          taxDeduction: payrollItems.taxDeduction,
          socialSecurityDeduction: payrollItems.socialSecurityDeduction,
          unpaidLeaveDeduction: payrollItems.unpaidLeaveDeduction,
          unpaidLeaveDays: payrollItems.unpaidLeaveDays,
          gross: payrollItems.gross,
          net: payrollItems.net,
          employerSocialContribution: payrollItems.employerSocialContribution,
          totalEmploymentCost: payrollItems.totalEmploymentCost,
          currency: payrollItems.currency,
          notes: payrollItems.notes,
        })
        .from(payrollItems)
        .innerJoin(employees, eq(payrollItems.employeeId, employees.id))
        .where(
          and(
            eq(payrollItems.payrollRunId, input.id),
            eq(employees.customerId, cid)
          )
        );

      if (items.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No payroll data found for your employees" });
      }

      return {
        ...run,
        items,
      };
    }),

  /**
   * Export all payroll detail for a given year — returns employee-level rows for CSV export
   */
  exportData: protectedPortalProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const cid = ctx.portalUser.customerId;

      // Get all approved payroll runs for the year that include this customer's employees
      const subquery = db
        .select({ payrollRunId: payrollItems.payrollRunId })
        .from(payrollItems)
        .innerJoin(employees, eq(payrollItems.employeeId, employees.id))
        .where(eq(employees.customerId, cid))
        .groupBy(payrollItems.payrollRunId);
      const runIds = (await subquery).map((r) => r.payrollRunId);
      if (runIds.length === 0) return [];

      const runs = await db
        .select({
          id: payrollRuns.id,
          countryCode: payrollRuns.countryCode,
          payrollMonth: payrollRuns.payrollMonth,
          currency: payrollRuns.currency,
          status: payrollRuns.status,
        })
        .from(payrollRuns)
        .where(
          and(
            inArray(payrollRuns.id, runIds),
            eq(payrollRuns.status, "approved"),
            sql`substr(${payrollRuns.payrollMonth}, 1, 4) = ${String(input.year)}`
          )
        )
        .orderBy(sql`${payrollRuns.payrollMonth} DESC`);

      if (runs.length === 0) return [];

      // Get all employee-level items for these runs
      const allItems = await db
        .select({
          payrollRunId: payrollItems.payrollRunId,
          employeeName: sql<string>`(${employees.firstName} || ' ' || ${employees.lastName})`,
          employeeCode: employees.employeeCode,
          jobTitle: employees.jobTitle,
          baseSalary: payrollItems.baseSalary,
          bonus: payrollItems.bonus,
          allowances: payrollItems.allowances,
          reimbursements: payrollItems.reimbursements,
          deductions: payrollItems.deductions,
          taxDeduction: payrollItems.taxDeduction,
          socialSecurityDeduction: payrollItems.socialSecurityDeduction,
          unpaidLeaveDeduction: payrollItems.unpaidLeaveDeduction,
          unpaidLeaveDays: payrollItems.unpaidLeaveDays,
          gross: payrollItems.gross,
          net: payrollItems.net,
          employerSocialContribution: payrollItems.employerSocialContribution,
          totalEmploymentCost: payrollItems.totalEmploymentCost,
          currency: payrollItems.currency,
        })
        .from(payrollItems)
        .innerJoin(employees, eq(payrollItems.employeeId, employees.id))
        .where(
          and(
            inArray(payrollItems.payrollRunId, runs.map((r) => r.id)),
            eq(employees.customerId, cid)
          )
        );

      // Build a map of run info
      const runMap = new Map(runs.map((r) => [r.id, r]));

      // Merge run info with items
      return allItems.map((item) => {
        const run = runMap.get(item.payrollRunId);
        return {
          payrollMonth: run?.payrollMonth || "",
          countryCode: run?.countryCode || "",
          status: run?.status || "",
          ...item,
        };
      });
    }),
});
