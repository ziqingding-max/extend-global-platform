/**
 * Payroll Cutoff Utility
 *
 * Determines whether the cutoff deadline has passed for a given payroll month.
 * Used by both Adjustments and Leave modules to enforce edit/delete locking.
 *
 * Rule: For payroll month YYYY-MM, the cutoff is YYYY-(MM+1)-{cutoffDay} {cutoffTime} Beijing time.
 * Example: Feb 2026 payroll → cutoff is March 4, 23:59 Beijing time → paid March last business day.
 *
 * Attribution rules:
 * - Adjustments: attributed by effectiveMonth field
 * - Leave: attributed by END DATE month (cross-month leave uses end date)
 * - Cross-month leave spanning multiple months: split into monthly portions
 */

import { getSystemConfig, findPayrollRunByCountryMonth } from "../db";
import { hasAnyRole } from "../../shared/roles";

// ── Types ──

export interface CutoffResult {
  passed: boolean;
  cutoffDate: Date;
}

export interface PayrollPeriodInfo {
  /** The payroll month (YYYY-MM format) */
  payrollMonth: string;
  /** Cutoff deadline (UTC) */
  cutoffDate: Date;
  /** Whether cutoff has passed */
  cutoffPassed: boolean;
  /** Time remaining until cutoff in milliseconds (negative if passed) */
  timeRemainingMs: number;
  /** Human-readable time remaining */
  timeRemainingLabel: string;
  /** Expected payment date (last business day of cutoff month) */
  paymentDate: string;
}

export interface LeaveSplit {
  /** Start date of this portion (YYYY-MM-DD) */
  startDate: string;
  /** End date of this portion (YYYY-MM-DD) */
  endDate: string;
  /** Number of working days in this portion */
  days: number;
  /** The payroll month this portion is attributed to (YYYY-MM) */
  payrollMonth: string;
}

// ── Core Cutoff Functions ──

/**
 * Check if the cutoff deadline has passed for a given effective month.
 * @param effectiveMonth - The payroll month as a Date or string (YYYY-MM-DD or YYYY-MM-01)
 * @returns { passed: boolean, cutoffDate: Date } - Whether cutoff has passed and the cutoff datetime
 */
export async function checkCutoffPassed(effectiveMonth: Date | string): Promise<CutoffResult> {
  // Parse effective month
  let year: number, month: number;
  if (typeof effectiveMonth === "string") {
    const parts = effectiveMonth.split("-");
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
  } else {
    year = effectiveMonth.getFullYear();
    month = effectiveMonth.getMonth() + 1; // 1-indexed
  }

  // Read cutoff config from system_config
  const cutoffDayStr = await getSystemConfig("payroll_cutoff_day") ?? "4";
  const cutoffTimeStr = await getSystemConfig("payroll_cutoff_time") ?? "23:59";
  const cutoffDay = parseInt(cutoffDayStr, 10);
  const [cutoffHour, cutoffMinute] = cutoffTimeStr.split(":").map(Number);

  // Calculate cutoff date: next month's cutoff day
  let cutoffMonth = month + 1;
  let cutoffYear = year;
  if (cutoffMonth > 12) {
    cutoffMonth = 1;
    cutoffYear++;
  }

  // Build cutoff datetime in Beijing time (UTC+8)
  // We create a UTC date and subtract 8 hours to represent Beijing time
  const cutoffDateBeijing = new Date(
    Date.UTC(cutoffYear, cutoffMonth - 1, cutoffDay, cutoffHour - 8, cutoffMinute, 0)
  );

  // Get current time
  const now = new Date();

  return {
    passed: now > cutoffDateBeijing,
    cutoffDate: cutoffDateBeijing,
  };
}

/**
 * Enforce cutoff: throws an error if cutoff has passed and user is not operations_manager or admin.
 * For admin/ops_manager users, also checks if the corresponding payroll run has been approved.
 * Once a payroll run is approved, even admin users cannot modify the consumed data.
 *
 * @param effectiveMonth - The payroll month (the data month, not the payroll run month)
 * @param userRole - The current user's role
 * @param action - Description of the action being attempted (for error message)
 * @param countryCode - Optional country code; if provided, checks payroll run approval status
 */
