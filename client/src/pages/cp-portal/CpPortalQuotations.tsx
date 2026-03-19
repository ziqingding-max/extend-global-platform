/**
 * CP Portal Quotations (Task Group E)
 *
 * List and manage quotations for CP's end clients.
 * Supports: create, view, send, and status management.
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  FileText,
  Plus,
  Send,
  Loader2,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  expired: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
};

const STATUS_ICONS: Record<string, any> = {
  draft: FileText,
  sent: Send,
  accepted: CheckCircle,
  expired: Clock,
  rejected: XCircle,
};

export default function CpPortalQuotations() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading, refetch } = cpTrpc.quotations.list.useQuery({
    page,
    pageSize: 20,
    status: statusFilter === "all" ? undefined : statusFilter as any,
    search: search || undefined,
  });

  const { data: summary } = cpTrpc.quotations.summary.useQuery();

  const { data: detail, isLoading: detailLoading } = cpTrpc.quotations.get.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const updateStatusMutation = cpTrpc.quotations.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Quotation status updated");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusTabs = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent" },
    { value: "accepted", label: "Accepted" },
    { value: "expired", label: "Expired" },
  ];

  const handleViewDetail = (id: number) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Quotations
          </h1>
          <p className="text-muted-foreground">
            Create and manage quotations for your clients
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{summary.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-gray-600">{summary.draft}</div>
              <div className="text-xs text-muted-foreground">Draft</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{summary.sent}</div>
              <div className="text-xs text-muted-foreground">Sent</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{summary.accepted}</div>
              <div className="text-xs text-muted-foreground">Accepted</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{(summary as any).expired ?? 0}</div>
              <div className="text-xs text-muted-foreground">Expired</div>
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
            onClick={() => { setStatusFilter(t.value); setPage(1); }}
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
            placeholder="Search by quotation number..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Quotations Table */}
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
                  <TableHead>Quotation #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Monthly Total</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items?.map((q: any) => {
                  const StatusIcon = STATUS_ICONS[q.status] || FileText;
                  return (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono text-sm">{q.quotationNumber}</TableCell>
                      <TableCell className="font-medium">{q.customerName}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${Number(q.totalMonthly ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>{q.currency}</TableCell>
                      <TableCell>
                        {q.validUntil ? new Date(q.validUntil).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[q.status] || ""} variant="outline">
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetail(q.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {q.status === "draft" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("Send this quotation to the client?")) {
                                  updateStatusMutation.mutate({ id: q.id, status: "sent" });
                                }
                              }}
                              disabled={updateStatusMutation.isPending}
                              title="Send to client"
                            >
                              <Send className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          {q.status === "sent" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm("Mark this quotation as accepted?")) {
                                    updateStatusMutation.mutate({ id: q.id, status: "accepted" });
                                  }
                                }}
                                title="Mark accepted"
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm("Mark this quotation as rejected?")) {
                                    updateStatusMutation.mutate({ id: q.id, status: "rejected" });
                                  }
                                }}
                                title="Mark rejected"
                              >
                                <XCircle className="h-4 w-4 text-red-600" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!data?.items || data.items.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No quotations found.
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(data.total / 20)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Quotation Detail — {detail?.quotationNumber || "Loading..."}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Client: </span>
                  <span className="font-medium">{detail.customerName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <Badge className={STATUS_COLORS[detail.status] || ""} variant="outline">
                    {detail.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Monthly Total: </span>
                  <span className="font-mono font-bold">
                    ${Number(detail.totalMonthly ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Valid Until: </span>
                  <span>{detail.validUntil ? new Date(detail.validUntil).toLocaleDateString() : "N/A"}</span>
                </div>
              </div>

              {/* Country Breakdown */}
              {detail.snapshotData && Array.isArray(detail.snapshotData as unknown) ? (
                <div>
                  <h4 className="font-semibold mb-2">Country Breakdown</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Country</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead className="text-right">HC</TableHead>
                        <TableHead className="text-right">Salary</TableHead>
                        <TableHead className="text-right">Service Fee</TableHead>
                        <TableHead className="text-right">Subtotal (USD)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detail.snapshotData as any[]).map((item: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>{item.countryCode}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {item.serviceType?.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{item.headcount}</TableCell>
                          <TableCell className="text-right font-mono">
                            {item.currency} {Number(item.salary ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${Number(item.serviceFee ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            ${Number(item.subtotal ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-6">
              Quotation not found.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
