/**
 * Portal Adjustments Page
 *
 * View, create, edit and delete salary/benefit adjustments for workers (employees & contractors).
 * Supports both EOR (employees) and AOR (contractors) with unified worker selector.
 * Adjustments can only be edited/deleted when in 'submitted' status (before monthly lock).
 */
import { useState, useMemo } from "react";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowUpDown, ChevronLeft, ChevronRight, Plus, Pencil, Trash2,
  Upload, Loader2, Receipt, ExternalLink, CheckCircle2, XCircle, Download,
} from "lucide-react";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csvExport";
import { cn } from "@/lib/utils";
import { MonthPicker } from "@/components/DatePicker";
import PortalPayrollCycleIndicator from "@/components/PortalPayrollCycleIndicator";
import PortalWorkerSelector from "@/components/PortalWorkerSelector";


const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 border-gray-200",
  submitted: "bg-yellow-100 text-yellow-800 border-yellow-200",
  client_approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  client_rejected: "bg-red-100 text-red-800 border-red-200",
  admin_approved: "bg-green-100 text-green-800 border-green-200",
  admin_rejected: "bg-orange-100 text-orange-800 border-orange-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  locked: "bg-blue-100 text-blue-800 border-blue-200",
};

const adjustmentTypes = [
  "bonus",
  "allowance",
  "deduction",
  "other",
];

const categoryOptions = [
  "housing",
  "transport",
  "meals",
  "performance_bonus",
  "year_end_bonus",
  "overtime",
  "travel_reimbursement",
  "equipment_reimbursement",
  "absence_deduction",
  "other",
];

interface AdjustmentForm {
  workerId: string; // "emp-123" or "con-456"
  workerType: "employee" | "contractor" | "";
  workerCurrency: string;
  adjustmentType: string;
  category: string;
  amount: string;
  effectiveMonth: string;
  description: string;
  receiptFileUrl: string;
  receiptFileKey: string;
}

const emptyForm: AdjustmentForm = {
  workerId: "",
  workerType: "",
  workerCurrency: "USD",
  adjustmentType: "",
  category: "",
  amount: "",
  effectiveMonth: new Date().toISOString().slice(0, 7),
  description: "",
  receiptFileUrl: "",
  receiptFileKey: "",
};

