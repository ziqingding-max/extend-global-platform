
/**
 * EG Admin — Reimbursements
 * Manage employee reimbursement claims with approval workflow
 */
import Layout from "@/components/Layout";
import { formatMonth, formatAmount, countryName } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus, Search, Pencil, Trash2, Lock, Upload, Eye, ExternalLink,
  CheckCircle2, XCircle, Receipt, Loader2, Download, Paperclip, FileText, X
} from "lucide-react";
import { toast } from "sonner";
import EmployeeSelector from "@/components/EmployeeSelector";
import { MonthPicker } from "@/components/DatePicker";
import { exportToCsv } from "@/lib/csvExport";
import PayrollCycleIndicator from "@/components/PayrollCycleIndicator";

import { useI18n } from "@/lib/i18n";

const statusColors: Record<string, string> = {
  submitted: "bg-amber-50 text-amber-700 border-amber-200",
  client_approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  client_rejected: "bg-red-50 text-red-700 border-red-200",
  admin_approved: "bg-green-50 text-green-700 border-green-200",
  admin_rejected: "bg-orange-50 text-orange-700 border-orange-200",
  locked: "bg-blue-50 text-blue-700 border-blue-200",
};

const CATEGORIES = [
  "travel",
  "equipment",
  "meals",
  "transportation",
  "medical",
  "education",
  "office_supplies",
  "communication",
  "other",
];

