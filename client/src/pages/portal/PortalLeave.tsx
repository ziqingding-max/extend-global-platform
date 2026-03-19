/**
 * Portal Leave Page
 *
 * View, create and delete leave requests for employees.
 * Includes leave balance overview and public holidays.
 */
import { useState, useMemo } from "react";
import { formatDate } from "@/lib/format";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/DatePicker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2,
  Loader2, Calendar, CheckCircle2, XCircle, Download,
  Briefcase, Target, DollarSign,
} from "lucide-react";
// CurrencySelect removed — currency is now locked from contractor record
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csvExport";
import PortalPayrollCycleIndicator, { PortalCrossMonthLeaveWarning } from "@/components/PortalPayrollCycleIndicator";

// Calculate business days (weekdays only) between two dates — matches Admin logic
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

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 border-gray-200",
  submitted: "bg-yellow-100 text-yellow-800 border-yellow-200",
  client_approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  client_rejected: "bg-red-100 text-red-800 border-red-200",
  admin_approved: "bg-green-100 text-green-800 border-green-200",
  admin_rejected: "bg-orange-100 text-orange-800 border-orange-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  locked: "bg-blue-100 text-blue-800 border-blue-200",
};

interface LeaveForm {
  employeeId: number | null;
  leaveTypeId: number | null;
  startDate: string;
  endDate: string;
  days: string;
  reason: string;
  isHalfDay: boolean; // Bug 13: half-day leave support
}

const emptyForm: LeaveForm = {
  employeeId: null,
  leaveTypeId: null,
  startDate: "",
  endDate: "",
  days: "",
  reason: "",
  isHalfDay: false,
};

