/**
 * EG Admin — Vendor Bills (List + Detail)
 *
 * List view: table of all vendor bills with filters, stats, export.
 * Detail view: bill info, line items, cost allocations, status workflow.
 *
 * Bill creation (AI + manual) has been moved to AnalyzeBill.tsx (/vendor-bills/new).
 */
import Layout from "@/components/Layout";
import CurrencySelect from "@/components/CurrencySelect";
import { DatePicker, MonthPicker } from "@/components/DatePicker";
import { formatDate, formatAmount, countryName } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  FileStack, Plus, Search, ArrowLeft, Upload, Check, X, Loader2,
  Clock, AlertTriangle, DollarSign, FileText, Users, Pencil,
  Trash2, Download, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Helpers ─── */
function safeDate(d: any): string {
  if (!d) return "";
  if (typeof d === "string") return d.substring(0, 10);
  return new Date(d).toISOString().substring(0, 10);
}
function safeMonth(d: any): string {
  if (!d) return "";
  if (typeof d === "string") return d.substring(0, 7);
  return new Date(d).toISOString().substring(0, 7);
}

const noSpin = "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const statusColorMap: Record<string, string> = {
  draft: "bg-gray-500/15 text-gray-600 border-gray-500/30",
  pending_approval: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  approved: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  paid: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  partially_paid: "bg-teal-500/15 text-teal-600 border-teal-500/30",
  overdue: "bg-red-500/15 text-red-600 border-red-500/30",
  cancelled: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  void: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const categoryKeys = [
  "payroll_processing", "social_contributions", "tax_filing", "legal_compliance",
  "visa_immigration", "hr_advisory", "it_services", "office_rent", "insurance",
  "bank_charges", "consulting", "equipment", "travel", "marketing", "other",
];
const statusKeys = [
  "draft", "pending_approval", "approved", "paid", "partially_paid", "overdue", "cancelled", "void",
];

