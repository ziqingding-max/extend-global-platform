import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { formatDate, formatMonth, formatAmount } from "@/lib/format";

interface InvoiceTableProps {
  invoices: any[];
  isLoading: boolean;
  selectedIds?: Set<number>;
  toggleSelect?: (id: number) => void;
  toggleSelectAll?: () => void;
  customerMap: Record<number, string>;
  activePage: number;
  statusColors: Record<string, string>;
  statusLabelKeys: Record<string, string>;
  typeLabelKeys: Record<string, string>;
  isHistory?: boolean;
}

export function InvoiceTable({
  invoices,
  isLoading,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  customerMap,
  activePage,
  statusColors,
  statusLabelKeys,
  typeLabelKeys,
  isHistory = false
}: InvoiceTableProps) {
  const [, setLocation] = useLocation();

  const handleRowClick = (id: number) => {
    setLocation(`/invoices/${id}?from_page=${activePage}`);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {!isHistory && selectedIds && (
            <TableHead className="w-10">
              <Checkbox
                checked={invoices.length > 0 && selectedIds.size === invoices.length}
                onCheckedChange={toggleSelectAll}
              />
            </TableHead>
          )}
          <TableHead>Invoice Number</TableHead>
          {!isHistory && <TableHead>Type</TableHead>}
          <TableHead>Customer</TableHead>
          {isHistory && <TableHead>Type</TableHead>}
          <TableHead>{isHistory ? "Period" : "Month"}</TableHead>
          <TableHead className={isHistory ? "text-right" : ""}>Total</TableHead>
          {isHistory ? (
            <TableHead className="text-right">Paid Amount</TableHead>
          ) : (
            <TableHead>Due Date</TableHead>
          )}
          <TableHead>Status</TableHead>
          {isHistory && <TableHead>Paid Date</TableHead>}
          <TableHead className="w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              {!isHistory && <TableCell><Skeleton className="h-4 w-4" /></TableCell>}
              {Array.from({ length: isHistory ? 8 : 7 }).map((_, j) => (
                <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
              ))}
              <TableCell></TableCell>
            </TableRow>
          ))
        ) : invoices.length > 0 ? (
          invoices.map((inv) => (
            <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleRowClick(inv.id)}>
              {!isHistory && selectedIds && toggleSelect && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(inv.id)}
                    onCheckedChange={() => toggleSelect(inv.id)}
                  />
                </TableCell>
              )}
              <TableCell className="font-medium text-sm">{inv.invoiceNumber}</TableCell>
              
              {!isHistory && (
                <TableCell>
                  <Badge variant="outline" className="text-xs">{(typeLabelKeys[inv.invoiceType] ? typeLabelKeys[inv.invoiceType] : inv.invoiceType)}</Badge>
                </TableCell>
              )}
              
              <TableCell className="text-sm">{customerMap[inv.customerId] || `Customer #${inv.customerId}`}</TableCell>
              
              {isHistory && (
                <TableCell>
                  <Badge variant="outline" className="text-xs">{(typeLabelKeys[inv.invoiceType] ? typeLabelKeys[inv.invoiceType] : inv.invoiceType)}</Badge>
                </TableCell>
              )}

              <TableCell className="text-sm">
                {inv.invoiceMonth ? formatMonth(inv.invoiceMonth) : "—"}
              </TableCell>

              <TableCell className={`text-sm font-mono ${isHistory ? "text-right" : ""} ${!isHistory && parseFloat(inv.total?.toString() || "0") < 0 ? "text-red-600" : ""}`}>
                {inv.currency} {formatAmount(inv.total)}
              </TableCell>

              {isHistory ? (
                <TableCell className="text-right font-mono text-sm">
                  {inv.paidAmount ? `${inv.currency} ${formatAmount(inv.paidAmount)}` : "—"}
                </TableCell>
              ) : (
                <TableCell className="text-sm">{["credit_note", "deposit_refund"].includes(inv.invoiceType) ? "N/A" : (inv.dueDate ? formatDate(inv.dueDate) : "")}</TableCell>
              )}

              <TableCell>
                <Badge variant="outline" className={`text-xs ${statusColors[inv.status] || ""}`}>{(statusLabelKeys[inv.status] ? statusLabelKeys[inv.status] : inv.status)}</Badge>
              </TableCell>

              {isHistory && (
                <TableCell className="text-sm text-muted-foreground">
                  {inv.paidDate ? formatDate(inv.paidDate) : "—"}
                </TableCell>
              )}

              <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={isHistory ? 9 : 9} className="text-center py-12">
              <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{isHistory ? "No invoice history found" : "No invoices found"}</p>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}