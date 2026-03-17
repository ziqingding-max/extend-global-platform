import { useState } from "react";
import { workerTrpc } from "@/lib/workerTrpc";
import WorkerLayout from "./WorkerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
];

const statusStyles: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_approval: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
};

export default function WorkerInvoices() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);

  const { data, isLoading } = workerTrpc.invoices.list.useQuery({
    page,
    pageSize: 20,
    status: statusFilter === "all" ? undefined : statusFilter as any,
  });

  const { data: invoiceDetail } = workerTrpc.invoices.getById.useQuery(
    { id: selectedInvoiceId! },
    { enabled: !!selectedInvoiceId }
  );

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <WorkerLayout>
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Invoices</h1>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : data?.items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No invoices found.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Mobile: Card List */}
            <div className="space-y-3 md:hidden">
              {data?.items.map((invoice) => (
                <Card key={invoice.id} className="cursor-pointer active:bg-muted/50" onClick={() => setSelectedInvoiceId(invoice.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{invoice.invoiceNumber || `INV-${invoice.id}`}</p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusStyles[invoice.status] || "bg-gray-100 text-gray-700"}`}>
                            {statusLabels[invoice.status] || invoice.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : "--"}
                          {invoice.periodStart && invoice.periodEnd && (
                            <span className="ml-2">({invoice.periodStart} - {invoice.periodEnd})</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-right">
                          {parseFloat(invoice.totalAmount || "0").toLocaleString("en-US", { style: "currency", currency: invoice.currency || "USD" })}
                        </p>
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
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Invoice #</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Period</th>
                      <th className="text-right p-4 text-sm font-medium text-muted-foreground">Amount</th>
                      <th className="text-center p-4 text-sm font-medium text-muted-foreground">Status</th>
                      <th className="p-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.map((invoice) => (
                      <tr key={invoice.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedInvoiceId(invoice.id)}>
                        <td className="p-4 font-medium">{invoice.invoiceNumber || `INV-${invoice.id}`}</td>
                        <td className="p-4 text-sm">{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : "--"}</td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {invoice.periodStart && invoice.periodEnd ? `${invoice.periodStart} - ${invoice.periodEnd}` : "--"}
                        </td>
                        <td className="p-4 text-right font-bold">
                          {parseFloat(invoice.totalAmount || "0").toLocaleString("en-US", { style: "currency", currency: invoice.currency || "USD" })}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[invoice.status] || "bg-gray-100 text-gray-700"}`}>
                            {statusLabels[invoice.status] || invoice.status}
                          </span>
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} ({data?.total} total)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Invoice Detail Dialog */}
        <Dialog open={!!selectedInvoiceId} onOpenChange={(open) => !open && setSelectedInvoiceId(null)}>
          <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice Detail</DialogTitle>
            </DialogHeader>
            {invoiceDetail && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Invoice Number</p>
                    <p className="font-medium">{invoiceDetail.invoiceNumber || `INV-${invoiceDetail.id}`}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[invoiceDetail.status] || "bg-gray-100 text-gray-700"}`}>
                      {statusLabels[invoiceDetail.status] || invoiceDetail.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Invoice Date</p>
                    <p className="font-medium">{invoiceDetail.invoiceDate || "--"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Due Date</p>
                    <p className="font-medium">{invoiceDetail.dueDate || "--"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Period</p>
                    <p className="font-medium">{invoiceDetail.periodStart} - {invoiceDetail.periodEnd}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-lg font-bold">
                      {parseFloat(invoiceDetail.totalAmount || "0").toLocaleString("en-US", { style: "currency", currency: invoiceDetail.currency || "USD" })}
                    </p>
                  </div>
                </div>

                {/* Line Items */}
                {invoiceDetail.items && invoiceDetail.items.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Line Items</p>
                    <div className="border rounded-md divide-y">
                      {invoiceDetail.items.map((item: any) => (
                        <div key={item.id} className="p-3 flex justify-between">
                          <div>
                            <p className="text-sm font-medium">{item.description}</p>
                            {item.quantity && item.unitPrice && (
                              <p className="text-xs text-muted-foreground">{item.quantity} x {item.unitPrice}</p>
                            )}
                          </div>
                          <p className="text-sm font-medium">{parseFloat(item.amount || "0").toLocaleString("en-US", { style: "currency", currency: invoiceDetail.currency || "USD" })}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </WorkerLayout>
  );
}
