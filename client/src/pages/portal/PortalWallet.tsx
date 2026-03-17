import { useState } from "react";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { formatCurrency, formatDateISO } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, CreditCard, ArrowDownLeft, ArrowUpRight, History, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function PortalWallet() {
  const { t } = useI18n();
  // TODO: Support multi-currency switching. For now default to USD.
  // In a real app, we should fetch available currencies for this customer.
  const [currency, setCurrency] = useState("USD");

  const { data: wallet, isLoading: isWalletLoading } = portalTrpc.wallet.get.useQuery({ currency });
  const { data: transactions, isLoading: isTxLoading } = portalTrpc.wallet.listTransactions.useQuery(
    { currency },
    { enabled: !!wallet }
  );

  const txTypeLabels: Record<string, string> = {
    credit_note_in: t("portal_wallet.transactions.type.refund"),
    overpayment_in: t("portal_wallet.transactions.type.deposit"),
    top_up: t("portal_wallet.transactions.type.deposit"),
    invoice_deduction: t("portal_wallet.transactions.type.applied"),
    invoice_refund: t("portal_wallet.transactions.type.refund"),
    manual_adjustment: t("portal_wallet.transactions.type.adjustment"),
    payout: t("portal_wallet.transactions.type.applied"),
  };

  return (
    <PortalLayout title={t("portal_wallet.title")}>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{t("portal_wallet.header.title")}</h1>
          <p className="text-muted-foreground">
            {t("portal_wallet.header.description")}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Wallet Balance Card */}
          <Card className="md:col-span-1 bg-primary/5 border-primary/20 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="w-4 h-4" /> {t("portal_wallet.overview.balance_title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isWalletLoading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <div className="space-y-1">
                  <div className="text-3xl font-bold tracking-tight text-primary">
                    {formatCurrency(currency, wallet?.balance || "0")}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("portal_wallet.overview.balance_description")}
                  </p>
                </div>
              )}
              
              <div className="mt-6 pt-6 border-t border-primary/10">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("portal_wallet.overview.current_balance")}</span>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="w-[80px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="CNY">CNY</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="SGD">SGD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Frozen Wallet (Deposits) Card */}
          <Card className="md:col-span-1 bg-indigo-50 border-indigo-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-indigo-700 flex items-center gap-2">
                <Wallet className="w-4 h-4" /> {t("portal_wallet.overview.total_deposited")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isWalletLoading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <div className="space-y-1">
                  <div className="text-3xl font-bold tracking-tight text-indigo-700">
                    {formatCurrency(currency, wallet?.frozenBalance || "0")}
                  </div>
                  <p className="text-xs text-indigo-600/80">
                    {t("portal_wallet.overview.total_applied")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats or Info */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> {t("portal_wallet.overview.quick_actions")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <div className="bg-emerald-100 text-emerald-700 p-2 rounded-full h-fit">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{t("portal_wallet.overview.make_deposit")}</p>
                  <p className="text-xs">{t("portal_wallet.overview.make_deposit_desc")}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="bg-indigo-100 text-indigo-700 p-2 rounded-full h-fit">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{t("portal_wallet.overview.contact_support")}</p>
                  <p className="text-xs">{t("portal_wallet.overview.contact_support_desc")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-4 h-4" /> {t("portal_wallet.transactions.title")}
            </CardTitle>
            <CardDescription>
              {t("portal_wallet.transactions.empty_desc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isTxLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !transactions || transactions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                {t("portal_wallet.transactions.empty_title")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("portal_wallet.transactions.table.date")}</TableHead>
                    <TableHead>{t("portal_wallet.transactions.table.type")}</TableHead>
                    <TableHead>{t("portal_wallet.transactions.table.description")}</TableHead>
                    <TableHead>{t("portal_wallet.transactions.table.actions")}</TableHead>
                    <TableHead className="text-right">{t("portal_wallet.transactions.table.amount")}</TableHead>
                    <TableHead className="text-right">{t("portal_wallet.overview.current_balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateISO(tx.createdAt)}
                      </TableCell>
                      <TableCell>
                        <TransactionTypeBadge type={tx.type} labels={txTypeLabels} />
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <div className="truncate font-medium">{tx.description}</div>
                        {tx.referenceId && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {t("portal_wallet.transactions.table.reference")}: {(tx as any).invoiceNumber || `${tx.referenceType} #${tx.referenceId}`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {tx.type === "credit_note_in" && tx.referenceId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => {
                              window.open(`/api/portal-invoices/${tx.referenceId}/pdf`, "_blank");
                            }}
                          >
                            <Download className="w-4 h-4 mr-1" />
                            {t("portal_wallet.transactions.download_credit_note")}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-medium ${
                        tx.direction === "credit" ? "text-emerald-600" : "text-red-600"
                      }`}>
                        {tx.direction === "credit" ? "+" : "-"}{formatCurrency(currency, tx.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatCurrency(currency, tx.balanceAfter)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}

function TransactionTypeBadge({ type, labels }: { type: string; labels: Record<string, string> }) {
  const styles: Record<string, string> = {
    credit_note_in: "bg-emerald-100 text-emerald-800 border-emerald-200",
    overpayment_in: "bg-blue-100 text-blue-800 border-blue-200",
    top_up: "bg-indigo-100 text-indigo-800 border-indigo-200",
    invoice_deduction: "bg-slate-100 text-slate-800 border-slate-200",
    invoice_refund: "bg-amber-100 text-amber-800 border-amber-200",
    manual_adjustment: "bg-purple-100 text-purple-800 border-purple-200",
    payout: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <Badge variant="outline" className={`font-normal border ${styles[type] || "bg-gray-100 text-gray-800"}`}>
      {labels[type] || type.replace(/_/g, " ")}
    </Badge>
  );
}
