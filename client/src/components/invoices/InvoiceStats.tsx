import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Calendar } from "lucide-react";
import { formatMonthLong, formatAmount } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText } from "lucide-react";

export function InvoiceStats({ 
  months, 
  statusLabelKeys, 
  typeLabelKeys, 
  statusColors 
}: { 
  months: any[], 
  statusLabelKeys: Record<string, string>, 
  typeLabelKeys: Record<string, string>,
  statusColors: Record<string, string>
}) {

  // Check if there is any meaningful data (revenue invoices or deposit invoices)
  const hasAnyData = months && months.length > 0 && months.some(
    (m) => m.invoiceCount > 0 || (m.currencies && m.currencies.some((c: any) => c.depositAmount > 0))
  );

  if (!hasAnyData) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No monthly invoice data available</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate overall stats
  const totalInvoices = months.reduce((s, m) => s + m.invoiceCount, 0);
  const totalPaid = months.reduce((s, m) => s + (m.statusBreakdown.paid || 0), 0);
  const totalPending = months.reduce((s, m) => s + (m.statusBreakdown.sent || 0) + (m.statusBreakdown.pending_review || 0), 0);
  const totalOverdue = months.reduce((s, m) => s + (m.statusBreakdown.overdue || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Invoices</div>
            <div className="text-2xl font-bold mt-1">{totalInvoices}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Paid</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{totalPaid}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Pending / Sent</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{totalPending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Overdue</div>
            <div className="text-2xl font-bold text-red-600 mt-1">{totalOverdue}</div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Breakdown */}
      {months.map((m) => (
        <Card key={m.month}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {formatMonthLong(m.month)}
              </CardTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{"Customers: ".replace("{count}", String(m.customerCount))}{m.customerCount}</span>
                <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{"Invoices: ".replace("{count}", String(m.invoiceCount))}{m.invoiceCount}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Multi-currency breakdown */}
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue by Currency</div>
              {m.currencies?.map((ccy: any) => (
                <div key={ccy.currency} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">{ccy.currency}</Badge>
                      <span className="text-xs text-muted-foreground">{`${ccy.invoiceCount} invoices`}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-medium ${
                        ccy.collectionRate >= 100 ? "text-emerald-600" :
                        ccy.collectionRate >= 50 ? "text-amber-600" : "text-red-600"
                      }`}>
                        {`Collected Rate: ${ccy.collectionRate}%`}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Total Invoiced</div>
                      <div className="text-sm font-bold font-mono">
                        {ccy.currency} {formatAmount(ccy.totalAmount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Collected</div>
                      <div className="text-sm font-bold font-mono text-emerald-600">
                        {ccy.currency} {formatAmount(ccy.paidAmount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Outstanding</div>
                      <div className="text-sm font-bold font-mono text-amber-600">
                        {ccy.currency} {formatAmount(ccy.totalAmount - ccy.paidAmount)}
                      </div>
                    </div>
                    {ccy.depositAmount > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground">Deposits</div>
                        <div className="text-sm font-bold font-mono text-blue-600">
                          {ccy.currency} {formatAmount(ccy.depositAmount)}
                        </div>
                        {(ccy.depositPaidAmount > 0 || ccy.depositCount > 0) && (
                          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            <div className="text-emerald-600">Deposits Paid: {ccy.currency} {formatAmount(ccy.depositPaidAmount || 0)}</div>
                            <div className="text-amber-600">Deposits Unpaid: {ccy.currency} {formatAmount(ccy.depositAmount - (ccy.depositPaidAmount || 0))}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Collection progress bar */}
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        ccy.collectionRate >= 100 ? "bg-emerald-500" :
                        ccy.collectionRate >= 50 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(ccy.collectionRate, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Status breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(m.statusBreakdown).map(([status, count]) => (
                <div key={status} className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground capitalize">{statusLabelKeys[status] ? statusLabelKeys[status] : status}</div>
                  <div className="text-lg font-bold mt-0.5">{count as number}</div>
                </div>
              ))}
            </div>

            {/* Type breakdown */}
            {Object.entries(m.typeBreakdown).length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {Object.entries(m.typeBreakdown).map(([type, count]) => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {(typeLabelKeys[type] ? typeLabelKeys[type] : type)}: {count as number}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}