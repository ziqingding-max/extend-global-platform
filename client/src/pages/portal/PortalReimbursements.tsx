/**
 * Portal Reimbursements Page
 *
 * Dedicated page for expense reimbursement claims.
 * Supports create, edit, delete, and client approve/reject workflow.
 */
import { useState } from "react";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { usePortalAuth } from "@/hooks/usePortalAuth";
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
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2,
  Upload, Loader2, Receipt, ExternalLink, CheckCircle2, XCircle,
  FileText, Download,
} from "lucide-react";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csvExport";
import { MonthPicker } from "@/components/DatePicker";
import CurrencySelect from "@/components/CurrencySelect";
import PortalPayrollCycleIndicator from "@/components/PortalPayrollCycleIndicator";

import { useI18n } from "@/lib/i18n";

const statusColors: Record<string, string> = {
  submitted: "bg-yellow-100 text-yellow-800 border-yellow-200",
  client_approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  client_rejected: "bg-red-100 text-red-800 border-red-200",
  admin_approved: "bg-green-100 text-green-800 border-green-200",
  admin_rejected: "bg-orange-100 text-orange-800 border-orange-200",
  locked: "bg-blue-100 text-blue-800 border-blue-200",
};

interface ReimbursementForm {
  employeeId: number | null;
  category: string;
  amount: string;
  currency: string;
  effectiveMonth: string;
  description: string;
  receiptFileUrl: string;
  receiptFileKey: string;
}

const emptyForm: ReimbursementForm = {
  employeeId: null,
  category: "",
  amount: "",
  currency: "USD",
  effectiveMonth: new Date().toISOString().slice(0, 7),
  description: "",
  receiptFileUrl: "",
  receiptFileKey: "",
};

