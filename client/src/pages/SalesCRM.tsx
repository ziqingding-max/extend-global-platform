/**
 * EG Admin — Sales CRM Pipeline
 *
 * Pipeline stages:
 *   Discovery       → Only contact info, no clear demand
 *   Leads           → Clear demand (intended services + target countries)
 *   Quotation Sent  → Quotation sent to prospect
 *   MSA Sent        → MSA sent to prospect
 *   MSA Signed      → Both parties signed → create Customer, arrange kickoff
 *   Closed Won      → First employee onboarding confirmed
 *   Closed Lost     → Deal lost
 */
import Layout from "@/components/Layout";
import CountrySelect, { ALL_COUNTRIES } from "@/components/CountrySelect";
import { DatePicker } from "@/components/DatePicker";
import { formatDate, formatDateISO, formatDateTime, countryName } from "@/lib/format";
import { trpc } from "@/lib/trpc";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Briefcase, Plus, Search, ArrowLeft, Mail, Phone, Users, ChevronRight,
  Trash2, Pencil, ArrowRightLeft, ExternalLink, MessageSquare, PhoneCall,
  Upload, FileIcon, Calendar, Send, MoreHorizontal, ChevronsUpDown, X,
  CheckCircle2, Info, FileText, History, ChevronDown, XCircle,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ── Status configuration ────────────────────────────────────────────────────

const STATUS_LIST = [
  "discovery", "leads", "quotation_sent", "msa_sent", "msa_signed", "closed_won", "closed_lost",
] as const;

// Pipeline card statuses (the 5 active stages)
const PIPELINE_STATUSES = ["discovery", "leads", "quotation_sent", "msa_sent", "msa_signed"] as const;

// Active = still in pipeline (not terminal)
const ACTIVE_STATUSES = ["discovery", "leads", "quotation_sent", "msa_sent", "msa_signed"] as const;

const statusColors: Record<string, string> = {
  discovery: "bg-slate-50 text-slate-700 border-slate-200",
  leads: "bg-blue-50 text-blue-700 border-blue-200",
  quotation_sent: "bg-amber-50 text-amber-700 border-amber-200",
  msa_sent: "bg-violet-50 text-violet-700 border-violet-200",
  msa_signed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed_won: "bg-green-50 text-green-700 border-green-200",
  closed_lost: "bg-red-50 text-red-700 border-red-200",
};

const ACTIVITY_TYPES = ["call", "email", "meeting", "note", "proposal", "follow_up", "other"] as const;

const activityIcons: Record<string, React.ReactNode> = {
  call: <PhoneCall className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
  meeting: <Calendar className="w-3.5 h-3.5" />,
  note: <FileText className="w-3.5 h-3.5" />,
  proposal: <Send className="w-3.5 h-3.5" />,
  follow_up: <MessageSquare className="w-3.5 h-3.5" />,
  other: <MoreHorizontal className="w-3.5 h-3.5" />,
};

const LEAD_SOURCES = [
  "Website", "Referral", "Cold Call", "LinkedIn", "Conference", "Partner", "Inbound Email", "Other",
];

const SERVICE_OPTIONS = [
  { value: "eor", label: "EOR" },
  { value: "visa_eor", label: "Visa EOR" },
  { value: "aor", label: "AOR" },
  { value: "peo", label: "PEO" },
  { value: "payroll", label: "Payroll" },
  { value: "consulting", label: "Consulting" },
] as const;

