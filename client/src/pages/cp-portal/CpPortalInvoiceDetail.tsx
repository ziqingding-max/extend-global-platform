/**
 * CP Portal Invoice Detail
 * 
 * View invoice details with line items, send/reminder actions.
 */
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { useBranding } from "@/hooks/useBranding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Send, Bell, Download, Loader2 } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-500",
};

export default function CpPortalInvoiceDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const invoiceId = Number(params.id);
  const { branding } = useBranding();

  const { data: invoice, isLoading, refetch } = cpTrpc.invoices.get.useQuery(
    { id: invoiceId },
    { enabled: !!invoiceId }
  );

  const sendMutation = cpTrpc.invoices.sendInvoice.useMutation({
    onSuccess: () => {
      toast.success("Invoice sent to client");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const reminderMutation = cpTrpc.invoices.sendOverdueReminder.useMutation({
    onSuccess: () => {
      toast.success("Overdue reminder sent");
    },
    onError: (err) => toast.error(err.message),
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cp/invoices")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {invoice.invoiceNumber}
            </h1>
            <p className="text-muted-foreground">
              {invoice.customerName} — {invoice.invoiceMonth}
            </p>
          </div>
          <Badge className={STATUS_COLORS[invoice.status] || ""} variant="outline">
            {invoice.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {invoice.status === "draft" && (
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
          {(invoice.status === "sent" || invoice.status === "overdue") && (
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

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items?.map((item: any, idx: number) => (
                <TableRow key={idx}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.itemType}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${Number(item.amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Separator className="my-4" />

          <div className="flex justify-end">
            <div className="space-y-1 text-right">
              <div className="flex items-center gap-8">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">
                  ${Number(invoice.subtotal ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
              {invoice.serviceFeeTotal && Number(invoice.serviceFeeTotal) > 0 && (
                <div className="flex items-center gap-8">
                  <span className="text-muted-foreground">Service Fee</span>
                  <span className="font-mono">
                    ${Number(invoice.serviceFeeTotal).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <Separator />
              <div className="flex items-center gap-8 text-lg font-bold">
                <span>Total</span>
                <span className="font-mono">
                  ${Number(invoice.amountDue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
