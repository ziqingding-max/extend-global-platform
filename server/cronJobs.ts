/**
 * Cron Jobs Module
 * 
 * 1. Daily 00:01 (Beijing time): Auto-transition contract_signed → active employees
 *    - When startDate <= today, auto-activate
 *    - If activation date <= 15th of month, auto-add to current month payroll (pro-rata)
 *    - If activation date > 15th, skip current month
 * 
 * 2. Monthly 5th 00:00 (Beijing time): Auto-lock previous month's submitted adjustments/leave
 *    - Cutoff is 4th 23:59 Beijing time
 *    - All submitted adjustments → locked
 *    - All submitted leave_records → locked
 * 
 * 3. Monthly 5th 00:01 (Beijing time): Auto-create next month draft payroll runs
 *    - For all countries with active employees
 *    - Auto-fill with eligible employees and pro-rata calculation
 *    - Aggregate LOCKED adjustments/leave into payroll items
 */

import cron from "node-cron";
import { fetchAndStoreExchangeRates } from "./services/exchangeRateFetchService";
import {
  getContractSignedEmployeesReadyForActivation,
  getOffboardingEmployeesReadyForTermination,
  updateEmployee,
  getCountriesWithActiveEmployees,
  getEmployeesForPayrollMonth,
  findPayrollRunByCountryMonth,
  createPayrollRun,
  createPayrollItem,
  getSystemConfig,
  logAuditAction,
  lockSubmittedAdjustments,
  lockSubmittedLeaveRecords,
  lockSubmittedReimbursements,
  lockContractorAdjustments,
  lockContractorMilestones,
  getLockedContractorAdjustments,
  getLockedContractorMilestones,
  getActiveContractorsByFrequency,
  getSubmittedAdjustmentsForPayroll,
  getSubmittedUnpaidLeaveForPayroll,
  getSubmittedReimbursementsForPayroll,
  updatePayrollRun,
  getEmployeeById,
  getAllActiveLeaveRecordsForDate,
  getOnLeaveEmployeesWithExpiredLeave,
  initializeLeaveBalancesForEmployee,
  listEmployees,
  listLeaveBalances,
  updateLeaveBalance,
  getCustomerLeavePoliciesForCountry,
  createAdjustment,
} from "./db";
import { notificationService } from "./services/notificationService";
import { generateDepositRefund } from "./services/depositRefundService";
import { ContractorInvoiceGenerationService } from "./services/contractorInvoiceGenerationService";
import { autoInitializeLeavePolicyForCountry } from "./services/leaveAutoInitService";
import { countriesConfig } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

// ============================================================================
// UTILITY: Working days calculation for pro-rata
// ============================================================================

function getWorkingDaysInMonth(year: number, month: number, workingDaysPerWeek: number = 5): number {
  const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-indexed here
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay(); // 0=Sun, 6=Sat
    if (workingDaysPerWeek >= 6) {
      // 6-day work week: Mon-Sat
      if (dayOfWeek !== 0) workingDays++;
    } else {
      // 5-day work week: Mon-Fri
      if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDays++;
    }
  }
  return workingDays;
}

function getWorkingDaysFromDate(year: number, month: number, startDay: number, workingDaysPerWeek: number = 5): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;
  for (let d = startDay; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    if (workingDaysPerWeek >= 6) {
      if (dayOfWeek !== 0) workingDays++;
    } else {
      if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDays++;
    }
  }
  return workingDays;
}

/**
 * Helper: count working days from day 1 up to (and including) endDay in a given month.
 */
function getWorkingDaysUntilDate(year: number, month: number, endDay: number, workingDaysPerWeek: number = 5): number {
  let workingDays = 0;
  for (let d = 1; d <= endDay; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    if (workingDaysPerWeek >= 6) {
      if (dayOfWeek !== 0) workingDays++;
    } else {
      if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDays++;
    }
  }
  return workingDays;
}

/**
 * Calculate pro-rata salary for an employee.
 * Supports both start-of-month (onboarding) and end-of-month (offboarding) pro-rata.
 * 
 * @param baseSalary - Monthly base salary
 * @param startDate - Employee start date
 * @param payrollYear - Payroll period year
 * @param payrollMonth - Payroll period month (1-indexed)
 * @param workingDaysPerWeek - Working days per week (default 5)
 * @param endDate - Optional employee end date (last working day) for offboarding pro-rata
 */
export function calculateProRata(
  baseSalary: number,
  startDate: Date,
  payrollYear: number,
  payrollMonth: number,
  workingDaysPerWeek: number = 5,
  endDate?: Date | null,
): { proRataAmount: number; totalWorkingDays: number; workedDays: number } {
  const totalWorkingDays = getWorkingDaysInMonth(payrollYear, payrollMonth, workingDaysPerWeek);
  
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1; // 1-indexed
  const startDay = startDate.getDate();

  // Determine the effective first and last working day in this payroll month
  let effectiveStartDay = 1;
  let effectiveEndDay = new Date(payrollYear, payrollMonth, 0).getDate(); // last day of month

  // If employee started in this month, adjust start day
  const startedThisMonth = startYear === payrollYear && startMonth === payrollMonth;
  // If employee started after this month, they shouldn't be in payroll
  const startedAfterThisMonth = startYear > payrollYear || (startYear === payrollYear && startMonth > payrollMonth);
  
  if (startedAfterThisMonth) {
    return { proRataAmount: 0, totalWorkingDays, workedDays: 0 };
  }

  if (startedThisMonth) {
    effectiveStartDay = startDay;
  }

  // If employee has an endDate in this month, adjust end day (offboarding pro-rata)
  if (endDate) {
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1;
    const endDay = endDate.getDate();

    // If endDate is before this month, employee shouldn't be in payroll
    if (endYear < payrollYear || (endYear === payrollYear && endMonth < payrollMonth)) {
      return { proRataAmount: 0, totalWorkingDays, workedDays: 0 };
    }

    // If endDate is in this month, cap the working days
    if (endYear === payrollYear && endMonth === payrollMonth) {
      effectiveEndDay = endDay;
    }
    // If endDate is after this month, no adjustment needed (full month)
  }

  // If started before this month and no endDate in this month, full salary
  if (!startedThisMonth && effectiveEndDay === new Date(payrollYear, payrollMonth, 0).getDate()) {
    return { proRataAmount: baseSalary, totalWorkingDays, workedDays: totalWorkingDays };
  }

  // Calculate working days in the effective range
  let workedDays = 0;
  for (let d = effectiveStartDay; d <= effectiveEndDay; d++) {
    const dayOfWeek = new Date(payrollYear, payrollMonth - 1, d).getDay();
    if (workingDaysPerWeek >= 6) {
      if (dayOfWeek !== 0) workedDays++;
    } else {
      if (dayOfWeek !== 0 && dayOfWeek !== 6) workedDays++;
    }
  }

  const proRataAmount = totalWorkingDays > 0 ? (baseSalary * workedDays) / totalWorkingDays : 0;
  return { proRataAmount: Math.round(proRataAmount * 100) / 100, totalWorkingDays, workedDays };
}