// ── Multi-select for services ──────────────────────────────────────────────
function ServiceMultiSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = useMemo(() => value ? value.split(",").map(s => s.trim()).filter(Boolean) : [], [value]);
  const [open, setOpen] = useState(false);
  const toggle = (svc: string) => {
    const next = selected.includes(svc) ? selected.filter(s => s !== svc) : [...selected, svc];
    onChange(next.join(", "));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between text-left font-normal h-auto min-h-9 py-1.5">
          <span className="flex flex-wrap gap-1">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">Select services</span>
            ) : (
              selected.map(s => {
                const opt = SERVICE_OPTIONS.find(o => o.value === s);
                return <Badge key={s} variant="secondary" className="text-xs">{opt?.label || s}</Badge>;
              })
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          {SERVICE_OPTIONS.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
              <Checkbox checked={selected.includes(opt.value)} onCheckedChange={() => toggle(opt.value)} />
              {opt.label}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Add Document Dialog ─────────────────────────────────────────────────────

function AddDocumentDialog({
  leadId,
  open,
  onOpenChange,
  onSuccess,
}: {
  leadId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [docType, setDocType] = useState<string>("contract");
  const [file, setFile] = useState<File | null>(null);

  const uploadMutation = trpc.sales.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      onOpenChange(false);
      onSuccess();
      setFile(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUpload = () => {
      if (!file) {
          toast.error("Please select a file");
          return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
          const result = e.target?.result as string;
          // Extract base64 part
          const base64 = result.split(',')[1];
          uploadMutation.mutate({
              leadId,
              docType: docType as any,
              fileName: file.name,
              fileBase64: base64,
              mimeType: file.type
          });
      };
      reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contract">Contract (MSA)</SelectItem>
                <SelectItem value="proposal">Proposal</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>File</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? "Loading..." : "Upload"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Multi-select for target countries ──────────────────────────────────────
function CountryMultiSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = useMemo(() => value ? value.split(",").map(s => s.trim()).filter(Boolean) : [], [value]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search) return ALL_COUNTRIES;
    const q = search.toLowerCase();
    return ALL_COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [search]);
  const toggle = (code: string) => {
    const next = selected.includes(code) ? selected.filter(s => s !== code) : [...selected, code];
    onChange(next.join(", "));
  };
  const removeTag = (code: string) => {
    onChange(selected.filter(s => s !== code).join(", "));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between text-left font-normal h-auto min-h-9 py-1.5">
          <span className="flex flex-wrap gap-1">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">Select countries</span>
            ) : (
              selected.slice(0, 5).map(code => {
                const c = ALL_COUNTRIES.find(x => x.code === code);
                return (
                  <Badge key={code} variant="secondary" className="text-xs gap-0.5">
                    {code}
                    <X className="w-3 h-3 ml-0.5 cursor-pointer" onClick={(e) => { e.stopPropagation(); removeTag(code); }} />
                  </Badge>
                );
              })
            )}
            {selected.length > 5 && <Badge variant="secondary" className="text-xs">+{selected.length - 5}</Badge>}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search countries..." value={search} onValueChange={setSearch} />
          <CommandList className="max-h-48">
            <CommandEmpty>No countries found</CommandEmpty>
            <CommandGroup>
              {filtered.map(c => (
                <CommandItem key={c.code} value={c.code} onSelect={() => toggle(c.code)} className="cursor-pointer">
                  <Checkbox checked={selected.includes(c.code)} className="mr-2" />
                  <span className="text-sm">{c.code} — {c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function SalesCRM() {
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);

  return selectedLeadId ? (
    <LeadDetail leadId={selectedLeadId} onBack={() => setSelectedLeadId(null)} />
  ) : (
    <LeadList onSelect={(id) => setSelectedLeadId(id)} />
  );
}

// ── Lead List ───────────────────────────────────────────────────────────────

function LeadList({ onSelect }: { onSelect: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, refetch } = trpc.sales.list.useQuery({
    search: search || undefined,
    status: statusFilter === "active" ? undefined : statusFilter !== "all" ? statusFilter : undefined,
    limit: 200,
  });

  const { data: usersData } = trpc.sales.assignableUsers.useQuery();

  // Filter active leads client-side when "active" filter is selected
  const filteredLeads = statusFilter === "active"
    ? (data?.data || []).filter((l: any) => (ACTIVE_STATUSES as readonly string[]).includes(l.status))
    : (data?.data || []);

  const defaultForm = {
    companyName: "", contactName: "", contactEmail: "", contactPhone: "",
    country: "", industry: "", source: "", assignedTo: undefined as number | undefined,
    estimatedEmployees: undefined as number | undefined,
    estimatedRevenue: "", currency: "USD", notes: "", expectedCloseDate: "",
    intendedServices: "", targetCountries: "",
  };
  const [formData, setFormData] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  const createMutation = trpc.sales.create.useMutation({
    onSuccess: () => {
      toast.success("New Lead created successfully ✓");
      setCreateOpen(false);
      refetch();
      setFormData(defaultForm);
    },
    onError: (err) => toast.error(err.message),
  });

  function validateAndCreate() {
    const errors: Record<string, boolean> = {};
    if (!formData.companyName.trim()) errors.companyName = true;
    if (formData.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail.trim())) {
      errors.contactEmail = true;
      toast.error("Invalid email address");
      return;
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error("Company Name is required");
      return;
    }
    setFormErrors({});
    createMutation.mutate({
      ...formData,
      contactEmail: formData.contactEmail.trim() === "" ? "" : formData.contactEmail,
      contactPhone: formData.contactPhone.trim() === "" ? undefined : formData.contactPhone,
      country: formData.country.trim() === "" ? undefined : formData.country,
      industry: formData.industry.trim() === "" ? undefined : formData.industry,
      source: formData.source.trim() === "" ? undefined : formData.source,
      notes: formData.notes.trim() === "" ? undefined : formData.notes,
      intendedServices: formData.intendedServices.trim() === "" ? undefined : formData.intendedServices,
      targetCountries: formData.targetCountries.trim() === "" ? undefined : formData.targetCountries,
      assignedTo: formData.assignedTo || undefined,
      estimatedEmployees: formData.estimatedEmployees || undefined,
      estimatedRevenue: formData.estimatedRevenue.trim() === "" ? undefined : formData.estimatedRevenue,
      expectedCloseDate: formData.expectedCloseDate.trim() === "" ? undefined : formData.expectedCloseDate,
    });
  }

  // Pipeline summary counts
  const allLeads = data?.data || [];
  const pipelineCounts: Record<string, number> = {};
  for (const s of PIPELINE_STATUSES) {
    pipelineCounts[s] = allLeads.filter((l: any) => l.status === s).length;
  }
  const closedWonCount = allLeads.filter((l: any) => l.status === "closed_won").length;
  const closedLostCount = allLeads.filter((l: any) => l.status === "closed_lost").length;

  return (
    <Layout breadcrumb={["EG", "Sales CRM"]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sales CRM</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your sales pipeline and track leads</p>
          </div>
          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setFormErrors({}); }}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />New Lead</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className={formErrors.companyName ? "text-destructive" : ""}>Company Name *</Label>
                    <Input
                      className={formErrors.companyName ? "border-destructive ring-destructive" : ""}
                      value={formData.companyName}
                      onChange={(e) => { setFormData({ ...formData, companyName: e.target.value }); if (e.target.value.trim()) setFormErrors(prev => ({ ...prev, companyName: false })); }}
                      placeholder="e.g. Acme Corp"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Source</Label>
                    <Select value={formData.source || "none"} onValueChange={(v) => setFormData({ ...formData, source: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Name</Label>
                    <Input value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Email</Label>
                    <Input type="email" className={formErrors.contactEmail ? "border-destructive ring-destructive" : ""} value={formData.contactEmail} onChange={(e) => { setFormData({ ...formData, contactEmail: e.target.value }); if (formErrors.contactEmail) setFormErrors(prev => ({ ...prev, contactEmail: false })); }} />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Phone</Label>
                    <Input value={formData.contactPhone} onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <CountrySelect value={formData.country} onValueChange={(v) => setFormData({ ...formData, country: v })} scope="all" />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Input value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} placeholder="e.g. Software, Manufacturing" />
                  </div>
                  <div className="space-y-2">
                    <Label>Assigned To</Label>
                    <Select value={formData.assignedTo?.toString() || "none"} onValueChange={(v) => setFormData({ ...formData, assignedTo: v === "none" ? undefined : parseInt(v) })}>
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {usersData?.map((u: any) => <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Intended Services</Label>
                    <ServiceMultiSelect value={formData.intendedServices} onChange={(v) => setFormData({ ...formData, intendedServices: v })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Countries</Label>
                    <CountryMultiSelect value={formData.targetCountries} onChange={(v) => setFormData({ ...formData, targetCountries: v })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Estimated Employees</Label>
                    <Input type="number" min={0} value={formData.estimatedEmployees ?? ""} onChange={(e) => setFormData({ ...formData, estimatedEmployees: e.target.value ? parseInt(e.target.value) : undefined })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Estimated Revenue</Label>
                    <Input type="number" min={0} step="0.01" value={formData.estimatedRevenue} onChange={(e) => setFormData({ ...formData, estimatedRevenue: e.target.value || "" })} placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Close Date</Label>
                    <DatePicker value={formData.expectedCloseDate} onChange={(v) => setFormData({ ...formData, expectedCloseDate: v })} placeholder="Select date" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Any relevant notes about this lead" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={validateAndCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Loading..." : "Create"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Pipeline Summary Cards */}
        <div className="grid grid-cols-7 gap-3">
          {PIPELINE_STATUSES.map(status => (
            <Card key={status} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(status)}>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{pipelineCounts[status] || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">{status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</div>
              </CardContent>
            </Card>
          ))}
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-green-200 bg-green-50/30" onClick={() => setStatusFilter("closed_won")}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-700">{closedWonCount}</div>
              <div className="text-xs text-green-600 mt-1">Closed Won</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-red-200 bg-red-50/30" onClick={() => setStatusFilter("closed_lost")}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-700">{closedLostCount}</div>
              <div className="text-xs text-red-600 mt-1">Closed Lost</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Pipeline (Active)</SelectItem>
              <SelectItem value="all">All Leads</SelectItem>
              {STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Lead Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No data</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Contact Name</TableHead>
                    <TableHead className="min-w-[120px]">Country</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Expected Close Date</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead: any) => {
                    const owner = usersData?.find((u: any) => u.id === lead.createdBy);
                    const assignee = usersData?.find((u: any) => u.id === lead.assignedTo);
                    return (
                      <TableRow
                        key={lead.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => onSelect(lead.id)}
                      >
                        <TableCell className="font-medium">{lead.companyName}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">{lead.contactName || "—"}</span>
                            {lead.contactEmail && <span className="text-xs text-muted-foreground">{lead.contactEmail}</span>}
                          </div>
                        </TableCell>
                        <TableCell>{countryName(lead.country) || "—"}</TableCell>
                        <TableCell>{lead.source || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColors[lead.status] || ""}>
                            {lead.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          </Badge>
                        </TableCell>
                        <TableCell>{owner?.name || "—"}</TableCell>
                        <TableCell>{assignee?.name || "—"}</TableCell>
                        <TableCell>{formatDate(lead.expectedCloseDate)}</TableCell>
                        <TableCell>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

// ── Lead Detail ─────────────────────────────────────────────────────────────

function LeadDetail({ leadId, onBack }: { leadId: number; onBack: () => void }) {
  const [, setLocation] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [closeWonOpen, setCloseWonOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<{ targetStatus: string; isLost: boolean } | null>(null);
  const [lostReasonInput, setLostReasonInput] = useState("");

  const { data: lead, isLoading, refetch } = trpc.sales.get.useQuery({ id: leadId });
  const { data: activities, refetch: refetchActivities } = trpc.sales.activities.list.useQuery({ leadId });
  const { data: documents, refetch: refetchDocuments } = trpc.sales.documents.list.useQuery({ leadId });
  const { data: changeLogs, refetch: refetchChangeLogs } = trpc.sales.changeLogs.list.useQuery({ leadId });
  const { data: usersData } = trpc.sales.assignableUsers.useQuery();
  // Check if customer has employees at onboarding or later stages (for Close Won eligibility)
  const { data: onboardingStatus } = trpc.sales.checkOnboardingStatus.useQuery(
    { leadId },
    { enabled: !!lead && lead.status === "msa_signed" && !!lead.convertedCustomerId }
  );

  const statusMutation = trpc.sales.update.useMutation({
    onSuccess: () => {
      toast.success("Lead status updated successfully");
      setStatusConfirm(null);
      setLostReasonInput("");
      refetch();
      refetchActivities();
      refetchChangeLogs();
    },
    onError: (err) => toast.error(err.message),
  });

  const convertMutation = trpc.sales.convertToCustomer.useMutation({
    onSuccess: (result) => {
      toast.success("Lead converted to customer successfully");
      setConvertOpen(false);
      refetch();
      refetchActivities();
      // Navigate to the new customer
      if (result.customerId) {
        setLocation(`/customers/${result.customerId}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const closeWonMutation = trpc.sales.closeWon.useMutation({
    onSuccess: () => {
      toast.success("Lead closed as won successfully");
      setCloseWonOpen(false);
      refetch();
      refetchActivities();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.sales.delete.useMutation({
    onSuccess: () => {
      toast.success("Lead deleted successfully");
      onBack();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <Layout breadcrumb={["EG", "Sales CRM", "..."]}>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Layout>
    );
  }

  if (!lead) {
    return (
      <Layout breadcrumb={["EG", "Sales CRM"]}>
        <div className="p-6">
          <p className="text-muted-foreground">Lead not found</p>
          <Button variant="outline" className="mt-4" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />Back
          </Button>
        </div>
      </Layout>
    );
  }

  const leadOwner = usersData?.find((u: any) => u.id === lead.createdBy);
  const assignee = usersData?.find((u: any) => u.id === lead.assignedTo);
  const isMsaSigned = lead.status === "msa_signed";
  const isClosedWon = lead.status === "closed_won";
  const isClosedLost = lead.status === "closed_lost";
  const isClosed = isClosedWon || isClosedLost;
  const hasCustomer = !!lead.convertedCustomerId;

  return (
    <Layout breadcrumb={["EG", "Sales CRM", lead.companyName]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{lead.companyName}</h1>
                <Badge variant="outline" className={statusColors[lead.status] || ""}>
                  {lead.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </Badge>
              </div>
              {lead.contactEmail && (
                <p className="text-sm text-muted-foreground mt-1">{lead.contactName} · {lead.contactEmail}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View Customer button — shown when customer exists */}
            {hasCustomer && (
              <Button variant="outline" onClick={() => setLocation(`/customers/${lead.convertedCustomerId}`)}>
                <ExternalLink className="w-4 h-4 mr-2" />View Customer
              </Button>
            )}
            {/* Create Customer button — only at MSA Signed and no customer yet */}
            {isMsaSigned && !hasCustomer && (
              <Button onClick={() => setConvertOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <ArrowRightLeft className="w-4 h-4 mr-2" />Convert to Customer
              </Button>
            )}
            {/* Close Won button — at MSA Signed with customer created + has onboarding employee */}
            {isMsaSigned && hasCustomer && onboardingStatus?.hasOnboardingEmployee && (
              <Button onClick={() => setCloseWonOpen(true)} className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="w-4 h-4 mr-2" />Close Won
              </Button>
            )}
            {!isClosed && (
              <>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="w-4 h-4 mr-2" />Edit
                </Button>
                {!hasCustomer && (
                  <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* MSA Signed Todo Banner */}
        {isMsaSigned && hasCustomer && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">MSA Signed: Next step is to onboard the first employee for this customer.</p>
              {onboardingStatus && !onboardingStatus.hasOnboardingEmployee && (
                <p className="text-xs text-amber-600 mt-1">
                  Awaiting first employee onboarding
                  {onboardingStatus.employeeCount > 0
                    ? ` (${onboardingStatus.employeeCount} employee(s) added, none at onboarding yet)`
                    : " (No employees added yet)"}
                </p>
              )}
              {onboardingStatus?.hasOnboardingEmployee && (
                <p className="text-xs text-green-600 mt-1 font-medium">
                  ✓ {onboardingStatus.onboardingCount} employee(s) at onboarding or later — ready to close as won
                </p>
              )}
            </div>
          </div>
        )}

        {/* Pipeline Progress Bar */}
        {!isClosed && (
          <Card>
            <CardContent className="pt-6 pb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Pipeline Progress</p>
                {!isMsaSigned && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive h-7 text-xs"
                      onClick={() => setStatusConfirm({ targetStatus: "closed_lost", isLost: true })}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" />Mark as Lost
                    </Button>
                  </div>
                )}
              </div>
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1">
                  {PIPELINE_STATUSES.map((status, idx) => {
                    const currentIdx = PIPELINE_STATUSES.indexOf(lead.status as any);
                    const isCompleted = idx < currentIdx;
                    const isCurrent = status === lead.status;
                    const isNext = idx === currentIdx + 1;
                    const isFuture = idx > currentIdx + 1;
                    return (
                      <Tooltip key={status}>
                        <TooltipTrigger asChild>
                          <button
                            className={`flex-1 h-9 rounded-md text-xs font-medium transition-all border ${
                              isCompleted
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : isCurrent
                                ? "bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300"
                                : isNext
                                ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 cursor-pointer"
                                : "bg-muted/50 text-muted-foreground border-muted"
                            }`}
                            disabled={!isNext}
                            onClick={() => {
                              if (isNext) {
                                setStatusConfirm({ targetStatus: status, isLost: false });
                              }
                            }}
                          >
                            {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />}
                            {status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          {isCompleted ? "Completed" : isCurrent ? "Current Stage" : isNext ? "Click to advance" : "Future stage"}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Left: Lead Info */}
          <div className="col-span-2 space-y-6">
            {/* Info Card */}
            <Card>
              <CardHeader><CardTitle>Lead Information</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                  <InfoRow label="Company Name" value={lead.companyName} />
                  <InfoRow label="Contact Name" value={lead.contactName} />
                  <InfoRow label="Contact Email" value={lead.contactEmail} />
                  <InfoRow label="Contact Phone" value={lead.contactPhone} />
                  <InfoRow label="Country" value={countryName(lead.country)} />
                  <InfoRow label="Industry" value={lead.industry} />
                  <InfoRow label="Source" value={lead.source} />
                  <InfoRow label="Owner" value={leadOwner?.name} />
                  <InfoRow label="Assigned To" value={assignee?.name} />
                  <InfoRow label="Intended Services" value={lead.intendedServices ? lead.intendedServices.split(",").map((s: string) => s.trim()).filter(Boolean).map((s: string) => { const opt = SERVICE_OPTIONS.find(o => o.value === s); return opt?.label || s; }).join(", ") : undefined} />
                  <InfoRow label="Target Countries" value={lead.targetCountries ? lead.targetCountries.split(",").map((s: string) => s.trim()).filter(Boolean).map((code: string) => { const c = ALL_COUNTRIES.find(x => x.code === code); return c ? `${code} (${c.name})` : code; }).join(", ") : undefined} />
                  <InfoRow label="Estimated Employees" value={lead.estimatedEmployees?.toString()} />
                  <InfoRow label="Estimated Revenue" value={lead.estimatedRevenue ? `${lead.currency || "USD"} ${lead.estimatedRevenue}` : undefined} />
                  <InfoRow label="Expected Close Date" value={formatDate(lead.expectedCloseDate)} />
                  <InfoRow label="Created" value={formatDateTime(lead.createdAt)} />
                </div>
                {lead.notes && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
                  </div>
                )}
                {isClosedLost && lead.lostReason && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-medium text-destructive mb-1">Lost Reason</p>
                    <p className="text-sm whitespace-pre-wrap">{lead.lostReason}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Documents Card */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Documents</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => setDocumentOpen(true)}>
                        <Upload className="w-3.5 h-3.5 mr-1" />Upload
                    </Button>
                </CardHeader>
                <CardContent>
                    {!documents || documents.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No documents uploaded</p>
                    ) : (
                        <div className="space-y-3">
                            {documents.map((doc: any) => (
                                <div key={doc.id} className="flex items-center justify-between p-3 border rounded bg-muted/30">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded">
                                            <FileIcon className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{doc.fileName}</p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Badge variant="secondary" className="text-[10px] h-4 px-1">{doc.docType}</Badge>
                                                <span>{formatDateTime(doc.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {doc.fileUrl && (
                                            <Button variant="ghost" size="icon" asChild>
                                                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
          </div>

          {/* Right: Activities & Change History */}
          <div className="space-y-6">
            <Card>
              <Tabs defaultValue="activities">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <TabsList className="h-8">
                      <TabsTrigger value="activities" className="text-xs px-3 h-7">Activities</TabsTrigger>
                      <TabsTrigger value="changeLogs" className="text-xs px-3 h-7">
                        <History className="w-3 h-3 mr-1" />Change Logs
                      </TabsTrigger>
                    </TabsList>
                    {!isClosed && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setActivityOpen(true)}>
                        <Plus className="w-3.5 h-3.5 mr-1" />Add Activity
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <TabsContent value="activities" className="mt-0">
                    {!activities || activities.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No activities yet</p>
                    ) : (
                      <div className="space-y-3">
                        {activities.map((act: any) => {
                          const creator = usersData?.find((u: any) => u.id === act.createdBy);
                          return (
                            <div key={act.id} className="flex gap-3 pb-3 border-b last:border-0">
                              <div className="mt-0.5 p-1.5 rounded-md bg-muted flex-shrink-0">
                                {activityIcons[act.activityType] || activityIcons.other}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {act.activityType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDateTime(act.activityDate)}
                                  </span>
                                </div>
                                <p className="text-sm mt-1 whitespace-pre-wrap">{act.description}</p>
                                {creator && (
                                  <p className="text-xs text-muted-foreground mt-1">— {creator.name}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="changeLogs" className="mt-0">
                    {!changeLogs || changeLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No change logs yet</p>
                    ) : (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {changeLogs.map((log: any) => (
                          <div key={log.id} className="flex gap-3 pb-3 border-b last:border-0">
                            <div className={`mt-0.5 p-1.5 rounded-md flex-shrink-0 ${
                              log.changeType === "status_change" ? "bg-blue-50 text-blue-600" :
                              log.changeType === "created" ? "bg-green-50 text-green-600" :
                              log.changeType === "converted" ? "bg-emerald-50 text-emerald-600" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {log.changeType === "status_change" ? <ArrowRightLeft className="w-3.5 h-3.5" /> :
                               log.changeType === "created" ? <Plus className="w-3.5 h-3.5" /> :
                               log.changeType === "converted" ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                               <Pencil className="w-3.5 h-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`text-[10px] ${
                                  log.changeType === "status_change" ? "border-blue-200 text-blue-700" :
                                  log.changeType === "created" ? "border-green-200 text-green-700" :
                                  log.changeType === "converted" ? "border-emerald-200 text-emerald-700" :
                                  ""
                                }`}>
                                  {log.changeType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDateTime(log.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm mt-1">{log.description}</p>
                              {log.userName && (
                                <p className="text-xs text-muted-foreground mt-0.5">— {log.userName}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </div>
        </div>

        {/* Edit Dialog */}
        {editOpen && (
          <EditLeadDialog
            lead={lead}
            users={usersData || []}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSuccess={() => { refetch(); refetchActivities(); refetchChangeLogs(); }}
          />
        )}

        {/* Convert to Customer Confirmation */}
        <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Convert to Customer</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to convert this lead to a customer? This will create a new customer record.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => convertMutation.mutate({ leadId })}
                disabled={convertMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {convertMutation.isPending ? "Loading..." : "Convert to Customer"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Close Won Confirmation */}
        <AlertDialog open={closeWonOpen} onOpenChange={setCloseWonOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Close Won</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to close this lead as "Won"? This action is irreversible.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => closeWonMutation.mutate({ leadId })}
                disabled={closeWonMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {closeWonMutation.isPending ? "Loading..." : "Close Won"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Lead</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to delete this lead? This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate({ id: leadId })}
                disabled={deleteMutation.isPending}
                className="bg-destructive hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? "Loading..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Add Activity Dialog */}
        {activityOpen && (
          <AddActivityDialog
            leadId={leadId}
            open={activityOpen}
            onOpenChange={setActivityOpen}
            onSuccess={() => refetchActivities()}
          />
        )}

        {/* Add Document Dialog */}
        {documentOpen && (
          <AddDocumentDialog
            leadId={leadId}
            open={documentOpen}
            onOpenChange={setDocumentOpen}
            onSuccess={() => refetchDocuments()}
          />
        )}

        {/* Pipeline Status Change Confirmation */}
        <AlertDialog open={!!statusConfirm} onOpenChange={(open) => { if (!open) { setStatusConfirm(null); setLostReasonInput(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
              <AlertDialogDescription>
                {statusConfirm?.isLost
                  ? "Are you sure you want to mark this lead as 'Lost'? This action is irreversible."
                  : `Are you sure you want to change the status to "${statusConfirm ? statusConfirm.targetStatus.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : ""}"?`
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            {statusConfirm?.isLost && (
              <div className="space-y-2 px-1">
                <Label>Lost Reason</Label>
                <Textarea
                  rows={2}
                  value={lostReasonInput}
                  onChange={(e) => setLostReasonInput(e.target.value)}
                  placeholder="Why was this lead lost?"
                />
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (statusConfirm) {
                    statusMutation.mutate({
                      id: leadId,
                      data: {
                        status: statusConfirm.targetStatus as any,
                        ...(statusConfirm.isLost && lostReasonInput ? { lostReason: lostReasonInput } : {}),
                      },
                    });
                  }
                }}
                disabled={statusMutation.isPending}
                className={statusConfirm?.isLost ? "bg-destructive hover:bg-destructive/90" : ""}
              >
                {statusMutation.isPending ? "Loading..." : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}

// ── Info Row Helper ─────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value || "—"}</p>
    </div>
  );
}

// ── Edit Lead Dialog ────────────────────────────────────────────────────────

function EditLeadDialog({
  lead,
  users,
  open,
  onOpenChange,
  onSuccess,
}: {
  lead: any;
  users: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    companyName: lead.companyName || "",
    contactName: lead.contactName || "",
    contactEmail: lead.contactEmail || "",
    contactPhone: lead.contactPhone || "",
    country: lead.country || "",
    industry: lead.industry || "",
    source: lead.source || "",
    assignedTo: lead.assignedTo as number | null,
    estimatedEmployees: lead.estimatedEmployees as number | undefined,
    estimatedRevenue: lead.estimatedRevenue || "",
    notes: lead.notes || "",
    expectedCloseDate: lead.expectedCloseDate ? formatDateISO(lead.expectedCloseDate) : "",
    intendedServices: lead.intendedServices || "",
    targetCountries: lead.targetCountries || "",
  });

  const updateMutation = trpc.sales.update.useMutation({
    onSuccess: () => {
      toast.success("Lead updated successfully");
      onOpenChange(false);
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSave() {
    if (!formData.companyName.trim()) {
      toast.error("Company Name is required");
      return;
    }
    if (formData.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail.trim())) {
      toast.error("Invalid email address");
      return;
    }
    updateMutation.mutate({
      id: lead.id,
      data: {
        companyName: formData.companyName,
        contactName: formData.contactName,
        contactEmail: formData.contactEmail.trim() === "" ? "" : formData.contactEmail,
        contactPhone: formData.contactPhone.trim() === "" ? undefined : formData.contactPhone,
        country: formData.country.trim() === "" ? undefined : formData.country,
        industry: formData.industry.trim() === "" ? undefined : formData.industry,
        source: formData.source.trim() === "" ? undefined : formData.source,
        assignedTo: formData.assignedTo,
        estimatedEmployees: formData.estimatedEmployees,
        estimatedRevenue: formData.estimatedRevenue.trim() === "" ? undefined : formData.estimatedRevenue,
        notes: formData.notes.trim() === "" ? undefined : formData.notes,
        expectedCloseDate: formData.expectedCloseDate.trim() === "" ? null : formData.expectedCloseDate,
        intendedServices: formData.intendedServices.trim() === "" ? undefined : formData.intendedServices,
        targetCountries: formData.targetCountries.trim() === "" ? undefined : formData.targetCountries,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={formData.source || "none"} onValueChange={(v) => setFormData({ ...formData, source: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input type="email" value={formData.contactEmail} onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input value={formData.contactPhone} onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Country</Label>
              <CountrySelect value={formData.country} onValueChange={(v) => setFormData({ ...formData, country: v })} scope="all" />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Input value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Intended Services</Label>
              <ServiceMultiSelect value={formData.intendedServices} onChange={(v) => setFormData({ ...formData, intendedServices: v })} />
            </div>
            <div className="space-y-2">
              <Label>Target Countries</Label>
              <CountryMultiSelect value={formData.targetCountries} onChange={(v) => setFormData({ ...formData, targetCountries: v })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <Select value={formData.assignedTo?.toString() || "none"} onValueChange={(v) => setFormData({ ...formData, assignedTo: v === "none" ? null : parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map((u: any) => <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estimated Employees</Label>
              <Input type="number" min={0} value={formData.estimatedEmployees ?? ""} onChange={(e) => setFormData({ ...formData, estimatedEmployees: e.target.value ? parseInt(e.target.value) : undefined })} />
            </div>
            <div className="space-y-2">
              <Label>Expected Close Date</Label>
              <DatePicker value={formData.expectedCloseDate} onChange={(v) => setFormData({ ...formData, expectedCloseDate: v })} placeholder="Select date" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Loading..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Activity Dialog ─────────────────────────────────────────────────────

function AddActivityDialog({
  leadId,
  open,
  onOpenChange,
  onSuccess,
}: {
  leadId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [activityType, setActivityType] = useState<string>("note");
  const [description, setDescription] = useState("");

  const createMutation = trpc.sales.activities.create.useMutation({
    onSuccess: () => {
      toast.success("Activity added successfully");
      onOpenChange(false);
      onSuccess();
      setDescription("");
      setActivityType("note");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Activity</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map(type => (
                  <SelectItem key={type} value={type}>
                    <span className="flex items-center gap-2">
                      {activityIcons[type]}
                      {type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter activity description"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!description.trim()) {
                  toast.error("Description is required");
                  return;
                }
                createMutation.mutate({
                  leadId,
                  activityType: activityType as any,
                  description: description.trim(),
                });
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Loading..." : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}