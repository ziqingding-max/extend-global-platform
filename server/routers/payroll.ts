import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { operationsManagerProcedure, userProcedure } from "../procedures";
import {
  createPayrollRun,
  getPayrollRunById,
  listPayrollRuns,
  updatePayrollRun,
  createPayrollItem,
  listPayrollItemsByRun,
  updatePayrollItem,
  deletePayrollItem,
  getPayrollItemById,
  logAuditAction,
  getActiveEmployeesForPayroll,
  getCountryConfig,
  findPayrollRunByCountryMonth,
  getSubmittedAdjustmentsForPayroll,
  getSubmittedUnpaidLeaveForPayroll,
  getSubmittedReimbursementsForPayroll,
  updateAdjustment,
  updateLeaveRecord,
  updateReimbursement,
  getEmployeeById,
  lockSubmittedAdjustments,
  lockSubmittedLeaveRecords,
  lockSubmittedReimbursements,
} from "../db";

/**
 * Recalculate payroll run totals from all its items.
 * Called after any item add/update/delete to keep totals in sync.
 */
async function recalculatePayrollRunTotals(payrollRunId: number) {
  const items = await listPayrollItemsByRun(payrollRunId);
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  let totalEmployerCost = 0;

  for (const item of items) {
    totalGross += parseFloat((item as any).gross?.toString() ?? "0");
    const itemDeductions =
      parseFloat((item as any).deductions?.toString() ?? "0") +
      parseFloat((item as any).taxDeduction?.toString() ?? "0") +
      parseFloat((item as any).socialSecurityDeduction?.toString() ?? "0") +
      parseFloat((item as any).unpaidLeaveDeduction?.toString() ?? "0");
    totalDeductions += itemDeductions;
    totalNet += parseFloat((item as any).net?.toString() ?? "0");
    totalEmployerCost +=
      parseFloat((item as any).totalEmploymentCost?.toString() ?? "0");
  }

  await updatePayrollRun(payrollRunId, {
    totalGross: totalGross.toFixed(2),
    totalDeductions: totalDeductions.toFixed(2),
    totalNet: totalNet.toFixed(2),
    totalEmployerCost: totalEmployerCost.toFixed(2),
  } as any);
}

/**
 * Calculate item-level gross/net/totalEmploymentCost from individual fields.
 */
function calculateItemTotals(data: {
  baseSalary?: string;
  bonus?: string;
  allowances?: string;
  reimbursements?: string;
  deductions?: string;
  taxDeduction?: string;
  socialSecurityDeduction?: string;
  unpaidLeaveDeduction?: string;
  employerSocialContribution?: string;
}) {
  const baseSalary = parseFloat(data.baseSalary ?? "0");
  const bonus = parseFloat(data.bonus ?? "0");
  const allowances = parseFloat(data.allowances ?? "0");
  const reimbursements = parseFloat(data.reimbursements ?? "0");
  const deductions = parseFloat(data.deductions ?? "0");
  const taxDeduction = parseFloat(data.taxDeduction ?? "0");
  const socialSecurityDeduction = parseFloat(data.socialSecurityDeduction ?? "0");
  const unpaidLeaveDeduction = parseFloat(data.unpaidLeaveDeduction ?? "0");
  const employerSocialContribution = parseFloat(data.employerSocialContribution ?? "0");

  const gross = baseSalary + bonus + allowances - unpaidLeaveDeduction;
  const net = gross - deductions - taxDeduction - socialSecurityDeduction;
  const totalEmploymentCost = gross + employerSocialContribution + reimbursements;

  return {
    gross: gross.toFixed(2),
    net: net.toFixed(2),
    totalEmploymentCost: totalEmploymentCost.toFixed(2),
  };
}

/**
 * Given a payroll month string (YYYY-MM-DD or Date), compute the PREVIOUS month
 * in YYYY-MM-DD format.  N-month payroll run consumes (N-1)-month data.
 */
function getPrevMonth(payrollMonth: string | Date): string {
  let y: number, m: number;
  if (payrollMonth instanceof Date) {
    y = payrollMonth.getUTCFullYear();
    m = payrollMonth.getUTCMonth() + 1;
  } else {
    const parts = String(payrollMonth).split("-").map(Number);
    y = parts[0];
    m = parts[1];
  }
  let prevM = m - 1;
  let prevY = y;
  if (prevM < 1) {
    prevM = 12;
    prevY--;
  }
  return `${prevY}-${String(prevM).padStart(2, "0")}-01`;
}

