import { useState } from "react";
import Layout from "@/components/Layout";
import { formatDateTime } from "@/lib/format";
import { formatAuditDescription } from "@/lib/auditDescriptions";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TablePageSkeleton } from "@/components/PageSkeleton";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  delete: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  approve: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  reject: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  cancel: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  auto_fill: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  batch_create: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  generate: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  regenerate: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  auto_create: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  auto_lock_monthly: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  employee_auto_activated: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  fetch_live: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  initialize: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
  upsert: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  update_role: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  activate: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  deactivate: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  upload_receipt: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  payroll_submit_lock: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  batch_update: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
};

const ACTION_DISPLAY: Record<string, string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
  approve: "Approve",
  reject: "Reject",
  cancel: "Cancel",
  auto_fill: "Auto Fill",
  batch_create: "Batch Create",
  batch_update: "Batch Update",
  generate: "Generate",
  regenerate: "Regenerate",
  auto_create: "Auto Create",
  auto_lock_monthly: "Auto Lock Monthly",
  employee_auto_activated: "Employee Auto Activated",
  employee_auto_added_to_payroll: "Employee Auto Added To Payroll",
  payroll_run_auto_created: "Payroll Run Auto Created",
  employee_auto_on_leave: "Employee Auto On Leave",
  employee_auto_return_from_leave: "Employee Auto Return From Leave",
  fetch_live: "Fetch Live",
  initialize: "Initialize",
  upsert: "Upsert",
  update_role: "Update Role",
  activate: "Activate",
  deactivate: "Deactivate",
  upload_receipt: "Upload Receipt",
  payroll_submit_lock: "Payroll Submit Lock",
};

const ENTITY_TYPES = [
  "customer",
  "employee",
  "payroll_run",
  "payroll_item",
  "invoice",
  "adjustment",
  "leave_record",
  "country_config",
  "leave_type",
  "exchange_rate",
  "billing_entity",
  "employee_document",
  "employee_contract",
  "user",
  "system",
] as const;

const ACTION_FILTERS = ["create", "update", "delete", "approve", "reject", "cancel", "generate", "auto_fill", "auto_lock_monthly"] as const;

export default function AuditLogs({ embedded }: { embedded?: boolean } = {}) {
  const [filters, setFilters] = useState({
    entityType: "",
    action: "",
    limit: 100,
    offset: 0,
  });

  const { data: logsData, isLoading } = trpc.auditLogs.list.useQuery(filters);
  const logs = logsData?.data ?? [];
  const total = logsData?.total ?? 0;

  if (isLoading && logs.length === 0) {
    if (embedded) return <TablePageSkeleton />;
    return (
      <Layout title="Audit Logs" breadcrumb={["System", "Audit Logs"]}>
        <TablePageSkeleton />
      </Layout>
    );
  }

  const content = (
      <div className={embedded ? "space-y-6" : "p-6 space-y-6 page-enter"}>
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">Audit log details and history</p>
        </div>

        <div className="flex gap-3 items-center">
          <Select
            value={filters.entityType || "all"}
            onValueChange={(v) => setFilters(f => ({ ...f, entityType: v === "all" ? "" : v, offset: 0 }))}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Entities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {ENTITY_TYPES.map((entity) => (
                <SelectItem key={entity} value={entity}>
                  {{
                    customer: "Customer",
                    employee: "Employee",
                    payroll_run: "Payroll Run",
                    payroll_item: "Payroll Item",
                    invoice: "Invoice",
                    adjustment: "Adjustment",
                    leave_record: "Leave Record",
                    country_config: "Country Config",
                    leave_type: "Leave Type",
                    exchange_rate: "Exchange Rate",
                    billing_entity: "Billing Entity",
                    employee_document: "Employee Document",
                    employee_contract: "Employee Contract",
                    user: "User",
                    system: "System",
                  }[entity] || entity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.action || "all"}
            onValueChange={(v) => setFilters(f => ({ ...f, action: v === "all" ? "" : v, offset: 0 }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {ACTION_FILTERS.map((action) => (
                <SelectItem key={action} value={action}>
                  {{
                    create: "Create",
                    update: "Update",
                    delete: "Delete",
                    approve: "Approve",
                    reject: "Reject",
                    cancel: "Cancel",
                    generate: "Generate",
                    auto_fill: "Auto Fill",
                    auto_lock_monthly: "Auto Lock Monthly",
                  }[action] || action}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="text-sm text-muted-foreground ml-auto">
            {`Showing ${logs.length} of ${total}`}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium w-[160px]">Timestamp</th>
                    <th className="text-left p-3 font-medium w-[100px]">User</th>
                    <th className="text-left p-3 font-medium w-[110px]">Action</th>
                    <th className="text-left p-3 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => (
                    <tr key={log.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="p-3 text-sm">
                        {log.resolvedUserName || log.userName || (log.userId ? `User #${log.userId}` : "System")}
                      </td>
                      <td className="p-3">
                        <Badge className={`text-xs ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-800"}`} variant="outline">
                          {ACTION_DISPLAY[log.action] ? ACTION_DISPLAY[log.action] : log.action}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm">
                        {formatAuditDescription(log)}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">
                        <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        {isLoading ? "Loading..." : "No audit logs found"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {total > filters.limit && (
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.offset === 0}
              onClick={() => setFilters(f => ({ ...f, offset: Math.max(0, f.offset - f.limit) }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.offset + filters.limit >= total}
              onClick={() => setFilters(f => ({ ...f, offset: f.offset + f.limit }))}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    );

  if (embedded) return content;

  return (
    <Layout title="Audit Logs" breadcrumb={["System", "Audit Logs"]}>
      {content}
    </Layout>
  );
}