export async function enforceCutoff(
  effectiveMonth: Date | string,
  userRole: string,
  action: string = "modify",
  countryCode?: string
): Promise<void> {
  const { passed, cutoffDate } = await checkCutoffPassed(effectiveMonth);

  // Client/portal users: blocked by cutoff date
  if (passed && !hasAnyRole(userRole, ["admin", "operations_manager"])) {
    const cutoffStr = cutoffDate.toISOString().replace("T", " ").substring(0, 16);
    throw new Error(
      `Cannot ${action}: payroll cutoff has passed (${cutoffStr} UTC). Only operations managers can modify after cutoff.`
    );
  }

  // Admin/ops_manager users: blocked only if the payroll run consuming this month's data is approved
  // N-1 rule: data for month M is consumed by payroll run for month M+1
  if (passed && hasAnyRole(userRole, ["admin", "operations_manager"]) && countryCode) {
    // Calculate the payroll run month (M+1) that consumes this data month (M)
    let year: number, month: number;
    if (typeof effectiveMonth === "string") {
      const parts = effectiveMonth.split("-");
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
    } else {
      year = effectiveMonth.getFullYear();
      month = effectiveMonth.getMonth() + 1;
    }
    let runMonth = month + 1;
    let runYear = year;
    if (runMonth > 12) { runMonth = 1; runYear++; }
    const runMonthStr = `${runYear}-${String(runMonth).padStart(2, "0")}-01`;

    const payrollRun = await findPayrollRunByCountryMonth(countryCode, runMonthStr);
    if (payrollRun && payrollRun.status === "approved") {
      throw new Error(
        `Cannot ${action}: the payroll run for ${runYear}-${String(runMonth).padStart(2, "0")} (${countryCode}) has been approved. Data for this month is locked.`
      );
    }
  }
}

// ── Payroll Period Helpers ──

/**
 * Get the payroll month a leave record is attributed to, based on END DATE.
 * For cross-month leave, the entire leave is attributed to the end date's month.
 * For multi-month leave (e.g. maternity), it should be split first.
 */
export function getLeavePayrollMonth(endDate: string): string {
  const parts = endDate.split("-");
  return `${parts[0]}-${parts[1]}`;
}

/**
 * Get the payroll month an adjustment is attributed to, based on effectiveMonth.
 */
export function getAdjustmentPayrollMonth(effectiveMonth: string): string {
  const parts = effectiveMonth.split("-");
  return `${parts[0]}-${parts[1]}`;
}

/**
 * Get comprehensive payroll period info for a given month.
 */
export async function getPayrollPeriodInfo(payrollMonth: string): Promise<PayrollPeriodInfo> {
  const parts = payrollMonth.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const effectiveMonth = `${year}-${String(month).padStart(2, "0")}-01`;

  const { passed, cutoffDate } = await checkCutoffPassed(effectiveMonth);
  const now = new Date();
  const timeRemainingMs = cutoffDate.getTime() - now.getTime();

  return {
    payrollMonth: `${year}-${String(month).padStart(2, "0")}`,
    cutoffDate,
    cutoffPassed: passed,
    timeRemainingMs,
    timeRemainingLabel: formatTimeRemaining(timeRemainingMs),
    paymentDate: getLastBusinessDay(cutoffDate),
  };
}

/**
 * Get the current active payroll period (the month whose cutoff hasn't passed yet,
 * or the most recent month if we're between cutoff and next month's cutoff).
 */
export async function getCurrentPayrollPeriod(): Promise<PayrollPeriodInfo> {
  const now = new Date();
  // Beijing time
  const beijingOffset = 8 * 60;
  const beijingNow = new Date(now.getTime() + (beijingOffset - now.getTimezoneOffset()) * 60000);

  const cutoffDayStr = await getSystemConfig("payroll_cutoff_day") ?? "4";
  const cutoffDay = parseInt(cutoffDayStr, 10);

  let payrollYear = beijingNow.getFullYear();
  let payrollMonth = beijingNow.getMonth() + 1; // 1-indexed

  // If we're past the cutoff day of the current month, the active period is the current month
  // (because last month's cutoff has passed, and current month's cutoff is next month)
  // If we're before the cutoff day, the active period is the previous month
  // (because we're still in the window to submit for last month)
  if (beijingNow.getDate() <= cutoffDay) {
    // Before cutoff day: previous month is still open
    payrollMonth -= 1;
    if (payrollMonth < 1) {
      payrollMonth = 12;
      payrollYear -= 1;
    }
  }

  const monthStr = `${payrollYear}-${String(payrollMonth).padStart(2, "0")}`;
  return getPayrollPeriodInfo(monthStr);
}

