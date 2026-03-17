
/*
 * GEA Admin — Adjustments (异动薪酬)
 * Manage bonuses, allowances, reimbursements, and deductions
 * Supports both Employees (EOR) and Contractors (AOR)
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { ArrowUpDown, Plus, Search, Pencil, Trash2, Lock, Upload, FileText, X, Paperclip, Eye, CheckCircle2, XCircle, Download, Briefcase, User, Loader2 } from "lucide-react";
import { toast } from "sonner";
import WorkerSelector from "@/components/WorkerSelector";
import PayrollCycleIndicator from "@/components/PayrollCycleIndicator";
import { MonthPicker } from "@/components/DatePicker";
import { exportToCsv } from "@/lib/csvExport";

import { useI18n } from "@/lib/i18n";

const statusColors: Record<string, string> = {
  submitted: "bg-amber-50 text-amber-700 border-amber-200",
  client_approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  client_rejected: "bg-red-50 text-red-700 border-red-200",
  admin_approved: "bg-green-50 text-green-700 border-green-200",
  admin_rejected: "bg-orange-50 text-orange-700 border-orange-200",
  locked: "bg-blue-50 text-blue-700 border-blue-200",
  // Contractor statuses
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-orange-50 text-orange-700 border-orange-200",
  invoiced: "bg-blue-50 text-blue-700 border-blue-200",
};

const typeColors: Record<string, string> = {
  bonus: "bg-emerald-50 text-emerald-700",
  allowance: "bg-blue-50 text-blue-700",
  deduction: "bg-red-50 text-red-700",
  other: "bg-gray-50 text-gray-700",
  expense: "bg-purple-50 text-purple-700",
};

const CATEGORIES = [
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

export default function Adjustments() {
  const { t, lang } = useI18n();
  const [viewTab, setViewTab] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingAdj, setEditingAdj] = useState<any>(null);
  const [viewAdj, setViewAdj] = useState<any>(null);

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = -3; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { month: "long", year: "numeric" });
      options.push({ value, label });
    }
    return options;
  }, [lang]);

  // Fetch Employee Adjustments
  const { data: employeeAdjustmentsData, isLoading: isLoadingEmployees, refetch: refetchEmployees } = trpc.adjustments.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    adjustmentType: typeFilter !== "all" ? typeFilter : undefined,
    effectiveMonth: monthFilter !== "all" ? monthFilter : undefined,
    limit: 100,
  });

  // Fetch Contractor Adjustments
  const { data: contractorAdjustmentsData, isLoading: isLoadingContractors, refetch: refetchContractors } = trpc.contractors.adjustments.listAll.useQuery({
    customerId: customerFilter !== "all" ? parseInt(customerFilter) : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: search || undefined,
  });

  const refetch = () => {
    refetchEmployees();
    refetchContractors();
  };

  // Fetch workers for lookup
  const { data: employeesData } = trpc.employees.list.useQuery({ limit: 500 });
  const employeesList = employeesData?.data || [];
  
  const { data: contractorsData } = trpc.contractors.list.useQuery({ limit: 500 });
  const contractorsList = contractorsData?.data || [];

  const { data: customersData } = trpc.customers.list.useQuery({ limit: 200 });
  const customersList = customersData?.data || [];

  // Build worker lookup map
  const workerMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const emp of employeesList) {
      map.set(`emp-${emp.id}`, { ...emp, type: "employee" });
    }
    for (const con of contractorsList) {
      map.set(`con-${con.id}`, { ...con, type: "contractor" });
    }
    return map;
  }, [employeesList, contractorsList]);

  // Employee Mutations
  const createEmployeeMutation = trpc.adjustments.create.useMutation({
    onSuccess: () => { toast.success(t("adjustments.toast.submitSuccess")); setCreateOpen(false); setReceiptFile(null); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const updateEmployeeMutation = trpc.adjustments.update.useMutation({
    onSuccess: () => { toast.success(t("adjustments.toast.updateSuccess")); setEditOpen(false); setEditingAdj(null); setEditReceiptFile(null); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteEmployeeMutation = trpc.adjustments.delete.useMutation({
    onSuccess: () => { toast.success(t("adjustments.toast.deleteSuccess")); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const adminApproveEmployeeMutation = trpc.adjustments.adminApprove.useMutation({
    onSuccess: () => { toast.success(t("adjustments.toast.approveSuccess")); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const adminRejectEmployeeMutation = trpc.adjustments.adminReject.useMutation({
    onSuccess: () => { toast.success(t("adjustments.toast.rejectSuccess")); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const bulkApproveEmployeeMutation = trpc.adjustments.bulkAdminApprove.useMutation({
    onSuccess: (result) => {
      toast.success(`Approved ${result.approvedCount} adjustments${result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : ""}`);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const uploadReceiptMutation = trpc.adjustments.uploadReceipt.useMutation({
    onError: (err) => toast.error(err.message),
  });

  // Contractor Mutations
  const createContractorMutation = trpc.contractors.adjustments.create.useMutation({
    onSuccess: () => { toast.success(t("adjustments.toast.submitSuccess")); setCreateOpen(false); setReceiptFile(null); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const updateContractorMutation = trpc.contractors.adjustments.update.useMutation({
    onSuccess: () => { toast.success(t("adjustments.toast.updateSuccess")); setEditOpen(false); setEditingAdj(null); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteContractorMutation = trpc.contractors.adjustments.delete.useMutation({
    onSuccess: () => { toast.success(t("adjustments.toast.deleteSuccess")); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [formData, setFormData] = useState({
    workerId: "", // "emp-123" or "con-456"
    adjustmentType: "bonus",
    category: "",
    description: "",
    amount: "",
    effectiveMonth: defaultMonth,
  });

  const [editFormData, setEditFormData] = useState({
    adjustmentType: "bonus",
    category: "",
    description: "",
    amount: "",
    effectiveMonth: "",
  });

  // Receipt file state
  const [receiptFile, setReceiptFile] = useState<{ file: File, base64: string } | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [editReceiptFile, setEditReceiptFile] = useState<{ file: File, base64: string } | null>(null);
  const editReceiptInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Auto-fill currency
  const selectedWorker = formData.workerId ? workerMap.get(formData.workerId) : null;
  const autoCurrency = selectedWorker?.salaryCurrency || selectedWorker?.currency || "USD";

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t("adjustments.toast.fileTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      if (isEdit) {
        setEditReceiptFile({ file, base64 });
      } else {
        setReceiptFile({ file, base64 });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (!formData.workerId || !formData.amount) {
      toast.error(t("adjustments.toast.requiredFields"));
      return;
    }

    const [prefix, idStr] = formData.workerId.split("-");
    const id = parseInt(idStr);
    const isEmployee = prefix === "emp";

    setIsUploading(true);
    try {
      if (isEmployee) {
        let receiptFileUrl;
        let receiptFileKey;
        if (receiptFile) {
          const uploadResult = await uploadReceiptMutation.mutateAsync({
            fileBase64: receiptFile.base64,
            fileName: receiptFile.file.name,
            mimeType: receiptFile.file.type || "application/octet-stream",
          });
          receiptFileUrl = uploadResult.url;
          receiptFileKey = uploadResult.fileKey;
        }

        createEmployeeMutation.mutate({
          employeeId: id,
          adjustmentType: formData.adjustmentType as any,
          category: (formData.category || undefined) as any,
          description: formData.description || undefined,
          amount: formData.amount,
          effectiveMonth: formData.effectiveMonth,
          receiptFileUrl,
          receiptFileKey,
        });
      } else {
        // Contractor
        // Note: Contractors use 'date' instead of 'effectiveMonth', and type/category mapping might differ
        // For now, we map effectiveMonth to date (first day of month)
        const date = `${formData.effectiveMonth}-01`;
        
        // Upload attachment if possible (contractor API supports attachmentUrl)
        // We reuse the same upload endpoint for convenience, or skip if backend doesn't support S3 for contractors yet?
        // Contractor create schema has attachmentUrl.
        let attachmentUrl;
        if (receiptFile) {
           const uploadResult = await uploadReceiptMutation.mutateAsync({
            fileBase64: receiptFile.base64,
            fileName: receiptFile.file.name,
            mimeType: receiptFile.file.type || "application/octet-stream",
          });
          attachmentUrl = uploadResult.url;
        }

        // Map adjustmentType: "bonus", "allowance", "deduction", "other" -> "bonus", "expense", "deduction"
        let type: "bonus" | "expense" | "deduction" = "bonus";
        if (formData.adjustmentType === "deduction") type = "deduction";
        else if (formData.adjustmentType === "other" || formData.adjustmentType === "allowance") type = "expense"; // Map allowance/other to expense for contractors? Or bonus?
        // Let's map allowance to bonus for now, or keep it consistent if backend allows.
        // Backend allows: bonus, expense, deduction.
        if (formData.adjustmentType === "allowance") type = "bonus"; 

        createContractorMutation.mutate({
          contractorId: id,
          type: type,
          description: formData.description || formData.category || "Adjustment",
          amount: formData.amount,
          currency: autoCurrency,
          date: date,
          attachmentUrl,
        });
      }
    } catch {
      // Error handled
    } finally {
      setIsUploading(false);
    }
  };

  const handleEdit = (adj: any) => {
    setEditingAdj(adj);
    const isEmployee = adj.workerType === "employee";
    
    let effMonth = "";
    try {
      if (isEmployee) {
        effMonth = adj.effectiveMonth ? new Date(adj.effectiveMonth).toISOString().slice(0, 7) : defaultMonth;
      } else {
        effMonth = adj.date ? new Date(adj.date).toISOString().slice(0, 7) : defaultMonth;
      }
    } catch (e) {
      console.error("Invalid date in adjustment:", e);
      effMonth = defaultMonth;
    }

    setEditFormData({
      adjustmentType: adj.adjustmentType, // For contractor, this comes normalized
      category: adj.category || "",
      description: adj.description || "",
      amount: adj.amount?.toString() || "",
      effectiveMonth: effMonth,
    });
    setEditReceiptFile(null);
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingAdj) return;
    const isEmployee = editingAdj.workerType === "employee";

    setIsUploading(true);
    try {
      if (isEmployee) {
        let receiptFileUrl;
        let receiptFileKey;
        if (editReceiptFile) {
          const uploadResult = await uploadReceiptMutation.mutateAsync({
            fileBase64: editReceiptFile.base64,
            fileName: editReceiptFile.file.name,
            mimeType: editReceiptFile.file.type || "application/octet-stream",
          });
          receiptFileUrl = uploadResult.url;
          receiptFileKey = uploadResult.fileKey;
        }
        updateEmployeeMutation.mutate({
          id: editingAdj.id,
          data: {
            adjustmentType: editFormData.adjustmentType as any,
            category: (editFormData.category || undefined) as any,
            description: editFormData.description || undefined,
            amount: editFormData.amount,
            effectiveMonth: editFormData.effectiveMonth,
            ...(receiptFileUrl ? { receiptFileUrl, receiptFileKey } : {}),
          },
        });
      } else {
        // Contractor Update
        const date = `${editFormData.effectiveMonth}-01`;
        let type: "bonus" | "expense" | "deduction" = "bonus";
        if (editFormData.adjustmentType === "deduction") type = "deduction";
        else if (editFormData.adjustmentType === "other" || editFormData.adjustmentType === "allowance") type = "expense";
        
        updateContractorMutation.mutate({
          id: editingAdj.id,
          data: {
            type: type,
            description: editFormData.description || editFormData.category,
            amount: editFormData.amount,
            date: date,
          }
        });
      }
    } catch {
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (adj: any) => {
    if (confirm(t("adjustments.confirm.delete"))) {
      if (adj.workerType === "employee") {
        deleteEmployeeMutation.mutate({ id: adj.id });
      } else {
        deleteContractorMutation.mutate({ id: adj.id });
      }
    }
  };

  const handleApprove = (adj: any) => {
    if (adj.workerType === "employee") {
      adminApproveEmployeeMutation.mutate({ id: adj.id });
    } else {
      updateContractorMutation.mutate({ id: adj.id, data: { status: "approved" } });
    }
  };

  const handleReject = (adj: any) => {
    if (adj.workerType === "employee") {
      adminRejectEmployeeMutation.mutate({ id: adj.id });
    } else {
      updateContractorMutation.mutate({ id: adj.id, data: { status: "rejected" } });
    }
  };

  // Combine and normalize adjustments
  const combinedAdjustments = useMemo(() => {
    const empAdjs = (employeeAdjustmentsData?.data || []).map((a: any) => ({
      ...a,
      workerType: "employee",
      workerId: `emp-${a.employeeId}`,
      date: a.effectiveMonth // for sorting
    }));

    const conAdjs = (contractorAdjustmentsData || []).map((a: any) => ({
      ...a,
      workerType: "contractor",
      workerId: `con-${a.contractorId}`,
      adjustmentType: a.type, // Map type
      category: "other", // Contractors don't have detailed category yet
      effectiveMonth: a.date, // Map date to effectiveMonth for display
      receiptFileUrl: a.attachmentUrl,
      currency: a.currency || "USD" // Fallback
    }));

    const all = [...empAdjs, ...conAdjs];
    
    // Sort by date desc
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [employeeAdjustmentsData, contractorAdjustmentsData]);

  // Filter adjustments
  const filteredAdjustments = useMemo(() => {
    return combinedAdjustments.filter((adj) => {
      const worker = workerMap.get(adj.workerId);
      
      // Status filtering
      // Active tab: submitted, pending
      // History tab: approved, rejected, locked, invoiced
      const activeStatuses = ["submitted", "client_approved", "pending"];
      const historyStatuses = ["locked", "admin_approved", "admin_rejected", "approved", "rejected", "invoiced"];
      
      if (viewTab === "active" && !activeStatuses.includes(adj.status)) return false;
      if (viewTab === "history" && !historyStatuses.includes(adj.status)) return false;

      // Other filters
      if (customerFilter !== "all") {
        if (!worker || String(worker.customerId) !== customerFilter) return false;
      }
      if (countryFilter !== "all") {
        if (!worker || worker.country !== countryFilter) return false;
      }
      if (typeFilter !== "all" && adj.adjustmentType !== typeFilter) return false;
      
      // Search
      if (search) {
        const s = search.toLowerCase();
        const workerName = worker ? `${worker.firstName} ${worker.lastName}`.toLowerCase() : "";
        const desc = (adj.description || "").toLowerCase();
        if (!workerName.includes(s) && !desc.includes(s) && !adj.adjustmentType.includes(s)) return false;
      }
      
      return true;
    });
  }, [combinedAdjustments, viewTab, customerFilter, countryFilter, typeFilter, search, workerMap]);

  // Available countries for filter
  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    employeesList.forEach((e) => { if (e.country) set.add(e.country); });
    contractorsList.forEach((c) => { if (c.country) set.add(c.country); });
    return Array.from(set).sort();
  }, [employeesList, contractorsList]);

  // Receipt Upload UI
  const ReceiptUploadArea = ({ isEdit }: { isEdit: boolean }) => {
    const file = isEdit ? editReceiptFile : receiptFile;
    const inputRef = isEdit ? editReceiptInputRef : receiptInputRef;
    const existingUrl = isEdit && editingAdj?.receiptFileUrl ? editingAdj.receiptFileUrl : null;
    
    return (
      <div className="space-y-2">
        <Label className="flex items-center gap-1">
          <Paperclip className="w-3.5 h-3.5" />
          {t("adjustments.receipt.label")}
        </Label>
        {existingUrl && !file && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-sm">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1 truncate">{t("adjustments.receipt.existing")}</span>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => window.open(existingUrl, "_blank")}>
              <Eye className="w-3.5 h-3.5 mr-1" /> {t("adjustments.receipt.view")}
            </Button>
          </div>
        )}
        {file && (
          <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-md text-sm">
            <FileText className="w-4 h-4 text-emerald-600" />
            <span className="flex-1 truncate text-emerald-700" title={file.file.name}>{file.file.name}</span>
            <span className="text-xs text-emerald-600">{(file.file.size / 1024).toFixed(0)} KB</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
              if (isEdit) setEditReceiptFile(null);
              else setReceiptFile(null);
            }}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.gif,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx"
          onChange={(e) => handleReceiptSelect(e, isEdit)}
          className="hidden"
        />
        <Button
          variant="outline"
          size="sm"
          type="button"
          className="w-full"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-4 h-4 mr-2" />
          {file ? t("adjustments.receipt.replace") : existingUrl ? t("adjustments.receipt.upload_new") : t("adjustments.receipt.upload")}
        </Button>
      </div>
    );
  };

  const isLoading = isLoadingEmployees || isLoadingContractors;

  return (
    <Layout breadcrumb={["GEA", t("nav.operations"), t("nav.adjustments")]}>
      <div className="p-6 space-y-6 page-enter">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("adjustments.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("adjustments.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <PayrollCycleIndicator compact label="Adjustments" />
            <Button variant="outline" disabled={filteredAdjustments.length === 0} onClick={() => {
               exportToCsv(filteredAdjustments, [
                { header: "Worker Type", accessor: (r: any) => r.workerType },
                { header: "Type", accessor: (r: any) => t(`adjustments.type.${r.adjustmentType}`) || r.adjustmentType },
                { header: "Worker", accessor: (r: any) => { const w = workerMap.get(r.workerId); return w ? `${w.firstName} ${w.lastName}` : r.workerId; } },
                { header: "Amount", accessor: (r: any) => r.amount },
                { header: "Currency", accessor: (r: any) => r.currency },
                { header: "Month/Date", accessor: (r: any) => r.effectiveMonth ? new Date(r.effectiveMonth).toISOString().slice(0, 7) : "" },
                { header: "Status", accessor: (r: any) => r.status },
              ], `adjustments-export-${new Date().toISOString().slice(0, 10)}.csv`);
              toast.success("CSV exported successfully");
            }}>
              <Download className="w-4 h-4 mr-2" />{t("common.export")}
            </Button>
            <Dialog open={createOpen} onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) { setReceiptFile(null); }
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  {t("adjustments.button.new")}
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("adjustments.dialog.title.new")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <WorkerSelector
                  value={formData.workerId}
                  onValueChange={(id) => setFormData({ ...formData, workerId: id })}
                  showCustomerFilter={true}
                  required
                  label="Worker"
                  placeholder="Select employee or contractor"
                />
                
                {selectedWorker && (
                  <p className="text-xs text-muted-foreground">
                    Currency: <strong>{autoCurrency}</strong> · Customer: #{selectedWorker.customerId}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("adjustments.form.label.type")} *</Label>
                    <Select
                      value={formData.adjustmentType}
                      onValueChange={(v) => setFormData({ ...formData, adjustmentType: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bonus">{t("adjustments.type.bonus")}</SelectItem>
                        <SelectItem value="allowance">{t("adjustments.type.allowance")}</SelectItem>
                        <SelectItem value="deduction">{t("adjustments.type.deduction")}</SelectItem>
                        <SelectItem value="other">{t("adjustments.type.other")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("adjustments.form.label.category")}</Label>
                    <Select
                      value={formData.category || "none"}
                      onValueChange={(v) => setFormData({ ...formData, category: v === "none" ? "" : v })}
                    >
                      <SelectTrigger><SelectValue placeholder={t("adjustments.form.label.category")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("adjustments.category.none")}</SelectItem>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{t(`adjustments.category.${c}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("adjustments.form.label.amount")} *</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={formData.amount}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, "");
                        setFormData({ ...formData, amount: v });
                      }}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("adjustments.form.label.effectiveMonth")} *</Label>
                    <MonthPicker
                      value={formData.effectiveMonth}
                      onChange={(v) => setFormData({ ...formData, effectiveMonth: v })}
                      placeholder={t("payroll.filters.placeholder.month")}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("adjustments.form.label.description")}</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t("adjustments.form.label.description") + "..."}
                    rows={3}
                  />
                </div>

                <ReceiptUploadArea isEdit={false} />

                {formData.effectiveMonth && (
                  <PayrollCycleIndicator month={formData.effectiveMonth} label="Adjustments" />
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
                  <Button onClick={handleCreate} disabled={isUploading}>
                    {isUploading ? t("adjustments.receipt.uploading") : t("common.submit")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <Tabs value={viewTab} onValueChange={(v) => { setViewTab(v); setStatusFilter("all"); }} className="w-full">
          <TabsList>
            <TabsTrigger value="active">{t("adjustments.tabs.active")}</TabsTrigger>
            <TabsTrigger value="history">{t("adjustments.tabs.history")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("reimbursements.filters.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("adjustments.filters.customerPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adjustments.filters.allCustomers")}</SelectItem>
              {customersList.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t("adjustments.filters.countryPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adjustments.filters.allCountries")}</SelectItem>
              {availableCountries.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t("adjustments.form.label.type")} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">{t("adjustments.filters.allTypes")}</SelectItem>
                <SelectItem value="bonus">{t("adjustments.type.bonus")}</SelectItem>
                <SelectItem value="allowance">{t("adjustments.type.allowance")}</SelectItem>
                <SelectItem value="deduction">{t("adjustments.type.deduction")}</SelectItem>
                <SelectItem value="other">{t("adjustments.type.other")}</SelectItem>
              </SelectContent>
          </Select>
          
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t("payroll.filters.placeholder.month")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("leave.filters.allMonths")}</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Bulk Approve Button */}
        {viewTab === "active" && (() => {
          const pendingApproval = filteredAdjustments.filter((a: any) => a.status === "client_approved" && a.workerType === "employee");
          return pendingApproval.length > 0 ? (
            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span className="text-sm text-emerald-800">
                <CheckCircle2 className="w-4 h-4 inline mr-1" />
                {pendingApproval.length} adjustment(s) pending GEA approval
              </span>
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                onClick={() => bulkApproveEmployeeMutation.mutate({ ids: pendingApproval.map((a: any) => a.id) })}
                disabled={bulkApproveEmployeeMutation.isPending}
              >
                {bulkApproveEmployeeMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                Approve All ({pendingApproval.length})
              </Button>
            </div>
          ) : null;
        })()}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>{t("adjustments.form.label.type")}</TableHead>
                  <TableHead>{t("adjustments.form.label.category")}</TableHead>
                  <TableHead>{t("adjustments.form.label.amount")}</TableHead>
                  <TableHead>{t("adjustments.form.label.effectiveMonth")}</TableHead>
                  <TableHead>{t("adjustments.table.header.receipt")}</TableHead>
                  <TableHead>{t("adjustments.filters.statusPlaceholder")}</TableHead>
                  <TableHead className="w-24">{t("adjustments.table.header.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredAdjustments.length > 0 ? (
                  filteredAdjustments.map((adj) => {
                    const worker = workerMap.get(adj.workerId);
                    const workerName = worker ? `${worker.firstName} ${worker.lastName}` : adj.workerId;
                    const isEmployee = adj.workerType === "employee";
                    
                    return (
                      <TableRow key={`${adj.workerType}-${adj.id}`}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{workerName}</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              {isEmployee ? (
                                <Badge variant="secondary" className="text-[10px] px-1 h-4">
                                  {worker?.serviceType === "visa_eor" ? "Visa EOR" : "EOR"}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1 h-4 bg-orange-50 text-orange-700 border-orange-200">
                                  AOR
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs capitalize ${typeColors[adj.adjustmentType] || ""}`}>
                            {t(`adjustments.type.${adj.adjustmentType}`) || adj.adjustmentType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {CATEGORIES.includes(adj.category) ? t(`adjustments.category.${adj.category}`) : (adj.category || adj.description || "—")}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {adj.currency} {formatAmount(adj.amount)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {adj.effectiveMonth ? new Date(adj.effectiveMonth).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { month: "long", year: "numeric" }) : "—"}
                        </TableCell>
                        <TableCell>
                          {adj.receiptFileUrl ? (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => window.open(adj.receiptFileUrl!, "_blank")}>
                              <Paperclip className="w-3 h-3 mr-1" /> {t("adjustments.receipt.view")}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${statusColors[adj.status] || ""}`}>
                            {adj.status === "locked" && <Lock className="w-3 h-3 mr-1 inline" />}
                            {t(`adjustments.status.${adj.status}`) || adj.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {["client_approved", "pending"].includes(adj.status) && (
                              <>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => handleApprove(adj)}
                                  title={t("common.approve")}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                  onClick={() => handleReject(adj)}
                                  title={t("common.reject")}
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </Button>
                              </>)}
                            {["submitted", "client_approved", "pending"].includes(adj.status) && (
                              <>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  onClick={() => handleEdit(adj)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => handleDelete(adj)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setViewAdj(adj)}
                              title={t("common.view")}
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
                    <TableCell colSpan={8} className="text-center py-12">
                      <ArrowUpDown className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">{t("adjustments.table.empty")}</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) { setEditReceiptFile(null); }
        }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("adjustments.dialog.title.edit")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type *</Label>
                  <Select
                    value={editFormData.adjustmentType}
                    onValueChange={(v) => setEditFormData({ ...editFormData, adjustmentType: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bonus">{t("adjustments.type.bonus")}</SelectItem>
                      <SelectItem value="allowance">{t("adjustments.type.allowance")}</SelectItem>
                      <SelectItem value="deduction">{t("adjustments.type.deduction")}</SelectItem>
                      <SelectItem value="other">{t("adjustments.type.other")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("adjustments.form.label.category")}</Label>
                  <Select
                    value={editFormData.category || "none"}
                    onValueChange={(v) => setEditFormData({ ...editFormData, category: v === "none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("adjustments.category.none")}</SelectItem>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{t(`adjustments.category.${c}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={editFormData.amount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, "");
                      setEditFormData({ ...editFormData, amount: v });
                    }}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Effective Month *</Label>
                  <MonthPicker
                    value={editFormData.effectiveMonth}
                    onChange={(v) => setEditFormData({ ...editFormData, effectiveMonth: v })}
                    placeholder="Select month"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("adjustments.form.label.description")}</Label>
                <Textarea
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  placeholder="Reason for adjustment..."
                  rows={3}
                />
              </div>

              <ReceiptUploadArea isEdit={true} />

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdate} disabled={isUploading}>
                  {isUploading ? "Uploading..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

         {/* View Adjustment Detail Dialog (read-only) */}
         <Dialog open={!!viewAdj} onOpenChange={(open) => { if (!open) setViewAdj(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t("adjustments.dialog.title.details")}</DialogTitle></DialogHeader>
            {viewAdj && (
              <div className="space-y-4 mt-4">
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-sm font-medium">
                     {(() => { const w = workerMap.get(viewAdj.workerId); return w ? `${w.firstName} ${w.lastName}` : viewAdj.workerId; })()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(() => { const w = workerMap.get(viewAdj.workerId); return w ? `${countryName(w.country)} · ${w.currency || 'USD'}` : ''; })()}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("adjustments.form.label.type")}</Label>
                    <Badge variant="outline" className={`text-xs capitalize ${typeColors[viewAdj.adjustmentType] || ''}`}>
                      {t(`adjustments.type.${viewAdj.adjustmentType}`) || viewAdj.adjustmentType}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("adjustments.form.label.category")}</Label>
                    <p className="text-sm">{CATEGORIES.includes(viewAdj.category) ? t(`adjustments.category.${viewAdj.category}`) : (viewAdj.category || '—')}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("adjustments.form.label.amount")}</Label>
                    <p className="text-sm font-mono font-semibold">
                      {viewAdj.currency} {formatAmount(viewAdj.amount)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("adjustments.form.label.effectiveMonth")}</Label>
                    <p className="text-sm">
                      {viewAdj.effectiveMonth ? formatMonth(viewAdj.effectiveMonth) : '—'}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("common.status")}</Label>
                  <Badge variant="outline" className={`text-xs ${statusColors[viewAdj.status] || ''}`}>
                    {viewAdj.status === 'locked' && <Lock className="w-3 h-3 mr-1 inline" />}
                    {t(`adjustments.status.${viewAdj.status}`) || viewAdj.status}
                  </Badge>
                </div>

                {viewAdj.description && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("adjustments.form.label.description")}</Label>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewAdj.description}</p>
                  </div>
                )}

                {viewAdj.receiptFileUrl && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("adjustments.table.header.receipt")}</Label>
                    <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={() => window.open(viewAdj.receiptFileUrl!, '_blank')}>
                      <Paperclip className="w-3 h-3 mr-1" /> View Receipt
                    </Button>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button variant="outline" onClick={() => setViewAdj(null)}>{t("adjustments.button.close")}</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}
