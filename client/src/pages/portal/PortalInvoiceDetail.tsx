/**
 * Portal Invoice Detail Page
 *
 * Full-page invoice view with:
 * - Status mapping: sent→Issued, applied→Applied (grey)
 * - Color system: green=favorable, yellow=pending, red=urgent, grey=inactive
 * - Credit Note balance display (Original / Applied / Remaining)
 * - Credit Note application history (where it was applied)
 * - Applied Credit Notes section (which CNs were applied to this invoice)
 * - Related Documents (bidirectional: parent + children via relatedInvoiceId)
 * - Payment breakdown with Balance Due
 */
import { useParams, useLocation } from "wouter";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { portalPath } from "@/lib/portalBasePath";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Download, FileText, CreditCard, CalendarDays,
  Hash, Clock, CheckCircle, AlertCircle,
  Receipt, Info, ExternalLink,
  ArrowRight, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";

/* ─── Status Config ──────────────────────────────────────────────────────── */

// statusLabels built with t() inside component

const statusColors: Record<string, string> = {
  sent: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  void: "bg-gray-100 text-gray-500 border-gray-200",
  applied: "bg-gray-100 text-gray-500 border-gray-200",
};

// invoiceTypeLabels built with t() inside component

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function PortalInvoiceDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const invoiceId = parseInt(params.id || "0", 10);

  const statusLabels: Record<string, string> = {
    sent: "Issued",
    paid: "Paid",
    overdue: "Overdue",
    cancelled: "Cancelled",
    void: "Void",
    applied: "Applied",
  };
  const invoiceTypeLabels: Record<string, string> = {
    deposit: "Deposit",
    monthly_eor: "Monthly EOR",
    monthly_visa_eor: "Monthly Visa EOR",
    monthly_aor: "Monthly AOR",
    visa_service: "Visa Service",
    deposit_refund: "Deposit Refund",
    credit_note: "Credit Note",
    manual: "Manual Invoice",
  };

  const { data, isLoading } = portalTrpc.invoices.detail.useQuery(
    { id: invoiceId },
    { enabled: !!invoiceId }
  );

  // Bug 2: Fetch wallet balance for "Pay with Wallet" feature
  const { data: walletData } = portalTrpc.wallet.get.useQuery(
    { currency: data?.currency || "USD" },
    { enabled: !!data && data.balanceDue > 0 }
  );
  const walletBalance = walletData ? parseFloat(walletData.balance) : 0;

  const utils = portalTrpc.useUtils();
  const walletPayMutation = portalTrpc.wallet.payWithWallet.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Payment of ${data?.currency || ""} ${result.deducted} applied successfully`
      );
      // Refresh invoice detail and wallet balance
      utils.invoices.detail.invalidate({ id: invoiceId });
      utils.wallet.get.invalidate();
    },
    onError: (err: any) => {
      toast.error(err.message || "Payment failed");
    },
  });

  function handleDownload() {
    window.open(`/api/portal-invoices/${invoiceId}/pdf`, "_blank");
  }

  function navigateToInvoice(id: number) {
    setLocation(portalPath(`/invoices/${id}`));
  }

  // Loading state
  if (isLoading) {
    return (
      <PortalLayout title="Invoice Details">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-48" />
              <Skeleton className="h-64" />
            </div>
            <Skeleton className="h-80" />
          </div>
        </div>
      </PortalLayout>
    );
  }

  // Not found
  if (!data) {
    return (
      <PortalLayout title="Invoice Details">
        <div className="p-6 max-w-5xl mx-auto">
          <Button variant="ghost" size="sm" onClick={() => setLocation(portalPath("/invoices"))} className="mb-6 gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to Finance
          </Button>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-1">Invoice Not Found</h3>
              <p className="text-sm text-muted-foreground">The invoice you are looking for does not exist or you do not have permission to view it.</p>
            </CardContent>
          </Card>
        </div>
      </PortalLayout>
    );
  }

  const isCreditNote = data.invoiceType === "credit_note";
  const isDepositRefund = data.invoiceType === "deposit_refund";
  const isDeposit = data.invoiceType === "deposit";
  const isCredit = isCreditNote || isDepositRefund;

  // Status display
  let statusLabel = statusLabels[data.status] || data.status;
  let statusColor = statusColors[data.status] || "";

  if (data.isPartiallyPaid) {
    statusLabel = "Partially Paid";
    statusColor = "bg-orange-50 text-orange-700 border-orange-200";
  } else if (data.isOverpaid) {
    statusLabel = "Paid";
    statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  // Credit note active status = green
  if (isCreditNote && data.status !== "applied" && data.status !== "cancelled" && data.status !== "void") {
    statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
    // Credit Note Apply removed — credit notes go through Release Tasks → Wallet
  }

  // Banner color
  const bannerColor = isCreditNote
    ? (data.status === "applied" ? "from-gray-500 to-gray-600" : "from-emerald-600 to-emerald-700")
    : isDepositRefund
      ? "from-emerald-600 to-emerald-700"
      : data.isPartiallyPaid
        ? "from-orange-500 to-orange-600"
        : data.status === "paid"
          ? "from-emerald-600 to-emerald-700"
          : data.status === "overdue"
            ? "from-red-600 to-red-700"
            : "from-primary to-primary/90";

  // Banner label and value
  let bannerLabel = "Amount Due";
  let bannerValue = formatCurrency(data.currency, data.balanceDue);

  if (isCreditNote) {
    bannerLabel = "Credit Amount";
    bannerValue = formatCurrency(data.currency, Math.abs(Number(data.total)));
  } else if (isDepositRefund) {
    bannerLabel = "Refund Amount";
    bannerValue = formatCurrency(data.currency, Math.abs(Number(data.total)));
  } else if (data.status === "paid" && !data.isPartiallyPaid) {
    bannerLabel = "Total Paid";
    bannerValue = formatCurrency(data.currency, data.paidAmount || data.total);
  } else if (data.isPartiallyPaid) {
    bannerLabel = "Remaining Balance";
    const remaining = Number(data.amountDue || data.total) - Number(data.paidAmount || 0);
    bannerValue = formatCurrency(data.currency, Math.max(0, remaining));
  } else if (data.status === "cancelled" || data.status === "void") {
    bannerLabel = "Total Amount";
    bannerValue = formatCurrency(data.currency, data.total);
  }

  const paidAmt = data.paidAmount != null ? Number(data.paidAmount) : 0;
  const effectiveDue = data.amountDue != null ? Number(data.amountDue) : Number(data.total);

  return (
    <PortalLayout title="Invoice Details">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Back Navigation */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation(portalPath("/invoices"))}
          className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Finance
        </Button>

        {/* Invoice Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight font-mono">
                {data.invoiceNumber || `INV-${data.id}`}
              </h1>
              <Badge variant="outline" className={cn("text-sm px-3 py-1", statusColor)}>
                {statusLabel}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {invoiceTypeLabels[data.invoiceType] || data.invoiceType}
              {data.invoiceMonth && (
                <> &middot; {new Date(data.invoiceMonth).toLocaleDateString("en-US", { year: "numeric", month: "long" })}</>
              )}
            </p>
          </div>
          <Button onClick={handleDownload} className="gap-2 shrink-0">
            <Download className="w-4 h-4" /> Download PDF
          </Button>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Invoice Metadata */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <MetaField icon={CalendarDays} label="Issue Date" value={formatDate(data.sentDate)} />
                  <MetaField icon={Clock} label="Due Date" value={formatDate(data.dueDate)} />
                  <MetaField icon={CreditCard} label="Currency" value={data.currency || "USD"} />
                  <MetaField icon={FileText} label="Reference" value={data.invoiceNumber || "-"} mono />
                </div>
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-muted-foreground" />
                  Line Items
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="pl-6 min-w-[240px]">Description</TableHead>
                        <TableHead className="text-center">Currency</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right pr-6">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.items || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No line items found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (data.items || []).map((item: any, idx: number) => (
                          <TableRow key={item.id || idx}>
                            <TableCell className="pl-6">
                              <div>
                                <Badge variant="outline" className="text-xs font-medium mb-0.5">
                                  {item.itemType?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "-"}
                                </Badge>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-sm font-mono">
                              {item.localCurrency || data.currency || "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm tabular-nums">
                              {item.quantity || 1}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm tabular-nums">
                              {formatCurrency(item.localCurrency || data.currency, item.unitPrice)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-medium pr-6 tabular-nums">
                              {formatCurrency(item.localCurrency || data.currency, item.localAmount || item.amount)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Credit Note Apply sections removed — credit notes now go through Release Tasks → Wallet */}

            {/* Related Documents (bidirectional via relatedInvoiceId) */}
            {(data.relatedDocuments?.parent || (data.relatedDocuments?.children && data.relatedDocuments.children.length > 0)) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-muted-foreground" />
                    Related Documents
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Parent document */}
                  {data.relatedDocuments.parent && (
                    <RelatedDocLink
                      doc={data.relatedDocuments.parent}
                      currency={data.currency}
                      statusLabels={statusLabels}
                      relationship={
                        isCreditNote ? "Source Invoice" :
                        isDepositRefund ? "Original Deposit" :
                        data.invoiceType === "manual" ? "Original Invoice" :
                        "Related Document"
                      }
                      onClick={() => navigateToInvoice(data.relatedDocuments.parent.id)}
                    />
                  )}
                  {/* Child documents */}
                  {data.relatedDocuments.children?.map((child: any) => (
                    <RelatedDocLink
                      key={child.id}
                      doc={child}
                      currency={data.currency}
                      statusLabels={statusLabels}
                      relationship={
                        child.invoiceType === "credit_note" ? "Overpayment Credit Note" :
                        child.invoiceType === "deposit_refund" ? "Deposit Refund" :
                        child.invoiceType === "manual" ? "Follow-up Invoice (Underpayment)" :
                        "Related Document"
                      }
                      onClick={() => navigateToInvoice(child.id)}
                    />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {data.notes && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{data.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column — Financial Summary */}
          <div className="space-y-6">
            {/* Total Banner */}
            <Card className={cn(
              "overflow-hidden",
              data.isPartiallyPaid && "ring-2 ring-orange-200"
            )}>
              <div className={cn("px-6 py-5 bg-gradient-to-br", bannerColor)}>
                <p className="text-xs font-medium text-white/70 uppercase tracking-wider mb-1">
                  {bannerLabel}
                </p>
                <p className="text-3xl font-bold text-white font-mono tabular-nums">
                  {bannerValue}
                </p>
              </div>

              <CardContent className="pt-5 space-y-4">
                {/* Breakdown */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Subtotal</span>
                    <span className="text-sm font-mono tabular-nums">{formatCurrency(data.currency, data.subtotal)}</span>
                  </div>

                  {Number(data.serviceFeeTotal) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Service Fees</span>
                      <span className="text-sm font-mono tabular-nums">{formatCurrency(data.currency, data.serviceFeeTotal)}</span>
                    </div>
                  )}

                  {Number(data.tax) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Tax / VAT</span>
                      <span className="text-sm font-mono tabular-nums">{formatCurrency(data.currency, data.tax)}</span>
                    </div>
                  )}

                  <Separator />

                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold">Total</span>
                    <span className={cn("text-sm font-mono font-semibold tabular-nums", isCredit && "text-emerald-600")}>
                      {isCredit && "-"}{formatCurrency(data.currency, Math.abs(Number(data.total)))}
                    </span>
                  </div>

                  {/* Wallet Applied */}
                  {data.walletAppliedAmount != null && Number(data.walletAppliedAmount) > 0 && (
                    <div className="flex justify-between items-center text-blue-600">
                      <span className="text-sm">Wallet Applied</span>
                      <span className="text-sm font-mono tabular-nums">- {formatCurrency(data.currency, data.walletAppliedAmount)}</span>
                    </div>
                  )}

                  {/* Amount Due (after wallet deduction) */}
                  {data.amountDue != null && Number(data.amountDue) !== Number(data.total) && !isCreditNote && (
                    <>
                      <Separator />
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold">Amount Due</span>
                        <span className="text-sm font-mono font-semibold tabular-nums text-amber-600">
                          {formatCurrency(data.currency, data.amountDue)}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Paid */}
                  {paidAmt > 0 && (
                    <div className="flex justify-between items-center text-emerald-600">
                      <span className="text-sm">Paid</span>
                      <span className="text-sm font-mono tabular-nums">{formatCurrency(data.currency, paidAmt)}</span>
                    </div>
                  )}

                  {/* Balance Due */}
                  {!isCreditNote && !isDepositRefund && data.balanceDue > 0 && (
                    <>
                      <Separator />
                      <div className={cn(
                        "flex justify-between items-center",
                        data.status === "overdue" ? "text-red-600" : "text-amber-600"
                      )}>
                        <span className="text-sm font-semibold">Balance Due</span>
                        <span className="text-sm font-mono font-semibold tabular-nums">{formatCurrency(data.currency, data.balanceDue)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Partial Payment Alert */}
                {data.isPartiallyPaid && (
                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                    <div className="flex gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-orange-800">Partial Payment Received</p>
                        <p className="text-xs text-orange-600 mt-0.5">
                          A partial payment has been received for this invoice. The remaining balance is due by the due date.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Overpayment Info */}
                {data.isOverpaid && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="flex gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-emerald-800">Overpayment Received</p>
                        <p className="text-xs text-emerald-600 mt-0.5">
                          An overpayment has been received for this invoice. The excess amount has been credited to your wallet.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Credit Note Balance Card removed — credit notes go through Release Tasks → Wallet */}

            {/* Payment Details Card */}
            {data.paidDate && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Payment Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Payment Date</span>
                    <span className="text-sm">{formatDate(data.paidDate)}</span>
                  </div>
                  {paidAmt > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Amount Received</span>
                      <span className="text-sm font-mono tabular-nums">{formatCurrency(data.currency, paidAmt)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Bug 2: Pay with Wallet */}
            {!isCreditNote && !isDepositRefund && data.balanceDue > 0 && walletBalance > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Pay with Wallet
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Available Balance</span>
                    <span className="text-sm font-mono tabular-nums text-emerald-600">{formatCurrency(data.currency, walletBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Will Deduct</span>
                    <span className="text-sm font-mono tabular-nums">
                      {formatCurrency(data.currency, Math.min(walletBalance, data.balanceDue))}
                    </span>
                  </div>
                  <Button
                    className="w-full gap-2"
                    variant="default"
                    disabled={walletPayMutation.isPending}
                    onClick={() => {
                      if (confirm(`Apply ${formatCurrency(data.currency, Math.min(walletBalance, data.balanceDue))} from wallet to this invoice?`)) {
                        walletPayMutation.mutate({ invoiceId: data.id });
                      }
                    }}
                  >
                    <CreditCard className="w-4 h-4" />
                    {walletPayMutation.isPending
                      ? "Processing..."
                      : "Pay with Wallet"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Download */}
            <Button onClick={handleDownload} variant="outline" className="w-full gap-2">
              <Download className="w-4 h-4" /> Download PDF
            </Button>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function MetaField({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <p className={cn("text-sm font-medium", mono && "font-mono")}>{value}</p>
    </div>
  );
}

function RelatedDocLink({
  doc,
  relationship,
  onClick,
  currency,
  statusLabels,
}: {
  doc: { id: number; invoiceNumber: string; invoiceType: string; total: string; status: string };
  relationship: string;
  onClick: () => void;
  currency?: string;
  statusLabels: Record<string, string>;
}) {
  const isCredit = doc.invoiceType === "credit_note" || doc.invoiceType === "deposit_refund";
  const statusLabel = statusLabels[doc.status] || doc.status;
  const statusColor = statusColors[doc.status] || "";

  return (
    <div
      className="flex items-center justify-between p-4 rounded-xl border hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium font-mono">{doc.invoiceNumber}</span>
          <Badge variant="outline" className={cn("text-xs", statusColor)}>{statusLabel}</Badge>
          <ExternalLink className="w-3 h-3 text-muted-foreground/60" />
        </div>
        <p className="text-xs text-muted-foreground pl-6">{relationship}</p>
      </div>
      <span className={cn(
        "font-mono text-sm font-medium tabular-nums",
        isCredit ? "text-emerald-600" : ""
      )}>
        {isCredit ? "-" : ""}{formatCurrency(currency, Math.abs(Number(doc.total)))}
      </span>
    </div>
  );
}