import Layout from "@/components/Layout";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Calendar, DollarSign, User, Briefcase, FileText, CreditCard, Pencil, MapPin, UserPlus, CheckCircle, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyAmount } from "@/components/CurrencyAmount";
import CurrencySelect from "@/components/CurrencySelect";
import CountrySelect from "@/components/CountrySelect";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DatePicker } from "@/components/DatePicker";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, countryName } from "@/lib/format";

function InvoiceDetailDialog({ invoiceId, open, onOpenChange }: { invoiceId: number | null, open: boolean, onOpenChange: (o: boolean) => void }) {
  const { data: invoice, isLoading } = trpc.contractors.invoices.get.useQuery(
    { id: invoiceId! },
    { enabled: !!invoiceId && open }
  );

  if (!invoiceId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Invoice {invoice?.invoiceNumber}</DialogTitle>
          <DialogDescription>
            {invoice ? `${formatDate(invoice.invoiceDate)} · ${invoice.status}` : "Loading..."}
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : invoice ? (
          <div className="space-y-6">
             <div className="flex justify-between text-sm">
               <div>
                 <div className="text-muted-foreground">From:</div>
                 <div className="font-medium">{invoice.contractorName}</div>
               </div>
               <div className="text-right">
                 <div className="text-muted-foreground">To:</div>
                 <div className="font-medium">{invoice.customerName}</div>
               </div>
             </div>

             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>Description</TableHead>
                   <TableHead className="text-right">Quantity</TableHead>
                   <TableHead className="text-right">Unit Price</TableHead>
                   <TableHead className="text-right">Amount</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {invoice.items?.map((item: any) => (
                   <TableRow key={item.id}>
                     <TableCell>{item.description}</TableCell>
                     <TableCell className="text-right">{item.quantity}</TableCell>
                     <TableCell className="text-right">{formatCurrencyAmount(item.unitPrice, invoice.currency)}</TableCell>
                     <TableCell className="text-right font-medium">{formatCurrencyAmount(item.amount, invoice.currency)}</TableCell>
                   </TableRow>
                 ))}
                 <TableRow>
                   <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                   <TableCell className="text-right font-bold text-lg">
                     {formatCurrencyAmount(invoice.totalAmount, invoice.currency)}
                   </TableCell>
                 </TableRow>
               </TableBody>
             </Table>
             
             <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                <Button onClick={() => window.print()}>Download PDF</Button>
             </div>
          </div>
        ) : (
          <div>Not found</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Edit Contractor Dialog
function EditContractorDialog({ contractor, open, onOpenChange, onSuccess }: {
  contractor: any;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}) {
  const { data: approvers } = trpc.contractors.getApprovers.useQuery();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    nationality: "",
    idNumber: "",
    idType: "",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    department: "",
    jobTitle: "",
    startDate: "",
    endDate: "",
    currency: "USD",
    paymentFrequency: "monthly" as "monthly" | "semi_monthly" | "milestone",
    rateType: "fixed_monthly" as "fixed_monthly" | "hourly" | "daily" | "milestone_only",
    rateAmount: "",
    defaultApproverId: 0,
    notes: "",
  });

  // Populate form when contractor data changes
  useEffect(() => {
    if (contractor && open) {
      setForm({
        firstName: contractor.firstName || "",
        lastName: contractor.lastName || "",
        email: contractor.email || "",
        phone: contractor.phone || "",
        dateOfBirth: contractor.dateOfBirth || "",
        nationality: contractor.nationality || "",
        idNumber: contractor.idNumber || "",
        idType: contractor.idType || "",
        address: contractor.address || "",
        city: contractor.city || "",
        state: contractor.state || "",
        country: contractor.country || "",
        postalCode: contractor.postalCode || "",
        department: contractor.department || "",
        jobTitle: contractor.jobTitle || "",
        startDate: contractor.startDate || "",
        endDate: contractor.endDate || "",
        currency: contractor.currency || "USD",
        paymentFrequency: contractor.paymentFrequency || "monthly",
        rateType: contractor.rateType || "fixed_monthly",
        rateAmount: contractor.rateAmount || "",
        defaultApproverId: contractor.defaultApproverId || 0,
        notes: contractor.notes || "",
      });
    }
  }, [contractor, open]);

  const updateMutation = trpc.contractors.update.useMutation({
    onSuccess: () => {
      toast.success("Contractor updated successfully");
      onOpenChange(false);
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    const data: any = {};
    // Only send changed fields
    if (form.firstName !== (contractor.firstName || "")) data.firstName = form.firstName;
    if (form.lastName !== (contractor.lastName || "")) data.lastName = form.lastName;
    if (form.email !== (contractor.email || "")) data.email = form.email;
    if (form.phone !== (contractor.phone || "")) data.phone = form.phone;
    if (form.dateOfBirth !== (contractor.dateOfBirth || "")) data.dateOfBirth = form.dateOfBirth;
    if (form.nationality !== (contractor.nationality || "")) data.nationality = form.nationality;
    if (form.idNumber !== (contractor.idNumber || "")) data.idNumber = form.idNumber;
    if (form.idType !== (contractor.idType || "")) data.idType = form.idType;
    if (form.address !== (contractor.address || "")) data.address = form.address;
    if (form.city !== (contractor.city || "")) data.city = form.city;
    if (form.state !== (contractor.state || "")) data.state = form.state;
    if (form.country !== (contractor.country || "")) data.country = form.country;
    if (form.postalCode !== (contractor.postalCode || "")) data.postalCode = form.postalCode;
    if (form.department !== (contractor.department || "")) data.department = form.department;
    if (form.jobTitle !== (contractor.jobTitle || "")) data.jobTitle = form.jobTitle;
    if (form.startDate !== (contractor.startDate || "")) data.startDate = form.startDate;
    if (form.endDate !== (contractor.endDate || "")) data.endDate = form.endDate;
    if (form.currency !== (contractor.currency || "USD")) data.currency = form.currency;
    if (form.paymentFrequency !== (contractor.paymentFrequency || "monthly")) data.paymentFrequency = form.paymentFrequency;
    if (form.rateType !== (contractor.rateType || "fixed_monthly")) data.rateType = form.rateType;
    if (form.rateAmount !== (contractor.rateAmount || "")) data.rateAmount = form.rateAmount;
    if (form.defaultApproverId !== (contractor.defaultApproverId || 0)) {
      if (form.defaultApproverId > 0) data.defaultApproverId = form.defaultApproverId;
    }
    if (form.notes !== (contractor.notes || "")) data.notes = form.notes;

    if (Object.keys(data).length === 0) {
      toast.info("No changes detected");
      return;
    }

    updateMutation.mutate({ id: contractor.id, data });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Contractor</DialogTitle>
          <DialogDescription>Update contractor information. Only changed fields will be saved.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Personal Information */}
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Personal Information</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+1 234 567 8900" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.dateOfBirth} onChange={e => setForm({...form, dateOfBirth: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Input value={form.nationality} onChange={e => setForm({...form, nationality: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>ID Type</Label>
              <Select value={form.idType || "none"} onValueChange={v => setForm({...form, idType: v === "none" ? "" : v})}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="passport">Passport</SelectItem>
                  <SelectItem value="national_id">National ID</SelectItem>
                  <SelectItem value="drivers_license">Driver's License</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.idType && form.idType !== "none" && (
            <div className="space-y-2">
              <Label>ID Number</Label>
              <Input value={form.idNumber} onChange={e => setForm({...form, idNumber: e.target.value})} />
            </div>
          )}

          {/* Address */}
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mt-2">Address</h4>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Street address" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>State / Province</Label>
              <Input value={form.state} onChange={e => setForm({...form, state: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Postal Code</Label>
              <Input value={form.postalCode} onChange={e => setForm({...form, postalCode: e.target.value})} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Country/Region</Label>
            <CountrySelect value={form.country} onValueChange={v => setForm({...form, country: v})} showCode={false} scope="all" />
          </div>

          {/* Service Information */}
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mt-2">Service Information</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Job Title</Label>
              <Input value={form.jobTitle} onChange={e => setForm({...form, jobTitle: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Input value={form.department} onChange={e => setForm({...form, department: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Default Approver</Label>
            <Select value={form.defaultApproverId ? String(form.defaultApproverId) : "0"} onValueChange={v => setForm({...form, defaultApproverId: parseInt(v)})}>
              <SelectTrigger><SelectValue placeholder="Select Approver" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">None</SelectItem>
                {approvers?.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.email})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Financial Configuration */}
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mt-2">Financial Configuration</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Currency</Label>
              <CurrencySelect value={form.currency} onValueChange={v => setForm({...form, currency: v})} />
            </div>
            <div className="space-y-2">
              <Label>Payment Frequency</Label>
              <Select value={form.paymentFrequency} onValueChange={v => setForm({...form, paymentFrequency: v as any})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="semi_monthly">Semi-Monthly</SelectItem>
                  <SelectItem value="milestone">Milestone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rate Type</Label>
              <Select value={form.rateType} onValueChange={v => setForm({...form, rateType: v as any})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_monthly">Fixed Monthly</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="milestone_only">Milestone Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.rateType !== "milestone_only" && (
              <div className="space-y-2">
                <Label>Rate Amount</Label>
                <Input type="number" value={form.rateAmount} onChange={e => setForm({...form, rateAmount: e.target.value})} />
              </div>
            )}
          </div>

          {/* Notes */}
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mt-2">Notes</h4>
          <div className="space-y-2">
            <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Internal notes about this contractor..." rows={3} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ContractorDetail() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [activeTab, setActiveTab] = useState("overview");

  const { data: contractor, isLoading, refetch } = trpc.contractors.get.useQuery({ id }, { enabled: !!id });
  const { data: milestones, refetch: refetchMilestones } = trpc.contractors.milestones.list.useQuery({ contractorId: id }, { enabled: !!id && activeTab === "milestones" });
  const { data: adjustments, refetch: refetchAdjustments } = trpc.contractors.adjustments.list.useQuery({ contractorId: id }, { enabled: !!id && activeTab === "adjustments" });
  const { data: invoices, refetch: refetchInvoices } = trpc.contractors.invoices.list.useQuery({ contractorId: id }, { enabled: !!id && activeTab === "invoices" });
  
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Worker Portal invite
  const { data: workerPortalStatus, refetch: refetchWpStatus } = trpc.contractors.workerPortalStatus.useQuery(
    { contractorId: id },
    { enabled: !!id }
  );
  const inviteToWorkerPortalMutation = trpc.contractors.inviteToWorkerPortal.useMutation({
    onSuccess: (data) => {
      if (data.alreadyExists) {
        toast.success(`Invite resent to ${data.email}`);
      } else {
        toast.success(`Worker Portal invite sent to ${data.email}`);
      }
      refetchWpStatus();
    },
    onError: (err) => toast.error(err.message),
  });

  const createMilestoneMutation = trpc.contractors.milestones.create.useMutation({
    onSuccess: () => {
      toast.success("Milestone created");
      setMilestoneOpen(false);
      refetchMilestones();
    },
    onError: (err) => toast.error(err.message),
  });

  const createAdjustmentMutation = trpc.contractors.adjustments.create.useMutation({
    onSuccess: () => {
      toast.success("Adjustment created");
      setAdjustmentOpen(false);
      refetchAdjustments();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusUpdateMutation = trpc.contractors.update.useMutation({
    onSuccess: () => {
      toast.success("Updated");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusColors: Record<string, string> = {
    pending_review: "bg-amber-50 text-amber-700 border-amber-200",
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    onboarding: "bg-blue-50 text-blue-700 border-blue-200",
    offboarding: "bg-orange-50 text-orange-700 border-orange-200",
    terminated: "bg-red-50 text-red-700 border-red-200",
  };

  const contractorTransitions: Record<string, { label: string; value: string; variant?: string }[]> = {
    pending_review: [
      { label: "Activate", value: "active" },
      { label: "Terminate", value: "terminated", variant: "destructive" },
    ],
    active: [
      { label: "Terminate", value: "terminated", variant: "destructive" },
    ],
    terminated: [
      { label: "Reactivate", value: "active", variant: "outline" },
    ],
  };

  // Terminate dialog state
  const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
  const [terminateEndDate, setTerminateEndDate] = useState("");
  const [terminateReason, setTerminateReason] = useState("");

  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({
    title: "",
    description: "",
    amount: "",
    dueDate: "",
  });

  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    type: "bonus" as "bonus" | "expense" | "deduction",
    description: "",
    amount: "",
    date: new Date().toISOString().split('T')[0],
  });

  // Currency is locked from the contractor record
  const contractorCurrency = contractor?.currency || "USD";

  if (isLoading) return <Layout>Loading...</Layout>;
  if (!contractor) return <Layout>Not Found</Layout>;

  return (
    <Layout breadcrumb={["EG", "People", "Contractors", `${contractor.firstName} ${contractor.lastName}`]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/people?tab=contractors")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{contractor.firstName} {contractor.lastName}</h1>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <span className="font-mono">{contractor.contractorCode}</span>
              <span>·</span>
              <span>{contractor.jobTitle}</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {/* Worker Portal Invite Button */}
            {workerPortalStatus && !workerPortalStatus.hasAccount && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => inviteToWorkerPortalMutation.mutate({ contractorId: contractor.id, email: contractor.email || undefined })}
                disabled={inviteToWorkerPortalMutation.isPending}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Invite to Worker Portal
              </Button>
            )}
            {workerPortalStatus?.hasAccount && !workerPortalStatus.passwordSet && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => inviteToWorkerPortalMutation.mutate({ contractorId: contractor.id })}
                disabled={inviteToWorkerPortalMutation.isPending}
                className="text-amber-600 border-amber-300"
              >
                <Send className="w-4 h-4 mr-2" />
                Resend Invite
              </Button>
            )}
            {workerPortalStatus?.hasAccount && workerPortalStatus.passwordSet && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 h-9 px-3 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                Worker Portal Active
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </Button>
            {(contractorTransitions[contractor.status] || []).map((tr) => (
              <Button key={tr.value}
                variant={tr.variant === "destructive" ? "destructive" : tr.variant === "outline" ? "outline" : "default"}
                size="sm"
                onClick={() => {
                  if (tr.value === "terminated") {
                    setTerminateEndDate(new Date().toISOString().split('T')[0]);
                    setTerminateReason("");
                    setTerminateDialogOpen(true);
                    return;
                  }
                  statusUpdateMutation.mutate({ id: contractor.id, data: { status: tr.value as any } });
                }}
                disabled={statusUpdateMutation.isPending}>
                {tr.label}
              </Button>
            ))}
          </div>
          <Badge variant="outline" className={`capitalize ${statusColors[contractor.status] || ""}`}>
            {(contractor.status || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="milestones">Milestones</TabsTrigger>
            <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>

          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" /> Personal Information</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <InfoRow label="Email" value={contractor.email} />
                  <InfoRow label="Phone" value={contractor.phone} />
                  <InfoRow label="Date of Birth" value={formatDate(contractor.dateOfBirth)} />
                  <InfoRow label="Nationality" value={contractor.nationality} />
                  <InfoRow label="ID Type" value={contractor.idType} />
                  <InfoRow label="ID Number" value={contractor.idNumber} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" /> Address</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <InfoRow label="Address" value={contractor.address} />
                  <InfoRow label="City" value={contractor.city} />
                  <InfoRow label="State / Province" value={contractor.state} />
                  <InfoRow label="Country/Region" value={countryName(contractor.country)} />
                  <InfoRow label="Postal Code" value={contractor.postalCode} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="w-4 h-4" /> Service Information</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <InfoRow label="Job Title" value={contractor.jobTitle} />
                  <InfoRow label="Department" value={contractor.department} />
                  <InfoRow label="Start Date" value={formatDate(contractor.startDate)} />
                  <InfoRow label="End Date" value={formatDate(contractor.endDate)} />
                  <InfoRow label="Default Approver" value={contractor.defaultApproverName} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" /> Financial Configuration</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <InfoRow label="Currency" value={contractor.currency} />
                  <InfoRow label="Payment Frequency" value={contractor.paymentFrequency} />
                  <InfoRow label="Rate Type" value={contractor.rateType} />
                  <InfoRow label="Rate Amount" value={contractor.rateAmount ? formatCurrencyAmount(contractor.rateAmount, contractor.currency) : "—"} />
                  <InfoRow label="Next Payment Date" value={formatDate(contractor.nextPaymentDate)} />
                </CardContent>
              </Card>

              {(() => {
                const bd = contractor.bankDetails as Record<string, string> | null;
                if (!bd || typeof bd !== "object" || Object.keys(bd).length === 0) return null;
                return (
                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" /> Bank Details</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      {Object.entries(bd).map(([key, value]) => (
                        value ? (
                          <InfoRow key={key} label={key.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase()).trim()} value={String(value)} />
                        ) : null
                      ))}
                    </CardContent>
                  </Card>
                );
              })()}

              {contractor.notes && (
                <Card className="md:col-span-2">
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> Notes</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{contractor.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Milestones Tab */}
          <TabsContent value="milestones" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Milestones</h3>
            </div>
            <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Milestone</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input value={milestoneForm.title} onChange={e => setMilestoneForm({...milestoneForm, title: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input value={milestoneForm.description} onChange={e => setMilestoneForm({...milestoneForm, description: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Amount</Label>
                        <Input type="number" value={milestoneForm.amount} onChange={e => setMilestoneForm({...milestoneForm, amount: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label>Currency</Label>
                        <Input value={contractorCurrency} readOnly disabled className="bg-muted" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <Input type="date" value={milestoneForm.dueDate} onChange={e => setMilestoneForm({...milestoneForm, dueDate: e.target.value})} />
                    </div>
                    <Button className="w-full" onClick={() => createMilestoneMutation.mutate({...milestoneForm, currency: contractorCurrency, contractorId: id})} disabled={createMilestoneMutation.isPending}>
                      {createMilestoneMutation.isPending ? "Creating..." : "Create Milestone"}
                    </Button>
                  </div>
                </DialogContent>
            </Dialog>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Approved By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {milestones?.length ? milestones.map(m => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="font-medium">{m.title}</div>
                          <div className="text-xs text-muted-foreground">{m.description}</div>
                        </TableCell>
                        <TableCell className="font-mono">{m.currency} {m.amount}</TableCell>
                        <TableCell>{formatDate(m.dueDate)}</TableCell>
                        <TableCell><Badge variant="outline">{m.status}</Badge></TableCell>
                        <TableCell className="text-sm">
                          {m.approverName ? (
                            <div>
                              <div>{m.approverName}</div>
                              {m.adminApprovedAt && <div className="text-xs text-muted-foreground">{formatDate(m.adminApprovedAt)}</div>}
                            </div>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No milestones found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Adjustments Tab */}
          <TabsContent value="adjustments" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Adjustments</h3>
            </div>
            <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}>
                <DialogContent>
                  <DialogHeader><DialogTitle>Adjustments</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={adjustmentForm.type} onValueChange={(v: any) => setAdjustmentForm({...adjustmentForm, type: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bonus">Bonus</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="deduction">Deduction</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input value={adjustmentForm.description} onChange={e => setAdjustmentForm({...adjustmentForm, description: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Amount</Label>
                        <Input type="number" value={adjustmentForm.amount} onChange={e => setAdjustmentForm({...adjustmentForm, amount: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label>Currency</Label>
                        <Input value={contractorCurrency} readOnly disabled className="bg-muted" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={adjustmentForm.date} onChange={e => setAdjustmentForm({...adjustmentForm, date: e.target.value})} />
                    </div>
                    <Button className="w-full" onClick={() => createAdjustmentMutation.mutate({...adjustmentForm, currency: contractorCurrency, contractorId: id})} disabled={createAdjustmentMutation.isPending}>
                      {createAdjustmentMutation.isPending ? "Creating..." : "Create Adjustment"}
                    </Button>
                  </div>
                </DialogContent>
            </Dialog>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustments?.length ? adjustments.map(adj => (
                      <TableRow key={adj.id}>
                        <TableCell className="capitalize font-medium">{adj.type}</TableCell>
                        <TableCell>{adj.description}</TableCell>
                        <TableCell className={adj.type === 'deduction' ? "text-red-500 font-mono" : "text-green-600 font-mono"}>
                          {adj.type === 'deduction' ? "-" : "+"}{adj.currency} {adj.amount}
                        </TableCell>
                        <TableCell>{formatDate(adj.effectiveMonth)}</TableCell>
                        <TableCell><Badge variant="outline">{adj.status}</Badge></TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No adjustments found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-4">
            <h3 className="text-lg font-medium">Invoices</h3>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices?.length ? invoices.map(inv => (
                      <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedInvoiceId(inv.id); setInvoiceOpen(true); }}>
                        <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                        <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                        <TableCell className="font-mono">{inv.currency} {inv.totalAmount}</TableCell>
                        <TableCell><Badge variant="outline">{inv.status}</Badge></TableCell>
                        <TableCell><FileText className="w-4 h-4 text-muted-foreground" /></TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No invoices found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <InvoiceDetailDialog 
              invoiceId={selectedInvoiceId} 
              open={invoiceOpen} 
              onOpenChange={setInvoiceOpen} 
            />
          </TabsContent>


        </Tabs>

        {/* Edit Dialog */}
        <EditContractorDialog
          contractor={contractor}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSuccess={() => refetch()}
        />

        {/* Terminate Dialog */}
        <Dialog open={terminateDialogOpen} onOpenChange={setTerminateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Terminate Contractor</DialogTitle>
              <DialogDescription>
                Please confirm termination details for this contractor.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>End Date</Label>
                <DatePicker
                  value={terminateEndDate}
                  onChange={(d) => setTerminateEndDate(d || new Date().toISOString().split('T')[0])}
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={terminateReason}
                  onChange={(e) => setTerminateReason(e.target.value)}
                  placeholder="Enter reason for termination"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTerminateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={statusUpdateMutation.isPending}
                onClick={() => {
                  statusUpdateMutation.mutate(
                    { id: contractor.id, data: { status: "terminated" as any, endDate: terminateEndDate } },
                    {
                      onSuccess: () => {
                        setTerminateDialogOpen(false);
                        toast.success("Contractor terminated successfully");
                        refetch();
                      },
                    }
                  );
                }}
              >
                {statusUpdateMutation.isPending ? "Processing..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between py-1 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}