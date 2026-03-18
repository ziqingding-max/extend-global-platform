/**
 * CP Portal Clients Management
 *
 * Full CRUD management of End Clients from the Channel Partner's perspective.
 * Features:
 * - Client list with search, pagination, status filter
 * - Create new client (slide-out form)
 * - Client detail view with edit capability
 * - Contacts management with Portal access toggle
 * - Employee roster (read + limited edit with lock rule)
 */
import { useState } from "react";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  Building2,
  Users,
  Loader2,
  Plus,
  ArrowLeft,
  Pencil,
  Mail,
  Phone,
  MapPin,
  Globe,
  Shield,
  ShieldOff,
  UserPlus,
  Trash2,
  Lock,
  AlertCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────
type ViewMode = "list" | "detail" | "create";

// ── Main Component ─────────────────────────────────────────────────────
export default function CpPortalClients() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  if (viewMode === "create") {
    return (
      <CreateClientForm
        onCancel={() => setViewMode("list")}
        onSuccess={() => setViewMode("list")}
      />
    );
  }

  if (viewMode === "detail" && selectedClientId) {
    return (
      <ClientDetail
        clientId={selectedClientId}
        onBack={() => {
          setSelectedClientId(null);
          setViewMode("list");
        }}
      />
    );
  }

  return (
    <ClientList
      onCreateNew={() => setViewMode("create")}
      onSelectClient={(id) => {
        setSelectedClientId(id);
        setViewMode("detail");
      }}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════
// CLIENT LIST
// ════════════════════════════════════════════════════════════════════════
function ClientList({
  onCreateNew,
  onSelectClient,
}: {
  onCreateNew: () => void;
  onSelectClient: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = cpTrpc.clients.list.useQuery({
    page,
    pageSize: 20,
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const { data: summary } = cpTrpc.clients.summary.useQuery();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground">
            Manage your end clients and their employees
          </p>
        </div>
        <Button onClick={onCreateNew}>
          <Plus className="mr-2 h-4 w-4" />
          New Client
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{summary.totalClients}</div>
              <p className="text-xs text-muted-foreground">Total Clients</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-green-600">{summary.activeClients}</div>
              <p className="text-xs text-muted-foreground">Active Clients</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{summary.totalEmployees}</div>
              <p className="text-xs text-muted-foreground">Total Employees</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-green-600">{summary.activeEmployees}</div>
              <p className="text-xs text-muted-foreground">Active Employees</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Client Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.items?.map((client: any) => (
            <Card
              key={client.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectClient(client.id)}
            >
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base truncate">
                    {client.companyName}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground truncate">
                    {client.clientCode} · {client.country}
                  </p>
                </div>
                <Badge
                  variant={
                    client.status === "active"
                      ? "default"
                      : client.status === "suspended"
                      ? "secondary"
                      : "destructive"
                  }
                >
                  {client.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    <span>{client.employeeCount ?? 0} employees</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5" />
                    <span>{client.settlementCurrency}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {data?.items?.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No clients found. Click "New Client" to add your first client.
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(data.total / 20)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(data.total / 20)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// CREATE CLIENT FORM
// ════════════════════════════════════════════════════════════════════════
function CreateClientForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const utils = cpTrpc.useUtils();
  const createMutation = cpTrpc.clients.create.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      utils.clients.summary.invalidate();
      onSuccess();
    },
  });

  const [form, setForm] = useState({
    companyName: "",
    legalEntityName: "",
    registrationNumber: "",
    industry: "",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    paymentTermDays: 30,
    settlementCurrency: "USD",
    language: "en" as "en" | "zh",
    depositMultiplier: 2,
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...form,
      legalEntityName: form.legalEntityName || undefined,
      registrationNumber: form.registrationNumber || undefined,
      industry: form.industry || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      postalCode: form.postalCode || undefined,
      primaryContactName: form.primaryContactName || undefined,
      primaryContactEmail: form.primaryContactEmail || undefined,
      primaryContactPhone: form.primaryContactPhone || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Client</h1>
          <p className="text-muted-foreground">
            Add a new end client to your portfolio
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input
                  required
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label>Legal Entity Name</Label>
                <Input
                  value={form.legalEntityName}
                  onChange={(e) => setForm({ ...form, legalEntityName: e.target.value })}
                  placeholder="Acme Corporation Pte Ltd"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Registration Number</Label>
                <Input
                  value={form.registrationNumber}
                  onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  placeholder="Technology"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Country *</Label>
                <Input
                  required
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  placeholder="Singapore"
                />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Primary Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Primary Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input
                  value={form.primaryContactName}
                  onChange={(e) => setForm({ ...form, primaryContactName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.primaryContactEmail}
                  onChange={(e) => setForm({ ...form, primaryContactEmail: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={form.primaryContactPhone}
                onChange={(e) => setForm({ ...form, primaryContactPhone: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Billing Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Billing Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Payment Terms (days)</Label>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={form.paymentTermDays}
                  onChange={(e) => setForm({ ...form, paymentTermDays: parseInt(e.target.value) || 30 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Settlement Currency</Label>
                <Input
                  value={form.settlementCurrency}
                  onChange={(e) => setForm({ ...form, settlementCurrency: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Deposit Multiplier</Label>
                <Select
                  value={String(form.depositMultiplier)}
                  onValueChange={(v) => setForm({ ...form, depositMultiplier: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1x</SelectItem>
                    <SelectItem value="2">2x</SelectItem>
                    <SelectItem value="3">3x</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Invoice Language</Label>
              <Select
                value={form.language}
                onValueChange={(v) => setForm({ ...form, language: v as "en" | "zh" })}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="zh">Chinese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Internal notes about this client..."
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Client
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        {createMutation.error && (
          <div className="text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {createMutation.error.message}
          </div>
        )}
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// CLIENT DETAIL
// ════════════════════════════════════════════════════════════════════════
function ClientDetail({
  clientId,
  onBack,
}: {
  clientId: number;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"info" | "contacts" | "employees">("info");
  const [isEditing, setIsEditing] = useState(false);

  const { data: client, isLoading } = cpTrpc.clients.get.useQuery({ id: clientId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Client not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {client.companyName}
            </h1>
            <p className="text-muted-foreground">
              {client.clientCode} · {client.country}
            </p>
          </div>
          <Badge
            variant={
              client.status === "active"
                ? "default"
                : client.status === "suspended"
                ? "secondary"
                : "destructive"
            }
          >
            {client.status}
          </Badge>
        </div>
        {activeTab === "info" && !isEditing && (
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["info", "contacts", "employees"] as const).map((tab) => (
          <button
            key={tab}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setActiveTab(tab);
              setIsEditing(false);
            }}
          >
            {tab === "info" ? "Company Info" : tab === "contacts" ? "Contacts" : "Employees"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "info" && (
        isEditing ? (
          <EditClientForm clientId={clientId} client={client} onDone={() => setIsEditing(false)} />
        ) : (
          <ClientInfoView client={client} />
        )
      )}
      {activeTab === "contacts" && <ContactsTab clientId={clientId} />}
      {activeTab === "employees" && <EmployeesTab clientId={clientId} />}
    </div>
  );
}

// ── Client Info View (Read-only) ──────────────────────────────────────
function ClientInfoView({ client }: { client: any }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Company Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Legal Entity" value={client.legalEntityName} />
          <InfoRow label="Registration No." value={client.registrationNumber} />
          <InfoRow label="Industry" value={client.industry} />
          <InfoRow label="Address" value={[client.address, client.city, client.state, client.postalCode].filter(Boolean).join(", ")} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Payment Terms" value={`Net ${client.paymentTermDays} days`} />
          <InfoRow label="Currency" value={client.settlementCurrency} />
          <InfoRow label="Deposit Multiplier" value={`${client.depositMultiplier}x`} />
          <InfoRow label="Invoice Language" value={client.language === "zh" ? "Chinese" : "English"} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Primary Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Name" value={client.primaryContactName} icon={<Users className="h-3.5 w-3.5" />} />
          <InfoRow label="Email" value={client.primaryContactEmail} icon={<Mail className="h-3.5 w-3.5" />} />
          <InfoRow label="Phone" value={client.primaryContactPhone} icon={<Phone className="h-3.5 w-3.5" />} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Employees" value={String(client.employeeCount ?? 0)} />
          <InfoRow label="Created" value={client.createdAt ? new Date(client.createdAt).toLocaleDateString() : "-"} />
          {client.notes && <InfoRow label="Notes" value={client.notes} />}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value || "-"}</p>
      </div>
    </div>
  );
}

// ── Edit Client Form ──────────────────────────────────────────────────
function EditClientForm({
  clientId,
  client,
  onDone,
}: {
  clientId: number;
  client: any;
  onDone: () => void;
}) {
  const utils = cpTrpc.useUtils();
  const updateMutation = cpTrpc.clients.update.useMutation({
    onSuccess: () => {
      utils.clients.get.invalidate({ id: clientId });
      utils.clients.list.invalidate();
      onDone();
    },
  });

  const [form, setForm] = useState({
    companyName: client.companyName || "",
    legalEntityName: client.legalEntityName || "",
    registrationNumber: client.registrationNumber || "",
    industry: client.industry || "",
    address: client.address || "",
    city: client.city || "",
    state: client.state || "",
    country: client.country || "",
    postalCode: client.postalCode || "",
    primaryContactName: client.primaryContactName || "",
    primaryContactEmail: client.primaryContactEmail || "",
    primaryContactPhone: client.primaryContactPhone || "",
    paymentTermDays: client.paymentTermDays ?? 30,
    settlementCurrency: client.settlementCurrency || "USD",
    language: (client.language || "en") as "en" | "zh",
    depositMultiplier: client.depositMultiplier ?? 2,
    status: client.status || "active",
    notes: client.notes || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      id: clientId,
      data: {
        ...form,
        status: form.status as "active" | "suspended" | "terminated",
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Edit Company Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Legal Entity Name</Label>
              <Input value={form.legalEntityName} onChange={(e) => setForm({ ...form, legalEntityName: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Payment Terms (days)</Label>
              <Input type="number" value={form.paymentTermDays} onChange={(e) => setForm({ ...form, paymentTermDays: parseInt(e.target.value) || 30 })} />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={form.settlementCurrency} onChange={(e) => setForm({ ...form, settlementCurrency: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Deposit Multiplier</Label>
              <Select value={String(form.depositMultiplier)} onValueChange={(v) => setForm({ ...form, depositMultiplier: parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1x</SelectItem>
                  <SelectItem value="2">2x</SelectItem>
                  <SelectItem value="3">3x</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
      </div>

      {updateMutation.error && (
        <div className="text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {updateMutation.error.message}
        </div>
      )}
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════
// CONTACTS TAB
// ════════════════════════════════════════════════════════════════════════
function ContactsTab({ clientId }: { clientId: number }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const utils = cpTrpc.useUtils();

  const { data: contacts, isLoading } = cpTrpc.clients.listContacts.useQuery({ customerId: clientId });

  const togglePortalMutation = cpTrpc.clients.togglePortalAccess.useMutation({
    onSuccess: () => utils.clients.listContacts.invalidate({ customerId: clientId }),
  });

  const deleteContactMutation = cpTrpc.clients.deleteContact.useMutation({
    onSuccess: () => utils.clients.listContacts.invalidate({ customerId: clientId }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Contact
        </Button>
      </div>

      <div className="space-y-3">
        {contacts?.map((contact: any) => (
          <Card key={contact.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                  {contact.contactName?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{contact.contactName}</p>
                    {contact.isPrimary && <Badge variant="outline" className="text-xs">Primary</Badge>}
                    {contact.hasPortalAccess && (
                      <Badge variant="default" className="text-xs">
                        <Shield className="mr-1 h-3 w-3" />
                        Portal Access
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{contact.email}</span>
                    {contact.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{contact.phone}</span>}
                    {contact.role && <span>{contact.role}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    togglePortalMutation.mutate({
                      contactId: contact.id,
                      customerId: clientId,
                      hasPortalAccess: !contact.hasPortalAccess,
                      portalRole: contact.portalRole || "viewer",
                    })
                  }
                  title={contact.hasPortalAccess ? "Revoke Portal Access" : "Grant Portal Access"}
                >
                  {contact.hasPortalAccess ? (
                    <ShieldOff className="h-4 w-4 text-destructive" />
                  ) : (
                    <Shield className="h-4 w-4" />
                  )}
                </Button>
                {!contact.isPrimary && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteContactMutation.mutate({ id: contact.id, customerId: clientId })}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {(!contacts || contacts.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            No contacts yet. Add a contact to get started.
          </div>
        )}
      </div>

      {showAddDialog && (
        <AddContactDialog
          clientId={clientId}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}

// ── Add Contact Dialog ────────────────────────────────────────────────
function AddContactDialog({
  clientId,
  onClose,
}: {
  clientId: number;
  onClose: () => void;
}) {
  const utils = cpTrpc.useUtils();
  const createMutation = cpTrpc.clients.createContact.useMutation({
    onSuccess: () => {
      utils.clients.listContacts.invalidate({ customerId: clientId });
      onClose();
    },
  });

  const [form, setForm] = useState({
    contactName: "",
    email: "",
    phone: "",
    role: "",
    isPrimary: false,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="HR Director" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate({ customerId: clientId, ...form, phone: form.phone || undefined, role: form.role || undefined })}
            disabled={!form.contactName || !form.email || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════
// EMPLOYEES TAB
// ════════════════════════════════════════════════════════════════════════
function EmployeesTab({ clientId }: { clientId: number }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);

  const { data, isLoading } = cpTrpc.clients.listEmployees.useQuery({
    customerId: clientId,
    page,
    pageSize: 20,
    search: search || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {data?.total ?? 0} employees
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Employee</th>
                <th className="text-left px-4 py-3 font-medium">Job Title</th>
                <th className="text-left px-4 py-3 font-medium">Country</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.items?.map((emp: any) => {
                const isEditable = ["pending_review", "documents_incomplete"].includes(emp.status);
                return (
                  <tr key={emp.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                        <p className="text-xs text-muted-foreground">{emp.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">{emp.jobTitle}</td>
                    <td className="px-4 py-3">{emp.country}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={
                            emp.status === "active" ? "default" :
                            emp.status === "terminated" ? "destructive" :
                            "secondary"
                          }
                          className="text-xs"
                        >
                          {emp.status?.replace(/_/g, " ")}
                        </Badge>
                        {!isEditable && (
                          <span title="Profile locked — only EG Admin can edit"><Lock className="h-3 w-3 text-muted-foreground" /></span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isEditable ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingEmployeeId(emp.id)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Read-only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!data?.items || data.items.length === 0) && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">
                    No employees found for this client.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(data.total / 20)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Edit Employee Dialog */}
      {editingEmployeeId && (
        <EditEmployeeDialog
          employeeId={editingEmployeeId}
          clientId={clientId}
          onClose={() => setEditingEmployeeId(null)}
        />
      )}
    </div>
  );
}

// ── Edit Employee Dialog (non-hard-data only, with lock rule) ─────────
function EditEmployeeDialog({
  employeeId,
  clientId,
  onClose,
}: {
  employeeId: number;
  clientId: number;
  onClose: () => void;
}) {
  const utils = cpTrpc.useUtils();
  const { data: emp, isLoading } = cpTrpc.clients.getEmployee.useQuery({ employeeId });

  const updateMutation = cpTrpc.clients.updateEmployee.useMutation({
    onSuccess: () => {
      utils.clients.listEmployees.invalidate({ customerId: clientId });
      onClose();
    },
  });

  const [form, setForm] = useState<any>(null);

  // Initialize form when data loads
  if (emp && !form) {
    setForm({
      firstName: emp.firstName || "",
      lastName: emp.lastName || "",
      email: emp.email || "",
      phone: emp.phone || "",
      dateOfBirth: emp.dateOfBirth || "",
      nationality: emp.nationality || "",
      idNumber: emp.idNumber || "",
      idType: emp.idType || "",
      address: emp.address || "",
      city: emp.city || "",
      state: emp.state || "",
      postalCode: emp.postalCode || "",
      department: emp.department || "",
      jobTitle: emp.jobTitle || "",
      visaNotes: emp.visaNotes || "",
    });
  }

  if (isLoading || !form) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Employee Profile</DialogTitle>
          <p className="text-sm text-muted-foreground">
            You can edit personal and address information. Salary, bank details, and contracts are managed by EG.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>ID Number</Label>
              <Input value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Department</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Job Title</Label>
              <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Visa Notes</Label>
            <Textarea value={form.visaNotes} onChange={(e) => setForm({ ...form, visaNotes: e.target.value })} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => updateMutation.mutate({
              employeeId,
              data: {
                ...form,
                phone: form.phone || undefined,
                dateOfBirth: form.dateOfBirth || undefined,
                nationality: form.nationality || undefined,
                idNumber: form.idNumber || undefined,
                idType: form.idType || undefined,
                address: form.address || undefined,
                city: form.city || undefined,
                state: form.state || undefined,
                postalCode: form.postalCode || undefined,
                department: form.department || undefined,
                visaNotes: form.visaNotes || undefined,
              },
            })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>

        {updateMutation.error && (
          <div className="text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {updateMutation.error.message}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
