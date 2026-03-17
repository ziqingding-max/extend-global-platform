/**
 * EG Admin — Analyze / Create Vendor Bill (Full-Page)
 *
 * Unified full-page layout for both AI-parsed and manual bill creation.
 * Accessed via:
 *   /vendor-bills/new?mode=ai      → AI upload → parse → review → save
 *   /vendor-bills/new?mode=manual   → empty form → fill → save
 *
 * Key design decisions:
 *   - Full-page layout gives ample room for line-items table
 *   - Number inputs hide browser spin buttons via CSS
 *   - Long match-reason text shown in Tooltip, not inline
 *   - Confidence badge uses colour-coded system (green ≥85, yellow 50-84, red <50)
 *   - Upload area clearly warns: one vendor, one batch of related files per upload
 */
import Layout from "@/components/Layout";
import CurrencySelect from "@/components/CurrencySelect";
import { DatePicker, MonthPicker } from "@/components/DatePicker";
import { formatDate, formatAmount } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  ArrowLeft, Upload, Check, X, Loader2, Plus,
  DollarSign, FileText, Users, Info, AlertTriangle, FileUp, Paperclip,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Constants ─── */
const categoryKeys = [
  "payroll_processing", "social_contributions", "tax_filing", "legal_compliance",
  "visa_immigration", "hr_advisory", "it_services", "office_rent", "insurance",
  "bank_charges", "consulting", "equipment", "travel", "marketing", "other",
];
const itemTypeKeys = [
  "employment_cost", "service_fee", "visa_fee", "equipment_purchase", "deposit", "deposit_refund", "other",
];

/* ─── Types ─── */
interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  itemType: string;
  relatedEmployeeId?: string;
  employeeName?: string;
  relatedCountryCode?: string;
  matchConfidence?: number;
  matchReason?: string;
  confidence?: number;
}

/* ─── Helpers ─── */
const noSpin = "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function ConfidenceBadge({ score }: { score: number | null | undefined }) {
  const s = typeof score === "number" && !isNaN(score) ? score : -1;
  if (s < 0) return <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-300 text-[10px] px-1.5 whitespace-nowrap">N/A</Badge>;
  if (s >= 85) return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] px-1.5 whitespace-nowrap">{s}%</Badge>;
  if (s >= 50) return <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px] px-1.5 whitespace-nowrap">{s}%</Badge>;
  return <Badge variant="outline" className="bg-red-500/15 text-red-600 border-red-500/30 text-[10px] px-1.5 whitespace-nowrap">{s}%</Badge>;
}

