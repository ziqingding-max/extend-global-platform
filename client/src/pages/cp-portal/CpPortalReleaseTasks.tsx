/**
 * CP Portal — Release Tasks
 *
 * Allows CP to view and approve deposit release tasks for their end clients.
 * When an employee is terminated, a deposit_refund or credit_note is generated.
 * CP can approve the release disposition:
 *   - Release to Client's Main Wallet (available balance for future invoices)
 *   - Mark as Refunded to Bank (external bank transfer, no wallet credit)
 *
 * Design: Follows the same Glassmorphism + Swiss Typographic style as other CP Portal pages.
 */
import { useState, useMemo } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Clock,
  CheckCircle,
  Wallet,
  Landmark,
  AlertCircle,
  ArrowDownToLine,
  FileText,
  User,
} from "lucide-react";

function formatCurrency(amount: string | number, currency: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(Math.abs(num));
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { label: "Pending", variant: "secondary" },
    sent: { label: "Awaiting Approval", variant: "default" },
    pending_approval: { label: "Pending Approval", variant: "default" },
    paid: { label: "Processed", variant: "outline" },
    applied: { label: "Applied", variant: "outline" },
    cancelled: { label: "Cancelled", variant: "destructive" },
  };
  const info = map[status] || { label: status, variant: "secondary" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export default function CpPortalReleaseTasks() {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [disposition, setDisposition] = useState<"to_wallet" | "to_bank">("to_wallet");

  const utils = cpTrpc.useUtils();

  // Fetch release tasks
  const { data: taskData, isLoading } = cpTrpc.releaseTasks.list.useQuery({
    tab,
    page: 1,
    pageSize: 100,
  });

  // Fetch summary
  const { data: summary } = cpTrpc.releaseTasks.summary.useQuery();

  // Approve mutation
  const approveMut = cpTrpc.releaseTasks.approve.useMutation({
    onSuccess: () => {
      toast.success("Release task processed successfully");
      setShowApproveDialog(false);
      setSelectedTask(null);
      utils.releaseTasks.list.invalidate();
      utils.releaseTasks.summary.invalidate();
      utils.clientDeposits.listClientDeposits.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const tasks = taskData?.items || [];

  function openApproveDialog(task: any) {
    setSelectedTask(task);
    setDisposition("to_wallet");
    setShowApproveDialog(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Release Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage deposit releases for terminated employees. Approve how frozen deposits should be returned to clients.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Tasks</p>
                <p className="text-2xl font-bold">{summary?.pendingCount ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <ArrowDownToLine className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Amount</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(summary?.pendingAmount ?? 0, summary?.currency || "USD")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Processed</p>
                <p className="text-2xl font-bold">{summary?.processedCount ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tasks Table */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "history")}>
        <TabsList>
          <TabsTrigger value="pending">
            <Clock className="w-4 h-4 mr-2" />
            Pending ({summary?.pendingCount ?? 0})
          </TabsTrigger>
          <TabsTrigger value="history">
            <CheckCircle className="w-4 h-4 mr-2" />
            History ({summary?.processedCount ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    {tab === "pending" && <TableHead className="text-right">Actions</TableHead>}
                    {tab === "history" && <TableHead>Disposition</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                        Loading release tasks...
                      </TableCell>
                    </TableRow>
                  ) : tasks.length > 0 ? (
                    tasks.map((task: any) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-mono text-sm">{task.invoiceNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            <FileText className="w-3 h-3 mr-1" />
                            {task.invoiceType === "deposit_refund" ? "Deposit Refund" : "Credit Note"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{task.customerName || "—"}</TableCell>
                        <TableCell>
                          {task.employeeName ? (
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm">{task.employeeName}</span>
                              {task.employeeCode && (
                                <span className="text-xs text-muted-foreground">({task.employeeCode})</span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">
                          {formatCurrency(task.total, task.currency)}
                        </TableCell>
                        <TableCell>{statusBadge(task.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {task.createdAt
                            ? new Date(task.createdAt).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        {tab === "pending" && (
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => openApproveDialog(task)}
                            >
                              Review & Approve
                            </Button>
                          </TableCell>
                        )}
                        {tab === "history" && (
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {task.creditNoteDisposition === "to_bank" ? (
                                <><Landmark className="w-3 h-3 mr-1" />Bank Refund</>
                              ) : (
                                <><Wallet className="w-3 h-3 mr-1" />To Wallet</>
                              )}
                            </Badge>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                        <p>
                          {tab === "pending"
                            ? "No pending release tasks. All deposits are up to date."
                            : "No processed release tasks yet."}
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approval Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Deposit Release</DialogTitle>
            <DialogDescription>
              Decide how to process this release for{" "}
              <b>{selectedTask?.customerName}</b>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Task Summary */}
            <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-md border text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice:</span>
                <span className="font-medium font-mono">{selectedTask?.invoiceNumber}</span>
              </div>
              {selectedTask?.employeeName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee:</span>
                  <span className="font-medium">
                    {selectedTask.employeeName}
                    {selectedTask.employeeCode && ` (${selectedTask.employeeCode})`}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-bold text-emerald-600">
                  {selectedTask &&
                    formatCurrency(selectedTask.total, selectedTask.currency)}
                </span>
              </div>
            </div>

            {/* Disposition Selection */}
            <div className="space-y-3">
              <Label>Disposition Method</Label>
              <RadioGroup
                value={disposition}
                onValueChange={(v: any) => setDisposition(v)}
              >
                <div
                  className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
                    disposition === "to_wallet"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-slate-50 dark:hover:bg-slate-900/30"
                  }`}
                >
                  <RadioGroupItem value="to_wallet" id="r1" />
                  <Label htmlFor="r1" className="flex-1 cursor-pointer flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" />
                    <div>
                      <div className="font-medium">Credit to Main Wallet</div>
                      <div className="text-xs text-muted-foreground">
                        Funds become available balance for future invoices.
                      </div>
                    </div>
                  </Label>
                </div>

                <div
                  className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
                    disposition === "to_bank"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-slate-50 dark:hover:bg-slate-900/30"
                  }`}
                >
                  <RadioGroupItem value="to_bank" id="r2" />
                  <Label htmlFor="r2" className="flex-1 cursor-pointer flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-primary" />
                    <div>
                      <div className="font-medium">Refund to Bank</div>
                      <div className="text-xs text-muted-foreground">
                        Mark as refunded externally. No wallet credit.
                      </div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {disposition === "to_bank" && (
              <div className="flex items-start gap-2 text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Note: This action only records the refund in the system. You
                  must manually process the bank transfer to the client.
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                approveMut.mutate({
                  creditNoteId: selectedTask.id,
                  disposition,
                })
              }
              disabled={approveMut.isPending}
            >
              {approveMut.isPending ? "Processing..." : "Confirm & Process"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
