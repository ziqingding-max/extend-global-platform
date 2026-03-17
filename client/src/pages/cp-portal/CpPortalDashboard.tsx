/**
 * CP Portal Dashboard
 * 
 * Overview page showing key metrics: active clients, pending invoices,
 * wallet balance, and recent activity.
 * Full implementation in PR 4.2.
 */
import { useBranding } from "@/hooks/useBranding";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Receipt, Wallet, TrendingUp, Loader2 } from "lucide-react";

export default function CpPortalDashboard() {
  const { branding } = useBranding();

  // Fetch dashboard data
  const { data: invoiceStats, isLoading: invoiceLoading } = cpTrpc.invoices.summary.useQuery({});
  const { data: prepaidWallet, isLoading: walletLoading } = cpTrpc.wallet.getBalance.useQuery({});
  const { data: clients, isLoading: clientsLoading } = cpTrpc.clients.list.useQuery({
    page: 1,
    pageSize: 1,
  });

  const isLoading = invoiceLoading || walletLoading || clientsLoading;

  const companyName = branding?.companyName || "Partner Portal";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to {companyName}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clients?.total ?? 0}</div>
              <p className="text-xs text-muted-foreground">Active end clients</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{invoiceStats?.invoiceCount?.sent ?? 0}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${Number(prepaidWallet?.balance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">{prepaidWallet?.currency ?? "USD"} prepaid</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue MTD</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${Number(invoiceStats?.totalPaidThisMonth ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">Paid invoices this month</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