function OverallConfidenceBanner({ cv, t }: { cv: any; t: (k: string) => string }) {
  if (!cv) return null;
  const score = typeof cv.overallConfidence === "number" ? cv.overallConfidence : 0;
  const warnings = Array.isArray(cv.warnings) ? cv.warnings : [];
  const bgClass = score >= 85 ? "bg-emerald-50 border-emerald-200" : score >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${bgClass}`}>
      <span className="text-sm font-medium">{t("vendorBills.review.overallConfidence")}</span>
      <ConfidenceBadge score={score} />
      {warnings.length > 0 && (
        <span className="text-xs text-amber-600 ml-auto flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          {t("vendorBills.review.warningsCount").replace("{count}", String(warnings.length))}
        </span>
      )}
    </div>
  );
}

/* ========== Bill Form Fields ========== */
function BillFormFields({ bill, onChange, vendors, t }: {
  bill: any; onChange: (b: any) => void; vendors: any[]; t: (k: string) => string;
}) {
  const set = (key: string, val: any) => onChange({ ...bill, [key]: val });
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{t("vendorBills.details.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-1">
            <Label className="text-xs">{t("vendorBills.detail.vendor")} *</Label>
            <Select value={bill.vendorId?.toString() || ""} onValueChange={(v) => set("vendorId", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t("vendorBills.createBill.selectVendor")} /></SelectTrigger>
              <SelectContent>
                {vendors.map((v: any) => (
                  <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1">
            <Label className="text-xs">{t("vendorBills.table.billNumberHeader")} *</Label>
            <Input value={bill.billNumber || ""} onChange={(e) => set("billNumber", e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="col-span-1">
            <Label className="text-xs">{t("vendorBills.createBill.billType")}</Label>
            <Select value={bill.billType || "operational"} onValueChange={(v) => set("billType", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="operational">{t("vendorBills.billType.operational")}</SelectItem>
                <SelectItem value="deposit">{t("vendorBills.billType.deposit")}</SelectItem>
                <SelectItem value="deposit_refund">{t("vendorBills.billType.deposit_refund")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1">
            <Label className="text-xs">{t("vendorBills.filters.allCategories")}</Label>
            <Select value={bill.category || "other"} onValueChange={(v) => set("category", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {categoryKeys.map((c) => (
                  <SelectItem key={c} value={c}>{t(`vendorBills.category.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">{t("vendorBills.details.serviceMonthLabel")}</Label>
            <MonthPicker value={bill.billMonth || ""} onChange={(v: string) => set("billMonth", v)} placeholder={t("vendorBills.details.serviceMonthPlaceholder")} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">{t("vendorBills.details.billDateLabel")}</Label>
            <DatePicker value={bill.billDate || ""} onChange={(d: string) => set("billDate", d)} placeholder={t("vendorBills.details.billDatePlaceholder")} />
          </div>
          <div>
            <Label className="text-xs">{t("vendorBills.details.dueDateLabel")}</Label>
            <DatePicker value={bill.dueDate || ""} onChange={(d: string) => set("dueDate", d)} placeholder={t("vendorBills.details.dueDatePlaceholder")} />
          </div>
          <div>
            <Label className="text-xs">{t("vendorBills.details.currencyLabel")}</Label>
            <CurrencySelect value={bill.currency || "USD"} onValueChange={(v) => set("currency", v)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">{t("vendorBills.details.subtotalLabel")}</Label>
            <Input type="number" step="0.01" value={bill.subtotal || ""} onChange={(e) => set("subtotal", e.target.value)} className={`h-8 text-sm ${noSpin}`} />
          </div>
          <div>
            <Label className="text-xs">{t("vendorBills.details.taxLabel")}</Label>
            <Input type="number" step="0.01" value={bill.tax || "0"} onChange={(e) => set("tax", e.target.value)} className={`h-8 text-sm ${noSpin}`} />
          </div>
          <div>
            <Label className="text-xs">{t("vendorBills.details.totalAmountLabel")} *</Label>
            <Input type="number" step="0.01" value={bill.totalAmount || ""} onChange={(e) => set("totalAmount", e.target.value)} className={`h-8 text-sm font-medium ${noSpin}`} />
          </div>
        </div>
        <div>
          <Label className="text-xs">{t("vendorBills.details.descriptionLabel")}</Label>
          <Textarea value={bill.description || ""} onChange={(e) => set("description", e.target.value)} rows={2} className="text-sm" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ========== Line Items Editor (Full-width) ========== */
function LineItemsEditor({ items, onChange, t, showConfidence = false }: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  t: (k: string) => string;
  showConfidence?: boolean;
}) {
  function addItem() {
    onChange([...items, { description: "", quantity: "1", unitPrice: "0", amount: "0", itemType: "other" }]);
  }
  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function updateItem(idx: number, field: string, value: string) {
    const n = [...items];
    n[idx] = { ...n[idx], [field]: value };
    if (field === "quantity" || field === "unitPrice") {
      const qty = parseFloat(field === "quantity" ? value : n[idx].quantity) || 0;
      const up = parseFloat(field === "unitPrice" ? value : n[idx].unitPrice) || 0;
      n[idx].amount = (qty * up).toFixed(2);
    }
    onChange(n);
  }

  const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" /> {t("vendorBills.createBill.lineItemsTitle")} ({items.length})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="w-3.5 h-3.5 mr-1" /> {t("vendorBills.createBill.addLineItem")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs min-w-[240px]">{t("vendorBills.details.descriptionLabel")}</TableHead>
                  <TableHead className="text-xs w-[150px]">{t("vendorBills.createBill.costType")}</TableHead>
                  <TableHead className="text-xs text-right w-[80px]">{t("vendorBills.lineItems.quantityHeader")}</TableHead>
                  <TableHead className="text-xs text-right w-[120px]">{t("vendorBills.lineItems.unitPriceHeader")}</TableHead>
                  <TableHead className="text-xs text-right w-[120px]">{t("vendorBills.lineItems.amountHeader")}</TableHead>
                  {showConfidence && <TableHead className="text-xs w-[200px]">{t("vendorBills.lineItems.employeeHeader")}</TableHead>}
                  {showConfidence && <TableHead className="text-xs text-center w-[70px]">{t("vendorBills.lineItems.confidenceHeader")}</TableHead>}
                  <TableHead className="w-[44px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => {
                  const mc = item.matchConfidence ?? item.confidence ?? 0;
                  const rowBg = showConfidence
                    ? mc >= 85 ? "bg-emerald-50/50" : mc >= 50 ? "bg-amber-50/50" : item.relatedEmployeeId ? "bg-red-50/50" : ""
                    : "";
                  return (
                    <TableRow key={idx} className={rowBg}>
                      <TableCell className="p-1.5">
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          className="h-8 text-sm"
                          placeholder="Description..."
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        <select
                          value={item.itemType || "other"}
                          onChange={(e) => updateItem(idx, "itemType", e.target.value)}
                          className="h-8 text-sm border rounded px-2 w-full bg-background"
                        >
                          {itemTypeKeys.map((k) => (
                            <option key={k} value={k}>{t(`vendorBills.itemType.${k}`)}</option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                          className={`h-8 text-sm text-right ${noSpin}`}
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Input
                          type="number" step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                          className={`h-8 text-sm text-right ${noSpin}`}
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Input
                          type="number" step="0.01"
                          value={item.amount}
                          onChange={(e) => updateItem(idx, "amount", e.target.value)}
                          className={`h-8 text-sm text-right font-medium ${noSpin}`}
                        />
                      </TableCell>
                      {showConfidence && (
                        <TableCell className="p-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm truncate max-w-[130px]">
                              {item.employeeName || "\u2014"}
                            </span>
                            {mc >= 85 && <span className="text-emerald-600 text-xs flex-shrink-0">●</span>}
                            {mc >= 50 && mc < 85 && <span className="text-amber-500 text-xs flex-shrink-0">●</span>}
                            {item.relatedEmployeeId && mc < 50 && <span className="text-red-500 text-xs flex-shrink-0">●</span>}
                            {item.matchReason && (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help flex-shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-xs">
                                    {item.matchReason}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                      )}
                      {showConfidence && (
                        <TableCell className="p-1.5 text-center">
                          <ConfidenceBadge score={mc} />
                        </TableCell>
                      )}
                      <TableCell className="p-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-right text-sm font-semibold">
                    {t("common.total")}
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold">{total.toFixed(2)}</TableCell>
                  {showConfidence && <TableCell colSpan={2}></TableCell>}
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{t("vendorBills.analyze.noLineItems")}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={addItem}>
              <Plus className="w-3.5 h-3.5 mr-1" /> {t("vendorBills.createBill.addLineItem")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ========== Payment Info Card ========== */
function PaymentInfoCard({ payment, onChange, onRemove, t }: {
  payment: any; onChange: (p: any) => void; onRemove: () => void; t: (k: string) => string;
}) {
  if (!payment) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> {t("vendorBills.payment.title")}
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={onRemove}>
            <X className="w-3.5 h-3.5 mr-1" />{t("vendorBills.payment.removeButton")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">{t("vendorBills.payment.dateLabel")}</Label>
            <DatePicker value={payment.paidDate || ""} onChange={(d: string) => onChange({ ...payment, paidDate: d })} placeholder={t("vendorBills.payment.datePlaceholder")} />
          </div>
          <div>
            <Label className="text-xs">{t("vendorBills.payment.paidAmountLabel")}</Label>
            <Input type="number" step="0.01" value={payment.paidAmount || ""} onChange={(e) => onChange({ ...payment, paidAmount: e.target.value })} className={`h-8 text-sm ${noSpin}`} />
          </div>
          <div>
            <Label className="text-xs">{t("vendorBills.payment.bankNameLabel")}</Label>
            <Input value={payment.bankName || ""} onChange={(e) => onChange({ ...payment, bankName: e.target.value })} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">{t("vendorBills.payment.transactionRefLabel")}</Label>
            <Input value={payment.bankReference || ""} onChange={(e) => onChange({ ...payment, bankReference: e.target.value })} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">{t("vendorBills.payment.bankFeeLabel")}</Label>
            <Input type="number" step="0.01" value={payment.bankFee || "0"} onChange={(e) => onChange({ ...payment, bankFee: e.target.value })} className={`h-8 text-sm ${noSpin}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ========== Allocation Suggestions Card ========== */
function AllocationSuggestions({ allocations, onChange, t }: {
  allocations: any[]; onChange: (a: any[]) => void; t: (k: string) => string;
}) {
  if (!allocations || allocations.length === 0) return null;
  const enabledCount = allocations.filter((a) => a.enabled).length;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Users className="w-4 h-4" />
          {t("vendorBills.review.aiAllocationsTitle")
            .replace("{enabled}", String(enabledCount))
            .replace("{total}", String(allocations.length))}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{t("vendorBills.review.aiAllocationsHint")}</p>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs w-10">{t("vendorBills.review.useHeader")}</TableHead>
                <TableHead className="text-xs">{t("vendorBills.lineItems.employeeHeader")}</TableHead>
                <TableHead className="text-xs">{t("vendorBills.review.invoiceHeader")}</TableHead>
                <TableHead className="text-xs text-right w-[140px]">{t("vendorBills.lineItems.amountHeader")}</TableHead>
                <TableHead className="text-xs">{t("vendorBills.review.reasonHeader")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((alloc, idx) => (
                <TableRow key={idx} className={alloc.enabled ? "" : "opacity-50"}>
                  <TableCell className="p-1.5">
                    <input type="checkbox" checked={alloc.enabled}
                      onChange={(e) => {
                        const n = [...allocations];
                        n[idx] = { ...n[idx], enabled: e.target.checked };
                        onChange(n);
                      }}
                      className="h-4 w-4 rounded border-gray-300" />
                  </TableCell>
                  <TableCell className="text-xs">ID: {alloc.employeeId}</TableCell>
                  <TableCell className="text-xs">ID: {alloc.invoiceId}</TableCell>
                  <TableCell className="p-1.5">
                    <Input type="number" step="0.01" value={alloc.allocatedAmount} onChange={(e) => {
                      const n = [...allocations];
                      n[idx] = { ...n[idx], allocatedAmount: e.target.value };
                      onChange(n);
                    }} className={`h-7 text-xs text-right ${noSpin}`} />
                  </TableCell>
                  <TableCell className="p-1.5">
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground truncate block max-w-[200px] cursor-help">
                            {alloc.reason || "\u2014"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-sm text-xs">
                          {alloc.reason || "\u2014"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ========== AI Upload Step ========== */
function AIUploadStep({ onParsed, t }: {
  onParsed: (result: any, serviceMonth: string) => void;
  t: (k: string) => string;
}) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [serviceMonth, setServiceMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.pdfParsing.uploadFile.useMutation();
  const parseMutation = trpc.pdfParsing.parseMultiFile.useMutation();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (pendingFiles.length + files.length > 10) {
      toast.error(t("vendorBills.toast.maxFiles"));
      return;
    }
    setPendingFiles((prev) => [...prev, ...files]);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAnalyze() {
    if (!serviceMonth) { toast.error(t("vendorBills.toast.selectMonth")); return; }
    if (pendingFiles.length === 0) { toast.error(t("vendorBills.toast.addFile")); return; }

    setIsParsing(true);
    try {
      // Step 1: Upload all files to OSS
      const uploadedFiles: Array<{ fileUrl: string; fileKey: string; fileName: string; fileType: "invoice" | "payment_receipt" | "statement" | "other" }> = [];
      for (const pf of pendingFiles) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(pf);
        });
        const uploadResult = await uploadMutation.mutateAsync({
          fileName: pf.name,
          fileBase64: base64,
          contentType: pf.type || "application/pdf",
        });
        uploadedFiles.push({
          fileUrl: uploadResult.url,
          fileKey: uploadResult.key,
          fileName: pf.name,
          fileType: "invoice",
        });
      }

      // Step 2: AI parse
      const result = await parseMutation.mutateAsync({
        files: uploadedFiles,
        serviceMonth,
      });

      onParsed(result, serviceMonth);
    } catch (err: any) {
      toast.error(err.message || t("vendorBills.toast.analysisFailed"));
      setIsParsing(false);
    }
  }

  if (isParsing) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">{t("vendorBills.review.aiAnalyzingDocs")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("vendorBills.analyze.parsingHint")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Important notice */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">{t("vendorBills.analyze.singleVendorWarningTitle")}</p>
          <p className="text-xs mt-1 text-amber-700">{t("vendorBills.analyze.singleVendorWarningDesc")}</p>
        </div>
      </div>

      {/* Service month */}
      <div>
        <Label className="text-sm font-medium">{t("vendorBills.details.serviceMonthLabel")}</Label>
        <p className="text-xs text-muted-foreground mb-2">{t("vendorBills.analyze.serviceMonthHint")}</p>
        <MonthPicker value={serviceMonth} onChange={(v: string) => setServiceMonth(v)} placeholder={t("vendorBills.details.serviceMonthPlaceholder")} className="max-w-[200px]" />
      </div>

      {/* Upload area */}
      <div>
        <Label className="text-sm font-medium">{t("vendorBills.analyze.uploadTitle")}</Label>
        <div
          className="mt-2 border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("vendorBills.aiUpload.dropzone")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("vendorBills.aiUpload.dropzoneHint")}</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* File list */}
      {pendingFiles.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {t("vendorBills.analyze.filesSelected").replace("{count}", String(pendingFiles.length))}
          </Label>
          {pendingFiles.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2">
                {i === 0 ? (
                  <Badge variant="outline" className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-[10px]">
                    {t("vendorBills.analyze.primaryFile")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-300 text-[10px]">
                    <Paperclip className="w-2.5 h-2.5 mr-0.5" />{t("vendorBills.analyze.attachment")}
                  </Badge>
                )}
                <span className="truncate max-w-[300px]">{f.name}</span>
                <span className="text-xs text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingFiles(pendingFiles.filter((_, j) => j !== i))}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Analyze button */}
      <Button onClick={handleAnalyze} disabled={pendingFiles.length === 0} className="w-full" size="lg">
        <FileUp className="w-5 h-5 mr-2" />{t("vendorBills.actions.analyzeWithAI")}
      </Button>
    </div>
  );
}

/* ========== Main Page Component ========== */
export default function AnalyzeBill() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const mode = params.get("mode") || "manual";

  // State
  const [step, setStep] = useState<"upload" | "form">(mode === "ai" ? "upload" : "form");
  const [parsedResult, setParsedResult] = useState<any>(null);
  const [bill, setBill] = useState<any>({
    vendorId: "", billNumber: "", category: "other", billType: "operational",
    billDate: "", dueDate: "", billMonth: "", currency: "USD",
    subtotal: "", tax: "0", totalAmount: "", description: "",
  });
  const [items, setItems] = useState<LineItem[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [payment, setPayment] = useState<any>(null);

  // Queries
  const vendorsQuery = trpc.vendors.list.useQuery({ limit: 500 });
  const vendors = useMemo(() => {
    const raw = (vendorsQuery.data as any)?.data || vendorsQuery.data || [];
    return Array.isArray(raw) ? raw : [];
  }, [vendorsQuery.data]);

  // Mutations
  const applyMutation = trpc.pdfParsing.applyMultiFileParse.useMutation();
  const createMutation = trpc.vendorBills.create.useMutation();

  // When AI parsing completes, populate form
  function handleAIParsed(result: any, serviceMonth: string) {
    setParsedResult(result);
    const p = result?.parsed;
    if (p) {
      setBill({
        vendorId: p.matchedVendorId?.toString() || "",
        billNumber: p.billNumber || "",
        category: p.category || "other",
        billType: p.billType || "operational",
        billDate: p.billDate || "",
        dueDate: p.dueDate || "",
        billMonth: serviceMonth,
        currency: p.currency || "USD",
        subtotal: p.subtotal?.toString() || "",
        tax: p.tax?.toString() || "0",
        totalAmount: p.totalAmount?.toString() || "",
        description: p.description || "",
        internalNotes: p.internalNotes || "",
      });
      setItems(
        (p.lineItems || []).map((li: any) => ({
          description: li.description || "",
          quantity: li.quantity?.toString() || "1",
          unitPrice: li.unitPrice?.toString() || "",
          amount: li.amount?.toString() || "0",
          itemType: li.itemType || "other",
          relatedEmployeeId: li.relatedEmployeeId?.toString() || "",
          employeeName: li.employeeName || "",
          relatedCountryCode: li.relatedCountryCode || "",
          matchConfidence: li.matchConfidence || 0,
          matchReason: li.matchReason || "",
          confidence: li.confidence || 0,
        }))
      );
      setAllocations(
        (p.suggestedAllocations || []).map((a: any) => ({ ...a, enabled: true }))
      );
      if (p.payment) {
        setPayment({ ...p.payment });
      }
    }
    setStep("form");
  }

  // Save bill
  async function handleSave() {
    if (!bill.vendorId) { toast.error(t("vendorBills.toast.selectVendor")); return; }
    if (!bill.billNumber) { toast.error(t("vendorBills.toast.billNumberRequired")); return; }
    if (!bill.totalAmount) { toast.error(t("vendorBills.toast.totalRequired")); return; }

    try {
      if (parsedResult) {
        // AI mode: use applyMultiFileParse
        await applyMutation.mutateAsync({
          vendorId: parseInt(bill.vendorId),
          billNumber: bill.billNumber,
          category: bill.category,
          billType: bill.billType || "operational",
          billDate: bill.billDate,
          dueDate: bill.dueDate,
          billMonth: bill.billMonth,
          currency: bill.currency,
          subtotal: bill.subtotal,
          tax: bill.tax || "0",
          totalAmount: bill.totalAmount,
          description: bill.description || "",
          items: items.map((item) => ({
            description: item.description,
            quantity: item.quantity || "1",
            unitPrice: item.unitPrice || item.amount,
            amount: item.amount,
            itemType: (item.itemType || "other") as "employment_cost" | "service_fee" | "visa_fee" | "equipment_purchase" | "deposit" | "deposit_refund" | "other",
            relatedEmployeeId: item.relatedEmployeeId ? parseInt(String(item.relatedEmployeeId)) : undefined,
            relatedCountryCode: item.relatedCountryCode || undefined,
          })),
          allocations: allocations.filter((a) => a.enabled).map((a) => ({
            invoiceId: a.invoiceId,
            employeeId: a.employeeId,
            allocatedAmount: a.allocatedAmount?.toString(),
            description: a.reason || "",
          })),
          paymentInfo: payment ? {
            paidDate: payment.paidDate,
            paidAmount: payment.paidAmount,
            bankName: payment.bankName || "",
            bankReference: payment.bankReference || "",
            bankFee: payment.bankFee || "0",
          } : undefined,
          receiptFileUrl: parsedResult?.files?.[0]?.fileUrl || undefined,
          receiptFileKey: parsedResult?.files?.[0]?.fileKey || undefined,
        });
      } else {
        // Manual mode: use vendorBills.create
        await createMutation.mutateAsync({
          vendorId: parseInt(bill.vendorId),
          billNumber: bill.billNumber,
          category: bill.category,
          billType: bill.billType || "operational",
          billDate: bill.billDate || new Date().toISOString().slice(0, 10),
          dueDate: bill.dueDate || undefined,
          billMonth: bill.billMonth || undefined,
          currency: bill.currency,
          subtotal: bill.subtotal || bill.totalAmount,
          tax: bill.tax || "0",
          totalAmount: bill.totalAmount,
          description: bill.description || "",
          items: items.length > 0 ? items.map((item) => ({
            description: item.description,
            quantity: item.quantity || "1",
            unitPrice: item.unitPrice || item.amount,
            amount: item.amount,
            itemType: (item.itemType || "other") as "employment_cost" | "service_fee" | "visa_fee" | "equipment_purchase" | "deposit" | "deposit_refund" | "other",
          })) : undefined,
        });
      }

      toast.success(t("vendorBills.toast.createdSuccess"));
      setLocation("/vendor-bills");
    } catch (err: any) {
      toast.error(err.message || t("vendorBills.toast.createFailed"));
    }
  }

  const isSaving = applyMutation.isPending || createMutation.isPending;
  const cv = parsedResult?.parsed?.crossValidation;
  const isAIMode = mode === "ai";
  const pageTitle = isAIMode ? t("vendorBills.analyze.aiTitle") : t("vendorBills.analyze.manualTitle");

  return (
    <Layout breadcrumb={["EG", t("vendorBills.title"), pageTitle]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/vendor-bills")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{pageTitle}</h1>
              <p className="text-sm text-muted-foreground">
                {isAIMode ? t("vendorBills.analyze.aiSubtitle") : t("vendorBills.analyze.manualSubtitle")}
              </p>
            </div>
          </div>
          {step === "form" && (
            <div className="flex gap-2">
              {isAIMode && (
                <Button variant="outline" onClick={() => {
                  setStep("upload");
                  setParsedResult(null);
                  setBill({ vendorId: "", billNumber: "", category: "other", billType: "operational", billDate: "", dueDate: "", billMonth: "", currency: "USD", subtotal: "", tax: "0", totalAmount: "", description: "" });
                  setItems([]);
                  setAllocations([]);
                  setPayment(null);
                }}>
                  <Upload className="w-4 h-4 mr-2" />{t("vendorBills.actions.backToUpload")}
                </Button>
              )}
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("vendorBills.actions.creatingBill")}</>
                ) : (
                  <><Check className="w-4 h-4 mr-2" />{t("vendorBills.actions.createBill")}</>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* AI Upload Step */}
        {step === "upload" && (
          <AIUploadStep onParsed={handleAIParsed} t={t} />
        )}

        {/* Form Step (shared by AI review + manual) */}
        {step === "form" && (
          <div className="space-y-5">
            {/* Overall confidence (AI only) */}
            <OverallConfidenceBanner cv={cv} t={t} />

            {/* AI Notes (if any) */}
            {cv?.notes?.length > 0 && (
              <div className="p-3 rounded-lg bg-muted/50 border space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t("vendorBills.review.aiNotes")}</p>
                {cv.notes.map((n: string, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground">{n}</p>
                ))}
              </div>
            )}

            {/* Bill Details */}
            <BillFormFields bill={bill} onChange={setBill} vendors={vendors} t={t} />

            {/* Payment Info (AI detected) */}
            <PaymentInfoCard payment={payment} onChange={setPayment} onRemove={() => setPayment(null)} t={t} />

            {/* Line Items */}
            <LineItemsEditor items={items} onChange={setItems} t={t} showConfidence={!!parsedResult} />

            {/* Allocation Suggestions (AI only) */}
            <AllocationSuggestions allocations={allocations} onChange={setAllocations} t={t} />

            {/* Bottom save button (for long forms) */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setLocation("/vendor-bills")}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={isSaving} size="lg">
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("vendorBills.actions.creatingBill")}</>
                ) : (
                  <><Check className="w-4 h-4 mr-2" />{t("vendorBills.actions.createBill")}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
