import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, CalendarDays, Loader2, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "@/components/DatePicker";
import { formatDate, formatCurrency } from "@/lib/format";
import { exportToCsv } from "@/lib/csvExport";
import ContractorSelector from "@/components/ContractorSelector";

const statusColors: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paid: "bg-blue-50 text-blue-700 border-blue-200",
  cancelled: "bg-gray-50 text-gray-700 border-gray-200",
};

export default function ContractorMilestones() {
  const [selectedContractorId, setSelectedContractorId] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [viewTab, setViewTab] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<any>(null);

  // Load contractors
  const { data: contractorsData } = trpc.contractors.list.useQuery({
    limit: 500,
  });
  const contractors = contractorsData?.data || [];

  const { data: customersData } = trpc.customers.list.useQuery({ limit: 200 });
  const customersList = customersData?.data || [];

  // Load all milestones with filters
  const { data: milestones, isLoading, refetch } = trpc.contractors.milestones.listAll.useQuery({
    customerId: customerFilter !== "all" ? parseInt(customerFilter) : undefined,
    search: search || undefined,
  });

  const createMutation = trpc.contractors.milestones.create.useMutation({
    onSuccess: () => {
      toast.success("Milestone created");
      setCreateOpen(false);
      refetch();
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.contractors.milestones.update.useMutation({
    onSuccess: () => {
      toast.success("Milestone updated");
      setEditOpen(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.contractors.milestones.delete.useMutation({
    onSuccess: () => {
      toast.success("Milestone deleted");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [formData, setFormData] = useState({
    customerId: "",
    contractorId: "",
    title: "",
    description: "",
    amount: "",
    currency: "USD",
    dueDate: "",
  });

  function resetForm() {
    setFormData({
      customerId: "",
      contractorId: "",
      title: "",
      description: "",
      amount: "",
      currency: "USD",
      dueDate: "",
    });
  }

  // Filtered contractors based on selected customer
  const availableContractors = useMemo(() => {
    if (!formData.contractorId && customerFilter !== "all") {
        return contractors.filter((c: any) => String(c.customerId) === customerFilter);
    }
    return contractors;
  }, [contractors, customerFilter, formData.contractorId]);

  function handleCreate() {
    if (!formData.contractorId) {
      toast.error("Please select a contractor");
      return;
    }
    if (!formData.title || !formData.amount) {
      toast.error("Required");
      return;
    }
    createMutation.mutate({
      contractorId: parseInt(formData.contractorId),
      title: formData.title,
      description: formData.description,
      amount: formData.amount,
      currency: formData.currency,
      dueDate: formData.dueDate || undefined,
    });
  }

  function handleEdit(milestone: any) {
    setEditingMilestone(milestone);
    const contractor = contractors.find((c: any) => c.id === milestone.contractorId);
    setFormData({
      customerId: contractor ? String(contractor.customerId) : "",
      contractorId: String(milestone.contractorId),
      title: milestone.title,
      description: milestone.description || "",
      amount: milestone.amount,
      currency: milestone.currency,
      dueDate: milestone.dueDate || "",
    });
    setEditOpen(true);
  }

  function handleUpdate() {
    if (!editingMilestone) return;
    updateMutation.mutate({
      id: editingMilestone.id,
      data: {
        title: formData.title,
        description: formData.description,
        amount: formData.amount,
        dueDate: formData.dueDate || undefined,
      },
    });
  }

  function handleDelete(id: number) {
    if (confirm("Are you sure?")) {
      deleteMutation.mutate({ id });
    }
  }

  const filteredMilestones = useMemo(() => {
    let list = milestones || [];
    
    // Status filtering based on tab
    const activeStatuses = ["pending", "in_progress", "submitted", "changes_requested"];
    const historyStatuses = ["approved", "paid", "cancelled", "rejected"];
    
    if (viewTab === "active") {
      list = list.filter((m: any) => activeStatuses.includes(m.status));
    } else {
      list = list.filter((m: any) => historyStatuses.includes(m.status));
    }

    if (selectedContractorId !== "all") {
      list = list.filter((m: any) => String(m.contractorId) === selectedContractorId);
    }
    return list;
  }, [milestones, selectedContractorId, viewTab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
         <Tabs value={viewTab} onValueChange={setViewTab} className="w-auto">
            <TabsList>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
         </Tabs>

        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => {
                exportToCsv(filteredMilestones, [
                  { header: "Contractor", accessor: (r: any) => `${r.contractorFirstName} ${r.contractorLastName}` },
                  { header: "Title", accessor: (r: any) => r.title },
                  { header: "Amount", accessor: (r: any) => r.amount },
                  { header: "Currency", accessor: (r: any) => r.currency },
                  { header: "Due Date", accessor: (r: any) => r.dueDate ? formatDate(r.dueDate) : "" },
                  { header: "Status", accessor: (r: any) => r.status },
                ], `milestones-export-${new Date().toISOString().slice(0, 10)}.csv`);
            }}>
                <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> New
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search milestones..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            {customersList.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedContractorId} onValueChange={setSelectedContractorId}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Contractors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contractors</SelectItem>
            {contractors.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.firstName} {c.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contractor</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMilestones.length > 0 ? (
                  filteredMilestones.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.contractorFirstName} {m.contractorLastName}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{m.title}</div>
                        {m.description && <div className="text-xs text-muted-foreground">{m.description}</div>}
                      </TableCell>
                      <TableCell className="font-mono">
                        {m.currency} {parseFloat(m.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>{m.dueDate ? formatDate(m.dueDate) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[m.status] || ""}>
                          {(m.status || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || m.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {m.status === "pending" && (
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(m)}>
                              <Pencil className="w-3.5 h-3.5 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(m.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <CalendarDays className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No milestones found</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={createOpen || editOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditOpen(false); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editOpen ? "Edit Milestone" : "New Milestone"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 mt-2">
            {!editOpen && (
              <ContractorSelector
                value={formData.contractorId ? parseInt(formData.contractorId) : 0}
                onValueChange={(v) => {
                  const c = contractors.find((c: any) => c.id === v);
                  setFormData({
                    ...formData,
                    contractorId: String(v),
                    customerId: c ? String(c.customerId) : formData.customerId,
                    currency: (c as any)?.currency || "USD"
                  });
                }}
                showCustomerFilter={true}
                customerId={formData.customerId ? parseInt(formData.customerId) : undefined}
                onCustomerChange={(cid) => {
                  setFormData({ ...formData, customerId: cid ? String(cid) : "", contractorId: "" });
                }}
                required
                label="Contractor"
              />
            )}
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Amount *</Label>
              <div className="flex gap-2">
                <div className="w-20 flex items-center justify-center text-sm font-mono bg-muted rounded-md border">{formData.currency}</div>
                <Input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <DatePicker value={formData.dueDate} onChange={(d) => setFormData({ ...formData, dueDate: d })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setCreateOpen(false); setEditOpen(false); }}>Cancel</Button>
              <Button onClick={editOpen ? handleUpdate : handleCreate} disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editOpen ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}