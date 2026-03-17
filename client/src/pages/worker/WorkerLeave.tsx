import { useState } from "react";
import { workerTrpc } from "@/lib/workerTrpc";
import WorkerLayout from "./WorkerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CalendarDays, Plus, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ── Business days calculation (weekdays only, matching Client Portal & Admin) ──
function calcBusinessDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (e < s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const statusStyles: Record<string, string> = {
  submitted: "bg-yellow-100 text-yellow-700",
  client_approved: "bg-blue-100 text-blue-700",
  client_rejected: "bg-red-100 text-red-700",
  admin_approved: "bg-green-100 text-green-700",
  admin_rejected: "bg-red-100 text-red-700",
  locked: "bg-green-100 text-green-700",
};

const statusLabels: Record<string, string> = {
  submitted: "Pending",
  client_approved: "Client Approved",
  client_rejected: "Rejected",
  admin_approved: "Approved",
  admin_rejected: "Rejected",
  locked: "Locked",
};

export default function WorkerLeave() {
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState("");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState("");

  // Insufficient balance dialog state
  const [insufficientDialogOpen, setInsufficientDialogOpen] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<{
    remaining: number;
    requested: number;
    paidDays: number;
    unpaidDays: number;
  } | null>(null);

  const utils = workerTrpc.useUtils();

  const { data: balances, isLoading: balancesLoading } = workerTrpc.leave.getBalances.useQuery();
  const { data: leaveTypes } = workerTrpc.leave.getLeaveTypes.useQuery();
  const { data, isLoading } = workerTrpc.leave.list.useQuery({ page, pageSize: 20 });

  const submitMutation = workerTrpc.leave.submit.useMutation({
    onSuccess: (result) => {
      if (result.balanceSplit) {
        toast.success(`Leave submitted: ${result.paidDays} paid + ${result.unpaidDays} unpaid days`);
      } else {
        toast.success("Leave request submitted");
      }
      setCreateDialogOpen(false);
      setInsufficientDialogOpen(false);
      resetForm();
      utils.leave.list.invalidate();
      utils.leave.getBalances.invalidate();
      utils.dashboard.getSummary.invalidate();
    },
    onError: (err: any) => {
      // Check if this is an INSUFFICIENT_BALANCE error
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.type === "INSUFFICIENT_BALANCE") {
          setBalanceInfo(parsed);
          setInsufficientDialogOpen(true);
          return;
        }
      } catch {
        // Not a JSON error, show as regular error
      }
      toast.error(err.message || "Failed to submit leave request");
    },
  });

  const cancelMutation = workerTrpc.leave.cancel.useMutation({
    onSuccess: () => {
      toast.success("Leave request cancelled");
      utils.leave.list.invalidate();
      utils.leave.getBalances.invalidate();
      utils.dashboard.getSummary.invalidate();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to cancel leave request");
    },
  });

  const resetForm = () => {
    setLeaveTypeId("");
    setStartDate("");
    setEndDate("");
    setDays("");
    setIsHalfDay(false);
    setReason("");
  };

  // Auto-calculate days when dates change (matching Client Portal & Admin)
  const recalcDays = (start: string, end: string, halfDay: boolean) => {
    if (start && end) {
      let d = calcBusinessDays(start, end);
      if (halfDay && d >= 1) d = d - 0.5;
      if (d > 0) {
        setDays(String(Math.max(d, 0.5)));
      } else {
        setDays("");
      }
    }
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    recalcDays(value, endDate, isHalfDay);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    recalcDays(startDate, value, isHalfDay);
  };

  const handleHalfDayToggle = (checked: boolean) => {
    setIsHalfDay(checked);
    recalcDays(startDate, endDate, checked);
  };

  const handleSubmit = (confirmAutoSplit: boolean = false) => {
    if (!leaveTypeId || !startDate || !endDate || !days) {
      toast.error("Please fill in all required fields");
      return;
    }
    submitMutation.mutate({
      leaveTypeId: parseInt(leaveTypeId),
      startDate,
      endDate,
      days,
      reason: reason || undefined,
      confirmAutoSplit,
    });
  };

  const handleConfirmAutoSplit = () => {
    handleSubmit(true);
  };

  // Insufficient balance warning (inline, before submit)
  const selectedBalance = leaveTypeId
    ? balances?.find((b: any) => b.leaveTypeId === parseInt(leaveTypeId))
    : null;
  const selectedLeaveType = leaveTypeId
    ? leaveTypes?.find((lt: any) => lt.id === parseInt(leaveTypeId))
    : null;
  const requestedDays = parseFloat(days || "0");
  const isInsufficientBalance =
    selectedLeaveType?.isPaid !== false &&
    selectedBalance &&
    requestedDays > 0 &&
    requestedDays > Number(selectedBalance.remaining ?? 0);

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <WorkerLayout>
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Leave</h1>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Request Leave
          </Button>
        </div>

        {/* Leave Balances */}
        {!balancesLoading && balances && balances.length > 0 && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {balances.map((b: any) => (
              <Card key={b.id}>
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-muted-foreground">{b.leaveTypeName}</p>
                  <div className="mt-1">
                    <span className="text-2xl font-bold">{b.remaining}</span>
                    <span className="text-sm text-muted-foreground ml-1">/ {b.totalEntitlement}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{b.used} used</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Leave Records */}
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : data?.items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No leave records yet.</p>
              <Button variant="outline" className="mt-3" onClick={() => setCreateDialogOpen(true)}>
                Request your first leave
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {data?.items.map((record: any) => (
                <Card key={record.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{record.startDate} - {record.endDate}</p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusStyles[record.status] || "bg-gray-100 text-gray-700"}`}>
                            {statusLabels[record.status] || record.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {record.leaveTypeName && <span className="font-medium">{record.leaveTypeName}{record.isPaid === false ? " (Unpaid)" : ""} · </span>}
                          {record.days} day(s)
                          {record.reason && <span> — {record.reason}</span>}
                        </p>
                      </div>
                      {record.status === "submitted" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive hover:text-destructive"
                          onClick={() => cancelMutation.mutate({ id: record.id })}
                          disabled={cancelMutation.isPending}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {record.clientRejectionReason && (
                      <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                        <strong>Rejection reason:</strong> {record.clientRejectionReason}
                      </div>
                    )}
                    {record.adminRejectionReason && (
                      <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                        <strong>Admin rejection:</strong> {record.adminRejectionReason}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Create Leave Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!open) { setCreateDialogOpen(false); resetForm(); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Request Leave</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Leave Type *</Label>
                <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes?.map((lt: any) => {
                      const balance = balances?.find((b: any) => b.leaveTypeId === lt.id);
                      return (
                        <SelectItem key={lt.id} value={lt.id.toString()}>
                          {lt.leaveTypeName}{lt.isPaid === false ? " (Unpaid)" : ""}{balance ? ` (${balance.remaining} remaining)` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <Input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>End Date *</Label>
                  <Input type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)} min={startDate || undefined} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Days *</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0.5"
                  placeholder="Auto-calculated"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Auto-calculated as business days (weekdays). Adjust manually if needed.</p>
              </div>
              {/* Insufficient balance warning (inline) */}
              {isInsufficientBalance && selectedBalance && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-800">
                    Insufficient leave balance
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    You are requesting {requestedDays} day(s) but only {selectedBalance.remaining} day(s) remaining.
                    The excess {(requestedDays - Number(selectedBalance.remaining)).toFixed(1)} day(s) will be automatically converted to Unpaid Leave.
                  </p>
                </div>
              )}
              {/* Half-day leave option (matching Client Portal & Admin) */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isHalfDay"
                  checked={isHalfDay}
                  onChange={(e) => handleHalfDayToggle(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="isHalfDay" className="text-sm font-normal cursor-pointer">
                  Half-day leave (deduct 0.5 day)
                </Label>
              </div>
              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Textarea
                  placeholder="Reason for leave..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button onClick={() => handleSubmit(false)} disabled={submitMutation.isPending || !leaveTypeId || !startDate || !endDate || !days}>
                {submitMutation.isPending ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Insufficient Balance Confirmation Dialog */}
        <Dialog open={insufficientDialogOpen} onOpenChange={(open) => { if (!open) setInsufficientDialogOpen(false); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Insufficient Leave Balance
              </DialogTitle>
              <DialogDescription>
                Your leave balance is not enough for this request.
              </DialogDescription>
            </DialogHeader>
            {balanceInfo && (
              <div className="space-y-4">
                <Alert variant="default" className="border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800">Balance Warning</AlertTitle>
                  <AlertDescription className="text-amber-700">
                    You requested <strong>{balanceInfo.requested} days</strong> but only have <strong>{balanceInfo.remaining} days</strong> remaining.
                  </AlertDescription>
                </Alert>

                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium">Auto-split proposal:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 rounded-md p-3 text-center">
                      <p className="text-2xl font-bold text-green-700">{balanceInfo.paidDays}</p>
                      <p className="text-xs text-green-600 font-medium">Paid Leave</p>
                    </div>
                    <div className="bg-orange-50 rounded-md p-3 text-center">
                      <p className="text-2xl font-bold text-orange-700">{balanceInfo.unpaidDays}</p>
                      <p className="text-xs text-orange-600 font-medium">Unpaid Leave</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The system will automatically split your request into paid and unpaid portions.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setInsufficientDialogOpen(false)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleConfirmAutoSplit} disabled={submitMutation.isPending} className="w-full sm:w-auto">
                {submitMutation.isPending ? "Submitting..." : "Confirm & Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </WorkerLayout>
  );
}
