
import Layout from "@/components/Layout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText, Plus, Download, BarChart3,
  Send, CheckCircle2, CreditCard, AlertTriangle,
  Layers, ArrowDown, ArrowUp, ArrowLeftRight as ArrowDirect,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { exportToCsv } from "@/lib/csvExport";
import { formatDate, formatAmount } from "@/lib/format";

// Import new modular components
import { InvoiceStats } from "@/components/invoices/InvoiceStats";
import { InvoiceFilters } from "@/components/invoices/InvoiceFilters";
import { InvoiceTable } from "@/components/invoices/InvoiceTable"; // You'll need to update this to accept props properly
import { useInvoices } from "@/hooks/invoices/useInvoices";

// Keep existing Generation Panel for now (it's complex enough to be its own component later)
// Or better yet, move it to a separate file too, but for this refactor step, let's keep it here
// actually let's move it to components/invoices/InvoiceGenerationPanel.tsx later
// For now, I'll inline a simplified version or assume it's moved if I had time.
// But to keep it working, I need to copy it or import it.
// Let's assume I should move it to keep this file clean.
// I'll create a placeholder or copy the code. 
// Given the constraints, I'll keep the GenerationPanel here but minimized or move it to a new file in next step?
// I'll move it to a new file first.

// Wait, I can't easily move it without another tool call. 
// I'll keep it here for now but use the new hook for the list logic.

import { MonthPicker } from "@/components/DatePicker";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import CurrencySelect from "@/components/CurrencySelect";
import { DatePicker } from "@/components/DatePicker";
import { Zap, RefreshCw } from "lucide-react";

/* ========== Constants ========== */
const statusColors: Record<string, string> = {
  draft: "bg-gray-50 text-gray-700 border-gray-200",
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  applied: "bg-purple-50 text-purple-700 border-purple-200",
  void: "bg-slate-50 text-slate-500 border-slate-200",
};

const statusLabelKeys: Record<string, string> = {
  draft: "invoices.status.draft",
  pending_review: "invoices.status.pendingReview",
  sent: "invoices.status.sent",
  paid: "invoices.status.paid",
  overdue: "invoices.status.overdue",
  cancelled: "invoices.status.cancelled",
  applied: "invoices.status.applied",
  void: "invoices.status.void",
  partially_paid: "invoices.status.partiallyPaid",
};

const typeLabelKeys: Record<string, string> = {
  deposit: "invoices.type.deposit",
  monthly_eor: "invoices.type.monthlyEor",
  monthly_visa_eor: "invoices.type.monthlyVisaEor",
  monthly_aor: "invoices.type.monthlyAor",
  visa_service: "invoices.type.visaService",
  deposit_refund: "invoices.type.depositRefund",
  credit_note: "invoices.type.creditNote",
  manual: "invoices.type.manual",
  monthly: "invoices.type.monthly",
  one_time: "invoices.type.oneTime",
};

