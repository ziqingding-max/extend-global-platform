/**
 * CP Portal Dashboard (Task Group E — Enhanced)
 *
 * Overview page showing:
 * - Quick stats (clients, employees, invoices)
 * - Profit overview (L2 Revenue - L1 Cost = Gross Profit)
 * - Monthly profit trend chart (bar chart)
 * - Wallet balance
 */
import { useBranding } from "@/hooks/useBranding";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Receipt,
  Wallet,
  TrendingUp,
  Loader2,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  Percent,
  AlertTriangle,
  UserCheck,
} from "lucide-react";

export default function CpPortalDashboard() {
  const { branding } = useBranding();

  // Fetch dashboard data
  const { data: quickStats, isLoading: statsLoading } = cpTrpc.dashboard.quickStats.useQuery();
  const { data: profitOverview, isLoading: profitLoading } = cpTrpc.dashboard.profitOverview.useQuery();
  const { data: monthlyTrend, isLoading: trendLoading } = cpTrpc.dashboard.monthlyTrend.useQuery();
  const { data: prepaidWallet, isLoading: walletLoading } = cpTrpc.wallet.getBalance.useQuery({});

  const isLoading = statsLoading || profitLoading || walletLoading;
  const companyName = branding?.companyName || "Partner Portal";

  // Find max value for chart scaling
  const maxChartValue = monthlyTrend?.months?.reduce((max: number, m: any) => {
    return Math.max(max, m.l2Revenue, m.l1Cost, Math.abs(m.grossProfit));
  }, 0) || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to {companyName}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Quick Stats Row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{quickStats?.totalClients ?? 0}</div>
                <p className="text-xs text-muted-foreground">Active end clients</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{quickStats?.activeEmployees ?? 0}</div>
                <p className="text-xs text-muted-foreground">Currently employed</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{quickStats?.pendingInvoices ?? 0}</div>
                <p className="text-xs text-muted-foreground">Awaiting payment</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overdue Invoices</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{quickStats?.overdueInvoices ?? 0}</div>
                <p className="text-xs text-muted-foreground">Require attention</p>
              </CardContent>
            </Card>
          </div>

          {/* Profit Overview Row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">L2 Revenue</CardTitle>
                <ArrowDownLeft className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-700">
                  ${(profitOverview?.l2Revenue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">
                  This month: ${(profitOverview?.l2RevenueThisMonth ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/30">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">L1 Cost</CardTitle>
                <ArrowUpRight className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-700">
                  ${(profitOverview?.l1Cost ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">
                  This month: ${(profitOverview?.l1CostThisMonth ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50/30">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-700">
                  ${(profitOverview?.grossProfit ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">
                  This month: ${(profitOverview?.grossProfitThisMonth ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card className="border-purple-200 bg-purple-50/30">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Margin</CardTitle>
                <Percent className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-700">
                  {profitOverview?.marginPercent ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Wallet: ${Number(prepaidWallet?.balance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Trend Chart (CSS-based bar chart) */}
          {!trendLoading && monthlyTrend?.months && monthlyTrend.months.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Profit Trend (Last 12 Months)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Legend */}
                  <div className="flex items-center gap-6 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-blue-500" />
                      <span>L2 Revenue</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-red-400" />
                      <span>L1 Cost</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-green-500" />
                      <span>Gross Profit</span>
                    </div>
                  </div>

                  {/* Bar Chart */}
                  <div className="flex items-end gap-1 h-48">
                    {monthlyTrend.months.map((m: any) => {
                      const revenueHeight = maxChartValue > 0 ? (m.l2Revenue / maxChartValue) * 100 : 0;
                      const costHeight = maxChartValue > 0 ? (m.l1Cost / maxChartValue) * 100 : 0;
                      const profitHeight = maxChartValue > 0 ? (Math.abs(m.grossProfit) / maxChartValue) * 100 : 0;
                      const monthLabel = m.month.slice(5); // "MM"

                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
                          <div className="flex items-end gap-px h-40 w-full">
                            <div
                              className="flex-1 bg-blue-500 rounded-t-sm transition-all"
                              style={{ height: `${revenueHeight}%`, minHeight: m.l2Revenue > 0 ? "2px" : "0" }}
                              title={`Revenue: $${m.l2Revenue.toLocaleString()}`}
                            />
                            <div
                              className="flex-1 bg-red-400 rounded-t-sm transition-all"
                              style={{ height: `${costHeight}%`, minHeight: m.l1Cost > 0 ? "2px" : "0" }}
                              title={`Cost: $${m.l1Cost.toLocaleString()}`}
                            />
                            <div
                              className={`flex-1 rounded-t-sm transition-all ${m.grossProfit >= 0 ? "bg-green-500" : "bg-amber-500"}`}
                              style={{ height: `${profitHeight}%`, minHeight: Math.abs(m.grossProfit) > 0 ? "2px" : "0" }}
                              title={`Profit: $${m.grossProfit.toLocaleString()}`}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{monthLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