// ============================================================================
// CRON JOB 1: Daily employee status auto-transition
// ============================================================================

export async function runEmployeeAutoActivation(): Promise<{ activated: number; addedToPayroll: number }> {
  const today = new Date();
  // Format as YYYY-MM-DD in Beijing time
  const beijingOffset = 8 * 60; // UTC+8
  const beijingDate = new Date(today.getTime() + (beijingOffset - today.getTimezoneOffset()) * 60000);
  const todayStr = beijingDate.toISOString().split("T")[0];
  const dayOfMonth = beijingDate.getDate();
  const currentYear = beijingDate.getFullYear();
  const currentMonth = beijingDate.getMonth() + 1; // 1-indexed

  console.log(`[CronJob] Employee auto-activation check for ${todayStr}`);

  // Get mid-month cutoff from system config (default 15)
  const midMonthCutoff = parseInt(await getSystemConfig("mid_month_activation_cutoff") ?? "15", 10);

  // Find employees ready for activation
  const readyEmployees = await getContractSignedEmployeesReadyForActivation(todayStr);
  
  let activated = 0;
  let addedToPayroll = 0;

  for (const emp of readyEmployees) {
    // Transition to active
    await updateEmployee(emp.id, { status: "active" });
    activated++;

    console.log(`[CronJob] Activated employee ${emp.employeeCode} (${emp.firstName} ${emp.lastName})`);

    // Send employee activated notification to client
    notificationService.send({
      type: "employee_activated",
      customerId: emp.customerId,
      data: {
        employeeName: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        country: emp.country,
        startDate: emp.startDate,
      }
    }).catch(err => console.error(`[CronJob] Failed to send activation notification for ${emp.employeeCode}:`, err));

    // Auto-initialize leave policies for the country if not yet configured
    try {
      await autoInitializeLeavePolicyForCountry(emp.customerId, emp.country);
    } catch (err) {
      console.error(`[CronJob] Failed to auto-init leave policy for ${emp.employeeCode}:`, err);
    }

    // Auto-initialize leave balances for newly activated employee
    // Annual leave starts at 0 and accrues monthly via cron job
    try {
      await initializeLeaveBalancesForEmployee(emp.id, { annualLeaveStartsAtZero: true });
      console.log(`[CronJob] Initialized leave balances for ${emp.employeeCode} (annual leave starts at 0)`);
    } catch (err) {
      console.error(`[CronJob] Failed to initialize leave balances for ${emp.employeeCode}:`, err);
    }

    // Create audit log
    await logAuditAction({
      userName: "System",
      action: "employee_auto_activated",
      entityType: "employee",
      entityId: emp.id,
      changes: { detail: `Auto-activated: contract_signed → active (startDate: ${emp.startDate})` },

    });

    // Check if we should add to current month payroll
    if (dayOfMonth <= midMonthCutoff) {
      // Try to find current month's payroll run for this country
      const monthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
      const existingRun = await findPayrollRunByCountryMonth(emp.country, monthStr);

      if (existingRun && existingRun.status === "draft") {
        // Calculate pro-rata
        const startDate = new Date(emp.startDate as any);
        const baseSalary = parseFloat(emp.baseSalary?.toString() ?? "0");
        const { proRataAmount, totalWorkingDays, workedDays } = calculateProRata(
          baseSalary, startDate, currentYear, currentMonth
        );

        // Add employee to payroll run
        const salaryStr = String(proRataAmount);
        await createPayrollItem({
          payrollRunId: existingRun.id,
          employeeId: emp.id,
          baseSalary: salaryStr,
          gross: salaryStr,
          net: salaryStr,
          totalEmploymentCost: salaryStr,
          currency: emp.salaryCurrency ?? existingRun.currency,
          notes: workedDays < totalWorkingDays
            ? `Pro-rata: ${workedDays}/${totalWorkingDays} working days (started ${emp.startDate})`
            : undefined,
        });

        addedToPayroll++;
        console.log(`[CronJob] Added ${emp.employeeCode} to payroll run #${existingRun.id} (pro-rata: ${proRataAmount})`);

        await logAuditAction({
          userName: "System",
          action: "employee_auto_added_to_payroll",
          entityType: "payroll_run",
          entityId: existingRun.id,
          changes: { detail: `Auto-added employee ${emp.employeeCode} to payroll (pro-rata: ${proRataAmount}, ${workedDays}/${totalWorkingDays} days)` },
    
        });
      }
    } else {
      // Employee activated after mid-month cutoff: create Sign-on Bonus
      // effectiveMonth = current month (the month they started), so that:
      //   1. Next month's Job 2 (auto-lock) locks this adjustment as part of "previous month" data
      //   2. Next month's Job 3 (auto-create payroll) picks it up into the next payroll run
      // Example: Employee starts Apr 18 → effectiveMonth = Apr → locked on May 5 → paid in May payroll
      const startDate = new Date(emp.startDate as any);
      const baseSalary = parseFloat(emp.baseSalary?.toString() ?? "0");

      if (baseSalary > 0) {
        const { proRataAmount, totalWorkingDays, workedDays } = calculateProRata(
          baseSalary, startDate, currentYear, currentMonth
        );

        if (proRataAmount > 0) {
          // effectiveMonth = current month (the month the employee actually started)
          const effectiveMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;

          await createAdjustment({
            employeeId: emp.id,
            customerId: emp.customerId,
            adjustmentType: "bonus",
            category: "other",
            amount: String(proRataAmount),
            currency: emp.salaryCurrency ?? "USD",
            effectiveMonth,
            status: "admin_approved",  // System-generated: skip manual approval chain to ensure auto-lock picks it up
            description: `Sign-on bonus - pro-rata compensation for ${workedDays}/${totalWorkingDays} working days in ${currentYear}-${String(currentMonth).padStart(2, "0")} (started ${emp.startDate})`,
          });

          console.log(`[CronJob] Created Sign-on Bonus for ${emp.employeeCode}: ${proRataAmount} ${emp.salaryCurrency ?? "USD"} (${workedDays}/${totalWorkingDays} days, effectiveMonth: ${effectiveMonth})`);

          await logAuditAction({
            userName: "System",
            action: "sign_on_bonus_created",
            entityType: "adjustment",
            entityId: emp.id,
            changes: { detail: `Auto-created Sign-on Bonus for ${emp.employeeCode}: ${proRataAmount} (${workedDays}/${totalWorkingDays} working days in ${currentYear}-${String(currentMonth).padStart(2, "0")})` },
          });
        }
      }

      console.log(`[CronJob] ${emp.employeeCode} activated after ${midMonthCutoff}th, will be in next month's payroll`);
    }
  }

  console.log(`[CronJob] Employee activation complete: ${activated} activated, ${addedToPayroll} added to payroll`);
  return { activated, addedToPayroll };
}

// ============================================================================
// CRON JOB 2: Monthly auto-lock submitted adjustments/leave (5th 00:00 Beijing)
// ============================================================================

