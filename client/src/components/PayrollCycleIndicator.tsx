/**
 * PayrollCycleIndicator — Displays current payroll period, cutoff countdown,
 * and payment date. Used in Leave and Adjustments pages to help users
 * understand which payroll cycle their entries will be attributed to.
 *
 * The `label` prop controls the heading text (e.g. "Adjustments", "Leave", "Reimbursements").
 * Defaults to "Payroll" if not provided.
 */
import { trpc } from "@/lib/trpc";
import { formatMonthLong, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, AlertTriangle, CheckCircle2, Info } from "lucide-react";

interface PayrollCycleIndicatorProps {
  /** Optional: specific month to check (YYYY-MM format). If not provided, shows current period. */
  month?: string;
  /** Whether to show in compact mode (single line) */
  compact?: boolean;
  /** Custom label to replace "Payroll" in the heading, e.g. "Adjustments", "Leave", "Reimbursements" */
  label?: string;
}

export default function PayrollCycleIndicator({ month, compact = false, label = "Payroll" }: PayrollCycleIndicatorProps) {
  // Fetch current payroll period info
  const { data: currentPeriod } = trpc.systemSettings.currentPayrollPeriod.useQuery(
    undefined,
    { enabled: !month }
  );

  // Fetch specific month info if provided
  const { data: specificPeriod } = trpc.systemSettings.payrollPeriodInfo.useQuery(
    { month: month! },
    { enabled: !!month }
  );

  const period = month ? specificPeriod : currentPeriod;

  if (!period) return null;

  const cutoffDate = new Date(period.cutoffDate);
  const isUrgent = !period.cutoffPassed && period.timeRemainingMs < 48 * 60 * 60 * 1000; // < 48h
  const isWarning = !period.cutoffPassed && period.timeRemainingMs < 7 * 24 * 60 * 60 * 1000; // < 7 days

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Badge
          variant="outline"
          className={`font-normal ${
            period.cutoffPassed
              ? "bg-red-50 text-red-700 border-red-200"
              : isUrgent
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}
        >
          {period.cutoffPassed ? (
            <>
              <AlertTriangle className="w-3 h-3 mr-1 inline" />
              Cutoff passed
            </>
          ) : isUrgent ? (
            <>
              <Clock className="w-3 h-3 mr-1 inline" />
              {period.timeRemainingLabel}
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3 mr-1 inline" />
              {period.timeRemainingLabel}
            </>
          )}
        </Badge>
        <span className="text-muted-foreground">
          {label}: {formatMonthLong(period.payrollMonth)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        period.cutoffPassed
          ? "bg-red-50/50 border-red-200"
          : isUrgent
          ? "bg-amber-50/50 border-amber-200"
          : isWarning
          ? "bg-blue-50/50 border-blue-200"
          : "bg-muted/30 border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 p-1.5 rounded-md ${
            period.cutoffPassed
              ? "bg-red-100 text-red-600"
              : isUrgent
              ? "bg-amber-100 text-amber-600"
              : "bg-emerald-100 text-emerald-600"
          }`}
        >
          <Calendar className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">
              {formatMonthLong(period.payrollMonth)} {label}
            </span>
            <Badge
              variant="outline"
              className={`text-xs font-normal ${
                period.cutoffPassed
                  ? "bg-red-50 text-red-700 border-red-200"
                  : isUrgent
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              {period.cutoffPassed ? (
                <>
                  <AlertTriangle className="w-3 h-3 mr-1 inline" />
                  Cutoff Passed
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3 mr-1 inline" />
                  {period.timeRemainingLabel}
                </>
              )}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
            <span>
              Cutoff: {formatDate(cutoffDate)} at{" "}
              {cutoffDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}
            </span>
            <span className="text-muted-foreground/50">|</span>
            <span>
              Payment: {formatDate(period.paymentDate)}
            </span>
          </div>
          {period.cutoffPassed && (
            <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Only admin/operations managers can modify entries after cutoff.
            </p>
          )}
          {isUrgent && !period.cutoffPassed && (
            <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Cutoff is approaching. Submit all entries before the deadline.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * CrossMonthLeaveWarning — Shows a warning when leave spans multiple months
 * with a preview of how it will be split.
 */
interface CrossMonthLeaveWarningProps {
  startDate: string;
  endDate: string;
  totalDays: number;
}

export function CrossMonthLeaveWarning({ startDate, endDate, totalDays }: CrossMonthLeaveWarningProps) {
  const { data } = trpc.systemSettings.previewLeaveSplit.useQuery(
    { startDate, endDate, totalDays },
    {
      enabled: !!startDate && !!endDate && totalDays > 0 &&
        startDate.substring(0, 7) !== endDate.substring(0, 7),
    }
  );

  if (!data?.crossMonth) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-sm">
      <div className="flex items-start gap-2">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-blue-800">Cross-Month Leave</p>
          <p className="text-xs text-blue-600 mt-0.5">
            This leave spans multiple months. It will be attributed to payroll as follows:
          </p>
          <div className="mt-2 space-y-1">
            {data.splits.map((split, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="bg-white text-blue-700 border-blue-200 font-normal">
                  {formatMonthLong(split.payrollMonth)}
                </Badge>
                <span className="text-blue-700">
                  {split.days} day{split.days !== 1 ? "s" : ""} ({formatDate(split.startDate)} — {formatDate(split.endDate)})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * CutoffWarningBadge — Small inline badge showing cutoff status for a specific month.
 * Used in table cells to indicate which payroll period an entry belongs to.
 */
interface CutoffWarningBadgeProps {
  effectiveMonth: string; // YYYY-MM
}

export function CutoffWarningBadge({ effectiveMonth }: CutoffWarningBadgeProps) {
  const { data } = trpc.systemSettings.checkCutoff.useQuery(
    { effectiveMonth: `${effectiveMonth}-01` },
    { enabled: !!effectiveMonth }
  );

  if (!data) return null;

  if (data.passed) {
    return (
      <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200 font-normal ml-1">
        Locked
      </Badge>
    );
  }

  return null;
}