// ── Cross-Month Leave Splitting ──

/**
 * Split a leave request that spans multiple months into monthly portions.
 * Each portion is attributed to its end month's payroll.
 * Uses 5-day work week by default (configurable per country via workingDaysPerWeek).
 *
 * @param startDate - Leave start date (YYYY-MM-DD)
 * @param endDate - Leave end date (YYYY-MM-DD)
 * @param totalDays - Total leave days (may include half days)
 * @param workingDaysPerWeek - Working days per week (default 5)
 * @returns Array of LeaveSplit portions, one per month
 */
export function splitLeaveByMonth(
  startDate: string,
  endDate: string,
  totalDays: number,
  workingDaysPerWeek: number = 5
): LeaveSplit[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  // If same month, no split needed
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return [{
      startDate,
      endDate,
      days: totalDays,
      payrollMonth: getLeavePayrollMonth(endDate),
    }];
  }

  // Count working days in each month portion
  const portions: { startDate: Date; endDate: Date; workingDays: number }[] = [];
  let currentStart = new Date(start);

  while (currentStart <= end) {
    const currentYear = currentStart.getFullYear();
    const currentMonth = currentStart.getMonth();

    // End of this month or the actual end date, whichever is earlier
    const monthEnd = new Date(currentYear, currentMonth + 1, 0); // Last day of month
    const portionEnd = monthEnd < end ? monthEnd : end;

    // Count working days in this portion
    const workingDays = countWorkingDays(currentStart, portionEnd, workingDaysPerWeek);

    if (workingDays > 0) {
      portions.push({
        startDate: new Date(currentStart),
        endDate: new Date(portionEnd),
        workingDays,
      });
    }

    // Move to first day of next month
    currentStart = new Date(currentYear, currentMonth + 1, 1);
  }

  // Distribute totalDays proportionally across portions
  const totalWorkingDays = portions.reduce((sum, p) => sum + p.workingDays, 0);

  if (totalWorkingDays === 0) {
    // Edge case: no working days found, put all in last month
    return [{
      startDate,
      endDate,
      days: totalDays,
      payrollMonth: getLeavePayrollMonth(endDate),
    }];
  }

  const splits: LeaveSplit[] = [];
  let remainingDays = totalDays;

  for (let i = 0; i < portions.length; i++) {
    const portion = portions[i];
    const isLast = i === portions.length - 1;

    // Proportional allocation, last portion gets remainder to avoid rounding issues
    const allocatedDays = isLast
      ? remainingDays
      : Math.round((portion.workingDays / totalWorkingDays) * totalDays * 10) / 10; // 0.5 day precision

    remainingDays -= allocatedDays;

    const portionEndStr = formatDate(portion.endDate);
    splits.push({
      startDate: formatDate(portion.startDate),
      endDate: portionEndStr,
      days: allocatedDays,
      payrollMonth: getLeavePayrollMonth(portionEndStr),
    });
  }

  return splits;
}

/**
 * Determine if a leave request crosses month boundaries.
 */
export function isLeavesCrossMonth(startDate: string, endDate: string): boolean {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  return start.getFullYear() !== end.getFullYear() || start.getMonth() !== end.getMonth();
}

// ── Helper Functions ──

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function countWorkingDays(start: Date, end: Date, workingDaysPerWeek: number): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay(); // 0=Sun, 6=Sat
    if (workingDaysPerWeek >= 6) {
      // 6-day week: only Sunday off
      if (dayOfWeek !== 0) count++;
    } else {
      // 5-day week: Saturday and Sunday off
      if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function getLastBusinessDay(referenceDate: Date): string {
  // Get the month of the reference date (this is the cutoff month = payment month)
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth(); // 0-indexed

  // Last day of the month
  const lastDay = new Date(Date.UTC(year, month + 1, 0));

  // Walk backwards to find a weekday
  while (lastDay.getUTCDay() === 0 || lastDay.getUTCDay() === 6) {
    lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  }

  return formatDate(new Date(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate()));
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Cutoff passed";

  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}