// ── Milestones Sub-Tab Component ──
function PortalMilestonesTab({ showCreate, setShowCreate }: { showCreate: boolean; setShowCreate: (v: boolean) => void }) {
  const [statusFilter, setStatusFilter] = useState("active");
  const [milestoneForm, setMilestoneForm] = useState({
    contractorId: "",
    title: "",
    description: "",
    amount: "",
    currency: "USD",
    dueDate: "",
  });

  const utils = portalTrpc.useUtils();

  // Get contractors for selector
  const { data: contractorsData } = portalTrpc.contractors.list.useQuery({ page: 1, pageSize: 200 });
  const contractorsList = contractorsData?.items ?? [];

  // Get milestones
  const { data: milestones, isLoading } = portalTrpc.milestones.list.useQuery({
    status: statusFilter === "active" ? "pending" : statusFilter === "history" ? "approved" : undefined,
  });

  const createMutation = portalTrpc.milestones.create.useMutation({
    onSuccess: () => {
      toast.success("Milestone created successfully!");
      setShowCreate(false);
      setMilestoneForm({ contractorId: "", title: "", description: "", amount: "", currency: "USD", dueDate: "" });
      utils.milestones.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const approveMutation = portalTrpc.milestones.approve.useMutation({
    onSuccess: () => {
      toast.success("Milestone approved successfully!");
      utils.milestones.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rejectMutation = portalTrpc.milestones.reject.useMutation({
    onSuccess: () => {
      toast.success("Milestone rejected successfully!");
      utils.milestones.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const activeStatuses = ["pending", "in_progress", "submitted", "changes_requested"];
  const historyStatuses = ["approved", "paid", "cancelled", "rejected"];

  const filteredMilestones = (milestones || []).filter((m: any) => {
    if (statusFilter === "active") return activeStatuses.includes(m.status);
    if (statusFilter === "history") return historyStatuses.includes(m.status);
    return true;
  });

  const milestoneStatusColors: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    in_progress: "bg-blue-50 text-blue-700 border-blue-200",
    submitted: "bg-purple-50 text-purple-700 border-purple-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    paid: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-gray-50 text-gray-700 border-gray-200",
    changes_requested: "bg-orange-50 text-orange-700 border-orange-200",
  };

  function handleCreateMilestone() {
    if (!milestoneForm.contractorId || !milestoneForm.title || !milestoneForm.amount) {
      toast.error("Please fill in all required fields.");
      return;
    }
    createMutation.mutate({
      contractorId: parseInt(milestoneForm.contractorId),
      title: milestoneForm.title,
      description: milestoneForm.description || undefined,
      amount: milestoneForm.amount,
      currency: milestoneForm.currency,
      dueDate: milestoneForm.dueDate || undefined,
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-auto">
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredMilestones.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Target className="w-10 h-10 mb-3" />
              <p className="text-lg font-medium">No milestones found</p>
              <p className="text-sm mt-1">
                {contractorsList.length === 0
                  ? "No contractors available to create milestones for."
                  : "Create a new milestone to get started."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contractor</TableHead>
                  <TableHead>Milestone</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMilestones.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.contractorName}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{m.title}</p>
                        {m.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{m.description}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {m.currency} {Number(m.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      {m.dueDate ? formatDate(m.dueDate + "T00:00:00") : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={milestoneStatusColors[m.status] || ""}>
                        {m.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {m.status === "submitted" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => approveMutation.mutate({ id: m.id })}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => rejectMutation.mutate({ id: m.id })}
                              disabled={rejectMutation.isPending}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Milestone Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => {
        if (!open) {
          setShowCreate(false);
          setMilestoneForm({ contractorId: "", title: "", description: "", amount: "", currency: "USD", dueDate: "" });
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Milestone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Contractor <span className="text-destructive">*</span></Label>
              <Select value={milestoneForm.contractorId} onValueChange={(v) => {
                const selectedCon = contractorsList.find((c: any) => String(c.id) === v);
                setMilestoneForm((f) => ({ ...f, contractorId: v, currency: selectedCon?.currency || f.currency }));
              }}>
                <SelectTrigger><SelectValue placeholder="Select a contractor" /></SelectTrigger>
                <SelectContent>
                  {contractorsList.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.firstName} {c.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={milestoneForm.title} onChange={(e) => setMilestoneForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g., Project Alpha Completion" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={milestoneForm.description} onChange={(e) => setMilestoneForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description of the milestone" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.01" value={milestoneForm.amount} onChange={(e) => setMilestoneForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input value={milestoneForm.currency} readOnly disabled className="bg-muted" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <DatePicker value={milestoneForm.dueDate} onChange={(v) => setMilestoneForm((f) => ({ ...f, dueDate: v }))} placeholder="Select due date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreateMilestone} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Milestone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PortalLeave() {
  const { user } = usePortalAuth();
  const isHrOrAdmin = user && ["admin", "hr_manager"].includes(user.portalRole);

  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [form, setForm] = useState<LeaveForm>({ ...emptyForm });
  const [activeTab, setActiveTab] = useState("requests");
  const [showMilestoneCreate, setShowMilestoneCreate] = useState(false);
  const [selectedBalanceEmp, setSelectedBalanceEmp] = useState<number | null>(null);

  const utils = portalTrpc.useUtils();

  const { data, isLoading } = portalTrpc.leave.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    pageSize,
  });

  // Get employees for the selector — active, on_leave, AND offboarding employees
  // Offboarding employees must be able to submit leave during their notice period (Hard Rule 2)
  const { data: empDataActive } = portalTrpc.employees.list.useQuery({ page: 1, pageSize: 100, status: "active" });
  const { data: empDataOnLeave } = portalTrpc.employees.list.useQuery({ page: 1, pageSize: 100, status: "on_leave" });
  const { data: empDataOffboarding } = portalTrpc.employees.list.useQuery({ page: 1, pageSize: 100, status: "offboarding" });
  const employees = useMemo(() => {
    const active = empDataActive?.items ?? [];
    const onLeave = empDataOnLeave?.items ?? [];
    const offboarding = empDataOffboarding?.items ?? [];
    const merged = [...active];
    for (const e of [...onLeave, ...offboarding]) {
      if (!merged.find((m: any) => m.id === e.id)) merged.push(e);
    }
    return merged;
  }, [empDataActive, empDataOnLeave, empDataOffboarding]);

  // Get leave types for the selected employee's country
  const selectedEmp = employees.find((e: any) => e.id === form.employeeId);
  const { data: leaveTypes } = portalTrpc.employees.leaveTypesByCountry.useQuery(
    { countryCode: selectedEmp?.country || "" },
    { enabled: !!selectedEmp?.country }
  );

  // Get leave balances for selected employee (balances tab)
  const { data: balances } = portalTrpc.leave.balances.useQuery(
    { employeeId: selectedBalanceEmp || 0 },
    { enabled: !!selectedBalanceEmp }
  );

  // Get leave balances for the employee selected in the create dialog
  const { data: createFormBalances } = portalTrpc.leave.balances.useQuery(
    { employeeId: form.employeeId || 0 },
    { enabled: !!form.employeeId }
  );

  // Helper: get remaining balance for a leave type in the create form
  const getFormBalance = (leaveTypeId: number) => {
    if (!createFormBalances) return null;
    const bal = createFormBalances.find((b: any) => b.leaveTypeId === leaveTypeId);
    return bal ? { remaining: Number(bal.remaining ?? 0), totalEntitlement: Number(bal.totalEntitlement ?? 0) } : null;
  };

  // Filter leave types by employee gender
  const filteredLeaveTypes = useMemo(() => {
    if (!leaveTypes || !selectedEmp) return leaveTypes;
    const empGender = selectedEmp.gender;
    return leaveTypes.filter((lt: any) => {
      const applicable = lt.applicableGender || "all";
      if (applicable === "all") return true;
      if (!empGender || empGender === "other" || empGender === "prefer_not_to_say") return true;
      return applicable === empGender;
    });
  }, [leaveTypes, selectedEmp]);

  // Check if selected leave type has insufficient balance
  const selectedLeaveType = (filteredLeaveTypes || []).find((lt: any) => lt.id === form.leaveTypeId);
  const requestedDays = parseFloat(form.days || "0");
  const selectedBalance = form.leaveTypeId ? getFormBalance(form.leaveTypeId) : null;
  const isInsufficientBalance = selectedLeaveType?.isPaid !== false && selectedBalance !== null && requestedDays > 0 && requestedDays > selectedBalance.remaining;

  // Get public holidays
  const { data: holidays } = portalTrpc.leave.publicHolidays.useQuery(
    { year: new Date().getFullYear() },
    { enabled: activeTab === "holidays" }
  );

  const createMutation = portalTrpc.leave.create.useMutation({
    onSuccess: (data: any) => {
      if (data?.balanceSplit) {
        toast.success(
          `Leave request split: ${data.paidDays} day(s) paid leave + ${data.unpaidDays} day(s) unpaid leave (due to insufficient balance)`,
          { duration: 6000 }
        );
      } else {
        toast.success("Leave request submitted successfully!");
      }
      setShowCreate(false);
      setForm({ ...emptyForm });
      utils.leave.list.invalidate();
      utils.leave.balances.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = portalTrpc.leave.delete.useMutation({
    onSuccess: () => {
      toast.success("Leave request deleted successfully!");
      setDeleteId(null);
      utils.leave.list.invalidate();
      utils.leave.balances.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const approveMutation = portalTrpc.leave.approve.useMutation({
    onSuccess: () => {
      toast.success("Leave request approved successfully!");
      utils.leave.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rejectMutation = portalTrpc.leave.reject.useMutation({
    onSuccess: () => {
      toast.success("Leave request rejected successfully!");
      setRejectId(null);
      setRejectReason("");
      utils.leave.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // Auto-calculate days when dates change — uses business days (weekdays only)
  // If half-day is checked, subtract 0.5 from the total (matching Admin behavior)
  function updateDates(field: "startDate" | "endDate", value: string) {
    const newForm = { ...form, [field]: value };
    if (newForm.startDate && newForm.endDate) {
      let days = calcBusinessDays(newForm.startDate, newForm.endDate);
      if (newForm.isHalfDay && days >= 1) days = days - 0.5;
      if (days > 0) {
        newForm.days = String(Math.max(days, 0.5));
      }
    }
    setForm(newForm);
  }

  function handleCreate() {
    if (!form.employeeId || !form.leaveTypeId || !form.startDate || !form.endDate || !form.days) {
      toast.error("Please fill in all required fields.");
      return;
    }
    createMutation.mutate({
      employeeId: form.employeeId,
      leaveTypeId: form.leaveTypeId,
      startDate: form.startDate,
      endDate: form.endDate,
      days: form.days, // Already includes half-day deduction (calculated on frontend, matching Admin)
      reason: form.reason || undefined,
    });
  }

  return (
    <PortalLayout title="Leave">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Leave Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              View, create, and manage leave requests for your employees.
            </p>
          </div>
          <div className="flex gap-2">
            {activeTab === "milestones" ? (
              <Button onClick={() => setShowMilestoneCreate(true)}>
                <Plus className="w-4 h-4 mr-2" /> New Milestone
              </Button>
            ) : (
            <>
            <Button
              variant="outline"
              size="sm"
              disabled={items.length === 0}
              onClick={() => {
                exportToCsv(items, [
                  { header: "Employee", accessor: (r: any) => r.employeeName || "" },
                  { header: "Leave Type", accessor: (r: any) => r.leaveType || "" },
                  { header: "Start Date", accessor: (r: any) => r.startDate ? formatDate(r.startDate + "T00:00:00") : "" },
                  { header: "End Date", accessor: (r: any) => r.endDate ? formatDate(r.endDate + "T00:00:00") : "" },
                  { header: "Days", accessor: (r: any) => r.totalDays ?? "" },
                  { header: "Status", accessor: (r: any) => r.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || r.status || "" },
                  { header: "Reason", accessor: (r: any) => r.reason || "" },
                ], `leave-requests-${new Date().toISOString().slice(0, 10)}.csv`);
              }}
            >
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
            <Button onClick={() => { setForm({ ...emptyForm }); setShowCreate(true); }}>
              <Plus className="w-4 h-4 mr-2" /> New Request
            </Button>
            </>)
            }
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="milestones" className="gap-1.5">
              <Target className="w-3.5 h-3.5" /> Milestones
            </TabsTrigger>
          </TabsList>

          {/* Leave Requests Tab */}
          <TabsContent value="requests" className="space-y-4">
            <div className="flex gap-3">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="submitted">Pending Review</SelectItem>
                  <SelectItem value="client_approved">Approved</SelectItem>
                  <SelectItem value="client_rejected">Rejected</SelectItem>
                  <SelectItem value="admin_approved">Confirmed</SelectItem>
                  <SelectItem value="admin_rejected">Admin Rejected</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <CalendarDays className="w-10 h-10 mb-3" />
                    <p className="text-lg font-medium">No leave requests found</p>
                    <p className="text-sm mt-1">Create a new leave request to get started.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Leave Type</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((leave: any) => (
                        <TableRow key={leave.id}>
                          <TableCell className="font-medium">
                            {leave.employeeFirstName} {leave.employeeLastName}
                          </TableCell>
                          <TableCell className="capitalize">
                            {leave.leaveTypeName || "-"}
                          </TableCell>
                          <TableCell>
                            {leave.startDate ? formatDate(leave.startDate + "T00:00:00") : "-"}
                          </TableCell>
                          <TableCell>
                            {leave.endDate ? formatDate(leave.endDate + "T00:00:00") : "-"}
                          </TableCell>
                          <TableCell>{leave.days ?? "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusColors[leave.status] || ""}>
                              {leave.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || leave.status}
                            </Badge>
                            {leave.clientRejectionReason && leave.status === "client_rejected" && (
                              <p className="text-xs text-red-600 mt-1 max-w-[200px] truncate" title={leave.clientRejectionReason}>
                                {leave.clientRejectionReason}
                              </p>
                            )}
                            {leave.adminRejectionReason && leave.status === "admin_rejected" && (
                              <p className="text-xs text-orange-600 mt-1 max-w-[200px] truncate" title={leave.adminRejectionReason}>
                                {leave.adminRejectionReason}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                            {leave.reason || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {leave.status === "submitted" && isHrOrAdmin && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                    onClick={() => approveMutation.mutate({ id: leave.id })}
                                    disabled={approveMutation.isPending}
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => { setRejectId(leave.id); setRejectReason(""); }}
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                              {leave.status === "submitted" && (
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(leave.id)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>



          {/* Milestones Tab */}
          <TabsContent value="milestones" className="space-y-4">
            <PortalMilestonesTab showCreate={showMilestoneCreate} setShowCreate={setShowMilestoneCreate} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Leave Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => {
        if (!open) { setShowCreate(false); setForm({ ...emptyForm }); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Payroll Cycle Indicator — matches Admin experience */}
            <PortalPayrollCycleIndicator label="Leave" />
            <div className="space-y-2">
              <Label>Employee <span className="text-destructive">*</span></Label>
              <Select value={form.employeeId ? String(form.employeeId) : ""} onValueChange={(v) => setForm((f) => ({ ...f, employeeId: Number(v), leaveTypeId: null }))}>
                <SelectTrigger><SelectValue placeholder="Select an employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((emp: any) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Leave Type <span className="text-destructive">*</span></Label>
              <Select
                value={form.leaveTypeId ? String(form.leaveTypeId) : ""}
                onValueChange={(v) => setForm((f) => ({ ...f, leaveTypeId: Number(v) }))}
                disabled={!form.employeeId}
              >
                <SelectTrigger><SelectValue placeholder={form.employeeId ? "Select a leave type" : "Select an employee first"} /></SelectTrigger>
                <SelectContent>
                  {(filteredLeaveTypes || []).map((lt: any) => {
                    const bal = getFormBalance(lt.id);
                    const balLabel = lt.isPaid === false
                      ? "Unpaid"
                      : bal !== null
                        ? `${bal.remaining}/${bal.totalEntitlement} days remaining`
                        : `${lt.annualEntitlement} days/year`;
                    return (
                      <SelectItem key={lt.id} value={String(lt.id)}>
                        {lt.leaveTypeName} ({balLabel})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date <span className="text-destructive">*</span></Label>
                <DatePicker
                  value={form.startDate}
                  onChange={(v) => updateDates("startDate", v)}
                  placeholder="Select start date"
                />
              </div>
              <div className="space-y-2">
                <Label>End Date <span className="text-destructive">*</span></Label>
                <DatePicker
                  value={form.endDate}
                  onChange={(v) => updateDates("endDate", v)}
                  placeholder="Select end date"
                  minDate={form.startDate}
                />
              </div>
            </div>
            {/* Cross-Month Leave Warning — matches Admin experience */}
            {form.startDate && form.endDate && parseFloat(form.days || "0") > 0 && (
              <PortalCrossMonthLeaveWarning
                startDate={form.startDate}
                endDate={form.endDate}
                totalDays={parseFloat(form.days || "0")}
              />
            )}
            <div className="space-y-2">
              <Label>Days <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.5" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} placeholder="Number of days" />
              <p className="text-xs text-muted-foreground">Auto-calculated as business days (weekdays). Adjust manually if needed.</p>
            </div>
            {/* Insufficient balance warning */}
            {isInsufficientBalance && selectedBalance && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">
                  Insufficient leave balance
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  You are requesting {requestedDays} day(s) but only {selectedBalance.remaining} day(s) remaining.
                  The excess {(requestedDays - selectedBalance.remaining).toFixed(1)} day(s) will be automatically converted to Unpaid Leave.
                </p>
              </div>
            )}
            {/* Bug 13: Half-day leave option */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isHalfDay"
                checked={form.isHalfDay}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm((f) => {
                    const updated = { ...f, isHalfDay: checked };
                    // Recalculate days when half-day toggled (matching Admin behavior)
                    if (f.startDate && f.endDate) {
                      let days = calcBusinessDays(f.startDate, f.endDate);
                      if (checked && days >= 1) days = days - 0.5;
                      updated.days = String(Math.max(days, 0.5));
                    }
                    return updated;
                  });
                }}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isHalfDay" className="text-sm font-normal cursor-pointer">
                Half-day leave
              </Label>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Optional reason for leave" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setForm({ ...emptyForm }); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the leave request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={rejectId !== null} onOpenChange={(open) => { if (!open) { setRejectId(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reason for Rejection</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectId && rejectMutation.mutate({ id: rejectId, reason: rejectReason || undefined })}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}