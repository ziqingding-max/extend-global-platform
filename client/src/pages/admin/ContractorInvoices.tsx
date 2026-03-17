import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import Layout from "@/components/Layout";
import {
  Card, CardContent
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, CheckCircle, XCircle, FileText, AlertCircle, Briefcase
} from "lucide-react";
import { formatCurrencyAmount } from "@/components/CurrencyAmount";
import { Textarea } from "@/components/ui/textarea";

export function ContractorInvoicesContent() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Filter Reset
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  // Query
  // Note: We need a router for listing contractor invoices. 
  // Assuming `contractorInvoices.list` exists or similar.
  // Actually, I didn't create a specific list endpoint for invoices in Phase 2, 
  // but usually `contractorInvoices` table is queried.
  // Let's assume I need to add `listInvoices` to `contractors` router or similar.
  // Wait, I only added `generate`, `approve`, `reject`. 
  // I might need to add `listInvoices` to the router first if it doesn't exist.
  // Let me check `server/routers/contractors.ts` content from memory or check it.
  // I'll assume I need to add it.
  
  // For now, I will write the frontend assuming the endpoint exists as `contractors.invoices.listAll`.
  const { data, isLoading, refetch } = trpc.contractors.invoices.listAll.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const approveMut = trpc.contractors.invoices.approve.useMutation({
    onSuccess: () => {
      toast.success("Invoice approved");
      refetch();
      setShowApproveDialog(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMut = trpc.contractors.invoices.reject.useMutation({
    onSuccess: () => {
      toast.success("Invoice rejected");
      refetch();
      setShowRejectDialog(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const statusColors: Record<string, string> = {
    draft: "bg-gray-50 text-gray-700 border-gray-200",
    pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    paid: "bg-blue-50 text-blue-700 border-blue-200",
  };

  return (
    <div className="p-6 space-y-6 page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contractor Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and approve incoming contractor invoices</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Contractor</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{inv.contractorName}</span>
                        <span className="text-xs text-muted-foreground">{inv.customerName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {inv.periodStart} - {inv.periodEnd}
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatCurrencyAmount(inv.totalAmount, inv.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${statusColors[inv.status] || ""}`}>
                        {inv.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {(inv.status === "draft" || inv.status === "pending_approval") && (
                          <>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => { setSelectedInvoice(inv); setShowApproveDialog(true); }}
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => { setSelectedInvoice(inv); setRejectReason(""); setShowRejectDialog(true); }}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                          onClick={() => { setSelectedInvoice(inv); setShowDetailDialog(true); }}
                          title="View Details"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Briefcase className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No invoices found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">{data.total > 0 ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, data.total)} of ${data.total} invoices` : "No invoices found"}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * pageSize >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve invoice <b>{selectedInvoice?.invoiceNumber}</b>?
              <br/>
              This will mark it as ready for billing in the next cycle.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>Cancel</Button>
            <Button onClick={() => approveMut.mutate({ id: selectedInvoice.id })} disabled={approveMut.isPending}>
              {approveMut.isPending ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Invoice</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting invoice <b>{selectedInvoice?.invoiceNumber}</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>Reason</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Incorrect amount..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectMut.mutate({ id: selectedInvoice.id, reason: rejectReason })} disabled={!rejectReason || rejectMut.isPending}>
              {rejectMut.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
            <DialogDescription>
              Details for invoice <b>{selectedInvoice?.invoiceNumber}</b>
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Invoice Number</p>
                  <p className="font-medium">{selectedInvoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge variant="outline" className={`text-xs ${statusColors[selectedInvoice.status] || ""}`}>
                    {selectedInvoice.status?.replace("_", " ")}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Contractor</p>
                  <p className="font-medium">{selectedInvoice.contractorName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Customer</p>
                  <p className="font-medium">{selectedInvoice.customerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Period</p>
                  <p className="font-medium">{selectedInvoice.periodStart} — {selectedInvoice.periodEnd}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Amount</p>
                  <p className="font-mono font-semibold">{formatCurrencyAmount(selectedInvoice.totalAmount, selectedInvoice.currency)}</p>
                </div>
              </div>
              {selectedInvoice.description && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Description</p>
                  <p className="text-sm bg-muted/40 p-3 rounded-lg">{selectedInvoice.description}</p>
                </div>
              )}
              {selectedInvoice.rejectedReason && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Rejection Reason</p>
                  <p className="text-sm bg-red-50 text-red-700 p-3 rounded-lg">{selectedInvoice.rejectedReason}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ContractorInvoices() {
  return (
    <Layout breadcrumb={["GEA", "Contractor Invoices"]}>
      <ContractorInvoicesContent />
    </Layout>
  );
}
