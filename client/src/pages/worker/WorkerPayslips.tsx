import { useState } from "react";
import { workerTrpc } from "@/lib/workerTrpc";
import WorkerLayout from "./WorkerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Wallet, Download, ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function WorkerPayslips() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ id: number; source: "payslip" | "document" } | null>(null);

  const { data, isLoading } = workerTrpc.payslips.list.useQuery({ page, pageSize: 20 });
  const { data: detail } = workerTrpc.payslips.getById.useQuery(
    { id: selected?.id!, source: selected?.source || "document" },
    { enabled: !!selected }
  );

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  function formatAmount(amount: string | null, currency: string | null) {
    if (!amount) return "--";
    try {
      return parseFloat(amount).toLocaleString("en-US", {
        style: "currency",
        currency: currency || "USD",
      });
    } catch {
      return `${currency || ""} ${amount}`;
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "--";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <WorkerLayout>
      <div className="space-y-4 md:space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Payslips</h1>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : data?.items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No payslips available yet.</p>
              <p className="text-sm mt-1">Your payslips will appear here once uploaded by your employer.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Mobile: Card List */}
            <div className="space-y-3 md:hidden">
              {data?.items.map((ps: any) => (
                <Card
                  key={`${ps.source}-${ps.id}`}
                  className="cursor-pointer active:bg-muted/50"
                  onClick={() => setSelected({ id: ps.id, source: ps.source })}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{ps.payPeriod}</p>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {ps.payDate ? formatDate(ps.payDate) : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          {ps.netAmount ? (
                            <>
                              <p className="font-bold">{formatAmount(ps.netAmount, ps.currency)}</p>
                              {ps.grossAmount && (
                                <p className="text-xs text-muted-foreground">
                                  Gross: {formatAmount(ps.grossAmount, ps.currency)}
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <FileText className="w-4 h-4" />
                              <span className="text-sm">File</span>
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Desktop: Table */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Name / Period</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                      <th className="text-right p-4 text-sm font-medium text-muted-foreground">Gross</th>
                      <th className="text-right p-4 text-sm font-medium text-muted-foreground">Net</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">File</th>
                      <th className="p-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.map((ps: any) => (
                      <tr
                        key={`${ps.source}-${ps.id}`}
                        className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                        onClick={() => setSelected({ id: ps.id, source: ps.source })}
                      >
                        <td className="p-4">
                          <p className="font-medium">{ps.payPeriod}</p>
                        </td>
                        <td className="p-4 text-sm">{formatDate(ps.payDate)}</td>
                        <td className="p-4 text-right text-sm">
                          {formatAmount(ps.grossAmount, ps.currency)}
                        </td>
                        <td className="p-4 text-right font-bold">
                          {ps.netAmount ? formatAmount(ps.netAmount, ps.currency) : "--"}
                        </td>
                        <td className="p-4">
                          {ps.fileUrl ? (
                            <a
                              href={ps.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {ps.fileName || "Download"}
                            </a>
                          ) : "--"}
                        </td>
                        <td className="p-4">
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Payslip Detail Dialog */}
        <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Payslip Detail</DialogTitle>
            </DialogHeader>
            {detail && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Name / Period</p>
                    <p className="font-medium">{detail.payPeriod}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-medium">{formatDate(detail.payDate)}</p>
                  </div>
                  {detail.grossAmount && (
                    <div>
                      <p className="text-sm text-muted-foreground">Gross Amount</p>
                      <p className="font-medium">{formatAmount(detail.grossAmount, detail.currency)}</p>
                    </div>
                  )}
                  {detail.netAmount && (
                    <div>
                      <p className="text-sm text-muted-foreground">Net Amount</p>
                      <p className="text-lg font-bold">{formatAmount(detail.netAmount, detail.currency)}</p>
                    </div>
                  )}
                </div>

                {!detail.grossAmount && !detail.netAmount && (
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      This payslip was uploaded as a document. Download the file to view details.
                    </p>
                  </div>
                )}

                {detail.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="text-sm mt-1">{detail.notes}</p>
                  </div>
                )}

                {detail.fileUrl && (
                  <a
                    href={detail.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full p-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download Payslip
                  </a>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </WorkerLayout>
  );
}
