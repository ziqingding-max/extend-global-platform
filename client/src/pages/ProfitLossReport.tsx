/**
 * EG Admin — Profit & Loss Report
 * Monthly breakdown of revenue (from invoices) vs expenses (from vendor bills)
 * with interactive charts and detailed breakdowns
 */
import Layout from "@/components/Layout";
import { formatAmount, formatMonth } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  ComposedChart,
  Area,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Download,
} from "lucide-react";
import { exportToCsv } from "@/lib/csvExport";

import { useI18n } from "@/lib/i18n";
const ACRONYMS = new Set(["hr", "it", "eor"]);
function formatLabel(raw: string): string {
  return raw.replace(/_/g, " ").split(" ").map(w => ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const PIE_COLORS = [
  "hsl(210, 70%, 50%)",
  "hsl(150, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(0, 65%, 50%)",
  "hsl(270, 55%, 55%)",
  "hsl(180, 50%, 45%)",
  "hsl(45, 75%, 50%)",
  "hsl(330, 60%, 50%)",
  "hsl(120, 45%, 45%)",
  "hsl(200, 65%, 55%)",
];

const chartConfig: ChartConfig = {
  revenue: { label: "Revenue", color: "hsl(150, 60%, 45%)" },
  expenses: { label: "Expenses", color: "hsl(0, 65%, 50%)" },
  netProfit: { label: "Net Profit", color: "hsl(210, 70%, 50%)" },
};

function getMonthOptions() {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 24; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ value: val, label: formatMonth(val) });
  }
  return months;
}

