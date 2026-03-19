/**
 * CP Portal Invoice Detail (Task Group D — Enhanced)
 *
 * View invoice details with line items.
 * For L2 (CP→Client) draft invoices, supports:
 * - Adding custom line items (consulting fees, markup, etc.)
 * - Removing mutable (CP-added) line items
 * - Sending invoice to client
 * - Marking as paid (manual offline confirmation)
 * - Sending overdue reminders
 */
import { useState } from "react";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { useBranding } from "@/hooks/useBranding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Send,
  Bell,
  Loader2,
  Plus,
  Trash2,
  Lock,
  CheckCircle,
  DollarSign,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_review: "bg-yellow-100 text-yellow-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  partially_paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  void: "bg-gray-100 text-gray-500",
};

const ITEM_TYPES = [
  { value: "consulting_fee", label: "Consulting Fee" },
  { value: "management_consulting_fee", label: "Management Consulting Fee" },
  { value: "eor_service_fee", label: "EOR Service Fee" },
  { value: "admin_setup_fee", label: "Admin Setup Fee" },
  { value: "onboarding_fee", label: "Onboarding Fee" },
  { value: "offboarding_fee", label: "Offboarding Fee" },
  { value: "hr_advisory_fee", label: "HR Advisory Fee" },
  { value: "legal_compliance_fee", label: "Legal Compliance Fee" },
  { value: "payroll_processing_fee", label: "Payroll Processing Fee" },
  { value: "tax_filing_fee", label: "Tax Filing Fee" },
  { value: "benefits_admin_fee", label: "Benefits Admin Fee" },
  { value: "bank_transfer_fee", label: "Bank Transfer Fee" },
  { value: "equipment_procurement_fee", label: "Equipment Procurement Fee" },
  { value: "visa_immigration_fee", label: "Visa / Immigration Fee" },
  { value: "relocation_fee", label: "Relocation Fee" },
  { value: "contract_termination_fee", label: "Contract Termination Fee" },
];

