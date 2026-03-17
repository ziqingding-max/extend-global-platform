/**
 * PortalPayrollCycleIndicator — Portal version of PayrollCycleIndicator.
 * Uses portalTrpc instead of admin trpc for API calls.
 *
 * Displays current payroll period, cutoff countdown, and payment date.
 * Used in Portal Leave, Adjustments, and Reimbursements pages.
 *
 * The `label` prop controls the heading text (e.g. "Adjustments", "Leave", "Reimbursements").
 * Defaults to "Payroll" if not provided.
 */
import { portalTrpc } from "@/lib/portalTrpc";
import { formatMonthLong, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, AlertTriangle, CheckCircle2, Info } from "lucide-react";

interface PortalPayrollCycleIndicatorProps {
  /** Optional: specific month to check (YYYY-MM format). If not provided, shows current period. */
  month?: string;
  /** Whether to show in compact mode (single line) */
  compact?: boolean;
  /** Custom label to replace "Payroll" in the heading, e.g. "Adjustments", "Leave", "Reimbursements" */
  label?: string;
}

export default function PortalPayrollCycleIndicator({ month, compact = false, label = "Payroll" }: PortalPayrollCycleIndicatorProps) {
  // Fetch current payroll period info
  const { data: currentPeriod } = portalTrpc.settings.currentPayrollPeriod.useQuery(
    undefined,
    { enabled: !month }
  );

  // Fetch specific month info if provided
  const { data: specificPeriod } = portalTrpc.settings.payrollPeriodInfo.useQuery(
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
              The submission deadline for this payroll period has passed. Please contact your GEA account manager for any changes.
            </p>
          )}
          {isUrgent && !period.cutoffPassed && (
            <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Cutoff is approaching. Please submit and approve all entries before the deadline.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * PortalCrossMonthLeaveWarning — Portal version of CrossMonthLeaveWarning.
 * Shows a warning when leave spans multiple months with a preview of how it will be split.
 */
interface PortalCrossMonthLeaveWarningProps {
  startDate: string;
  endDate: string;
  totalDays: number;
}

export function PortalCrossMonthLeaveWarning({ startDate, endDate, totalDays }: PortalCrossMonthLeaveWarningProps) {
  const { data } = portalTrpc.settings.previewLeaveSplit.useQuery(
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
            This leave spans multiple months. It will be automatically split for payroll attribution:
          </p>
          <div className="mt-2 space-y-1">
            {data.splits.map((split: any, i: number) => (
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
