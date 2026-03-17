/**
 * Worker Leave Router
 *
 * Employee-only: submit leave requests, view leave balances and history.
 *
 * Workflow:
 * 1. Employee submits leave request (status: "submitted")
 * 2. Client approves/rejects via Client Portal
 * 3. Admin confirms via Admin Portal
 * 4. Leave balance is deducted upon admin approval
 *
 * Balance validation:
 * - When submitting paid leave, checks if sufficient balance exists
 * - If insufficient, returns a warning with available balance and suggests unpaid leave auto-split
 * - Matches the Client Portal logic: paid portion uses remaining balance, excess becomes unpaid leave
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  workerRouter,
  employeeOnlyProcedure,
} from "../workerTrpc";
import { getDb } from "../../services/db/connection";
import {
  leaveRecords,
  leaveBalances,
  leaveTypes,
  employees,
} from "../../../drizzle/schema";
import { eq, and, desc, count } from "drizzle-orm";
import {
  isLeavesCrossMonth,
  splitLeaveByMonth,
  getLeavePayrollMonth,
} from "../../utils/cutoff";

export const workerLeaveRouter = workerRouter({
  /**
   * Get leave balances for current year
   */
  getBalances: employeeOnlyProcedure.query(async ({ ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const employeeId = ctx.workerUser.employeeId!;
      const currentYear = new Date().getFullYear();

    const balances = await db
      .select({
        id: leaveBalances.id,
        leaveTypeId: leaveBalances.leaveTypeId,
        year: leaveBalances.year,
        totalEntitlement: leaveBalances.totalEntitlement,
        used: leaveBalances.used,
        remaining: leaveBalances.remaining,
        leaveTypeName: leaveTypes.leaveTypeName,
        isPaid: leaveTypes.isPaid,
        applicableGender: leaveTypes.applicableGender,
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
      .where(
        and(
          eq(leaveBalances.employeeId, employeeId),
          eq(leaveBalances.year, currentYear)
        )
      );

    // Filter out gender-mismatched balances where used === 0
    // Get employee gender for filtering
    const [empInfo] = await db
      .select({ gender: employees.gender })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    const empGender = empInfo?.gender;

    const filteredBalances = balances.filter(b => {
      const applicable = b.applicableGender || "all";
      if (applicable === "all") return true;
      if (!empGender || empGender === "other" || empGender === "prefer_not_to_say") return true;
      if (applicable === empGender) return true;
      // Gender mismatch: only show if used > 0 (preserve historical data)
      return (b.used ?? 0) > 0;
    });

    return filteredBalances;
  }),

  /**
   * Get available leave types for the employee's country
   */
  getLeaveTypes: employeeOnlyProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const employeeId = ctx.workerUser.employeeId!;

    // Get employee's country
    const [emp] = await db
      .select({ country: employees.country })
      .from(employees)
      .where(eq(employees.id, employeeId));

    if (!emp) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
    }

    const types = await db
      .select({
        id: leaveTypes.id,
        leaveTypeName: leaveTypes.leaveTypeName,
        isPaid: leaveTypes.isPaid,
        countryCode: leaveTypes.countryCode,
        applicableGender: leaveTypes.applicableGender,
      })
      .from(leaveTypes)
      .where(eq(leaveTypes.countryCode, emp.country));

    // Filter leave types by employee gender
    const [empGenderInfo] = await db
      .select({ gender: employees.gender })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    const empGender = empGenderInfo?.gender;

    const filteredTypes = types.filter(lt => {
      const applicable = lt.applicableGender || "all";
      if (applicable === "all") return true;
      if (!empGender || empGender === "other" || empGender === "prefer_not_to_say") return true;
      return applicable === empGender;
    });

    return filteredTypes;
  }),

  /**
   * Check leave balance before submission.
   * Returns balance info and whether an auto-split to unpaid leave will be needed.
   * Frontend should call this before submit to show a confirmation dialog if needed.
   */
  checkBalance: employeeOnlyProcedure
    .input(
      z.object({
        leaveTypeId: z.number(),
        days: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const employeeId = ctx.workerUser.employeeId!;
      const requestedDays = parseFloat(input.days);
      const currentYear = new Date().getFullYear();

      // Check if leave type is paid
      const [leaveType] = await db
        .select({ isPaid: leaveTypes.isPaid, leaveTypeName: leaveTypes.leaveTypeName })
        .from(leaveTypes)
        .where(eq(leaveTypes.id, input.leaveTypeId));

      if (!leaveType) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Leave type not found" });
      }

      // If unpaid leave, no balance check needed
      if (!leaveType.isPaid) {
        return {
          sufficient: true,
          isPaid: false,
          leaveTypeName: leaveType.leaveTypeName,
          requestedDays,
          remaining: null,
          paidDays: 0,
          unpaidDays: requestedDays,
          needsAutoSplit: false,
          hasUnpaidLeaveType: true,
        };
      }

      // Get balance
      const [balance] = await db
        .select({
          remaining: leaveBalances.remaining,
          used: leaveBalances.used,
          totalEntitlement: leaveBalances.totalEntitlement,
        })
        .from(leaveBalances)
        .where(
          and(
            eq(leaveBalances.employeeId, employeeId),
            eq(leaveBalances.leaveTypeId, input.leaveTypeId),
            eq(leaveBalances.year, currentYear)
          )
        );

      const remaining = balance ? Number(balance.remaining ?? 0) : 0;

      if (requestedDays <= remaining) {
        return {
          sufficient: true,
          isPaid: true,
          leaveTypeName: leaveType.leaveTypeName,
          requestedDays,
          remaining,
          paidDays: requestedDays,
          unpaidDays: 0,
          needsAutoSplit: false,
          hasUnpaidLeaveType: true,
        };
      }

      // Insufficient balance — check if unpaid leave type exists for this country
      const [emp] = await db
        .select({ country: employees.country })
        .from(employees)
        .where(eq(employees.id, employeeId));

      let hasUnpaidLeaveType = false;
      if (emp) {
        const [unpaidType] = await db
          .select({ id: leaveTypes.id })
          .from(leaveTypes)
          .where(and(eq(leaveTypes.countryCode, emp.country), eq(leaveTypes.isPaid, false)))
          .limit(1);
        hasUnpaidLeaveType = !!unpaidType;
      }

      const paidDays = Math.max(0, remaining);
      const unpaidDays = requestedDays - paidDays;

      return {
        sufficient: false,
        isPaid: true,
        leaveTypeName: leaveType.leaveTypeName,
        requestedDays,
        remaining,
        paidDays,
        unpaidDays,
        needsAutoSplit: hasUnpaidLeaveType,
        hasUnpaidLeaveType,
      };
    }),

  /**
   * List leave records with pagination
   */
  list: employeeOnlyProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.enum([
          "submitted", "client_approved", "client_rejected",
          "admin_approved", "admin_rejected", "locked",
        ]).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const employeeId = ctx.workerUser.employeeId!;
      const offset = (input.page - 1) * input.pageSize;

      const baseCondition = eq(leaveRecords.employeeId, employeeId);
      const whereCondition = input.status
        ? and(baseCondition, eq(leaveRecords.status, input.status))
        : baseCondition;

      const [totalResult] = await db
        .select({ count: count() })
        .from(leaveRecords)
        .where(whereCondition);

      const items = await db
        .select({
          id: leaveRecords.id,
          leaveTypeId: leaveRecords.leaveTypeId,
          startDate: leaveRecords.startDate,
          endDate: leaveRecords.endDate,
          days: leaveRecords.days,
          reason: leaveRecords.reason,
          status: leaveRecords.status,
          clientRejectionReason: leaveRecords.clientRejectionReason,
          adminRejectionReason: leaveRecords.adminRejectionReason,
          createdAt: leaveRecords.createdAt,
          leaveTypeName: leaveTypes.leaveTypeName,
          isPaid: leaveTypes.isPaid,
        })
        .from(leaveRecords)
        .innerJoin(leaveTypes, eq(leaveRecords.leaveTypeId, leaveTypes.id))
        .where(whereCondition)
        .limit(input.pageSize)
        .offset(offset)
        .orderBy(desc(leaveRecords.createdAt));

      return {
        items,
        total: totalResult?.count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * Submit a leave request.
   * Supports auto-split to unpaid leave when balance is insufficient.
   *
   * If `confirmAutoSplit` is true, the request will proceed even with insufficient balance,
   * splitting into paid + unpaid portions (matching Client Portal logic).
   */
  submit: employeeOnlyProcedure
    .input(
      z.object({
        leaveTypeId: z.number(),
        startDate: z.string(), // YYYY-MM-DD
        endDate: z.string(),   // YYYY-MM-DD
        days: z.string(), // Support half days, e.g. "1", "0.5", "3"
        reason: z.string().optional(),
        /** If true, proceed with auto-split to unpaid leave when balance is insufficient */
        confirmAutoSplit: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const employeeId = ctx.workerUser.employeeId!;

      // Get employee info
      const [emp] = await db
        .select({ country: employees.country })
        .from(employees)
        .where(eq(employees.id, employeeId));

      if (!emp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      // Verify leave type exists
      const [leaveType] = await db
        .select({
          id: leaveTypes.id,
          isPaid: leaveTypes.isPaid,
          leaveTypeName: leaveTypes.leaveTypeName,
          applicableGender: leaveTypes.applicableGender,
        })
        .from(leaveTypes)
        .where(eq(leaveTypes.id, input.leaveTypeId));

      if (!leaveType) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Leave type not found" });
      }

      // Validate gender compatibility with leave type
      if (leaveType.applicableGender && leaveType.applicableGender !== "all") {
        const [empGenderInfo] = await db
          .select({ gender: employees.gender })
          .from(employees)
          .where(eq(employees.id, employeeId))
          .limit(1);
        const empGender = empGenderInfo?.gender;
        if (empGender && empGender !== "other" && empGender !== "prefer_not_to_say" && leaveType.applicableGender !== empGender) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `This leave type (${leaveType.leaveTypeName}) is only applicable to ${leaveType.applicableGender} employees.` });
        }
      }

      const totalDays = parseFloat(input.days);
      const isPaid = leaveType.isPaid !== false;

      // Cross-month leave splitting (matching Client Portal behavior)
      const crossMonth = isLeavesCrossMonth(input.startDate, input.endDate);
      const splits = crossMonth
        ? splitLeaveByMonth(input.startDate, input.endDate, totalDays)
        : [{ startDate: input.startDate, endDate: input.endDate, days: totalDays, payrollMonth: getLeavePayrollMonth(input.endDate) }];

      // Check balance and auto-split if insufficient (paid leave only)
      const year = parseInt(input.endDate.split("-")[0], 10);
      let paidDays = totalDays;
      let unpaidDays = 0;
      let unpaidLeaveTypeId: number | null = null;
      let balanceSplit = false;

      if (isPaid) {
        // Get current balance
        const [balance] = await db
          .select({
            remaining: leaveBalances.remaining,
            used: leaveBalances.used,
          })
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.employeeId, employeeId),
              eq(leaveBalances.leaveTypeId, input.leaveTypeId),
              eq(leaveBalances.year, year)
            )
          );

        const remaining = balance ? Number(balance.remaining ?? 0) : 0;

        if (totalDays > remaining) {
          if (!input.confirmAutoSplit) {
            // Return error with balance info — frontend should show confirmation dialog
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: JSON.stringify({
                type: "INSUFFICIENT_BALANCE",
                remaining,
                requested: totalDays,
                paidDays: Math.max(0, remaining),
                unpaidDays: totalDays - Math.max(0, remaining),
              }),
            });
          }

          // User confirmed auto-split
          paidDays = Math.max(0, remaining);
          unpaidDays = totalDays - paidDays;

          // Find Unpaid Leave type for this country
          const [unpaidType] = await db
            .select({ id: leaveTypes.id })
            .from(leaveTypes)
            .where(and(eq(leaveTypes.countryCode, emp.country), eq(leaveTypes.isPaid, false)))
            .limit(1);

          if (!unpaidType) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Insufficient leave balance (${remaining} days remaining, ${totalDays} requested). No Unpaid Leave type configured for this country.`,
            });
          }

          unpaidLeaveTypeId = unpaidType.id;
          balanceSplit = true;
        }
      }

      // Helper to deduct balance
      const deductBalance = async (leaveTypeId: number, days: number, yr: number) => {
        const [bal] = await db
          .select({ id: leaveBalances.id, used: leaveBalances.used, remaining: leaveBalances.remaining })
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.employeeId, employeeId),
              eq(leaveBalances.leaveTypeId, leaveTypeId),
              eq(leaveBalances.year, yr)
            )
          )
          .limit(1);

        if (bal) {
          await db.update(leaveBalances).set({
            used: Math.max(0, (bal.used ?? 0) + days),
            remaining: Math.max(0, (bal.remaining ?? 0) - days),
          }).where(eq(leaveBalances.id, bal.id));
        }
      };

      // Create records
      if (balanceSplit) {
        // Create paid portion records
        if (paidDays > 0) {
          const paidRatio = paidDays / totalDays;
          for (const split of splits) {
            const splitPaidDays = Math.round(split.days * paidRatio * 10) / 10;
            if (splitPaidDays <= 0) continue;
            await db.insert(leaveRecords).values({
              employeeId,
              leaveTypeId: input.leaveTypeId,
              startDate: split.startDate,
              endDate: split.endDate,
              days: String(splitPaidDays),
              status: "submitted",
              reason: `${input.reason || ""}${input.reason ? " | " : ""}[Paid portion: ${splitPaidDays} days]`.trim(),
              submittedBy: ctx.workerUser.id,
            });
            const splitYear = parseInt(split.endDate.split("-")[0], 10);
            await deductBalance(input.leaveTypeId, splitPaidDays, splitYear);
          }
        }
        // Create unpaid portion records
        if (unpaidDays > 0 && unpaidLeaveTypeId) {
          const unpaidRatio = unpaidDays / totalDays;
          for (const split of splits) {
            const splitUnpaidDays = Math.round(split.days * unpaidRatio * 10) / 10;
            if (splitUnpaidDays <= 0) continue;
            await db.insert(leaveRecords).values({
              employeeId,
              leaveTypeId: unpaidLeaveTypeId,
              startDate: split.startDate,
              endDate: split.endDate,
              days: String(splitUnpaidDays),
              status: "submitted",
              reason: `${input.reason || ""}${input.reason ? " | " : ""}[Unpaid portion: ${splitUnpaidDays} days \u2014 auto-split due to insufficient balance]`.trim(),
              submittedBy: ctx.workerUser.id,
            });
          }
        }
        return { success: true, balanceSplit: true, paidDays, unpaidDays };
      } else {
        // Normal flow: sufficient balance or unpaid leave type
        for (const split of splits) {
          await db.insert(leaveRecords).values({
            employeeId,
            leaveTypeId: input.leaveTypeId,
            startDate: split.startDate,
            endDate: split.endDate,
            days: String(split.days),
            status: "submitted",
            reason: input.reason || null,
            submittedBy: ctx.workerUser.id,
          });
          // Deduct balance for paid leave
          if (isPaid) {
            const splitYear = parseInt(split.endDate.split("-")[0], 10);
            await deductBalance(input.leaveTypeId, split.days, splitYear);
          }
        }
        return { success: true, balanceSplit: false, paidDays: totalDays, unpaidDays: 0 };
      }
    }),

  /**
   * Cancel a leave request.
   * Only allowed when status is "submitted" (before any approval).
   */
  cancel: employeeOnlyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const employeeId = ctx.workerUser.employeeId!;

      const [record] = await db
        .select()
        .from(leaveRecords)
        .where(
          and(
            eq(leaveRecords.id, input.id),
            eq(leaveRecords.employeeId, employeeId)
          )
        );

      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Leave record not found" });
      }

      if (record.status !== "submitted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only cancel leave requests that are still pending review",
        });
      }

      // Restore balance if this was a paid leave type
      const [leaveType] = await db
        .select({ isPaid: leaveTypes.isPaid })
        .from(leaveTypes)
        .where(eq(leaveTypes.id, record.leaveTypeId));

      if (leaveType?.isPaid) {
        const days = parseFloat(record.days || "0");
        const year = parseInt((record.endDate || "").split("-")[0], 10) || new Date().getFullYear();

        const [bal] = await db
          .select({ id: leaveBalances.id, used: leaveBalances.used, remaining: leaveBalances.remaining })
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.employeeId, employeeId),
              eq(leaveBalances.leaveTypeId, record.leaveTypeId),
              eq(leaveBalances.year, year)
            )
          )
          .limit(1);

        if (bal) {
          await db.update(leaveBalances).set({
            used: Math.max(0, (bal.used ?? 0) - days),
            remaining: (bal.remaining ?? 0) + days,
          }).where(eq(leaveBalances.id, bal.id));
        }
      }

      // Delete the record
      await db
        .delete(leaveRecords)
        .where(eq(leaveRecords.id, input.id));

      return { success: true };
    }),
});
