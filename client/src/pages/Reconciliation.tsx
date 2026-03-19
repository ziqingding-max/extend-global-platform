/**
 * EG Admin — Reconciliation Dashboard
 * Dual-currency reconciliation: Invoice ↔ Vendor Bill matching
 * FX stripping analysis and Net P&L overview
 */
import Layout from "@/components/Layout";
import { formatAmount } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  DollarSign,
  BarChart3,
  Zap,
} from "lucide-react";

function getMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < 24; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const val = `${y}-${String(m).padStart(2, "0")}`;
    const label = d.toLocaleString("en", { year: "numeric", month: "long" });
    opts.push({ value: val, label });
    d.setMonth(d.getMonth() - 1);
  }
  return opts;
}

export default function ReconciliationPage() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [payrollMonth, setPayrollMonth] = useState(defaultMonth);
  const [startMonth, setStartMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [endMonth, setEndMonth] = useState(defaultMonth);
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [matchNote, setMatchNote] = useState("");

  const monthOptions = getMonthOptions();

  // Reconciliation data
  const { data: reconSummary, isLoading: reconLoading, refetch: refetchRecon } =
    trpc.reconciliation.summary.useQuery({ payrollMonth });

  const { data: matches, isLoading: matchesLoading, refetch: refetchMatches } =
    trpc.reconciliation.suggestMatches.useQuery({ payrollMonth });

  // FX stripping data
  const { data: fxSummary, isLoading: fxLoading } =
    trpc.fxStripping.summary.useQuery({ startMonth, endMonth });

  // Net P&L data
  const { data: netPnl, isLoading: pnlLoading } =
    trpc.netPnl.report.useQuery({ startMonth, endMonth });

  // Employment Cost Reconciliation data
  const { data: empCostRecon, isLoading: empCostLoading } =
    trpc.reconciliation.employmentCostRecon.useQuery({ payrollMonth });

  // Mutations
  const executeMutation = trpc.reconciliation.execute.useMutation({
    onSuccess: () => {
      toast.success("Reconciliation match executed successfully");
      refetchRecon();
      refetchMatches();
      setMatchDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const batchMutation = trpc.reconciliation.batchReconcile.useMutation({
    onSuccess: (data) => {
      toast.success(`Batch reconciled ${data.matchedCount} matches`);
      refetchRecon();
      refetchMatches();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleExecuteMatch = () => {
    if (!selectedMatch) return;
    executeMutation.mutate({
      vendorBillId: selectedMatch.vendorBillId,
      invoiceId: selectedMatch.invoiceId,
      note: matchNote || undefined,
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Reconciliation & Financial Analysis</h1>
            <p className="text-muted-foreground">Dual-currency reconciliation, FX analysis, and Net P&L</p>
          </div>
        </div>

        <Tabs defaultValue="reconciliation" className="space-y-4">
          <TabsList>
            <TabsTrigger value="reconciliation">
              <ArrowLeftRight className="h-4 w-4 mr-1" /> Reconciliation
            </TabsTrigger>
            <TabsTrigger value="fx-analysis">
              <DollarSign className="h-4 w-4 mr-1" /> FX Analysis
            </TabsTrigger>
            <TabsTrigger value="net-pnl">
              <BarChart3 className="h-4 w-4 mr-1" /> Net P&L
            </TabsTrigger>
            <TabsTrigger value="emp-cost-recon">
              <AlertTriangle className="h-4 w-4 mr-1" /> Cost Reconciliation
              {(empCostRecon?.totalMismatches ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">{empCostRecon?.totalMismatches}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ─── Reconciliation Tab ─── */}
          <TabsContent value="reconciliation" className="space-y-4">
            <div className="flex items-center gap-4">
              <Select value={payrollMonth} onValueChange={setPayrollMonth}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => batchMutation.mutate({ payrollMonth })}
                disabled={batchMutation.isPending}
              >
                <Zap className="h-4 w-4 mr-1" />
                Auto-Match All
              </Button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Unreconciled Bills</div>
                  <div className="text-2xl font-bold">
                    {reconLoading ? <Skeleton className="h-8 w-16" /> : reconSummary?.totalBillsUnreconciled || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Unreconciled Invoices</div>
                  <div className="text-2xl font-bold">
                    {reconLoading ? <Skeleton className="h-8 w-16" /> : reconSummary?.totalInvoicesUnreconciled || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Matched</div>
                  <div className="text-2xl font-bold text-green-600">
                    {reconLoading ? <Skeleton className="h-8 w-16" /> : reconSummary?.totalMatched || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Total Variance</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {reconLoading ? <Skeleton className="h-8 w-16" /> : formatAmount(reconSummary?.totalVariance || 0)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">FX Gain/Loss</div>
                  <div className={`text-2xl font-bold ${(reconSummary?.totalFxGainLoss || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {reconLoading ? <Skeleton className="h-8 w-16" /> : formatAmount(reconSummary?.totalFxGainLoss || 0)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Suggested matches table */}
            <Card>
              <CardHeader>
                <CardTitle>Suggested Matches</CardTitle>
              </CardHeader>
              <CardContent>
                {matchesLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : !matches?.length ? (
                  <p className="text-muted-foreground text-center py-8">No matches found for this month</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Inv. Amount</TableHead>
                        <TableHead>Vendor Bill</TableHead>
                        <TableHead>Bill Amount</TableHead>
                        <TableHead>Variance (USD)</TableHead>
                        <TableHead>FX Gain/Loss</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matches.map((m: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge variant={m.matchConfidence === "high" ? "default" : m.matchConfidence === "medium" ? "secondary" : "outline"}>
                              {m.matchConfidence === "high" ? <CheckCircle2 className="h-3 w-3 mr-1" /> :
                               m.matchConfidence === "medium" ? <Clock className="h-3 w-3 mr-1" /> :
                               <AlertTriangle className="h-3 w-3 mr-1" />}
                              {m.matchConfidence}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{m.invoiceNumber}</TableCell>
                          <TableCell>{formatAmount(m.invoiceSettlementUsd)} USD</TableCell>
                          <TableCell className="font-mono text-sm">{m.vendorBillNumber}</TableCell>
                          <TableCell>{formatAmount(m.vendorBillSettlementUsd)} USD</TableCell>
                          <TableCell className={m.varianceUsd > 0 ? "text-green-600" : m.varianceUsd < 0 ? "text-red-600" : ""}>
                            {formatAmount(m.varianceUsd)}
                          </TableCell>
                          <TableCell className={m.fxGainLoss >= 0 ? "text-green-600" : "text-red-600"}>
                            {formatAmount(m.fxGainLoss)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{m.matchReason}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedMatch(m);
                                setMatchNote("");
                                setMatchDialogOpen(true);
                              }}
                            >
                              Match
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── FX Analysis Tab ─── */}
          <TabsContent value="fx-analysis" className="space-y-4">
            <div className="flex items-center gap-4">
              <Select value={startMonth} onValueChange={setStartMonth}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Start month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">to</span>
              <Select value={endMonth} onValueChange={setEndMonth}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="End month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* FX Summary cards */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Pass-Through Cost</div>
                  <div className="text-2xl font-bold">{fxLoading ? <Skeleton className="h-8 w-20" /> : formatAmount(fxSummary?.totalPassThrough || 0)}</div>
                  <div className="text-xs text-muted-foreground">Not EG revenue</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">FX Markup Revenue</div>
                  <div className="text-2xl font-bold text-blue-600">{fxLoading ? <Skeleton className="h-8 w-20" /> : formatAmount(fxSummary?.totalFxMarkupRevenue || 0)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Service Fee Revenue</div>
                  <div className="text-2xl font-bold text-green-600">{fxLoading ? <Skeleton className="h-8 w-20" /> : formatAmount(fxSummary?.totalServiceFeeRevenue || 0)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Total Net Revenue</div>
                  <div className="text-2xl font-bold text-purple-600">{fxLoading ? <Skeleton className="h-8 w-20" /> : formatAmount(fxSummary?.totalNetRevenue || 0)}</div>
                  <div className="text-xs text-muted-foreground">FX Markup: {fxSummary?.fxMarkupPercentOfTotal?.toFixed(2) || 0}% of gross</div>
                </CardContent>
              </Card>
            </div>

            {/* Currency pair table */}
            <Card>
              <CardHeader><CardTitle>Currency Pair Analysis</CardTitle></CardHeader>
              <CardContent>
                {fxLoading ? <Skeleton className="h-40 w-full" /> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Local Currency</TableHead>
                        <TableHead>Settlement</TableHead>
                        <TableHead>Local Amount</TableHead>
                        <TableHead>Settlement Amount</TableHead>
                        <TableHead>Avg Mid-Market Rate</TableHead>
                        <TableHead>Avg Client Rate</TableHead>
                        <TableHead>Avg Markup %</TableHead>
                        <TableHead>FX Markup Revenue</TableHead>
                        <TableHead>Invoices</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(fxSummary?.currencyPairSummary || []).map((cp: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{cp.localCurrency}</TableCell>
                          <TableCell className="font-mono">{cp.settlementCurrency}</TableCell>
                          <TableCell>{formatAmount(cp.totalLocalAmount)}</TableCell>
                          <TableCell>{formatAmount(cp.totalSettlementAmount)}</TableCell>
                          <TableCell>{cp.avgMidMarketRate}</TableCell>
                          <TableCell>{cp.avgClientRate}</TableCell>
                          <TableCell>{cp.avgMarkupPercent}%</TableCell>
                          <TableCell className="text-blue-600 font-semibold">{formatAmount(cp.totalFxMarkupRevenue)}</TableCell>
                          <TableCell>{cp.invoiceCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Monthly FX trend */}
            <Card>
              <CardHeader><CardTitle>Monthly FX Revenue Trend</CardTitle></CardHeader>
              <CardContent>
                {fxLoading ? <Skeleton className="h-40 w-full" /> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Pass-Through</TableHead>
                        <TableHead>FX Markup</TableHead>
                        <TableHead>Service Fee</TableHead>
                        <TableHead>Net Revenue</TableHead>
                        <TableHead>Invoices</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(fxSummary?.monthlyTrend || []).map((m: any) => (
                        <TableRow key={m.month}>
                          <TableCell className="font-mono">{m.month}</TableCell>
                          <TableCell>{formatAmount(m.totalPassThrough)}</TableCell>
                          <TableCell className="text-blue-600">{formatAmount(m.totalFxMarkupRevenue)}</TableCell>
                          <TableCell className="text-green-600">{formatAmount(m.totalServiceFeeRevenue)}</TableCell>
                          <TableCell className="font-semibold">{formatAmount(m.totalNetRevenue)}</TableCell>
                          <TableCell>{m.invoiceCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Net P&L Tab ─── */}
          <TabsContent value="net-pnl" className="space-y-4">
            <div className="flex items-center gap-4">
              <Select value={startMonth} onValueChange={setStartMonth}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Start month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">to</span>
              <Select value={endMonth} onValueChange={setEndMonth}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="End month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Net P&L Summary */}
            {pnlLoading ? <Skeleton className="h-40 w-full" /> : netPnl && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle>Revenue Decomposition</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">Gross Invoice Total</TableCell>
                            <TableCell className="text-right">{formatAmount(netPnl.summary.grossInvoiceTotal)}</TableCell>
                          </TableRow>
                          <TableRow className="bg-muted/50">
                            <TableCell className="font-medium pl-6">(-) Pass-Through Cost</TableCell>
                            <TableCell className="text-right text-muted-foreground">({formatAmount(netPnl.summary.passThroughCost)})</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium pl-6 text-blue-600">FX Markup Revenue</TableCell>
                            <TableCell className="text-right text-blue-600">{formatAmount(netPnl.summary.fxMarkupRevenue)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium pl-6 text-green-600">Service Fee Revenue</TableCell>
                            <TableCell className="text-right text-green-600">{formatAmount(netPnl.summary.serviceFeeRevenue)}</TableCell>
                          </TableRow>
                          <TableRow className="border-t-2 font-bold">
                            <TableCell>Total Net Revenue</TableCell>
                            <TableCell className="text-right text-purple-600">{formatAmount(netPnl.summary.totalNetRevenue)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle>Expense & Profit</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium text-purple-600">Total Net Revenue</TableCell>
                            <TableCell className="text-right text-purple-600">{formatAmount(netPnl.summary.totalNetRevenue)}</TableCell>
                          </TableRow>
                          <TableRow className="bg-muted/50">
                            <TableCell className="font-medium pl-6">(-) Vendor Service Fees</TableCell>
                            <TableCell className="text-right text-muted-foreground">({formatAmount(netPnl.summary.vendorServiceFees)})</TableCell>
                          </TableRow>
                          <TableRow className="bg-muted/50">
                            <TableCell className="font-medium pl-6">(-) Bank Charges</TableCell>
                            <TableCell className="text-right text-muted-foreground">({formatAmount(netPnl.summary.bankCharges)})</TableCell>
                          </TableRow>
                          <TableRow className="border-t-2 font-bold">
                            <TableCell>Net Profit</TableCell>
                            <TableCell className={`text-right ${netPnl.summary.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatAmount(netPnl.summary.netProfit)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Net Profit Margin</TableCell>
                            <TableCell className="text-right">{netPnl.summary.netProfitMargin.toFixed(1)}%</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>

                {/* Monthly breakdown */}
                <Card>
                  <CardHeader><CardTitle>Monthly Net P&L Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead>Gross Invoice</TableHead>
                          <TableHead>Pass-Through</TableHead>
                          <TableHead>FX Markup</TableHead>
                          <TableHead>Service Fee</TableHead>
                          <TableHead>Net Revenue</TableHead>
                          <TableHead>Vendor Fees</TableHead>
                          <TableHead>Bank Charges</TableHead>
                          <TableHead>Net Profit</TableHead>
                          <TableHead>Invoices</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {netPnl.monthlyBreakdown.map((m: any) => (
                          <TableRow key={m.month}>
                            <TableCell className="font-mono">{m.month}</TableCell>
                            <TableCell>{formatAmount(m.grossInvoiceTotal)}</TableCell>
                            <TableCell className="text-muted-foreground">{formatAmount(m.passThroughCost)}</TableCell>
                            <TableCell className="text-blue-600">{formatAmount(m.fxMarkupRevenue)}</TableCell>
                            <TableCell className="text-green-600">{formatAmount(m.serviceFeeRevenue)}</TableCell>
                            <TableCell className="font-semibold">{formatAmount(m.totalNetRevenue)}</TableCell>
                            <TableCell className="text-muted-foreground">{formatAmount(m.vendorServiceFees)}</TableCell>
                            <TableCell className="text-muted-foreground">{formatAmount(m.bankCharges)}</TableCell>
                            <TableCell className={`font-bold ${m.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatAmount(m.netProfit)}
                            </TableCell>
                            <TableCell>{m.invoiceCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* By Customer */}
                <Card>
                  <CardHeader><CardTitle>By Customer</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Gross Invoice</TableHead>
                          <TableHead>Pass-Through</TableHead>
                          <TableHead>FX Markup</TableHead>
                          <TableHead>Service Fee</TableHead>
                          <TableHead>Net Revenue</TableHead>
                          <TableHead>Invoices</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {netPnl.byCustomer.map((c: any) => (
                          <TableRow key={c.customerId}>
                            <TableCell className="font-medium">{c.customerName}</TableCell>
                            <TableCell>{formatAmount(c.grossInvoiceTotal)}</TableCell>
                            <TableCell className="text-muted-foreground">{formatAmount(c.passThroughCost)}</TableCell>
                            <TableCell className="text-blue-600">{formatAmount(c.fxMarkupRevenue)}</TableCell>
                            <TableCell className="text-green-600">{formatAmount(c.serviceFeeRevenue)}</TableCell>
                            <TableCell className="font-semibold">{formatAmount(c.totalNetRevenue)}</TableCell>
                            <TableCell>{c.invoiceCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* By Channel Partner */}
                <Card>
                  <CardHeader><CardTitle>By Channel Partner</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Channel Partner</TableHead>
                          <TableHead>Gross Invoice</TableHead>
                          <TableHead>Pass-Through</TableHead>
                          <TableHead>FX Markup</TableHead>
                          <TableHead>Service Fee</TableHead>
                          <TableHead>Net Revenue</TableHead>
                          <TableHead>Invoices</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {netPnl.byChannelPartner.map((cp: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{cp.channelPartnerName}</TableCell>
                            <TableCell>{formatAmount(cp.grossInvoiceTotal)}</TableCell>
                            <TableCell className="text-muted-foreground">{formatAmount(cp.passThroughCost)}</TableCell>
                            <TableCell className="text-blue-600">{formatAmount(cp.fxMarkupRevenue)}</TableCell>
                            <TableCell className="text-green-600">{formatAmount(cp.serviceFeeRevenue)}</TableCell>
                            <TableCell className="font-semibold">{formatAmount(cp.totalNetRevenue)}</TableCell>
                            <TableCell>{cp.invoiceCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* By Country/Currency */}
                <Card>
                  <CardHeader><CardTitle>By Currency (Country Proxy)</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Currency</TableHead>
                          <TableHead>Gross Invoice</TableHead>
                          <TableHead>Pass-Through</TableHead>
                          <TableHead>FX Markup</TableHead>
                          <TableHead>Service Fee</TableHead>
                          <TableHead>Net Revenue</TableHead>
                          <TableHead>Invoices</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {netPnl.byCountry.map((c: any) => (
                          <TableRow key={c.countryCode}>
                            <TableCell className="font-mono">{c.countryCode}</TableCell>
                            <TableCell>{formatAmount(c.grossInvoiceTotal)}</TableCell>
                            <TableCell className="text-muted-foreground">{formatAmount(c.passThroughCost)}</TableCell>
                            <TableCell className="text-blue-600">{formatAmount(c.fxMarkupRevenue)}</TableCell>
                            <TableCell className="text-green-600">{formatAmount(c.serviceFeeRevenue)}</TableCell>
                            <TableCell className="font-semibold">{formatAmount(c.totalNetRevenue)}</TableCell>
                            <TableCell>{c.invoiceCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ─── Employment Cost Reconciliation Tab ─── */}
          <TabsContent value="emp-cost-recon" className="space-y-4">
            <div className="flex items-center gap-4">
              <Select value={payrollMonth} onValueChange={setPayrollMonth}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mismatch Alert Banner */}
            {(empCostRecon?.totalMismatches ?? 0) > 0 && (
              <Card className="border-red-500/50 bg-red-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-6 w-6 text-red-500" />
                    <div>
                      <div className="font-bold text-red-600">
                        {empCostRecon?.totalMismatches} Mismatch Alert{(empCostRecon?.totalMismatches ?? 0) > 1 ? 's' : ''} Detected
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Accountant data differs from Government actual charges. Please verify with your local accountant.
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Invoice Employment Cost (USD)</div>
                  <div className="text-2xl font-bold">
                    {empCostLoading ? <Skeleton className="h-8 w-20" /> : formatAmount(empCostRecon?.totalInvoiceUsdAmount || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">What we charged clients</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Actual Gov Payment (USD)</div>
                  <div className="text-2xl font-bold">
                    {empCostLoading ? <Skeleton className="h-8 w-20" /> : formatAmount(empCostRecon?.totalGovBillUsdAmount || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">What we actually paid</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Actual FX Markup Revenue</div>
                  <div className={`text-2xl font-bold ${(empCostRecon?.totalUsdDiff ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {empCostLoading ? <Skeleton className="h-8 w-20" /> : formatAmount(empCostRecon?.totalUsdDiff || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Invoice USD - Actual USD</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Local Currency Diff</div>
                  <div className={`text-2xl font-bold ${(empCostRecon?.totalMismatches ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {empCostLoading ? <Skeleton className="h-8 w-20" /> : formatAmount(empCostRecon?.totalLocalDiff || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Should be ~0 (accountant vs gov)</div>
                </CardContent>
              </Card>
            </div>

            {/* Country breakdown table */}
            <Card>
              <CardHeader>
                <CardTitle>Employment Cost by Country</CardTitle>
              </CardHeader>
              <CardContent>
                {empCostLoading ? <Skeleton className="h-40 w-full" /> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Country</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Invoice Local Amt</TableHead>
                        <TableHead>Gov Bill Local Amt</TableHead>
                        <TableHead>Local Diff</TableHead>
                        <TableHead>Invoice USD</TableHead>
                        <TableHead>Gov Bill USD</TableHead>
                        <TableHead>FX Markup (USD)</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(empCostRecon?.rows || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No employment cost data for this month. Ensure both Invoices and Government Vendor Bills are recorded.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (empCostRecon?.rows || []).map((row: any) => (
                          <TableRow key={row.countryCode} className={row.mismatchSeverity === 'critical' ? 'bg-red-500/10' : row.mismatchSeverity === 'warning' ? 'bg-amber-500/10' : ''}>
                            <TableCell className="font-mono font-semibold">{row.countryCode}</TableCell>
                            <TableCell className="font-mono">{row.localCurrency}</TableCell>
                            <TableCell>{formatAmount(row.invoiceLocalAmount)}</TableCell>
                            <TableCell>{formatAmount(row.govBillLocalAmount)}</TableCell>
                            <TableCell className={Math.abs(row.localAmountDiff) > 1 ? 'text-red-600 font-bold' : 'text-green-600'}>
                              {formatAmount(row.localAmountDiff)}
                            </TableCell>
                            <TableCell>{formatAmount(row.invoiceUsdAmount)}</TableCell>
                            <TableCell>{formatAmount(row.govBillUsdAmount)}</TableCell>
                            <TableCell className={row.usdAmountDiff >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                              {formatAmount(row.usdAmountDiff)}
                            </TableCell>
                            <TableCell>
                              {row.mismatchSeverity === 'critical' ? (
                                <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Critical</Badge>
                              ) : row.mismatchSeverity === 'warning' ? (
                                <Badge variant="secondary" className="bg-amber-500/20 text-amber-700"><AlertTriangle className="h-3 w-3 mr-1" />Warning</Badge>
                              ) : (
                                <Badge variant="outline" className="text-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Mismatch detail notes */}
            {(empCostRecon?.rows || []).filter((r: any) => r.hasMismatch).length > 0 && (
              <Card className="border-amber-500/30">
                <CardHeader>
                  <CardTitle className="text-amber-600">Mismatch Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(empCostRecon?.rows || []).filter((r: any) => r.hasMismatch).map((r: any) => (
                    <div key={r.countryCode} className={`p-3 rounded-lg text-sm ${
                      r.mismatchSeverity === 'critical' ? 'bg-red-500/10 border border-red-500/30' : 'bg-amber-500/10 border border-amber-500/30'
                    }`}>
                      <span className="font-semibold">{r.countryCode}:</span> {r.mismatchNote}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Match confirmation dialog */}
        <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Reconciliation Match</DialogTitle>
            </DialogHeader>
            {selectedMatch && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Invoice</p>
                    <p className="font-mono font-semibold">{selectedMatch.invoiceNumber}</p>
                    <p>{formatAmount(selectedMatch.invoiceSettlementUsd)} USD</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Vendor Bill</p>
                    <p className="font-mono font-semibold">{selectedMatch.vendorBillNumber}</p>
                    <p>{formatAmount(selectedMatch.vendorBillSettlementUsd)} USD</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm border-t pt-2">
                  <div>
                    <p className="text-muted-foreground">Variance</p>
                    <p className={`font-bold ${selectedMatch.varianceUsd >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatAmount(selectedMatch.varianceUsd)} USD
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">FX Gain/Loss</p>
                    <p className={`font-bold ${selectedMatch.fxGainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatAmount(selectedMatch.fxGainLoss)} USD
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Note (optional)</label>
                  <Input
                    value={matchNote}
                    onChange={(e) => setMatchNote(e.target.value)}
                    placeholder="Override note..."
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setMatchDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleExecuteMatch} disabled={executeMutation.isPending}>
                Confirm Match
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