export default function Reimbursements() {
  const { t, lang } = useI18n();
  const [viewTab, setViewTab] = useState<string>("active");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewItem, setViewItem] = useState<any>(null);

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = -3; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      options.push({ value, label: d.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long" }) });
    }
    return options;
  }, [lang]);

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data, isLoading, refetch } = trpc.reimbursements.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    effectiveMonth: monthFilter !== "all" ? monthFilter : undefined,
    limit: 200,
    offset: 0,
  });

  const { data: employeesData } = trpc.employees.list.useQuery({ limit: 500, offset: 0 });
  const employeesList = employeesData?.data || [];
  const employeeMap = useMemo(() => {
    const m = new Map<number, any>();
    employeesList.forEach((e: any) => m.set(e.id, e));
    return m;
  }, [employeesList]);

  const [formData, setFormData] = useState({
    employeeId: 0,
    category: "travel" as string,
    description: "",
    amount: "",
    effectiveMonth: defaultMonth,
    receiptFileUrl: "",
    receiptFileKey: "",
  });

  const createMutation = trpc.reimbursements.create.useMutation({
    onSuccess: () => {
      toast.success(t("reimbursements.toast.createSuccess"));
      setShowCreate(false);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = trpc.reimbursements.update.useMutation({
    onSuccess: () => {
      toast.success(t("reimbursements.toast.updateSuccess"));
      setEditingId(null);
      setShowCreate(false);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = trpc.reimbursements.delete.useMutation({
    onSuccess: () => {
      toast.success(t("reimbursements.toast.deleteSuccess"));
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const adminApproveMutation = trpc.reimbursements.adminApprove.useMutation({
    onSuccess: () => {
      toast.success(t("reimbursements.toast.approveSuccess"));
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const adminRejectMutation = trpc.reimbursements.adminReject.useMutation({
    onSuccess: () => {
      toast.success(t("reimbursements.toast.rejectSuccess"));
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const uploadReceiptMutation = trpc.reimbursements.uploadReceipt.useMutation({
    onSuccess: (data) => {
      setFormData((prev) => ({ ...prev, receiptFileUrl: data.url, receiptFileKey: data.fileKey }));
      toast.success(t("reimbursements.toast.uploadSuccess"));
    },
    onError: (err: any) => toast.error(err.message),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t("reimbursements.toast.fileTooLarge"));
      return;
    }
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
  };

  const items = useMemo(() => {
    let list = data?.data || [];
    // Added admin_rejected to history statuses so they don't clutter the Active tab
    const historyStatuses = ["locked", "admin_approved", "admin_rejected"];
    if (viewTab === "active") {
      list = list.filter((r: any) => !historyStatuses.includes(r.status));
    } else {
      list = list.filter((r: any) => historyStatuses.includes(r.status));
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((r: any) => {
        const emp = employeeMap.get(r.employeeId);
        const name = emp ? `${emp.firstName} ${emp.lastName}`.toLowerCase() : "";
        return name.includes(s) || (r.description || "").toLowerCase().includes(s);
      });
    }
    return list;
  }, [data, viewTab, search, employeeMap]);

  function handleCreate() {
    if (!formData.employeeId || !formData.amount) {
      toast.error(t("reimbursements.toast.missingFields"));
      return;
    }
    if (!formData.receiptFileUrl) {
      toast.error(t("reimbursements.toast.missingReceipt"));
      return;
    }
    createMutation.mutate({
      employeeId: formData.employeeId,
      category: formData.category as any,
      description: formData.description || undefined,
      amount: formData.amount,
      effectiveMonth: formData.effectiveMonth,
      receiptFileUrl: formData.receiptFileUrl || undefined,
      receiptFileKey: formData.receiptFileKey || undefined,
    });
  }

  function handleUpdate() {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      data: {
        category: formData.category as any,
        description: formData.description || undefined,
        amount: formData.amount,
        receiptFileUrl: formData.receiptFileUrl || null,
        receiptFileKey: formData.receiptFileKey || null,
      },
    });
  }

  function handleEdit(item: any) {
    try {
      setEditingId(item.id);
      
      let effMonth = defaultMonth;
      if (item.effectiveMonth) {
        // Safe parsing: check if it's a valid date string first
        const d = new Date(item.effectiveMonth);
        if (!isNaN(d.getTime())) {
          effMonth = d.toISOString().slice(0, 7);
        }
      }

      setFormData({
        employeeId: item.employeeId,
        category: item.category || "other",
        description: item.description || "",
        amount: item.amount || "",
        effectiveMonth: effMonth,
        receiptFileUrl: item.receiptFileUrl || "",
        receiptFileKey: item.receiptFileKey || "",
      });
      setShowCreate(true);
    } catch (e) {
      console.error("Error editing reimbursement:", e);
      toast.error("Failed to load reimbursement for editing");
    }
  }

  function handleDelete(id: number) {
    if (confirm("Delete this reimbursement?")) {
      deleteMutation.mutate({ id });
    }
  }

  function resetForm() {
    setFormData({
      employeeId: 0,
      category: "travel",
      description: "",
      amount: "",
      effectiveMonth: defaultMonth,
      receiptFileUrl: "",
      receiptFileKey: "",
    });
    setEditingId(null);
    setShowCreate(false);
  }

  // Receipt Upload UI Component
  const ReceiptUploadSection = () => (
    <div className="space-y-2">
      <Label className="flex items-center gap-1">
        <Paperclip className="w-3.5 h-3.5" />
        {t("reimbursements.dialog.field.receipt")} <span className="text-destructive">*</span>
      </Label>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileUpload}
      />
      {formData.receiptFileUrl ? (
        <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-md text-sm">
          <FileText className="w-4 h-4 text-emerald-600" />
          <span className="flex-1 truncate text-emerald-700">Receipt Uploaded</span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => window.open(formData.receiptFileUrl, "_blank")}>
            <Eye className="w-3.5 h-3.5 mr-1" /> View
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFormData((f) => ({ ...f, receiptFileUrl: "", receiptFileKey: "" }))}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadReceiptMutation.isPending}
        >
          {uploadReceiptMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          {t("reimbursements.dialog.action.uploadReceipt")}
        </Button>
      )}
    </div>
  );

  return (
    <Layout breadcrumb={["EG", t("nav.operations"), t("nav.reimbursements")]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("reimbursements.header.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("reimbursements.header.description")}
            </p>
          </div>
          <div className="flex gap-4">
              <PayrollCycleIndicator compact label="Reimbursements" />
              <Button variant="outline" disabled={items.length === 0} onClick={() => {
                exportToCsv(items, [
                  { header: "Employee", accessor: (r: any) => { const emp = employeeMap.get(r.employeeId); return emp ? `${emp.firstName} ${emp.lastName}` : `#${r.employeeId}`; } },
                  { header: "Category", accessor: (r: any) => t(`reimbursements.category.${r.category}`) || r.category || "" },
                  { header: "Amount", accessor: (r: any) => r.amount },
                  { header: "Currency", accessor: (r: any) => r.currency },
                  { header: "Effective Month", accessor: (r: any) => r.effectiveMonth ? new Date(r.effectiveMonth).toISOString().slice(0, 7) : "" },
                  { header: "Description", accessor: (r: any) => r.description || "" },
                  { header: "Status", accessor: (r: any) => t(`reimbursements.status.${r.status}`) || r.status },
                  { header: "Created", accessor: (r: any) => r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "" },
                ], `reimbursements-export-${new Date().toISOString().slice(0, 10)}.csv`);
                toast.success("CSV exported successfully");
              }}>
                <Download className="w-4 h-4 mr-2" />{t("common.export")}
              </Button>
              <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" /> {t("reimbursements.actions.new")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingId ? t("reimbursements.dialog.title.edit") : t("reimbursements.dialog.title.new")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2 mt-4">
                    {!editingId && (
                      <div className="space-y-2">
                        <Label>{t("reimbursements.dialog.field.employee")} <span className="text-destructive">*</span></Label>
                        <EmployeeSelector
                          value={formData.employeeId}
                          onValueChange={(v) => setFormData((f) => ({ ...f, employeeId: v }))}
                        />
                      </div>
                    )}

                    {(() => {
                      const selectedEmp = formData.employeeId ? employeeMap.get(formData.employeeId) : null;
                      const currency = selectedEmp?.salaryCurrency || "USD";
                      return selectedEmp ? (
                        <p className="text-xs text-muted-foreground">
                          Currency: <strong>{currency}</strong>
                        </p>
                      ) : null;
                    })()}
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t("reimbursements.dialog.field.category")}</Label>
                        <Select value={formData.category} onValueChange={(v) => setFormData((f) => ({ ...f, category: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>{t(`reimbursements.category.${c}`)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("reimbursements.dialog.field.amount")} <span className="text-destructive">*</span></Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.amount}
                          onChange={(e) => setFormData((f) => ({ ...f, amount: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{t("reimbursements.dialog.field.effectiveMonth")}</Label>
                      <MonthPicker
                        value={formData.effectiveMonth}
                        onChange={(v) => setFormData((f) => ({ ...f, effectiveMonth: v }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t("reimbursements.table.header.description")}</Label>
                      <Textarea
                        value={formData.description}
                        onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Description of the expense..."
                        rows={2}
                      />
                    </div>

                    <ReceiptUploadSection />

                    {formData.effectiveMonth && (
                      <PayrollCycleIndicator month={formData.effectiveMonth} label="Reimbursements" />
                    )}
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Button variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
                    <Button
                      onClick={editingId ? handleUpdate : handleCreate}
                      disabled={createMutation.isPending || updateMutation.isPending}
                    >
                      {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {editingId ? t("reimbursements.dialog.action.save") : t("reimbursements.dialog.action.submit")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
          </div>
        </div>

        {/* Tabs & Filters */}
        <Tabs value={viewTab} onValueChange={(v) => { setViewTab(v); setStatusFilter("all"); }} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="active">{t("reimbursements.tabs.active")}</TabsTrigger>
              <TabsTrigger value="history">{t("reimbursements.tabs.history")}</TabsTrigger>
            </TabsList>
        </Tabs>

        <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("reimbursements.filters.searchPlaceholder")}
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {viewTab === "active" && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("reimbursements.table.header.status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("reimbursements.filters.allStatuses")}</SelectItem>
                  <SelectItem value="submitted">{t("reimbursements.status.submitted")}</SelectItem>
                  <SelectItem value="admin_approved">{t("reimbursements.status.admin_approved")}</SelectItem>
                  <SelectItem value="admin_rejected">{t("reimbursements.status.admin_rejected")}</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("reimbursements.dialog.field.category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("reimbursements.filters.allCategories")}</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{t(`reimbursements.category.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("reimbursements.table.header.month")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("reimbursements.filters.allMonths")}</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reimbursements.table.header.employee")}</TableHead>
                    <TableHead>{t("reimbursements.dialog.field.category")}</TableHead>
                    <TableHead>{t("reimbursements.table.header.amount")}</TableHead>
                    <TableHead>{t("reimbursements.table.header.month")}</TableHead>
                    <TableHead>{t("reimbursements.table.header.status")}</TableHead>
                    <TableHead>{t("reimbursements.dialog.field.receipt")}</TableHead>
                    <TableHead>{t("reimbursements.table.header.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length > 0 ? (
                    items.map((item: any) => {
                      const emp = employeeMap.get(item.employeeId);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-sm">
                            {emp ? `${emp.firstName} ${emp.lastName}` : `#${item.employeeId}`}
                          </TableCell>
                          <TableCell className="capitalize text-sm">{t(`reimbursements.category.${item.category}`)}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.currency || ""} {Number(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.effectiveMonth ? formatMonth(item.effectiveMonth) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${statusColors[item.status] || ""}`}>
                              {item.status === "locked" && <Lock className="w-3 h-3 mr-1 inline" />}
                              {t(`reimbursements.status.${item.status}`) || item.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {item.receiptFileUrl ? (
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => window.open(item.receiptFileUrl!, "_blank")}>
                                <Paperclip className="w-3 h-3 mr-1" /> View
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {item.status === "client_approved" && (
                                <>
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                    onClick={() => adminApproveMutation.mutate({ id: item.id })}
                                    disabled={adminApproveMutation.isPending}
                                    title="Admin Approve"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                    onClick={() => adminRejectMutation.mutate({ id: item.id })}
                                    disabled={adminRejectMutation.isPending}
                                    title="Admin Reject"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                  </Button>
                                </>)}
                              {(item.status === "submitted" || item.status === "client_approved") && (
                                <>
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    onClick={() => handleEdit(item)}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleDelete(item.id)}
                                    disabled={deleteMutation.isPending}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7"
                                onClick={() => setViewItem(item)}
                                title="View details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <Receipt className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">{t("reimbursements.empty.title")}</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* View Detail Dialog */}
      <Dialog open={!!viewItem} onOpenChange={(open) => { if (!open) setViewItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("reimbursements.view.title")}</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-4 py-2 mt-2">
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-sm font-medium">
                  {(() => {
                    const emp = employeeMap.get(viewItem.employeeId);
                    return emp ? `${emp.firstName} ${emp.lastName}` : `#${viewItem.employeeId}`;
                  })()}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                   {(() => {
                    const emp = employeeMap.get(viewItem.employeeId);
                    return emp ? `${countryName(emp.country)}` : "";
                  })()}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("reimbursements.dialog.field.category")}</Label>
                  <p className="text-sm capitalize">{t(`reimbursements.category.${viewItem.category}`)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("reimbursements.table.header.status")}</Label>
                  <Badge variant="outline" className={`text-xs ${statusColors[viewItem.status] || ''}`}>
                    {viewItem.status === 'locked' && <Lock className="w-3 h-3 mr-1 inline" />}
                    {t(`reimbursements.status.${viewItem.status}`) || viewItem.status}
                  </Badge>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("reimbursements.table.header.amount")}</Label>
                  <p className="text-sm font-mono font-semibold">
                    {viewItem.currency || ""} {Number(viewItem.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("reimbursements.dialog.field.effectiveMonth")}</Label>
                  <p className="text-sm">{viewItem.effectiveMonth ? formatMonth(viewItem.effectiveMonth) : "—"}</p>
                </div>
              </div>

              {viewItem.description && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("reimbursements.table.header.description")}</Label>
                  <p className="text-sm text-muted-foreground">{viewItem.description}</p>
                </div>
              )}

              {viewItem.receiptFileUrl && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("reimbursements.dialog.field.receipt")}</Label>
                  <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={() => window.open(viewItem.receiptFileUrl!, '_blank')}>
                    <Paperclip className="w-3 h-3 mr-1" /> View Receipt
                  </Button>
                </div>
              )}
              
              <div className="flex justify-end pt-2">
                 <Button variant="outline" onClick={() => setViewItem(null)}>{t("common.close") || "Close"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
