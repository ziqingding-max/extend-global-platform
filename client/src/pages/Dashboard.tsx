/*
 * EG Admin — Dashboard (Multi-Tab)
 * 5 tabs: Overview, Operations, Finance, HR & Leave, Activity Log
 * Strict role-based tab visibility
 * Interactive Recharts charts for monthly trends and revenue
 */

import { useMemo } from "react";
import Layout from "@/components/Layout";
import { formatDateTime, formatCurrencyCompact, formatMonthShort, countryName } from "@/lib/format";
import { formatActivitySummary } from "@/lib/auditDescriptions";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Users,
  Building2,
  DollarSign,
  FileText,
  ArrowUpDown,
  CalendarDays,
  Globe,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  ClipboardList,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  Briefcase,
  UserPlus,
  UserMinus,
  FileWarning,
  Landmark,
} from "lucide-react";
import { Link } from "wouter";
import { hasAnyRole, hasRole } from "@shared/roles";

// ── Role visibility rules ──
// Overview: all users
// Operations: admin, operations_manager
// Finance: admin, finance_manager
// HR & Leave: admin, operations_manager
// Activity Log: admin

function canSeeOperations(role: string | null | undefined): boolean {
  return hasAnyRole(role, ["admin", "operations_manager"]);
}
function canSeeFinance(role: string | null | undefined): boolean {
  return hasAnyRole(role, ["admin", "finance_manager"]);
}
function canSeeHR(role: string | null | undefined): boolean {
  return hasAnyRole(role, ["admin", "operations_manager"]);
}
function canSeeActivity(role: string | null | undefined): boolean {
  return hasRole(role, "admin");
}