/**
 * Normalize a payroll month (Date | string) to YYYY-MM-DD string.
 */
function normalizePayrollMonth(payrollMonth: string | Date): string {
  if (payrollMonth instanceof Date) {
    const y = payrollMonth.getUTCFullYear();
    const m = String(payrollMonth.getUTCMonth() + 1).padStart(2, "0");
    const d = String(payrollMonth.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(payrollMonth);
}

export const payrollRouter = router({
  list: userProcedure
    .input(
      z.object({
        status: z.string().optional(),
        countryCode: z.string().optional(),
        payrollMonth: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      return await listPayrollRuns(
        {
          status: input.status,
          countryCode: input.countryCode,
          payrollMonth: input.payrollMonth,
        },
        input.limit,
        input.offset
      );
    }),

  get: userProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getPayrollRunById(input.id);
    }),

  getItems: userProcedure
    .input(z.object({ payrollRunId: z.number() }))
    .query(async ({ input }) => {
      return await listPayrollItemsByRun(input.payrollRunId);
    }),

  // Create payroll run by country + period
  // Currency is auto-set from country's legal currency
  create: operationsManagerProcedure
    .input(
      z.object({
        countryCode: z.string(),
        payrollMonth: z.string(), // YYYY-MM-01 format
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Look up country config to get legal currency
      const countryConfig = await getCountryConfig(input.countryCode);
      if (!countryConfig) throw new TRPCError({ code: 'BAD_REQUEST', message: "Country configuration not found for " + input.countryCode });

      const currency = countryConfig.localCurrency;

      // Normalize payrollMonth to YYYY-MM-01 format string
      const parts = input.payrollMonth.split("-");
      const normalizedMonth = parts[0] + "-" + parts[1].padStart(2, "0") + "-01";

      // Check for duplicate: same country + same month
      const existing = await findPayrollRunByCountryMonth(input.countryCode, normalizedMonth);
      if (existing) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "A payroll run for " + input.countryCode + " in " + parts[0] + "-" + parts[1] + " already exists (ID: " + existing.id + ", Status: " + existing.status + ")" });
      }

      // Pass date as string for MySQL date column (Drizzle handles YYYY-MM-DD strings correctly)
      const result = await createPayrollRun({
        countryCode: input.countryCode,
        payrollMonth: normalizedMonth as any, // string for MySQL date column
        currency,
        status: "draft",
        notes: input.notes,
      });

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "create",
        entityType: "payroll_run",
        changes: JSON.stringify({ ...input, currency }),
      });

      return result;
    }),

  update: operationsManagerProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          status: z.enum(["draft", "pending_approval", "approved", "rejected"]).optional(),
          notes: z.string().optional(),
          rejectionReason: z.string().optional(),
          totalGross: z.string().optional(),
          totalDeductions: z.string().optional(),
          totalNet: z.string().optional(),
          totalEmployerCost: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const updateData: any = { ...input.data };

      // Set approval/submission metadata
      if (input.data.status === "pending_approval") {
        updateData.submittedBy = ctx.user.id;
        updateData.submittedAt = new Date();
      } else if (input.data.status === "approved") {
        updateData.approvedBy = ctx.user.id;
        updateData.approvedAt = new Date();
      } else if (input.data.status === "rejected") {
        updateData.rejectedBy = ctx.user.id;
        updateData.rejectedAt = new Date();
      }

      await updatePayrollRun(input.id, updateData);

      // When payroll run is submitted (pending_approval) or approved, auto-lock related adjustments/leave/reimbursements
      // N-month payroll run locks (N-1)-month data
      if (input.data.status === "pending_approval" || input.data.status === "approved") {
        const run = await getPayrollRunById(input.id);
        if (run) {
          const prevMonthDate = getPrevMonth(run.payrollMonth);
          const prevMonthPrefix = prevMonthDate.substring(0, 7);

          const adjLocked = await lockSubmittedAdjustments(prevMonthDate, run.countryCode, input.id);
          const leaveLocked = await lockSubmittedLeaveRecords(prevMonthPrefix, run.countryCode, input.id);
          const reimbLocked = await lockSubmittedReimbursements(prevMonthDate, run.countryCode, input.id);

          if (adjLocked > 0 || leaveLocked > 0 || reimbLocked > 0) {
            await logAuditAction({
              userId: ctx.user.id, userName: ctx.user.name || null,
              action: "payroll_submit_lock",
              entityType: "payroll_run",
              entityId: input.id,
              changes: JSON.stringify({ adjustmentsLocked: adjLocked, leaveRecordsLocked: leaveLocked, reimbursementsLocked: reimbLocked, month: prevMonthPrefix, country: run.countryCode }),
            });
          }
        }
      }

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update",
        entityType: "payroll_run",
        entityId: input.id,
        changes: JSON.stringify(input.data),
      });

      return { success: true };
    }),

  previewItem: operationsManagerProcedure
    .input(
      z.object({
        payrollRunId: z.number(),
        employeeId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const run = await getPayrollRunById(input.payrollRunId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run not found" });

      const emp = await getEmployeeById(input.employeeId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      // N-month payroll run consumes (N-1)-month data
      const prevMonthStr = getPrevMonth(run.payrollMonth);
      const prevMonthPrefix = prevMonthStr.substring(0, 7);

      // Get submitted/locked-unlinked adjustments for this employee (N-1 month)
      const allAdj = await getSubmittedAdjustmentsForPayroll(run.countryCode, prevMonthStr, ['admin_approved', 'locked']);
      const empAdj = allAdj.filter(a => a.employeeId === input.employeeId && (a.status === 'admin_approved' || !(a as any).payrollRunId));

      let totalBonus = 0, totalAllowances = 0, totalReimbursements = 0, totalDeductions = 0;
      const breakdown: any[] = [];
      for (const adj of empAdj) {
        const amount = parseFloat(adj.amount?.toString() ?? "0");
        switch (adj.adjustmentType) {
          case "bonus": totalBonus += amount; break;
          case "allowance": totalAllowances += amount; break;
          case "reimbursement": totalReimbursements += amount; break;
          case "deduction": totalDeductions += amount; break;
          case "other": totalAllowances += amount; break;
        }
        breakdown.push({ id: adj.id, type: adj.adjustmentType, category: adj.category, amount: adj.amount });
      }

      // Get submitted/locked-unlinked reimbursements for this employee (N-1 month)
      const allReimb = await getSubmittedReimbursementsForPayroll(run.countryCode, prevMonthStr, ['admin_approved', 'locked']);
      const empReimb = allReimb.filter(r => r.employeeId === input.employeeId && (r.status === 'admin_approved' || !(r as any).payrollRunId));
      for (const reimb of empReimb) {
        const amount = parseFloat(reimb.amount?.toString() ?? "0");
        totalReimbursements += amount;
        breakdown.push({ id: reimb.id, type: 'reimbursement', category: reimb.category, amount: reimb.amount, source: 'reimbursement_table' });
      }

      // Get submitted/locked-unlinked unpaid leave for this employee (N-1 month)
      const allLeave = await getSubmittedUnpaidLeaveForPayroll(run.countryCode, prevMonthPrefix, ['admin_approved', 'locked']);
      const empLeave = allLeave.filter(l => l.employeeId === input.employeeId && (l.status === 'admin_approved' || !(l as any).payrollRunId));
      let totalUnpaidDays = 0;
      for (const lv of empLeave) {
        totalUnpaidDays += parseFloat(lv.days?.toString() ?? "0");
      }

      const baseSalary = parseFloat(emp.baseSalary?.toString() ?? "0");

      // Calculate unpaid leave deduction: baseSalary / monthlyWorkingDays × days
      const countryConfig = await getCountryConfig(emp.country);
      const workingDaysPerWeek = countryConfig?.workingDaysPerWeek ?? 5;
      const monthlyWorkingDays = workingDaysPerWeek * 4.33;
      const totalUnpaidDeduction = monthlyWorkingDays > 0
        ? Math.round((baseSalary / monthlyWorkingDays) * totalUnpaidDays * 100) / 100
        : 0;

      return {
        baseSalary: baseSalary.toFixed(2),
        bonus: totalBonus.toFixed(2),
        allowances: totalAllowances.toFixed(2),
        reimbursements: totalReimbursements.toFixed(2),
        deductions: totalDeductions.toFixed(2),
        unpaidLeaveDeduction: totalUnpaidDeduction.toFixed(2),
        unpaidLeaveDays: totalUnpaidDays.toFixed(1),
        adjustmentsBreakdown: breakdown,
        currency: emp.salaryCurrency || run.currency,
      };
    }),

  addItem: operationsManagerProcedure
    .input(
      z.object({
        payrollRunId: z.number(),
        employeeId: z.number(),
        baseSalary: z.string(),
        bonus: z.string().default("0"),
        allowances: z.string().default("0"),
        reimbursements: z.string().default("0"),
        deductions: z.string().default("0"),
        taxDeduction: z.string().default("0"),
        socialSecurityDeduction: z.string().default("0"),
        unpaidLeaveDeduction: z.string().default("0"),
        unpaidLeaveDays: z.string().default("0"),
        employerSocialContribution: z.string().default("0"),
        currency: z.string().default("USD"),
        notes: z.string().optional(),
        adjustmentsBreakdown: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Validate: employee must be in the same country as the payroll run
      const payrollRun = await getPayrollRunById(input.payrollRunId);
      if (!payrollRun) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run not found" });

      const employee = await getEmployeeById(input.employeeId);
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      if (employee.country !== payrollRun.countryCode) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Employee is in ${employee.country}, but this payroll run is for ${payrollRun.countryCode}. Only employees from the same country can be added.` });
      }

      // Validate: no duplicate employee in the same payroll run
      const existingItems = await listPayrollItemsByRun(input.payrollRunId);
      const duplicate = existingItems?.find((item: any) => item.employeeId === input.employeeId);
      if (duplicate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Employee ${employee.firstName} ${employee.lastName} is already in this payroll run.` });
      }

      // N-month payroll run consumes (N-1)-month data
      const prevMonthStr = getPrevMonth(payrollRun.payrollMonth);
      const prevMonthPrefix = prevMonthStr.substring(0, 7);

      // 1. Fetch Adjustments (admin_approved or locked-but-unlinked from N-1 month)
      const allAdj = await getSubmittedAdjustmentsForPayroll(input.employeeId, prevMonthStr, ['admin_approved', 'locked']);
      let totalBonus = 0;
      let totalAllowances = 0;
      let totalReimbursements = 0;
      let totalDeductions = 0;
      const adjustmentsBreakdown: any[] = [];
      const lockedAdjustmentIds: number[] = [];

      for (const adj of allAdj) {
        // Skip locked adjustments already linked to another payroll run
        if (adj.status === 'locked' && (adj as any).payrollRunId) continue;
        const amount = parseFloat(adj.amount?.toString() ?? "0");
        switch (adj.adjustmentType) {
          case "bonus": totalBonus += amount; break;
          case "allowance": totalAllowances += amount; break;
          case "reimbursement": totalReimbursements += amount; break;
          case "deduction": totalDeductions += amount; break;
          case "other": totalAllowances += amount; break;
        }
        adjustmentsBreakdown.push({
          id: adj.id,
          type: adj.adjustmentType,
          category: adj.category,
          description: adj.description,
          amount: adj.amount,
        });
        lockedAdjustmentIds.push(adj.id);
      }

      // 2. Fetch standalone Reimbursements (N-1 month)
      const allReimb = await getSubmittedReimbursementsForPayroll(input.employeeId, prevMonthStr, ['admin_approved', 'locked']);
      const lockedReimbursementIds: number[] = [];
      for (const reimb of allReimb) {
        if (reimb.status === 'locked' && (reimb as any).payrollRunId) continue;
        const amount = parseFloat(reimb.amount?.toString() ?? "0");
        totalReimbursements += amount;
        adjustmentsBreakdown.push({
          id: reimb.id,
          type: 'reimbursement',
          category: reimb.category,
          description: reimb.description,
          amount: reimb.amount,
          source: 'reimbursement_table',
        });
        lockedReimbursementIds.push(reimb.id);
      }

      // 3. Fetch Unpaid Leave (N-1 month)
      const allLeave = await getSubmittedUnpaidLeaveForPayroll(input.employeeId, prevMonthPrefix, ['admin_approved', 'locked']);
      let totalUnpaidDays = 0;
      const lockedLeaveIds: number[] = [];

      for (const lv of allLeave) {
        totalUnpaidDays += parseFloat(lv.days?.toString() ?? "0");
        lockedLeaveIds.push(lv.id);
      }

      const baseSalary = parseFloat(employee.baseSalary?.toString() ?? "0");

      // Calculate unpaid leave deduction
      const countryConfig = await getCountryConfig(payrollRun.countryCode);
      const workingDaysPerWeek = countryConfig?.workingDaysPerWeek ?? 5;
      const monthlyWorkingDays = workingDaysPerWeek * 4.33;
      const totalUnpaidDeduction = monthlyWorkingDays > 0
        ? Math.round((baseSalary / monthlyWorkingDays) * totalUnpaidDays * 100) / 100
        : 0;

      // Use calculated values, but allow manual overrides if input is non-zero
      // (However, typically "Add" just sends defaults, so we prioritize calculated)
      const inputBase = parseFloat(input.baseSalary);
      const finalBaseSalary = inputBase > 0 ? inputBase : baseSalary;

      const itemFields = {
        baseSalary: finalBaseSalary.toFixed(2),
        bonus: totalBonus.toFixed(2),
        allowances: totalAllowances.toFixed(2),
        reimbursements: totalReimbursements.toFixed(2),
        deductions: totalDeductions.toFixed(2),
        taxDeduction: input.taxDeduction,
        socialSecurityDeduction: input.socialSecurityDeduction,
        unpaidLeaveDeduction: totalUnpaidDeduction.toFixed(2),
        employerSocialContribution: input.employerSocialContribution,
      };

      const totals = calculateItemTotals(itemFields);

      const result = await createPayrollItem({
        payrollRunId: input.payrollRunId,
        employeeId: input.employeeId,
        ...itemFields,
        unpaidLeaveDays: totalUnpaidDays.toFixed(1),
        gross: totals.gross,
        net: totals.net,
        totalEmploymentCost: totals.totalEmploymentCost,
        currency: employee.salaryCurrency || payrollRun.currency,
        notes: input.notes,
        adjustmentsBreakdown: adjustmentsBreakdown.length > 0 ? adjustmentsBreakdown : undefined,
      });

      // Recalculate payroll run totals
      await recalculatePayrollRunTotals(input.payrollRunId);

      // Lock aggregated adjustments (with payrollRunId)
      for (const adjId of lockedAdjustmentIds) {
        await updateAdjustment(adjId, { status: "locked", payrollRunId: input.payrollRunId } as any);
      }

      // Lock aggregated reimbursements (with payrollRunId)
      for (const reimbId of lockedReimbursementIds) {
        await updateReimbursement(reimbId, { status: "locked", payrollRunId: input.payrollRunId } as any);
      }

      // Lock aggregated leave records (with payrollRunId)
      for (const leaveId of lockedLeaveIds) {
        await updateLeaveRecord(leaveId, { status: "locked", payrollRunId: input.payrollRunId } as any);
      }

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "create",
        entityType: "payroll_item",
        changes: JSON.stringify(input),
      });

      return result;
    }),

  updateItem: operationsManagerProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          baseSalary: z.string().optional(),
          bonus: z.string().optional(),
          allowances: z.string().optional(),
          reimbursements: z.string().optional(),
          deductions: z.string().optional(),
          taxDeduction: z.string().optional(),
          socialSecurityDeduction: z.string().optional(),
          unpaidLeaveDeduction: z.string().optional(),
          unpaidLeaveDays: z.string().optional(),
          employerSocialContribution: z.string().optional(),
          notes: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get existing item to know payrollRunId and merge with existing values
      const existingItem = await getPayrollItemById(input.id);
      if (!existingItem) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll item not found" });

      // Merge: use new value if provided, otherwise keep existing
      const merged = {
        baseSalary: input.data.baseSalary ?? existingItem.baseSalary?.toString() ?? "0",
        bonus: input.data.bonus ?? existingItem.bonus?.toString() ?? "0",
        allowances: input.data.allowances ?? existingItem.allowances?.toString() ?? "0",
        reimbursements: input.data.reimbursements ?? existingItem.reimbursements?.toString() ?? "0",
        deductions: input.data.deductions ?? existingItem.deductions?.toString() ?? "0",
        taxDeduction: input.data.taxDeduction ?? existingItem.taxDeduction?.toString() ?? "0",
        socialSecurityDeduction: input.data.socialSecurityDeduction ?? existingItem.socialSecurityDeduction?.toString() ?? "0",
        unpaidLeaveDeduction: input.data.unpaidLeaveDeduction ?? existingItem.unpaidLeaveDeduction?.toString() ?? "0",
        employerSocialContribution: input.data.employerSocialContribution ?? existingItem.employerSocialContribution?.toString() ?? "0",
      };

      // Recalculate item-level totals
      const totals = calculateItemTotals(merged);

      await updatePayrollItem(input.id, {
        ...input.data,
        gross: totals.gross,
        net: totals.net,
        totalEmploymentCost: totals.totalEmploymentCost,
      } as any);

      // Recalculate payroll run totals
      await recalculatePayrollRunTotals(existingItem.payrollRunId);

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update",
        entityType: "payroll_item",
        entityId: input.id,
        changes: JSON.stringify(input.data),
      });

      return { success: true };
    }),

  deleteItem: operationsManagerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Get item to know payrollRunId and employeeId before deleting
      const existingItem = await getPayrollItemById(input.id);
      if (!existingItem) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll item not found" });

      const payrollRunId = existingItem.payrollRunId;
      const employeeId = existingItem.employeeId;

      // Rollback: unlock associated adjustments, reimbursements, and leave records
      // that were locked and linked to this payroll run for this employee
      const { getDb } = await import("../db");
      const db = getDb();
      if (db) {
        const { adjustments, reimbursements, leaveRecords } = await import("../../drizzle/schema");
        const { and, eq } = await import("drizzle-orm");

        // Unlock adjustments: locked + payrollRunId = this run + employeeId
        await db.update(adjustments)
          .set({ status: "admin_approved", payrollRunId: null } as any)
          .where(and(
            eq(adjustments.status, "locked"),
            eq(adjustments.payrollRunId as any, payrollRunId),
            eq(adjustments.employeeId, employeeId),
          ));

        // Unlock reimbursements: locked + payrollRunId = this run + employeeId
        await db.update(reimbursements)
          .set({ status: "admin_approved", payrollRunId: null } as any)
          .where(and(
            eq(reimbursements.status, "locked"),
            eq(reimbursements.payrollRunId as any, payrollRunId),
            eq(reimbursements.employeeId, employeeId),
          ));

        // Unlock leave records: locked + payrollRunId = this run + employeeId
        await db.update(leaveRecords)
          .set({ status: "admin_approved", payrollRunId: null } as any)
          .where(and(
            eq(leaveRecords.status, "locked"),
            eq((leaveRecords as any).payrollRunId, payrollRunId),
            eq(leaveRecords.employeeId, employeeId),
          ));
      }

      await deletePayrollItem(input.id);

      // Recalculate payroll run totals after deletion
      await recalculatePayrollRunTotals(payrollRunId);

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "delete",
        entityType: "payroll_item",
        entityId: input.id,
        changes: JSON.stringify({ rolledBack: true, employeeId }),
      });

      return { success: true };
    }),

  /**
   * Get counts of pending review items (client_approved but not yet admin_approved)
   * for a given payroll run's country and month.
   * Used by frontend to show a warning before auto-fill.
   */
  getPendingReviewCounts: operationsManagerProcedure
    .input(z.object({ payrollRunId: z.number() }))
    .query(async ({ input }) => {
      const run = await getPayrollRunById(input.payrollRunId);
      if (!run) throw new TRPCError({ code: 'BAD_REQUEST', message: "Payroll run not found" });

      // N-month payroll run checks (N-1)-month pending data
      const prevMonthDate = getPrevMonth(run.payrollMonth);
      const prevMonthPrefix = prevMonthDate.substring(0, 7);

      // Count items still in submitted or client_approved (not yet admin_approved)
      const { getDb } = await import("../db");
      const db = getDb();
      if (!db) throw new Error("Database not initialized");
      const { leaveRecords, adjustments, reimbursements } = await import("../../drizzle/schema");
      const { and, eq, inArray, sql, gte, lt } = await import("drizzle-orm");

      // Leave records use startDate (YYYY-MM-DD), filter by N-1 month range
      const monthStartDate = prevMonthDate;
      const [y, m] = prevMonthPrefix.split("-").map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

      // Count pending leaves (submitted or client_approved) for N-1 month
      const pendingLeaves = await db.select({ count: sql<number>`count(*)` })
        .from(leaveRecords)
        .where(and(
          inArray(leaveRecords.status, ["submitted", "client_approved"]),
          gte(leaveRecords.startDate, monthStartDate),
          lt(leaveRecords.startDate, nextMonth),
        ));

      // Count pending adjustments (submitted or client_approved) for N-1 month
      const pendingAdjustments = await db.select({ count: sql<number>`count(*)` })
        .from(adjustments)
        .where(and(
          inArray(adjustments.status, ["submitted", "client_approved"]),
          eq(adjustments.effectiveMonth, prevMonthDate),
        ));

      // Count pending reimbursements (submitted or client_approved) for N-1 month
      const pendingReimbursements = await db.select({ count: sql<number>`count(*)` })
        .from(reimbursements)
        .where(and(
          inArray(reimbursements.status, ["submitted", "client_approved"]),
          eq(reimbursements.effectiveMonth, prevMonthDate),
        ));

      return {
        pendingLeaves: Number(pendingLeaves[0]?.count ?? 0),
        pendingAdjustments: Number(pendingAdjustments[0]?.count ?? 0),
        pendingReimbursements: Number(pendingReimbursements[0]?.count ?? 0),
        total: Number(pendingLeaves[0]?.count ?? 0) + Number(pendingAdjustments[0]?.count ?? 0) + Number(pendingReimbursements[0]?.count ?? 0),
      };
    }),

  /**
   * Auto-fill payroll items for all active employees in the payroll run's country.* Now integrates:
   * - Adjustments: aggregates submitted adjustments (bonus/allowance/reimbursement/deduction) per employee
   * - Leave: aggregates submitted unpaid leave deductions per employee
   * After auto-fill, linked adjustments and leave records are locked.
   */
  autoFill: operationsManagerProcedure
    .input(z.object({ payrollRunId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const run = await getPayrollRunById(input.payrollRunId);
      if (!run) throw new TRPCError({ code: 'BAD_REQUEST', message: "Payroll run not found" });

      // N-month payroll run consumes (N-1)-month data
      const prevMonthStr = getPrevMonth(run.payrollMonth);
      const prevMonthPrefix = prevMonthStr.substring(0, 7);

      // Get all active employees in this country (across all customers)
      const activeEmployees = await getActiveEmployeesForPayroll(run.countryCode);

      const existingItems = await listPayrollItemsByRun(input.payrollRunId);
      const existingEmployeeIds = new Set(existingItems.map((i: any) => i.employeeId));

      // Fetch admin_approved + locked-but-unlinked adjustments for N-1 month
      const allAdjustments = await getSubmittedAdjustmentsForPayroll(run.countryCode, prevMonthStr, ['admin_approved', 'locked']);

      // Group adjustments by employeeId (skip locked ones already linked to a payroll run)
      const adjByEmployee = new Map<number, typeof allAdjustments>();
      for (const adj of allAdjustments) {
        if (adj.status === 'locked' && (adj as any).payrollRunId) continue;
        const list = adjByEmployee.get(adj.employeeId) ?? [];
        list.push(adj);
        adjByEmployee.set(adj.employeeId, list);
      }

      // Fetch admin_approved + locked-but-unlinked reimbursements for N-1 month
      const allReimbursements = await getSubmittedReimbursementsForPayroll(run.countryCode, prevMonthStr, ['admin_approved', 'locked']);

      // Group reimbursements by employeeId (skip locked ones already linked)
      const reimbByEmployee = new Map<number, typeof allReimbursements>();
      for (const reimb of allReimbursements) {
        if (reimb.status === 'locked' && (reimb as any).payrollRunId) continue;
        const list = reimbByEmployee.get(reimb.employeeId) ?? [];
        list.push(reimb);
        reimbByEmployee.set(reimb.employeeId, list);
      }

      // Fetch admin_approved + locked-but-unlinked unpaid leave for N-1 month
      const allUnpaidLeave = await getSubmittedUnpaidLeaveForPayroll(run.countryCode, prevMonthPrefix, ['admin_approved', 'locked']);

      // Group unpaid leave by employeeId
      const leaveByEmployee = new Map<number, typeof allUnpaidLeave>();
      for (const lv of allUnpaidLeave) {
        const list = leaveByEmployee.get(lv.employeeId) ?? [];
        list.push(lv);
        leaveByEmployee.set(lv.employeeId, list);
      }

      const newItems = [];
      const lockedAdjustmentIds: number[] = [];
      const lockedLeaveIds: number[] = [];
      const lockedReimbursementIds: number[] = [];

      for (const emp of activeEmployees) {
        if (existingEmployeeIds.has(emp.id)) continue;

        const baseSalary = parseFloat(emp.baseSalary?.toString() ?? "0");

        // Aggregate adjustments for this employee
        const empAdj = adjByEmployee.get(emp.id) ?? [];
        let totalBonus = 0;
        let totalAllowances = 0;
        let totalReimbursements = 0;
        let totalDeductions = 0;
        const adjustmentsBreakdown: any[] = [];

        for (const adj of empAdj) {
          const amount = parseFloat(adj.amount?.toString() ?? "0");
          switch (adj.adjustmentType) {
            case "bonus":
              totalBonus += amount;
              break;
            case "allowance":
              totalAllowances += amount;
              break;
            case "reimbursement":
              totalReimbursements += amount;
              break;
            case "deduction":
              totalDeductions += amount;
              break;
            case "other":
              // Treat "other" as allowance by default
              totalAllowances += amount;
              break;
          }
          adjustmentsBreakdown.push({
            id: adj.id,
            type: adj.adjustmentType,
            category: adj.category,
            description: adj.description,
            amount: adj.amount,
          });
          lockedAdjustmentIds.push(adj.id);
        }

        // Aggregate standalone reimbursements for this employee
        const empReimb = reimbByEmployee.get(emp.id) ?? [];
        for (const reimb of empReimb) {
          const amount = parseFloat(reimb.amount?.toString() ?? "0");
          totalReimbursements += amount;
          adjustmentsBreakdown.push({
            id: reimb.id,
            type: 'reimbursement',
            category: reimb.category,
            description: reimb.description,
            amount: reimb.amount,
            source: 'reimbursement_table',
          });
          lockedReimbursementIds.push(reimb.id);
        }

        // Aggregate unpaid leave for this employee
        const empLeave = leaveByEmployee.get(emp.id) ?? [];
        let totalUnpaidDays = 0;

        for (const lv of empLeave) {
          totalUnpaidDays += parseFloat(lv.days?.toString() ?? "0");
          lockedLeaveIds.push(lv.id);
        }

        // Calculate unpaid leave deduction: baseSalary / monthlyWorkingDays × days
        const countryConfig = await getCountryConfig(run.countryCode);
        const workingDaysPerWeek = countryConfig?.workingDaysPerWeek ?? 5;
        const monthlyWorkingDays = workingDaysPerWeek * 4.33;
        const totalUnpaidDeduction = monthlyWorkingDays > 0
          ? Math.round((baseSalary / monthlyWorkingDays) * totalUnpaidDays * 100) / 100
          : 0;

        // Calculate totals using shared helper
        const itemFields = {
          baseSalary: baseSalary.toFixed(2),
          bonus: totalBonus.toFixed(2),
          allowances: totalAllowances.toFixed(2),
          reimbursements: totalReimbursements.toFixed(2),
          deductions: totalDeductions.toFixed(2),
          taxDeduction: "0",
          socialSecurityDeduction: "0",
          unpaidLeaveDeduction: totalUnpaidDeduction.toFixed(2),
          employerSocialContribution: "0",
        };
        const totals = calculateItemTotals(itemFields);

        const itemData = {
          payrollRunId: input.payrollRunId,
          employeeId: emp.id,
          ...itemFields,
          unpaidLeaveDays: totalUnpaidDays.toFixed(1),
          gross: totals.gross,
          net: totals.net,
          totalEmploymentCost: totals.totalEmploymentCost,
          currency: emp.salaryCurrency || run.currency,
          adjustmentsBreakdown: adjustmentsBreakdown.length > 0 ? adjustmentsBreakdown : undefined,
        };
        await createPayrollItem(itemData);
        newItems.push(itemData);
      }

      // Recalculate payroll run totals from ALL items (existing + new)
      await recalculatePayrollRunTotals(input.payrollRunId);

      // Lock all aggregated adjustments (with payrollRunId)
      for (const adjId of lockedAdjustmentIds) {
        await updateAdjustment(adjId, { status: "locked", payrollRunId: input.payrollRunId } as any);
      }

      // Lock all aggregated leave records (with payrollRunId)
      for (const leaveId of lockedLeaveIds) {
        await updateLeaveRecord(leaveId, { status: "locked", payrollRunId: input.payrollRunId } as any);
      }

      // Lock all aggregated standalone reimbursements (with payrollRunId)
      for (const reimbId of lockedReimbursementIds) {
        await updateReimbursement(reimbId, { status: "locked", payrollRunId: input.payrollRunId } as any);
      }

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "auto_fill",
        entityType: "payroll_run",
        entityId: input.payrollRunId,
        changes: JSON.stringify({
          employeesAdded: newItems.length,
          adjustmentsLocked: lockedAdjustmentIds.length,
          leaveRecordsLocked: lockedLeaveIds.length,
          reimbursementsLocked: lockedReimbursementIds.length,
        }),
      });

      return {
        success: true,
        itemsAdded: newItems.length,
        adjustmentsLocked: lockedAdjustmentIds.length,
        leaveRecordsLocked: lockedLeaveIds.length,
        reimbursementsLocked: lockedReimbursementIds.length,
      };
    }),
});
