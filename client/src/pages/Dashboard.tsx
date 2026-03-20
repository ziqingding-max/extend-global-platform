/*
 * EG Admin — Dashboard (Simplified Command Center)
 *
 * Redesigned from heavy data cockpit to lightweight operational hub.
 * Single-page layout: Greeting → KPI → Action Required → Quick Links → Activity Log
 * Aligned with Super Admin's B2B2B positioning as "infrastructure & delivery center".
 */

import { useMemo } from "react";
import Layout from "@/components/Layout";
import { formatDateTime, formatCurrencyCompact } from "@/lib/format";
import { formatActivitySummary } from "@/lib/auditDescriptions";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Building2,
  Globe,
  Handshake,
  DollarSign,
  FileText,
  ArrowUpDown,
  CalendarDays,
  AlertCircle,
  Briefcase,
  XCircle,
  FileWarning,
  Activity,
  ArrowRight,
  Play,
  Receipt,
  BarChart3,
  CheckCircle2,
} from "lucide-react";
import { Link } from "wouter";
import { hasRole } from "@shared/roles";

// ── Greeting helpers ──

const GREETINGS_MORNING = [
  (name: string) => `Good morning, ${name}`,
  (name: string) => `Morning, ${name} — let's get started`,
  (name: string) => `Rise and shine, ${name}`,
  (name: string) => `Top of the morning, ${name}`,
  (name: string) => `Hey ${name}, fresh start today`,
  (name: string) => `Good morning! Ready to roll, ${name}?`,
];

const GREETINGS_AFTERNOON = [
  (name: string) => `Good afternoon, ${name}`,
  (name: string) => `Afternoon, ${name} — halfway there`,
  (name: string) => `Hey ${name}, how's the day going?`,
  (name: string) => `Post-lunch power mode, ${name}`,
  (name: string) => `Afternoon, ${name} — keeping the momentum?`,
  (name: string) => `Hey ${name}, strong second half ahead`,
];

const GREETINGS_EVENING = [
  (name: string) => `Good evening, ${name}`,
  (name: string) => `Evening, ${name} — wrapping things up?`,
  (name: string) => `Still going strong, ${name}`,
  (name: string) => `Night owl mode activated, ${name}`,
  (name: string) => `Evening, ${name} — almost there`,
  (name: string) => `Winding down, ${name}? You've earned it`,
];

const GREETINGS_LATE_NIGHT = [
  (name: string) => `Still here, ${name}?`,
  (name: string) => `The world sleeps, ${name} ships`,
  (name: string) => `Late night hero mode, ${name}`,
  (name: string) => `Wow, ${name}, you're dedicated`,
  (name: string) => `Burning the midnight oil, ${name}?`,
];

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  let pool: ((name: string) => string)[];
  if (hour >= 5 && hour < 12) pool = GREETINGS_MORNING;
  else if (hour >= 12 && hour < 18) pool = GREETINGS_AFTERNOON;
  else if (hour >= 18 && hour < 24) pool = GREETINGS_EVENING;
  else pool = GREETINGS_LATE_NIGHT;
  return pool[Math.floor(Math.random() * pool.length)](name);
}

// ── Contextual insight generator ──

interface StatsData {
  pendingPayrolls: number;
  pendingInvoices: number;
  pendingAdjustments: number;
  pendingLeaves: number;
  onboardingEmployees: number;
  offboardingEmployees: number;
  overdueInvoiceAmount: string;
  expiringContracts30: number;
  activeEmployees: number;
  activePartners: number;
  activeCountries: number;
  newHiresThisMonth: number;
  terminationsThisMonth: number;
}

const INSIGHT_ALL_CLEAR = [
  "All clear — nothing urgent. Maybe grab a coffee?",
  "Inbox zero energy today. Nice.",
  "Smooth sailing — enjoy the calm before the next payroll.",
  "Everything's under control. Take a breather.",
  "No fires to put out — a rare and beautiful thing.",
];

const INSIGHT_FRIDAY = [
  "It's Friday — finish strong and enjoy the weekend.",
  "Friday vibes — let's wrap up and call it a week.",
  "TGIF — clear the queue and coast into the weekend.",
];

const INSIGHT_MONDAY = [
  "Monday momentum — let's set the tone for the week.",
  "New week, fresh start — let's make it count.",
  "Monday's here — time to tackle the queue.",
];