/**
 * Auto-lock all submitted adjustments and leave records for the previous month.
 * Runs on the 5th at 00:00 Beijing time (cutoff was 4th 23:59).
 */
export async function runAutoLock(): Promise<{ adjustmentsLocked: number; leaveLocked: number; reimbursementsLocked: number; contractorAdjustmentsLocked: number; contractorMilestonesLocked: number }> {
  const today = new Date();
  const beijingOffset = 8 * 60;
  const beijingDate = new Date(today.getTime() + (beijingOffset - today.getTimezoneOffset()) * 60000);
  const currentYear = beijingDate.getFullYear();
  const currentMonth = beijingDate.getMonth() + 1;

  // Calculate previous month
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear--;
  }

  const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  const prevMonthDate = `${prevMonthStr}-01`;

  console.log(`[CronJob] Auto-locking submitted data for ${prevMonthStr}`);

  // Lock adjustments (effectiveMonth = YYYY-MM-01)
  const adjLocked = await lockSubmittedAdjustments(prevMonthDate);
  console.log(`[CronJob] Locked ${adjLocked} adjustments for ${prevMonthStr}`);

  // Lock leave records (startDate within the month)
  const leaveLocked = await lockSubmittedLeaveRecords(prevMonthStr);
  console.log(`[CronJob] Locked ${leaveLocked} leave records for ${prevMonthStr}`);

  // Lock reimbursements (effectiveMonth = YYYY-MM-01)
  const reimbLocked = await lockSubmittedReimbursements(prevMonthDate);
  console.log(`[CronJob] Locked ${reimbLocked} reimbursements for ${prevMonthStr}`);

  // ── AOR: Lock contractor adjustments (admin_approved → locked) ──
  const ctrAdjLocked = await lockContractorAdjustments(prevMonthDate);
  console.log(`[CronJob] Locked ${ctrAdjLocked} contractor adjustments for ${prevMonthStr}`);

  // ── AOR: Lock contractor milestones (admin_approved → locked) ──
  const ctrMilLocked = await lockContractorMilestones(prevMonthDate);
  console.log(`[CronJob] Locked ${ctrMilLocked} contractor milestones for ${prevMonthStr}`);

  await logAuditAction({
    userName: "System",
    action: "auto_lock_monthly",
    entityType: "system",
    entityId: 0,
    changes: { detail: `Auto-locked for ${prevMonthStr}: EOR(${adjLocked} adj, ${leaveLocked} leave, ${reimbLocked} reimb) + AOR(${ctrAdjLocked} ctr_adj, ${ctrMilLocked} ctr_mil)` },
  });

  // ── ADMIN ALERT: Check for items still pending approval that missed the lock window ──
  // These are items in 'submitted' or 'client_approved' status for the previous month.
  // They weren't locked because admin hadn't approved them yet, so they'll be delayed by a full month.
  try {
    const { getDb: getDbConn } = await import("./db");
    const alertDb = await getDbConn();
    if (alertDb) {
      const { adjustments, reimbursements, leaveRecords } = await import("../drizzle/schema");
      const { inArray: inArr } = await import("drizzle-orm");
      const pendingStatuses = ["submitted", "client_approved"];

      const pendingAdjCount = await alertDb.select({ id: adjustments.id })
        .from(adjustments)
        .where(and(eq(adjustments.effectiveMonth, prevMonthDate), inArr(adjustments.status, pendingStatuses as any[])));
      const pendingReimbCount = await alertDb.select({ id: reimbursements.id })
        .from(reimbursements)
        .where(and(eq(reimbursements.effectiveMonth, prevMonthDate), inArr(reimbursements.status, pendingStatuses as any[])));
      const pendingLeaveCount = await alertDb.select({ id: leaveRecords.id })
        .from(leaveRecords)
        .where(and(
          inArr(leaveRecords.status, pendingStatuses as any[]),
          // Leave records for the previous month: startDate within the month
          sql`${leaveRecords.startDate} >= ${prevMonthDate}`,
          sql`${leaveRecords.startDate} < ${`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`}`,
        ));

      const totalPending = pendingAdjCount.length + pendingReimbCount.length + pendingLeaveCount.length;

      if (totalPending > 0) {
        console.warn(`[CronJob] \u26a0\ufe0f WARNING: ${totalPending} items for ${prevMonthStr} are still pending admin approval and were NOT locked. They will be delayed to next month's payroll.`);
        notificationService.send({
          type: "admin_pending_approval_alert",
          data: {
            period: prevMonthStr,
            pendingAdjustments: pendingAdjCount.length,
            pendingReimbursements: pendingReimbCount.length,
            pendingLeave: pendingLeaveCount.length,
            totalPending,
            message: `${totalPending} items for ${prevMonthStr} missed the lock window and need immediate admin approval to avoid a 1-month delay.`,
          },
        }).catch(err => console.error("Failed to send admin pending approval alert:", err));
      }
    }
  } catch (alertErr) {
    console.error("[CronJob] Failed to check pending approvals:", alertErr);
    // Non-fatal: don't block the lock process
  }

  return { adjustmentsLocked: adjLocked, leaveLocked, reimbursementsLocked: reimbLocked, contractorAdjustmentsLocked: ctrAdjLocked, contractorMilestonesLocked: ctrMilLocked };
}

// ============================================================================
// CRON JOB 3: Monthly auto-create next month draft payroll runs (5th 00:01 Beijing)
// ============================================================================

