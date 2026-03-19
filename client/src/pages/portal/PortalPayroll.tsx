/**
 * Portal Payroll Page
 *
 * Redesigned layout:
 * - Country selector with flags at the top
 * - Month/year filter
 * - Multi-country payroll support
 * - Click employee row to view payslip detail
 */
import { useState, useMemo } from "react";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  Users,
  FileText,
  Loader2,
  ArrowLeft,
  Globe,
  TrendingUp,
  Briefcase,
  ChevronRight,
  Download,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { exportToCsv } from "@/lib/csvExport";
import { formatCurrency, countryFlag, countryName } from "@/lib/format";



const statusConfig: Record<string, { color: string; icon: any }> = {
  draft: { color: "bg-gray-50 text-gray-600 border-gray-200", icon: FileText },
  pending_approval: { color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  approved: { color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  locked: { color: "bg-blue-50 text-blue-700 border-blue-200", icon: Lock },
  paid: { color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
};

/** Employee Payslip Detail Dialog */
function PayslipDialog({
  open,
  onOpenChange,
  employee,
  run,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: any;
  run: any;
}) {
  if (!employee) return null;
  const currency = employee.currency || run?.currency || "USD";

  // Earnings: exclude reimbursements from gross pay calculation
  const earnings = [
    { label: "Base Salary", amount: employee.baseSalary },
    { label: "Bonus", amount: employee.bonus },
    { label: "Allowances", amount: employee.allowances },
  ].filter(e => Number(e.amount || 0) > 0);

  const deductions = [
    { label: "Tax", amount: employee.taxDeduction },
    { label: "Social Security", amount: employee.socialSecurityDeduction },
    { label: "Other Deductions", amount: employee.deductions },
    { label: "Unpaid Leave", days: employee.unpaidLeaveDays, amount: employee.unpaidLeaveDeduction },
  ].filter(d => Number(d.amount || 0) > 0);

  const reimbursementAmount = Number(employee.reimbursements || 0);
  const netPay = Number(employee.net || 0);
  const totalPayout = netPay + reimbursementAmount;

  const employerContributions = [
    { label: "Social Contributions", amount: employee.employerSocialContribution },
  ].filter(e => Number(e.amount || 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">Payslip Details</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
          {/* Employee Info */}
          <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              {employee.employeeName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{employee.employeeName}</p>
              <p className="text-xs text-muted-foreground">{employee.jobTitle || employee.employeeCode || "Employee"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Payroll Period</p>
              <p className="text-sm font-medium">
                {run ? new Date(run.payrollMonth).toLocaleString("en-US", { month: "long", year: "numeric" }) : "—"}
              </p>
            </div>
          </div>

          {/* Earnings */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Earnings</h4>
            <div className="space-y-1.5">
              {earnings.map((e, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{e.label}</span>
                  <span className="font-mono">{formatCurrency(currency, e.amount)}</span>
                </div>
              ))}
              <Separator className="my-2" />
              <div className="flex justify-between items-center text-sm font-semibold">
                <span>Gross Pay</span>
                <span className="font-mono">{formatCurrency(currency, employee.gross)}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          {deductions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Deductions</h4>
              <div className="space-y-1.5">
                {deductions.map((d, i) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">
                      {d.label}
                      {d.days ? ` (${d.days} days)` : ""}
                    </span>
                    <span className="font-mono text-red-600">-{formatCurrency(currency, d.amount)}</span>
                  </div>
                ))}
                <Separator className="my-2" />
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span>Total Deductions</span>
                  <span className="font-mono text-red-600">
                    -{formatCurrency(
                      currency,
                      deductions.reduce((s, d) => s + Number(d.amount || 0), 0)
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Net Pay */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Net Pay</span>
              <span className="text-lg font-bold font-mono">
                {formatCurrency(currency, employee.net)}
              </span>
            </div>
          </div>

          {/* Reimbursements — separate from salary */}
          {reimbursementAmount > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Reimbursements</h4>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Expense Reimbursement</span>
                  <span className="font-mono">{formatCurrency(currency, reimbursementAmount)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Total Payout — what the employee actually receives */}
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-semibold text-emerald-800 dark:text-emerald-200">Total Payout</span>
                {reimbursementAmount > 0 && (
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">This includes net pay and reimbursements.</p>
                )}
              </div>
              <span className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
                {formatCurrency(currency, totalPayout)}
              </span>
            </div>
          </div>

          {/* Employer Contributions */}
          {employerContributions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Employer Contributions</h4>
              <div className="space-y-1.5">
                {employerContributions.map((e, i) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{e.label}</span>
                    <span className="font-mono">{formatCurrency(currency, e.amount)}</span>
                  </div>
                ))}
                <Separator className="my-2" />
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span>Total Employment Cost</span>
                  <span className="font-mono">{formatCurrency(currency, employee.totalEmploymentCost)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {employee.notes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</h4>
              <p className="text-sm text-muted-foreground bg-muted/40 p-3 rounded-lg">{employee.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Payroll Run Card — shows employee table with clickable rows */
function PayrollRunCard({
  run,
  onSelectEmployee,
}: {
  run: any;
  onSelectEmployee: (employee: any, run: any) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: detail, isLoading: loadingDetail } = portalTrpc.payroll.detail.useQuery(
    { id: run.id },
    { enabled: isExpanded }
  );

  const config = statusConfig[run.status] || statusConfig.approved;
  const StatusIcon = config.icon;

  const payrollDate = new Date(run.payrollMonth);
  const monthLabel = payrollDate.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div
        className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Country Flag */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/5 to-primary/15 flex items-center justify-center text-2xl">
              {countryFlag(run.countryCode)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-base">{countryName(run.countryCode)}</p>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", config.color)}>
                  <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                  {run.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                <Calendar className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                {monthLabel} · {run.employeeCount || 0} employees
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">Total Gross</p>
              <p className="text-base font-bold font-mono">
                {formatCurrency(run.currency, run.customerTotalGross)}
              </p>
            </div>
            <div className="text-right hidden md:block">
              <p className="text-xs text-muted-foreground">Net Pay</p>
              <p className="text-base font-semibold font-mono text-muted-foreground">
                {formatCurrency(run.currency, run.customerTotalNet)}
              </p>
            </div>
            <ChevronRight className={cn(
              "w-5 h-5 text-muted-foreground transition-transform",
              isExpanded && "rotate-90"
            )} />
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t">
          {loadingDetail ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Loading payroll details...</span>
            </div>
          ) : !detail?.items?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payroll items found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Employee</TableHead>
                    <TableHead className="text-right font-semibold">Base Salary</TableHead>
                    <TableHead className="text-right font-semibold hidden md:table-cell">Allowances</TableHead>
                    <TableHead className="text-right font-semibold hidden lg:table-cell">Deductions</TableHead>
                    <TableHead className="text-right font-semibold">Gross</TableHead>
                    <TableHead className="text-right font-semibold">Net Pay</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((item: any) => {
                    const totalDeductions = Number(item.deductions || 0) + Number(item.taxDeduction || 0) +
                      Number(item.socialSecurityDeduction || 0) + Number(item.unpaidLeaveDeduction || 0);
                    return (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => onSelectEmployee(item, run)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
                              {item.employeeName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{item.employeeName}</p>
                              <p className="text-xs text-muted-foreground">{item.jobTitle || item.employeeCode}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(item.currency || run.currency, item.baseSalary)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm hidden md:table-cell">
                          {formatCurrency(item.currency || run.currency, item.allowances)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600 hidden lg:table-cell">
                          {totalDeductions > 0
                            ? `-${formatCurrency(item.currency || run.currency, totalDeductions)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(item.currency || run.currency, item.gross)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {formatCurrency(item.currency || run.currency, item.net)}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Total Row */}
                  <TableRow className="bg-muted/40 font-semibold border-t-2">
                    <TableCell>
                      <span className="text-sm">Total ({detail.items.length} employees)</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(
                        run.currency,
                        detail.items.reduce((s: number, i: any) => s + Number(i.baseSalary || 0), 0)
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm hidden md:table-cell">
                      {formatCurrency(
                        run.currency,
                        detail.items.reduce((s: number, i: any) => s + Number(i.allowances || 0), 0)
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-red-600 hidden lg:table-cell">
                      -{formatCurrency(run.currency, run.customerTotalDeductions)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(run.currency, run.customerTotalGross)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(run.currency, run.customerTotalNet)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Multi-currency summary card with expandable breakdown */
function MultiCurrencyCard({
  icon,
  iconBg,
  label,
  byCurrency,
  field,
  isMultiCurrency,
  singleCurrency,
  singleValue,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  byCurrency: Record<string, { gross: number; net: number }>;
  field: "gross" | "net";
  isMultiCurrency: boolean;
  singleCurrency: string;
  singleValue: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!isMultiCurrency) {
    return (
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", iconBg)}>
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className="text-lg font-bold font-mono truncate">
                {formatCurrency(singleCurrency, singleValue)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Multi-currency: show currency count + expandable breakdown
  const entries = Object.entries(byCurrency).sort((a, b) => b[1][field] - a[1][field]);
  const topEntry = entries[0];
  const currencyCount = entries.length;

  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
            {/* Show the largest currency prominently */}
            <p className="text-lg font-bold font-mono truncate">
              {formatCurrency(topEntry[0], topEntry[1][field])}
            </p>
            {/* Toggle to show/hide other currencies */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            >
              <span>+{currencyCount - 1} more {currencyCount - 1 === 1 ? "currency" : "currencies"}</span>
              <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
            </button>
          </div>
        </div>
        {/* Expandable currency breakdown */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-1.5">
            {entries.slice(1).map(([cur, val]) => (
              <div key={cur} className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-medium">{cur}</span>
                <span className="font-mono font-semibold">{formatCurrency(cur, val[field])}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Export CSV button that fetches employee-level detail data */
function ExportCsvButton({ year, disabled }: { year: number; disabled: boolean }) {
  const [isExporting, setIsExporting] = useState(false);
  const utils = portalTrpc.useUtils();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await utils.payroll.exportData.fetch({ year });
      if (!data || data.length === 0) return;
      exportToCsv(data, [
        { header: "Month", accessor: (r: any) => r.payrollMonth ? new Date(r.payrollMonth).toLocaleString("en-US", { month: "long", year: "numeric" }) : "" },
        { header: "Country/Region", accessor: (r: any) => r.countryCode || "" },
        { header: "Employee Name", accessor: (r: any) => r.employeeName || "" },
        { header: "Employee Code", accessor: (r: any) => r.employeeCode || "" },
        { header: "Job Title", accessor: (r: any) => r.jobTitle || "" },
        { header: "Currency", accessor: (r: any) => r.currency || "" },
        { header: "Base Salary", accessor: (r: any) => r.baseSalary || 0 },
        { header: "Bonus", accessor: (r: any) => r.bonus || 0 },
        { header: "Allowances", accessor: (r: any) => r.allowances || 0 },
        { header: "Reimbursements", accessor: (r: any) => r.reimbursements || 0 },
        { header: "Deductions", accessor: (r: any) => r.deductions || 0 },
        { header: "Tax Deduction", accessor: (r: any) => r.taxDeduction || 0 },
        { header: "Social Security", accessor: (r: any) => r.socialSecurityDeduction || 0 },
        { header: "Unpaid Leave Deduction", accessor: (r: any) => r.unpaidLeaveDeduction || 0 },
        { header: "Unpaid Leave Days", accessor: (r: any) => r.unpaidLeaveDays || 0 },
        { header: "Gross", accessor: (r: any) => r.gross || 0 },
        { header: "Net", accessor: (r: any) => r.net || 0 },
        { header: "Employer Social Contribution", accessor: (r: any) => r.employerSocialContribution || 0 },
        { header: "Total Employment Cost", accessor: (r: any) => r.totalEmploymentCost || 0 },
      ], `payroll-detail-${year}-${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" disabled={disabled || isExporting} onClick={handleExport}>
      {isExporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
      Export CSV
    </Button>
  );
}

export default function PortalPayroll() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [payslipOpen, setPayslipOpen] = useState(false);

  const { data: payrollData, isLoading } = portalTrpc.payroll.list.useQuery({
    year: parseInt(selectedYear),
  });

  const years = useMemo(() => {
    const yrs = [];
    for (let y = currentYear; y >= currentYear - 3; y--) yrs.push(String(y));
    return yrs;
  }, [currentYear]);

  // Filter to only show approved/locked/paid runs
  const visibleRuns = useMemo(() => {
    if (!payrollData?.items) return [];
    return payrollData.items.filter((r: any) =>
      ["approved", "locked", "paid"].includes(r.status)
    );
  }, [payrollData]);

  // Get unique countries from runs
  const countries = useMemo(() => {
    const countrySet = new Set<string>();
    visibleRuns.forEach((r: any) => countrySet.add(r.countryCode));
    return Array.from(countrySet).sort();
  }, [visibleRuns]);

  // Filter by selected country
  const filteredRuns = useMemo(() => {
    if (selectedCountry === "all") return visibleRuns;
    return visibleRuns.filter((r: any) => r.countryCode === selectedCountry);
  }, [visibleRuns, selectedCountry]);

  // Summary stats — group by currency for multi-currency support
  const stats = useMemo(() => {
    const byCurrency: Record<string, { gross: number; net: number }> = {};
    let totalEmployees = 0;
    for (const r of filteredRuns) {
      const cur = r.currency || "USD";
      if (!byCurrency[cur]) byCurrency[cur] = { gross: 0, net: 0 };
      byCurrency[cur].gross += Number(r.customerTotalGross || 0);
      byCurrency[cur].net += Number(r.customerTotalNet || 0);
      totalEmployees += r.employeeCount || 0;
    }
    const currencies = Object.keys(byCurrency);
    const isMultiCurrency = currencies.length > 1;
    // For single currency, keep backward-compatible shape
    const currency = currencies[0] || "USD";
    const totalGross = isMultiCurrency ? 0 : (byCurrency[currency]?.gross || 0);
    const totalNet = isMultiCurrency ? 0 : (byCurrency[currency]?.net || 0);
    return { totalGross, totalNet, totalEmployees, currency, runCount: filteredRuns.length, isMultiCurrency, byCurrency };
  }, [filteredRuns]);

  const handleSelectEmployee = (employee: any, run: any) => {
    setSelectedEmployee(employee);
    setSelectedRun(run);
    setPayslipOpen(true);
  };

  return (
    <PortalLayout title="Payroll">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Payroll</h2>
            <p className="text-sm text-muted-foreground mt-1">
              View approved payroll runs and employee salary details
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Country Filter */}
            {countries.length > 1 && (
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Countries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      All Countries
                    </span>
                  </SelectItem>
                  {countries.map((code) => (
                    <SelectItem key={code} value={code}>
                      <span className="flex items-center gap-2">
                        <span className="text-base">{countryFlag(code)}</span>
                        {countryName(code)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Year Filter */}
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ExportCsvButton year={parseInt(selectedYear)} disabled={filteredRuns.length === 0} />
          </div>
        </div>

        {/* Summary Cards */}
        {!isLoading && filteredRuns.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total Gross Card */}
            <MultiCurrencyCard
              icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
              iconBg="bg-emerald-50 dark:bg-emerald-950/30"
              label="Total Gross"
              byCurrency={stats.byCurrency}
              field="gross"
              isMultiCurrency={stats.isMultiCurrency}
              singleCurrency={stats.currency}
              singleValue={stats.totalGross}
            />
            {/* Total Net Card */}
            <MultiCurrencyCard
              icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
              iconBg="bg-blue-50 dark:bg-blue-950/30"
              label="Total Net"
              byCurrency={stats.byCurrency}
              field="net"
              isMultiCurrency={stats.isMultiCurrency}
              singleCurrency={stats.currency}
              singleValue={stats.totalNet}
            />
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Payroll Runs</p>
                    <p className="text-lg font-bold">{stats.runCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                    <Users className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Employees</p>
                    <p className="text-lg font-bold">{stats.totalEmployees}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Country Chips (when multiple countries) */}
        {countries.length > 1 && !isLoading && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCountry === "all" ? "default" : "outline"}
              size="sm"
              className="rounded-full h-8"
              onClick={() => setSelectedCountry("all")}
            >
              <Globe className="w-3.5 h-3.5 mr-1.5" />
              All ({visibleRuns.length})
            </Button>
            {countries.map((code) => {
              const countryRuns = visibleRuns.filter((r: any) => r.countryCode === code);
              return (
                <Button
                  key={code}
                  variant={selectedCountry === code ? "default" : "outline"}
                  size="sm"
                  className="rounded-full h-8"
                  onClick={() => setSelectedCountry(code)}
                >
                  <span className="mr-1.5">{countryFlag(code)}</span>
                  {countryName(code)} ({countryRuns.length})
                </Button>
              );
            })}
          </div>
        )}

        {/* Payroll Runs */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : filteredRuns.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <DollarSign className="w-8 h-8" />
                </div>
                <p className="text-lg font-medium">No approved payroll runs found</p>
                <p className="text-sm mt-1">
                  {selectedCountry !== "all"
                    ? `No payroll runs found for ${countryName(selectedCountry)} in ${selectedYear}.`
                    : `Payroll runs will appear here once approved by your operations manager.`}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredRuns.map((run: any) => (
              <PayrollRunCard
                key={run.id}
                run={run}
                onSelectEmployee={handleSelectEmployee}
              />
            ))}
          </div>
        )}
      </div>

      {/* Payslip Detail Dialog */}
      <PayslipDialog
        open={payslipOpen}
        onOpenChange={setPayslipOpen}
        employee={selectedEmployee}
        run={selectedRun}
      />
    </PortalLayout>
  );
}