function getContextualInsight(stats: StatsData | undefined): string {
  if (!stats) return "Loading your workspace...";

  const overdueAmount = parseFloat(stats.overdueInvoiceAmount || "0");
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ..., 5=Fri

  // P0: Overdue invoices (urgent)
  if (overdueAmount > 0) {
    return `Heads up — ${formatCurrencyCompact(overdueAmount)} in invoices are past due. Time to chase.`;
  }

  // P1: Pending approvals (aggregate)
  const totalPending = (stats.pendingPayrolls || 0) + (stats.pendingAdjustments || 0) + (stats.pendingLeaves || 0) + (stats.pendingInvoices || 0);
  if (totalPending > 0) {
    const parts: string[] = [];
    if (stats.pendingPayrolls > 0) parts.push(`${stats.pendingPayrolls} payroll${stats.pendingPayrolls > 1 ? "s" : ""}`);
    if (stats.pendingInvoices > 0) parts.push(`${stats.pendingInvoices} invoice${stats.pendingInvoices > 1 ? "s" : ""}`);
    if (stats.pendingLeaves > 0) parts.push(`${stats.pendingLeaves} leave request${stats.pendingLeaves > 1 ? "s" : ""}`);
    if (stats.pendingAdjustments > 0) parts.push(`${stats.pendingAdjustments} adjustment${stats.pendingAdjustments > 1 ? "s" : ""}`);

    if (parts.length === 1) {
      return `You have ${parts[0]} waiting for your review.`;
    }
    return `${totalPending} items need your attention — ${parts.slice(0, 2).join(" and ")}${parts.length > 2 ? ", and more" : ""}.`;
  }

  // P2: Contract expiry warning
  if (stats.expiringContracts30 > 0) {
    return `${stats.expiringContracts30} contract${stats.expiringContracts30 > 1 ? "s" : ""} expire${stats.expiringContracts30 === 1 ? "s" : ""} within 30 days — worth a look.`;
  }

  // P3: Milestones
  const milestoneThresholds = [500, 250, 200, 150, 100, 50];
  for (const threshold of milestoneThresholds) {
    if (stats.activeEmployees >= threshold && stats.activeEmployees < threshold + 10) {
      return `Milestone: you just crossed ${threshold} active employees globally!`;
    }
  }
  if (stats.activeCountries >= 10 && stats.activeCountries < 12) {
    return `You're now operating in ${stats.activeCountries} countries — the world is getting smaller.`;
  }

  // P4: Growth trends
  if (stats.newHiresThisMonth > 0 && stats.terminationsThisMonth === 0) {
    return `${stats.newHiresThisMonth} new hire${stats.newHiresThisMonth > 1 ? "s" : ""} this month, zero terminations — growth mode.`;
  }
  if (stats.newHiresThisMonth > 0) {
    return `${stats.newHiresThisMonth} new hire${stats.newHiresThisMonth > 1 ? "s" : ""} this month — the team is growing.`;
  }
  if (stats.terminationsThisMonth === 0) {
    return "Zero terminations this month — stability looks good.";
  }

  // P5: Day-of-week fun + all clear
  if (dayOfWeek === 5) return INSIGHT_FRIDAY[Math.floor(Math.random() * INSIGHT_FRIDAY.length)];
  if (dayOfWeek === 1) return INSIGHT_MONDAY[Math.floor(Math.random() * INSIGHT_MONDAY.length)];

  return INSIGHT_ALL_CLEAR[Math.floor(Math.random() * INSIGHT_ALL_CLEAR.length)];
}

