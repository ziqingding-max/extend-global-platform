/**
 * Portal Dashboard — Apple Liquid Glass Design
 *
 * Overview: KPI cards with glass morphism, action items,
 * interactive charts, global workforce bar chart, recent activity.
 * All surfaces use backdrop-blur and semi-transparent backgrounds.
 */

import { useMemo } from "react";
import PortalLayout from "@/components/PortalLayout";
import { portalPath } from "@/lib/portalBasePath";
import WorldMap from "@/components/WorldMap";
import { formatStatusLabel } from "@/lib/format";
import { portalTrpc } from "@/lib/portalTrpc";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Users, Globe, Clock, AlertCircle, ArrowUpDown, CalendarDays,
  Receipt, UserPlus, CheckCircle2, MapPin, TrendingUp,
  DollarSign, Activity, ArrowRight, Settings,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// ─── Glass KPI Card ─────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  href,
  accent = "default",
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  href?: string;
  accent?: "default" | "green" | "amber" | "red" | "blue";
}) {
  const accentStyles = {
    default: "bg-gray-500/10 text-gray-600",
    green: "bg-emerald-500/15 text-emerald-600",
    amber: "bg-amber-500/15 text-amber-600",
    red: "bg-red-500/15 text-red-600",
    blue: "bg-blue-500/15 text-blue-600",
  };

  const content = (
    <div className={cn(
      "glass-stat-card p-5 relative overflow-hidden group",
      href && "cursor-pointer"
    )}>
      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{title}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <div className={cn("p-2.5 rounded-xl", accentStyles[accent])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {href && (
        <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

// ─── Pending Tasks ───────────────────────────────────────────────────────────

function PendingTasksCard({ tasks }: { tasks: Array<{ type: string; count: number; label: string; href: string }> }) {
  const totalPending = tasks.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="glass-card p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-base font-semibold">Action Items</h3>
        {totalPending > 0 && (
          <Badge variant="destructive" className="ml-auto text-xs">{totalPending}</Badge>
        )}
      </div>
      {totalPending === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <CheckCircle2 className="w-8 h-8 mb-2 text-green-500" />
          <p className="text-sm font-medium">All caught up</p>
          <p className="text-xs mt-1">No pending actions</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.filter(t => t.count > 0).map((task) => {
            const icons: Record<string, React.ComponentType<{ className?: string }>> = {
              onboarding: UserPlus,
              adjustments: ArrowUpDown,
              leave: CalendarDays,
              invoices: Receipt,
              reimbursements: DollarSign,
              leave_policy_setup: Settings,
            };
            const colors: Record<string, string> = {
              onboarding: "text-blue-500 bg-blue-500/10",
              adjustments: "text-amber-500 bg-amber-500/10",
              leave: "text-purple-500 bg-purple-500/10",
              invoices: "text-red-500 bg-red-500/10",
              reimbursements: "text-green-500 bg-green-500/10",
              leave_policy_setup: "text-emerald-500 bg-emerald-500/10",
            };
            const TaskIcon = icons[task.type] || AlertCircle;
            const colorClasses = colors[task.type] || "text-muted-foreground bg-muted";

            return (
              <Link key={task.type} href={task.href}>
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/40 border border-white/30 hover:bg-white/60 transition-all duration-200 cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-lg", colorClasses)}>
                      <TaskIcon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">{task.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono bg-white/50">{task.count}</Badge>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Employee Map ────────────────────────────────────────────────────────────

function EmployeeMapCard() {
  const { data: countryData, isLoading } = portalTrpc.dashboard.employeesByCountry.useQuery();

  if (isLoading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">Global Workforce</h3>
        </div>
        <Skeleton className="h-[250px] w-full rounded-lg" />
      </div>
    );
  }

  const mapData = (countryData ?? []).map((c) => ({
    countryCode: c.countryCode,
    countryName: c.countryName,
    employeeCount: c.employeeCount,
  }));

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-base font-semibold">Global Workforce</h3>
      </div>
      {mapData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <MapPin className="w-8 h-8 mb-2" />
          <p className="text-sm font-medium">No employees yet</p>
          <p className="text-xs mt-1">Start onboarding</p>
        </div>
      ) : (
        <WorldMap data={mapData} />
      )}
    </div>
  );
}

// ─── Payroll Trend Chart (Bar Chart) ────────────────────────────────────────

const payrollChartConfig: ChartConfig = {
  totalGross: { label: "Gross Pay", color: "oklch(0.55 0.18 250)" },
  totalNet: { label: "Net Pay", color: "oklch(0.6 0.18 160)" },
  totalEmployerCost: { label: "Employer Cost", color: "oklch(0.65 0.15 60)" },
};

function PayrollTrendCard() {
  const { data: trendData, isLoading } = portalTrpc.dashboard.payrollTrend.useQuery();

  const chartData = useMemo(() => {
    if (!trendData) return [];
    return trendData.map((d) => ({
      month: d.month ? new Date(d.month).toLocaleDateString(undefined, { month: "short", year: "2-digit" }) : "",
      totalGross: Number(d.totalGross) || 0,
      totalNet: Number(d.totalNet) || 0,
      totalEmployerCost: Number(d.totalEmployerCost) || 0,
    }));
  }, [trendData]);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-base font-semibold">Payroll Trend</h3>
      </div>
      {isLoading ? (
        <Skeleton className="h-[280px] w-full rounded-lg" />
      ) : chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <DollarSign className="w-8 h-8 mb-2" />
          <p className="text-sm font-medium">No payroll data yet</p>
          <p className="text-xs mt-1">First approved run</p>
        </div>
      ) : (
        <ChartContainer config={payrollChartConfig} className="h-[280px] w-full">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                />
              }
            />
            <Bar dataKey="totalGross" fill="oklch(0.55 0.18 250)" radius={[4, 4, 0, 0]} barSize={20} />
            <Bar dataKey="totalNet" fill="oklch(0.6 0.18 160)" radius={[4, 4, 0, 0]} barSize={20} />
            <Bar dataKey="totalEmployerCost" fill="oklch(0.65 0.15 60)" radius={[4, 4, 0, 0]} barSize={20} />
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}

// ─── Employee Status Distribution ────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  onboarding: "#3b82f6",
  pending_review: "#f59e0b",
  documents_incomplete: "#f43f5e",
  offboarding: "#ef4444",
  terminated: "#6b7280",
  inactive: "#9ca3af",
};

function EmployeeStatusCard() {
  const { data: statusData, isLoading } = portalTrpc.dashboard.employeeStatusDistribution.useQuery();

  const chartData = useMemo(() => {
    if (!statusData) return [];
    return statusData.map((d) => ({
      name: d.status === "active" ? "Active"
        : d.status === "onboarding" ? "Onboarding"
        : d.status === "pending_review" ? "Pending Review"
        : d.status === "documents_incomplete" ? "Documents Incomplete"
        : d.status === "offboarding" ? "Offboarding"
        : d.status === "terminated" ? "Terminated"
        : d.status === "inactive" ? "Inactive"
        : formatStatusLabel(d.status),
      value: d.count,
      color: STATUS_COLORS[d.status] || "#6b7280",
    }));
  }, [statusData]);

  const totalEmployees = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="glass-card p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-base font-semibold">Employee Status</h3>
      </div>
      {isLoading ? (
        <Skeleton className="h-[200px] w-full rounded-lg" />
      ) : chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Users className="w-8 h-8 mb-2" />
          <p className="text-sm font-medium">No employees yet</p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="w-full h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center -mt-[110px] mb-[50px]">
            <p className="text-2xl font-bold">{totalEmployees}</p>
            <p className="text-xs text-muted-foreground">Total Employees</p>
          </div>
          <div className="w-full space-y-1.5 mt-2">
            {chartData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
                <span className="font-medium font-mono">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recent Activity ─────────────────────────────────────────────────────────

function RecentActivityCard() {
  const { data: activities, isLoading } = portalTrpc.dashboard.recentActivity.useQuery();

  const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    employee: Users,
    adjustment: ArrowUpDown,
    leave: CalendarDays,
  };

  const typeColors: Record<string, string> = {
    employee: "bg-blue-500/10 text-blue-600",
    adjustment: "bg-amber-500/10 text-amber-600",
    leave: "bg-purple-500/10 text-purple-600",
  };

  const statusBadgeColors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    onboarding: "bg-blue-100 text-blue-700",
    pending_review: "bg-yellow-100 text-yellow-700",
    submitted: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    locked: "bg-gray-100 text-gray-700",
    terminated: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-base font-semibold">Recent Activity</h3>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : !activities || activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Activity className="w-8 h-8 mb-2" />
          <p className="text-sm font-medium">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-1">
          {activities.slice(0, 10).map((item: any, idx: number) => {
            const Icon = typeIcons[item.type] || AlertCircle;
            return (
              <div key={`${item.type}-${item.id}-${idx}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/40 transition-colors duration-200">
                <div className={cn("p-1.5 rounded-lg", typeColors[item.type] || "bg-muted text-muted-foreground")}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.type === "employee" ? "Employee" : item.type === "adjustment" ? "Adjustment" : "Leave"}
                    {" · "}
                    {new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                <Badge variant="outline" className={cn("text-xs", statusBadgeColors[item.status] || "")}>
                  {formatStatusLabel(item.status)}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function PortalDashboard() {
  const { user } = usePortalAuth();
  const { data: stats, isLoading } = portalTrpc.dashboard.stats.useQuery();

  return (
    <PortalLayout title="Portal Dashboard">
      <div className="p-6 space-y-6 animate-page-in">
        {/* Welcome */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Welcome, {user?.contactName?.split(" ")[0] || "User"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your portal dashboard
          </p>
        </div>

        {/* KPI Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass-stat-card p-5">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Active Employees"
              value={stats?.activeEmployees ?? 0}
              icon={Users}
              accent="green"
              description="Number of active employees"
              href={portalPath("/employees")}
            />
            <StatCard
              title="Countries"
              value={stats?.activeCountries ?? 0}
              icon={Globe}
              accent="blue"
              description="Number of active locations"
            />
            <StatCard
              title="Pending Onboarding"
              value={stats?.pendingOnboarding ?? 0}
              icon={UserPlus}
              accent="amber"
              description="Employees currently onboarding"
              href={portalPath("/onboarding")}
            />
            <StatCard
              title="Unpaid Invoices"
              value={(stats?.unpaidInvoices ?? 0) + (stats?.overdueInvoices ?? 0)}
              icon={Receipt}
              accent={(stats?.overdueInvoices ?? 0) > 0 ? "red" : "default"}
              description={stats?.overdueInvoices ? `${stats.overdueInvoices} Overdue` : "Awaiting payment"}
              href={portalPath("/invoices")}
            />
          </div>
        )}

        {/* Action Items + Employee Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <PendingTasksCard
              tasks={[
                {
                  type: "invoices",
                  count: (stats?.unpaidInvoices ?? 0) + (stats?.overdueInvoices ?? 0),
                  label: "Unpaid Invoices",
                  href: portalPath("/invoices"),
                },
                {
                  type: "onboarding",
                  count: stats?.pendingOnboarding ?? 0,
                  label: "Onboarding In Progress",
                  href: portalPath("/onboarding"),
                },
                {
                  type: "leave",
                  count: stats?.pendingLeave ?? 0,
                  label: "Leave Requests",
                  href: portalPath("/leave"),
                },
                {
                  type: "adjustments",
                  count: stats?.pendingAdjustments ?? 0,
                  label: "Pending Adjustments",
                  href: portalPath("/adjustments"),
                },
                {
                  type: "reimbursements",
                  count: stats?.pendingReimbursements ?? 0,
                  label: "Pending Reimbursements",
                  href: portalPath("/reimbursements"),
                },
                {
                  type: "leave_policy_setup",
                  count: stats?.unconfiguredLeavePolicyCountries ?? 0,
                  label: "Leave Policy Setup",
                  href: portalPath("/settings"),
                },
              ]}
            />
          </div>
          <div>
            <EmployeeStatusCard />
          </div>
        </div>

        {/* Payroll Trend (Bar Chart) */}
        <PayrollTrendCard />

        {/* Map */}
        <EmployeeMapCard />

        {/* Recent Activity */}
        <RecentActivityCard />
      </div>
    </PortalLayout>
  );
}