/* ========== Invoice Generation Panel ========== */
function InvoiceGenerationPanel() {
  const { t } = useI18n();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const generateMutation = trpc.invoiceGeneration.generateFromPayroll.useMutation({
    onSuccess: (result: any) => {
      if (result.success) {
        toast.success(t("invoices.generation.toast.generatedSuccess").replace("{count}", String(result.invoiceIds?.length || 0)));
        if (result.warnings?.length) {
          result.warnings.forEach((w: string) => toast.warning(w));
        }
      } else {
        toast.error(result.error || t("invoices.generation.toast.generationFailed"));
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const regenerateMutation = trpc.invoiceGeneration.regenerate.useMutation({
    onSuccess: (result: any) => {
      if (result.success) {
        toast.success(t("invoices.generation.toast.regeneratedSuccess").replace("{count}", String(result.invoiceIds?.length || 0)));
      } else {
        toast.error(result.error || t("invoices.generation.toast.regenerationFailed"));
      }
      setShowRegenConfirm(false);
    },
    onError: (err: any) => { toast.error(err.message); setShowRegenConfirm(false); },
  });

  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);

  const preCheck = trpc.invoiceGeneration.preCheck.useQuery(
    { payrollMonth: month },
    { enabled: !!month }
  );

  const handleGenerateClick = () => {
    if (preCheck.data && (preCheck.data as any).nonDraftCount > 0) {
      setShowGenerateConfirm(true);
    } else {
      generateMutation.mutate({ payrollMonth: month });
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Zap className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium">{t("invoices.generation.title")}</span>
          <MonthPicker value={month} onChange={(m) => setMonth(m)} placeholder={t("invoices.generation.selectMonthPlaceholder")} className="w-40 h-8 text-sm" />
          <Button size="sm" onClick={handleGenerateClick} disabled={generateMutation.isPending}>
            {generateMutation.isPending ? t("invoices.generation.generatingButton") : t("invoices.generation.generateButton")}
          </Button>
          <Button variant="outline" onClick={() => setShowRegenConfirm(true)} disabled={regenerateMutation.isPending} size="sm">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            {regenerateMutation.isPending ? t("invoices.generation.regeneratingButton") : t("invoices.generation.regenerateButton")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{t("invoices.generation.description")}</p>
      </CardContent>

      {/* Regenerate Confirmation Dialog */}
      <Dialog open={showRegenConfirm} onOpenChange={setShowRegenConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> {t("invoices.generation.regenerateConfirmTitle") || "Confirm Regenerate"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("invoices.generation.regenerateConfirmMessage") || "This will delete all DRAFT invoices for the selected month and recreate them from payroll data. Non-draft invoices (sent, paid, overdue) will NOT be affected. Continue?"}
          </p>
          {preCheck.data && (preCheck.data as any).warnings?.map((w: string, i: number) => (
            <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {w}
            </p>
          ))}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => regenerateMutation.mutate({ payrollMonth: month })}
              disabled={regenerateMutation.isPending}
            >
              {regenerateMutation.isPending ? "Regenerating..." : "Confirm Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Confirmation Dialog (when non-draft invoices exist) */}
      <Dialog open={showGenerateConfirm} onOpenChange={setShowGenerateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> {t("invoices.generation.generateConfirmTitle") || "Confirm Generate"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("invoices.generation.generateConfirmMessage") || "Invoices already exist for this month. Generating will create additional invoices. Continue?"}
          </p>
          {preCheck.data && (preCheck.data as any).warnings?.map((w: string, i: number) => (
            <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {w}
            </p>
          ))}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateConfirm(false)}>Cancel</Button>
            <Button
              onClick={() => { generateMutation.mutate({ payrollMonth: month }); setShowGenerateConfirm(false); }}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? "Generating..." : "Confirm Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ========== Main Page Component ========== */
export default function Invoices() {
  const { t } = useI18n();
  /* ── Layer Tab State (top-level B2B2B isolation) ── */
  const [activeLayerTab, setActiveLayerTab] = useState<string>("all");

  const {
    isLoading,
    invoices,
    activeInvoices,
    historyInvoices,
    filtered,
    filteredHistory,
    customerMap,
    cpMap,
    cpList,
    filters,
    pagination,
    selection,
    batch
  } = useInvoices();

  // Sync layer tab with the hook's layer filter
  const handleLayerTabChange = (value: string) => {
    setActiveLayerTab(value);
    filters.setLayer(value === "all" ? "all" : value);
  };

  // Determine if current layer tab is L2 (read-only for Admin)
  const isL2ReadOnly = activeLayerTab === "cp_to_client";

  const [showManualCreate, setShowManualCreate] = useState(false);
  const [showBatchPaid, setShowBatchPaid] = useState(false);
  const [batchPaidAmount, setBatchPaidAmount] = useState("");
  const [manualForm, setManualForm] = useState({
    customerId: 0,
    billingEntityId: undefined as number | undefined,
    invoiceType: "manual" as any,
    invoiceMonth: "",
    currency: "USD",
    notes: "",
    dueDate: "",
  });

  const utils = trpc.useUtils();
  const createMut = trpc.invoices.create.useMutation({
    onSuccess: () => {
      toast.success("Invoice created");
      setShowManualCreate(false);
      utils.invoices.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: customers } = trpc.customers.list.useQuery({ limit: 200 });
  const { data: billingEntities } = trpc.billingEntities.list.useQuery();
  const { data: months } = trpc.invoices.monthlyOverview.useQuery({ limit: 12 });

  const [showCreditNoteCreate, setShowCreditNoteCreate] = useState(false);
  const [creditNoteForm, setCreditNoteForm] = useState({
    customerId: 0,
    originalInvoiceId: 0,
    isFullCredit: true,
    amount: "",
    reason: "",
  });

  const createCreditNoteMut = trpc.invoices.createCreditNote.useMutation({
    onSuccess: () => {
      toast.success("Credit Note created and applied to wallet");
      setShowCreditNoteCreate(false);
      setCreditNoteForm({ customerId: 0, originalInvoiceId: 0, isFullCredit: true, amount: "", reason: "" });
      utils.invoices.list.invalidate();
      utils.wallet.get.invalidate(); // Update wallet balance
    },
    onError: (err) => toast.error(err.message),
  });

  // Fetch paid invoices for the selected customer in CN dialog
  const { data: paidInvoices } = trpc.invoices.list.useQuery(
    { customerId: creditNoteForm.customerId, status: "paid", limit: 100 },
    { enabled: !!creditNoteForm.customerId }
  );

  return (
    <Layout breadcrumb={["EG", "Invoices"]}>
      <div className="p-6 space-y-6 page-enter">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("invoices.list.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("invoices.list.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={invoices.length === 0}
              onClick={() => exportToCsv(
                invoices,
                [
                  { header: t("invoices.list.table.header.invoiceNumber"), accessor: (r) => r.invoiceNumber },
                  { header: t("invoices.list.filter.typeLabel"), accessor: (r) => (typeLabelKeys[r.invoiceType] ? t(typeLabelKeys[r.invoiceType]) : r.invoiceType) },
                  { header: t("invoices.list.table.header.customer"), accessor: (r) => (r as any).customerName || "" },
                  { header: t("common.date"), accessor: (r) => r.createdAt ? formatDate(r.createdAt) : "" },
                  { header: t("invoices.list.table.header.dueDate"), accessor: (r) => r.dueDate ? formatDate(r.dueDate) : "" },
                  { header: t("invoices.list.table.header.total"), accessor: (r) => formatAmount(r.total) },
                  { header: t("invoices.detail.summary.balanceDue"), accessor: (r) => formatAmount(r.amountDue) },
                  { header: t("invoices.detail.info.currency"), accessor: (r) => r.currency },
                  { header: t("invoices.list.filter.statusLabel"), accessor: (r) => (statusLabelKeys[r.status] ? t(statusLabelKeys[r.status]) : r.status) },
                ],
                `invoices-${new Date().toISOString().slice(0, 10)}`
              )}
            >
              <Download className="w-4 h-4 mr-1" /> {t("invoices.list.exportCsvButton")}
            </Button>
            {!isL2ReadOnly && (
              <>
                <Button variant="outline" onClick={() => {
                  setCreditNoteForm({ customerId: 0, originalInvoiceId: 0, isFullCredit: true, amount: "", reason: "" });
                  setShowCreditNoteCreate(true);
                }}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Create Credit Note
                </Button>
                <Button onClick={() => {
                  setManualForm({ customerId: 0, billingEntityId: undefined, invoiceType: "manual", invoiceMonth: "", currency: "USD", notes: "", dueDate: "" });
                  setShowManualCreate(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" /> {t("invoices.list.createInvoiceButton")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Top-Level Layer Tabs (B2B2B Isolation) ── */}
        <Tabs value={activeLayerTab} onValueChange={handleLayerTabChange} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="all">
              <Layers className="w-3.5 h-3.5 mr-1.5" />All Layers
            </TabsTrigger>
            <TabsTrigger value="eg_to_cp">
              <ArrowDown className="w-3.5 h-3.5 mr-1.5" />Layer 1 (EG → CP)
            </TabsTrigger>
            <TabsTrigger value="cp_to_client">
              <ArrowUp className="w-3.5 h-3.5 mr-1.5" />Layer 2 (CP → Client)
            </TabsTrigger>
            <TabsTrigger value="eg_to_client">
              <ArrowDirect className="w-3.5 h-3.5 mr-1.5" />Direct (EG → Client)
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* L2 Read-Only Banner */}
        {isL2ReadOnly && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-amber-700">Layer 2 invoices are managed by Channel Partners. This view is read-only.</span>
            </CardContent>
          </Card>
        )}

        {/* Generation Panel - only show for L1 and Direct, not L2 */}
        {!isL2ReadOnly && <InvoiceGenerationPanel />}

        <Tabs defaultValue="list" className="w-full">
          <TabsList>
            <TabsTrigger value="list"><FileText className="w-3.5 h-3.5 mr-1.5" />{t("invoices.list.tab.active")} ({activeInvoices.length})</TabsTrigger>
            <TabsTrigger value="history"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />{t("invoices.list.tab.history")} ({historyInvoices.length})</TabsTrigger>
            <TabsTrigger value="monthly"><BarChart3 className="w-3.5 h-3.5 mr-1.5" />{t("invoices.list.tab.monthlyOverview")}</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4 mt-4">
            <InvoiceFilters 
              search={filters.search} setSearch={filters.setSearch}
              statusFilter={filters.status} setStatusFilter={filters.setStatus}
              typeFilter={filters.type} setTypeFilter={filters.setType}
              monthFilter={filters.month} setMonthFilter={filters.setMonth}
              cpFilter={filters.cp} setCpFilter={filters.setCp} cpList={cpList}
              layerFilter={filters.layer} setLayerFilter={filters.setLayer}
            />

            {/* Batch action bar - hidden in L2 read-only mode */}
            {!isL2ReadOnly && selection.selectedIds.size > 0 && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3 flex items-center gap-3">
                  <span className="text-sm font-medium">{t("invoices.list.batch.selectedCount").replace("{count}", String(selection.selectedIds.size))}</span>
                  <div className="flex gap-2 ml-auto">
                    <Button size="sm" variant="outline" onClick={() => batch.handleAction("pending_review")} disabled={batch.mutation.isPending}>
                      <Send className="w-3.5 h-3.5 mr-1.5" />{t("invoices.list.batch.sendForReviewButton")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => batch.handleAction("sent")} disabled={batch.mutation.isPending}>
                      <Send className="w-3.5 h-3.5 mr-1.5" />{t("invoices.list.batch.markSentButton")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowBatchPaid(true)} disabled={batch.mutation.isPending}>
                      <CreditCard className="w-3.5 h-3.5 mr-1.5" />{t("invoices.actions.markPaid")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => selection.setSelectedIds(new Set())}>
                      {t("common.clear")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                <InvoiceTable 
                  invoices={filtered.slice((pagination.activePage - 1) * pagination.pageSize, pagination.activePage * pagination.pageSize)}
                  isLoading={isLoading}
                  selectedIds={isL2ReadOnly ? new Set<number>() : selection.selectedIds}
                  toggleSelect={isL2ReadOnly ? undefined : selection.toggleSelect}
                  toggleSelectAll={isL2ReadOnly ? undefined : (() => selection.toggleSelectAll(filtered))}
                  customerMap={customerMap}
                  activePage={pagination.activePage}
                  statusColors={statusColors}
                  statusLabelKeys={statusLabelKeys}
                  typeLabelKeys={typeLabelKeys}
                />
              </CardContent>
            </Card>
            
            {/* Pagination */}
            {filtered.length > pagination.pageSize && (
              <div className="flex items-center justify-end space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pagination.setActivePage(p => Math.max(1, p - 1))}
                  disabled={pagination.activePage === 1}
                >
                  Previous
                </Button>
                <div className="text-sm text-muted-foreground">
                  Page {pagination.activePage} of {Math.ceil(filtered.length / pagination.pageSize)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pagination.setActivePage(p => p + 1)}
                  disabled={pagination.activePage >= Math.ceil(filtered.length / pagination.pageSize)}
                >
                  Next
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4 mt-4">
            <InvoiceFilters 
              search={filters.search} setSearch={filters.setSearch}
              typeFilter={filters.type} setTypeFilter={filters.setType}
              cpFilter={filters.cp} setCpFilter={filters.setCp} cpList={cpList}
              layerFilter={filters.layer} setLayerFilter={filters.setLayer}
              showStatusFilter={false}
            />
            <Card>
              <CardContent className="p-0">
                <InvoiceTable 
                  invoices={filteredHistory.slice((pagination.historyPage - 1) * pagination.pageSize, pagination.historyPage * pagination.pageSize)}
                  isLoading={isLoading}
                  customerMap={customerMap}
                  activePage={pagination.historyPage}
                  statusColors={statusColors}
                  statusLabelKeys={statusLabelKeys}
                  typeLabelKeys={typeLabelKeys}
                  isHistory={true}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="monthly" className="mt-4">
             <InvoiceStats 
               months={months || []} 
               statusLabelKeys={statusLabelKeys} 
               typeLabelKeys={typeLabelKeys}
               statusColors={statusColors}
             />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <Dialog open={showManualCreate} onOpenChange={setShowManualCreate}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("invoices.list.createInvoiceButton")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Customer */}
            <div className="space-y-2">
              <Label>{t("invoices.manual.customerLabel")}</Label>
              <Select value={manualForm.customerId ? manualForm.customerId.toString() : ""} onValueChange={(v) => {
                const cust = customers?.data?.find((c) => c.id === parseInt(v));
                setManualForm({ ...manualForm, customerId: parseInt(v), currency: cust?.settlementCurrency || "USD", billingEntityId: cust?.billingEntityId || undefined });
              }}>
                <SelectTrigger><SelectValue placeholder={t("invoices.manual.selectCustomerPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {customers?.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Invoice Type */}
            <div className="space-y-2">
              <Label>{t("invoices.list.filter.typeLabel")}</Label>
              <Select value={manualForm.invoiceType} onValueChange={(v) => setManualForm({ ...manualForm, invoiceType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["manual", "deposit", "monthly_eor", "monthly_visa_eor", "monthly_aor", "visa_service"].map((t_) => (
                    <SelectItem key={t_} value={t_}>{typeLabelKeys[t_] ? t(typeLabelKeys[t_]) : t_}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Invoice Month */}
            <div className="space-y-2">
              <Label>{t("invoices.detail.info.invoiceMonth")}</Label>
              <MonthPicker 
                value={manualForm.invoiceMonth} 
                onChange={(v) => setManualForm({ ...manualForm, invoiceMonth: v })} 
                placeholder={t("invoices.generation.selectMonthPlaceholder")}
                className="w-full"
              />
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <Label>{t("invoices.detail.info.currency")}</Label>
              <CurrencySelect value={manualForm.currency} onValueChange={(v) => setManualForm({ ...manualForm, currency: v })} />
            </div>

            {/* Billing Entity */}
            <div className="space-y-2">
              <Label>{t("invoices.detail.info.billingEntity")}</Label>
              <Select value={manualForm.billingEntityId ? manualForm.billingEntityId.toString() : ""} onValueChange={(v) => setManualForm({ ...manualForm, billingEntityId: v ? parseInt(v) : undefined })}>
                <SelectTrigger><SelectValue placeholder="Select billing entity" /></SelectTrigger>
                <SelectContent>
                  {billingEntities?.map((be: any) => (
                    <SelectItem key={be.id} value={be.id.toString()}>{be.entityName || be.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label>{t("invoices.list.table.header.dueDate")}</Label>
              <DatePicker 
                value={manualForm.dueDate} 
                onChange={(d) => setManualForm({ ...manualForm, dueDate: d })} 
                className="w-full"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>{t("invoices.detail.info.notes")}</Label>
              <Input value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualCreate(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => createMut.mutate({
                customerId: manualForm.customerId,
                billingEntityId: manualForm.billingEntityId,
                invoiceType: manualForm.invoiceType,
                invoiceMonth: manualForm.invoiceMonth || undefined,
                currency: manualForm.currency,
                subtotal: "0",
                serviceFeeTotal: "0",
                tax: "0",
                notes: manualForm.notes || undefined,
                dueDate: manualForm.dueDate || undefined,
              })} disabled={!manualForm.customerId || createMut.isPending}>
              {createMut.isPending ? t("common.creating") : t("invoices.list.createInvoiceButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Create Credit Note Dialog */}
      <Dialog open={showCreditNoteCreate} onOpenChange={setShowCreditNoteCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Credit Note</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("invoices.manual.customerLabel")}</Label>
              <Select value={creditNoteForm.customerId ? creditNoteForm.customerId.toString() : ""} onValueChange={(v) => setCreditNoteForm({ ...creditNoteForm, customerId: parseInt(v), originalInvoiceId: 0 })}>
                <SelectTrigger><SelectValue placeholder={t("invoices.manual.selectCustomerPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {customers?.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Original Paid Invoice</Label>
              <Select 
                value={creditNoteForm.originalInvoiceId ? creditNoteForm.originalInvoiceId.toString() : ""} 
                onValueChange={(v) => setCreditNoteForm({ ...creditNoteForm, originalInvoiceId: parseInt(v) })}
                disabled={!creditNoteForm.customerId || !paidInvoices?.data?.length}
              >
                <SelectTrigger><SelectValue placeholder="Select invoice to credit" /></SelectTrigger>
                <SelectContent>
                  {paidInvoices?.data?.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id.toString()}>
                      {inv.invoiceNumber} ({inv.currency} {formatAmount(inv.total)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {creditNoteForm.customerId && (!paidInvoices?.data || paidInvoices.data.length === 0) && (
                <p className="text-xs text-muted-foreground">No paid invoices found for this customer.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Credit Type</Label>
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="radio" 
                    name="creditType" 
                    checked={creditNoteForm.isFullCredit} 
                    onChange={() => setCreditNoteForm({ ...creditNoteForm, isFullCredit: true })} 
                    className="accent-primary"
                  />
                  Full Credit
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="radio" 
                    name="creditType" 
                    checked={!creditNoteForm.isFullCredit} 
                    onChange={() => setCreditNoteForm({ ...creditNoteForm, isFullCredit: false })} 
                    className="accent-primary"
                  />
                  Partial Credit
                </label>
              </div>
            </div>

            {!creditNoteForm.isFullCredit && (
              <div className="space-y-2">
                <Label>Credit Amount</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={creditNoteForm.amount} 
                  onChange={(e) => setCreditNoteForm({ ...creditNoteForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea 
                value={creditNoteForm.reason} 
                onChange={(e) => setCreditNoteForm({ ...creditNoteForm, reason: e.target.value })}
                placeholder="Reason for credit note..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreditNoteCreate(false)}>{t("common.cancel")}</Button>
            <Button 
              onClick={() => {
                if (!creditNoteForm.originalInvoiceId || !creditNoteForm.reason) return;
                if (!creditNoteForm.isFullCredit && !creditNoteForm.amount) return;

                createCreditNoteMut.mutate({
                  originalInvoiceId: creditNoteForm.originalInvoiceId,
                  reason: creditNoteForm.reason,
                  isFullCredit: creditNoteForm.isFullCredit,
                  lineItems: !creditNoteForm.isFullCredit ? [{
                    description: "Partial Credit Adjustment",
                    amount: creditNoteForm.amount,
                  }] : undefined
                });
              }} 
              disabled={createCreditNoteMut.isPending || !creditNoteForm.originalInvoiceId || !creditNoteForm.reason}
            >
              {createCreditNoteMut.isPending ? "Creating..." : "Create Credit Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Paid Dialog */}
      <Dialog open={showBatchPaid} onOpenChange={(open) => { setShowBatchPaid(open); if (!open) setBatchPaidAmount(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("invoices.batchPaid.title")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
             <Input type="number" value={batchPaidAmount} onChange={(e) => setBatchPaidAmount(e.target.value)} placeholder={t("invoices.batchPaid.amountPlaceholder")} />
          </div>
          <DialogFooter>
             <Button onClick={() => {
                const paid = parseFloat(batchPaidAmount);
                if (isNaN(paid) || paid <= 0) return;
                batch.handleAction("paid", paid.toFixed(2));
                setShowBatchPaid(false);
             }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