function getFormattedDate(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

// ── Shared components ──

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  href,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  href?: string;
}) {
  const content = (
    <div className={`glass-stat-card p-5 relative overflow-hidden group ${href ? "cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{title}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
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

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function StatCardSkeleton() {
  return (
    <div className="glass-stat-card p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
    </div>
  );
}

// ── Action Required Item ──

interface ActionItem {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  variant: "warning" | "danger" | "info" | "default";
  show: boolean;
}

function ActionRequiredSection({ stats }: { stats: StatsData | undefined }) {
  if (!stats) return null;

  const items: ActionItem[] = [
    {
      label: "Overdue Invoices",
      value: formatCurrencyCompact(stats.overdueInvoiceAmount),
      icon: AlertCircle,
      href: "/invoices",
      variant: "danger",
      show: parseFloat(stats.overdueInvoiceAmount || "0") > 0,
    },
    {
      label: "Pending Payrolls",
      value: stats.pendingPayrolls,
      icon: DollarSign,
      href: "/payroll",
      variant: "warning",
      show: stats.pendingPayrolls > 0,
    },
    {
      label: "Draft Invoices",
      value: stats.pendingInvoices,
      icon: FileText,
      href: "/invoices",
      variant: "warning",
      show: stats.pendingInvoices > 0,
    },
    {
      label: "Pending Adjustments",
      value: stats.pendingAdjustments,
      icon: ArrowUpDown,
      href: "/adjustments",
      variant: "warning",
      show: stats.pendingAdjustments > 0,
    },
    {
      label: "Pending Leave Requests",
      value: stats.pendingLeaves,
      icon: CalendarDays,
      href: "/leave",
      variant: "warning",
      show: stats.pendingLeaves > 0,
    },
    {
      label: "Employee Onboarding",
      value: stats.onboardingEmployees,
      icon: Briefcase,
      href: "/employees",
      variant: "info",
      show: stats.onboardingEmployees > 0,
    },
    {
      label: "Employee Offboarding",
      value: stats.offboardingEmployees,
      icon: XCircle,
      href: "/employees",
      variant: "danger",
      show: stats.offboardingEmployees > 0,
    },
    {
      label: "Expiring Contracts (30d)",
      value: stats.expiringContracts30,
      icon: FileWarning,
      href: "/employees",
      variant: "warning",
      show: stats.expiringContracts30 > 0,
    },
  ];

  const visibleItems = items.filter(item => item.show);

  const variantStyles = {
    warning: "bg-amber-500/15 text-amber-600 border-amber-200/50",
    danger: "bg-red-500/15 text-red-600 border-red-200/50",
    info: "bg-blue-500/15 text-blue-600 border-blue-200/50",
    default: "bg-gray-500/10 text-gray-600 border-gray-200/50",
  };

  const iconBgStyles = {
    warning: "bg-amber-500/15 text-amber-600",
    danger: "bg-red-500/15 text-red-600",
    info: "bg-blue-500/15 text-blue-600",
    default: "bg-gray-500/10 text-gray-600",
  };

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/80">
        Action Required
      </h2>
      {visibleItems.length === 0 ? (
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 text-emerald-600">
            <div className="p-2 rounded-xl bg-emerald-500/15">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium">All clear</p>
              <p className="text-xs text-muted-foreground">Nothing requires your immediate attention.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleItems.map((item) => (
            <Link key={item.label} href={item.href}>
              <div className={`glass-card p-4 cursor-pointer group transition-all duration-200 hover:shadow-md border ${variantStyles[item.variant]}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${iconBgStyles[item.variant]}`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold">{item.value}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick Links ──

const QUICK_LINKS = [
  { label: "Run Payroll", icon: Play, href: "/payroll", description: "Process monthly payroll" },
  { label: "Manage Partners", icon: Handshake, href: "/channel-partners", description: "View & configure CPs" },
  { label: "View Invoices", icon: Receipt, href: "/invoices", description: "Review all invoices" },
  { label: "P&L Report", icon: BarChart3, href: "/reports/profit-loss", description: "Financial analytics" },
];

function QuickLinksSection() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/80">
        Quick Links
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {QUICK_LINKS.map((link) => (
          <Link key={link.label} href={link.href}>
            <div className="glass-card p-4 cursor-pointer group text-center transition-all duration-200 hover:shadow-md">
              <div className="inline-flex p-2.5 rounded-xl bg-primary/10 text-primary mb-2.5 group-hover:bg-primary/15 transition-colors">
                <link.icon className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium">{link.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{link.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Activity Log ──

function ActivityLogSection() {
  const { user } = useAuth();
  const isAdmin = hasRole(user?.role, "admin");
  const { data: recentActivity, isLoading } = trpc.dashboard.recentActivity.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  if (!isAdmin) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/80">
          Recent Activity
        </h2>
        <Link href="/audit-logs">
          <Badge variant="outline" className="cursor-pointer hover:bg-muted text-xs font-normal">
            View All Audit Logs →
          </Badge>
        </Link>
      </div>
      <Card className="glass-card">
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
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
            <div className="space-y-0.5">
              {recentActivity.slice(0, 10).map((log) => (
                <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors rounded px-1">
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
              <p className="text-sm">No recent activity</p>
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
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();

  // Memoize greeting to avoid re-randomizing on every render
  const greeting = useMemo(() => {
    const firstName = (user?.name || "").split(" ")[0] || "there";
    return getGreeting(firstName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name]);

  const insight = useMemo(() => getContextualInsight(stats as StatsData | undefined), [stats]);
  const formattedDate = useMemo(() => getFormattedDate(), []);

  return (
    <Layout breadcrumb={["EG", "Dashboard"]}>
      <div className="p-6 space-y-8 page-enter max-w-6xl">
        {/* ── Section 1: Greeting ── */}
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
            <p className="text-sm text-muted-foreground">{insight}</p>
          </div>
          <p className="text-sm text-muted-foreground hidden sm:block whitespace-nowrap">{formattedDate}</p>
        </div>

        {/* ── Section 2: Core KPI (4-column uniform grid) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                title="Active Partners"
                value={stats?.activePartners ?? 0}
                icon={Handshake}
                href="/channel-partners"
                description="Channel partners"
              />
              <StatCard
                title="Total Customers"
                value={stats?.totalCustomers ?? 0}
                icon={Building2}
                href="/customers"
                description="Across all partners"
              />
              <StatCard
                title="Active Employees"
                value={stats?.activeEmployees ?? 0}
                icon={Users}
                href="/employees"
                description={`${stats?.totalEmployees ?? 0} total`}
              />
              <StatCard
                title="Active Countries"
                value={stats?.activeCountries ?? 0}
                icon={Globe}
                href="/countries"
                description="Global coverage"
              />
            </>
          )}
        </div>

        {/* ── Section 3: Action Required ── */}
        {!isLoading && <ActionRequiredSection stats={stats as StatsData | undefined} />}

        {/* ── Section 4: Quick Links ── */}
        <QuickLinksSection />

        {/* ── Section 5: Recent Activity (admin only) ── */}
        <ActivityLogSection />
      </div>
    </Layout>
  );
}