export async function runAutoCreatePayrollRuns(): Promise<{ created: number; employeesFilled: number }> {
  const today = new Date();
  const beijingOffset = 8 * 60;
  const beijingDate = new Date(today.getTime() + (beijingOffset - today.getTimezoneOffset()) * 60000);
  const currentYear = beijingDate.getFullYear();
  const currentMonth = beijingDate.getMonth() + 1;

  // Create payroll run for CURRENT month (not next month)
  // e.g. On Feb 5th, create Feb payroll run and lock Jan's adjustments/leave
  const targetMonth = currentMonth;
  const targetYear = currentYear;

  const targetMonthStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
  const targetMonthEnd = new Date(targetYear, targetMonth, 0); // last day of target month
  const targetMonthEndStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetMonthEnd.getDate()).padStart(2, "0")}`;

  console.log(`[CronJob] Auto-creating payroll runs for ${targetMonthStr}`);

  // Get countries with active employees
  const countryCodes = await getCountriesWithActiveEmployees();
  console.log(`[CronJob] Found ${countryCodes.length} countries with active employees`);

  // We need country config for currency and working days
  const { getDb } = await import("./db");
  const db = await getDb();
  if (!db) {
    console.error("[CronJob] Database not available");
    return { created: 0, employeesFilled: 0 };
  }

  let created = 0;
  let employeesFilled = 0;

  // Calculate previous month for aggregating locked adjustments/leave
  // On the 5th, the previous month's cutoff has just passed (4th 23:59),
  // so we aggregate the previous month's locked data into this month's payroll
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear--;
  }
  const prevMonthPayroll = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;

  for (const countryCode of countryCodes) {
    // Check if payroll run already exists for this country+month
    const existing = await findPayrollRunByCountryMonth(countryCode, targetMonthStr);
    if (existing) {
      console.log(`[CronJob] Payroll run already exists for ${countryCode} ${targetMonthStr}, skipping`);
      continue;
    }

    // Get country config for currency
    const [config] = await db.select().from(countriesConfig).where(eq(countriesConfig.countryCode, countryCode)).limit(1);
    if (!config) {
      console.log(`[CronJob] No country config for ${countryCode}, skipping`);
      continue;
    }

    // Create draft payroll run for current month
    const result = await createPayrollRun({
      countryCode,
      payrollMonth: targetMonthStr as any,
      currency: config.localCurrency,
      status: "draft",
      notes: `Auto-created on ${beijingDate.toISOString().split("T")[0]}`,
    });

    const runId = (result as any)[0]?.insertId;
    if (!runId) {
      console.error(`[CronJob] Failed to create payroll run for ${countryCode}`);
      continue;
    }

    created++;
    console.log(`[CronJob] Created payroll run #${runId} for ${countryCode} ${targetMonthStr}`);

    notificationService.send({
      type: "payroll_draft_created",
      data: {
        payrollRunId: runId,
        countryCode: countryCode,
        period: targetMonthStr
      }
    }).catch(err => console.error("Failed to send payroll notification:", err));

    // Get eligible employees for current month (active + offboarding + on_leave)
    const statusBasedEmployees = await getEmployeesForPayrollMonth(countryCode, targetMonthStr, targetMonthEndStr);

    // Get locked adjustments and unpaid leave for the CURRENT month (which was just locked)
    // Note: auto-fill for next month's payroll uses current month's locked data
    // because adjustments/leave are submitted for the month they apply to
    const lockedAdjustments = await getSubmittedAdjustmentsForPayroll(countryCode, prevMonthPayroll, ["locked"]);
    const lockedReimbursements = await getSubmittedReimbursementsForPayroll(countryCode, prevMonthPayroll, ["locked"]);
    const lockedUnpaidLeave = await getSubmittedUnpaidLeaveForPayroll(countryCode, `${prevYear}-${String(prevMonth).padStart(2, "0")}`, ["locked"]);

    // ── DATA-DRIVEN RESCUE: Find orphaned employees with locked data ──
    // Employees who have been terminated but still have locked adjustments/leave/reimbursements
    // that haven't been consumed by any payroll run. These employees MUST receive a payroll item.
    const statusBasedIds = new Set(statusBasedEmployees.map(e => e.id));
    const orphanedEmployeeIds = new Set<number>();

    for (const adj of lockedAdjustments) {
      if (!statusBasedIds.has(adj.employeeId)) orphanedEmployeeIds.add(adj.employeeId);
    }
    for (const reimb of lockedReimbursements) {
      if (!statusBasedIds.has(reimb.employeeId)) orphanedEmployeeIds.add(reimb.employeeId);
    }
    for (const leave of lockedUnpaidLeave) {
      if (!statusBasedIds.has(leave.employeeId)) orphanedEmployeeIds.add(leave.employeeId);
    }

    // Fetch full employee records for orphaned employees and merge
    const orphanedEmployees = [];
    for (const empId of Array.from(orphanedEmployeeIds)) {
      const emp = await getEmployeeById(empId);
      if (emp && emp.country === countryCode) {
        orphanedEmployees.push(emp);
        console.log(`[CronJob] RESCUE: Including terminated employee ${emp.employeeCode} (${emp.firstName} ${emp.lastName}) - has orphaned locked data`);
      }
    }

    const eligibleEmployees = [...statusBasedEmployees, ...orphanedEmployees];

    // Build adjustment aggregation maps
    const adjByEmployee = new Map<number, { bonus: number; allowances: number; reimbursements: number; otherDeductions: number }>();
    for (const adj of lockedAdjustments) {
      const empId = adj.employeeId;
      if (!adjByEmployee.has(empId)) {
        adjByEmployee.set(empId, { bonus: 0, allowances: 0, reimbursements: 0, otherDeductions: 0 });
      }
      const agg = adjByEmployee.get(empId)!;
      const amount = parseFloat(String(adj.amount ?? 0));
      switch (adj.adjustmentType) {
        case "bonus": agg.bonus += amount; break;
        case "allowance": agg.allowances += amount; break;
        case "reimbursement": agg.reimbursements += amount; break;
        case "deduction": agg.otherDeductions += amount; break;
        case "other": agg.otherDeductions += amount; break;
      }
    }

    // Aggregate standalone reimbursements from the reimbursements table
    for (const reimb of lockedReimbursements) {
      const empId = reimb.employeeId;
      if (!adjByEmployee.has(empId)) {
        adjByEmployee.set(empId, { bonus: 0, allowances: 0, reimbursements: 0, otherDeductions: 0 });
      }
      const agg = adjByEmployee.get(empId)!;
      agg.reimbursements += parseFloat(String(reimb.amount ?? 0));
    }

    // Build unpaid leave aggregation map (days only, deduction calculated per employee)
    const leaveByEmployee = new Map<number, { days: number }>();
    for (const leave of lockedUnpaidLeave) {
      const empId = leave.employeeId;
      if (!leaveByEmployee.has(empId)) {
        leaveByEmployee.set(empId, { days: 0 });
      }
      const agg = leaveByEmployee.get(empId)!;
      agg.days += parseFloat(String(leave.days ?? 0));
    }

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalEmployerCost = 0;

    for (const emp of eligibleEmployees) {
      const baseSalary = parseFloat(emp.baseSalary?.toString() ?? "0");
      const startDate = new Date(emp.startDate as any);
      const endDate = emp.endDate ? new Date(emp.endDate as any) : null;
      const workingDaysPerWeek = config.workingDaysPerWeek ?? 5;

      const { proRataAmount, totalWorkingDays, workedDays } = calculateProRata(
        baseSalary, startDate, targetYear, targetMonth, workingDaysPerWeek, endDate
      );

      // Get aggregated adjustments and leave for this employee
      const adjAgg = adjByEmployee.get(emp.id) ?? { bonus: 0, allowances: 0, reimbursements: 0, otherDeductions: 0 };
      const leaveAgg = leaveByEmployee.get(emp.id) ?? { days: 0 };

      // Calculate unpaid leave deduction: baseSalary / monthlyWorkingDays × days
      const monthlyWorkingDays = workingDaysPerWeek * 4.33;
      const unpaidLeaveDeduction = monthlyWorkingDays > 0 && leaveAgg.days > 0
        ? Math.round((baseSalary / monthlyWorkingDays) * leaveAgg.days * 100) / 100
        : 0;

      const gross = proRataAmount + adjAgg.bonus + adjAgg.allowances + adjAgg.reimbursements;
      const deductions = adjAgg.otherDeductions + unpaidLeaveDeduction;
      const net = gross - deductions;

      await createPayrollItem({
        payrollRunId: runId,
        employeeId: emp.id,
        baseSalary: String(proRataAmount),
        bonus: String(adjAgg.bonus),
        allowances: String(adjAgg.allowances),
        reimbursements: String(adjAgg.reimbursements),
        deductions: String(adjAgg.otherDeductions),
        unpaidLeaveDays: String(leaveAgg.days),
        unpaidLeaveDeduction: String(unpaidLeaveDeduction),
        gross: String(gross),
        net: String(net),
        totalEmploymentCost: String(net),
        currency: emp.salaryCurrency ?? config.localCurrency,
        notes: workedDays < totalWorkingDays
          ? `Pro-rata: ${workedDays}/${totalWorkingDays} working days${emp.startDate && startDate.getFullYear() === targetYear && (startDate.getMonth() + 1) === targetMonth ? ` (started ${emp.startDate})` : ''}${endDate && endDate.getFullYear() === targetYear && (endDate.getMonth() + 1) === targetMonth ? ` (last day ${emp.endDate})` : ''}`
          : undefined,
      });

      totalGross += gross;
      totalDeductions += deductions;
      totalNet += net;
      totalEmployerCost += net;
      employeesFilled++;
    }

    // Update payroll run totals
    await updatePayrollRun(runId, {
      totalGross: String(totalGross),
      totalDeductions: String(totalDeductions),
      totalNet: String(totalNet),
      totalEmployerCost: String(totalEmployerCost),
    });

    // Write back payrollRunId to all consumed locked data for traceability
    try {
      const { adjustments: adjTable, reimbursements: reimbTable, leaveRecords } = await import("../drizzle/schema");
      const { and: drizzleAnd, eq: drizzleEq, isNull } = await import("drizzle-orm");

      // Update locked adjustments that have no payrollRunId
      await db.update(adjTable)
        .set({ payrollRunId: runId })
        .where(drizzleAnd(
          drizzleEq(adjTable.status, "locked"),
          drizzleEq(adjTable.effectiveMonth, prevMonthPayroll),
          isNull(adjTable.payrollRunId)
        ));

      // Update locked reimbursements that have no payrollRunId
      await db.update(reimbTable)
        .set({ payrollRunId: runId })
        .where(drizzleAnd(
          drizzleEq(reimbTable.status, "locked"),
          drizzleEq(reimbTable.effectiveMonth, prevMonthPayroll),
          isNull(reimbTable.payrollRunId)
        ));

      // Update locked leave records that have no payrollRunId
      const prevMonthPrefix = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
      await db.update(leaveRecords)
        .set({ payrollRunId: runId })
        .where(drizzleAnd(
          drizzleEq(leaveRecords.status, "locked"),
          isNull(leaveRecords.payrollRunId)
        ));

      console.log(`[CronJob] Wrote back payrollRunId #${runId} to locked data for ${countryCode} ${prevMonthPayroll}`);
    } catch (err) {
      console.error(`[CronJob] Failed to write back payrollRunId for run #${runId}:`, err);
    }

    console.log(`[CronJob] Filled ${eligibleEmployees.length} employees for ${countryCode} (gross: ${totalGross})`);

    await logAuditAction({
      userName: "System",
      action: "payroll_run_auto_created",
      entityType: "payroll_run",
      entityId: runId,
      changes: { detail: `Auto-created draft payroll for ${countryCode} ${targetMonthStr} with ${eligibleEmployees.length} employees, aggregated locked adjustments/leave/reimbursements` },

    });
  }

  console.log(`[CronJob] Payroll auto-creation complete: ${created} runs created, ${employeesFilled} employees filled`);
  return { created, employeesFilled };
}

