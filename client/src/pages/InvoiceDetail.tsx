import { useParams, useLocation } from "wouter";
import Layout from "@/components/Layout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Download, FileText, CreditCard, CalendarDays,
  Clock, Receipt, Info, Eye, Edit, Save, Plus, Trash2,
  Building2, User, DollarSign, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Send, XCircle, Ban,
  RefreshCw, ExternalLink, Link2, Wallet, Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatAmount, formatMonth } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DatePicker, MonthPicker } from "@/components/DatePicker";

/* ========== Constants ========== */

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  applied: "bg-purple-50 text-purple-700 border-purple-200",
  void: "bg-gray-100 text-gray-500 border-gray-200",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  applied: "Applied",
  void: "Void",
};

const typeLabels: Record<string, string> = {
  deposit: "Deposit",
  monthly_eor: "Monthly EOR",
  monthly_visa_eor: "Monthly Visa EOR",
  monthly_aor: "Monthly AOR",
  visa_service: "Visa Service",
  deposit_refund: "Deposit Refund",
  credit_note: "Credit Note",
  manual: "Manual",
};

const itemTypeLabels: Record<string, string> = {
  eor_service_fee: "EOR Service Fee",
  visa_eor_service_fee: "Visa EOR Service Fee",
  aor_service_fee: "AOR Service Fee",
  employment_cost: "Employment Cost",
  deposit: "Deposit",
  equipment_procurement_fee: "Equipment Procurement Fee",
  onboarding_fee: "Onboarding Fee",
  offboarding_fee: "Offboarding Fee",
  admin_setup_fee: "Admin Setup Fee",
  contract_termination_fee: "Contract Termination Fee",
  payroll_processing_fee: "Payroll Processing Fee",
  tax_filing_fee: "Tax Filing Fee",
  hr_advisory_fee: "HR Advisory Fee",
  legal_compliance_fee: "Legal Compliance Fee",
  visa_immigration_fee: "Visa & Immigration Fee",
  relocation_fee: "Relocation Fee",
  benefits_admin_fee: "Benefits Admin Fee",
  bank_transfer_fee: "Bank Transfer Fee",
  consulting_fee: "Consulting Fee",
  management_consulting_fee: "Management Consulting Fee",
};

const ITEM_TYPE_OPTIONS = Object.entries(itemTypeLabels).map(([value, label]) => ({ value, label }));

const CURRENCIES = ["USD", "EUR", "GBP", "SGD", "HKD", "CNY", "THB", "VND", "IDR", "MYR", "PHP", "JPY", "KRW", "AUD", "NZD", "CAD", "CHF", "INR", "AED", "SAR"];

/* ========== Helper ========== */

function fmtAmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val ?? "0"));
  return isNaN(n) ? "0.00" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBankDetails(bankDetailsStr: string | null | undefined): Record<string, string> {
  if (!bankDetailsStr) return {};
  try {
    return JSON.parse(bankDetailsStr);
  } catch {
    // Fallback: try to parse as key:value lines
    const result: Record<string, string> = {};
    bankDetailsStr.split("\n").forEach(line => {
      const idx = line.indexOf(":");
      if (idx > 0) {
        result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    });
    return result;
  }
}

/* ========== Main Component ========== */

export default function InvoiceDetail() {
  const { t } = useI18n();
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const paramId = params.id || "";
  const isNumericId = /^\d+$/.test(paramId);
  const numericId = isNumericId ? parseInt(paramId, 10) : 0;
  const invoiceNumberParam = !isNumericId ? paramId : "";

  // ── Data Queries ──
  const { data: invoiceById, isLoading: isLoadingById, refetch: refetchById } = trpc.invoices.get.useQuery(
    { id: numericId },
    { enabled: isNumericId && numericId > 0 }
  );
  const { data: invoiceByNumber, isLoading: isLoadingByNumber, refetch: refetchByNumber } = trpc.invoices.getByNumber.useQuery(
    { invoiceNumber: invoiceNumberParam },
    { enabled: !isNumericId && !!invoiceNumberParam }
  );

  const invoice = invoiceById || invoiceByNumber;
  const isLoadingInvoice = isLoadingById || isLoadingByNumber;
  const resolvedId = invoice?.id || (isNumericId ? numericId : 0);
  const invoiceId = resolvedId;

  const { data: items, isLoading: isLoadingItems, refetch: refetchItems } = trpc.invoices.getItems.useQuery(
    { invoiceId },
    { enabled: !!invoiceId }
  );

  const { data: relatedInvoices } = trpc.invoices.getRelated.useQuery(
    { invoiceId },
    { enabled: !!invoiceId }
  );

  // Reference data
  const { data: customers } = trpc.customers.list.useQuery({ limit: 500 });
  const { data: billingEntities } = trpc.billingEntities.list.useQuery();
  const { data: employees } = trpc.employees.list.useQuery(
    { limit: 500, customerId: invoice?.customerId },
    { enabled: !!invoice?.customerId }
  );

  // Exchange rate reference (finance manager only)
  const isFinanceManager = user?.role?.includes("admin") || user?.role?.includes("finance_manager");
  const { data: rateRef, isLoading: isLoadingRate, refetch: refetchRate } = trpc.invoices.getRealTimeRateReference.useQuery(
    { invoiceId },
    { enabled: !!invoiceId && !!isFinanceManager, refetchInterval: 60000 }
  );

  const isLoading = isLoadingInvoice || isLoadingItems;

  const refetch = () => {
    if (isNumericId) refetchById();
    else refetchByNumber();
    refetchItems();
  };

  // ── Mutations ──
  const updateMutation = trpc.invoices.update.useMutation({
    onSuccess: () => { toast.success("Invoice updated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const updateStatusMutation = trpc.invoices.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const addItemMutation = trpc.invoices.addItem.useMutation({
    onSuccess: () => { toast.success("Item added"); refetch(); refetchRate(); },
    onError: (err) => toast.error(err.message),
  });
  const updateItemMutation = trpc.invoices.updateItem.useMutation({
    onSuccess: () => { toast.success("Item updated"); refetch(); refetchRate(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteItemMutation = trpc.invoices.deleteItem.useMutation({
    onSuccess: () => { toast.success("Item deleted"); refetch(); refetchRate(); },
    onError: (err) => toast.error(err.message),
  });
  const createCreditNoteMutation = trpc.invoices.createCreditNote.useMutation({
    onSuccess: (result) => {
      toast.success("Credit note created successfully");
      setCreditNoteOpen(false);
      setCreditNoteForm({ isFullCredit: true, reason: "", partialAmount: "" });
      refetch();
      if (result?.invoiceId) {
        setLocation(`/invoices/${result.invoiceId}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.invoices.delete.useMutation({
    onSuccess: () => { toast.success("Invoice deleted"); setLocation("/invoices"); },
    onError: (err) => toast.error(err.message),
  });

  // ── UI State ──
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [editNotesOpen, setEditNotesOpen] = useState(false);
  const [lineItemDialogOpen, setLineItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null); // null = add new
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [creditNoteForm, setCreditNoteForm] = useState({ isFullCredit: true, reason: "", partialAmount: "" });

  // ── Derived ──
  const customerList = (customers as any)?.data || [];
  const customerMap = useMemo(() => {
    const m: Record<number, any> = {};
    customerList.forEach((c: any) => { m[c.id] = c; });
    return m;
  }, [customerList]);

  const billingEntityList = (billingEntities as any[]) || [];
  const billingEntityMap = useMemo(() => {
    const m: Record<number, any> = {};
    billingEntityList.forEach((e: any) => { m[e.id] = e; });
    return m;
  }, [billingEntityList]);

  const employeeList = (employees as any)?.data || [];
  const employeeMap = useMemo(() => {
    const m: Record<number, any> = {};
    employeeList.forEach((e: any) => { m[e.id] = e; });
    return m;
  }, [employeeList]);

  // ── Loading / Not Found ──
  if (isLoading) {
    return (
      <Layout breadcrumb={["EG", "Invoices", "Loading..."]}>
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </Layout>
    );
  }

  if (!invoice) {
    return (
      <Layout breadcrumb={["EG", "Invoices", "Not Found"]}>
        <div className="p-6 max-w-6xl mx-auto">
          <Button variant="ghost" onClick={() => setLocation("/invoices")} className="gap-2 mb-8">
            <ArrowLeft className="w-4 h-4" /> Back to Invoices
          </Button>
          <div className="text-center py-16">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-bold">Invoice not found</h2>
            <p className="text-muted-foreground mt-2">The invoice you're looking for doesn't exist or has been removed.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const isDraft = invoice.status === "draft";
  const isPendingReview = invoice.status === "pending_review";
  const isSent = invoice.status === "sent";
  const isPaid = invoice.status === "paid";
  const isOverdue = invoice.status === "overdue";
  const isCreditNote = invoice.invoiceType === "credit_note";
  const isEditable = isDraft; // Only draft invoices are fully editable

  // Credit note tracking: calculate how much has already been credited
  const activeCreditNotes = (Array.isArray(relatedInvoices) ? relatedInvoices : []).filter((inv: any) =>
    (inv.invoiceType === 'credit_note' || inv.invoiceType === 'deposit_refund') &&
    inv.status !== 'cancelled'
  );
  const totalCredited = activeCreditNotes.reduce((sum: number, inv: any) => sum + Math.abs(parseFloat(inv.total)), 0);
  const canCreateCreditNote = isPaid && !isCreditNote && (totalCredited < parseFloat(invoice.total || "0") - 0.01);
  const canEditInternalNotes = true; // Internal notes always editable
  const canEditExternalNotes = isDraft || isPendingReview;

  const customer = customerMap[invoice.customerId];
  const billingEntity = billingEntityMap[invoice.billingEntityId || 0];
  const bankDetails = parseBankDetails(billingEntity?.bankDetails);

  const walletApplied = parseFloat(invoice.walletAppliedAmount?.toString() || "0");
  const totalNum = parseFloat(invoice.total?.toString() || "0");
  const paidNum = parseFloat(invoice.paidAmount?.toString() || "0");
  // Calculate effectiveAmountDue: when wallet applied, use invoice.amountDue;
  // Otherwise, use totalNum (the full invoice total) as the baseline.
  const amountDueNum = walletApplied > 0
    ? parseFloat(invoice.amountDue?.toString() || (totalNum - walletApplied).toFixed(2))
    : totalNum;

  // ── Handlers ──
  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this invoice? This action cannot be undone.")) {
      deleteMutation.mutate({ id: invoiceId });
    }
  };

  const handleMarkPaid = () => {
    const paid = parseFloat(paidAmount);
    if (isNaN(paid) || paid <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }
    updateStatusMutation.mutate({ id: invoiceId, status: "paid", paidAmount: paid.toFixed(2) });
    setMarkPaidOpen(false);
    setPaidAmount("");
  };

  // ── Render ──
  return (
    <Layout breadcrumb={["EG", "Invoices", invoice.invoiceNumber || `INV-${invoice.id}`]}>
      <div className="p-6 max-w-6xl mx-auto space-y-6 page-enter">

        {/* ── Back + Header ── */}
        <Button variant="ghost" size="sm" onClick={() => setLocation("/invoices")} className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
          <ArrowLeft className="w-4 h-4" /> Back to Invoices
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight font-mono">
                {invoice.invoiceNumber || `INV-${invoice.id}`}
              </h1>
              <Badge variant="outline" className={cn("text-sm px-3 py-1", statusColors[invoice.status])}>
                {statusLabels[invoice.status] || invoice.status}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {typeLabels[invoice.invoiceType] || invoice.invoiceType}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {customer?.companyName || `Customer #${invoice.customerId}`}
              {billingEntity && <> &middot; Issued by {billingEntity.entityName}</>}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            {isDraft && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`/api/invoices/${invoiceId}/pdf/preview`, "_blank")}>
                  <Eye className="w-4 h-4" /> Preview PDF
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-red-600 hover:text-red-700" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => updateStatusMutation.mutate({ id: invoiceId, status: "pending_review" })}>
                  <Send className="w-4 h-4" /> Send for Review
                </Button>
              </>
            )}
            {isPendingReview && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`/api/invoices/${invoiceId}/pdf/preview`, "_blank")}>
                  <Eye className="w-4 h-4" /> Preview PDF
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-red-600 hover:text-red-700" onClick={() => {
                  if (confirm("Reject this invoice and return to draft? Any wallet deductions will be refunded.")) {
                    updateStatusMutation.mutate({ id: invoiceId, status: "draft" });
                  }
                }}>
                  <XCircle className="w-4 h-4" /> Reject to Draft
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => updateStatusMutation.mutate({ id: invoiceId, status: "sent" })}>
                  <CheckCircle2 className="w-4 h-4" /> Approve & Send
                </Button>
              </>
            )}
            {(isSent || isOverdue) && !isCreditNote && invoice.invoiceType !== 'deposit_refund' && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`/api/invoices/${invoiceId}/pdf`, "_blank")}>
                  <Download className="w-4 h-4" /> Download PDF
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => { setMarkPaidOpen(true); setPaidAmount(amountDueNum.toFixed(2)); }}>
                  <CreditCard className="w-4 h-4" /> Mark as Paid
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => updateStatusMutation.mutate({ id: invoiceId, status: "cancelled" })}>
                  <Ban className="w-4 h-4" /> Cancel
                </Button>
              </>
            )}
            {/* Credit Note / Deposit Refund: only show Download PDF and Cancel (when still in sent status) */}
            {(isCreditNote || invoice.invoiceType === 'deposit_refund') && (isSent || isOverdue) && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`/api/invoices/${invoiceId}/pdf`, "_blank")}>
                  <Download className="w-4 h-4" /> Download PDF
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => updateStatusMutation.mutate({ id: invoiceId, status: "cancelled" })}>
                  <Ban className="w-4 h-4" /> Cancel
                </Button>
              </>
            )}
            {isPaid && !isCreditNote && invoice.invoiceType !== 'deposit_refund' && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`/api/invoices/${invoiceId}/pdf`, "_blank")}>
                  <Download className="w-4 h-4" /> Download PDF
                </Button>
                {canCreateCreditNote ? (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreditNoteOpen(true)}>
                    <FileText className="w-4 h-4" /> Create Credit Note
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5" disabled title="Invoice already fully credited">
                    <FileText className="w-4 h-4" /> Fully Credited
                  </Button>
                )}
              </>
            )}
            {/* Credit Note / Deposit Refund: paid state — show Download PDF + disposition badge */}
            {isPaid && (isCreditNote || invoice.invoiceType === 'deposit_refund') && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`/api/invoices/${invoiceId}/pdf`, "_blank")}>
                  <Download className="w-4 h-4" /> Download PDF
                </Button>
                {invoice.creditNoteDisposition === 'to_wallet' && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 gap-1">
                    <Wallet className="w-3.5 h-3.5" /> Credited to Wallet
                  </Badge>
                )}
                {invoice.creditNoteDisposition === 'to_bank' && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
                    <Landmark className="w-3.5 h-3.5" /> Refunded to Bank
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="Subtotal" value={`${invoice.currency || "USD"} ${fmtAmt(invoice.subtotal)}`} />
          <SummaryCard label="VAT / Tax" value={`${invoice.currency || "USD"} ${fmtAmt(invoice.tax)}`} />
          <SummaryCard label="Total" value={`${invoice.currency || "USD"} ${fmtAmt(invoice.total)}`} highlight />
          {isPaid ? (
            <SummaryCard
              label="Paid"
              value={`${invoice.currency || "USD"} ${fmtAmt(invoice.paidAmount)}`}
              className="border-emerald-200 bg-emerald-50/50"
            />
          ) : walletApplied > 0 ? (
            <SummaryCard
              label="Amount Due"
              value={`${invoice.currency || "USD"} ${fmtAmt(amountDueNum)}`}
              className="border-blue-200 bg-blue-50/50"
            />
          ) : (
            <SummaryCard
              label="Due Date"
              value={invoice.dueDate ? formatDate(invoice.dueDate) : "Not set"}
            />
          )}
        </div>

        {/* ── Exchange Rate Intelligence (Finance Manager only) ── */}
        {isFinanceManager && rateRef && rateRef.foreignCurrency && rateRef.liveRate && (
          <ExchangeRatePanel rateRef={rateRef} currency={invoice.currency || "USD"} onRefresh={() => refetchRate()} />
        )}

        {/* ── Main Content: 2 columns ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Details + Line Items */}
          <div className="lg:col-span-2 space-y-6">

            {/* Invoice Details */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" /> Invoice Details
                </CardTitle>
                {isEditable && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditDetailsOpen(true)}>
                    <Edit className="w-4 h-4" /> Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <InfoRow icon={<User className="w-3.5 h-3.5" />} label="Customer" value={customer?.companyName || `#${invoice.customerId}`} />
                  <InfoRow icon={<Building2 className="w-3.5 h-3.5" />} label="Billing Entity" value={billingEntity?.entityName || (invoice.billingEntityId ? `#${invoice.billingEntityId}` : "—")} />
                  <InfoRow icon={<DollarSign className="w-3.5 h-3.5" />} label="Currency" value={invoice.currency || "USD"} />
                  <InfoRow icon={<CalendarDays className="w-3.5 h-3.5" />} label="Invoice Month" value={invoice.invoiceMonth ? formatMonth(invoice.invoiceMonth) : "—"} />
                  <InfoRow icon={<CalendarDays className="w-3.5 h-3.5" />} label="Due Date" value={invoice.dueDate ? formatDate(invoice.dueDate) : "—"} />
                  <InfoRow icon={<CalendarDays className="w-3.5 h-3.5" />} label="Sent Date" value={invoice.sentDate ? formatDate(invoice.sentDate) : "—"} />
                  {isPaid && <InfoRow icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Paid Date" value={invoice.paidDate ? formatDate(invoice.paidDate) : "—"} />}
                  {invoice.exchangeRate && invoice.exchangeRate !== "1" && (
                    <InfoRow icon={<TrendingUp className="w-3.5 h-3.5" />} label="Exchange Rate" value={`${parseFloat(invoice.exchangeRateWithMarkup || invoice.exchangeRate).toFixed(6)} (with markup)`} />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-muted-foreground" /> Line Items
                  <Badge variant="secondary" className="text-xs ml-1">{(items || []).length}</Badge>
                </CardTitle>
                {isEditable && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditingItem(null); setLineItemDialogOpen(true); }}>
                    <Plus className="w-4 h-4" /> Add Item
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="pl-6 min-w-[240px]">Item</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-center">Currency</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Tax %</TableHead>
                        <TableHead className="text-right pr-6">Amount</TableHead>
                        {isEditable && <TableHead className="w-20"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(items || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={isEditable ? 8 : 7} className="text-center py-8">
                            <div className="space-y-2">
                              <p className="text-muted-foreground">
                                No line items yet. {isEditable && "Click \"Add Item\" to get started."}
                              </p>
                              {totalNum > 0 && (
                                <p className="text-xs text-amber-600 flex items-center justify-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  This invoice has a total amount ({invoice.currency} {fmtAmt(totalNum)}) but no line items. Consider regenerating or adding items manually.
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        (items || []).map((item: any) => {
                          const emp = item.employeeId ? employeeMap[item.employeeId] : null;
                          return (
                            <TableRow key={item.id} className="group">
                              <TableCell className="pl-6">
                                <div>
                                  <Badge variant="outline" className="text-xs font-medium mb-0.5">
                                    {itemTypeLabels[item.itemType] || item.itemType}
                                  </Badge>
                                  {item.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {emp ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim() : (item.employeeId ? `#${item.employeeId}` : "—")}
                              </TableCell>
                              <TableCell className="text-center text-sm font-mono">
                                {item.localCurrency || invoice.currency || "USD"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">{item.quantity || "1"}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{fmtAmt(item.unitPrice)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{item.vatRate ? `${item.vatRate}%` : "0%"}</TableCell>
                              <TableCell className="text-right font-mono text-sm font-medium pr-6">
                                {fmtAmt(item.localAmount || item.amount || (parseFloat(item.quantity || "1") * parseFloat(item.unitPrice || "0")))}
                              </TableCell>
                              {isEditable && (
                                <TableCell>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingItem(item); setLineItemDialogOpen(true); }}>
                                      <Edit className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => {
                                      if (confirm("Delete this line item?")) deleteItemMutation.mutate({ id: item.id, invoiceId });
                                    }}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

              </CardContent>
            </Card>

            {/* Related Credit Notes (if any) */}
            {activeCreditNotes.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-muted-foreground" /> Related Credit Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="pl-6">Invoice #</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="pr-6"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeCreditNotes.map((creditNote: any) => (
                        <TableRow key={creditNote.id}>
                          <TableCell className="pl-6 font-mono text-sm">{creditNote.invoiceNumber}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{typeLabels[creditNote.invoiceType] || creditNote.invoiceType}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className={cn("text-xs", statusColors[creditNote.status])}>{statusLabels[creditNote.status] || creditNote.status}</Badge></TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-600">{creditNote.currency} {fmtAmt(creditNote.total)}</TableCell>
                          <TableCell className="pr-6">
                            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setLocation(`/invoices/${creditNote.id}`)}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Related Invoices (Parents/Children) */}
            {relatedInvoices && (relatedInvoices as any[]).filter(ri => !['credit_note', 'deposit_refund'].includes(ri.invoiceType)).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-muted-foreground" /> Related Invoices
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="pl-6">Invoice #</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="pr-6"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(relatedInvoices as any[]).filter((ri: any) => !['credit_note', 'deposit_refund'].includes(ri.invoiceType)).map((ri: any) => (
                        <TableRow key={ri.id}>
                          <TableCell className="pl-6 font-mono text-sm">{ri.invoiceNumber}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{typeLabels[ri.invoiceType] || ri.invoiceType}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className={cn("text-xs", statusColors[ri.status])}>{statusLabels[ri.status] || ri.status}</Badge></TableCell>
                          <TableCell className="text-right font-mono text-sm">{ri.currency} {fmtAmt(ri.total)}</TableCell>
                          <TableCell className="pr-6">
                            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setLocation(`/invoices/${ri.id}`)}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">

            {/* Amount Summary Card */}
            <Card className="bg-muted/10">
              <CardContent className="pt-6 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono">{invoice.currency} {fmtAmt(invoice.subtotal)}</span>
                </div>
                {parseFloat(invoice.serviceFeeTotal?.toString() || "0") > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Service Fee</span>
                    <span className="font-mono">{invoice.currency} {fmtAmt(invoice.serviceFeeTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax / VAT</span>
                  <span className="font-mono">{invoice.currency} {fmtAmt(invoice.tax)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="font-mono">{invoice.currency} {fmtAmt(invoice.total)}</span>
                </div>
                {walletApplied > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-blue-600">
                      <span>Wallet Applied</span>
                      <span className="font-mono">- {fmtAmt(walletApplied)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-bold">
                      <span>Amount Due</span>
                      <span className="font-mono">{invoice.currency} {fmtAmt(amountDueNum)}</span>
                    </div>
                  </>
                )}
                {isPaid && (
                  <div className="flex justify-between text-sm text-emerald-600 font-medium">
                    <span>Paid</span>
                    <span className="font-mono">{invoice.currency} {fmtAmt(invoice.paidAmount)}</span>
                  </div>
                )}
                {invoice.dueDate && !isPaid && (
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-muted-foreground">Due Date</span>
                    <span className="font-mono">{formatDate(invoice.dueDate)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" /> Notes
                </CardTitle>
                {(canEditExternalNotes || canEditInternalNotes) && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditNotesOpen(true)}>
                    <Edit className="w-4 h-4" /> Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">External Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{invoice.notes || <span className="text-muted-foreground italic">No external notes</span>}</p>
                  {!canEditExternalNotes && invoice.notes && (
                    <p className="text-xs text-amber-600 mt-1">Locked after sending</p>
                  )}
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Internal Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{invoice.internalNotes || <span className="text-muted-foreground italic">No internal notes</span>}</p>
                </div>
              </CardContent>
            </Card>

            {/* Payment Information */}
            {billingEntity && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" /> Payment Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Issuing Entity</span>
                    <p className="font-medium">{billingEntity.legalName || billingEntity.entityName}</p>
                  </div>
                  {billingEntity.address && (
                    <div>
                      <span className="text-xs text-muted-foreground">Address</span>
                      <p>{[billingEntity.address, billingEntity.city, billingEntity.state, billingEntity.postalCode].filter(Boolean).join(", ")}</p>
                    </div>
                  )}
                  {billingEntity.taxId && (
                    <div>
                      <span className="text-xs text-muted-foreground">Tax ID</span>
                      <p className="font-mono">{billingEntity.taxId}</p>
                    </div>
                  )}
                  {Object.keys(bankDetails).length > 0 && (
                    <>
                      <Separator />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bank Details</p>
                      {Object.entries(bankDetails).map(([key, val]) => (
                        <div key={key}>
                          <span className="text-xs text-muted-foreground">{key}</span>
                          <p className="font-mono text-xs">{val}</p>
                        </div>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* ══════ Dialogs ══════ */}

        {/* Edit Details Dialog */}
        <EditDetailsDialog
          open={editDetailsOpen}
          onOpenChange={setEditDetailsOpen}
          invoice={invoice}
          customers={customerList}
          billingEntities={billingEntityList}
          onSave={(data) => {
            updateMutation.mutate({ id: invoiceId, data });
            setEditDetailsOpen(false);
          }}
          isPending={updateMutation.isPending}
        />

        {/* Edit Notes Dialog */}
        <EditNotesDialog
          open={editNotesOpen}
          onOpenChange={setEditNotesOpen}
          invoice={invoice}
          canEditExternal={canEditExternalNotes}
          onSave={(data) => {
            updateMutation.mutate({ id: invoiceId, data });
            setEditNotesOpen(false);
          }}
          isPending={updateMutation.isPending}
        />

        {/* Line Item Dialog (Add / Edit) */}
        <LineItemDialog
          open={lineItemDialogOpen}
          onOpenChange={setLineItemDialogOpen}
          item={editingItem}
          invoiceId={invoiceId}
          invoiceCurrency={invoice.currency || "USD"}
          employees={employeeList}
          onAdd={(data) => {
            addItemMutation.mutate(data);
            setLineItemDialogOpen(false);
          }}
          onUpdate={(data) => {
            updateItemMutation.mutate(data);
            setLineItemDialogOpen(false);
          }}
          isPending={addItemMutation.isPending || updateItemMutation.isPending}
        />

        {/* Mark as Paid Dialog */}
        <Dialog open={markPaidOpen} onOpenChange={(open) => { setMarkPaidOpen(open); if (!open) setPaidAmount(""); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" /> Record Payment
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Invoice</span>
                  <span className="font-medium font-mono">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>Total Due</span>
                  <span className="font-mono">{invoice.currency} {fmtAmt(invoice.total)}</span>
                </div>
                {walletApplied > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-blue-600">
                      <span>Less: Wallet</span>
                      <span className="font-mono">- {fmtAmt(walletApplied)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm font-bold">
                      <span>Amount Due</span>
                      <span className="font-mono">{invoice.currency} {fmtAmt(amountDueNum)}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <Label>Payment Amount Received ({invoice.currency})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="Enter payment amount"
                />
                {paidAmount && (() => {
                  const paid = parseFloat(paidAmount);
                  const expected = amountDueNum;
                  const diff = paid - expected;
                  if (isNaN(paid) || paid <= 0) return <p className="text-xs text-red-500">Please enter a valid amount</p>;
                  if (Math.abs(diff) < 0.01) return <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Payment matches amount due</p>;
                  if (diff < 0) return (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                      <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Underpayment</p>
                      <p className="mt-1">Short by {invoice.currency} {fmtAmt(Math.abs(diff))}. A follow-up invoice will be automatically created.</p>
                    </div>
                  );
                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                      <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Overpayment</p>
                      <p className="mt-1">Excess of {invoice.currency} {fmtAmt(diff)} will be credited to the customer's wallet.</p>
                    </div>
                  );
                })()}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMarkPaidOpen(false)}>Cancel</Button>
              <Button onClick={handleMarkPaid} disabled={updateStatusMutation.isPending || !paidAmount}>
                {updateStatusMutation.isPending ? "Processing..." : "Confirm Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Credit Note Dialog */}
        <Dialog open={creditNoteOpen} onOpenChange={(open) => { setCreditNoteOpen(open); if (!open) setCreditNoteForm({ isFullCredit: true, reason: "", partialAmount: "" }); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" /> Create Credit Note
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Original Invoice</span>
                  <span className="font-medium font-mono">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>Invoice Total</span>
                  <span className="font-mono">{invoice.currency} {fmtAmt(invoice.total)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Credit Type</Label>
                <Select value={creditNoteForm.isFullCredit ? "full" : "partial"} onValueChange={(v) => setCreditNoteForm(prev => ({ ...prev, isFullCredit: v === "full" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Credit (entire invoice amount)</SelectItem>
                    <SelectItem value="partial">Partial Credit (specify amount)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!creditNoteForm.isFullCredit && (
                <div className="space-y-2">
                  <Label>Credit Amount ({invoice.currency})</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={creditNoteForm.partialAmount}
                    onChange={(e) => setCreditNoteForm(prev => ({ ...prev, partialAmount: e.target.value }))}
                    placeholder="Enter credit amount"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Reason <span className="text-red-500">*</span></Label>
                <Textarea
                  value={creditNoteForm.reason}
                  onChange={(e) => setCreditNoteForm(prev => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                  placeholder="Reason for issuing credit note..."
                />
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>The credit note will be created in draft status and must be approved via Release Tasks before funds are credited to the customer.</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreditNoteOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  const data: any = {
                    originalInvoiceId: invoiceId,
                    reason: creditNoteForm.reason,
                    isFullCredit: creditNoteForm.isFullCredit,
                  };
                  if (!creditNoteForm.isFullCredit && creditNoteForm.partialAmount) {
                    data.lineItems = [{
                      description: `Partial credit for invoice ${invoice.invoiceNumber}`,
                      amount: parseFloat(creditNoteForm.partialAmount).toFixed(2),
                    }];
                  }
                  createCreditNoteMutation.mutate(data);
                }}
                disabled={createCreditNoteMutation.isPending || !creditNoteForm.reason.trim()}
              >
                {createCreditNoteMutation.isPending ? "Creating..." : "Create Credit Note"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════════════════ */

function SummaryCard({ label, value, highlight, className }: { label: string; value: string; highlight?: boolean; className?: string }) {
  return (
    <Card className={cn(highlight && "border-primary/30 bg-primary/5", className)}>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className={cn("text-lg font-bold font-mono mt-1", highlight && "text-primary")}>{value}</p>
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

/* ── Exchange Rate Panel ── */
function ExchangeRatePanel({ rateRef, currency, onRefresh }: { rateRef: any; currency: string; onRefresh?: () => void }) {
  const diffPercent = parseFloat(rateRef.amountDiffPercent || "0");
  const diffAmount = parseFloat(rateRef.amountDiff || "0");
  const isPositive = diffAmount >= 0;
  const severity = Math.abs(diffPercent) > 2 ? "red" : Math.abs(diffPercent) > 1 ? "amber" : "emerald";
  const colorMap: Record<string, string> = {
    red: "border-red-200 bg-red-50/50",
    amber: "border-amber-200 bg-amber-50/50",
    emerald: "border-emerald-200 bg-emerald-50/50",
  };
  const textColorMap: Record<string, string> = {
    red: "text-red-700",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
  };

  return (
    <Card className={cn("transition-colors", colorMap[severity])}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          Exchange Rate Comparison
          <Badge variant="outline" className="text-xs ml-auto">{rateRef.foreignCurrency} → {currency}</Badge>
          {onRefresh && (
            <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={onRefresh}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Invoice Rate (w/ markup)</p>
            <p className="font-mono font-medium">{parseFloat(rateRef.invoiceExchangeRateWithMarkup).toFixed(6)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Live Market Rate</p>
            <p className="font-mono font-medium">{parseFloat(rateRef.liveRate).toFixed(6)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Invoice Total ({currency})</p>
            <p className="font-mono font-medium">{fmtAmt(rateRef.invoiceUsdEquivalent)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">At Live Rate ({currency})</p>
            <p className="font-mono font-medium">{fmtAmt(rateRef.liveUsdEquivalent)}</p>
          </div>
        </div>
        <div className={cn("mt-3 flex items-center gap-2 font-medium", textColorMap[severity])}>
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span>
            {isPositive ? "Markup margin" : "Below market"}: {currency} {fmtAmt(Math.abs(diffAmount))} ({Math.abs(diffPercent).toFixed(2)}%)
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Source: {rateRef.liveRateSource} &middot; {new Date(rateRef.fetchedAt).toLocaleTimeString()}</p>
      </CardContent>
    </Card>
  );
}

/* ── Edit Details Dialog ── */
function EditDetailsDialog({ open, onOpenChange, invoice, customers, billingEntities, onSave, isPending }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  customers: any[];
  billingEntities: any[];
  onSave: (data: any) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    customerId: invoice.customerId,
    billingEntityId: invoice.billingEntityId || undefined,
    currency: invoice.currency || "USD",
    invoiceMonth: invoice.invoiceMonth || "",
    dueDate: invoice.dueDate || "",
    invoiceType: invoice.invoiceType || "manual",
    exchangeRate: invoice.exchangeRate || "1",
    exchangeRateWithMarkup: invoice.exchangeRateWithMarkup || "1",
  });

  useEffect(() => {
    if (open) {
      setForm({
        customerId: invoice.customerId,
        billingEntityId: invoice.billingEntityId || undefined,
        currency: invoice.currency || "USD",
        invoiceMonth: invoice.invoiceMonth || "",
        dueDate: invoice.dueDate || "",
        invoiceType: invoice.invoiceType || "manual",
        exchangeRate: invoice.exchangeRate || "1",
        exchangeRateWithMarkup: invoice.exchangeRateWithMarkup || "1",
      });
    }
  }, [open, invoice]);

  // Auto-fill when customer changes
  const handleCustomerChange = (customerId: number) => {
    const cust = customers.find(c => c.id === customerId);
    const updates: any = { customerId };
    if (cust) {
      if (cust.settlementCurrency) updates.currency = cust.settlementCurrency;
      if (cust.billingEntityId) updates.billingEntityId = cust.billingEntityId;
      if (cust.paymentTermDays) {
        const due = new Date();
        due.setDate(due.getDate() + cust.paymentTermDays);
        updates.dueDate = due.toISOString().slice(0, 10);
      }
    }
    setForm(prev => ({ ...prev, ...updates }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Invoice Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={form.customerId?.toString()} onValueChange={(v) => handleCustomerChange(parseInt(v))}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.companyName || c.name || `#${c.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Billing Entity</Label>
            <Select value={form.billingEntityId?.toString() || ""} onValueChange={(v) => setForm(prev => ({ ...prev, billingEntityId: parseInt(v) }))}>
              <SelectTrigger><SelectValue placeholder="Select billing entity" /></SelectTrigger>
              <SelectContent>
                {billingEntities.map((e: any) => (
                  <SelectItem key={e.id} value={e.id.toString()}>{e.entityName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Invoice Type</Label>
              <Select value={form.invoiceType} onValueChange={(v) => setForm(prev => ({ ...prev, invoiceType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabels).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm(prev => ({ ...prev, currency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Invoice Month</Label>
              <MonthPicker
                value={form.invoiceMonth?.slice(0, 7) || ""}
                onChange={(v) => setForm(prev => ({ ...prev, invoiceMonth: v }))}
                placeholder="Select month"
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <DatePicker
                value={form.dueDate?.slice(0, 10) || ""}
                onChange={(v) => setForm(prev => ({ ...prev, dueDate: v }))}
                placeholder="Select due date"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Invoice Exchange Rate</Label>
            <Input type="number" step="0.000001" value={form.exchangeRateWithMarkup} onChange={(e) => setForm(prev => ({ ...prev, exchangeRateWithMarkup: e.target.value }))} placeholder="1.000000" />
            <p className="text-xs text-muted-foreground">The exchange rate applied to this invoice for foreign currency conversion.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit Notes Dialog ── */
function EditNotesDialog({ open, onOpenChange, invoice, canEditExternal, onSave, isPending }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  canEditExternal: boolean;
  onSave: (data: any) => void;
  isPending: boolean;
}) {
  const [externalNotes, setExternalNotes] = useState(invoice.notes || "");
  const [internalNotes, setInternalNotes] = useState(invoice.internalNotes || "");

  useEffect(() => {
    if (open) {
      setExternalNotes(invoice.notes || "");
      setInternalNotes(invoice.internalNotes || "");
    }
  }, [open, invoice]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Notes</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>External Notes <span className="text-xs text-muted-foreground">(visible to customer on PDF)</span></Label>
            <Textarea
              value={externalNotes}
              onChange={(e) => setExternalNotes(e.target.value)}
              disabled={!canEditExternal}
              rows={3}
              placeholder="Notes visible to the customer..."
            />
            {!canEditExternal && (
              <p className="text-xs text-amber-600">External notes are locked after the invoice has been sent.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Internal Notes <span className="text-xs text-muted-foreground">(internal only, not on PDF)</span></Label>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes for the finance team..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave({ notes: canEditExternal ? externalNotes : undefined, internalNotes })} disabled={isPending}>
            {isPending ? "Saving..." : "Save Notes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Line Item Dialog (Add / Edit) ── */
function LineItemDialog({ open, onOpenChange, item, invoiceId, invoiceCurrency, employees, onAdd, onUpdate, isPending }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: any | null; // null = add new
  invoiceId: number;
  invoiceCurrency: string;
  employees: any[];
  onAdd: (data: any) => void;
  onUpdate: (data: any) => void;
  isPending: boolean;
}) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    itemType: "employment_cost",
    description: "",
    localCurrency: invoiceCurrency,
    employeeId: undefined as number | undefined,
    quantity: "1",
    unitPrice: "0",
    vatRate: "0",
  });

  useEffect(() => {
    if (open) {
      if (item) {
        setForm({
          itemType: item.itemType || "employment_cost",
          description: item.description || "",
          localCurrency: item.localCurrency || invoiceCurrency,
          employeeId: item.employeeId || undefined,
          quantity: item.quantity?.toString() || "1",
          unitPrice: item.unitPrice?.toString() || "0",
          vatRate: item.vatRate?.toString() || "0",
        });
      } else {
        setForm({
          itemType: "employment_cost",
          description: "",
          localCurrency: invoiceCurrency,
          employeeId: undefined,
          quantity: "1",
          unitPrice: "0",
          vatRate: "0",
        });
      }
    }
  }, [open, item, invoiceCurrency]);

  const baseAmount = parseFloat(form.quantity || "0") * parseFloat(form.unitPrice || "0");
  const taxAmount = baseAmount * (parseFloat(form.vatRate || "0") / 100);
  const totalAmount = baseAmount + taxAmount;

  const handleSave = () => {
    const amount = baseAmount.toFixed(2);
    if (isEdit) {
      onUpdate({
        id: item.id,
        invoiceId,
        data: {
          itemType: form.itemType,
          description: form.description,
          localCurrency: form.localCurrency,
          employeeId: form.employeeId || null,
          quantity: form.quantity,
          unitPrice: form.unitPrice,
          amount,
          vatRate: form.vatRate,
          localAmount: amount,
        },
      });
    } else {
      onAdd({
        invoiceId,
        itemType: form.itemType,
        description: form.description,
        localCurrency: form.localCurrency,
        employeeId: form.employeeId,
        quantity: form.quantity,
        unitPrice: form.unitPrice,
        amount,
        vatRate: form.vatRate,
        localAmount: amount,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Line Item" : "Add Line Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Item Type</Label>
            <Select value={form.itemType} onValueChange={(v) => setForm(prev => ({ ...prev, itemType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ITEM_TYPE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              placeholder="Describe this line item..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={form.localCurrency} onValueChange={(v) => setForm(prev => ({ ...prev, localCurrency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Employee (optional)</Label>
              <Select value={form.employeeId?.toString() || "none"} onValueChange={(v) => setForm(prev => ({ ...prev, employeeId: v === "none" ? undefined : parseInt(v) }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id.toString()}>
                      {`${e.firstName || ""} ${e.lastName || ""}`.trim() || `#${e.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" step="0.01" min="0" value={form.quantity} onChange={(e) => setForm(prev => ({ ...prev, quantity: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Unit Price</Label>
              <Input type="number" step="0.01" min="0" value={form.unitPrice} onChange={(e) => setForm(prev => ({ ...prev, unitPrice: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Tax Rate (%)</Label>
              <Input type="number" step="0.01" min="0" max="100" value={form.vatRate} onChange={(e) => setForm(prev => ({ ...prev, vatRate: e.target.value }))} />
            </div>
          </div>
          {/* Live calculation */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base Amount</span>
              <span className="font-mono">{form.localCurrency} {fmtAmt(baseAmount)}</span>
            </div>
            {parseFloat(form.vatRate || "0") > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({form.vatRate}%)</span>
                <span className="font-mono">{form.localCurrency} {fmtAmt(taxAmount)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span className="font-mono">{form.localCurrency} {fmtAmt(totalAmount)}</span>
            </div>
            {form.localCurrency !== invoiceCurrency && (
              <p className="text-xs text-amber-600 mt-1">
                This item is in {form.localCurrency}. Exchange rate will be applied automatically when saving.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || parseFloat(form.unitPrice || "0") <= 0}>
            {isPending ? "Saving..." : isEdit ? "Update Item" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