export default function PortalReimbursements() {
  const { t } = useI18n();
  const { user } = usePortalAuth();
  const isHrOrAdmin = user && ["admin", "hr_manager"].includes(user.portalRole);

  const statusLabels: Record<string, string> = {
    submitted: t("portal_reimbursements.status.pending_review"),
    client_approved: t("portal_reimbursements.status.approved"),
    client_rejected: t("portal_reimbursements.status.rejected"),
    admin_approved: t("portal_reimbursements.status.confirmed"),
    admin_rejected: t("portal_reimbursements.status.admin_rejected"),
    locked: t("portal_reimbursements.status.locked"),
  };

  const categoryOptions = [
    { value: "travel", label: t("portal_reimbursements.category.travel") },
    { value: "equipment", label: t("portal_reimbursements.category.equipment") },
    { value: "meals", label: t("portal_reimbursements.category.meals") },
    { value: "transportation", label: t("portal_reimbursements.category.transportation") },
    { value: "medical", label: t("portal_reimbursements.category.medical") },
    { value: "education", label: t("portal_reimbursements.category.education") },
    { value: "office_supplies", label: t("portal_reimbursements.category.office_supplies") },
    { value: "communication", label: t("portal_reimbursements.category.communication") },
    { value: "other", label: t("portal_reimbursements.category.other") },
  ];

  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [form, setForm] = useState<ReimbursementForm>({ ...emptyForm });
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const utils = portalTrpc.useUtils();

  const { data, isLoading } = portalTrpc.reimbursements.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    pageSize,
  });

  const { data: empData } = portalTrpc.employees.list.useQuery({ page: 1, pageSize: 100 });
  const employees = empData?.items ?? [];

  const createMutation = portalTrpc.reimbursements.create.useMutation({
    onSuccess: () => {
      toast.success(t("portal_reimbursements.toast.claim_submitted"));
      setShowCreate(false);
      setForm({ ...emptyForm });
      utils.reimbursements.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = portalTrpc.reimbursements.update.useMutation({
    onSuccess: () => {
      toast.success(t("portal_reimbursements.toast.updated"));
      setEditingId(null);
      setForm({ ...emptyForm });
      utils.reimbursements.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = portalTrpc.reimbursements.delete.useMutation({
    onSuccess: () => {
      toast.success(t("portal_reimbursements.toast.deleted"));
      setDeleteId(null);
      utils.reimbursements.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const approveMutation = portalTrpc.reimbursements.approve.useMutation({
    onSuccess: () => {
      toast.success(t("portal_reimbursements.toast.approved"));
      utils.reimbursements.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rejectMutation = portalTrpc.reimbursements.reject.useMutation({
    onSuccess: () => {
      toast.success(t("portal_reimbursements.toast.rejected"));
      setRejectId(null);
      setRejectReason("");
      utils.reimbursements.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const uploadReceiptMutation = portalTrpc.reimbursements.uploadReceipt.useMutation({
    onSuccess: (data) => {
      setForm((prev) => ({ ...prev, receiptFileUrl: data.url, receiptFileKey: data.fileKey }));
      setUploadingReceipt(false);
      toast.success(t("portal_reimbursements.toast.receipt_uploaded"));
    },
    onError: (err: any) => {
      setUploadingReceipt(false);
      toast.error(err.message);
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t("portal_reimbursements.toast.error.file_size_limit"));
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
    if (!form.employeeId || !form.category || !form.amount || !form.effectiveMonth) {
      toast.error(t("portal_reimbursements.toast.error.required_fields"));
      return;
    }
    if (!form.receiptFileUrl) {
      toast.error(t("portal_reimbursements.toast.error.receipt_required"));
      return;
    }
    createMutation.mutate({
      employeeId: form.employeeId,
      category: form.category as any,
      amount: form.amount,
      currency: form.currency,
      effectiveMonth: form.effectiveMonth,
      description: form.description || undefined,
      receiptFileUrl: form.receiptFileUrl,
      receiptFileKey: form.receiptFileKey || undefined,
    });
  }

  function handleUpdate() {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      amount: form.amount || undefined,
      description: form.description || undefined,
      receiptFileUrl: form.receiptFileUrl || undefined,
      receiptFileKey: form.receiptFileKey || undefined,
    });
  }

  function openEdit(reimb: any) {
    setEditingId(reimb.id);
    setForm({
      employeeId: reimb.employeeId,
      category: reimb.category || "",
      amount: reimb.amount,
      currency: reimb.currency,
      effectiveMonth: reimb.effectiveMonth ? reimb.effectiveMonth.slice(0, 7) : "",
      description: reimb.description || "",
      receiptFileUrl: reimb.receiptFileUrl || "",
      receiptFileKey: "",
    });
  }

  const isFormOpen = showCreate || editingId !== null;

  return (
    <PortalLayout title={t("portal_reimbursements.title")}>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("portal_reimbursements.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("portal_reimbursements.description")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={items.length === 0}
              onClick={() => {
                exportToCsv(items, [
                  { header: t("portal_reimbursements.table.header.employee"), accessor: (r: any) => r.employeeName || "" },
                  { header: t("portal_reimbursements.table.header.description"), accessor: (r: any) => r.description || "" },
                  { header: t("portal_reimbursements.table.header.category"), accessor: (r: any) => r.category || "" },
                  { header: t("portal_reimbursements.table.header.amount"), accessor: (r: any) => r.amount || 0 },
                  { header: t("portal_reimbursements.table.header.currency"), accessor: (r: any) => r.currency || "" },
                  { header: "Expense Date", accessor: (r: any) => r.expenseDate ? new Date(r.expenseDate).toLocaleDateString() : "" },
                  { header: t("portal_reimbursements.table.header.status"), accessor: (r: any) => r.status || "" },
                ], `reimbursements-${new Date().toISOString().slice(0, 10)}.csv`);
              }}
            >
              <Download className="w-4 h-4 mr-1" /> {t("portal_reimbursements.button.export_csv")}
            </Button>
            {isHrOrAdmin && (
              <Button onClick={() => { setForm({ ...emptyForm }); setShowCreate(true); }}>
                <Plus className="w-4 h-4 mr-2" /> {t("portal_reimbursements.button.new_reimbursement")}
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("portal_reimbursements.filters.all_statuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("portal_reimbursements.filters.all_statuses")}</SelectItem>
              <SelectItem value="submitted">{t("portal_reimbursements.status.pending_review")}</SelectItem>
              <SelectItem value="client_approved">{t("portal_reimbursements.status.approved")}</SelectItem>
              <SelectItem value="client_rejected">{t("portal_reimbursements.status.rejected")}</SelectItem>
              <SelectItem value="admin_approved">{t("portal_reimbursements.status.confirmed")}</SelectItem>
              <SelectItem value="admin_rejected">{t("portal_reimbursements.status.admin_rejected")}</SelectItem>
              <SelectItem value="locked">{t("portal_reimbursements.status.locked")}</SelectItem>
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
                <FileText className="w-10 h-10 mb-3" />
                <p className="text-lg font-medium">{t("portal_reimbursements.empty.title")}</p>
                <p className="text-sm mt-1">{t("portal_reimbursements.empty.hint")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("portal_reimbursements.table.header.employee")}</TableHead>
                    <TableHead>{t("portal_reimbursements.table.header.category")}</TableHead>
                    <TableHead>{t("portal_reimbursements.form.label.effective_month")}</TableHead>
                    <TableHead className="text-right">{t("portal_reimbursements.table.header.amount")}</TableHead>
                    <TableHead>{t("portal_reimbursements.table.header.status")}</TableHead>
                    <TableHead>{t("portal_reimbursements.form.label.receipt")}</TableHead>
                    <TableHead className="text-right">{t("portal_reimbursements.table.header.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((reimb: any) => (
                    <TableRow key={reimb.id}>
                      <TableCell className="font-medium">
                        {reimb.employeeFirstName} {reimb.employeeLastName}
                      </TableCell>
                      <TableCell className="capitalize text-sm">
                        {categoryOptions.find(c => c.value === reimb.category)?.label || reimb.category?.replace(/_/g, " ") || "-"}
                      </TableCell>
                      <TableCell>
                        {reimb.effectiveMonth
                          ? new Date(reimb.effectiveMonth + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short" })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {reimb.amount != null
                          ? `${reimb.currency || ""} ${Number(reimb.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[reimb.status] || ""}>
                          {statusLabels[reimb.status] || reimb.status}
                        </Badge>
                        {reimb.clientRejectionReason && reimb.status === "client_rejected" && (
                          <p className="text-xs text-red-600 mt-1 max-w-[200px] truncate" title={reimb.clientRejectionReason}>
                            {reimb.clientRejectionReason}
                          </p>
                        )}
                        {reimb.adminRejectionReason && reimb.status === "admin_rejected" && (
                          <p className="text-xs text-orange-600 mt-1 max-w-[200px] truncate" title={reimb.adminRejectionReason}>
                            {reimb.adminRejectionReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {reimb.receiptFileUrl ? (
                          <a href={reimb.receiptFileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Approve / Reject buttons for submitted items */}
                          {reimb.status === "submitted" && isHrOrAdmin && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => approveMutation.mutate({ id: reimb.id })}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => { setRejectId(reimb.id); setRejectReason(""); }}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {/* Edit / Delete for submitted items */}
                          {reimb.status === "submitted" && isHrOrAdmin && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(reimb)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(reimb.id)}>
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
            <DialogTitle>{editingId ? t("portal_reimbursements.dialog.edit.title") : t("portal_reimbursements.dialog.create.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Payroll Cycle Indicator — matches Admin experience */}
            <PortalPayrollCycleIndicator month={form.effectiveMonth || undefined} label="Reimbursements" />
            {!editingId && (
              <>
                <div className="space-y-2">
                  <Label>{t("portal_reimbursements.table.header.employee")} <span className="text-destructive">*</span></Label>
                  <Select value={form.employeeId ? String(form.employeeId) : ""} onValueChange={(v) => {
                    const empId = Number(v);
                    const selectedEmp = employees.find((e: any) => e.id === empId);
                    setForm((f) => ({ ...f, employeeId: empId, currency: selectedEmp?.salaryCurrency || f.currency }));
                  }}>
                    <SelectTrigger><SelectValue placeholder={t("portal_reimbursements.placeholder.select_employee")} /></SelectTrigger>
                    <SelectContent>
                      {employees.map((emp: any) => (
                        <SelectItem key={emp.id} value={String(emp.id)}>
                          {emp.firstName} {emp.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("portal_reimbursements.table.header.category")} <span className="text-destructive">*</span></Label>
                    <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                      <SelectTrigger><SelectValue placeholder={t("portal_reimbursements.placeholder.select_category")} /></SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("portal_reimbursements.form.label.effective_month")} <span className="text-destructive">*</span></Label>
                    <MonthPicker
                      value={form.effectiveMonth}
                      onChange={(v) => setForm((f) => ({ ...f, effectiveMonth: v }))}
                      placeholder={t("portal_reimbursements.placeholder.select_month")}
                    />
                  </div>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("portal_reimbursements.table.header.amount")} <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>{t("portal_reimbursements.table.header.currency")}</Label>
                <Input value={form.currency} readOnly disabled className="bg-muted" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("portal_reimbursements.table.header.description")}</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={t("portal_reimbursements.placeholder.describe_expense")} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t("portal_reimbursements.form.label.receipt")} <span className="text-destructive">*</span></Label>
              {form.receiptFileUrl ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <a href={form.receiptFileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">
                    {t("portal_reimbursements.button.view_receipt")}
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
                      {uploadingReceipt ? t("portal_reimbursements.button.uploading") : t("portal_reimbursements.button.upload_receipt")}
                    </span>
                  </Button>
                </label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditingId(null); setForm({ ...emptyForm }); }}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? t("portal_reimbursements.button.save_changes") : t("portal_reimbursements.button.submit_claim")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("portal_reimbursements.delete_dialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("portal_reimbursements.delete_dialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={rejectId !== null} onOpenChange={(open) => { if (!open) { setRejectId(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("portal_reimbursements.reject_dialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("portal_reimbursements.reject_dialog.label.reason")}</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t("portal_reimbursements.placeholder.reject_reason")}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectReason(""); }}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => rejectId && rejectMutation.mutate({ id: rejectId, reason: rejectReason || undefined })}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("common.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