// ============================================================================
// CRON JOB 4: Daily on-leave status auto-transition
// ============================================================================

/**
 * Auto-transition employee status based on leave records:
 * - active → on_leave: when a submitted/locked leave record's startDate <= today
 * - on_leave → active: when all leave records have ended (endDate < today)
 */
export async function runLeaveStatusTransition(): Promise<{ toOnLeave: number; toActive: number }> {
  const today = new Date();
  const beijingOffset = 8 * 60;
  const beijingDate = new Date(today.getTime() + (beijingOffset - today.getTimezoneOffset()) * 60000);
  const todayStr = beijingDate.toISOString().split("T")[0];

  console.log(`[CronJob] Leave status transition check for ${todayStr}`);

  let toOnLeave = 0;
  let toActive = 0;

  // 1. Find active/offboarding employees who have leave records starting today or earlier
  const activeLeaves = await getAllActiveLeaveRecordsForDate(todayStr);
  
  // Group by employee to avoid duplicate transitions
  const employeesWithActiveLeave = new Set<number>();
  for (const leave of activeLeaves) {
    employeesWithActiveLeave.add(leave.employeeId);
  }

  // For each employee with active leave, check if they're currently 'active' or 'offboarding' and transition to 'on_leave'
  const { getDb } = await import("./db");
  const db = await getDb();
  if (!db) {
    console.error("[CronJob] Database not available for leave transition");
    return { toOnLeave: 0, toActive: 0 };
  }

  const { employees } = await import("../drizzle/schema");

  for (const empId of Array.from(employeesWithActiveLeave)) {
    const [emp] = await db.select({ id: employees.id, status: employees.status, employeeCode: employees.employeeCode })
      .from(employees)
      .where(eq(employees.id, empId))
      .limit(1);
    
    // Transition active → on_leave (standard case)
    // Note: We do NOT transition offboarding → on_leave to avoid losing the offboarding flag.
    // Offboarding employees on leave are still tracked by payroll via the on_leave inclusion fix.
    if (emp && emp.status === "active") {
      await updateEmployee(empId, { status: "on_leave" });
      toOnLeave++;
      console.log(`[CronJob] Employee ${emp.employeeCode || empId} transitioned to on_leave`);
      await logAuditAction({
        userName: "System",
        action: "employee_auto_on_leave",
        entityType: "employee",
        entityId: empId,
        changes: { detail: `Auto-transitioned active → on_leave (leave record covers ${todayStr})` },
      });
    }
  }

  // 2. Find on_leave employees whose leave records have all ended
  // IMPORTANT: Check if the employee has an endDate — if so, they were offboarding before going on leave.
  // Restore to 'offboarding' instead of 'active' to preserve the termination lifecycle.
  const expiredLeaveEmps = await getOnLeaveEmployeesWithExpiredLeave(todayStr);
  for (const emp of expiredLeaveEmps) {
    const fullEmp = await getEmployeeById(emp.id);
    const hasEndDate = fullEmp && fullEmp.endDate;
    const restoreStatus = hasEndDate ? "offboarding" : "active";

    await updateEmployee(emp.id, { status: restoreStatus });
    toActive++;
    console.log(`[CronJob] Employee ${emp.employeeCode || emp.id} returned to ${restoreStatus} (leave ended${hasEndDate ? ', has endDate → offboarding' : ''})`);
    await logAuditAction({
      userName: "System",
      action: "employee_auto_return_from_leave",
      entityType: "employee",
      entityId: emp.id,
      changes: { detail: `Auto-transitioned on_leave → ${restoreStatus} (all leave records ended before ${todayStr}${hasEndDate ? ', endDate present → restored to offboarding' : ''})` },
    });
  }

  console.log(`[CronJob] Leave transition complete: ${toOnLeave} to on_leave, ${toActive} returned to active`);
  return { toOnLeave, toActive };
}

