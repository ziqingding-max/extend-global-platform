/**
 * EG Admin — Channel Partner Management
 * List + Detail view with tabs (Info, Contacts, Pricing, Client Pricing, Contracts, Wallet)
 */
import Layout from "@/components/Layout";
import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2, Plus, Search, ArrowLeft, Mail, Phone, Users, DollarSign,
  ChevronRight, Trash2, UserPlus, FileText, Pencil, Globe, Wallet,
  MoreHorizontal, Loader2, Shield, ShieldX, Copy, Check, ExternalLink,
  ArrowUpRight, ArrowDownLeft, Unlock, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  suspended: "bg-amber-50 text-amber-700 border-amber-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
};

/* ========== Channel Partner List ========== */
function ChannelPartnerList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [createOpen, setCreateOpen] = useState(false);

  const getUrlPage = () => {
    const p = parseInt(new URLSearchParams(searchString).get("page") || "1", 10);
    return isNaN(p) ? 1 : p;
  };
  const [page, setPage] = useState(getUrlPage);
  const pageSize = 20;
  const isInitialMount = useRef(true);

  useEffect(() => { setPage(getUrlPage()); }, [searchString]);
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    setPage(1);
  }, [search, statusFilter]);

  const { data, isLoading, refetch } = trpc.channelPartners.list.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    includeInternal: true,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const createMutation = trpc.channelPartners.create.useMutation({
    onSuccess: (result) => {
      toast.success("Channel Partner created successfully");
      setCreateOpen(false);
      refetch();
      setFormData(defaultForm);
      if (result?.id) setLocation(`/channel-partners/${result.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const defaultForm = {
    companyName: "", legalEntityName: "", registrationNumber: "",
    country: "", address: "", city: "", state: "", postalCode: "",
    primaryContactName: "", primaryContactEmail: "", primaryContactPhone: "",
    settlementCurrency: "USD", paymentTermDays: 30,
    creditLimit: "", depositMultiplier: 2,
    subdomain: "", notes: "",
    isInternal: false,
  };
  const [formData, setFormData] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  function validateAndCreate() {
    const errors: Record<string, boolean> = {};
    if (!formData.companyName.trim()) errors.companyName = true;
    if (!formData.country.trim()) errors.country = true;
    if (!formData.isInternal && !formData.subdomain.trim()) errors.subdomain = true;
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error("Please fill in all required fields");
      return;
    }
    setFormErrors({});
    createMutation.mutate({
      ...formData,
      creditLimit: formData.creditLimit || undefined,
    });
  }

  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Channel Partners</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage your B2B2B channel partner network
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Add Partner</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Channel Partner</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2">
                  <Label className={formErrors.companyName ? "text-red-500" : ""}>
                    Company Name *
                  </Label>
                  <Input
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className={formErrors.companyName ? "border-red-500" : ""}
                  />
                </div>
                <div>
                  <Label>Legal Entity Name</Label>
                  <Input
                    value={formData.legalEntityName}
                    onChange={(e) => setFormData({ ...formData, legalEntityName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Registration Number</Label>
                  <Input
                    value={formData.registrationNumber}
                    onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label className={formErrors.country ? "text-red-500" : ""}>Country *</Label>
                  <Input
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="e.g. SG, MY, US"
                    className={formErrors.country ? "border-red-500" : ""}
                  />
                </div>
                <div>
                  <Label className={formErrors.subdomain ? "text-red-500" : ""}>
                    Subdomain {!formData.isInternal && "*"}
                  </Label>
                  <div className="flex items-center gap-1">
                    <Input
                      value={formData.subdomain}
                      onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                      placeholder="e.g. acme"
                      className={formErrors.subdomain ? "border-red-500" : ""}
                    />
                    <span className="text-sm text-slate-500 whitespace-nowrap">.extendglobal.ai</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} />
                </div>
                <div>
                  <Label>Postal Code</Label>
                  <Input value={formData.postalCode} onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })} />
                </div>
                <div>
                  <Label>Settlement Currency</Label>
                  <Select value={formData.settlementCurrency} onValueChange={(v) => setFormData({ ...formData, settlementCurrency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="SGD">SGD</SelectItem>
                      <SelectItem value="MYR">MYR</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment Term (days)</Label>
                  <Input type="number" value={formData.paymentTermDays} onChange={(e) => setFormData({ ...formData, paymentTermDays: parseInt(e.target.value) || 30 })} />
                </div>
                <div>
                  <Label>Credit Limit</Label>
                  <Input value={formData.creditLimit} onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })} placeholder="Optional" />
                </div>
                <div>
                  <Label>Deposit Multiplier</Label>
                  <Input type="number" value={formData.depositMultiplier} onChange={(e) => setFormData({ ...formData, depositMultiplier: parseInt(e.target.value) || 2 })} />
                </div>
                <div className="col-span-2 border-t pt-4">
                  <h4 className="font-medium mb-3">Primary Contact</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Name</Label>
                      <Input value={formData.primaryContactName} onChange={(e) => setFormData({ ...formData, primaryContactName: e.target.value })} />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={formData.primaryContactEmail} onChange={(e) => setFormData({ ...formData, primaryContactEmail: e.target.value })} />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={formData.primaryContactPhone} onChange={(e) => setFormData({ ...formData, primaryContactPhone: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isInternal}
                    onChange={(e) => setFormData({ ...formData, isInternal: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  <Label className="cursor-pointer">Internal (EG Direct) — This is an internal entity for direct-signed clients</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={validateAndCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search partners..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Subdomain</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Settlement</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      No channel partners found
                    </TableCell>
                  </TableRow>
                )}
                {data?.data?.map((cp: any) => (
                  <TableRow
                    key={cp.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setLocation(`/channel-partners/${cp.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{cp.companyName}</div>
                          {cp.primaryContactEmail && (
                            <div className="text-xs text-slate-500">{cp.primaryContactEmail}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {cp.subdomain ? (
                        <span className="text-sm font-mono text-indigo-600">{cp.subdomain}.extendglobal.ai</span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{cp.country || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[cp.status] || ""}>
                        {cp.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{cp.settlementCurrency}</TableCell>
                    <TableCell>
                      {cp.isInternal ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Internal</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">External</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data?.total || 0)} of {data?.total || 0}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

/* ========== Channel Partner Detail ========== */
function ChannelPartnerDetail({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("info");
  const { data: cp, isLoading, refetch } = trpc.channelPartners.get.useQuery({ id });

  if (isLoading) return <Layout><div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div></Layout>;
  if (!cp) return <Layout><div className="text-center py-12 text-slate-500">Channel Partner not found</div></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/channel-partners")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{cp.companyName}</h1>
              <Badge variant="outline" className={statusColors[cp.status] || ""}>{cp.status}</Badge>
              {cp.isInternal && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Internal</Badge>}
            </div>
            {cp.subdomain && (
              <p className="text-sm text-indigo-600 font-mono mt-1">
                {cp.subdomain}.extendglobal.ai
              </p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="pricing">EG→CP Pricing</TabsTrigger>
            <TabsTrigger value="clientPricing">CP→Client Pricing</TabsTrigger>
            <TabsTrigger value="contracts">Contracts</TabsTrigger>
            <TabsTrigger value="wallet">Wallet</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <InfoTab cp={cp} onUpdate={refetch} />
          </TabsContent>
          <TabsContent value="contacts">
            <ContactsTab cpId={id} />
          </TabsContent>
          <TabsContent value="pricing">
            <PricingTab cpId={id} />
          </TabsContent>
          <TabsContent value="clientPricing">
            <ClientPricingTab cpId={id} />
          </TabsContent>
          <TabsContent value="contracts">
            <ContractsTab cpId={id} />
          </TabsContent>
          <TabsContent value="wallet">
            <WalletTab cpId={id} currency={cp.settlementCurrency || "USD"} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

/* ========== Info Tab ========== */
function InfoTab({ cp, onUpdate }: { cp: any; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const updateMutation = trpc.channelPartners.update.useMutation({
    onSuccess: () => { toast.success("Updated successfully"); setEditing(false); onUpdate(); },
    onError: (err) => toast.error(err.message),
  });

  function startEdit() {
    setForm({
      companyName: cp.companyName || "",
      legalEntityName: cp.legalEntityName || "",
      registrationNumber: cp.registrationNumber || "",
      country: cp.country || "",
      address: cp.address || "",
      city: cp.city || "",
      state: cp.state || "",
      postalCode: cp.postalCode || "",
      primaryContactName: cp.primaryContactName || "",
      primaryContactEmail: cp.primaryContactEmail || "",
      primaryContactPhone: cp.primaryContactPhone || "",
      settlementCurrency: cp.settlementCurrency || "USD",
      paymentTermDays: cp.paymentTermDays || 30,
      creditLimit: cp.creditLimit || "",
      depositMultiplier: cp.depositMultiplier || 2,
      subdomain: cp.subdomain || "",
      notes: cp.notes || "",
      // Note: logoUrl, brandPrimaryColor, cpBillingEntityName, cpBillingAddress,
      // cpBillingTaxId, cpBankDetails, cpInvoicePrefix are managed by CP in their
      // own Portal Settings. Admin has read-only access.
    });
    setEditing(true);
  }

  if (editing) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Edit Channel Partner</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate({ id: cp.id, ...form })} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Company Name</Label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
            <div><Label>Legal Entity</Label><Input value={form.legalEntityName} onChange={(e) => setForm({ ...form, legalEntityName: e.target.value })} /></div>
            <div><Label>Registration No.</Label><Input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} /></div>
            <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
            <div><Label>Subdomain</Label>
              <div className="flex items-center gap-1">
                <Input value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
                <span className="text-sm text-slate-500 whitespace-nowrap">.extendglobal.ai</span>
              </div>
            </div>
            <div className="col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label>State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
            <div><Label>Postal Code</Label><Input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></div>
            <div><Label>Settlement Currency</Label>
              <Select value={form.settlementCurrency} onValueChange={(v) => setForm({ ...form, settlementCurrency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="SGD">SGD</SelectItem>
                  <SelectItem value="MYR">MYR</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Payment Terms (days)</Label><Input type="number" value={form.paymentTermDays} onChange={(e) => setForm({ ...form, paymentTermDays: parseInt(e.target.value) || 30 })} /></div>
            <div><Label>Credit Limit</Label><Input value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} /></div>
            <div><Label>Deposit Multiplier</Label><Input type="number" value={form.depositMultiplier} onChange={(e) => setForm({ ...form, depositMultiplier: parseInt(e.target.value) || 2 })} /></div>

            {/* Branding & Billing: Managed by CP in their own Portal */}
            <div className="col-span-2 border-t pt-4">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-medium text-muted-foreground">Branding & Billing Info</h4>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                Branding (Logo, Colors) and Billing Info (Entity Name, Tax ID, Bank Details, Invoice Prefix) are managed by the Channel Partner in their own CP Portal Settings. EG Admin has read-only access to these fields.
              </div>
            </div>

            <div className="col-span-2 border-t pt-4"><h4 className="font-medium mb-3">Primary Contact</h4></div>
            <div><Label>Name</Label><Input value={form.primaryContactName} onChange={(e) => setForm({ ...form, primaryContactName: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.primaryContactEmail} onChange={(e) => setForm({ ...form, primaryContactEmail: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.primaryContactPhone} onChange={(e) => setForm({ ...form, primaryContactPhone: e.target.value })} /></div>

            <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Partner Information</CardTitle>
        <Button variant="outline" onClick={startEdit}><Pencil className="w-4 h-4 mr-2" />Edit</Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <InfoField label="Company Name" value={cp.companyName} />
          <InfoField label="Legal Entity" value={cp.legalEntityName} />
          <InfoField label="Registration No." value={cp.registrationNumber} />
          <InfoField label="Country" value={cp.country} />
          <InfoField label="Subdomain" value={cp.subdomain ? `${cp.subdomain}.extendglobal.ai` : "—"} />
          <InfoField label="Address" value={[cp.address, cp.city, cp.state, cp.postalCode].filter(Boolean).join(", ")} />
          <InfoField label="Settlement Currency" value={cp.settlementCurrency} />
          <InfoField label="Payment Terms" value={`${cp.paymentTermDays} days`} />
          <InfoField label="Credit Limit" value={cp.creditLimit ? `${cp.settlementCurrency} ${cp.creditLimit}` : "—"} />
          <InfoField label="Deposit Multiplier" value={`${cp.depositMultiplier}x`} />

          <div className="col-span-2 border-t pt-4"><h4 className="font-medium text-slate-700">Branding <span className="text-xs font-normal text-muted-foreground">(managed by CP)</span></h4></div>
          <InfoField label="Logo" value={cp.logoUrl ? <img src={cp.logoUrl} alt="Logo" className="h-10 max-w-[120px] object-contain" /> : <span className="text-muted-foreground italic">Not set by CP yet</span>} />
          <InfoField label="Primary Color" value={cp.brandPrimaryColor ? (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded border" style={{ backgroundColor: cp.brandPrimaryColor }} />
              <span>{cp.brandPrimaryColor}</span>
            </div>
          ) : <span className="text-muted-foreground italic">Not set by CP yet</span>} />

          <div className="col-span-2 border-t pt-4"><h4 className="font-medium text-slate-700">CP Billing Info <span className="text-xs font-normal text-muted-foreground">(managed by CP)</span></h4></div>
          <InfoField label="Billing Entity" value={cp.cpBillingEntityName || <span className="text-muted-foreground italic">Not set by CP yet</span>} />
          <InfoField label="Tax ID" value={cp.cpBillingTaxId || <span className="text-muted-foreground italic">Not set by CP yet</span>} />
          <InfoField label="Billing Address" value={cp.cpBillingAddress || <span className="text-muted-foreground italic">Not set by CP yet</span>} />
          <InfoField label="Bank Details" value={cp.cpBankDetails || <span className="text-muted-foreground italic">Not set by CP yet</span>} />
          <InfoField label="Invoice Prefix" value={cp.cpInvoicePrefix || <span className="text-muted-foreground italic">Not set by CP yet</span>} />

          <div className="col-span-2 border-t pt-4"><h4 className="font-medium text-slate-700">Primary Contact</h4></div>
          <InfoField label="Name" value={cp.primaryContactName} />
          <InfoField label="Email" value={cp.primaryContactEmail} />
          <InfoField label="Phone" value={cp.primaryContactPhone} />

          {cp.notes && (
            <>
              <div className="col-span-2 border-t pt-4"><h4 className="font-medium text-slate-700">Notes</h4></div>
              <div className="col-span-2 text-sm text-slate-600 whitespace-pre-wrap">{cp.notes}</div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoField({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-sm text-slate-900">{value || "—"}</div>
    </div>
  );
}

/* ========== Contacts Tab ========== */
function ContactsTab({ cpId }: { cpId: number }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ contactName: "", email: "", portalRole: "admin" as "admin" | "finance" | "operations" | "viewer" });
  const { data: contacts, isLoading, refetch } = trpc.channelPartners.contacts.list.useQuery({ channelPartnerId: cpId });
  const inviteMutation = trpc.channelPartners.contacts.invite.useMutation({
    onSuccess: () => { toast.success("Invitation sent"); setInviteOpen(false); setInviteForm({ contactName: "", email: "", portalRole: "admin" }); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const deactivateMutation = trpc.channelPartners.contacts.deactivate.useMutation({
    onSuccess: () => { toast.success("Contact deactivated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const reactivateMutation = trpc.channelPartners.contacts.reactivate.useMutation({
    onSuccess: () => { toast.success("Contact reactivated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const roleColors: Record<string, string> = {
    admin: "bg-purple-50 text-purple-700 border-purple-200",
    finance: "bg-blue-50 text-blue-700 border-blue-200",
    hr: "bg-green-50 text-green-700 border-green-200",
    viewer: "bg-slate-50 text-slate-600 border-slate-200",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Portal Users</CardTitle>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="w-4 h-4 mr-2" />Invite User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite Portal User</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div><Label>Name *</Label><Input value={inviteForm.contactName} onChange={(e) => setInviteForm({ ...inviteForm, contactName: e.target.value })} /></div>
              <div><Label>Email *</Label><Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} /></div>
              <div><Label>Role</Label>
                <Select value={inviteForm.portalRole} onValueChange={(v: any) => setInviteForm({ ...inviteForm, portalRole: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="operations">Operations</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={() => inviteMutation.mutate({ channelPartnerId: cpId, ...inviteForm })} disabled={inviteMutation.isPending}>
                {inviteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Send Invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32 w-full" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!contacts || contacts.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-slate-500">No portal users yet</TableCell></TableRow>
              )}
              {contacts?.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.contactName}</TableCell>
                  <TableCell className="text-sm">{c.email}</TableCell>
                  <TableCell><Badge variant="outline" className={roleColors[c.portalRole] || ""}>{c.portalRole}</Badge></TableCell>
                  <TableCell>
                    {c.isPortalActive ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">{c.lastLoginAt ? new Date(c.lastLoginAt).toLocaleDateString() : "Never"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {c.isPortalActive ? (
                          <DropdownMenuItem onClick={() => deactivateMutation.mutate({ id: c.id })}>
                            <ShieldX className="w-4 h-4 mr-2" />Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => reactivateMutation.mutate({ id: c.id })}>
                            <Shield className="w-4 h-4 mr-2" />Reactivate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ========== EG→CP Pricing Tab ========== */
function PricingTab({ cpId }: { cpId: number }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    serviceType: "eor" as "eor" | "visa_eor",
    countryCode: "",
    pricingType: "fixed_per_employee" as "fixed_per_employee" | "percentage_markup" | "tiered",
    fixedFeeAmount: "", markupPercentage: "", tierConfig: "",
    currency: "USD", fxMarkupPercentage: "3.00",
    effectiveFrom: new Date().toISOString().split("T")[0],
    effectiveTo: "",
  });
  const { data: rules, isLoading, refetch } = trpc.channelPartners.pricing.list.useQuery({ channelPartnerId: cpId });
  const createMutation = trpc.channelPartners.pricing.create.useMutation({
    onSuccess: () => { toast.success("Pricing rule created"); setCreateOpen(false); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.channelPartners.pricing.delete.useMutation({
    onSuccess: () => { toast.success("Pricing rule deleted"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>EG → CP Settlement Pricing</CardTitle>
          <p className="text-sm text-slate-500 mt-1">Define the cost basis that EG charges this CP</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Add Rule</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New Pricing Rule</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Service Type</Label>
                  <Select value={form.serviceType} onValueChange={(v: any) => setForm({ ...form, serviceType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eor">EOR</SelectItem>
                      <SelectItem value="visa_eor">Visa EOR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Country Code</Label><Input value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })} placeholder="e.g. SG (or blank for global)" /></div>
              </div>
              <div><Label>Pricing Type</Label>
                <Select value={form.pricingType} onValueChange={(v: any) => setForm({ ...form, pricingType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed_per_employee">Fixed Per Employee</SelectItem>
                    <SelectItem value="percentage_markup">Percentage Markup</SelectItem>
                    <SelectItem value="tiered">Tiered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.pricingType === "fixed_per_employee" && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Fixed Fee Amount</Label><Input value={form.fixedFeeAmount} onChange={(e) => setForm({ ...form, fixedFeeAmount: e.target.value })} /></div>
                  <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
                </div>
              )}
              {form.pricingType === "percentage_markup" && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Markup Percentage (%)</Label><Input value={form.markupPercentage} onChange={(e) => setForm({ ...form, markupPercentage: e.target.value })} /></div>
                  <div><Label>FX Markup (%)</Label><Input value={form.fxMarkupPercentage} onChange={(e) => setForm({ ...form, fxMarkupPercentage: e.target.value })} /></div>
                </div>
              )}
              {form.pricingType === "tiered" && (
                <div><Label>Tier Config (JSON)</Label><Textarea value={form.tierConfig} onChange={(e) => setForm({ ...form, tierConfig: e.target.value })} rows={4} placeholder='[{"min":1,"max":10,"rate":"500"},{"min":11,"max":50,"rate":"450"}]' /></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Effective From *</Label><Input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></div>
                <div><Label>Effective To</Label><Input type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate({
                channelPartnerId: cpId,
                serviceType: form.serviceType,
                countryCode: form.countryCode || undefined,
                pricingType: form.pricingType,
                fixedFeeAmount: form.fixedFeeAmount || undefined,
                markupPercentage: form.markupPercentage || undefined,
                tierConfig: form.tierConfig ? JSON.parse(form.tierConfig) : undefined,
                currency: form.currency,
                fxMarkupPercentage: form.fxMarkupPercentage,
                effectiveFrom: form.effectiveFrom,
                effectiveTo: form.effectiveTo || undefined,
              })} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32 w-full" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!rules || rules.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-slate-500">No pricing rules defined</TableCell></TableRow>
              )}
              {rules?.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.serviceType}</TableCell>
                  <TableCell>{r.countryCode || "Global"}</TableCell>
                  <TableCell><Badge variant="outline">{r.pricingType?.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="text-sm">
                    {r.pricingType === "fixed_per_employee" && `${r.fixedFeeAmount}`}
                    {r.pricingType === "percentage_markup" && `${r.markupPercentage}%`}
                    {r.pricingType === "tiered" && "See tiers"}
                  </TableCell>
                  <TableCell>{r.currency}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ id: r.id })}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ========== CP→Client Pricing Tab ========== */
function ClientPricingTab({ cpId }: { cpId: number }) {
  const { data: rules, isLoading } = trpc.channelPartners.clientPricing.list.useQuery({ channelPartnerId: cpId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>CP → End Client Pricing</CardTitle>
        <p className="text-sm text-slate-500 mt-1">Pricing rules set by the CP for their end clients (read-only from Admin)</p>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32 w-full" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Currency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!rules || rules.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500">No client pricing rules configured by CP</TableCell></TableRow>
              )}
              {rules?.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.serviceType}</TableCell>
                  <TableCell>{r.countryCode || "Global"}</TableCell>
                  <TableCell><Badge variant="outline">{r.pricingType?.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="text-sm">
                    {r.pricingType === "fixed_per_employee" && `${r.fixedFeeAmount}`}
                    {r.pricingType === "percentage_markup" && `${r.markupPercentage}%`}
                    {r.pricingType === "mixed" && `${r.baseFeeAmount} + ${r.additionalMarkupPercentage}%`}
                    {r.pricingType === "tiered" && "See tiers"}
                  </TableCell>
                  <TableCell>{r.currency}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ========== Contracts Tab ========== */
function ContractsTab({ cpId }: { cpId: number }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ contractType: "master_service_agreement" as string, contractName: "", fileUrl: "", effectiveDate: "", expiryDate: "", status: "draft" as string });
  const { data: contracts, isLoading, refetch } = trpc.channelPartners.contracts.list.useQuery({ channelPartnerId: cpId });
  const createMutation = trpc.channelPartners.contracts.create.useMutation({
    onSuccess: () => { toast.success("Contract added"); setCreateOpen(false); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.channelPartners.contracts.delete.useMutation({
    onSuccess: () => { toast.success("Contract deleted"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Contracts</CardTitle>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Add Contract</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Contract</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div><Label>Contract Name *</Label><Input value={form.contractName} onChange={(e) => setForm({ ...form, contractName: e.target.value })} /></div>
              <div><Label>Type</Label>
                <Select value={form.contractType} onValueChange={(v) => setForm({ ...form, contractType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="master_service_agreement">Master Service Agreement</SelectItem>
                    <SelectItem value="nda">NDA</SelectItem>
                    <SelectItem value="sow">Statement of Work</SelectItem>
                    <SelectItem value="amendment">Amendment</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>File URL</Label><Input value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Effective Date</Label><Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></div>
                <div><Label>Expiry Date</Label><Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate({
                channelPartnerId: cpId,
                contractName: form.contractName,
                contractType: form.contractType || undefined,
                fileUrl: form.fileUrl || undefined,
                effectiveDate: form.effectiveDate || undefined,
                expiryDate: form.expiryDate || undefined,
                status: form.status as any,
              })} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32 w-full" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>File</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!contracts || contracts.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500">No contracts</TableCell></TableRow>
              )}
              {contracts?.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.contractName}</TableCell>
                  <TableCell><Badge variant="outline">{c.contractType?.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={c.status === "active" ? "bg-emerald-50 text-emerald-700" : ""}>{c.status}</Badge></TableCell>
                  <TableCell>
                    {c.fileUrl ? <a href={c.fileUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3" />View</a> : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ id: c.id })}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ========== Wallet Tab ========== */
function WalletTab({ cpId, currency }: { cpId: number; currency: string }) {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [topUpForm, setTopUpForm] = useState({ amount: "", description: "" });
  const [adjustForm, setAdjustForm] = useState({ amount: "", direction: "credit" as "credit" | "debit", description: "", internalNote: "" });
  const [releaseForm, setReleaseForm] = useState({ amount: "", reason: "" });
  const [txTab, setTxTab] = useState("main");

  const { data: walletData, isLoading, refetch } = trpc.channelPartners.wallet.get.useQuery({ channelPartnerId: cpId, currency });
  const { data: mainTx } = trpc.channelPartners.wallet.listTransactions.useQuery({ channelPartnerId: cpId, currency, limit: 20 });
  const { data: frozenTx } = trpc.channelPartners.wallet.listFrozenTransactions.useQuery({ channelPartnerId: cpId, currency, limit: 20 });

  const topUpMutation = trpc.channelPartners.wallet.topUp.useMutation({
    onSuccess: () => { toast.success("Top-up successful"); setTopUpOpen(false); setTopUpForm({ amount: "", description: "" }); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const adjustMutation = trpc.channelPartners.wallet.manualAdjustment.useMutation({
    onSuccess: () => { toast.success("Adjustment applied"); setAdjustOpen(false); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const releaseMutation = trpc.channelPartners.wallet.releaseFrozen.useMutation({
    onSuccess: () => { toast.success("Frozen funds released"); setReleaseOpen(false); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const txTypeColors: Record<string, string> = {
    top_up: "text-emerald-600",
    invoice_payment: "text-red-600",
    credit: "text-emerald-600",
    debit: "text-red-600",
    deposit_freeze: "text-amber-600",
    deposit_release: "text-emerald-600",
    refund: "text-blue-600",
  };

  return (
    <div className="space-y-6">
      {/* Balance Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Prepaid Wallet</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {currency} {walletData?.main?.balance || "0.00"}
                </p>
              </div>
              <Wallet className="w-8 h-8 text-indigo-500" />
            </div>
            <div className="flex gap-2 mt-4">
              <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
                <DialogTrigger asChild><Button size="sm"><ArrowUpRight className="w-4 h-4 mr-1" />Top Up</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Top Up Wallet</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div><Label>Amount ({currency})</Label><Input type="number" value={topUpForm.amount} onChange={(e) => setTopUpForm({ ...topUpForm, amount: e.target.value })} /></div>
                    <div><Label>Description *</Label><Input value={topUpForm.description} onChange={(e) => setTopUpForm({ ...topUpForm, description: e.target.value })} placeholder="e.g. Bank transfer received" /></div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setTopUpOpen(false)}>Cancel</Button>
                    <Button onClick={() => topUpMutation.mutate({ channelPartnerId: cpId, currency, amount: topUpForm.amount, description: topUpForm.description })} disabled={topUpMutation.isPending}>
                      {topUpMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Confirm
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
                <DialogTrigger asChild><Button size="sm" variant="outline"><RefreshCw className="w-4 h-4 mr-1" />Adjust</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Manual Adjustment</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div><Label>Direction</Label>
                      <Select value={adjustForm.direction} onValueChange={(v: any) => setAdjustForm({ ...adjustForm, direction: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="credit">Credit (Add)</SelectItem>
                          <SelectItem value="debit">Debit (Subtract)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Amount ({currency})</Label><Input type="number" value={adjustForm.amount} onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })} /></div>
                    <div><Label>Description *</Label><Input value={adjustForm.description} onChange={(e) => setAdjustForm({ ...adjustForm, description: e.target.value })} /></div>
                    <div><Label>Internal Note</Label><Textarea value={adjustForm.internalNote} onChange={(e) => setAdjustForm({ ...adjustForm, internalNote: e.target.value })} rows={2} /></div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
                    <Button onClick={() => adjustMutation.mutate({ channelPartnerId: cpId, currency, ...adjustForm })} disabled={adjustMutation.isPending}>
                      {adjustMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Apply
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Frozen Deposit</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">
                  {currency} {walletData?.frozen?.balance || "0.00"}
                </p>
              </div>
              <Shield className="w-8 h-8 text-amber-500" />
            </div>
            <div className="mt-4">
              <Dialog open={releaseOpen} onOpenChange={setReleaseOpen}>
                <DialogTrigger asChild><Button size="sm" variant="outline"><Unlock className="w-4 h-4 mr-1" />Release</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Release Frozen Funds</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div><Label>Amount ({currency})</Label><Input type="number" value={releaseForm.amount} onChange={(e) => setReleaseForm({ ...releaseForm, amount: e.target.value })} /></div>
                    <div><Label>Reason *</Label><Input value={releaseForm.reason} onChange={(e) => setReleaseForm({ ...releaseForm, reason: e.target.value })} placeholder="e.g. Contract ended, deposit refund" /></div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setReleaseOpen(false)}>Cancel</Button>
                    <Button onClick={() => releaseMutation.mutate({ channelPartnerId: cpId, currency, ...releaseForm })} disabled={releaseMutation.isPending}>
                      {releaseMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Release
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={txTab} onValueChange={setTxTab}>
            <TabsList>
              <TabsTrigger value="main">Prepaid Wallet</TabsTrigger>
              <TabsTrigger value="frozen">Frozen Deposit</TabsTrigger>
            </TabsList>
            <TabsContent value="main">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance After</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!mainTx?.data || mainTx.data.length === 0) && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500">No transactions</TableCell></TableRow>
                  )}
                  {mainTx?.data?.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm">{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell><Badge variant="outline">{tx.transactionType?.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell className="text-sm">{tx.description}</TableCell>
                      <TableCell className={`text-right font-mono ${txTypeColors[tx.transactionType] || ""}`}>
                        {tx.direction === "credit" ? "+" : "-"}{tx.amount}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{tx.balanceAfter}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="frozen">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance After</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!frozenTx?.data || frozenTx.data.length === 0) && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500">No frozen transactions</TableCell></TableRow>
                  )}
                  {frozenTx?.data?.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm">{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell><Badge variant="outline">{tx.transactionType?.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell className="text-sm">{tx.description}</TableCell>
                      <TableCell className={`text-right font-mono ${txTypeColors[tx.transactionType] || ""}`}>
                        {tx.direction === "credit" ? "+" : "-"}{tx.amount}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{tx.balanceAfter}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

/* ========== Main Export ========== */
export default function ChannelPartners() {
  const [match, params] = useRoute("/channel-partners/:id");
  if (match && params?.id) {
    const id = parseInt(params.id, 10);
    if (!isNaN(id)) return <ChannelPartnerDetail id={id} />;
  }
  return <ChannelPartnerList />;
}
