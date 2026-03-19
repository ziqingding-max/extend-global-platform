/**
 * CP Portal Client Deposits (Task Group D)
 *
 * View and manage End Client deposit (frozen) wallets.
 * Shows deposit balances per client with drill-down to transaction history.
 */
import { useState } from "react";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import {
  Loader2,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  Shield,
} from "lucide-react";

const DIRECTION_COLORS: Record<string, string> = {
  credit: "text-green-600",
  debit: "text-red-600",
};

const TYPE_LABELS: Record<string, string> = {
  deposit_in: "Deposit Received",
  deposit_release: "Deposit Released",
  deposit_refund: "Deposit Refunded",
  deposit_deduction: "Deposit Deduction",
  manual_adjustment: "Manual Adjustment",
};

export default function CpPortalClientDeposits() {
  const [currency, setCurrency] = useState("USD");
  const [page, setPage] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  const { data, isLoading } = cpTrpc.clientDeposits.listClientDeposits.useQuery({
    currency,
    page,
    pageSize: 20,
  });

  const { data: summary } = cpTrpc.clientDeposits.summary.useQuery();

  const { data: historyData, isLoading: historyLoading } =
    cpTrpc.clientDeposits.getClientDepositHistory.useQuery(
      {
        customerId: selectedCustomerId!,
        currency,
        page: historyPage,
        pageSize: 20,
      },
      { enabled: !!selectedCustomerId }
    );

  const handleViewHistory = (customerId: number) => {
    setSelectedCustomerId(customerId);
    setHistoryPage(1);
    setHistoryOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          Client Deposits
        </h1>
        <p className="text-muted-foreground">
          View deposit (security) balances held for your clients
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Frozen Deposits</div>
              <div className="text-2xl font-bold text-amber-600">
                ${summary.totalFrozenUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Client Wallets</div>
              <div className="text-2xl font-bold text-blue-600">
                ${summary.totalMainUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Clients</div>
              <div className="text-2xl font-bold">{summary.clientCount}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Currency Filter */}
      <div className="flex items-center gap-4">
        <Select value={currency} onValueChange={(v) => { setCurrency(v); setPage(1); }}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="GBP">GBP</SelectItem>
            <SelectItem value="CNY">CNY</SelectItem>
            <SelectItem value="SGD">SGD</SelectItem>
            <SelectItem value="JPY">JPY</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Deposits Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Frozen Deposit</TableHead>
                  <TableHead className="text-right">Main Wallet</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items?.map((item: any) => (
                  <TableRow key={item.frozenWalletId}>
                    <TableCell className="font-medium">{item.customerName}</TableCell>
                    <TableCell>{item.currency}</TableCell>
                    <TableCell className="text-right font-mono font-medium text-amber-600">
                      ${Number(item.frozenBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${Number(item.mainBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewHistory(item.customerId)}
                      >
                        <History className="h-4 w-4 mr-1" />
                        History
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.items || data.items.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No client deposits found for {currency}.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(data.total / 20)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Transaction History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Deposit History — {historyData?.customerName || "Client"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Current Balance: </span>
              <span className="font-mono font-bold text-amber-600">
                ${Number(historyData?.balance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance After</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData?.items?.map((txn: any) => (
                    <TableRow key={txn.id}>
                      <TableCell className="text-sm">
                        {txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {txn.direction === "credit" ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-red-600" />
                          )}
                          <span className="text-xs">{TYPE_LABELS[txn.type] || txn.type}</span>
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-mono ${DIRECTION_COLORS[txn.direction] || ""}`}>
                        {txn.direction === "credit" ? "+" : "-"}$
                        {Number(txn.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${Number(txn.balanceAfter).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {txn.description || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!historyData?.items || historyData.items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        No transactions found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {/* History Pagination */}
            {historyData && historyData.total > 20 && (
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {historyPage} of {Math.ceil(historyData.total / 20)}
                </span>
                <Button variant="outline" size="sm" disabled={historyPage >= Math.ceil(historyData.total / 20)} onClick={() => setHistoryPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