// ============================================================================
// CRON JOB 5: Daily overdue invoice auto-detection
// ============================================================================

/**
 * Auto-transition sent invoices to overdue when dueDate has passed.
 * Only affects invoices with status 'sent' and dueDate < today.
 */
export async function runOverdueInvoiceDetection(): Promise<{ overdueCount: number }> {
  const { getDb } = await import("./db");
  const db = await getDb();
  if (!db) {
    console.error("[CronJob] Database not available for overdue detection");
    return { overdueCount: 0 };
  }

  const { invoices } = await import("../drizzle/schema");
  const { eq, and, lt, isNotNull } = await import("drizzle-orm");

  // Use Beijing time (UTC+8) for consistency with other cron jobs
  const now = new Date();
  const beijingOffset = 8 * 60; // UTC+8
  const beijingDate = new Date(now.getTime() + (beijingOffset - now.getTimezoneOffset()) * 60000);
  const todayStr = beijingDate.toISOString().split("T")[0]; // YYYY-MM-DD in Beijing time
  // Find all sent invoices with dueDate < today
  const overdueInvoices = await db
    .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, dueDate: invoices.dueDate, customerId: invoices.customerId })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "sent" as any),
        isNotNull(invoices.dueDate),
        lt(invoices.dueDate, todayStr)
      )
    );

  let overdueCount = 0;
  for (const inv of overdueInvoices) {
    await db.update(invoices).set({ status: "overdue" }).where(eq(invoices.id, inv.id));
    overdueCount++;
    console.log(`[CronJob] Invoice ${inv.invoiceNumber || inv.id} marked as overdue (due: ${inv.dueDate})`);
    
    notificationService.send({
      type: "invoice_overdue",
      customerId: inv.customerId,
      data: {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        dueDate: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "N/A"
      }
    }).catch(err => console.error("Failed to send overdue notification:", err));

    await logAuditAction({
      userName: "System",
      action: "invoice_auto_overdue",
      entityType: "invoice",
      entityId: inv.id,
      changes: { detail: `Auto-transitioned sent → overdue (dueDate: ${inv.dueDate})` },

    });
  }

  if (overdueCount > 0) {
    // Notify owner about overdue invoices
    const { notifyOwner } = await import("./_core/notification");
    notifyOwner({
      title: `${overdueCount} Invoice(s) Now Overdue`,
      content: `${overdueCount} invoice(s) have been automatically marked as overdue because their due date has passed.\n\nPlease review and follow up with the respective clients.`,
    }).catch((err) => console.warn("[Notification] Failed to notify about overdue invoices:", err));
  }

  console.log(`[CronJob] Overdue detection complete: ${overdueCount} invoices marked overdue`);
  return { overdueCount };
}

// ============================================================================
// SCHEDULE CRON JOBS
// ============================================================================

// ============================================================================
// CRON JOB: Monthly leave accrual for new employees (1st 00:10 Beijing)
// ============================================================================

/**
 * Monthly leave accrual for employees who joined in the current year.
 *
 * ONLY accrues Annual Leave types (identified by leaveTypeName containing "Annual").
 * Other leave types (Sick, Maternity, Paternity, Bereavement, etc.) are initialized
 * at full entitlement when the employee is activated and are NOT accrued monthly.
 *
 * Rule: Each full month of service earns 1/12 of annual entitlement.
 * Rounding: values not reaching 0.5 day are rounded up to 0.5 day.
 * Since totalEntitlement is stored as INT, we round to the nearest integer for storage.
 *
 * Bug fixes applied:
 * - Only processes Annual Leave types (previously all types were accrued)
 * - Includes both 'active' and 'on_leave' employees (previously only 'active')
 */
export async function runMonthlyLeaveAccrual(): Promise<{ processed: number; updated: number; errors: number }> {
  const now = new Date();
  const beijingOffset = 8 * 60;
  const beijingDate = new Date(now.getTime() + (beijingOffset - now.getTimezoneOffset()) * 60000);
  const currentYear = beijingDate.getFullYear();
  const currentMonth = beijingDate.getMonth() + 1; // 1-indexed

  console.log(`[CronJob] Running monthly leave accrual for ${currentYear}-${String(currentMonth).padStart(2, "0")}`);

  // Get all active, on_leave, AND offboarding employees
  // Bug fix: offboarding employees must continue to accrue leave during their notice period (Hard Rule 2)
  const { data: activeEmployees } = await listEmployees({ status: "active", pageSize: 10000 });
  const { data: onLeaveEmployees } = await listEmployees({ status: "on_leave", pageSize: 10000 });
  const { data: offboardingEmployees } = await listEmployees({ status: "offboarding", pageSize: 10000 });
  const allEligibleEmployees = [...activeEmployees, ...onLeaveEmployees, ...offboardingEmployees];

  // Filter to employees who started in the current year
  const newEmployees = allEligibleEmployees.filter(emp => {
    if (!emp.startDate) return false;
    const startDate = new Date(emp.startDate as any);
    return startDate.getFullYear() === currentYear;
  });

  console.log(`[CronJob] Found ${newEmployees.length} employees who started in ${currentYear} (active: ${activeEmployees.length}, on_leave: ${onLeaveEmployees.length}, offboarding: ${offboardingEmployees.length})`);

  let processed = 0;
  let updated = 0;
  let errors = 0;

  for (const emp of newEmployees) {
    try {
      processed++;
      const startDate = new Date(emp.startDate as any);
      const startMonth = startDate.getMonth() + 1; // 1-indexed
      const startDay = startDate.getDate();

      // Calculate full months served
      // If started on the 1st, count that month; otherwise start from next month
      let fullMonthsServed: number;
      if (startDay === 1) {
        fullMonthsServed = currentMonth - startMonth + 1;
      } else {
        // Started mid-month, first full month is the next one
        fullMonthsServed = currentMonth - startMonth;
      }

      if (fullMonthsServed <= 0) {
        // Not yet completed a full month
        continue;
      }

      // Get customer leave policies for this employee's country
      const policies = await getCustomerLeavePoliciesForCountry(emp.customerId, emp.country);

      // Get current leave balances
      const balances = await listLeaveBalances(emp.id, currentYear);

      for (const balance of balances) {
        // Bug fix: ONLY accrue Annual Leave types
        // Other leave types (Sick, Maternity, etc.) are already at full entitlement
        const isAnnualLeave = balance.leaveTypeName?.toLowerCase().includes("annual");
        if (!isAnnualLeave) continue;

        // Find the matching policy for this leave type
        const policy = policies.find((p: any) => p.leaveTypeId === balance.leaveTypeId);
        const annualEntitlement = policy ? policy.annualEntitlement : (balance.totalEntitlement || 0);

        if (!annualEntitlement || annualEntitlement <= 0) continue;

        // Calculate accrued entitlement: (annual / 12) * months served
        const rawAccrued = (annualEntitlement / 12) * fullMonthsServed;

        // Round up to nearest 0.5 day: Math.ceil(value * 2) / 2
        const accruedHalfDay = Math.ceil(rawAccrued * 2) / 2;

        // Since DB stores INT, round to nearest integer
        const finalAccrued = Math.round(accruedHalfDay);

        // Cap at annual entitlement (don't exceed full year)
        const cappedAccrued = Math.min(finalAccrued, annualEntitlement);

        // Only update if the accrued amount is different from current entitlement
        if (cappedAccrued !== balance.totalEntitlement) {
          const newRemaining = cappedAccrued - balance.used;
          await updateLeaveBalance(balance.id, {
            totalEntitlement: cappedAccrued,
            remaining: Math.max(0, newRemaining),
          });
          updated++;
          console.log(`[CronJob] Updated annual leave for ${emp.firstName} ${emp.lastName} (${emp.employeeCode}): ` +
            `months=${fullMonthsServed}, accrued=${cappedAccrued}/${annualEntitlement}`);
        }
      }
    } catch (err) {
      errors++;
      console.error(`[CronJob] Failed to process leave accrual for employee ${emp.id}:`, err);
    }
  }

  console.log(`[CronJob] Monthly leave accrual complete: ${processed} processed, ${updated} updated, ${errors} errors`);

  await logAuditAction({
    userName: "System",
    action: "monthly_leave_accrual",
    entityType: "system",
    entityId: 0,
    changes: { detail: `Monthly leave accrual: ${processed} processed, ${updated} updated, ${errors} errors` },
  });

  return { processed, updated, errors };
}

