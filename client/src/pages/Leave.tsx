/*
 * EG Admin — Time Off & Milestones
 * Manage employee leave requests and contractor milestones
 */
import Layout from "@/components/Layout";
import { formatMonth, formatDate, formatDateISO, countryName } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import ContractorMilestones from "@/components/pages/ContractorMilestones";
import { CalendarDays, Plus, Pencil, Trash2, Lock, AlertCircle, Eye, CheckCircle2, XCircle, Download, Loader2 } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import { toast } from "sonner";
import EmployeeSelector from "@/components/EmployeeSelector";
import PayrollCycleIndicator, { CrossMonthLeaveWarning } from "@/components/PayrollCycleIndicator";
import { exportToCsv } from "@/lib/csvExport";


const statusColors: Record<string, string> = {
  submitted: "bg-amber-50 text-amber-700 border-amber-200",
  client_approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  client_rejected: "bg-red-50 text-red-700 border-red-200",
  admin_approved: "bg-green-50 text-green-700 border-green-200",
  admin_rejected: "bg-orange-50 text-orange-700 border-orange-200",
  locked: "bg-blue-50 text-blue-700 border-blue-200",
};

/**
 * Calculate business days between two dates (excluding weekends).
 */
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

export default function Leave() {
  const [viewTab, setViewTab] = useState<string>("active");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingLeave, setEditingLeave] = useState<any>(null);
  const [viewLeave, setViewLeave] = useState<any>(null);

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = -3; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
      options.push({ value, label });
    }
    return options;
  }, []);

  const { data, isLoading, refetch } = trpc.leave.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    month: monthFilter !== "all" ? monthFilter : undefined,
    limit: 100,
  });

  // Load employees and customers for selectors
  const { data: employees } = trpc.employees.list.useQuery({ limit: 500 });
  const { data: customersData } = trpc.customers.list.useQuery({ limit: 200 });
  const customersList = customersData?.data || [];

  const createMutation = trpc.leave.create.useMutation({
    onSuccess: (data: any) => {
      if (data?.balanceSplit) {
        toast.success(
          `Leave request split: ${data.paidDays} day(s) paid leave + ${data.unpaidDays} day(s) unpaid leave (due to insufficient balance)`,
          { duration: 6000 }
        );
      } else {
        toast.success("Leave request submitted successfully.");
      }
      setCreateOpen(false);
      refetch();
      setFormData(defaultForm);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = trpc.leave.update.useMutation({
    onSuccess: () => {
      toast.success("Leave request updated successfully.");
      setEditOpen(false);
      setEditingLeave(null);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = trpc.leave.delete.useMutation({
    onSuccess: () => {
      toast.success("Leave request deleted successfully.");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const adminApproveMutation = trpc.leave.adminApprove.useMutation({
    onSuccess: () => {
      toast.success("Leave request approved.");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const adminRejectMutation = trpc.leave.adminReject.useMutation({
    onSuccess: () => {
      toast.success("Leave request rejected.");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const bulkApproveMutation = trpc.leave.bulkAdminApprove.useMutation({
    onSuccess: (result) => {
      toast.success(`Approved ${result.approvedCount} leave records${result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : ""}`);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const defaultForm = {
    employeeId: 0,
    leaveTypeId: 0,
    startDate: "",
    endDate: "",
    days: "1",
    isHalfDay: false,
    reason: "",
  };
  const [formData, setFormData] = useState(defaultForm);

  const [editFormData, setEditFormData] = useState({
    leaveTypeId: 0,
    startDate: "",
    endDate: "",
    days: "1",
    isHalfDay: false,
    reason: "",
  });

  // Get selected employee's country to load leave types
  const selectedEmployee = useMemo(() => {
    if (!formData.employeeId || !employees?.data) return null;
    return employees.data.find((e) => e.id === formData.employeeId) || null;
  }, [formData.employeeId, employees]);

  // Load leave types for selected employee's country (create form)
  const { data: leaveTypesData } = trpc.countries.leaveTypes.list.useQuery(
    { countryCode: selectedEmployee?.country || "" },
    { enabled: !!selectedEmployee?.country }
  );

  // Load leave balances for selected employee in create form
  const { data: createFormBalancesData } = trpc.employees.leaveBalances.useQuery(
    { employeeId: formData.employeeId, year: new Date().getFullYear() },
    { enabled: !!formData.employeeId }
  );
  const getCreateFormBalance = (leaveTypeId: number) => {
    if (!createFormBalancesData) return null;
    const bal = createFormBalancesData.find((b: any) => b.leaveTypeId === leaveTypeId);
    return bal ? { remaining: Number(bal.remaining ?? 0), totalEntitlement: Number(bal.totalEntitlement ?? 0) } : null;
  };
  // Filter leave types by employee gender
  const filteredLeaveTypes = useMemo(() => {
    if (!leaveTypesData || !selectedEmployee) return leaveTypesData;
    const empGender = selectedEmployee.gender;
    return leaveTypesData.filter((lt: any) => {
      const applicable = lt.applicableGender || "all";
      if (applicable === "all") return true;
      if (!empGender || empGender === "other" || empGender === "prefer_not_to_say") return true;
      return applicable === empGender;
    });
  }, [leaveTypesData, selectedEmployee]);

  const adminSelectedLeaveType = filteredLeaveTypes?.find((lt: any) => lt.id === formData.leaveTypeId);
  const adminRequestedDays = parseFloat(formData.days || "0");
  const adminSelectedBalance = formData.leaveTypeId ? getCreateFormBalance(formData.leaveTypeId) : null;
  const adminIsInsufficientBalance = adminSelectedLeaveType?.isPaid !== false && adminSelectedBalance !== null && adminRequestedDays > 0 && adminRequestedDays > adminSelectedBalance.remaining;

  // For edit form: get editing employee's country
  const editingEmployee = useMemo(() => {
    if (!editingLeave || !employees?.data) return null;
    return employees.data.find((e) => e.id === editingLeave.employeeId) || null;
  }, [editingLeave, employees]);

  const { data: editLeaveTypesData } = trpc.countries.leaveTypes.list.useQuery(
    { countryCode: editingEmployee?.country || "" },
    { enabled: !!editingEmployee?.country }
  );

  // Filter edit form leave types by employee gender
  const filteredEditLeaveTypes = useMemo(() => {
    if (!editLeaveTypesData || !editingEmployee) return editLeaveTypesData;
    const empGender = editingEmployee.gender;
    return editLeaveTypesData.filter((lt: any) => {
      const applicable = lt.applicableGender || "all";
      if (applicable === "all") return true;
      if (!empGender || empGender === "other" || empGender === "prefer_not_to_say") return true;
      return applicable === empGender;
    });
  }, [editLeaveTypesData, editingEmployee]);

  // Employee name lookup
  const employeeMap = useMemo(() => {
    const map: Record<number, { name: string; country: string; salaryCurrency: string; customerId: number }> = {};
    employees?.data?.forEach((e) => {
      map[e.id] = { name: `${e.firstName} ${e.lastName}`, country: e.country, salaryCurrency: e.salaryCurrency || "USD", customerId: e.customerId };
    });
    return map;
  }, [employees]);

  // Derive unique countries from employees for filter
  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    employees?.data?.forEach((e) => { if (e.country) set.add(e.country); });
    return Array.from(set).sort();
  }, [employees]);

  // Auto-calculate days when dates change (create form)
  useEffect(() => {
    if (formData.startDate && formData.endDate) {
      const end = new Date(formData.endDate);
      const start = new Date(formData.startDate);
      if (end < start) return;
      let days = calcBusinessDays(formData.startDate, formData.endDate);
      if (formData.isHalfDay && days >= 1) days = days - 0.5;
      setFormData((prev) => ({ ...prev, days: String(Math.max(days, 0.5)) }));
    }
  }, [formData.startDate, formData.endDate, formData.isHalfDay]);

  // Auto-calculate days when dates change (edit form)
  useEffect(() => {
    if (editFormData.startDate && editFormData.endDate) {
      const end = new Date(editFormData.endDate);
      const start = new Date(editFormData.startDate);
      if (end < start) return;
      let days = calcBusinessDays(editFormData.startDate, editFormData.endDate);
      if (editFormData.isHalfDay && days >= 1) days = days - 0.5;
      setEditFormData((prev) => ({ ...prev, days: String(Math.max(days, 0.5)) }));
    }
  }, [editFormData.startDate, editFormData.endDate, editFormData.isHalfDay]);

  const dateError = useMemo(() => {
    if (formData.startDate && formData.endDate) {
      if (new Date(formData.endDate) < new Date(formData.startDate)) return "End date cannot be before start date.";
    }
    return null;
  }, [formData.startDate, formData.endDate]);

  const editDateError = useMemo(() => {
    if (editFormData.startDate && editFormData.endDate) {
      if (new Date(editFormData.endDate) < new Date(editFormData.startDate)) return "End date cannot be before start date.";
    }
    return null;
  }, [editFormData.startDate, editFormData.endDate]);

  const handleCreate = () => {
    if (!formData.employeeId || !formData.leaveTypeId || !formData.startDate || !formData.endDate) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (dateError) { toast.error(dateError); return; }
    createMutation.mutate({
      employeeId: formData.employeeId,
      leaveTypeId: formData.leaveTypeId,
      startDate: formData.startDate,
      endDate: formData.endDate,
      days: formData.days,
      reason: formData.reason || undefined,
    });
  };

  const handleEdit = (leave: any) => {
    setEditingLeave(leave);
    setEditFormData({
      leaveTypeId: leave.leaveTypeId,
      startDate: formatDateISO(leave.startDate),
      endDate: formatDateISO(leave.endDate),
      days: leave.days?.toString() || "1",
      isHalfDay: false,
      reason: leave.reason || "",
    });
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editingLeave) return;
    if (editDateError) { toast.error(editDateError); return; }
    updateMutation.mutate({
      id: editingLeave.id,
      data: {
        leaveTypeId: editFormData.leaveTypeId || undefined,
        startDate: editFormData.startDate,
        endDate: editFormData.endDate,
        days: editFormData.days,
        reason: editFormData.reason || undefined,
      },
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this leave request?")) {
      deleteMutation.mutate({ id });
    }
  };

  // Client-side filtering by tab, customer and country
  const leaves = useMemo(() => {
    let list = data?.data || [];
    // Tab filter: active = submitted/client_approved/client_rejected/admin_rejected, history = locked/admin_approved
    const historyStatuses = ["locked", "admin_approved"];
    if (viewTab === "active") {
      list = list.filter((l) => !historyStatuses.includes(l.status));
    } else {
      list = list.filter((l) => historyStatuses.includes(l.status));
    }
    if (customerFilter !== "all") {
      list = list.filter((l) => {
        const emp = employeeMap[l.employeeId];
        return emp && String(emp.customerId) === customerFilter;
      });
    }
    if (countryFilter !== "all") {
      list = list.filter((l) => {
        const emp = employeeMap[l.employeeId];
        return emp && emp.country === countryFilter;
      });
    }
    return list;
  }, [data, customerFilter, countryFilter, employeeMap, viewTab]);

  return (
    <Layout breadcrumb={["EG", "Time Off & Milestones"]}>
      <div className="p-6 space-y-6 page-enter">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Time Off & Milestones</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage employee leave requests and contractor milestones</p>
          </div>
          <div className="flex-1 flex justify-center">
            <PayrollCycleIndicator compact label="Leave" />
          </div>
          {/* Header buttons removed, moved inside tabs */}
        </div>

        <Tabs defaultValue="leave" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="leave">Leave</TabsTrigger>
            <TabsTrigger value="milestones">Milestones</TabsTrigger>
          </TabsList>

          <TabsContent value="leave" className="space-y-6">
            {/* Active / History Tabs for Leave */}
            <div className="flex items-center justify-between">
                <Tabs value={viewTab} onValueChange={(v) => { setViewTab(v); setStatusFilter("all"); }} className="w-auto">
                <TabsList>
                    <TabsTrigger value="active">Active</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
                </Tabs>

                <div className="flex gap-2">
                    <Button variant="outline" disabled={leaves.length === 0} onClick={() => {
                        exportToCsv(leaves, [
                        { header: "Employee", accessor: (r: any) => { const emp = employeeMap[r.employeeId]; return emp ? emp.name : `#${r.employeeId}`; } },
                        { header: "Leave Type", accessor: (r: any) => r.leaveTypeName || r.leaveTypeId },
                        { header: "Start Date", accessor: (r: any) => r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : "" },
                        { header: "End Date", accessor: (r: any) => r.endDate ? new Date(r.endDate).toISOString().slice(0, 10) : "" },
                        { header: "Days", accessor: (r: any) => r.days },
                        { header: "Reason", accessor: (r: any) => r.reason || "" },
                        { header: "Status", accessor: (r: any) => r.status.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()) || r.status },
                        { header: "Created", accessor: (r: any) => r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "" },
                        ], `leave-export-${new Date().toISOString().slice(0, 10)}.csv`);
                        toast.success("CSV exported successfully");
                    }}>
                        <Download className="w-4 h-4 mr-2" />Export
                    </Button>
                    <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setFormData(defaultForm); }}>
                    <DialogTrigger asChild>
                        <Button><Plus className="w-4 h-4 mr-2" />New Leave Request</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-4">
                        {/* Employee selector with customer cascading + search */}
                        <EmployeeSelector
                        value={formData.employeeId}
                        onValueChange={(id) => setFormData({ ...formData, employeeId: id, leaveTypeId: 0 })}
                        showCustomerFilter={true}
                        required
                        label="Employee"
                        placeholder="Select an employee"
                        />

                        {/* Leave type selector */}
                        <div className="space-y-2">
                        <Label>Leave Type *</Label>
                        <Select
                            value={formData.leaveTypeId ? String(formData.leaveTypeId) : ""}
                            onValueChange={(v) => setFormData({ ...formData, leaveTypeId: parseInt(v) })}
                            disabled={!selectedEmployee}
                        >
                            <SelectTrigger>
                            <SelectValue placeholder={selectedEmployee ? "Select a leave type" : "Select an employee first"} />
                            </SelectTrigger>
                            <SelectContent>
                            {filteredLeaveTypes?.map((lt: any) => {
                                const bal = getCreateFormBalance(lt.id);
                                const balLabel = lt.isPaid === false
                                  ? "Unpaid"
                                  : bal !== null
                                    ? `${bal.remaining}/${bal.totalEntitlement} days remaining`
                                    : lt.annualEntitlement ? `${lt.annualEntitlement} days per year` : "";
                                return (
                                <SelectItem key={lt.id} value={String(lt.id)}>
                                {lt.leaveTypeName} {balLabel ? `(${balLabel})` : ""}
                                </SelectItem>
                                );
                            })}
                            {(!filteredLeaveTypes || filteredLeaveTypes.length === 0) && selectedEmployee && (
                                <SelectItem value="__none" disabled>No leave types found for {selectedEmployee.country}</SelectItem>
                            )}
                            </SelectContent>
                        </Select>
                        </div>

                        {/* Date range */}
                        <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start Date *</Label>
                            <DatePicker
                            value={formData.startDate}
                            onChange={(v) => {
                              const updates: any = { startDate: v };
                              // Clear endDate if new startDate is after current endDate
                              if (formData.endDate && v > formData.endDate) {
                                updates.endDate = "";
                                updates.days = "1";
                              }
                              setFormData({ ...formData, ...updates });
                            }}
                            placeholder="Select start date"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>End Date *</Label>
                            <DatePicker
                            value={formData.endDate}
                            onChange={(v) => setFormData({ ...formData, endDate: v })}
                            placeholder="Select end date"
                            minDate={formData.startDate || undefined}
                            />
                        </div>
                        </div>

                        {dateError && (
                        <div className="flex items-center gap-2 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4" />{dateError}
                        </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Total Days</Label>
                            <Input
                            type="text"
                            value={formData.days}
                            readOnly
                            className="font-mono bg-muted"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>&nbsp;</Label>
                            <label className="flex items-center gap-2 h-9 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.isHalfDay}
                                onChange={(e) => setFormData({ ...formData, isHalfDay: e.target.checked })}
                                className="rounded"
                            />
                            Half Day
                            </label>
                        </div>
                        </div>

                        <div className="space-y-2">
                        <Label>Reason</Label>
                        <Textarea
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                            placeholder="Reason..."
                            rows={3}
                        />
                        </div>

                        {/* Insufficient balance warning */}
                        {adminIsInsufficientBalance && adminSelectedBalance && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                            <p className="text-sm font-medium">Insufficient leave balance</p>
                            <p className="text-xs text-amber-700 mt-1">
                            Requesting {adminRequestedDays} day(s) but only {adminSelectedBalance.remaining} day(s) remaining.
                            The excess {(adminRequestedDays - adminSelectedBalance.remaining).toFixed(1)} day(s) will be automatically converted to Unpaid Leave.
                            </p>
                        </div>
                        )}

                        {/* Cross-month leave warning */}
                        {formData.startDate && formData.endDate && parseFloat(formData.days) > 0 && (
                        <CrossMonthLeaveWarning
                            startDate={formData.startDate}
                            endDate={formData.endDate}
                            totalDays={parseFloat(formData.days)}
                        />
                        )}

                        {/* Payroll period info for the leave */}
                        {formData.endDate && (
                        <PayrollCycleIndicator month={formData.endDate.substring(0, 7)} label="Leave" />
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={createMutation.isPending || !!dateError}>
                            {createMutation.isPending ? "Submitting..." : "Submit"}
                        </Button>
                        </div>
                    </div>
                    </DialogContent>
                </Dialog>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Customers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customersList.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Countries" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {availableCountries.map((cc) => (
                    <SelectItem key={cc} value={cc}>{cc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {viewTab === "active" && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="client_approved">Client Approved</SelectItem>
                    <SelectItem value="client_rejected">Client Rejected</SelectItem>
                    <SelectItem value="admin_rejected">Admin Rejected</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All Months" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bulk Approve Button */}
            {viewTab === "active" && (() => {
              const pendingApproval = leaves.filter((l) => l.status === "client_approved");
              return pendingApproval.length > 0 ? (
                <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <span className="text-sm text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 inline mr-1" />
                    {pendingApproval.length} leave record(s) pending EG approval
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                    onClick={() => bulkApproveMutation.mutate({ ids: pendingApproval.map((l) => l.id) })}
                    disabled={bulkApproveMutation.isPending}
                  >
                    {bulkApproveMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    Approve All ({pendingApproval.length})
                  </Button>
                </div>
              ) : null;
            })()}

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 6 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                          ))}
                          <TableCell></TableCell>
                        </TableRow>
                      ))
                    ) : leaves.length > 0 ? (
                      leaves.map((leave) => {
                        const emp = employeeMap[leave.employeeId];
                        const empName = emp?.name || `Employee #${leave.employeeId}`;
                        // leaveTypeName comes from backend JOIN
                        const typeName = (leave as any).leaveTypeName || `Type #${leave.leaveTypeId}`;
                        return (
                          <TableRow key={leave.id}>
                            <TableCell className="text-sm font-medium">{empName}</TableCell>
                            <TableCell className="text-sm">{typeName}</TableCell>
                            <TableCell className="text-sm">
                              {formatDate(leave.startDate)} — {formatDate(leave.endDate)}
                            </TableCell>
                            <TableCell className="text-sm font-mono">{leave.days}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${statusColors[leave.status] || ""}`}>
                                {leave.status === "locked" && <Lock className="w-3 h-3 mr-1 inline" />}
                                {leave.status.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()) || leave.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {leave.status === "client_approved" && (
                                  <>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                      onClick={() => adminApproveMutation.mutate({ id: leave.id })}
                                      disabled={adminApproveMutation.isPending}
                                      title="Admin Approve"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-7 w-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                      onClick={() => adminRejectMutation.mutate({ id: leave.id })}
                                      disabled={adminRejectMutation.isPending}
                                      title="Admin Reject"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                )}
                                {["submitted", "client_approved"].includes(leave.status) && (
                                  <>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                      onClick={() => handleEdit(leave)}
                                      title="Edit"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => handleDelete(leave.id)}
                                      disabled={deleteMutation.isPending}
                                      title="Delete"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setViewLeave(leave)}
                                  title="View details"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12">
                          <CalendarDays className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">No leave records found.</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            {data && (
              <p className="text-xs text-muted-foreground text-right">
                Showing {leaves.length} of {data.total} leave records
              </p>
            )}
          </TabsContent>

          <TabsContent value="milestones">
            <ContractorMilestones />
          </TabsContent>
        </Tabs>

        {/* View Leave Detail Dialog (read-only) */}
        <Dialog open={!!viewLeave} onOpenChange={(open) => { if (!open) setViewLeave(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Leave Details</DialogTitle></DialogHeader>
            {viewLeave && (
              <div className="space-y-4 mt-4">
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-sm font-medium">{employeeMap[viewLeave.employeeId]?.name || `Employee #${viewLeave.employeeId}`}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{employeeMap[viewLeave.employeeId]?.country || ""}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Leave Type</Label>
                    <p className="text-sm">{(viewLeave as any).leaveTypeName || `Type #${viewLeave.leaveTypeId}`}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Badge variant="outline" className={`text-xs ${statusColors[viewLeave.status] || ""}`}>
                      {viewLeave.status === "locked" && <Lock className="w-3 h-3 mr-1 inline" />}
                      {viewLeave.status.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()) || viewLeave.status}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Start Date</Label>
                    <p className="text-sm font-mono">{formatDate(viewLeave.startDate)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">End Date</Label>
                    <p className="text-sm font-mono">{formatDate(viewLeave.endDate)}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Total Days</Label>
                  <p className="text-sm font-mono">{viewLeave.days}</p>
                </div>

                {viewLeave.reason && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Reason</Label>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewLeave.reason}</p>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button variant="outline" onClick={() => setViewLeave(null)}>Close</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Leave Request</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              {editingEmployee && (
                <p className="text-sm text-muted-foreground">
                  Employee: <strong>{editingEmployee.firstName} {editingEmployee.lastName}</strong> — {countryName(editingEmployee.country)}
                </p>
              )}

              {/* Leave type selector */}
              <div className="space-y-2">
                <Label>Leave Type *</Label>
                <Select
                  value={editFormData.leaveTypeId ? String(editFormData.leaveTypeId) : ""}
                  onValueChange={(v) => setEditFormData({ ...editFormData, leaveTypeId: parseInt(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="Select a leave type" /></SelectTrigger>
                  <SelectContent>
                    {filteredEditLeaveTypes?.map((lt: any) => (
                      <SelectItem key={lt.id} value={String(lt.id)}>
                        {lt.leaveTypeName} {lt.isPaid ? "" : `(Unpaid)`} {lt.annualEntitlement ? `— ${lt.annualEntitlement} days per year` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <DatePicker
                    value={editFormData.startDate}
                    onChange={(v) => setEditFormData({ ...editFormData, startDate: v })}
                    placeholder="Select start date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date *</Label>
                  <DatePicker
                    value={editFormData.endDate}
                    onChange={(v) => setEditFormData({ ...editFormData, endDate: v })}
                    placeholder="Select end date"
                    minDate={editFormData.startDate || undefined}
                  />
                </div>
              </div>

              {editDateError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />{editDateError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Total Days</Label>
                  <Input
                    type="text"
                    value={editFormData.days}
                    readOnly
                    className="font-mono bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label>&nbsp;</Label>
                  <label className="flex items-center gap-2 h-9 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFormData.isHalfDay}
                      onChange={(e) => setEditFormData({ ...editFormData, isHalfDay: e.target.checked })}
                      className="rounded"
                    />
                    Half Day
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={editFormData.reason}
                  onChange={(e) => setEditFormData({ ...editFormData, reason: e.target.value })}
                  placeholder="Reason..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdate} disabled={updateMutation.isPending || !!editDateError}>
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}