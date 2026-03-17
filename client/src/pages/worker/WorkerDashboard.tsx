import { workerTrpc } from "@/lib/workerTrpc";
import { workerPath } from "@/lib/workerBasePath";
import WorkerLayout from "./WorkerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, DollarSign, FileText, Flag, CalendarDays, Receipt, Wallet } from "lucide-react";
import { Link } from "wouter";

export default function WorkerDashboard() {
  const { data: user } = workerTrpc.auth.me.useQuery(undefined, { retry: false });
  const { data: summary, isLoading } = workerTrpc.dashboard.getSummary.useQuery();

  if (isLoading) {
    return (
      <WorkerLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </WorkerLayout>
    );
  }

  const greeting = user?.workerName ? `Welcome back, ${user.workerName.split(" ")[0]}` : "Welcome back";

  return (
    <WorkerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{greeting}</h1>
          <p className="text-muted-foreground mt-1">
            {summary?.workerType === "contractor" ? "Here's your contractor overview" : "Here's your employee overview"}
          </p>
        </div>

        {summary?.workerType === "contractor" && (
          <ContractorDashboard data={summary} />
        )}

        {summary?.workerType === "employee" && (
          <EmployeeDashboard data={summary} />
        )}
      </div>
    </WorkerLayout>
  );
}

function ContractorDashboard({ data }: { data: any }) {
  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Link href={workerPath("/milestones")}>
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Milestones</CardTitle>
              <Flag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.pendingMilestones}</div>
              <p className="text-xs text-muted-foreground">Awaiting submission or review</p>
            </CardContent>
          </Card>
        </Link>

        <Link href={workerPath("/invoices")}>
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.pendingInvoices}</div>
              <p className="text-xs text-muted-foreground">Waiting for approval</p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {parseFloat(data.totalPaid || "0").toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </div>
            <p className="text-xs text-muted-foreground">Lifetime earnings</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Invoices */}
      {data.recentInvoices && data.recentInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Invoices</CardTitle>
              <Link href={workerPath("/invoices")}>
                <a className="text-sm text-primary hover:underline">View all</a>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recentInvoices.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{inv.invoiceNumber || `INV-${inv.id}`}</p>
                    <p className="text-xs text-muted-foreground">{inv.invoiceDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {parseFloat(inv.totalAmount || "0").toLocaleString("en-US", { style: "currency", currency: inv.currency || "USD" })}
                    </p>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function EmployeeDashboard({ data }: { data: any }) {
  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Link href={workerPath("/leave")}>
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Leave</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.pendingLeave}</div>
              <p className="text-xs text-muted-foreground">Requests awaiting approval</p>
            </CardContent>
          </Card>
        </Link>

        <Link href={workerPath("/reimbursements")}>
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Expenses</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.pendingReimbursements}</div>
              <p className="text-xs text-muted-foreground">Reimbursements in review</p>
            </CardContent>
          </Card>
        </Link>

        <Link href={workerPath("/payslips")}>
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Latest Payslip</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {data.latestPayslip ? (
                <>
                  <div className="text-2xl font-bold">
                    {parseFloat(data.latestPayslip.netAmount || "0").toLocaleString("en-US", { style: "currency", currency: data.latestPayslip.currency || "USD" })}
                  </div>
                  <p className="text-xs text-muted-foreground">{data.latestPayslip.payPeriod}</p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">--</div>
                  <p className="text-xs text-muted-foreground">No payslips yet</p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    pending_approval: "bg-yellow-100 text-yellow-700",
    approved: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    submitted: "bg-yellow-100 text-yellow-700",
    client_approved: "bg-blue-100 text-blue-700",
    admin_approved: "bg-green-100 text-green-700",
    locked: "bg-green-100 text-green-700",
  };

  const labels: Record<string, string> = {
    draft: "Draft",
    pending_approval: "Pending",
    approved: "Approved",
    paid: "Paid",
    rejected: "Rejected",
    submitted: "Submitted",
    client_approved: "Client Approved",
    admin_approved: "Admin Approved",
    locked: "Locked",
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[status] || "bg-gray-100 text-gray-700"}`}>
      {labels[status] || status}
    </span>
  );
}