export default function PortalAdjustments() {
  
  const { user } = usePortalAuth();
  const isHrOrAdmin = user && ["admin", "hr_manager"].includes(user.portalRole);

  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingWorkerType, setEditingWorkerType] = useState<"employee" | "contractor">("employee");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteWorkerType, setDeleteWorkerType] = useState<"employee" | "contractor">("employee");
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectWorkerType, setRejectWorkerType] = useState<"employee" | "contractor">("employee");
  const [rejectReason, setRejectReason] = useState("");
  const [form, setForm] = useState<AdjustmentForm>({ ...emptyForm });
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const utils = portalTrpc.useUtils();

  const { data, isLoading } = portalTrpc.adjustments.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    pageSize,
  });

  const createMutation = portalTrpc.adjustments.create.useMutation({
    onSuccess: () => {
      toast.success("Adjustment created successfully.");
      setShowCreate(false);
      setForm({ ...emptyForm });
      utils.adjustments.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = portalTrpc.adjustments.update.useMutation({
    onSuccess: () => {
      toast.success("Adjustment updated successfully.");
      setEditingId(null);
      setForm({ ...emptyForm });
      utils.adjustments.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = portalTrpc.adjustments.delete.useMutation({
    onSuccess: () => {
      toast.success("Adjustment deleted successfully.");
      setDeleteId(null);
      utils.adjustments.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const approveMutation = portalTrpc.adjustments.approve.useMutation({
    onSuccess: () => {
      toast.success("Adjustment approved successfully.");
      utils.adjustments.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rejectMutation = portalTrpc.adjustments.reject.useMutation({
    onSuccess: () => {
      toast.success("Adjustment rejected successfully.");
      setRejectId(null);
      setRejectReason("");
      utils.adjustments.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const uploadReceiptMutation = portalTrpc.adjustments.uploadReceipt.useMutation({
    onSuccess: (data) => {
      setForm((prev) => ({ ...prev, receiptFileUrl: data.url, receiptFileKey: data.fileKey }));
      setUploadingReceipt(false);
      toast.success("Receipt uploaded successfully.");
    },
    onError: (err: any) => {
      setUploadingReceipt(false);
      toast.error(err.message);
    },
  });

  const items = Array.isArray(data?.items) ? data.items : [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File size exceeds 20MB limit.");
      return;
    }
    setUploadingReceipt(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadReceiptMutation.mutate({
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
      });
    };
    reader.readAsDataURL(file);
  }

  function handleCreate() {
    if (!form.workerId || !form.workerType || !form.adjustmentType || !form.amount || !form.effectiveMonth) {
      toast.error("Please fill in all required fields.");
      return;
    }
    // Extract numeric ID from "emp-123" or "con-456"
    const numericId = parseInt(form.workerId.split("-")[1]);

    createMutation.mutate({
      workerType: form.workerType as "employee" | "contractor",
      workerId: numericId,
      adjustmentType: form.adjustmentType as any,
      category: form.category ? (form.category as any) : undefined,
      amount: form.amount,
      currency: form.workerCurrency,
      effectiveMonth: form.effectiveMonth,
      description: form.description || undefined,
      receiptFileUrl: form.receiptFileUrl || undefined,
      receiptFileKey: form.receiptFileKey || undefined,
    });
  }

  function handleUpdate() {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      workerType: editingWorkerType,
      amount: form.amount || undefined,
      description: form.description || undefined,
      receiptFileUrl: form.receiptFileUrl || undefined,
      receiptFileKey: form.receiptFileKey || undefined,
    });
  }

  function openEdit(adj: any) {
    setEditingId(adj.id);
    setEditingWorkerType(adj.workerType || "employee");
    setForm({
      workerId: "",
      workerType: adj.workerType || "employee",
      workerCurrency: adj.currency || "USD",
      adjustmentType: adj.adjustmentType,
      category: adj.category || "",
      amount: adj.amount,
      effectiveMonth: adj.effectiveMonth ? adj.effectiveMonth.slice(0, 7) : "",
      description: adj.description || "",
      receiptFileUrl: adj.receiptFileUrl || "",
      receiptFileKey: "",
    });
  }

  const isFormOpen = showCreate || editingId !== null;

  return (
    <PortalLayout title="Adjustments">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Adjustments</h2>
            <p className="text-sm text-muted-foreground mt-1">
              View, create, edit and delete salary/benefit adjustments for workers.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={items.length === 0}
              onClick={() => {
                exportToCsv(items, [
                  { header: "Worker", accessor: (r: any) => `${r.employeeFirstName || r.workerFirstName || ""} ${r.employeeLastName || r.workerLastName || ""}`.trim() },
                  { header: "Type", accessor: (r: any) => r.workerType === "contractor" ? "AOR" : "EOR" },
                  { header: "Adjustment Type", accessor: (r: any) => {
                    switch (r.adjustmentType) {
                      case "bonus": return "Bonus";
                      case "allowance": return "Allowance";
                      case "deduction": return "Deduction";
                      case "other": return "Other";
                      default: return r.adjustmentType || "";
                    }
                  }},
                  { header: "Category", accessor: (r: any) => {
                    switch (r.category) {
                      case "housing": return "Housing";
                      case "transport": return "Transport";
                      case "meals": return "Meals";
                      case "performance_bonus": return "Performance Bonus";
                      case "year_end_bonus": return "Year-End Bonus";
                      case "overtime": return "Overtime";
                      case "travel_reimbursement": return "Travel Reimbursement";
                      case "equipment_reimbursement": return "Equipment Reimbursement";
                      case "absence_deduction": return "Absence Deduction";
                      case "other": return "Other";
                      default: return r.category || "";
                    }
                  }},
                  { header: "Effective Month", accessor: (r: any) => r.effectiveMonth ? new Date(r.effectiveMonth + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short" }) : "" },
                  { header: "Amount", accessor: (r: any) => r.amount || 0 },
                  { header: "Currency", accessor: (r: any) => r.currency || "" },
                  { header: "Status", accessor: (r: any) => {
                    switch (r.status) {
                      case "submitted": return "Pending Review";
                      case "client_approved": return "Client Approved";
                      case "client_rejected": return "Rejected";
                      case "admin_approved": return "Confirmed";
                      case "admin_rejected": return "Admin Rejected";
                      case "locked": return "Locked";
                      default: return r.status || "";
                    }
                  }},
                ], `adjustments-export-${new Date().toISOString().slice(0, 10)}.csv`);
              }}
            >
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
            <Button onClick={() => { setForm({ ...emptyForm }); setShowCreate(true); }}>
              <Plus className="w-4 h-4 mr-2" /> New Adjustment
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="submitted">Pending Review</SelectItem>
              <SelectItem value="client_approved">Client Approved</SelectItem>
              <SelectItem value="client_rejected">Rejected</SelectItem>
              <SelectItem value="admin_approved">Confirmed</SelectItem>
              <SelectItem value="admin_rejected">Admin Rejected</SelectItem>
              <SelectItem value="locked">Locked</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ArrowUpDown className="w-10 h-10 mb-3" />
                <p className="text-lg font-medium">No adjustments found.</p>
                <p className="text-sm mt-1">Start by creating a new adjustment.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Effective Month</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((adj: any) => (
                    <TableRow key={`${adj.workerType || "emp"}-${adj.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{adj.employeeFirstName || adj.workerFirstName} {adj.employeeLastName || adj.workerLastName}</span>
                          <Badge variant="outline" className={cn("text-[10px] h-4 px-1",
                            adj.workerType === "contractor"
                              ? "bg-orange-50 text-orange-700 border-orange-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          )}>
                            {adj.workerLabel || (adj.workerType === "contractor" ? "AOR" : "EOR")}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">
                        {(() => {
                          switch (adj.adjustmentType) {
                            case "bonus": return "Bonus";
                            case "allowance": return "Allowance";
                            case "deduction": return "Deduction";
                            case "other": return "Other";
                            default: return adj.adjustmentType?.replace(/_/g, " ") || "-";
                          }
                        })()}
                      </TableCell>
                      <TableCell className="capitalize text-sm">
                        {adj.category ? (
                          (() => {
                            switch (adj.category) {
                              case "housing": return "Housing";
                              case "transport": return "Transport";
                              case "meals": return "Meals";
                              case "performance_bonus": return "Performance Bonus";
                              case "year_end_bonus": return "Year-End Bonus";
                              case "overtime": return "Overtime";
                              case "travel_reimbursement": return "Travel Reimbursement";
                              case "equipment_reimbursement": return "Equipment Reimbursement";
                              case "absence_deduction": return "Absence Deduction";
                              case "other": return "Other";
                              default: return adj.category?.replace(/_/g, " ");
                            }
                          })()
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        {adj.effectiveMonth
                          ? new Date(adj.effectiveMonth + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short" })
                          : "-"}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono", adj.adjustmentType === "deduction" ? "text-red-600" : "")}>
                        {adj.amount != null
                          ? `${adj.adjustmentType === "deduction" ? "-" : ""}${adj.currency || ""} ${Number(adj.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[adj.status] || ""}>
                          {(() => {
                            switch (adj.status) {
                              case "submitted": return "Pending Review";
                              case "client_approved": return "Client Approved";
                              case "client_rejected": return "Rejected";
                              case "admin_approved": return "Confirmed";
                              case "admin_rejected": return "Admin Rejected";
                              case "locked": return "Locked";
                              default: return adj.status;
                            }
                          })()}
                        </Badge>
                        {adj.clientRejectionReason && adj.status === "client_rejected" && (
                          <p className="text-xs text-red-600 mt-1 max-w-[200px] truncate" title={adj.clientRejectionReason}>
                            {adj.clientRejectionReason}
                          </p>
                        )}
                        {adj.adminRejectionReason && adj.status === "admin_rejected" && (
                          <p className="text-xs text-orange-600 mt-1 max-w-[200px] truncate" title={adj.adminRejectionReason}>
                            {adj.adminRejectionReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {adj.receiptFileUrl ? (
                          <a href={adj.receiptFileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {adj.status === "submitted" && isHrOrAdmin && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => approveMutation.mutate({ id: adj.id, workerType: adj.workerType || "employee" })}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => { setRejectId(adj.id); setRejectWorkerType(adj.workerType || "employee"); setRejectReason(""); }}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {adj.status === "submitted" && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(adj)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setDeleteId(adj.id); setDeleteWorkerType(adj.workerType || "employee"); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => {
        if (!open) { setShowCreate(false); setEditingId(null); setForm({ ...emptyForm }); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Adjustment" : "New Adjustment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Payroll Cycle Indicator */}
            <PortalPayrollCycleIndicator month={form.effectiveMonth || undefined} label="Adjustments" />
            {!editingId && (
              <>
                {/* Worker Selector — unified employee + contractor */}
                <PortalWorkerSelector
                  value={form.workerId}
                  onValueChange={(value, worker) => {
                    setForm((f) => ({
                      ...f,
                      workerId: value,
                      workerType: worker?.type || "",
                      workerCurrency: worker?.currency || "USD",
                    }));
                  }}
                  label="Worker"
                  required
                />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type <span className="text-destructive">*</span></Label>
                    <Select value={form.adjustmentType} onValueChange={(v) => setForm((f) => ({ ...f, adjustmentType: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {adjustmentTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {(() => {
                              switch (type) {
                                case "bonus": return "Bonus";
                                case "allowance": return "Allowance";
                                case "deduction": return "Deduction";
                                case "other": return "Other";
                                default: return type;
                              }
                            })()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Only show category for EOR employees */}
                  {form.workerType !== "contractor" && (
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={form.category || "none"} onValueChange={(v) => setForm((f) => ({ ...f, category: v === "none" ? "" : v }))}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {categoryOptions.map((c) => (
                            <SelectItem key={c} value={c}>
                              {(() => {
                                switch (c) {
                                  case "housing": return "Housing";
                                  case "transport": return "Transport";
                                  case "meals": return "Meals";
                                  case "performance_bonus": return "Performance Bonus";
                                  case "year_end_bonus": return "Year-End Bonus";
                                  case "overtime": return "Overtime";
                                  case "travel_reimbursement": return "Travel Reimbursement";
                                  case "equipment_reimbursement": return "Equipment Reimbursement";
                                  case "absence_deduction": return "Absence Deduction";
                                  case "other": return "Other";
                                  default: return c;
                                }
                              })()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Effective Month <span className="text-destructive">*</span></Label>
                  <MonthPicker
                    value={form.effectiveMonth}
                    onChange={(v) => setForm((f) => ({ ...f, effectiveMonth: v }))}
                    placeholder="Select month"
                  />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input value={form.workerCurrency} readOnly disabled className="bg-muted" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Receipt</Label>
              {form.receiptFileUrl ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <a href={form.receiptFileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">
                    Existing Receipt
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, receiptFileUrl: "", receiptFileKey: "" }))}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleReceiptUpload} />
                  <Button variant="outline" size="sm" disabled={uploadingReceipt} asChild>
                    <span>
                      {uploadingReceipt ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                      {uploadingReceipt ? "Uploading..." : "Upload Receipt"}
                    </span>
                  </Button>
                </label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditingId(null); setForm({ ...emptyForm }); }}>
              Cancel
            </Button>
            <Button
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? "Save" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this adjustment?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the adjustment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId, workerType: deleteWorkerType })}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={rejectId !== null} onOpenChange={(open) => { if (!open) { setRejectId(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectId && rejectMutation.mutate({ id: rejectId, workerType: rejectWorkerType, reason: rejectReason || undefined })}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}