export default function CpPortalInvoiceDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const invoiceId = Number(params.id);
  const { branding } = useBranding();

  // Add Custom Item dialog
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    description: "",
    quantity: "1",
    unitPrice: "",
    itemType: "consulting_fee",
    vatRate: "0",
  });

  // Mark Paid dialog
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [markPaidAmount, setMarkPaidAmount] = useState("");
  const [markPaidNotes, setMarkPaidNotes] = useState("");

  const { data: invoice, isLoading, refetch } = cpTrpc.invoices.get.useQuery(
    { id: invoiceId },
    { enabled: !!invoiceId }
  );

  const sendMutation = cpTrpc.invoices.sendInvoice.useMutation({
    onSuccess: () => {
      toast.success("Invoice sent to client");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const reminderMutation = cpTrpc.invoices.sendOverdueReminder.useMutation({
    onSuccess: () => {
      toast.success("Overdue reminder sent");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addItemMutation = cpTrpc.invoices.addCustomItem.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Custom item added. New total: $${result.newTotal}`);
      setAddItemOpen(false);
      setNewItem({ description: "", quantity: "1", unitPrice: "", itemType: "consulting_fee", vatRate: "0" });
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const removeItemMutation = cpTrpc.invoices.removeCustomItem.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Item removed. New total: $${result.newTotal}`);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const markPaidMutation = cpTrpc.invoices.markPaid.useMutation({
    onSuccess: (result: any) => {
      toast.success(
        result.newStatus === "paid"
          ? "Invoice marked as fully paid"
          : `Partial payment recorded. Remaining: $${result.remainingDue}`
      );
      setMarkPaidOpen(false);
      setMarkPaidAmount("");
      setMarkPaidNotes("");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-24 text-muted-foreground">
        Invoice not found.
      </div>
    );
  }

  const companyName = branding?.companyName || "Extend Global";
  const isL2 = invoice.invoiceLayer === "cp_to_client";
  const isDraft = invoice.status === "draft";
  const canMarkPaid = isL2 && (invoice.status === "sent" || invoice.status === "overdue");
  const canSendReminder = isL2 && (invoice.status === "sent" || invoice.status === "overdue");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cp/invoices")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {invoice.invoiceNumber}
            </h1>
            <p className="text-muted-foreground">
              {invoice.customerName} — {invoice.invoiceMonth || "N/A"}
              {isL2 ? " (CP→Client)" : " (EG→CP)"}
            </p>
          </div>
          <Badge className={STATUS_COLORS[invoice.status] || ""} variant="outline">
            {invoice.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isL2 && isDraft && (
            <Button
              onClick={() => {
                if (confirm("Send this invoice to the client?")) {
                  sendMutation.mutate({ invoiceId: invoice.id });
                }
              }}
              disabled={sendMutation.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              Send Invoice
            </Button>
          )}
          {canMarkPaid && (
            <Button
              variant="outline"
              className="text-green-700 border-green-300 hover:bg-green-50"
              onClick={() => {
                setMarkPaidAmount(invoice.amountDue || invoice.total || "0");
                setMarkPaidNotes("");
                setMarkPaidOpen(true);
              }}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark Paid
            </Button>
          )}
          {canSendReminder && (
            <Button
              variant="outline"
              onClick={() => reminderMutation.mutate({ invoiceId: invoice.id })}
              disabled={reminderMutation.isPending}
            >
              <Bell className="h-4 w-4 mr-2" />
              Send Reminder
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Summary */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">From</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{companyName}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bill To</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{invoice.customerName}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Info (if paid/partially paid) */}
      {(invoice.status === "paid" || invoice.status === "partially_paid") && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-green-700 mb-2">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">
                {invoice.status === "paid" ? "Fully Paid" : "Partially Paid"}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Paid Amount</span>
                <div className="font-mono font-medium">
                  ${Number(invoice.paidAmount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Remaining Due</span>
                <div className="font-mono font-medium">
                  ${Number(invoice.amountDue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
              </div>
              {invoice.paidDate && (
                <div>
                  <span className="text-muted-foreground">Paid Date</span>
                  <div className="font-medium">
                    {new Date(invoice.paidDate).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Line Items</CardTitle>
          {isL2 && isDraft && (
            <Button size="sm" variant="outline" onClick={() => setAddItemOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Custom Item
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {isL2 && isDraft && <TableHead className="w-[60px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {item.isImmutableCost && (
                        <span title="Locked by EG (employment cost)"><Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /></span>
                      )}
                      <span>{item.description}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {item.itemType?.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {item.quantity || "1"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${Number(item.unitPrice ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${Number(item.amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </TableCell>
                  {isL2 && isDraft && (
                    <TableCell>
                      {!item.isImmutableCost ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Remove this line item?")) {
                              removeItemMutation.mutate({
                                invoiceId: invoice.id,
                                itemId: item.id,
                              });
                            }
                          }}
                          disabled={removeItemMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Locked</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {(!invoice.items || invoice.items.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    No line items.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <Separator className="my-4" />

          <div className="flex justify-end">
            <div className="space-y-1 text-right w-64">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">
                  ${Number(invoice.subtotal ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
              {invoice.tax && Number(invoice.tax) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-mono">
                    ${Number(invoice.tax).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {invoice.serviceFeeTotal && Number(invoice.serviceFeeTotal) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Service Fee</span>
                  <span className="font-mono">
                    ${Number(invoice.serviceFeeTotal).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span className="font-mono">
                  ${Number(invoice.total ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
              {invoice.amountDue && Number(invoice.amountDue) !== Number(invoice.total) && (
                <div className="flex items-center justify-between text-sm text-blue-600">
                  <span>Amount Due</span>
                  <span className="font-mono font-medium">
                    ${Number(invoice.amountDue).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ Add Custom Item Dialog ═══ */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add Custom Line Item
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Description *</Label>
              <Input
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="e.g., Monthly consulting fee — March 2025"
              />
            </div>
            <div className="space-y-2">
              <Label>Item Type</Label>
              <Select
                value={newItem.itemType}
                onValueChange={(v) => setNewItem({ ...newItem, itemType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Price ($) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newItem.unitPrice}
                  onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>VAT Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={newItem.vatRate}
                onChange={(e) => setNewItem({ ...newItem, vatRate: e.target.value })}
                placeholder="0"
              />
            </div>
            {newItem.unitPrice && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3">
                <div className="flex justify-between">
                  <span>Line Amount:</span>
                  <span className="font-mono font-medium">
                    ${(
                      (parseFloat(newItem.quantity) || 1) *
                      (parseFloat(newItem.unitPrice) || 0)
                    ).toFixed(2)}
                  </span>
                </div>
                {parseFloat(newItem.vatRate) > 0 && (
                  <div className="flex justify-between">
                    <span>+ VAT ({newItem.vatRate}%):</span>
                    <span className="font-mono">
                      ${(
                        (parseFloat(newItem.quantity) || 1) *
                        (parseFloat(newItem.unitPrice) || 0) *
                        (parseFloat(newItem.vatRate) / 100)
                      ).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                addItemMutation.mutate({
                  invoiceId: invoice.id,
                  description: newItem.description,
                  quantity: newItem.quantity,
                  unitPrice: newItem.unitPrice,
                  itemType: newItem.itemType as any,
                  vatRate: newItem.vatRate,
                });
              }}
              disabled={
                addItemMutation.isPending ||
                !newItem.description ||
                !newItem.unitPrice
              }
            >
              {addItemMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Plus className="w-4 h-4 mr-1" />
              )}
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Mark Paid Dialog ═══ */}
      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Mark Invoice as Paid
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Invoice: </span>
              <span className="font-mono font-medium">{invoice.invoiceNumber}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Total Amount: </span>
              <span className="font-bold">
                ${Number(invoice.total ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="space-y-2">
              <Label>Paid Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={markPaidAmount}
                onChange={(e) => setMarkPaidAmount(e.target.value)}
                placeholder="Enter amount received"
              />
              <p className="text-xs text-muted-foreground">
                Leave as total for full payment, or enter a partial amount.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={markPaidNotes}
                onChange={(e) => setMarkPaidNotes(e.target.value)}
                placeholder="e.g., Wire transfer received on 2025-03-15, Ref #12345"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                markPaidMutation.mutate({
                  invoiceId: invoice.id,
                  paidAmount: markPaidAmount || undefined,
                  notes: markPaidNotes || undefined,
                });
              }}
              disabled={markPaidMutation.isPending || !markPaidAmount}
              className="bg-green-600 hover:bg-green-700"
            >
              {markPaidMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-1" />
              )}
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