export default function ProfitLossReport() {
  const { t } = useI18n();
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const now = new Date();
  const defaultEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const defaultStart = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [startMonth, setStartMonth] = useState(defaultStart);
  const [endMonth, setEndMonth] = useState(defaultEnd);

  const { data, isLoading, error } = trpc.reports.profitAndLoss.useQuery({
    startMonth,
    endMonth,
    currency: "USD",
  });

  // Export CSV
  function handleExport() {
    if (!data?.monthlyBreakdown) return;
    const rows = data.monthlyBreakdown;
    const columns = [
      { header: "Month", accessor: (r: typeof rows[0]) => r.month },
      { header: "Revenue", accessor: (r: typeof rows[0]) => r.revenue },
      { header: "Expenses", accessor: (r: typeof rows[0]) => r.expenses },
      { header: "Net Profit", accessor: (r: typeof rows[0]) => r.netProfit },
      { header: "Invoice Count", accessor: (r: typeof rows[0]) => r.invoiceCount },
      { header: "Bill Count", accessor: (r: typeof rows[0]) => r.billCount },
    ];
    exportToCsv(rows, columns, `profit-loss-${startMonth}-to-${endMonth}`);
  }


  if (error) {
    return (
      <Layout breadcrumb={["EG", "Reports", "Profit & Loss"]}>
        <div className="p-6"><div className="text-red-500">Error: {error.message}</div></div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout breadcrumb={["EG", "Reports", "Profit & Loss"]}>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      </Layout>
    );
  }

  const summary = data?.summary || { totalRevenue: 0, totalExpenses: 0, netProfit: 0, profitMargin: 0, totalUnallocated: 0 };
  const monthly = data?.monthlyBreakdown || [];
  const revenueByType = data?.revenueByType || [];
  const expensesByCategory = data?.expensesByCategory || [];
  const expensesByVendor = data?.expensesByVendor || [];
  const revenueByCustomer = data?.revenueByCustomer || [];

  const isProfit = summary.netProfit >= 0;

  return (
    <Layout breadcrumb={["EG", "Reports", "Profit & Loss"]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("profit_loss_report.page.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("profit_loss_report.page.description")}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Select value={startMonth} onValueChange={setStartMonth}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">{t("profit_loss_report.page.date_range_separator")}</span>
              <Select value={endMonth} onValueChange={setEndMonth}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={!data}>
              <Download className="w-4 h-4 mr-2" />Export CSV
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("profit_loss_report.summary.total_revenue")}</div>
                  <div className="text-2xl font-bold mt-1 text-emerald-400">USD {formatAmount(summary.totalRevenue)}</div>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("profit_loss_report.summary.total_expenses")}</div>
                  <div className="text-2xl font-bold mt-1 text-red-400">USD {formatAmount(summary.totalExpenses)}</div>
                </div>
                <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("profit_loss_report.summary.net_profit")}</div>
                  <div className={`text-2xl font-bold mt-1 ${isProfit ? "text-blue-400" : "text-red-400"}`}>
                    USD {formatAmount(Math.abs(summary.netProfit))}
                    {!isProfit && <span className="text-sm ml-1">{t("profit_loss_report.summary.loss_label")}</span>}
                  </div>
                </div>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isProfit ? "bg-blue-500/15" : "bg-red-500/15"}`}>
                  {isProfit ? <ArrowUpRight className="w-5 h-5 text-blue-400" /> : <ArrowDownRight className="w-5 h-5 text-red-400" />}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("profit_loss_report.summary.profit_margin")}</div>
                  <div className={`text-2xl font-bold mt-1 ${summary.profitMargin >= 0 ? "text-blue-400" : "text-red-400"}`}>
                    {summary.profitMargin.toFixed(1)}%
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-500/15 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-slate-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("profit_loss_report.monthly_trend.title")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{t("profit_loss_report.monthly_trend.description")}</p>
          </CardHeader>
          <CardContent>
            {monthly.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <ComposedChart data={monthly.map((m) => ({ ...m, month: formatMonth(m.month) }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          const label = name === "revenue" ? "Revenue" : name === "expenses" ? "Expenses" : "Net Profit";
                          return [`USD ${formatAmount(Number(value))}`, label];
                        }}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="revenue" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="expenses" fill="hsl(0, 65%, 50%)" radius={[4, 4, 0, 0]} barSize={24} />
                  <Line type="monotone" dataKey="netProfit" stroke="hsl(210, 70%, 50%)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ChartContainer>
            ) : (
              <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>{t("profit_loss_report.monthly_breakdown.empty")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Breakdown Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Revenue by Invoice Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue by Invoice Type</CardTitle>
            </CardHeader>
            <CardContent>
              {revenueByType.length > 0 ? (
                <div className="flex items-start gap-4">
                  <div className="w-[200px] h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={revenueByType}
                          dataKey="amount"
                          nameKey="type"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={40}
                        >
                          {revenueByType.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {revenueByType.map((item, i) => (
                      <div key={item.type} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span>{formatLabel(item.type)}</span>
                        </div>
                        <span className="font-mono">USD {formatAmount(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No revenue data</div>
              )}
            </CardContent>
          </Card>

          {/* Expenses by Category */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("profit_loss_report.expenses_by_category.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {expensesByCategory.length > 0 ? (
                <div className="flex items-start gap-4">
                  <div className="w-[200px] h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expensesByCategory}
                          dataKey="amount"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={40}
                        >
                          {expensesByCategory.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {expensesByCategory.map((item, i) => (
                      <div key={item.category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span>{formatLabel(item.category)}</span>
                        </div>
                        <span className="font-mono">USD {formatAmount(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No expense data</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Vendors & Customers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Vendors by Spend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Vendors by Spend</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expensesByVendor.length > 0 ? (
                    expensesByVendor
                      .sort((a, b) => b.amount - a.amount)
                      .slice(0, 10)
                      .map((v) => (
                        <TableRow key={v.vendorId}>
                          <TableCell className="font-medium">{v.vendorName}</TableCell>
                          <TableCell className="text-right font-mono">USD {formatAmount(v.amount)}</TableCell>
                          <TableCell className="text-right">
                            {summary.totalExpenses > 0 ? ((v.amount / summary.totalExpenses) * 100).toFixed(1) : 0}%
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No vendor data</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Top Customers by Revenue */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Customers by Revenue</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenueByCustomer.length > 0 ? (
                    revenueByCustomer
                      .sort((a, b) => b.amount - a.amount)
                      .slice(0, 10)
                      .map((c) => (
                        <TableRow key={c.customerId}>
                          <TableCell className="font-medium">{c.customerName}</TableCell>
                          <TableCell className="text-right font-mono">USD {formatAmount(c.amount)}</TableCell>
                          <TableCell className="text-right">
                            {summary.totalRevenue > 0 ? ((c.amount / summary.totalRevenue) * 100).toFixed(1) : 0}%
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No customer data</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Customer Profit Analysis */}
        {(data?.customerProfit?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer Profit Analysis</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">{t("profit_loss_report.table_header.revenue")}</TableHead>
                    <TableHead className="text-right">Cost Allocated</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">{t("profit_loss_report.table_header.margin")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.customerProfit ?? []).map((c: any) => (
                    <TableRow key={c.customerId}>
                      <TableCell className="font-medium">
                        {c.customerName}
                        {c.isLoss && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-destructive">
                            <TrendingDown className="w-3 h-3" /> Loss
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-400">USD {formatAmount(c.revenue)}</TableCell>
                      <TableCell className="text-right font-mono text-amber-400">USD {formatAmount(c.costAllocated)}</TableCell>
                      <TableCell className={`text-right font-mono ${c.isLoss ? "text-red-400" : "text-blue-400"}`}>
                        USD {formatAmount(c.profit)}
                      </TableCell>
                      <TableCell className={`text-right ${c.isLoss ? "text-red-400" : "text-blue-400"}`}>
                        {c.margin.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Operational Costs (Unallocated) */}
        {(summary.totalUnallocated ?? 0) > 0 && (
          <Card className="border-amber-500/30">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("profit_loss_report.summary.unallocated_expenses")}</div>
                  <div className="text-xl font-bold mt-1 text-amber-400">USD {formatAmount(summary.totalUnallocated)}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t("profit_loss_report.summary.unallocated_expenses_desc")}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly Detail Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("profit_loss_report.monthly_breakdown.title")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{t("profit_loss_report.monthly_breakdown.description")}</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("profit_loss_report.table_header.month")}</TableHead>
                  <TableHead className="text-right">{t("profit_loss_report.table_header.revenue")}</TableHead>
                  <TableHead className="text-right">{t("profit_loss_report.table_header.expenses")}</TableHead>
                  <TableHead className="text-right">{t("profit_loss_report.summary.net_profit")}</TableHead>
                  <TableHead className="text-right">{t("profit_loss_report.table_header.margin")}</TableHead>
                  <TableHead className="text-right">{t("profit_loss_report.table_header.invoices")}</TableHead>
                  <TableHead className="text-right">{t("profit_loss_report.table_header.bills")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthly.length > 0 ? (
                  <>
                    {monthly.map((m) => {
                      const margin = m.revenue > 0 ? ((m.netProfit / m.revenue) * 100).toFixed(1) : "—";
                      return (
                        <TableRow key={m.month}>
                          <TableCell className="font-medium">{formatMonth(m.month)}</TableCell>
                          <TableCell className="text-right font-mono text-emerald-400">USD {formatAmount(m.revenue)}</TableCell>
                          <TableCell className="text-right font-mono text-red-400">USD {formatAmount(m.expenses)}</TableCell>
                          <TableCell className={`text-right font-mono ${m.netProfit >= 0 ? "text-blue-400" : "text-red-400"}`}>
                            USD {formatAmount(m.netProfit)}
                          </TableCell>
                          <TableCell className="text-right">{margin}{margin !== "—" ? "%" : ""}</TableCell>
                          <TableCell className="text-right">{m.invoiceCount}</TableCell>
                          <TableCell className="text-right">{m.billCount}</TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Totals Row */}
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell>{t("profit_loss_report.table_footer.total")}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-400">USD {formatAmount(summary.totalRevenue)}</TableCell>
                      <TableCell className="text-right font-mono text-red-400">USD {formatAmount(summary.totalExpenses)}</TableCell>
                      <TableCell className={`text-right font-mono ${isProfit ? "text-blue-400" : "text-red-400"}`}>
                        USD {formatAmount(summary.netProfit)}
                      </TableCell>
                      <TableCell className="text-right">{summary.profitMargin.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{monthly.reduce((s, m) => s + m.invoiceCount, 0)}</TableCell>
                      <TableCell className="text-right">{monthly.reduce((s, m) => s + m.billCount, 0)}</TableCell>
                    </TableRow>
                  </>
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No data available for the selected period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
