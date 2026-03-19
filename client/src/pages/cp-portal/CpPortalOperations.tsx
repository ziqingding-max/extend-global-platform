/**
 * CP Portal Operations Overview (Task Group E)
 *
 * Read-only dashboard for CP to track operational data:
 * - Payroll items (employee pay details)
 * - Leave records
 * - Adjustments (bonuses, allowances, deductions)
 * - Reimbursements
 *
 * Organized as tabbed views with summary cards at the top.
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
  Loader2,
  Activity,
  Users,
  Calendar,
  DollarSign,
  Receipt,
} from "lucide-react";

type OpsTab = "payroll" | "leave" | "adjustments" | "reimbursements";

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-yellow-100 text-yellow-700",
  client_approved: "bg-blue-100 text-blue-700",
  client_rejected: "bg-red-100 text-red-700",
  admin_approved: "bg-green-100 text-green-700",
  admin_rejected: "bg-red-100 text-red-700",
  locked: "bg-gray-100 text-gray-700",
  draft: "bg-gray-100 text-gray-700",
  pending_approval: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function CpPortalOperations() {
  const [tab, setTab] = useState<OpsTab>("payroll");
  const [page, setPage] = useState(1);

  const { data: summary, isLoading: summaryLoading } = cpTrpc.operations.summary.useQuery();

  const { data: payrollData, isLoading: payrollLoading } = cpTrpc.operations.listPayrollItems.useQuery(
    { page, pageSize: 20 },
    { enabled: tab === "payroll" }
  );

  const { data: leaveData, isLoading: leaveLoading } = cpTrpc.operations.listLeaveRecords.useQuery(
    { page, pageSize: 20 },
    { enabled: tab === "leave" }
  );

  const { data: adjData, isLoading: adjLoading } = cpTrpc.operations.listAdjustments.useQuery(
    { page, pageSize: 20 },
    { enabled: tab === "adjustments" }
  );

  const { data: reimbData, isLoading: reimbLoading } = cpTrpc.operations.listReimbursements.useQuery(
    { page, pageSize: 20 },
    { enabled: tab === "reimbursements" }
  );

  const tabs = [
    { key: "payroll" as OpsTab, label: "Payroll", icon: DollarSign },
    { key: "leave" as OpsTab, label: "Leave", icon: Calendar },
    { key: "adjustments" as OpsTab, label: "Adjustments", icon: Activity },
    { key: "reimbursements" as OpsTab, label: "Reimbursements", icon: Receipt },
  ];

  const isTabLoading =
    (tab === "payroll" && payrollLoading) ||
    (tab === "leave" && leaveLoading) ||
    (tab === "adjustments" && adjLoading) ||
    (tab === "reimbursements" && reimbLoading);

  const currentData =
    tab === "payroll" ? payrollData :
    tab === "leave" ? leaveData :
    tab === "adjustments" ? adjData :
    reimbData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" />
          Operations Overview
        </h1>
        <p className="text-muted-foreground">
          Track payroll, leave, adjustments, and reimbursements for your employees
        </p>
      </div>

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-muted-foreground">Active Employees</span>
              </div>
              <div className="text-2xl font-bold mt-1">{summary.activeEmployees}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-600" />
                <span className="text-sm text-muted-foreground">Pending Leaves</span>
              </div>
              <div className="text-2xl font-bold mt-1">{summary.pendingLeaves}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-600" />
                <span className="text-sm text-muted-foreground">Pending Adjustments</span>
              </div>
              <div className="text-2xl font-bold mt-1">{summary.pendingAdjustments}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Pending Reimbursements</span>
              </div>
              <div className="text-2xl font-bold mt-1">{summary.pendingReimbursements}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b pb-3">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <Button
              key={t.key}
              variant={tab === t.key ? "default" : "outline"}
              size="sm"
              onClick={() => { setTab(t.key); setPage(1); }}
              className="gap-1.5"
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </Button>
          );
        })}
      </div>

      {/* Tab Content */}
      {isTabLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Payroll Tab */}
            {tab === "payroll" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Employer Cost</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollData?.items?.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.employeeName}</TableCell>
                      <TableCell>{item.customerName}</TableCell>
                      <TableCell>{item.payrollMonth}</TableCell>
                      <TableCell>{item.countryCode}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${Number(item.gross ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${Number(item.net ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${Number(item.totalEmploymentCost ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[item.payrollStatus] || ""} variant="outline">
                          {item.payrollStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!payrollData?.items || payrollData.items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No payroll items found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {/* Leave Tab */}
            {tab === "leave" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveData?.items?.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.employeeName}</TableCell>
                      <TableCell>{item.startDate}</TableCell>
                      <TableCell>{item.endDate}</TableCell>
                      <TableCell className="text-right">{item.days}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.reason || "—"}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[item.status] || ""} variant="outline">
                          {item.status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!leaveData?.items || leaveData.items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No leave records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {/* Adjustments Tab */}
            {tab === "adjustments" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjData?.items?.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.employeeName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {item.adjustmentType?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.category?.replace(/_/g, " ") || "—"}</TableCell>
                      <TableCell>{item.effectiveMonth}</TableCell>
                      <TableCell className="text-right font-mono">
                        {item.currency} {Number(item.amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[item.status] || ""} variant="outline">
                          {item.status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!adjData?.items || adjData.items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No adjustments found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {/* Reimbursements Tab */}
            {tab === "reimbursements" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reimbData?.items?.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.employeeName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {item.category?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.effectiveMonth}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {item.currency} {Number(item.amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[item.status] || ""} variant="outline">
                          {item.status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!reimbData?.items || reimbData.items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No reimbursements found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {currentData && currentData.total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(currentData.total / 20)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(currentData.total / 20)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
