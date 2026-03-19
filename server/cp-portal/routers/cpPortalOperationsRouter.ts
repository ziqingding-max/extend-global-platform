/**
 * CP Portal Operations Router (Task Group E)
 *
 * Provides read-only operations overview for CP to track:
 * - Payroll runs (for employees under their clients)
 * - Leave records
 * - Adjustments (bonuses, allowances, deductions)
 * - Reimbursements
 *
 * All data is scoped via: employee -> customer -> channelPartner
 * CP can only see data for employees belonging to their clients.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, count, inArray, SQL } from "drizzle-orm";
import {
  protectedCpProcedure,
  cpPortalRouter,
} from "../cpPortalTrpc";
import { getDb } from "../../db";
import {
  employees,
  customers,
  payrollRuns,
  payrollItems,
  leaveRecords,
  adjustments,
  reimbursements,
} from "../../../drizzle/schema";

export const cpPortalOperationsRouter = cpPortalRouter({
  /**
   * Operations summary — aggregate counts and stats.
   */
  summary: protectedCpProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) {
      return {
        activeEmployees: 0,
        pendingLeaves: 0,
        pendingAdjustments: 0,
        pendingReimbursements: 0,
        recentPayrollRuns: 0,
      };
    }

    const cpId = ctx.cpUser.channelPartnerId;

    // Get all employees under this CP
    const cpEmployees = await db
      .select({ id: employees.id, status: employees.status })
      .from(employees)
      .where(eq(employees.channelPartnerId, cpId));

    if (cpEmployees.length === 0) {
      return {
        activeEmployees: 0,
        pendingLeaves: 0,
        pendingAdjustments: 0,
        pendingReimbursements: 0,
        recentPayrollRuns: 0,
      };
    }

    const employeeIds = cpEmployees.map((e) => e.id);
    const activeCount = cpEmployees.filter((e) => e.status === "active" || e.status === "on_leave").length;

    // Count pending items
    const [pendingLeaves, pendingAdj, pendingReimb] = await Promise.all([
      db
        .select({ total: count() })
        .from(leaveRecords)
        .where(
          and(
            inArray(leaveRecords.employeeId, employeeIds),
            eq(leaveRecords.status, "submitted")
          )
        ),
      db
        .select({ total: count() })
        .from(adjustments)
        .where(
          and(
            inArray(adjustments.employeeId, employeeIds),
            eq(adjustments.status, "submitted")
          )
        ),
      db
        .select({ total: count() })
        .from(reimbursements)
        .where(
          and(
            inArray(reimbursements.employeeId, employeeIds),
            eq(reimbursements.status, "submitted")
          )
        ),
    ]);

    return {
      activeEmployees: activeCount,
      pendingLeaves: pendingLeaves[0]?.total ?? 0,
      pendingAdjustments: pendingAdj[0]?.total ?? 0,
      pendingReimbursements: pendingReimb[0]?.total ?? 0,
      recentPayrollRuns: 0, // Will be computed below if needed
    };
  }),

  /**
   * List payroll items for CP's employees.
   * Joins payrollItems -> employees -> customers to enforce CP scope.
   */
  listPayrollItems: protectedCpProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        payrollMonth: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;

      // Get employee IDs for this CP
      const cpEmployees = await db
        .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, customerId: employees.customerId })
        .from(employees)
        .where(eq(employees.channelPartnerId, cpId));

      if (cpEmployees.length === 0) return { items: [], total: 0 };

      const employeeIds = cpEmployees.map((e) => e.id);
      const employeeMap = new Map(cpEmployees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

      // Get customer names
      const customerIds = Array.from(new Set(cpEmployees.map((e) => e.customerId)));
      const cpCustomers = await db
        .select({ id: customers.id, companyName: customers.companyName })
        .from(customers)
        .where(inArray(customers.id, customerIds));
      const customerMap = new Map(cpCustomers.map((c) => [c.id, c.companyName]));
      const empCustomerMap = new Map(cpEmployees.map((e) => [e.id, e.customerId]));

      // Get payroll items
      const conditions: SQL[] = [inArray(payrollItems.employeeId, employeeIds)];

      // If payrollMonth filter, find matching payroll runs first
      if (input.payrollMonth) {
        const matchingRuns = await db
          .select({ id: payrollRuns.id })
          .from(payrollRuns)
          .where(eq(payrollRuns.payrollMonth, input.payrollMonth));
        const runIds = matchingRuns.map((r) => r.id);
        if (runIds.length === 0) return { items: [], total: 0 };
        conditions.push(inArray(payrollItems.payrollRunId, runIds));
      }

      const whereClause = and(...conditions);
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(payrollItems)
          .where(whereClause)
          .orderBy(desc(payrollItems.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(payrollItems)
          .where(whereClause),
      ]);

      // Get payroll run info
      const runIds = Array.from(new Set(items.map((i) => i.payrollRunId)));
      const runs = runIds.length > 0
        ? await db
            .select({ id: payrollRuns.id, payrollMonth: payrollRuns.payrollMonth, countryCode: payrollRuns.countryCode, status: payrollRuns.status })
            .from(payrollRuns)
            .where(inArray(payrollRuns.id, runIds))
        : [];
      const runMap = new Map(runs.map((r) => [r.id, r]));

      const enrichedItems = items.map((item) => {
        const run = runMap.get(item.payrollRunId);
        const custId = empCustomerMap.get(item.employeeId);
        return {
          ...item,
          employeeName: employeeMap.get(item.employeeId) || "Unknown",
          customerName: custId ? customerMap.get(custId) || "Unknown" : "Unknown",
          payrollMonth: run?.payrollMonth || "N/A",
          countryCode: run?.countryCode || "N/A",
          payrollStatus: run?.status || "N/A",
        };
      });

      return {
        items: enrichedItems,
        total: totalResult[0]?.total ?? 0,
      };
    }),

  /**
   * List leave records for CP's employees.
   */
  listLeaveRecords: protectedCpProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;

      const cpEmployees = await db
        .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, customerId: employees.customerId })
        .from(employees)
        .where(eq(employees.channelPartnerId, cpId));

      if (cpEmployees.length === 0) return { items: [], total: 0 };

      const employeeIds = cpEmployees.map((e) => e.id);
      const employeeMap = new Map(cpEmployees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

      const conditions: SQL[] = [inArray(leaveRecords.employeeId, employeeIds)];
      if (input.status) conditions.push(eq(leaveRecords.status, input.status as any));

      const whereClause = and(...conditions);
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(leaveRecords)
          .where(whereClause)
          .orderBy(desc(leaveRecords.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(leaveRecords)
          .where(whereClause),
      ]);

      const enrichedItems = items.map((item) => ({
        ...item,
        employeeName: employeeMap.get(item.employeeId) || "Unknown",
      }));

      return {
        items: enrichedItems,
        total: totalResult[0]?.total ?? 0,
      };
    }),

  /**
   * List adjustments for CP's employees.
   */
  listAdjustments: protectedCpProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;

      const cpEmployees = await db
        .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.channelPartnerId, cpId));

      if (cpEmployees.length === 0) return { items: [], total: 0 };

      const employeeIds = cpEmployees.map((e) => e.id);
      const employeeMap = new Map(cpEmployees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

      const conditions: SQL[] = [inArray(adjustments.employeeId, employeeIds)];
      if (input.status) conditions.push(eq(adjustments.status, input.status as any));

      const whereClause = and(...conditions);
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(adjustments)
          .where(whereClause)
          .orderBy(desc(adjustments.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(adjustments)
          .where(whereClause),
      ]);

      const enrichedItems = items.map((item) => ({
        ...item,
        employeeName: employeeMap.get(item.employeeId) || "Unknown",
      }));

      return {
        items: enrichedItems,
        total: totalResult[0]?.total ?? 0,
      };
    }),

  /**
   * List reimbursements for CP's employees.
   */
  listReimbursements: protectedCpProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;

      const cpEmployees = await db
        .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.channelPartnerId, cpId));

      if (cpEmployees.length === 0) return { items: [], total: 0 };

      const employeeIds = cpEmployees.map((e) => e.id);
      const employeeMap = new Map(cpEmployees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

      const conditions: SQL[] = [inArray(reimbursements.employeeId, employeeIds)];
      if (input.status) conditions.push(eq(reimbursements.status, input.status as any));

      const whereClause = and(...conditions);
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(reimbursements)
          .where(whereClause)
          .orderBy(desc(reimbursements.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(reimbursements)
          .where(whereClause),
      ]);

      const enrichedItems = items.map((item) => ({
        ...item,
        employeeName: employeeMap.get(item.employeeId) || "Unknown",
      }));

      return {
        items: enrichedItems,
        total: totalResult[0]?.total ?? 0,
      };
    }),
});
