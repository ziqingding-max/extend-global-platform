/**
 * CP Wallets — Standalone Admin Page
 *
 * Provides a dedicated view for managing all Channel Partner wallets.
 * Previously this was only accessible via the ChannelPartners detail tab.
 * This page gives Finance Managers a consolidated overview of all CP wallet balances,
 * with quick actions for top-up, adjustment, and frozen wallet release.
 *
 * Design: Corporate Precision — Swiss International Typographic Style
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Wallet,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  Unlock,
  Landmark,
  Building2,
  RefreshCw,
} from "lucide-react";

function formatCurrency(amount: string | number, currency: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(num);
}

export default function CpWallets() {
  const [search, setSearch] = useState("");
  const [actionDialog, setActionDialog] = useState<{
    type: "topUp" | "adjust" | "release";
    cpId: number;
    cpName: string;
    currency: string;
  } | null>(null);
  const [actionAmount, setActionAmount] = useState("");
  const [actionReason, setActionReason] = useState("");

  // Fetch all CPs with their wallets
  const { data: cpList, isLoading: cpLoading } = trpc.channelPartners.list.useQuery({
    limit: 200,
    includeInternal: true,
  });

  // For each CP, we'll fetch wallet data individually
  // But for the list view, we'll use a summary approach
  const filteredCps = useMemo(() => {
    const items = (cpList as any)?.data || cpList || [];
    if (!search) return items;
    return items.filter((cp: any) =>
      cp.companyName?.toLowerCase().includes(search.toLowerCase())
    );
  }, [cpList, search]);

  // Top-up mutation
  const topUpMutation = trpc.channelPartners.wallet.topUp.useMutation({
    onSuccess: () => {
      toast.success("Wallet topped up successfully");
      setActionDialog(null);
      setActionAmount("");
      setActionReason("");
    },
    onError: (err) => toast.error(err.message),
  });

  // Manual adjustment mutation
  const adjustMutation = trpc.channelPartners.wallet.manualAdjustment.useMutation({
    onSuccess: () => {
      toast.success("Adjustment applied successfully");
      setActionDialog(null);
      setActionAmount("");
      setActionReason("");
    },
    onError: (err) => toast.error(err.message),
  });

  // Release frozen mutation
  const releaseMutation = trpc.channelPartners.wallet.releaseFrozen.useMutation({
    onSuccess: () => {
      toast.success("Frozen funds released successfully");
      setActionDialog(null);
      setActionAmount("");
      setActionReason("");
    },
    onError: (err) => toast.error(err.message),
  });

  function handleAction() {
    if (!actionDialog || !actionAmount || !actionReason) {
      toast.error("Please fill in all fields");
      return;
    }
    if (actionDialog.type === "topUp") {
      topUpMutation.mutate({
        channelPartnerId: actionDialog.cpId,
        currency: actionDialog.currency,
        amount: actionAmount,
        description: actionReason,
      });
    } else if (actionDialog.type === "adjust") {
      adjustMutation.mutate({
        channelPartnerId: actionDialog.cpId,
        currency: actionDialog.currency,
        amount: actionAmount,
        direction: "credit" as const,
        description: actionReason,
      });
    } else if (actionDialog.type === "release") {
      releaseMutation.mutate({
        channelPartnerId: actionDialog.cpId,
        currency: actionDialog.currency,
        amount: actionAmount,
        reason: actionReason,
      });
    }
  }

  const isPending = topUpMutation.isPending || adjustMutation.isPending || releaseMutation.isPending;

  return (
    <Layout breadcrumb={["Partner Hub", "CP Wallets"]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">CP Wallets</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage prepaid wallets and frozen deposits for all Channel Partners.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search partners..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* CP Wallet Cards */}
        {cpLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading wallets...</div>
        ) : filteredCps.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Landmark className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
            <p>No channel partners found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCps.map((cp: any) => (
              <CpWalletRow
                key={cp.id}
                cp={cp}
                onAction={(type, currency) =>
                  setActionDialog({
                    type,
                    cpId: cp.id,
                    cpName: cp.companyName,
                    currency: currency || cp.settlementCurrency || "USD",
                  })
                }
              />
            ))}
          </div>
        )}

        {/* Action Dialog */}
        <Dialog open={!!actionDialog} onOpenChange={(open) => { if (!open) setActionDialog(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionDialog?.type === "topUp" && "Top Up Wallet"}
                {actionDialog?.type === "adjust" && "Manual Adjustment"}
                {actionDialog?.type === "release" && "Release Frozen Funds"}
              </DialogTitle>
              <DialogDescription>
                {actionDialog?.cpName} — {actionDialog?.currency}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Amount ({actionDialog?.currency})</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Enter reason for this transaction..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
              <Button onClick={handleAction} disabled={isPending}>
                {isPending ? "Processing..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

/**
 * Individual CP Wallet Row — fetches wallet data for a single CP
 */
function CpWalletRow({
  cp,
  onAction,
}: {
  cp: any;
  onAction: (type: "topUp" | "adjust" | "release", currency: string) => void;
}) {
  const currency = cp.settlementCurrency || "USD";
  const { data: walletData, isLoading } = trpc.channelPartners.wallet.get.useQuery({
    channelPartnerId: cp.id,
    currency,
  });

  const mainBalance = walletData?.main?.balance || "0.00";
  const frozenBalance = walletData?.frozen?.balance || "0.00";

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          {/* CP Info */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm truncate">{cp.companyName}</h3>
                {cp.isInternal && (
                  <Badge variant="outline" className="text-[10px] px-1.5">EG-DIRECT</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{currency}</p>
            </div>
          </div>

          {/* Balances — EG-DIRECT wallets show N/A (EG doesn't need to prepay to itself) */}
          <div className="flex items-center gap-8">
            {cp.isInternal ? (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Wallet Status</p>
                <p className="text-sm text-muted-foreground italic">N/A — EG internal entity</p>
              </div>
            ) : (
              <>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Prepaid Balance</p>
                  <p className={`text-lg font-bold ${parseFloat(mainBalance) > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {isLoading ? "..." : formatCurrency(mainBalance, currency)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Frozen Deposit</p>
                  <p className={`text-lg font-bold ${parseFloat(frozenBalance) > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                    {isLoading ? "..." : formatCurrency(frozenBalance, currency)}
                  </p>
                </div>

                {/* Actions — hidden for EG-DIRECT */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction("topUp", currency)}
                    title="Top Up"
                  >
                    <ArrowUpCircle className="w-4 h-4 mr-1.5" />
                    Top Up
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction("adjust", currency)}
                    title="Adjust"
                  >
                    <ArrowDownCircle className="w-4 h-4 mr-1.5" />
                    Adjust
                  </Button>
                  {parseFloat(frozenBalance) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAction("release", currency)}
                      title="Release Frozen"
                    >
                      <Unlock className="w-4 h-4 mr-1.5" />
                      Release
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