// ============================================================================
// CRON JOB: Auto-create Contractor Invoices (5th 00:01 Beijing, same as payroll)
// ============================================================================

/**
 * Auto-create contractor invoices from locked milestones and adjustments.
 * Runs on the 5th at 00:01 Beijing time (same time as payroll auto-creation).
 * 
 * Business Logic:
 * - Monthly contractors: 1 invoice per month (base rate + locked adjustments)
 * - Semi-monthly contractors: 2 invoices per month (1st-15th, 16th-end)
 *   - Adjustments are only included in the second half invoice
 * - Milestone contractors: 1 invoice per locked milestone (+ adjustments)
 * 
 * Alignment with EOR:
 * - Uses same cron timing as runAutoCreatePayrollRuns
 * - Uses same scan condition: status = 'locked' AND invoiceId IS NULL
 * - Writes back invoiceId after creation (like EOR payrollRunId)
 */
export async function runAutoCreateContractorInvoices(): Promise<{ created: number; errors: string[] }> {
  const today = new Date();
  const beijingOffset = 8 * 60;
  const beijingDate = new Date(today.getTime() + (beijingOffset - today.getTimezoneOffset()) * 60000);
  const currentYear = beijingDate.getFullYear();
  const currentMonth = beijingDate.getMonth() + 1;

  // Calculate previous month (the month that was just locked)
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear--;
  }

  const prevMonthDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  console.log(`[CronJob] Auto-creating contractor invoices for ${prevMonthStr}`);

  const result = await ContractorInvoiceGenerationService.generateFromLockedData(prevMonthDate, prevYear, prevMonth);

  console.log(`[CronJob] Contractor invoice auto-creation complete: ${result.created} invoices created`);
  if (result.errors.length > 0) {
    console.error("[CronJob] Contractor invoice errors:", result.errors);
  }

  await logAuditAction({
    userName: "System",
    action: "contractor_invoices_auto_created",
    entityType: "system",
    entityId: 0,
    changes: { detail: `Auto-created ${result.created} contractor invoices for ${prevMonthStr}. Errors: ${result.errors.length}` },
  });

  return result;
}

// ============================================================================
// CRON JOB: Daily employee auto-termination (offboarding → terminated)
// ============================================================================

/**
 * Auto-terminate offboarding employees whose endDate has passed.
 * Symmetric counterpart to runEmployeeAutoActivation.
 * 
 * Logic:
 * - Find employees with status='offboarding' AND endDate <= today
 * - Transition them to 'terminated'
 * - Trigger deposit refund billing (future: via billing service)
 * - Record audit log
 */
export async function runEmployeeAutoTermination(): Promise<{ terminated: number }> {
  const today = new Date();
  const beijingOffset = 8 * 60;
  const beijingDate = new Date(today.getTime() + (beijingOffset - today.getTimezoneOffset()) * 60000);
  const todayStr = beijingDate.toISOString().split("T")[0];

  console.log(`[CronJob] Employee auto-termination check for ${todayStr}`);

  const readyEmployees = await getOffboardingEmployeesReadyForTermination(todayStr);

  let terminated = 0;

  for (const emp of readyEmployees) {
    await updateEmployee(emp.id, { status: "terminated" });
    terminated++;

    console.log(`[CronJob] Auto-terminated employee ${emp.employeeCode} (${emp.firstName} ${emp.lastName}), endDate: ${emp.endDate}`);

    await logAuditAction({
      userName: "System",
      action: "employee_auto_terminated",
      entityType: "employee",
      entityId: emp.id,
      changes: { detail: `Auto-terminated: offboarding → terminated (endDate: ${emp.endDate})` },
    });

    // Trigger deposit refund: create credit note and credit to customer's frozen wallet
    try {
      const refundResult = await generateDepositRefund(emp.id);
      if (refundResult) {
        console.log(`[CronJob] Deposit refund generated for employee ${emp.employeeCode}: invoice #${refundResult.invoiceId}`);
      }
    } catch (refundErr) {
      console.error(`[CronJob] Failed to generate deposit refund for employee ${emp.employeeCode}:`, refundErr);
      // Don't block termination — deposit refund failure is non-fatal
    }
  }

  console.log(`[CronJob] Employee auto-termination complete: ${terminated} terminated`);
  return { terminated };
}

// ============================================================================
// DYNAMIC CRON SCHEDULER
// All schedules are read from system_config and can be changed via Settings UI.
// ============================================================================

/** Registry of cron job definitions. */
export interface CronJobDef {
  key: string;                   // unique identifier, e.g. "employee_activation"
  label: string;                 // human-readable name
  description: string;           // short description
  frequency: "daily" | "monthly"; // daily = every day; monthly = specific day of month
  defaultDay: number;            // default day-of-month (only for monthly, 1-28)
  defaultTime: string;           // default HH:mm (Beijing time)
  defaultEnabled: boolean;
  runner: () => Promise<any>;    // the async function to execute
}

