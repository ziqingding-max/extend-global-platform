/**
 * CP Portal Wallet
 * 
 * View prepaid and deposit wallet balances and transaction history.
 */
import { useState } from "react";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet, Lock, ArrowUpRight, ArrowDownLeft, Loader2 } from "lucide-react";

const TX_TYPE_COLORS: Record<string, string> = {
  topup: "text-green-600",
  invoice_deduction: "text-red-600",
  refund: "text-blue-600",
  adjustment: "text-amber-600",
  freeze: "text-red-600",
  release: "text-green-600",
};

export default function CpPortalWallet() {
  const [txPage, setTxPage] = useState(1);
  const [frozenTxPage, setFrozenTxPage] = useState(1);

  const { data: prepaid, isLoading: prepaidLoading } = cpTrpc.wallet.getBalance.useQuery({});
  const { data: frozen, isLoading: frozenLoading } = cpTrpc.wallet.getFrozenBalance.useQuery({});
  const { data: txData, isLoading: txLoading } = cpTrpc.wallet.listTransactions.useQuery({
    page: txPage,
    pageSize: 20,
  });
  const { data: frozenTxData, isLoading: frozenTxLoading } = cpTrpc.wallet.listFrozenTransactions.useQuery({
    page: frozenTxPage,
    pageSize: 20,
  });

  const isLoading = prepaidLoading || frozenLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        <p className="text-muted-foreground">View your wallet balances and transaction history</p>
      </div>

      {/* Balance Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Prepaid Balance</CardTitle>
              <Wallet className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                ${Number(prepaid?.balance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {prepaid?.currency ?? "USD"} — Available for invoice payments
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Security Deposit</CardTitle>
              <Lock className="h-5 w-5 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                ${Number(frozen?.balance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {frozen?.currency ?? "USD"} — Held as security deposit
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transaction History */}
      <Tabs defaultValue="prepaid">
        <TabsList>
          <TabsTrigger value="prepaid">Prepaid Transactions</TabsTrigger>
          <TabsTrigger value="deposit">Deposit Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="prepaid">
          <Card>
            <CardHeader>
              <CardTitle>Prepaid Wallet Transactions</CardTitle>
              <CardDescription>{txData?.total ?? 0} transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {txLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txData?.items?.map((tx: any) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={TX_TYPE_COLORS[tx.transactionType] || ""}>
                              {tx.transactionType?.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{tx.description || "—"}</TableCell>
                          <TableCell className={`text-right font-mono ${Number(tx.amount) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {Number(tx.amount) >= 0 ? "+" : ""}
                            ${Number(tx.amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${Number(tx.balanceAfter ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!txData?.items || txData.items.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No transactions yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  {txData && txData.total > 20 && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <Button variant="outline" size="sm" disabled={txPage <= 1} onClick={() => setTxPage((p) => p - 1)}>
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {txPage} of {Math.ceil(txData.total / 20)}
                      </span>
                      <Button variant="outline" size="sm" disabled={txPage >= Math.ceil(txData.total / 20)} onClick={() => setTxPage((p) => p + 1)}>
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deposit">
          <Card>
            <CardHeader>
              <CardTitle>Security Deposit Transactions</CardTitle>
              <CardDescription>{frozenTxData?.total ?? 0} transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {frozenTxLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {frozenTxData?.items?.map((tx: any) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={TX_TYPE_COLORS[tx.transactionType] || ""}>
                              {tx.transactionType?.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{tx.description || "—"}</TableCell>
                          <TableCell className={`text-right font-mono ${Number(tx.amount) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {Number(tx.amount) >= 0 ? "+" : ""}
                            ${Number(tx.amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${Number(tx.balanceAfter ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!frozenTxData?.items || frozenTxData.items.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No deposit transactions yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  {frozenTxData && frozenTxData.total > 20 && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <Button variant="outline" size="sm" disabled={frozenTxPage <= 1} onClick={() => setFrozenTxPage((p) => p - 1)}>
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {frozenTxPage} of {Math.ceil(frozenTxData.total / 20)}
                      </span>
                      <Button variant="outline" size="sm" disabled={frozenTxPage >= Math.ceil(frozenTxData.total / 20)} onClick={() => setFrozenTxPage((p) => p + 1)}>
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