/* ========== Vendor Bill List ========== */
function VendorBillList() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");

  const { data, isLoading, refetch } = trpc.vendorBills.list.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    vendorId: vendorFilter !== "all" ? parseInt(vendorFilter) : undefined,
    limit: 200,
  });
  const vendorsQuery = trpc.vendors.list.useQuery({ limit: 500 });
  const vendors = (vendorsQuery.data as any)?.data || vendorsQuery.data || [];

  const bills = useMemo(() => {
    const raw = (data as any)?.data || data || [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  const stats = useMemo(() => {
    let total = 0, pending = 0, overdue = 0, totalAmount = 0;
    bills.forEach((b: any) => {
      total++;
      if (b.status === "pending_approval" || b.status === "draft") pending++;
      if (b.status === "overdue") overdue++;
      totalAmount += parseFloat(b.totalAmount || "0");
    });
    return { total, pending, overdue, totalAmount };
  }, [bills]);

  function handleExportCSV() {
    const headers = ["Bill #", "Vendor", "Category", "Status", "Bill Date", "Due Date", "Currency", "Total", "Paid"];
    const rows = bills.map((b: any) => [
      b.billNumber, b.vendor?.name || "", b.category, b.status,
      safeDate(b.billDate), safeDate(b.dueDate), b.currency,
      b.totalAmount, b.paidAmount || "0",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vendor-bills-${new Date().toISOString().substring(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <Layout breadcrumb={["EG", t("vendorBills.title")]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("vendorBills.title")}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={bills.length === 0}>
              <Download className="w-4 h-4 mr-1" /> {t("vendorBills.actions.export")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/vendor-bills/new?mode=manual")}>
              <Plus className="w-4 h-4 mr-1" /> {t("vendorBills.actions.createBill")}
            </Button>
            <Button size="sm" onClick={() => setLocation("/vendor-bills/new?mode=ai")}>
              <Upload className="w-4 h-4 mr-1" /> {t("vendorBills.actions.analyzeWithAI")}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t("vendorBills.stats.totalBills"), value: stats.total, icon: FileStack, color: "text-foreground" },
            { label: t("vendorBills.stats.totalAmount"), value: formatAmount(stats.totalAmount), icon: DollarSign, color: "text-blue-600" },
            { label: t("vendorBills.stats.pending"), value: stats.pending, icon: Clock, color: "text-amber-600" },
            { label: t("vendorBills.stats.overdue"), value: stats.overdue, icon: AlertTriangle, color: "text-red-600" },
          ].map((s, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={t("vendorBills.filters.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder={t("vendorBills.filters.allStatuses")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("vendorBills.filters.allStatuses")}</SelectItem>
              {statusKeys.map((s) => <SelectItem key={s} value={s}>{t(`vendorBills.status.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder={t("vendorBills.filters.allCategories")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("vendorBills.filters.allCategories")}</SelectItem>
              {categoryKeys.map((c) => <SelectItem key={c} value={c}>{t(`vendorBills.category.${c}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder={t("vendorBills.filters.allVendors")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("vendorBills.filters.allVendors")}</SelectItem>
              {vendors.map((v: any) => <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : bills.length === 0 ? (
          <div className="text-center py-16 border rounded-lg">
            <FileStack className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">{t("vendorBills.empty.title")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("vendorBills.empty.prompt")}</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("vendorBills.table.billNumberHeader")}</TableHead>
                  <TableHead className="text-xs">{t("vendorBills.table.vendorHeader")}</TableHead>
                  <TableHead className="text-xs">{t("vendorBills.table.statusHeader")}</TableHead>
                  <TableHead className="text-xs">{t("vendorBills.table.billDateHeader")}</TableHead>
                  <TableHead className="text-xs">{t("vendorBills.table.dueDateHeader")}</TableHead>
                  <TableHead className="text-xs text-right">{t("vendorBills.table.totalHeader")}</TableHead>
                  <TableHead className="text-xs text-right">{t("vendorBills.table.paidHeader")}</TableHead>
                  <TableHead className="text-xs text-right">{t("vendorBills.table.balanceHeader")}</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((bill: any) => {
                  const total = parseFloat(bill.totalAmount || "0");
                  const paid = parseFloat(bill.paidAmount || "0");
                  const balance = total - paid;
                  return (
                    <TableRow key={bill.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/vendor-bills/${bill.id}`)}>
                      <TableCell className="font-medium text-sm">{bill.billNumber}</TableCell>
                      <TableCell className="text-sm">{bill.vendor?.name || "\u2014"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusColorMap[bill.status] || ""}`}>
                          {t(`vendorBills.status.${bill.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(bill.billDate)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(bill.dueDate)}</TableCell>
                      <TableCell className="text-sm text-right font-medium">{bill.currency} {formatAmount(total)}</TableCell>
                      <TableCell className="text-sm text-right">{formatAmount(paid)}</TableCell>
                      <TableCell className={`text-sm text-right font-medium ${balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {formatAmount(balance)}
                      </TableCell>
                      <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="text-xs font-medium">{t("common.total")}</TableCell>
                  <TableCell className="text-right text-xs font-bold">{formatAmount(bills.reduce((s: number, b: any) => s + parseFloat(b.totalAmount || "0"), 0))}</TableCell>
                  <TableCell className="text-right text-xs font-bold">{formatAmount(bills.reduce((s: number, b: any) => s + parseFloat(b.paidAmount || "0"), 0))}</TableCell>
                  <TableCell className="text-right text-xs font-bold">{formatAmount(bills.reduce((s: number, b: any) => s + parseFloat(b.totalAmount || "0") - parseFloat(b.paidAmount || "0"), 0))}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}

/* ========== Vendor Bill Detail ========== */
function VendorBillDetail() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/vendor-bills/:id");
  const billId = params?.id ? parseInt(params.id) : 0;

  const [editOpen, setEditOpen] = useState(false);
  const [allocOpen, setAllocOpen] = useState(false);
  const [allocEmployeeId, setAllocEmployeeId] = useState("");
  const [allocInvoiceId, setAllocInvoiceId] = useState("");
  const [allocAmount, setAllocAmount] = useState("");
  const [allocNote, setAllocNote] = useState("");

  const { data: bill, isLoading, refetch } = trpc.vendorBills.get.useQuery(
    { id: billId },
    { enabled: billId > 0 }
  );

  const [editBill, setEditBill] = useState<any>({});

  // Allocation summary
  const { data: allocSummary } = trpc.allocations.billSummary.useQuery(
    { vendorBillId: billId },
    { enabled: billId > 0 }
  );

  // Allocation list
  const { data: allocations, refetch: refetchAllocs } = trpc.allocations.listByBill.useQuery(
    { vendorBillId: billId },
    { enabled: billId > 0 }
  );

  // Employees for allocation
  const { data: employeesData } = trpc.employees.list.useQuery({ limit: 500 });
  const employees = useMemo(() => {
    const raw = (employeesData as any)?.data || employeesData || [];
    return Array.isArray(raw) ? raw : [];
  }, [employeesData]);

  // Invoices for allocation
  const { data: invoicesData } = trpc.invoices.list.useQuery({ limit: 500 });
  const invoices = useMemo(() => {
    const raw = (invoicesData as any)?.data || invoicesData || [];
    return Array.isArray(raw) ? raw : [];
  }, [invoicesData]);

  // Employee monthly revenue (for selected employee)
  const { data: empRevenue } = trpc.allocations.singleEmployeeRevenue.useQuery(
    {
      employeeId: allocEmployeeId ? parseInt(allocEmployeeId) : 0,
      serviceMonth: bill?.billMonth || safeMonth(bill?.billDate) || "",
    },
    { enabled: !!allocEmployeeId && allocEmployeeId !== "" && billId > 0 }
  );

  // Mutations
  const updateMutation = trpc.vendorBills.update.useMutation({
    onSuccess: () => { toast.success(t("vendorBills.toast.updated")); setEditOpen(false); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const statusMutation = trpc.vendorBills.update.useMutation({
    onSuccess: () => { refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const createAllocMutation = trpc.allocations.create.useMutation({
    onSuccess: () => {
      toast.success(t("vendorBills.toast.allocationCreated"));
      setAllocOpen(false);
      setAllocEmployeeId(""); setAllocInvoiceId(""); setAllocAmount(""); setAllocNote("");
      refetchAllocs(); refetch();
    },
    onError: (err) => toast.error(err.message || t("vendorBills.toast.allocationFailed")),
  });

  const deleteAllocMutation = trpc.allocations.delete.useMutation({
    onSuccess: () => { toast.success(t("vendorBills.toast.allocationDeleted")); refetchAllocs(); refetch(); },
    onError: (err) => toast.error(err.message || t("vendorBills.toast.deleteFailed")),
  });

  function openEdit() {
    if (!bill) return;
    setEditBill({
      billNumber: bill.billNumber,
      category: bill.category,
      billType: (bill as any).billType || "operational",
      billDate: safeDate(bill.billDate),
      dueDate: safeDate(bill.dueDate),
      billMonth: bill.billMonth || "",
      currency: bill.currency,
      subtotal: bill.subtotal?.toString() || "",
      tax: bill.tax?.toString() || "0",
      totalAmount: bill.totalAmount?.toString() || "",
      description: bill.description || "",
    });
    setEditOpen(true);
  }

  function handleSaveEdit() {
    updateMutation.mutate({
      id: billId,
      billNumber: editBill.billNumber,
      category: editBill.category,
      billType: editBill.billType,
      billDate: editBill.billDate || undefined,
      dueDate: editBill.dueDate || undefined,
      billMonth: editBill.billMonth || undefined,
      currency: editBill.currency,
      subtotal: editBill.subtotal,
      tax: editBill.tax || "0",
      totalAmount: editBill.totalAmount,
      description: editBill.description,
    });
  }

  function handleCreateAlloc() {
    if (!allocEmployeeId || !allocInvoiceId || !allocAmount) {
      toast.error(t("vendorBills.toast.fillRequired"));
      return;
    }
    createAllocMutation.mutate({
      vendorBillId: billId,
      invoiceId: parseInt(allocInvoiceId),
      employeeId: parseInt(allocEmployeeId),
      allocatedAmount: allocAmount,
      description: allocNote || "",
    });
  }

  if (isLoading) {
    return (
      <Layout breadcrumb={["EG", t("vendorBills.title"), "..."]}>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Layout>
    );
  }

  if (!bill) {
    return (
      <Layout breadcrumb={["EG", t("vendorBills.title")]}>
        <div className="p-6 text-center py-16">
          <FileStack className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">{t("vendorBills.detail.notFound")}</p>
          <Button variant="link" onClick={() => setLocation("/vendor-bills")} className="mt-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> {t("vendorBills.detail.backToList")}
          </Button>
        </div>
      </Layout>
    );
  }

  const totalAmt = parseFloat(bill.totalAmount?.toString() || "0");
  const paidAmt = parseFloat((bill as any).paidAmount?.toString() || "0");
  const allocatedAmt = parseFloat((allocSummary as any)?.allocatedTotal?.toString() || "0");
  const unallocatedAmt = totalAmt - allocatedAmt;
  const allocs = Array.isArray(allocations) ? allocations : (allocations as any)?.data || [];

  // Revenue info for selected employee
  const revTotal = empRevenue ? parseFloat((empRevenue as any)?.totalRevenue?.toString() || "0") : 0;
  const allocAmtNum = parseFloat(allocAmount || "0");
  const exceedsRevenue = allocEmployeeId && revTotal > 0 && allocAmtNum > revTotal;

  const itemTypeKeys = [
    "employment_cost", "service_fee", "visa_fee", "equipment_purchase", "deposit", "deposit_refund", "other",
  ];

  return (
    <Layout breadcrumb={["EG", t("vendorBills.title"), bill.billNumber || `#${billId}`]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/vendor-bills")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{bill.billNumber}</h1>
              <p className="text-sm text-muted-foreground">{(bill as any).vendor?.name || ""}</p>
            </div>
            <Badge variant="outline" className={statusColorMap[bill.status] || ""}>
              {t(`vendorBills.status.${bill.status}`)}
            </Badge>
          </div>
          <div className="flex gap-2">
            {bill.status === "draft" && (
              <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: billId, status: "pending_approval" })}>
                {t("vendorBills.actions.submitApproval")}
              </Button>
            )}
            {bill.status === "pending_approval" && (
              <>
                <Button size="sm" variant="outline" className="text-red-600" onClick={() => statusMutation.mutate({ id: billId, status: "draft" })}>
                  {t("vendorBills.actions.reject")}
                </Button>
                <Button size="sm" onClick={() => statusMutation.mutate({ id: billId, status: "approved" })}>
                  <Check className="w-4 h-4 mr-1" /> {t("vendorBills.actions.approve")}
                </Button>
              </>
            )}
            {(bill.status === "approved" || bill.status === "partially_paid") && (
              <Button size="sm" onClick={() => statusMutation.mutate({ id: billId, status: "paid" })}>
                <DollarSign className="w-4 h-4 mr-1" /> {t("vendorBills.actions.markPaid")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={openEdit}>
              <Pencil className="w-4 h-4 mr-1" /> {t("common.edit")}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("vendorBills.detail.amount")}</p>
              <p className="text-lg font-bold">{bill.currency} {formatAmount(totalAmt)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("vendorBills.table.paidHeader")}</p>
              <p className="text-lg font-bold text-emerald-600">{formatAmount(paidAmt)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("vendorBills.detail.allocated")}</p>
              <p className="text-lg font-bold text-blue-600">{formatAmount(allocatedAmt)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("vendorBills.allocations.unallocated")}</p>
              <p className={`text-lg font-bold ${unallocatedAmt > 0 ? "text-amber-600" : "text-emerald-600"}`}>{formatAmount(unallocatedAmt)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Bill Info */}
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("vendorBills.detail.dates")}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("vendorBills.details.billDateLabel")}</p>
                <p>{formatDate(bill.billDate) || "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("vendorBills.details.dueDateLabel")}</p>
                <p>{formatDate(bill.dueDate) || "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("vendorBills.details.serviceMonthLabel")}</p>
                <p>{bill.billMonth || "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("vendorBills.filters.allCategories")}</p>
                <p>{t(`vendorBills.category.${bill.category}`)}</p>
              </div>
            </div>
            {bill.description && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-muted-foreground">{t("vendorBills.details.descriptionLabel")}</p>
                <p className="text-sm mt-1">{bill.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attachment */}
        {(bill as any).receiptFileUrl && (
          <Card>
            <CardContent className="p-4">
              <a href={(bill as any).receiptFileUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline">
                <FileText className="w-4 h-4" /> {t("vendorBills.detail.viewAttachment")}
              </a>
            </CardContent>
          </Card>
        )}

        {/* Line Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("vendorBills.detail.lineItems")} ({(bill as any).items?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {(bill as any).items?.length > 0 ? (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("vendorBills.details.descriptionLabel")}</TableHead>
                      <TableHead className="text-xs">{t("vendorBills.createBill.costType")}</TableHead>
                      <TableHead className="text-xs text-right">{t("vendorBills.lineItems.quantityHeader")}</TableHead>
                      <TableHead className="text-xs text-right">{t("vendorBills.lineItems.unitPriceHeader")}</TableHead>
                      <TableHead className="text-xs text-right">{t("vendorBills.lineItems.amountHeader")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(bill as any).items.map((item: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm">{item.description}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{t(`vendorBills.itemType.${item.itemType || "other"}`)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-right">{item.quantity}</TableCell>
                        <TableCell className="text-sm text-right">{formatAmount(parseFloat(item.unitPrice || "0"))}</TableCell>
                        <TableCell className="text-sm text-right font-medium">{formatAmount(parseFloat(item.amount || "0"))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t("vendorBills.detail.noLineItems")}</p>
            )}
          </CardContent>
        </Card>

        {/* Cost Allocations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">{t("vendorBills.detail.costAllocations")}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setAllocOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> {t("vendorBills.actions.newAllocation")}
            </Button>
          </CardHeader>
          <CardContent>
            {allocs.length > 0 ? (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("vendorBills.lineItems.employeeHeader")}</TableHead>
                      <TableHead className="text-xs">{t("vendorBills.review.invoiceHeader")}</TableHead>
                      <TableHead className="text-xs text-right">{t("vendorBills.lineItems.amountHeader")}</TableHead>
                      <TableHead className="text-xs">{t("vendorBills.allocations.noteLabel")}</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocs.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm">{a.employeeName || t("vendorBills.allocations.unknownEmployee")}{a.employeeCode ? ` (${a.employeeCode})` : ""}</TableCell>
                        <TableCell className="text-sm">{a.invoiceNumber || t("vendorBills.allocations.unknownInvoice")}{a.invoiceCurrency && a.invoiceTotal ? ` - ${a.invoiceCurrency} ${formatAmount(parseFloat(a.invoiceTotal))}` : ""}</TableCell>
                        <TableCell className="text-sm text-right font-medium">{formatAmount(parseFloat(a.allocatedAmount || "0"))}</TableCell>
                        <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{a.description || "\u2014"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteAllocMutation.mutate({ id: a.id })}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t("vendorBills.allocations.noAllocations")}</p>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("common.edit")}</DialogTitle></DialogHeader>
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t("vendorBills.table.billNumberHeader")}</Label>
                  <Input value={editBill.billNumber || ""} onChange={(e) => setEditBill({ ...editBill, billNumber: e.target.value })} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("vendorBills.createBill.billType")}</Label>
                  <Select value={editBill.billType || "operational"} onValueChange={(v) => setEditBill({ ...editBill, billType: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operational">{t("vendorBills.billType.operational")}</SelectItem>
                      <SelectItem value="deposit">{t("vendorBills.billType.deposit")}</SelectItem>
                      <SelectItem value="deposit_refund">{t("vendorBills.billType.deposit_refund")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">{t("vendorBills.details.billDateLabel")}</Label>
                  <DatePicker value={editBill.billDate || ""} onChange={(d: string) => setEditBill({ ...editBill, billDate: d })} placeholder="" />
                </div>
                <div>
                  <Label className="text-xs">{t("vendorBills.details.dueDateLabel")}</Label>
                  <DatePicker value={editBill.dueDate || ""} onChange={(d: string) => setEditBill({ ...editBill, dueDate: d })} placeholder="" />
                </div>
                <div>
                  <Label className="text-xs">{t("vendorBills.details.serviceMonthLabel")}</Label>
                  <MonthPicker value={editBill.billMonth || ""} onChange={(v: string) => setEditBill({ ...editBill, billMonth: v })} placeholder={t("vendorBills.details.serviceMonthPlaceholder")} className="h-8 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">{t("vendorBills.details.subtotalLabel")}</Label>
                  <Input type="number" step="0.01" value={editBill.subtotal || ""} onChange={(e) => setEditBill({ ...editBill, subtotal: e.target.value })} className={`h-8 text-sm ${noSpin}`} />
                </div>
                <div>
                  <Label className="text-xs">{t("vendorBills.details.taxLabel")}</Label>
                  <Input type="number" step="0.01" value={editBill.tax || "0"} onChange={(e) => setEditBill({ ...editBill, tax: e.target.value })} className={`h-8 text-sm ${noSpin}`} />
                </div>
                <div>
                  <Label className="text-xs">{t("vendorBills.details.totalAmountLabel")} *</Label>
                  <Input type="number" step="0.01" value={editBill.totalAmount || ""} onChange={(e) => setEditBill({ ...editBill, totalAmount: e.target.value })} className={`h-8 text-sm font-medium ${noSpin}`} />
                </div>
              </div>
              <div>
                <Label className="text-xs">{t("vendorBills.details.descriptionLabel")}</Label>
                <Textarea value={editBill.description || ""} onChange={(e) => setEditBill({ ...editBill, description: e.target.value })} rows={2} className="text-sm" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("vendorBills.actions.saving") : t("vendorBills.actions.saveChanges")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Allocation Dialog */}
        <Dialog open={allocOpen} onOpenChange={setAllocOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{t("vendorBills.actions.createAllocation")}</DialogTitle></DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <Label className="text-xs">{t("vendorBills.allocations.selectEmployee")}</Label>
                <Select value={allocEmployeeId} onValueChange={setAllocEmployeeId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t("vendorBills.allocations.selectEmployee")} /></SelectTrigger>
                  <SelectContent>
                    {employees.map((emp: any) => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.fullName || emp.firstName + " " + emp.lastName} ({emp.employeeCode || emp.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {allocEmployeeId && empRevenue && (
                  <div className="mt-1 p-2 rounded bg-muted/50 text-xs">
                    <span className="text-muted-foreground">{t("vendorBills.allocations.revenueHint")}: </span>
                    <span className="font-medium">{formatAmount(revTotal)}</span>
                    {(empRevenue as any)?.breakdown?.map((b: any, i: number) => (
                      <span key={i} className="ml-2 text-muted-foreground">({b.itemType}: {formatAmount(parseFloat(b.total || "0"))})</span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs">{t("vendorBills.allocations.selectInvoice")}</Label>
                <Select value={allocInvoiceId} onValueChange={setAllocInvoiceId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t("vendorBills.allocations.selectInvoice")} /></SelectTrigger>
                  <SelectContent>
                    {invoices.map((inv: any) => (
                      <SelectItem key={inv.id} value={inv.id.toString()}>
                        {inv.invoiceNumber} - {inv.currency} {formatAmount(parseFloat(inv.totalAmount || "0"))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("vendorBills.allocations.amountLabel")}</Label>
                <Input type="number" step="0.01" value={allocAmount} onChange={(e) => setAllocAmount(e.target.value)} className={`h-8 text-sm ${noSpin}`} />
                {exceedsRevenue && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {t("vendorBills.allocations.revenueExceeded")}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">{t("vendorBills.allocations.noteLabel")}</Label>
                <Input value={allocNote} onChange={(e) => setAllocNote(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAllocOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={handleCreateAlloc} disabled={createAllocMutation.isPending}>
                {createAllocMutation.isPending ? t("vendorBills.actions.creating") : t("vendorBills.actions.createAllocation")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

/* ========== Main Page Router ========== */
export default function VendorBills() {
  const [isDetail] = useRoute("/vendor-bills/:id");
  // Exclude /vendor-bills/new from detail view
  const [, params] = useRoute("/vendor-bills/:id");
  if (isDetail && params?.id === "new") return null; // handled by AnalyzeBill route
  return isDetail ? <VendorBillDetail /> : <VendorBillList />;
}