export const CRON_JOB_DEFS: CronJobDef[] = [
  {
    key: "employee_activation",
    label: "Employee Auto-Activation",
    description: "Transitions contract_signed employees to active when startDate arrives, with payroll auto-fill",
    frequency: "daily",
    defaultDay: 1,
    defaultTime: "00:01",
    defaultEnabled: true,
    runner: runEmployeeAutoActivation,
  },
  {
    key: "employee_termination",
    label: "Employee Auto-Termination",
    description: "Transitions offboarding employees to terminated when endDate arrives (symmetric to activation)",
    frequency: "daily",
    defaultDay: 1,
    defaultTime: "00:01",
    defaultEnabled: true,
    runner: runEmployeeAutoTermination,
  },
  {
    key: "auto_lock",
    label: "Auto-Lock Data (EOR+AOR)",
    description: "Locks previous month's admin_approved adjustments, leave records, reimbursements, and contractor data",
    frequency: "monthly",
    defaultDay: 5,
    defaultTime: "00:00",
    defaultEnabled: true,
    runner: runAutoLock,
  },
  {
    key: "payroll_create",
    label: "Auto-Create Payroll Runs & Contractor Invoices",
    description: "Creates draft payroll runs for all countries with active employees, and generates contractor invoices. Runs AFTER activation/termination (00:01) to avoid race conditions.",
    frequency: "monthly",
    defaultDay: 5,
    defaultTime: "00:05",
    defaultEnabled: true,
    runner: async () => {
      const payrollResult = await runAutoCreatePayrollRuns();
      const contractorResult = await runAutoCreateContractorInvoices();
      return { ...payrollResult, contractorInvoicesCreated: contractorResult.created, contractorErrors: contractorResult.errors.length };
    },
  },
  {
    key: "leave_transition",
    label: "Leave Status Transition",
    description: "Auto-transitions employees between active and on_leave based on leave record dates",
    frequency: "daily",
    defaultDay: 1,
    defaultTime: "00:02",
    defaultEnabled: true,
    runner: runLeaveStatusTransition,
  },
  {
    key: "overdue_invoice",
    label: "Overdue Invoice Detection",
    description: "Marks sent invoices as overdue when their due date has passed",
    frequency: "daily",
    defaultDay: 1,
    defaultTime: "00:03",
    defaultEnabled: true,
    runner: runOverdueInvoiceDetection,
  },
  {
    key: "exchange_rate",
    label: "Exchange Rate Fetch",
    description: "Fetches latest exchange rates from ExchangeRate-API (primary) with Frankfurter/ECB fallback. Covers 166 currencies.",
    frequency: "daily",
    defaultDay: 1,
    defaultTime: "00:05",
    defaultEnabled: true,
    runner: async () => {
      const result = await fetchAndStoreExchangeRates();
      return { ratesStored: result.ratesStored, date: result.date, errors: result.errors.length };
    },
  },
  {
    key: "leave_accrual",
    label: "Monthly Leave Accrual",
    description: "Accrues annual leave entitlement for employees who joined in the current year (1/12 per month)",
    frequency: "monthly",
    defaultDay: 1,
    defaultTime: "00:10",
    defaultEnabled: true,
    runner: runMonthlyLeaveAccrual,
  },
];

/** Map of active ScheduledTask instances, keyed by job key. */
const activeTasks = new Map<string, ReturnType<typeof cron.schedule>>();

/**
 * Build a node-cron expression from frequency, day, and time.
 * node-cron uses: second minute hour dayOfMonth month dayOfWeek
 */
function buildCronExpression(frequency: "daily" | "monthly", day: number, time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  if (frequency === "daily") {
    return `0 ${minute} ${hour} * * *`;
  }
  // monthly
  return `0 ${minute} ${hour} ${day} * *`;
}

/**
 * Read a cron job's config from system_config.
 * Returns { enabled, day, time } with fallback to defaults.
 */
async function getCronJobConfig(def: CronJobDef): Promise<{ enabled: boolean; day: number; time: string }> {
  const prefix = `cron_${def.key}`;
  const enabledStr = await getSystemConfig(`${prefix}_enabled`);
  const dayStr = await getSystemConfig(`${prefix}_day`);
  const timeStr = await getSystemConfig(`${prefix}_time`);

  return {
    enabled: enabledStr !== null ? enabledStr === "true" : def.defaultEnabled,
    day: dayStr !== null ? parseInt(dayStr, 10) : def.defaultDay,
    time: timeStr !== null ? timeStr : def.defaultTime,
  };
}

/**
 * Schedule (or reschedule) all cron jobs based on system_config.
 * Stops any previously scheduled tasks before re-registering.
 */
export async function scheduleCronJobs() {
  // Stop all existing tasks
  for (const [key, task] of Array.from(activeTasks.entries())) {
    task.stop();
    console.log(`[CronJob] Stopped existing task: ${key}`);
  }
  activeTasks.clear();

  for (const def of CRON_JOB_DEFS) {
    const config = await getCronJobConfig(def);

    if (!config.enabled) {
      console.log(`[CronJob] DISABLED: ${def.label}`);
      continue;
    }

    const cronExpr = buildCronExpression(def.frequency, config.day, config.time);
    const task = cron.schedule(cronExpr, async () => {
      console.log(`[CronJob] Running ${def.label} ...`);
      try {
        const result = await def.runner();
        console.log(`[CronJob] ${def.label} completed:`, result);
        // Store last run timestamp
        const { setSystemConfig } = await import("./db");
        await setSystemConfig(`cron_${def.key}_last_run`, new Date().toISOString());
      } catch (err) {
        console.error(`[CronJob] ${def.label} failed:`, err);
        const { setSystemConfig } = await import("./db");
        await setSystemConfig(`cron_${def.key}_last_error`, String(err));
      }
    }, { timezone: "Asia/Shanghai" });

    activeTasks.set(def.key, task);

    const scheduleDesc = def.frequency === "daily"
      ? `daily at ${config.time} Beijing`
      : `monthly ${config.day}th at ${config.time} Beijing`;
    console.log(`[CronJob] Scheduled: ${def.label} (${scheduleDesc}) [${cronExpr}]`);
  }

  console.log(`[CronJob] Total scheduled: ${activeTasks.size}/${CRON_JOB_DEFS.length} jobs`);
}

/**
 * Reschedule all cron jobs. Called after Settings save to hot-reload schedules.
 */
export async function rescheduleAllJobs() {
  console.log("[CronJob] Rescheduling all jobs (config changed)...");
  await scheduleCronJobs();
}

/**
 * Run a specific cron job immediately by key.
 * Used by the manual "Run Now" buttons in Settings.
 */
export async function runJobByKey(key: string): Promise<any> {
  const def = CRON_JOB_DEFS.find(d => d.key === key);
  if (!def) throw new Error(`Unknown cron job key: ${key}`);
  console.log(`[CronJob] Manual trigger: ${def.label}`);
  const result = await def.runner();
  // Store last run timestamp
  const { setSystemConfig } = await import("./db");
  await setSystemConfig(`cron_${def.key}_last_run`, new Date().toISOString());
  return result;
}
