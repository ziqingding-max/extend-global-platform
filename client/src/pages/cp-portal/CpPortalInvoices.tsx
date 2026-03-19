/**
 * CP Portal Invoices (Task Group D — Redesigned)
 *
 * Two top-level tabs:
 * 1. Payables (L1: EG→CP) — What we owe to EG. Read-only.
 * 2. Receivables (L2: CP→Client) — What clients owe us. Full lifecycle.
 *
 * Receivables tab supports:
 * - Viewing draft invoices with custom item management
 * - Sending invoices to clients
 * - Marking invoices as paid (manual offline confirmation)
 * - Sending overdue reminders
 */
import { useState } from "react";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  FileText,
  Send,
  Loader2,
  CheckCircle,
  Bell,
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_review: "bg-yellow-100 text-yellow-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  partially_paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  void: "bg-gray-100 text-gray-500",
};

type TopTab = "payables" | "receivables";

export default function CpPortalInvoices() {
  const [, navigate] = useLocation();
  const [topTab, setTopTab] = useState<TopTab>("receivables");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Mark Paid dialog state
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [markPaidInvoice, setMarkPaidInvoice] = useState<any>(null);
  const [markPaidAmount, setMarkPaidAmount] = useState("");
  const [markPaidNotes, setMarkPaidNotes] = useState("");

  const layer = topTab === "payables" ? "eg_to_cp" : "cp_to_client";

  const { data, isLoading, refetch } = cpTrpc.invoices.list.useQuery({
    page,
    pageSize: 20,
    layer,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  // Summary for the active layer
  const { data: summary } = cpTrpc.invoices.summary.useQuery({ layer });

  const sendMutation = cpTrpc.invoices.sendInvoice.useMutation({
    onSuccess: () => {
      toast.success("Invoice sent to client");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const markPaidMutation = cpTrpc.invoices.markPaid.useMutation({
    onSuccess: (result: any) => {
      toast.success(
        result.newStatus === "paid"
          ? "Invoice marked as fully paid"
          : `Partial payment recorded. Remaining: $${result.remainingDue}`
      );
      setMarkPaidOpen(false);
      setMarkPaidInvoice(null);
      setMarkPaidAmount("");
      setMarkPaidNotes("");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const reminderMutation = cpTrpc.invoices.sendOverdueReminder.useMutation({
    onSuccess: () => {
      toast.success("Overdue reminder sent");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleMarkPaidClick = (inv: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkPaidInvoice(inv);
    setMarkPaidAmount(inv.total || "0");
    setMarkPaidNotes("");
    setMarkPaidOpen(true);
  };

  const handleMarkPaidSubmit = () => {
    if (!markPaidInvoice) return;
    markPaidMutation.mutate({
      invoiceId: markPaidInvoice.id,
      paidAmount: markPaidAmount || undefined,
      notes: markPaidNotes || undefined,
    });
  };

  const statusTabs = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent" },
    { value: "overdue", label: "Overdue" },
    { value: "paid", label: "Paid" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground">
          Manage payables to EG and receivables from your clients
        </p>
      </div>

      {/* Top-level Layer Tabs */}
      <div className="flex items-center gap-3 border-b pb-3">
        <Button
          variant={topTab === "receivables" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setTopTab("receivables");
            setStatusFilter("all");
            setPage(1);
          }}
          className="gap-1.5"
        >
          <ArrowDownLeft className="w-4 h-4" />
          Receivables (L2)
        </Button>
        <Button
          variant={topTab === "payables" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setTopTab("payables");
            setStatusFilter("all");
            setPage(1);
          }}
          className="gap-1.5"
        >
          <ArrowUpRight className="w-4 h-4" />
          Payables (L1)
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">
                {topTab === "receivables" ? "Outstanding from Clients" : "Outstanding to EG"}
              </div>
              <div className="text-2xl font-bold text-blue-600">
                ${summary.totalOutstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {summary.invoiceCount.sent} invoice(s) sent
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Overdue</div>
              <div className="text-2xl font-bold text-red-600">
                ${summary.totalOverdue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {summary.invoiceCount.overdue} invoice(s) overdue
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Paid This Month</div>
              <div className="text-2xl font-bold text-green-600">
                ${summary.totalPaidThisMonth.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {summary.invoiceCount.paid} invoice(s) paid
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2">
        {statusTabs.map((t) => (
          <Button
            key={t.value}
            variant={statusFilter === t.value ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              setStatusFilter(t.value);
              setPage(1);
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Invoice Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  {topTab === "receivables" && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items
                  ?.filter(
                    (inv: any) =>
                      !search ||
                      (inv.invoiceNumber || "").toLowerCase().includes(search.toLowerCase()) ||
                      (inv.customerName || "").toLowerCase().includes(search.toLowerCase())
                  )
                  .map((inv: any) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/cp/invoices/${inv.id}`)}
                    >
                      <TableCell className="font-mono text-sm">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell className="font-medium">
                        {inv.customerName}
                      </TableCell>
                      <TableCell>{inv.invoiceMonth || "—"}</TableCell>
                      <TableCell>
                        ${Number(inv.total ?? 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        ${Number(inv.amountDue ?? inv.total ?? 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={STATUS_COLORS[inv.status] || ""}
                          variant="outline"
                        >
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{inv.dueDate || "—"}</TableCell>
                      {topTab === "receivables" && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Send (draft only) */}
                            {inv.status === "draft" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Send this invoice to the client?")) {
                                    sendMutation.mutate({ invoiceId: inv.id });
                                  }
                                }}
                                disabled={sendMutation.isPending}
                                title="Send to client"
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                            {/* Mark Paid (sent/overdue only) */}
                            {(inv.status === "sent" || inv.status === "overdue") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleMarkPaidClick(inv, e)}
                                title="Mark as paid"
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            {/* Send Reminder (sent/overdue only) */}
                            {(inv.status === "sent" || inv.status === "overdue") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Send overdue reminder to client?")) {
                                    reminderMutation.mutate({ invoiceId: inv.id });
                                  }
                                }}
                                disabled={reminderMutation.isPending}
                                title="Send reminder"
                              >
                                <Bell className="h-4 w-4 text-amber-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                {(!data?.items || data.items.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={topTab === "receivables" ? 8 : 7}
                      className="text-center text-muted-foreground py-8"
                    >
                      No invoices found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(data.total / 20)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(data.total / 20)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Mark Paid Dialog */}
      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Mark Invoice as Paid
            </DialogTitle>
          </DialogHeader>
          {markPaidInvoice && (
            <div className="space-y-4 py-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Invoice: </span>
                <span className="font-mono font-medium">
                  {markPaidInvoice.invoiceNumber}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Total Amount: </span>
                <span className="font-bold">
                  $
                  {Number(markPaidInvoice.total ?? 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="space-y-2">
                <Label>Paid Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={markPaidAmount}
                  onChange={(e) => setMarkPaidAmount(e.target.value)}
                  placeholder="Enter amount received"
                />
                <p className="text-xs text-muted-foreground">
                  Leave as total for full payment, or enter a partial amount.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={markPaidNotes}
                  onChange={(e) => setMarkPaidNotes(e.target.value)}
                  placeholder="e.g., Wire transfer received on 2025-03-15, Ref #12345"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMarkPaidSubmit}
              disabled={markPaidMutation.isPending || !markPaidAmount}
              className="bg-green-600 hover:bg-green-700"
            >
              {markPaidMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-1" />
              )}
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
