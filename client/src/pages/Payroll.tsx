/*
 * EG Admin — Payroll Management
 * List payroll runs + detail view with payroll items, submit/approve/reject workflow
 * Supports filtering by customer or country, auto-fill employees, month picker
 */
import Layout from "@/components/Layout";
import CountrySelect from "@/components/CountrySelect";
import { formatMonthLong, formatStatusLabel } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Banknote, Plus, ArrowLeft, ChevronRight, Calculator, Send, CheckCircle,
  XCircle, Pencil, Trash2, UserPlus, Filter, Eye, Download, AlertTriangle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import EmployeeSelector from "@/components/EmployeeSelector";
import { formatCurrencyAmount, CurrencyInput } from "@/components/CurrencyAmount";
import { exportToCsv } from "@/lib/csvExport";

import { useI18n } from "@/lib/i18n";
const statusColors: Record<string, string> = {
  draft: "bg-slate-50 text-slate-700 border-slate-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const payrollStatusLabels: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
};

// Generate year options (current year ± 2)
function getYearOptions() {
  const current = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => current - 2 + i);
}

/* ========== Payroll List ========== */
function PayrollList() {
  const { t, lang } = useI18n();
  const [viewTab, setViewTab] = useState<string>("active");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [, setLocation] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, refetch } = trpc.payroll.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    limit: 200,
  });

  const { data: countries } = trpc.countries.list.useQuery();

  const createMutation = trpc.payroll.create.useMutation({
    onSuccess: () => {
      toast.success("Payroll run created");
      setCreateOpen(false);
      refetch();
      setFormData(defaultForm);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const currentDate = new Date();
  const defaultForm = {
    countryCode: "",
    year: String(currentDate.getFullYear()),
    month: String(currentDate.getMonth()), // 0-indexed
    notes: "",
  };
  const [formData, setFormData] = useState(defaultForm);

  const handleCreate = () => {
    if (!formData.countryCode) {
      toast.error("Country is required");
      return;
    }
    // Build payrollMonth as first day of selected month
    const monthIndex = parseInt(formData.month);
    const year = parseInt(formData.year);
    const payrollMonth = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    createMutation.mutate({
      countryCode: formData.countryCode,
      payrollMonth,
      notes: formData.notes || undefined,
    });
  };

  // Get unique countries from payroll runs for filter
  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    data?.data?.forEach((r) => { if (r.countryCode) set.add(r.countryCode); });
    return Array.from(set).sort();
  }, [data]);

  // Get unique months from payroll runs for dynamic month filter
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    data?.data?.forEach((r) => {
      if (r.payrollMonth) {
        const d = new Date(r.payrollMonth);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        set.add(key);
      }
    });
    return Array.from(set).sort().reverse();
  }, [data]);

  // Split into active and history based on status
  const activeStatuses = ["draft", "pending_approval", "rejected"];
  const historyStatuses = ["approved"];

  // Apply client-side country + month + tab filter
  const filteredRuns = useMemo(() => {
    let runs = data?.data || [];
    // Tab filter
    if (viewTab === "active") {
      runs = runs.filter((r) => activeStatuses.includes(r.status));
    } else {
      runs = runs.filter((r) => historyStatuses.includes(r.status));
    }
    if (countryFilter !== "all") {
      runs = runs.filter((r) => r.countryCode === countryFilter);
    }
    if (monthFilter !== "all") {
      runs = runs.filter((r) => {
        const d = new Date(r.payrollMonth);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === monthFilter;
      });
    }
    return runs;
  }, [data, countryFilter, monthFilter, viewTab]);

  return (
    <Layout breadcrumb={["EG", "Payroll"]}>
      <div className="p-6 space-y-6 page-enter">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("payroll.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("payroll.description")}</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />{t("payroll.button.newRun")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{t("payroll.dialog.createRun.title")}</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>{t("payroll.form.label.country")} <span className="text-red-500">*</span></Label>
                  <CountrySelect value={formData.countryCode} onValueChange={(v) => setFormData({ ...formData, countryCode: v })} />
                  <p className="text-xs text-muted-foreground">{t("payroll.form.help.currency")}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("payroll.form.label.year")} <span className="text-red-500">*</span></Label>
                    <Select value={formData.year} onValueChange={(v) => setFormData({ ...formData, year: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {getYearOptions().map((y) => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("payroll.form.label.month")} <span className="text-red-500">*</span></Label>
                    <Select value={formData.month} onValueChange={(v) => setFormData({ ...formData, month: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }).map((_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {new Date(2000, i, 1).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { month: "long" })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("payroll.form.label.notes")}</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..." rows={2} />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Active / History Tabs */}
        <Tabs value={viewTab} onValueChange={(v) => { setViewTab(v); setStatusFilter("all"); }} className="w-full">
          <TabsList>
            <TabsTrigger value="active">{t("payroll.tabs.active")}</TabsTrigger>
            <TabsTrigger value="history">{t("payroll.tabs.history")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters - Status, Customer, Country */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("payroll.filters.label")}</span>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder={t("payroll.filters.placeholder.status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("payroll.filters.option.allStatus")}</SelectItem>
              {viewTab === "active" ? (
                <>
                  <SelectItem value="draft">{t("status.draft")}</SelectItem>
                  <SelectItem value="pending_approval">{t("status.pending_approval")}</SelectItem>
                  <SelectItem value="rejected">{t("status.rejected")}</SelectItem>
                </>
              ) : (
                <SelectItem value="approved">{t("status.approved")}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder={t("payroll.filters.placeholder.country")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("payroll.filters.option.allCountries")}</SelectItem>
              {availableCountries.map((cc) => (
                <SelectItem key={cc} value={cc}>{cc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder={t("payroll.filters.placeholder.month")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("payroll.filters.option.allMonths")}</SelectItem>
              {availableMonths.map((m) => {
                const [y, mo] = m.split("-");
                const d = new Date(parseInt(y), parseInt(mo) - 1, 1);
                return <SelectItem key={m} value={m}>{formatMonthLong(d)}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          {(countryFilter !== "all" || statusFilter !== "all" || monthFilter !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setCountryFilter("all"); setMonthFilter("all"); }}>
              Clear Filters
            </Button>
          )}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("payroll.table.header.month")}</TableHead>
                  <TableHead className="min-w-[120px]">{t("payroll.filters.placeholder.country")}</TableHead>
                  <TableHead>{t("settings.exchangeRates.table.currency")}</TableHead>
                  <TableHead>{t("payroll.detail.summary.totalEmployerCost")}</TableHead>
                  <TableHead>{t("payroll.filters.placeholder.status")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                      ))}
                      <TableCell></TableCell>
                    </TableRow>
                  ))
                ) : filteredRuns.length > 0 ? (
                  filteredRuns.map((run) => (
                    <TableRow key={run.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/payroll/${run.id}`)}>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {formatMonthLong(run.payrollMonth)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{run.countryCode}</TableCell>
                      <TableCell className="text-sm">{run.currency}</TableCell>
                      <TableCell className="text-sm font-mono">{run.currency} {formatCurrencyAmount(run.totalEmployerCost, run.currency)}</TableCell>
                      <TableCell>
                      <Badge variant="outline" className={`text-xs ${statusColors[run.status] || ""}`}>
                        {t(`status.${run.status}`) || formatStatusLabel(run.status)}
                      </Badge>
                    </TableCell>
                      <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <Banknote className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No payroll runs found</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground text-right">Showing {filteredRuns.length} payroll runs{data ? ` of ${data.total} total` : ""}</p>
      </div>
    </Layout>
  );
}

/* ========== Payroll Detail ========== */
function PayrollDetail({ id }: { id: number }) {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const { data: run, isLoading, refetch } = trpc.payroll.get.useQuery({ id });
  const { data: items, isLoading: itemsLoading, refetch: refetchItems } = trpc.payroll.getItems.useQuery({ payrollRunId: id });
  const { data: employees } = trpc.employees.list.useQuery({ limit: 500 });

  // Add item dialog
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItemId, setEditItemId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(0);
  // View item dialog (read-only, for non-draft states)
  const [viewItem, setViewItem] = useState<any>(null);

  const defaultItemForm = {
    employeeId: 0,
    baseSalary: "",
    bonus: "0",
    allowances: "0",
    reimbursements: "0",
    deductions: "0",
    taxDeduction: "0",
    socialSecurityDeduction: "0",
    unpaidLeaveDeduction: "0",
    unpaidLeaveDays: "0",
    employerSocialContribution: "0",
    notes: "",
  };
  const [itemForm, setItemForm] = useState(defaultItemForm);

  // Preview query: auto-populate adjustments/leave when employee is selected
  const { data: previewData, isFetching: previewLoading } = trpc.payroll.previewItem.useQuery(
    { payrollRunId: id, employeeId: selectedEmployeeId },
    { enabled: selectedEmployeeId > 0 && !editItemId }
  );

  // Auto-populate form when preview data arrives
  useEffect(() => {
    if (previewData && selectedEmployeeId > 0 && !editItemId) {
      setItemForm(prev => ({
        ...prev,
        employeeId: selectedEmployeeId,
        baseSalary: previewData.baseSalary,
        bonus: previewData.bonus,
        allowances: previewData.allowances,
        reimbursements: previewData.reimbursements,
        deductions: previewData.deductions,
        unpaidLeaveDeduction: previewData.unpaidLeaveDeduction,
        unpaidLeaveDays: previewData.unpaidLeaveDays,
      }));
    }
  }, [previewData, selectedEmployeeId, editItemId]);

  // Reject dialog
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Mutations
  const updateMutation = trpc.payroll.update.useMutation({
    onSuccess: () => { refetch(); refetchItems(); },
    onError: (err: any) => toast.error(err.message),
  });

  const addItemMutation = trpc.payroll.addItem.useMutation({
    onSuccess: () => {
      toast.success("Payroll item added");
      setAddItemOpen(false);
      setItemForm(defaultItemForm);
      refetchItems();
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateItemMutation = trpc.payroll.updateItem.useMutation({
    onSuccess: () => {
      toast.success("Payroll item updated");
      setAddItemOpen(false);
      setEditItemId(null);
      setItemForm(defaultItemForm);
      setSelectedEmployeeId(0);
      refetchItems();
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteItemMutation = trpc.payroll.deleteItem.useMutation({
    onSuccess: () => {
      toast.success("Payroll item deleted");
      refetchItems();
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const autoFillMutation = trpc.payroll.autoFill.useMutation({
    onSuccess: (result) => {
      toast.success(`Auto-filled ${result.itemsAdded} employee(s)`);
      refetchItems();
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Pending review warning state
  const [showAutoFillWarning, setShowAutoFillWarning] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<{
    pendingLeaves: number; pendingAdjustments: number; pendingReimbursements: number; total: number;
  } | null>(null);

  const pendingReviewQuery = trpc.payroll.getPendingReviewCounts.useQuery(
    { payrollRunId: run?.id ?? 0 },
    { enabled: !!run?.id }
  );

  const handleAutoFillClick = () => {
    const counts = pendingReviewQuery.data;
    if (counts && counts.total > 0) {
      setPendingCounts(counts);
      setShowAutoFillWarning(true);
    } else {
      autoFillMutation.mutate({ payrollRunId: run!.id });
    }
  };

  // Filter employees by country (payroll runs are country-based, across all customers)
  const filteredEmployees = useMemo(() => {
    if (!run || !employees?.data) return [];
    return employees.data.filter((e) =>
      e.country === run.countryCode &&
      e.status === "active"
    );
  }, [run, employees]);

  const employeeMap = useMemo(() => {
    const map: Record<number, string> = {};
    employees?.data?.forEach((e) => { map[e.id] = `${e.firstName} ${e.lastName}`; });
    return map;
  }, [employees]);

  if (isLoading) {
    return (
      <Layout breadcrumb={["EG", "Payroll", "Loading..."]}>
        <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>
      </Layout>
    );
  }

  if (!run) {
    return (
      <Layout breadcrumb={["EG", "Payroll", "Not Found"]}>
        <div className="p-6 text-center py-20">
          <p className="text-muted-foreground">Payroll run not found</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation("/payroll")}>Back to Payroll</Button>
        </div>
      </Layout>
    );
  }

  const isDraft = run.status === "draft";
  const isPendingApproval = run.status === "pending_approval";

  const handleSubmit = () => {
    updateMutation.mutate(
      { id: run.id, data: { status: "pending_approval" } },
      { onSuccess: () => toast.success("Payroll submitted for approval") }
    );
  };

  const handleApprove = () => {
    updateMutation.mutate(
      { id: run.id, data: { status: "approved" } },
      { onSuccess: () => toast.success("Payroll approved") }
    );
  };

  const handleReject = () => {
    if (!rejectReason.trim()) { toast.error("Please provide a rejection reason"); return; }
    updateMutation.mutate(
      { id: run.id, data: { status: "rejected", rejectionReason: rejectReason } },
      { onSuccess: () => { toast.success("Payroll rejected"); setRejectOpen(false); setRejectReason(""); } }
    );
  };

  const handleRevertToDraft = () => {
    updateMutation.mutate(
      { id: run.id, data: { status: "draft" } },
      { onSuccess: () => toast.success("Payroll reverted to draft") }
    );
  };

  const handleAddItem = () => {
    if (!itemForm.employeeId || !itemForm.baseSalary) {
      toast.error("Employee and base salary are required");
      return;
    }
    addItemMutation.mutate({
      payrollRunId: run.id,
      ...itemForm,
      currency: previewData?.currency || run.currency,
      adjustmentsBreakdown: previewData?.adjustmentsBreakdown,
    });
  };

  const handleUpdateItem = () => {
    if (!editItemId) return;
    updateItemMutation.mutate({
      id: editItemId,
      data: {
        baseSalary: itemForm.baseSalary,
        bonus: itemForm.bonus,
        allowances: itemForm.allowances,
        reimbursements: itemForm.reimbursements,
        deductions: itemForm.deductions,
        taxDeduction: itemForm.taxDeduction,
        socialSecurityDeduction: itemForm.socialSecurityDeduction,
        unpaidLeaveDeduction: itemForm.unpaidLeaveDeduction,
        unpaidLeaveDays: itemForm.unpaidLeaveDays,
        employerSocialContribution: itemForm.employerSocialContribution,
        notes: itemForm.notes,
      },
    });
  };

  const startEditItem = (item: any) => {
    setEditItemId(item.id);
    setItemForm({
      employeeId: item.employeeId,
      baseSalary: item.baseSalary || "0",
      bonus: item.bonus || "0",
      allowances: item.allowances || "0",
      reimbursements: item.reimbursements || "0",
      deductions: item.deductions || "0",
      taxDeduction: item.taxDeduction || "0",
      socialSecurityDeduction: item.socialSecurityDeduction || "0",
      unpaidLeaveDeduction: item.unpaidLeaveDeduction || "0",
      unpaidLeaveDays: item.unpaidLeaveDays || "0",
      employerSocialContribution: item.employerSocialContribution || "0",
      notes: item.notes || "",
    });
  };

  return (
    <Layout breadcrumb={["EG", "Payroll", `${formatMonthLong(run.payrollMonth)}`]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/payroll")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {formatMonthLong(run.payrollMonth)}
              </h1>
              <Badge variant="outline" className={`${statusColors[run.status] || ""}`}>
                {payrollStatusLabels[run.status] || formatStatusLabel(run.status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {run.countryCode} · {run.currency}
            </p>
          </div>
          <div className="flex gap-2">
            {isDraft && (
              <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
                <Send className="w-4 h-4 mr-2" />Submit for Approval
              </Button>
            )}
            {isPendingApproval && (
              <>
                <Button onClick={handleApprove} disabled={updateMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle className="w-4 h-4 mr-2" />Approve
                </Button>
                <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive"><XCircle className="w-4 h-4 mr-2" />{t("payroll.detail.button.reject")}</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>{t("payroll.detail.dialog.reject.title")}</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>{t("payroll.detail.dialog.reject.reasonLabel")}</Label>
                        <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Please explain why this payroll run is being rejected..." rows={4} />
                      </div>
                      <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleReject} disabled={updateMutation.isPending}>{t("payroll.detail.button.reject")}</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
            {run.status === "rejected" && (
              <Button variant="outline" onClick={handleRevertToDraft} disabled={updateMutation.isPending}>
                Revert to Draft
              </Button>
            )}
          </div>
        </div>

        {/* Rejection reason */}
        {run.status === "rejected" && run.rejectionReason && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-red-800">Rejection Reason:</p>
              <p className="text-sm text-red-700 mt-1">{run.rejectionReason}</p>
            </CardContent>
          </Card>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{t("payroll.detail.summary.totalGross")}</div>
              <div className="text-xl font-bold mt-1">{run.currency} {formatCurrencyAmount(run.totalGross, run.currency)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{t("payroll.detail.summary.totalDeductions")}</div>
              <div className="text-xl font-bold mt-1 text-red-600">{run.currency} {formatCurrencyAmount(run.totalDeductions, run.currency)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{t("payroll.detail.summary.totalNet")}</div>
              <div className="text-xl font-bold mt-1 text-primary">{run.currency} {formatCurrencyAmount(run.totalNet, run.currency)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{t("payroll.detail.summary.totalEmployerCost")}</div>
              <div className="text-xl font-bold mt-1">{run.currency} {formatCurrencyAmount(run.totalEmployerCost, run.currency)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Payroll items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Payroll Items ({items?.length || 0})
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!items || items.length === 0} onClick={() => {
                  exportToCsv(items || [], [
                    { header: "Employee", accessor: (r: any) => employeeMap[r.employeeId] || `#${r.employeeId}` },
                    { header: "Base Salary", accessor: (r: any) => r.baseSalary },
                    { header: "Bonus", accessor: (r: any) => r.bonus || "0" },
                    { header: "Allowances", accessor: (r: any) => r.allowances || "0" },
                    { header: "Deductions", accessor: (r: any) => r.deductions || "0" },
                    { header: "Tax Deduction", accessor: (r: any) => r.taxDeduction || "0" },
                    { header: "Social Security Deduction", accessor: (r: any) => r.socialSecurityDeduction || "0" },
                    { header: "Unpaid Leave Deduction", accessor: (r: any) => r.unpaidLeaveDeduction || "0" },
                    { header: "Employer Social Contribution", accessor: (r: any) => r.employerSocialContribution || "0" },
                    { header: "Gross", accessor: (r: any) => r.gross },
                    { header: "Net", accessor: (r: any) => r.net },
                    { header: "Total Employment Cost", accessor: (r: any) => r.totalEmploymentCost || "0" },
                    { header: "Currency", accessor: () => run?.currency || "" },
                  ], `payroll-${run?.countryCode}-${run?.payrollMonth ? new Date(run.payrollMonth).toISOString().slice(0, 7) : "export"}.csv`);
                  toast.success("CSV exported successfully");
                }}>
                  <Download className="w-4 h-4 mr-2" />Export CSV
                </Button>
              {isDraft && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleAutoFillClick} disabled={autoFillMutation.isPending}>
                    <Calculator className="w-4 h-4 mr-2" />{autoFillMutation.isPending ? "Filling..." : "Auto-Fill Employees"}
                  </Button>
                  <Dialog open={addItemOpen} onOpenChange={(open) => { setAddItemOpen(open); if (!open) { setItemForm(defaultItemForm); setEditItemId(null); setSelectedEmployeeId(0); } }}>
                    <DialogTrigger asChild>
                      <Button size="sm"><UserPlus className="w-4 h-4 mr-2" />{t("payroll.detail.items.button.addEmployee")}</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                      <DialogHeader><DialogTitle>{editItemId ? "Edit Payroll Item" : "Add Payroll Item"}</DialogTitle></DialogHeader>
                      <div className="space-y-4 mt-4">
                        {/* Employee Selector with search */}
                        {!editItemId && (
                          <div className="space-y-2">
                            <EmployeeSelector
                              value={itemForm.employeeId}
                              onValueChange={(eid) => { setSelectedEmployeeId(eid); setItemForm({ ...defaultItemForm, employeeId: eid }); }}
                              showCustomerFilter={false}
                              required
                              label={`Employee (${run.countryCode} only)`}
                              placeholder="Search employee by name..."
                              allowedStatuses={["active", "on_leave"]}
                              countryFilter={run.countryCode}
                              excludeEmployeeIds={items?.map((item: any) => item.employeeId) || []}
                            />
                            {previewLoading && selectedEmployeeId > 0 && (
                              <p className="text-xs text-blue-500">{t("payroll.itemDialog.loadingAdjustments")}</p>
                            )}
                          </div>
                        )}

                        {/* Auto-Filled Section (from employee data + adjustments + leave) */}
                        {(itemForm.employeeId > 0 || editItemId) && (
                          <>
                            <div className="rounded-md bg-muted/50 p-3 space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Auto-filled from Employee / Adjustments / Leave {editItemId && <span className="text-xs">(read-only)</span>}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Base Salary <span className="text-red-500">*</span></Label>
                                <Input type="number" step="0.01" value={itemForm.baseSalary} onChange={(e) => setItemForm({ ...itemForm, baseSalary: e.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <Label>Bonus <span className="text-xs text-muted-foreground">(from adjustments)</span></Label>
                                <Input type="number" step="0.01" value={itemForm.bonus} readOnly className="bg-muted" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Allowances <span className="text-xs text-muted-foreground">(from adjustments)</span></Label>
                                <Input type="number" step="0.01" value={itemForm.allowances} readOnly className="bg-muted" />
                              </div>
                              <div className="space-y-2">
                                <Label>Reimbursements <span className="text-xs text-muted-foreground">(from adjustments)</span></Label>
                                <Input type="number" step="0.01" value={itemForm.reimbursements} readOnly className="bg-muted" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Other Deductions <span className="text-xs text-muted-foreground">(from adjustments)</span></Label>
                                <Input type="number" step="0.01" value={itemForm.deductions} readOnly className="bg-muted" />
                              </div>
                              <div className="space-y-2" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Unpaid Leave Days <span className="text-xs text-muted-foreground">(from leave records)</span></Label>
                                <Input type="number" step="0.5" value={itemForm.unpaidLeaveDays} readOnly className="bg-muted" />
                              </div>
                              <div className="space-y-2">
                                <Label>{t("payroll.itemDialog.label.unpaidLeaveDeduction")}</Label>
                                <Input type="number" step="0.01" value={itemForm.unpaidLeaveDeduction} onChange={(e) => setItemForm({ ...itemForm, unpaidLeaveDeduction: e.target.value })} />
                                {previewData && !editItemId && parseFloat(previewData.unpaidLeaveDays) > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    System ref: {previewData.unpaidLeaveDays} days × daily rate = {previewData.currency} {previewData.unpaidLeaveDeduction}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Manual Section (ops manager fills these) */}
                            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 space-y-1">
                              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">{t("payroll.itemDialog.section.opsInput")}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>{t("payroll.itemDialog.label.taxDeduction")}</Label>
                                <Input type="number" step="0.01" value={itemForm.taxDeduction} onChange={(e) => setItemForm({ ...itemForm, taxDeduction: e.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <Label>{t("payroll.itemDialog.label.socialSecurityDeduction")}</Label>
                                <Input type="number" step="0.01" value={itemForm.socialSecurityDeduction} onChange={(e) => setItemForm({ ...itemForm, socialSecurityDeduction: e.target.value })} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>{t("payroll.itemDialog.label.employerSocialContribution")}</Label>
                                <Input type="number" step="0.01" value={itemForm.employerSocialContribution} onChange={(e) => setItemForm({ ...itemForm, employerSocialContribution: e.target.value })} />
                              </div>
                              <div className="space-y-2" />
                            </div>
                            <div className="space-y-2">
                              <Label>{t("payroll.form.label.notes")}</Label>
                              <Textarea value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} rows={2} />
                            </div>
                          </>
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                          <Button variant="outline" onClick={() => { setAddItemOpen(false); setEditItemId(null); setItemForm(defaultItemForm); setSelectedEmployeeId(0); }}>Cancel</Button>
                          <Button onClick={editItemId ? handleUpdateItem : handleAddItem} disabled={addItemMutation.isPending || updateItemMutation.isPending || (previewLoading && !editItemId)}>
                            {(addItemMutation.isPending || updateItemMutation.isPending) ? "Saving..." : editItemId ? "Update" : "Add"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("payroll.detail.table.header.employee")}</TableHead>
                  <TableHead>{t("payroll.detail.table.header.baseSalary")}</TableHead>
                  <TableHead>{t("payroll.detail.table.header.bonus")}</TableHead>
                  <TableHead>{t("payroll.detail.table.header.allowances")}</TableHead>
                  <TableHead>{t("payroll.detail.table.header.deductions")}</TableHead>
                  <TableHead>{t("payroll.detail.table.header.employerSocial")}</TableHead>
                  <TableHead>{t("payroll.detail.table.header.gross")}</TableHead>
                  <TableHead>{t("payroll.detail.table.header.net")}</TableHead>
                  <TableHead className="w-20">{t("payroll.detail.table.header.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items && items.length > 0 ? (
                  items.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm font-medium">{employeeMap[item.employeeId] || `#${item.employeeId}`}</TableCell>
                      <TableCell className="text-sm font-mono">{formatCurrencyAmount(item.baseSalary, run?.currency)}</TableCell>
                      <TableCell className="text-sm font-mono">{item.bonus || "0.00"}</TableCell>
                      <TableCell className="text-sm font-mono">{item.allowances || "0.00"}</TableCell>
                      <TableCell className="text-sm font-mono text-red-600">
                        {(() => { const total = parseFloat(item.deductions || "0") + parseFloat(item.taxDeduction || "0") + parseFloat(item.socialSecurityDeduction || "0") + parseFloat(item.unpaidLeaveDeduction || "0"); return total > 0 ? `-${total.toFixed(2)}` : "0.00"; })()}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{item.employerSocialContribution || "0.00"}</TableCell>
                      <TableCell className="text-sm font-mono font-semibold">{formatCurrencyAmount(item.gross, run?.currency)}</TableCell>
                      <TableCell className="text-sm font-mono font-semibold text-primary">{formatCurrencyAmount(item.net, run?.currency)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isDraft ? (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { startEditItem(item); setAddItemOpen(true); }}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("Delete this payroll item?")) deleteItemMutation.mutate({ id: item.id }); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewItem(item)} title="View details">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <p className="text-sm text-muted-foreground">{t("payroll.detail.items.empty.noItems")}</p>
                      {isDraft && <p className="text-xs text-muted-foreground mt-1">{t("payroll.detail.items.empty.hint")}</p>}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Notes */}
        {run.notes && (
          <Card>
            <CardHeader><CardTitle className="text-base">{t("payroll.form.label.notes")}</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{run.notes}</p></CardContent>
          </Card>
        )}

        {/* View Payroll Item Detail Dialog (read-only) */}
        <Dialog open={!!viewItem} onOpenChange={(open) => { if (!open) setViewItem(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("payroll.viewItemDialog.title")}</DialogTitle>
            </DialogHeader>
            {viewItem && (
              <div className="space-y-4 mt-4">
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-sm font-medium">{employeeMap[viewItem.employeeId] || `Employee #${viewItem.employeeId}`}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{run.countryCode} · {run.currency}</p>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("payroll.viewItemDialog.section.earnings")}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("payroll.detail.table.header.baseSalary")}</Label>
                      <p className="text-sm font-mono">{run.currency} {formatCurrencyAmount(viewItem.baseSalary, run.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("payroll.detail.table.header.bonus")}</Label>
                      <p className="text-sm font-mono">{run.currency} {formatCurrencyAmount(viewItem.bonus || "0", run.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("payroll.detail.table.header.allowances")}</Label>
                      <p className="text-sm font-mono">{run.currency} {formatCurrencyAmount(viewItem.allowances || "0", run.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Reimbursements</Label>
                      <p className="text-sm font-mono">{run.currency} {formatCurrencyAmount(viewItem.reimbursements || "0", run.currency)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("payroll.detail.table.header.deductions")}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("payroll.itemDialog.label.taxDeduction")}</Label>
                      <p className="text-sm font-mono text-red-600">{run.currency} {formatCurrencyAmount(viewItem.taxDeduction || "0", run.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Social Security</Label>
                      <p className="text-sm font-mono text-red-600">{run.currency} {formatCurrencyAmount(viewItem.socialSecurityDeduction || "0", run.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Unpaid Leave Days</Label>
                      <p className="text-sm font-mono">{viewItem.unpaidLeaveDays || "0"} days</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("payroll.itemDialog.label.unpaidLeaveDeduction")}</Label>
                      <p className="text-sm font-mono text-red-600">{run.currency} {formatCurrencyAmount(viewItem.unpaidLeaveDeduction || "0", run.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Other Deductions</Label>
                      <p className="text-sm font-mono text-red-600">{run.currency} {formatCurrencyAmount(viewItem.deductions || "0", run.currency)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Employer Cost</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("payroll.itemDialog.label.employerSocialContribution")}</Label>
                      <p className="text-sm font-mono">{run.currency} {formatCurrencyAmount(viewItem.employerSocialContribution || "0", run.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("payroll.viewItemDialog.label.totalEmploymentCost")}</Label>
                      <p className="text-sm font-mono font-semibold">{run.currency} {formatCurrencyAmount(viewItem.totalEmploymentCost || "0", run.currency)}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("payroll.viewItemDialog.section.summary")}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("payroll.viewItemDialog.label.grossPay")}</Label>
                      <p className="text-sm font-mono font-semibold">{run.currency} {formatCurrencyAmount(viewItem.gross, run.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("payroll.viewItemDialog.label.netPay")}</Label>
                      <p className="text-sm font-mono font-semibold text-primary">{run.currency} {formatCurrencyAmount(viewItem.net, run.currency)}</p>
                    </div>
                  </div>
                </div>

                {viewItem.notes && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("payroll.form.label.notes")}</Label>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewItem.notes}</p>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button variant="outline" onClick={() => setViewItem(null)}>Close</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      {/* Auto-Fill Pending Review Warning Dialog */}
      <AlertDialog open={showAutoFillWarning} onOpenChange={setShowAutoFillWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Pending Items Detected
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>There are items that have <strong>not yet been fully approved</strong> for this payroll period. These items will <strong>NOT</strong> be included in the auto-fill.</p>
                {pendingCounts && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                    {pendingCounts.pendingLeaves > 0 && (
                      <p className="text-sm text-amber-800">Leave records pending: <strong>{pendingCounts.pendingLeaves}</strong></p>
                    )}
                    {pendingCounts.pendingAdjustments > 0 && (
                      <p className="text-sm text-amber-800">Adjustments pending: <strong>{pendingCounts.pendingAdjustments}</strong></p>
                    )}
                    {pendingCounts.pendingReimbursements > 0 && (
                      <p className="text-sm text-amber-800">Reimbursements pending: <strong>{pendingCounts.pendingReimbursements}</strong></p>
                    )}
                    <p className="text-sm font-semibold text-amber-900 pt-1">Total: {pendingCounts.total} item(s) not yet approved</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">Please review and approve these items in the Leave, Adjustments, or Reimbursements modules before proceeding, or continue with auto-fill to exclude them.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back & Review</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                setShowAutoFillWarning(false);
                autoFillMutation.mutate({ payrollRunId: run!.id });
              }}
            >
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </Layout>
  );
}
export default function Payroll() {
  const [matchDetail, params] = useRoute("/payroll/:id");
  if (matchDetail && params?.id) {
    const id = parseInt(params.id, 10);
    if (!isNaN(id)) return <PayrollDetail id={id} />;
  }
  return <PayrollList />;
}