// ── Shared components ──

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  href,
  variant = "default",
  trend,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  href?: string;
  variant?: "default" | "warning" | "success" | "danger";
  trend?: { value: number; label: string };
}) {
  const content = (
    <Card className={`relative overflow-hidden transition-all duration-200 ${href ? "hover:shadow-md cursor-pointer" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 text-xs">
                {trend.value > 0 ? (
                  <TrendingUp className="w-3 h-3 text-emerald-600" />
                ) : trend.value < 0 ? (
                  <TrendingDown className="w-3 h-3 text-red-600" />
                ) : null}
                <span className={trend.value > 0 ? "text-emerald-600" : trend.value < 0 ? "text-red-600" : "text-muted-foreground"}>
                  {trend.value > 0 ? "+" : ""}{trend.value}% {trend.label}
                </span>
              </div>
            )}
            {description && !trend && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={`p-2.5 rounded-lg ${
            variant === "warning" ? "bg-amber-50 text-amber-600" :
            variant === "success" ? "bg-emerald-50 text-emerald-600" :
            variant === "danger" ? "bg-red-50 text-red-600" :
            "bg-primary/10 text-primary"
          }`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ height = "h-[300px]" }: { height?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className={`w-full ${height} rounded-lg`} />
      </CardContent>
    </Card>
  );
}




// ── Tab: Overview ──
function OverviewTab() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: byCountry } = trpc.dashboard.employeesByCountry.useQuery();
  const { data: byStatus } = trpc.dashboard.employeesByStatus.useQuery();
  const { data: trends } = trpc.dashboard.monthlyTrends.useQuery();

  const trendChartData = useMemo(() => {
    if (!trends) return [];
    return trends.months.map((m, i) => ({
      month: formatMonthShort(m),
      employees: trends.employeeTrend[i],
      customers: trends.customerTrend[i],
    }));
  }, [trends]);

  const trendConfig: ChartConfig = {
    employees: { label: "Total Employees", color: "oklch(0.65 0.19 250)" },
    customers: { label: "Total Customers", color: "oklch(0.72 0.17 150)" },
  };

  const statusColors: Record<string, string> = {
    active: "#10b981",
    pending_review: "#f59e0b",
    onboarding: "#3b82f6",
    contract_signed: "#8b5cf6",
    on_leave: "#a855f7",
    offboarding: "#f97316",
    terminated: "#ef4444",
  };

  const pieData = useMemo(() => {
    if (!byStatus) return [];
    return byStatus.map(s => ({
      name: (s.status || "Unknown").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      value: Number(s.count),
      fill: statusColors[s.status ?? ""] || "#9ca3af",
    }));
  }, [byStatus]);

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard title="Total Customers" value={stats?.totalCustomers ?? 0} icon={Building2} href="/customers" description="Active customer accounts" />
            <StatCard title="Total Employees" value={stats?.totalEmployees ?? 0} icon={Users} description={`${stats?.activeEmployees ?? 0} Active`} href="/employees" />
            <StatCard title="Pending Payrolls" value={stats?.pendingPayrolls ?? 0} icon={DollarSign} description="Awaiting approval" href="/payroll" variant={Number(stats?.pendingPayrolls) > 0 ? "warning" : "default"} />
            <StatCard title="Draft Invoices" value={stats?.pendingInvoices ?? 0} icon={FileText} description="Ready for review" href="/invoices" variant={Number(stats?.pendingInvoices) > 0 ? "warning" : "default"} />
          </>
        )}
      </div>

      {/* Monthly incremental + pending items */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard title="New Hires This Month" value={stats?.newHiresThisMonth ?? 0} icon={UserPlus} href="/employees" description="This month" />
            <StatCard title="Terminations This Month" value={stats?.terminationsThisMonth ?? 0} icon={UserMinus} href="/employees" variant={Number(stats?.terminationsThisMonth) > 0 ? "danger" : "default"} description="This month" />
            <StatCard title="New Clients This Month" value={stats?.newClientsThisMonth ?? 0} icon={Building2} href="/customers" description="This month" />
            <StatCard title="Pending Adjustments" value={stats?.pendingAdjustments ?? 0} icon={ArrowUpDown} href="/adjustments" variant={Number(stats?.pendingAdjustments) > 0 ? "warning" : "default"} description="Bonus, allowance, reimbursement" />
            <StatCard title="Pending Leave" value={stats?.pendingLeaves ?? 0} icon={CalendarDays} href="/leave" variant={Number(stats?.pendingLeaves) > 0 ? "warning" : "default"} description="Leave awaiting approval" />
            <StatCard title="Active Countries" value={byCountry?.length ?? 0} icon={Globe} href="/countries" variant="success" description="Countries with employees" />
          </>
        )}
      </div>

      {/* Trend chart + Employee distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Growth Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trendChartData.length > 0 ? (
              <ChartContainer config={trendConfig} className="h-[280px] w-full">
                <AreaChart data={trendChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillEmployees" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-employees)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-employees)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillCustomers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-customers)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-customers)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={35} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area type="monotone" dataKey="employees" stroke="var(--color-employees)" fill="url(#fillEmployees)" strokeWidth={2} />
                  <Area type="monotone" dataKey="customers" stroke="var(--color-customers)" fill="url(#fillCustomers)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            ) : (
              <Skeleton className="h-[280px] w-full rounded-lg" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Employee Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <ChartContainer config={{}} className="h-[180px] w-full">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  </PieChart>
                </ChartContainer>
                <div className="space-y-1.5 mt-2">
                  {pieData.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                      <span className="flex-1 text-muted-foreground">{item.name}</span>
                      <span className="font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Users className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No data</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Employees by Country */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Employees by Country</CardTitle>
        </CardHeader>
        <CardContent>
          {byCountry && byCountry.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {byCountry.map((item) => {
                const total = byCountry.reduce((sum, c) => sum + Number(c.count), 0);
                const pct = total > 0 ? ((Number(item.count) / total) * 100) : 0;
                return (
                  <div key={item.country} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="text-sm flex-1 font-medium">{countryName(item.country) || "Unknown"}</span>
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Globe className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No data</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Operations ──
function OperationsTab() {
  const { data: ops, isLoading } = trpc.dashboard.operationsOverview.useQuery();
  const { data: trends } = trpc.dashboard.monthlyTrends.useQuery();

  const payrollStatusColors: Record<string, string> = {
    draft: "#9ca3af",
    pending_approval: "#f59e0b",
    approved: "#3b82f6",
    processing: "#8b5cf6",
    completed: "#10b981",
    rejected: "#ef4444",
  };

  const payrollPieData = useMemo(() => {
    if (!ops) return [];
    return ops.payrollByStatus.map(s => ({
      name: (s.status || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      value: s.count,
      fill: payrollStatusColors[s.status] || "#9ca3af",
    }));
  }, [ops]);

  const payrollTrendData = useMemo(() => {
    if (!trends) return [];
    return trends.months.map((m, i) => ({
      month: formatMonthShort(m),
      payrollRuns: trends.payrollTrend[i],
      invoices: trends.invoiceTrend[i],
    }));
  }, [trends]);

  const trendConfig: ChartConfig = {
    payrollRuns: { label: "Payroll Runs", color: "oklch(0.65 0.19 250)" },
    invoices: { label: "Invoices", color: "oklch(0.72 0.17 30)" },
  };

  if (isLoading) return <div className="space-y-6"><ChartSkeleton /><ChartSkeleton /></div>;

  return (
    <div className="space-y-6">
      {/* Pending Approvals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Pending Payrolls"
          value={ops?.pendingApprovals.payrolls ?? 0}
          icon={DollarSign}
          href="/payroll"
          variant={Number(ops?.pendingApprovals.payrolls) > 0 ? "warning" : "default"}
          description="Awaiting review"
        />
        <StatCard
          title="Onboarding"
          value={ops?.employeeOnboarding ?? 0}
          icon={Briefcase}
          href="/employees"
          variant={Number(ops?.employeeOnboarding) > 0 ? "warning" : "success"}
          description="Employee onboarding"
        />
        <StatCard
          title="Offboarding"
          value={ops?.employeeOffboarding ?? 0}
          icon={XCircle}
          href="/employees"
          variant={Number(ops?.employeeOffboarding) > 0 ? "danger" : "default"}
          description="Employee offboarding"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payroll & Invoice trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Monthly Payroll & Invoice Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {payrollTrendData.length > 0 ? (
              <ChartContainer config={trendConfig} className="h-[280px] w-full">
                <BarChart data={payrollTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={30} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="payrollRuns" fill="var(--color-payrollRuns)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="invoices" fill="var(--color-invoices)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <Skeleton className="h-[280px] w-full rounded-lg" />
            )}
          </CardContent>
        </Card>

        {/* Payroll status distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Payroll Status</CardTitle>
          </CardHeader>
          <CardContent>
            {payrollPieData.length > 0 ? (
              <>
                <ChartContainer config={{}} className="h-[180px] w-full">
                  <PieChart>
                    <Pie data={payrollPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                      {payrollPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  </PieChart>
                </ChartContainer>
                <div className="space-y-1.5 mt-2">
                  {payrollPieData.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                      <span className="flex-1 text-muted-foreground">{item.name}</span>
                      <span className="font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No data</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Payroll Runs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Recent Payroll Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {ops?.recentPayrollRuns && ops.recentPayrollRuns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Country/Region</th>
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium text-right">Gross Total</th>
                    <th className="pb-2 font-medium text-right">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.recentPayrollRuns.map((run) => (
                    <tr key={run.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 font-medium">{run.countryCode}</td>
                      <td className="py-2.5">{run.payrollMonth ? formatMonthShort(String(run.payrollMonth).substring(0, 7)) : "-"}</td>
                      <td className="py-2.5">
                        <Badge variant="outline" className="text-xs font-normal">
                          {(run.status || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right font-mono">{run.totalGrossSalary ? formatCurrencyCompact(run.totalGrossSalary) : "-"}</td>
                      <td className="py-2.5 text-right text-muted-foreground text-xs">{run.createdAt ? formatDateTime(run.createdAt) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <ClipboardList className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No data</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Finance ──
function FinanceTab() {
  const { data: finance, isLoading } = trpc.dashboard.financeOverview.useQuery();

  const revenueChartData = useMemo(() => {
    if (!finance) return [];
    const costMap = new Map((finance as any).monthlyCost?.map((c: any) => [c.month, c]) || []);
    return finance.monthlyRevenue.map(m => {
      const cost = costMap.get(m.month) as any;
      const revenue = parseFloat(m.totalRevenue);
      const totalCost = cost ? parseFloat(cost.totalCostUsd || "0") : 0;
      const govCost = cost ? parseFloat(cost.govCostUsd || "0") : 0;
      const opex = cost ? parseFloat(cost.opex || "0") : 0;
      return {
        month: formatMonthShort(m.month),
        totalRevenue: revenue,
        serviceFeeRevenue: parseFloat(m.serviceFeeRevenue),
        grossMargin: revenue - govCost,
        netProfit: revenue - totalCost,
        invoiceCount: m.invoiceCount,
      };
    });
  }, [finance]);

  const revenueConfig: ChartConfig = {
    totalRevenue: { label: "Total Invoice Revenue", color: "oklch(0.65 0.19 250)" },
    serviceFeeRevenue: { label: "Service Fee Revenue", color: "oklch(0.72 0.17 150)" },
    grossMargin: { label: "Gross Margin", color: "oklch(0.70 0.18 50)" },
    netProfit: { label: "Net Profit", color: "oklch(0.65 0.20 145)" },
  };

  const invoiceCountConfig: ChartConfig = {
    invoiceCount: { label: "Paid Invoices", color: "oklch(0.65 0.15 30)" },
  };

  if (isLoading) return <div className="space-y-6">{Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)}<ChartSkeleton /></div>;

  return (
    <div className="space-y-6">
      {/* P&L KPIs - Top Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrencyCompact(finance?.totalRevenue ?? "0")}
          icon={DollarSign}
          variant="success"
          description="From paid invoices (USD)"
        />
        <StatCard
          title="Gross Margin"
          value={formatCurrencyCompact((finance as any)?.grossMargin ?? "0")}
          icon={TrendingUp}
          variant={parseFloat((finance as any)?.grossMargin ?? "0") > 0 ? "success" : "danger"}
          description="Revenue - Employment Cost (USD)"
        />
        <StatCard
          title="Service Fee Revenue"
          value={formatCurrencyCompact(finance?.totalServiceFeeRevenue ?? "0")}
          icon={Wallet}
          variant="success"
          description="Management service fees"
        />
        <StatCard
          title="Net Profit"
          value={formatCurrencyCompact((finance as any)?.netProfit ?? "0")}
          icon={parseFloat((finance as any)?.netProfit ?? "0") >= 0 ? TrendingUp : TrendingDown}
          variant={parseFloat((finance as any)?.netProfit ?? "0") >= 0 ? "success" : "danger"}
          description="After all costs & expenses"
        />
      </div>

      {/* Cost & Outstanding KPIs - Second Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Employment Cost (USD)"
          value={formatCurrencyCompact((finance as any)?.totalGovCostUsd ?? "0")}
          icon={Landmark}
          variant="default"
          description="Government pass-through"
        />
        <StatCard
          title="Operating Expenses"
          value={formatCurrencyCompact((finance as any)?.totalOpex ?? "0")}
          icon={Briefcase}
          variant="default"
          description="Service fees + bank charges"
        />
        <StatCard
          title="Deferred Revenue"
          value={formatCurrencyCompact(finance?.totalDeferredRevenue ?? "0")}
          icon={Landmark}
          variant="default"
          description="Deposit liability"
        />
        <StatCard
          title="Outstanding"
          value={formatCurrencyCompact(finance?.totalOutstandingAmount ?? "0")}
          icon={Clock}
          href="/invoices"
          variant={parseFloat(finance?.totalOutstandingAmount ?? "0") > 0 ? "warning" : "default"}
          description="Unpaid invoices"
        />
        <StatCard
          title="Overdue"
          value={formatCurrencyCompact(finance?.totalOverdueAmount ?? "0")}
          icon={AlertCircle}
          href="/invoices"
          variant={parseFloat(finance?.totalOverdueAmount ?? "0") > 0 ? "danger" : "default"}
          description="Past due invoices"
        />
      </div>

      {/* Revenue trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Monthly Revenue (12 months)</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">By payment date (Cash Basis) · Excludes deposits & credit notes</p>
        </CardHeader>
        <CardContent>
          {revenueChartData.length > 0 ? (
            <ChartContainer config={revenueConfig} className="h-[320px] w-full">
              <ComposedChart data={revenueChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={50} tickFormatter={(v) => formatCurrencyCompact(v)} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <span className="font-mono">{formatCurrencyCompact(value as number)}</span>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="totalRevenue" fill="var(--color-totalRevenue)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="serviceFeeRevenue" fill="var(--color-serviceFeeRevenue)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="grossMargin" stroke="var(--color-grossMargin)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="netProfit" stroke="var(--color-netProfit)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ChartContainer>
          ) : (
            <Skeleton className="h-[320px] w-full rounded-lg" />
          )}
        </CardContent>
      </Card>

      {/* Invoice count trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Monthly Paid Invoice Count</CardTitle>
        </CardHeader>
        <CardContent>
          {revenueChartData.length > 0 ? (
            <ChartContainer config={invoiceCountConfig} className="h-[220px] w-full">
              <LineChart data={revenueChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={30} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="invoiceCount" stroke="var(--color-invoiceCount)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ChartContainer>
          ) : (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          )}
        </CardContent>
      </Card>
      {/* Link to full P&L Report */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Profit & Loss Report</h3>
              <p className="text-xs text-muted-foreground mt-0.5">View detailed P&L breakdown by month, customer, vendor, and category</p>
            </div>
            <Link href="/reports/profit-loss">
              <Button variant="outline" size="sm" className="gap-1.5">
                <BarChart3 className="w-4 h-4" />View Full Report
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
// ── Tab: HR & Leave ───
function HRLeaveTab() {
  const { data: hr, isLoading } = trpc.dashboard.hrOverview.useQuery();

  const leaveStatusColors: Record<string, string> = {
    submitted: "#f59e0b",
    locked: "#3b82f6",
    cancelled: "#9ca3af",
  };

  const leavePieData = useMemo(() => {
    if (!hr) return [];
    return hr.leaveByStatus.map(s => ({
      name: (s.status || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      value: s.count,
      fill: leaveStatusColors[s.status] || "#9ca3af",
    }));
  }, [hr]);

  const monthlyLeaveData = useMemo(() => {
    if (!hr) return [];
    return hr.monthlyLeave.map(m => ({
      month: formatMonthShort(m.month),
      count: m.count,
      totalDays: parseFloat(m.totalDays),
    }));
  }, [hr]);

  const workforceTrendData = useMemo(() => {
    if (!hr) return [];
    return hr.monthlyWorkforce.map(m => ({
      month: formatMonthShort(m.month),
      active: m.active,
      newHires: m.newHires,
      terminations: m.terminations,
      onLeave: m.onLeave,
    }));
  }, [hr]);

  const leaveChartConfig: ChartConfig = {
    count: { label: "Leave Records", color: "oklch(0.65 0.19 280)" },
    totalDays: { label: "Total Days", color: "oklch(0.72 0.17 30)" },
  };

  const workforceChartConfig: ChartConfig = {
    active: { label: "Active", color: "oklch(0.65 0.19 150)" },
    newHires: { label: "New Hires", color: "oklch(0.65 0.19 250)" },
    terminations: { label: "Terminations", color: "oklch(0.65 0.22 25)" },
    onLeave: { label: "On Leave", color: "oklch(0.72 0.17 300)" },
  };

  const adjustmentTypeColors: Record<string, string> = {
    bonus: "#10b981",
    allowance: "#3b82f6",
    reimbursement: "#8b5cf6",
    deduction: "#ef4444",
    other: "#9ca3af",
  };

  // Combine all contract expiry alerts (deduplicated by employeeId, shortest window)
  const contractAlerts = useMemo(() => {
    if (!hr) return [];
    const all30 = hr.contractExpiry30.map(c => ({ ...c, urgency: "critical" as const, days: 30 }));
    const all60 = hr.contractExpiry60
      .filter(c => !hr.contractExpiry30.some(c30 => c30.employeeId === c.employeeId))
      .map(c => ({ ...c, urgency: "warning" as const, days: 60 }));
    const all90 = hr.contractExpiry90
      .filter(c => !hr.contractExpiry60.some(c60 => c60.employeeId === c.employeeId))
      .map(c => ({ ...c, urgency: "info" as const, days: 90 }));
    return [...all30, ...all60, ...all90];
  }, [hr]);

  if (isLoading) return <div className="space-y-6">{Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)}<ChartSkeleton /></div>;

  return (
    <div className="space-y-6">
      {/* Workforce KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Active Employees" value={hr?.activeEmployees ?? 0} icon={Users} variant="success" href="/employees" />
        <StatCard title="On Leave Employees" value={hr?.onLeaveEmployees ?? 0} icon={CalendarDays} variant={Number(hr?.onLeaveEmployees) > 0 ? "warning" : "default"} href="/employees" />
        <StatCard title="New Hires This Month" value={hr?.newHiresThisMonth ?? 0} icon={UserPlus} variant="default" href="/employees" />
        <StatCard title="Terminations This Month" value={hr?.terminationsThisMonth ?? 0} icon={UserMinus} variant={Number(hr?.terminationsThisMonth) > 0 ? "danger" : "default"} href="/employees" />
        <StatCard title="Onboarding" value={hr?.onboardingEmployees ?? 0} icon={Briefcase} variant="default" href="/employees" />
        <StatCard title="Offboarding" value={hr?.offboardingEmployees ?? 0} icon={XCircle} variant={Number(hr?.offboardingEmployees) > 0 ? "warning" : "default"} href="/employees" />
      </div>

      {/* Contract Expiry Alerts */}
      {contractAlerts.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-amber-500" />
              Contract Expiry Alerts ({contractAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {contractAlerts.map((alert, i) => (
                <div key={`${alert.employeeId}-${i}`} className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    alert.urgency === "critical" ? "bg-red-500" :
                    alert.urgency === "warning" ? "bg-amber-500" : "bg-blue-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <Link href={`/employees`}>
                      <span className="text-sm font-medium hover:underline cursor-pointer">
                        {alert.employeeCode} — {alert.employeeName}
                      </span>
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {alert.contractType || "Contract"} expires {String(alert.expiryDate)}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${
                    alert.urgency === "critical" ? "border-red-300 text-red-600 dark:text-red-400" :
                    alert.urgency === "warning" ? "border-amber-300 text-amber-600 dark:text-amber-400" :
                    "border-blue-300 text-blue-600 dark:text-blue-400"
                  }`}>
                    {alert.urgency === "critical" ? "≤30 days" : alert.urgency === "warning" ? "≤60 days" : "≤90 days"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workforce Trend + Leave Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Monthly Workforce Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {workforceTrendData.length > 0 ? (
              <ChartContainer config={workforceChartConfig} className="h-[280px] w-full">
                <AreaChart data={workforceTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillActive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-active)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-active)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={35} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area type="monotone" dataKey="active" stroke="var(--color-active)" fill="url(#fillActive)" strokeWidth={2} />
                  <Line type="monotone" dataKey="newHires" stroke="var(--color-newHires)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="terminations" stroke="var(--color-terminations)" strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ChartContainer>
            ) : (
              <Skeleton className="h-[280px] w-full rounded-lg" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Leave Status</CardTitle>
          </CardHeader>
          <CardContent>
            {leavePieData.length > 0 ? (
              <>
                <ChartContainer config={{}} className="h-[180px] w-full">
                  <PieChart>
                    <Pie data={leavePieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                      {leavePieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  </PieChart>
                </ChartContainer>
                <div className="space-y-1.5 mt-2">
                  {leavePieData.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                      <span className="flex-1 text-muted-foreground">{item.name}</span>
                      <span className="font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CalendarDays className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No data</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Leave Trend + Adjustment Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Monthly Leave Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyLeaveData.length > 0 ? (
              <ChartContainer config={leaveChartConfig} className="h-[250px] w-full">
                <BarChart data={monthlyLeaveData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={30} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="totalDays" fill="var(--color-totalDays)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <Skeleton className="h-[250px] w-full rounded-lg" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Adjustment Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {hr?.adjustmentByType && hr.adjustmentByType.length > 0 ? (
              <div className="space-y-3">
                {hr.adjustmentByType.map((item) => (
                  <div key={item.type} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: adjustmentTypeColors[item.type] || "#9ca3af" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">{item.type}</p>
                      <p className="text-xs text-muted-foreground">{item.count} records</p>
                    </div>
                    <p className="text-sm font-mono font-medium">{formatCurrencyCompact(item.totalAmount)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <ArrowUpDown className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No data</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Activity Log ──
function ActivityLogTab() {
  const { data: recentActivity, isLoading } = trpc.dashboard.recentActivity.useQuery();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
          <Link href="/audit-logs">
            <Badge variant="outline" className="cursor-pointer hover:bg-muted text-xs font-normal">
              View All Audit Logs →
            </Badge>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 py-2">
                  <Skeleton className="w-2 h-2 rounded-full mt-1.5" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentActivity && recentActivity.length > 0 ? (
            <div className="space-y-1">
              {recentActivity.map((log) => (
                <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/30 transition-colors rounded px-1">
                  <div className="mt-1.5">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{formatActivitySummary(log)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Activity className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No data</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Dashboard ──
export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role;

  // Determine default tab
  const defaultTab = "overview";

  // Build visible tabs
  const tabs = useMemo(() => {
    const result: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
      { value: "overview", label: "Overview", icon: BarChart3 },
    ];
    if (canSeeOperations(role)) {
      result.push({ value: "operations", label: "Operations", icon: ClipboardList });
    }
    if (canSeeFinance(role)) {
      result.push({ value: "finance", label: "Finance", icon: Wallet });
    }
    if (canSeeHR(role)) {
      result.push({ value: "hr", label: "HR & Leave", icon: CalendarDays });
    }
    if (canSeeActivity(role)) {
      result.push({ value: "activity", label: "Activity Log", icon: Activity });
    }
    return result;
  }, [role]);

  return (
    <Layout breadcrumb={["EG", "Dashboard"]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of key metrics and recent activity</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue={defaultTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            {tabs.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab />
          </TabsContent>

          {canSeeOperations(role) && (
            <TabsContent value="operations" className="mt-6">
              <OperationsTab />
            </TabsContent>
          )}

          {canSeeFinance(role) && (
            <TabsContent value="finance" className="mt-6">
              <FinanceTab />
            </TabsContent>
          )}

          {canSeeHR(role) && (
            <TabsContent value="hr" className="mt-6">
              <HRLeaveTab />
            </TabsContent>
          )}

          {canSeeActivity(role) && (
            <TabsContent value="activity" className="mt-6">
              <ActivityLogTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
}