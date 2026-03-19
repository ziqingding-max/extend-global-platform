/**
 * EG Admin — Customer Management
 * List + Detail view with tabs (Info, Pricing, Contacts, Contracts)
 */
import Layout from "@/components/Layout";
import CurrencySelect from "@/components/CurrencySelect";
import CountrySelect from "@/components/CountrySelect";
import { DatePicker } from "@/components/DatePicker";
import { formatDate, formatDateISO, countryName } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useCpContext } from "@/_core/store/cpContextStore";
import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2, Plus, Search, ArrowLeft, Mail, Phone, Users, DollarSign,
  ChevronRight, Trash2, UserPlus, FileText, Upload, ExternalLink, X, Pencil,
  Send, ShieldCheck, ShieldX, Copy, Check, KeyRound, Wallet, ArrowUpRight, ArrowDownLeft, LogIn, Shield, MoreHorizontal, Loader2,
  LayoutList, LayoutGrid, ChevronDown, ChevronUp,
} from "lucide-react";
import { useMemo } from "react";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
const statusColors: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  suspended: "bg-amber-50 text-amber-700 border-amber-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
};

/* ========== Grouped Customer Table (by Channel Partner) ========== */
function GroupedCustomerTable({
  customers,
  cpList,
  collapsedGroups,
  setCollapsedGroups,
  onRowClick,
  statusColors,
  t,
}: {
  customers: any[];
  cpList: any[];
  collapsedGroups: Set<string>;
  setCollapsedGroups: (s: Set<string>) => void;
  onRowClick: (id: number) => void;
  statusColors: Record<string, string>;
  t: (key: string, params?: any) => string;
}) {
  // Build CP name map
  const cpNameMap = useMemo(() => {
    const map: Record<string, string> = { "direct": "EG Direct (Internal)" };
    cpList.forEach((cp: any) => {
      map[String(cp.id)] = cp.companyName + (cp.isInternal ? " (Internal)" : "");
    });
    return map;
  }, [cpList]);

  // Group customers by channelPartnerId
  const groups = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    customers.forEach((c: any) => {
      const key = c.channelPartnerId ? String(c.channelPartnerId) : "direct";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c);
    });
    // Sort: EG Direct first, then alphabetically by CP name
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      if (a === "direct") return -1;
      if (b === "direct") return 1;
      return (cpNameMap[a] || "").localeCompare(cpNameMap[b] || "");
    });
    return sortedKeys.map(key => ({
      key,
      name: cpNameMap[key] || `Partner #${key}`,
      customers: grouped[key],
    }));
  }, [customers, cpNameMap]);

  const toggleGroup = (key: string) => {
    const next = new Set(collapsedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedGroups(next);
  };

  if (groups.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{t("customers.empty_state.no_customers")}</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {groups.map(group => (
        <div key={group.key}>
          {/* Group Header */}
          <button
            className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            onClick={() => toggleGroup(group.key)}
          >
            {collapsedGroups.has(group.key) ? (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
            <Building2 className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">{group.name}</span>
            <Badge variant="secondary" className="text-xs ml-1">
              {group.customers.length} {group.customers.length === 1 ? "client" : "clients"}
            </Badge>
          </button>
          {/* Group Body */}
          {!collapsedGroups.has(group.key) && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 pl-10">ID</TableHead>
                  <TableHead>{t("customers.table.header.company")}</TableHead>
                  <TableHead className="min-w-[120px]">{t("customers.table.header.country")}</TableHead>
                  <TableHead>{t("customers.form.primary_contact")}</TableHead>
                  <TableHead>{t("customers.table.header.billing")}</TableHead>
                  <TableHead>{t("customers.table.header.status")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.customers.map((customer: any) => (
                  <TableRow key={customer.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onRowClick(customer.id)}>
                    <TableCell className="text-sm text-muted-foreground font-mono pl-10">{customer.id}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{customer.companyName}</div>
                      <div className="text-xs text-muted-foreground">{customer.clientCode || customer.legalEntityName || ''}</div>
                    </TableCell>
                    <TableCell className="text-sm">{countryName(customer.country)}</TableCell>
                    <TableCell>
                      <div className="text-sm">{customer.primaryContactName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{customer.primaryContactEmail || ""}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{t("customers.paymentTerms.netDays", { days: customer.paymentTermDays ?? 30 })}</div>
                      <div className="text-xs text-muted-foreground">{customer.settlementCurrency}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs min-w-[72px] justify-center capitalize ${statusColors[customer.status] || ""}`}>{customer.status}</Badge>
                    </TableCell>
                    <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ))}
    </div>
  );
}

/* ========== Customer List ========== */
function CustomerList() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cpFilter, setCpFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped"); // Default: grouped by CP
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [createOpen, setCreateOpen] = useState(false);
  // Initialize page from URL params (e.g. /customers?page=2)
  const getUrlPage = () => {
    const p = parseInt(new URLSearchParams(searchString).get("page") || "1", 10);
    return isNaN(p) ? 1 : p;
  };
  const [page, setPage] = useState(getUrlPage);
  const pageSize = 20;
  const isInitialMount = useRef(true);

  // Sync page from URL when navigating back from detail page
  useEffect(() => {
    setPage(getUrlPage());
  }, [searchString]);

  // Reset to page 1 when filters change (skip initial mount to preserve URL page)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setPage(1);
  }, [search, statusFilter, cpFilter]);

  // Task Group B: Global CP Context overrides local cpFilter
  const cpContext = useCpContext();
  const resolvedChannelPartnerId = (() => {
    if (cpContext.mode === "direct") return null;
    if (cpContext.mode === "specific") return cpContext.cpId;
    // Fallback to local filter
    if (cpFilter === "all") return undefined;
    if (cpFilter === "direct") return null;
    return parseInt(cpFilter);
  })();

  /**
   * EG-DIRECT Permission Unlock:
   * In B2B2B, Admin is read-only for Client data by default.
   * When Context Switcher is set to EG-DIRECT, Admin gains full CP-level
   * management rights (create/edit/manage clients, wallets, pricing, etc.)
   * because EG is acting as its own CP for direct-sign customers.
   */
  const isDirectContext = cpContext.mode === "direct";
  const canManageClients = isDirectContext; // Only EG-DIRECT unlocks write access

  const { data, isLoading, refetch } = trpc.customers.list.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    channelPartnerId: resolvedChannelPartnerId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const { data: cpList } = trpc.channelPartners.list.useQuery({ limit: 200, includeInternal: true });

  const { data: billingEntities } = trpc.billingEntities.list.useQuery();

  const createMutation = trpc.customers.create.useMutation({
    onSuccess: () => {
      toast.success(t("customers.toast.create_success"));
      setCreateOpen(false);
      refetch();
      setFormData(defaultForm);
    },
    onError: (err) => toast.error(err.message),
  });

  const defaultForm = {
    companyName: "", legalEntityName: "", registrationNumber: "", industry: "",
    address: "", city: "", state: "", country: "", postalCode: "",
    primaryContactName: "", primaryContactEmail: "", primaryContactPhone: "",
    paymentTermDays: 30, settlementCurrency: "USD", language: "en" as const,
    billingEntityId: undefined as number | undefined, depositMultiplier: 2,
    notes: "",
  };
  const [formData, setFormData] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  function validateAndCreate() {
    const errors: Record<string, boolean> = {};
    if (!formData.companyName.trim()) errors.companyName = true;
    if (!formData.country) errors.country = true;
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error(t("customers.toast.required_fields"));
      return;
    }
    setFormErrors({});
    createMutation.mutate(formData);
  }

  return (
    <Layout breadcrumb={["EG", "Customers"]}>
      <div className="p-6 space-y-6 page-enter">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("customers.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("customers.description")}</p>
          </div>
          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setFormErrors({}); }}>
            <DialogTrigger asChild>
              <Button disabled={!canManageClients} title={!canManageClients ? "Switch to EG-DIRECT context to create customers. In B2B2B mode, clients are managed by their Channel Partner." : undefined}>
                <Plus className="w-4 h-4 mr-2" />{t("customers.button.add")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("customers.dialog.new_customer.title")}</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className={formErrors.companyName ? "text-destructive" : ""}>{t("customers.form.company_name")}</Label>
                    <Input className={formErrors.companyName ? "border-destructive ring-destructive" : ""} value={formData.companyName} onChange={(e) => { setFormData({ ...formData, companyName: e.target.value }); if (e.target.value.trim()) setFormErrors(prev => ({ ...prev, companyName: false })); }} placeholder="Acme Corp" />
                    {formErrors.companyName && <p className="text-xs text-destructive">{t("customers.validation.companyNameRequired")}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>{t("customers.form.legal_entity_name")}</Label>
                    <Input value={formData.legalEntityName} onChange={(e) => setFormData({ ...formData, legalEntityName: e.target.value })} placeholder="Acme Corp Pte Ltd" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t("customers.form.registration_no")}</Label>
                    <Input value={formData.registrationNumber} onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("customers.form.industry")}</Label>
                    <Input value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} placeholder="Technology" />
                  </div>
                  <div className="space-y-2">
                    <Label className={formErrors.country ? "text-destructive" : ""}>{t("customers.form.country")}</Label>
                    <div className={formErrors.country ? "[&>button]:border-destructive [&>button]:ring-destructive" : ""}>
                      <CountrySelect value={formData.country} onValueChange={(v) => { setFormData({ ...formData, country: v }); setFormErrors(prev => ({ ...prev, country: false })); }} />
                    </div>
                    {formErrors.country && <p className="text-xs text-destructive">{t("customers.validation.countryRequired")}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("customers.form.address")}</Label>
                    <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("customers.form.city")}</Label>
                    <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t("customers.form.primary_contact")}</Label>
                    <Input value={formData.primaryContactName} onChange={(e) => setFormData({ ...formData, primaryContactName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("customers.form.email")}</Label>
                    <Input type="email" value={formData.primaryContactEmail} onChange={(e) => setFormData({ ...formData, primaryContactEmail: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("customers.form.phone")}</Label>
                    <Input value={formData.primaryContactPhone} onChange={(e) => setFormData({ ...formData, primaryContactPhone: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr] gap-4">
                  <div className="space-y-2">
                    <Label>{t("customers.form.payment_terms")}</Label>
                    <div className="flex gap-2">
                      <Select value={[7, 15, 30].includes(formData.paymentTermDays) ? formData.paymentTermDays.toString() : "custom"} onValueChange={(v) => { if (v !== "custom") setFormData({ ...formData, paymentTermDays: parseInt(v) }); }}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">{t("customers.paymentTerms.net7")}</SelectItem>
                          <SelectItem value="15">{t("customers.paymentTerms.net15")}</SelectItem>
                          <SelectItem value="30">{t("customers.paymentTerms.net30")}</SelectItem>
                          <SelectItem value="custom">{t("common.custom")}</SelectItem>
                        </SelectContent>
                      </Select>
                      {![7, 15, 30].includes(formData.paymentTermDays) && (
                        <Input type="number" min={1} max={365} className="w-24" value={formData.paymentTermDays} onChange={(e) => setFormData({ ...formData, paymentTermDays: parseInt(e.target.value) || 0 })} placeholder="Days" />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("customers.form.settlement_currency")}</Label>
                    <CurrencySelect value={formData.settlementCurrency} onValueChange={(v) => setFormData({ ...formData, settlementCurrency: v })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("customers.form.invoice_language")}</Label>
                    <Select value={formData.language} onValueChange={(v) => setFormData({ ...formData, language: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">{t("common.english")}</SelectItem>
                        <SelectItem value="zh">中文</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("customers.form.billingEntity")}</Label>
                    <Select value={formData.billingEntityId?.toString() || "none"} onValueChange={(v) => setFormData({ ...formData, billingEntityId: v === "none" ? undefined : parseInt(v) })}>
                      <SelectTrigger><SelectValue placeholder="Select billing entity" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("common.notAssigned")}</SelectItem>
                        {billingEntities?.map((be: any) => (
                          <SelectItem key={be.id} value={be.id.toString()}>{be.entityName} ({be.currency})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("customers.form.deposit_multiplier")}</Label>
                    <Select value={formData.depositMultiplier.toString()} onValueChange={(v) => setFormData({ ...formData, depositMultiplier: parseInt(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t("customers.depositMultiplier.one")}</SelectItem>
                        <SelectItem value="2">{t("customers.depositMultiplier.two")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t("customers.depositMultiplier.hint")}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("customers.form.notes")}</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
                  <Button onClick={validateAndCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create Customer"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("customers.filters.allStatuses")}</SelectItem>
              <SelectItem value="active">{t("status.active")}</SelectItem>
              <SelectItem value="suspended">{t("status.suspended")}</SelectItem>
              <SelectItem value="terminated">{t("status.terminated")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={cpFilter} onValueChange={setCpFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Channel Partner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Partners</SelectItem>
              <SelectItem value="direct">EG Direct</SelectItem>
              {cpList?.data?.map((cp: any) => (
                <SelectItem key={cp.id} value={String(cp.id)}>{cp.companyName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} customers` : "Loading..."}
          </p>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === "grouped" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setViewMode("grouped")}
            >
              <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />Grouped by Partner
            </Button>
            <Button
              variant={viewMode === "flat" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setViewMode("flat")}
            >
              <LayoutList className="w-3.5 h-3.5 mr-1.5" />Flat List
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : viewMode === "grouped" && cpFilter === "all" ? (
              /* ── Grouped View: customers organized by Channel Partner ── */
              <GroupedCustomerTable
                customers={data?.data || []}
                cpList={cpList?.data || []}
                collapsedGroups={collapsedGroups}
                setCollapsedGroups={setCollapsedGroups}
                onRowClick={(customerId) => setLocation(`/customers/${customerId}?from_page=${page}`)}
                statusColors={statusColors}
                t={t}
              />
            ) : (
              /* ── Flat View: traditional table ── */
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">ID</TableHead>
                    <TableHead>{t("customers.table.header.company")}</TableHead>
                    <TableHead className="min-w-[120px]">{t("customers.table.header.country")}</TableHead>
                    <TableHead>{t("customers.form.primary_contact")}</TableHead>
                    <TableHead>{t("customers.table.header.billing")}</TableHead>
                    <TableHead>{t("customers.table.header.status")}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data && data.data.length > 0 ? data.data.map((customer) => (
                    <TableRow key={customer.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/customers/${customer.id}?from_page=${page}`)}>
                      <TableCell className="text-sm text-muted-foreground font-mono">{customer.id}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{customer.companyName}</div>
                        <div className="text-xs text-muted-foreground">{(customer as any).clientCode || customer.legalEntityName || ''}</div>
                      </TableCell>
                      <TableCell className="text-sm">{countryName(customer.country)}</TableCell>
                      <TableCell>
                        <div className="text-sm">{customer.primaryContactName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{customer.primaryContactEmail || ""}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{t("customers.paymentTerms.netDays", { days: customer.paymentTermDays ?? 30 })}</div>
                        <div className="text-xs text-muted-foreground">{customer.settlementCurrency}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs min-w-[72px] justify-center capitalize ${statusColors[customer.status] || ""}`}>{customer.status}</Badge>
                      </TableCell>
                      <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <Building2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">{t("customers.empty_state.no_customers")}</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        {data && (() => {
          const totalPages = Math.ceil(data.total / pageSize);
          return (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total} customers</p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t("common.previous")}</Button>
                  <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t("common.next")}</Button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </Layout>
  );
}

/* ========== Customer Detail ========== */
function CustomerDetail({ id }: { id: number }) {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const fromPage = new URLSearchParams(searchString).get("from_page") || "1";
  const [activeTab, setActiveTab] = useState<"info" | "pricing" | "contacts" | "contracts" | "leavePolicy" | "wallet">("info");

  const { data: customer, isLoading, refetch: refetchCustomer } = trpc.customers.get.useQuery({ id });
  const { data: pricing, refetch: refetchPricing } = trpc.customers.pricing.list.useQuery({ customerId: id });
  const { data: contacts, refetch: refetchContacts } = trpc.customers.contacts.list.useQuery({ customerId: id });
  const { data: contracts, refetch: refetchContracts } = trpc.customers.contracts.list.useQuery({ customerId: id });
  const { data: leavePolicies, refetch: refetchLeavePolicies } = trpc.customerLeavePolicies.list.useQuery({ customerId: id });
  const { data: countriesData } = trpc.countries.list.useQuery();
  const { data: billingEntitiesForDetail } = trpc.billingEntities.list.useQuery();

  // ── Edit Customer ──
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const updateCustomerMutation = trpc.customers.update.useMutation({
    onSuccess: () => { toast.success("Customer updated"); setEditOpen(false); refetchCustomer(); },
    onError: (err) => toast.error(err.message),
  });
  function openEditDialog() {
    if (!customer) return;
    setEditForm({
      companyName: customer.companyName || "",
      legalEntityName: customer.legalEntityName || "",
      registrationNumber: customer.registrationNumber || "",
      industry: customer.industry || "",
      country: customer.country || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      postalCode: customer.postalCode || "",
      primaryContactName: customer.primaryContactName || "",
      primaryContactEmail: customer.primaryContactEmail || "",
      primaryContactPhone: customer.primaryContactPhone || "",
      paymentTermDays: customer.paymentTermDays ?? 30,
      settlementCurrency: customer.settlementCurrency || "USD",
      language: customer.language || "en",
      billingEntityId: customer.billingEntityId || undefined,
      depositMultiplier: customer.depositMultiplier || 2,
      status: customer.status || "active",
      notes: customer.notes || "",
    });
    setEditOpen(true);
  }

  // Build a map of country standard rates for showing in pricing
  const standardRatesMap: Record<string, { eor?: string; visa_eor?: string; aor?: string; visaSetupFee?: string; currency?: string }> = {};
  if (countriesData) {
    for (const c of countriesData as any[]) {
      standardRatesMap[c.countryCode] = {
        eor: c.standardEorRate ?? undefined,
        visa_eor: c.standardVisaEorRate ?? undefined,
        aor: c.standardAorRate ?? undefined,
        visaSetupFee: c.visaEorSetupFee ?? undefined,
        currency: c.standardRateCurrency ?? "USD",
      };
    }
  }

  // ── Pricing CRUD ──
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingMode, setPricingMode] = useState<"single" | "batch">("single");
  const [pricingForm, setPricingForm] = useState({
    pricingType: "country_specific" as "global_discount" | "country_specific",
    globalDiscountPercent: "",
    countryCode: "",
    selectedCountries: [] as string[],
    serviceType: "eor" as "eor" | "visa_eor",
    fixedPrice: "",
    visaOneTimeFee: "",
    currency: "USD",
    effectiveFrom: formatDateISO(new Date()),
    effectiveTo: "",
  });
  // AOR pricing — separate state for the dedicated AOR card
  const [aorPricingOpen, setAorPricingOpen] = useState(false);
  const [aorForm, setAorForm] = useState({ fixedPrice: "", currency: "USD", effectiveFrom: formatDateISO(new Date()) });
  const createPricingMutation = trpc.customers.pricing.create.useMutation({
    onSuccess: () => { toast.success("Pricing added"); setPricingOpen(false); refetchPricing(); },
    onError: (err) => toast.error(err.message),
  });
  const batchCreatePricingMutation = trpc.customers.pricing.batchCreate.useMutation({
    onSuccess: (res) => { toast.success(`Pricing added for ${res.count} countries`); setPricingOpen(false); refetchPricing(); },
    onError: (err) => toast.error(err.message),
  });
  const deletePricingMutation = trpc.customers.pricing.delete.useMutation({
    onSuccess: () => { toast.success("Pricing deleted"); refetchPricing(); },
    onError: (err) => toast.error(err.message),
  });

  // Derive AOR pricing from the pricing list
  const activeAorPricing = pricing?.find((p: any) => p.pricingType === "client_aor_fixed" && p.isActive);
  // EOR/Visa EOR pricing only (for the table)
  const eorPricingList = pricing?.filter((p: any) => p.pricingType !== "client_aor_fixed") || [];

  function handleSaveAorPricing() {
    if (!aorForm.fixedPrice) { toast.error("AOR price is required"); return; }
    createPricingMutation.mutate({
      customerId: id,
      pricingType: "client_aor_fixed",
      fixedPrice: aorForm.fixedPrice,
      currency: aorForm.currency,
      effectiveFrom: aorForm.effectiveFrom,
    });
    setAorPricingOpen(false);
  }

  function handleSavePricing() {
    if (pricingForm.pricingType === "global_discount") {
      if (!pricingForm.globalDiscountPercent) { toast.error("Discount percentage is required"); return; }
      createPricingMutation.mutate({
        customerId: id,
        pricingType: "global_discount",
        globalDiscountPercent: pricingForm.globalDiscountPercent,
        currency: pricingForm.currency,
        effectiveFrom: pricingForm.effectiveFrom,
        effectiveTo: pricingForm.effectiveTo || undefined,
      });
    } else if (pricingMode === "batch") {
      if (pricingForm.selectedCountries.length === 0) { toast.error("Select at least one country"); return; }
      if (!pricingForm.fixedPrice) { toast.error("Fixed price is required"); return; }
      batchCreatePricingMutation.mutate({
        customerId: id,
        countryCodes: pricingForm.selectedCountries,
        serviceType: pricingForm.serviceType,
        fixedPrice: pricingForm.fixedPrice,
        visaOneTimeFee: pricingForm.serviceType === "visa_eor" && pricingForm.visaOneTimeFee ? pricingForm.visaOneTimeFee : undefined,
        currency: pricingForm.currency,
        effectiveFrom: pricingForm.effectiveFrom,
        effectiveTo: pricingForm.effectiveTo || undefined,
      });
    } else {
      if (!pricingForm.countryCode) { toast.error(t("customers.validation.countryRequired")); return; }
      if (!pricingForm.fixedPrice) { toast.error("Fixed price is required"); return; }
      createPricingMutation.mutate({
        customerId: id,
        pricingType: "country_specific",
        countryCode: pricingForm.countryCode,
        serviceType: pricingForm.serviceType,
        fixedPrice: pricingForm.fixedPrice,
        visaOneTimeFee: pricingForm.serviceType === "visa_eor" && pricingForm.visaOneTimeFee ? pricingForm.visaOneTimeFee : undefined,
        currency: pricingForm.currency,
        effectiveFrom: pricingForm.effectiveFrom,
        effectiveTo: pricingForm.effectiveTo || undefined,
      });
    }
  }

  // ── Contacts CRUD ──
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    contactName: "", email: "", phone: "", role: "", isPrimary: false, hasPortalAccess: false,
  });
  const createContactMutation = trpc.customers.contacts.create.useMutation({
    onSuccess: () => { toast.success("Contact added"); setContactOpen(false); refetchContacts(); setContactForm({ contactName: "", email: "", phone: "", role: "", isPrimary: false, hasPortalAccess: false }); },
    onError: (err) => toast.error(err.message),
  });
  const deleteContactMutation = trpc.customers.contacts.delete.useMutation({
    onSuccess: () => { toast.success("Contact deleted"); refetchContacts(); },
    onError: (err) => toast.error(err.message),
  });
  const updateContactMutation = trpc.customers.contacts.update.useMutation({
    onSuccess: () => { toast.success("Contact updated"); refetchContacts(); refetchCustomer(); },
    onError: (err: any) => toast.error(err.message),
  });

  // ── Edit Contact Dialog ──
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [editContactId, setEditContactId] = useState<number | null>(null);
  const [editContactForm, setEditContactForm] = useState({ contactName: "", email: "", phone: "", role: "" });
  function openEditContactDialog(c: any) {
    setEditContactId(c.id);
    setEditContactForm({ contactName: c.contactName, email: c.email, phone: c.phone || "", role: c.role || "" });
    setEditContactOpen(true);
  }
  function handleSaveEditContact() {
    if (!editContactId || !editContactForm.contactName || !editContactForm.email) { toast.error("Name and email are required"); return; }
    updateContactMutation.mutate({ id: editContactId, customerId: id, data: editContactForm });
    setEditContactOpen(false);
  }

  // ── Change Permission Dialog ──
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [permContactId, setPermContactId] = useState<number | null>(null);
  const [permContactName, setPermContactName] = useState("");
  const [permRole, setPermRole] = useState<"admin" | "hr_manager" | "finance" | "viewer">("viewer");
  function openPermDialog(c: any) {
    setPermContactId(c.id);
    setPermContactName(c.contactName);
    setPermRole(c.portalRole || "viewer");
    setPermDialogOpen(true);
  }
  function handleSavePermission() {
    if (!permContactId) return;
    updateContactMutation.mutate({ id: permContactId, customerId: id, data: { portalRole: permRole } });
    setPermDialogOpen(false);
  }

  // ── Login As (per-row impersonation) ──
  function handleLoginAs(contactId: number) {
    portalAccessMutation.mutate({ customerId: id, contactId });
  }

  // ── Portal Invite ──
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ token: string; email: string; contactName: string } | null>(null);
  const [inviteRole, setInviteRole] = useState<"admin" | "hr_manager" | "finance" | "viewer">("viewer");
  const [inviteContactId, setInviteContactId] = useState<number | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const generateInviteMutation = trpc.customers.contacts.generatePortalInvite.useMutation({
    onSuccess: (data) => {
      setInviteResult({ token: data.inviteToken, email: data.email, contactName: data.contactName });
      toast.success("Invite generated successfully");
      refetchContacts();
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeAccessMutation = trpc.customers.contacts.revokePortalAccess.useMutation({
    onSuccess: () => { toast.success("Portal access revoked"); refetchContacts(); },
    onError: (err) => toast.error(err.message),
  });

  // ── Admin Access Client Portal ──
  const portalAccessMutation = trpc.customers.generatePortalToken.useMutation({
    onSuccess: (data) => {
      // Open portal in new tab with impersonation token
      // Use app.extendglobal.ai for portal access, as admin is on admin.extendglobal.ai
      const hostname = window.location.hostname;
      const isProduction = hostname.includes('extendglobal.ai') || hostname.includes('manus.space');
      let portalBase = window.location.origin;
      
      if (isProduction && hostname.includes("admin")) {
        portalBase = window.location.origin.replace("admin", "app");
      }
      
      const url = `${portalBase}/api/portal-impersonate?token=${data.token}`;
      window.open(url, "_blank");
      toast.success(`Accessing portal as ${data.contactName} (${data.contactEmail})`);
    },
    onError: (err) => toast.error(err.message),
  });

  // Reset password state
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [resetPwContactId, setResetPwContactId] = useState<number | null>(null);
  const [resetPwContactName, setResetPwContactName] = useState("");
  const [resetPwValue, setResetPwValue] = useState("");
  const resetPasswordMutation = trpc.customers.contacts.resetPassword.useMutation({
    onSuccess: (data) => {
      toast.success(`Password reset for ${data.contactName} (${data.email})`);
      setResetPwOpen(false);
      setResetPwValue("");
    },
    onError: (err) => toast.error(err.message),
  });
  function openResetPwDialog(contactId: number, contactName: string) {
    setResetPwContactId(contactId);
    setResetPwContactName(contactName);
    setResetPwValue("");
    setResetPwOpen(true);
  }

  function openInviteDialog(contactId: number) {
    setInviteContactId(contactId);
    setInviteRole("viewer");
    setInviteResult(null);
    setCopiedInvite(false);
    setInviteDialogOpen(true);
  }

  function handleGenerateInvite() {
    if (!inviteContactId) return;
    generateInviteMutation.mutate({ contactId: inviteContactId, portalRole: inviteRole });
  }

  function getInviteLink(token: string) {
    // In production, portal is on app.extendglobal.ai; in dev, use /portal/ path prefix
    const hostname = window.location.hostname;
    const isProduction = hostname.includes('extendglobal.ai') || hostname.includes('manus.space');
    if (isProduction) {
      const protocol = window.location.protocol;
      return `${protocol}//app.extendglobal.ai/register?token=${token}`;
    }
    return `${window.location.origin}/portal/register?token=${token}`;
  }

  function copyInviteLink() {
    if (!inviteResult) return;
    navigator.clipboard.writeText(getInviteLink(inviteResult.token));
    setCopiedInvite(true);
    toast.success("Invite link copied to clipboard");
    setTimeout(() => setCopiedInvite(false), 3000);
  }

  // ── Contracts CRUD ──
  const [contractOpen, setContractOpen] = useState(false);
  const [contractForm, setContractForm] = useState({
    contractName: "", contractType: "service_agreement", signedDate: "", effectiveDate: "", expiryDate: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadContractMutation = trpc.customers.contracts.upload.useMutation({
    onSuccess: () => { toast.success("Contract uploaded"); setContractOpen(false); refetchContracts(); setSelectedFile(null); setContractForm({ contractName: "", contractType: "service_agreement", signedDate: "", effectiveDate: "", expiryDate: "" }); },
    onError: (err) => toast.error(err.message),
  });
  const deleteContractMutation = trpc.customers.contracts.delete.useMutation({
    onSuccess: () => { toast.success("Contract deleted"); refetchContracts(); },
    onError: (err) => toast.error(err.message),
  });

  async function handleUploadContract() {
    if (!contractForm.contractName) { toast.error("Contract name is required"); return; }
    if (!selectedFile) { toast.error("Please select a file to upload"); return; }
    // Read file as base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1]; // strip data:...;base64,
      uploadContractMutation.mutate({
        customerId: id,
        contractName: contractForm.contractName,
        contractType: contractForm.contractType || undefined,
        signedDate: contractForm.signedDate || undefined,
        effectiveDate: contractForm.effectiveDate || undefined,
        expiryDate: contractForm.expiryDate || undefined,
        fileBase64: base64,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/pdf",
      });
    };
    reader.readAsDataURL(selectedFile);
  }

  if (isLoading) {
    return (
      <Layout breadcrumb={["EG", "Customers", "Loading..."]}>
        <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>
      </Layout>
    );
  }

  if (!customer) {
    return (
      <Layout breadcrumb={["EG", "Customers", "Not Found"]}>
        <div className="p-6 text-center py-20">
          <p className="text-muted-foreground">{t("customers.detail.notFound")}</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation(`/customers?page=${fromPage}`)}>{t("customers.button.back")}</Button>
        </div>
      </Layout>
    );
  }

  const tabs = [
    { key: "info", label: t("customers.tabs.information") },
    { key: "pricing", label: t("customers.tabs.pricingWithCount", { count: pricing?.length ?? 0 }) },
    { key: "contacts", label: t("customers.tabs.contactsWithCount", { count: contacts?.length ?? 0 }) },
    { key: "contracts", label: t("customers.tabs.contractsWithCount", { count: contracts?.length ?? 0 }) },
    { key: "wallet", label: t("customers.tabs.wallet") },
    { key: "leavePolicy", label: t("customers.tabs.leavePolicyWithCount", { count: leavePolicies?.length ?? 0 }) },
  ] as const;

  // Available countries from config for multi-select
  const availableCountries = countriesData?.map(c => ({ code: c.countryCode, name: c.countryName })) || [];

  return (
    <Layout breadcrumb={["EG", "Customers", customer.companyName]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/customers?page=${fromPage}`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{customer.companyName}</h1>
              <Badge variant="outline" className={`min-w-[80px] justify-center capitalize ${statusColors[customer.status] || ""}`}>{customer.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {(customer as any).clientCode && <span className="font-mono mr-2">{(customer as any).clientCode}</span>}
              {customer.legalEntityName || ''}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              portalAccessMutation.mutate({ customerId: id });
            }}
            disabled={portalAccessMutation.isPending}
            title={(() => {
              const primary = contacts?.find((c: any) => c.isPrimary && c.isPortalActive);
              if (primary) return `${t("customers.contacts.loginAs") || "Login as"}: ${primary.contactName} (${primary.email})`;
              return t("customers.contacts.accessPortalHint") || "Login as primary contact";
            })()}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {portalAccessMutation.isPending ? (t("common.opening") || "Opening...") : (t("customers.contacts.accessPortal") || "Access Client Portal")}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button key={tab.key} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Info Tab ── */}
        {activeTab === "info" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={openEditDialog} disabled={!canManageClients} title={!canManageClients ? "Switch to EG-DIRECT context to edit customers." : undefined}>
                <Pencil className="w-4 h-4 mr-2" />Edit Customer
              </Button>
            </div>

            {/* Edit Customer Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{t("customers.button.edit")}</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("customers.form.company_name")}</Label>
                      <Input value={editForm.companyName || ""} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.form.legal_entity_name")}</Label>
                      <Input value={editForm.legalEntityName || ""} onChange={(e) => setEditForm({ ...editForm, legalEntityName: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{t("customers.form.registration_no")}</Label>
                      <Input value={editForm.registrationNumber || ""} onChange={(e) => setEditForm({ ...editForm, registrationNumber: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.form.industry")}</Label>
                      <Input value={editForm.industry || ""} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.form.country")}</Label>
                      <CountrySelect value={editForm.country || ""} onValueChange={(v) => setEditForm({ ...editForm, country: v })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("customers.form.address")}</Label>
                      <Input value={editForm.address || ""} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.form.city")}</Label>
                      <Input value={editForm.city || ""} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{t("common.state")}</Label>
                      <Input value={editForm.state || ""} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("common.postalCode")}</Label>
                      <Input value={editForm.postalCode || ""} onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.table.header.status")}</Label>
                      <Select value={editForm.status || "active"} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">{t("status.active")}</SelectItem>
                          <SelectItem value="inactive">{t("status.inactive")}</SelectItem>
                          <SelectItem value="prospect">{t("status.prospect")}</SelectItem>
                          <SelectItem value="churned">{t("status.churned")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{t("customers.form.primary_contact")}</Label>
                      <Input value={editForm.primaryContactName || ""} onChange={(e) => setEditForm({ ...editForm, primaryContactName: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.form.email")}</Label>
                      <Input type="email" value={editForm.primaryContactEmail || ""} onChange={(e) => setEditForm({ ...editForm, primaryContactEmail: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.form.phone")}</Label>
                      <Input value={editForm.primaryContactPhone || ""} onChange={(e) => setEditForm({ ...editForm, primaryContactPhone: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>{t("customers.form.payment_terms")}</Label>
                      <div className="flex gap-2">
                        <Select value={[7, 15, 30].includes(editForm.paymentTermDays ?? 30) ? (editForm.paymentTermDays ?? 30).toString() : "custom"} onValueChange={(v) => { if (v !== "custom") setEditForm({ ...editForm, paymentTermDays: parseInt(v) }); }}>
                          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="7">{t("customers.paymentTerms.net7")}</SelectItem>
                            <SelectItem value="15">{t("customers.paymentTerms.net15")}</SelectItem>
                            <SelectItem value="30">{t("customers.paymentTerms.net30")}</SelectItem>
                            <SelectItem value="custom">{t("common.custom")}</SelectItem>
                          </SelectContent>
                        </Select>
                        {![7, 15, 30].includes(editForm.paymentTermDays ?? 30) && (
                          <Input type="number" min={1} max={365} className="w-24" value={editForm.paymentTermDays ?? 30} onChange={(e) => setEditForm({ ...editForm, paymentTermDays: parseInt(e.target.value) || 0 })} placeholder="Days" />
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.form.settlement_currency")}</Label>
                      <CurrencySelect value={editForm.settlementCurrency || "USD"} onValueChange={(v) => setEditForm({ ...editForm, settlementCurrency: v })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.form.invoice_language")}</Label>
                      <Select value={editForm.language || "en"} onValueChange={(v) => setEditForm({ ...editForm, language: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">{t("common.english")}</SelectItem>
                          <SelectItem value="zh">中文</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("customers.form.billingEntity")}</Label>
                      <Select value={editForm.billingEntityId?.toString() || "none"} onValueChange={(v) => setEditForm({ ...editForm, billingEntityId: v === "none" ? undefined : parseInt(v) })}>
                        <SelectTrigger><SelectValue placeholder="Select billing entity" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("common.notAssigned")}</SelectItem>
                          {billingEntitiesForDetail?.map((be: any) => (
                            <SelectItem key={be.id} value={be.id.toString()}>{be.entityName} ({be.currency})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.form.deposit_multiplier")}</Label>
                      <Select value={(editForm.depositMultiplier || 2).toString()} onValueChange={(v) => setEditForm({ ...editForm, depositMultiplier: parseInt(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">{t("customers.depositMultiplier.one")}</SelectItem>
                          <SelectItem value="2">{t("customers.depositMultiplier.two")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("customers.form.notes")}</Label>
                    <Textarea value={editForm.notes || ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
                    <Button onClick={() => { if (!editForm.companyName?.trim()) { toast.error(t("customers.validation.companyNameRequired")); return; } updateCustomerMutation.mutate({ id, data: editForm }); }} disabled={updateCustomerMutation.isPending}>
                      {updateCustomerMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("customers.sections.companyDetails")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <InfoRow label="Company Name" value={customer.companyName} />
                <InfoRow label="Legal Entity" value={customer.legalEntityName} />
                <InfoRow label="Registration #" value={customer.registrationNumber} />
                <InfoRow label={t("customers.form.industry")} value={customer.industry} />
                <InfoRow label={t("customers.table.header.country")} value={countryName(customer.country)} />
                <InfoRow label={t("customers.form.address")} value={[customer.address, customer.city, customer.state, customer.postalCode].filter(Boolean).join(", ")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">{t("customers.sections.billingContact")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <InfoRow label="Payment Terms" value={t("customers.paymentTerms.netDays", { days: customer.paymentTermDays ?? 30 })} />
                <InfoRow label="Settlement Currency" value={customer.settlementCurrency} />
                <InfoRow label="Invoice Language" value={customer.language === "zh" ? "中文" : "English"} />
                <InfoRow label="Billing Entity" value={billingEntitiesForDetail?.find((be: any) => be.id === customer.billingEntityId)?.entityName || "Not assigned"} />
                <InfoRow label="Deposit Multiplier" value={`${customer.depositMultiplier || 2}× (${customer.depositMultiplier === 1 ? "1 month" : "2 months"})`} />
                <InfoRow label="Primary Contact" value={customer.primaryContactName} />
                <InfoRow label={t("customers.form.email")} value={customer.primaryContactEmail} icon={<Mail className="w-3.5 h-3.5" />} />
                <InfoRow label={t("customers.form.phone")} value={customer.primaryContactPhone} icon={<Phone className="w-3.5 h-3.5" />} />
              </CardContent>
            </Card>
            {customer.notes && (
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">{t("customers.form.notes")}</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{customer.notes}</p></CardContent>
              </Card>
            )}
            </div>
          </div>
        )}

        {/* ── Pricing Tab ── */}
        {activeTab === "pricing" && (
          <div className="space-y-6">
            {/* ── Section 1: AOR Service Fee (dedicated card) ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{t("customers.pricing.aorSectionTitle")}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">{t("customers.pricing.aorSectionHint")}</p>
                  </div>
                  <Dialog open={aorPricingOpen} onOpenChange={(open) => {
                    setAorPricingOpen(open);
                    if (open) {
                      setAorForm({
                        fixedPrice: activeAorPricing?.fixedPrice || "",
                        currency: activeAorPricing?.currency || "USD",
                        effectiveFrom: activeAorPricing?.effectiveFrom || formatDateISO(new Date()),
                      });
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant={activeAorPricing ? "outline" : "default"}>
                        {activeAorPricing ? <><Pencil className="w-3.5 h-3.5 mr-1.5" />{t("customers.pricing.aorEditPrice")}</> : <><Plus className="w-4 h-4 mr-2" />{t("customers.pricing.aorSetPrice")}</>}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm">
                      <DialogHeader><DialogTitle>{t("customers.pricing.aorSetPrice")}</DialogTitle></DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <Label>{t("customers.pricing.aorPriceLabel")} *</Label>
                          <Input type="number" step="0.01" value={aorForm.fixedPrice} onChange={(e) => setAorForm({ ...aorForm, fixedPrice: e.target.value })} placeholder="300.00" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>{t("common.currency")}</Label>
                            <CurrencySelect value={aorForm.currency} onValueChange={(v) => setAorForm({ ...aorForm, currency: v })} />
                          </div>
                          <div className="space-y-2">
                            <Label>{t("common.effectiveFrom")} *</Label>
                            <Input type="text" placeholder="YYYY-MM-DD" value={aorForm.effectiveFrom} onChange={(e) => setAorForm({ ...aorForm, effectiveFrom: e.target.value })} />
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                          <Button variant="outline" onClick={() => setAorPricingOpen(false)}>{t("common.cancel")}</Button>
                          <Button onClick={handleSaveAorPricing} disabled={createPricingMutation.isPending}>
                            {createPricingMutation.isPending ? "Saving..." : t("common.save")}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {activeAorPricing ? (
                  <div className="flex items-center gap-4 p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                    <div className="flex-1">
                      <p className="text-lg font-semibold font-mono">{activeAorPricing.currency} {activeAorPricing.fixedPrice}</p>
                      <p className="text-xs text-muted-foreground">{t("customers.pricing.aorPerContractorMonth")} · {t("common.effectiveFrom")}: {formatDate(activeAorPricing.effectiveFrom)}</p>
                    </div>
                    <Badge variant="default" className="text-xs">Active</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("Remove AOR pricing?")) deletePricingMutation.mutate({ id: activeAorPricing.id }); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">{t("customers.pricing.aorNotSet")}</p>
                )}
              </CardContent>
            </Card>

            {/* ── Section 2: EOR / Visa EOR Pricing ── */}
            <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">{t("customers.pricing.priorityTitle")}</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  {t("customers.pricing.priorityHint")}
                </p>
              </CardContent>
            </Card>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{t("customers.pricing.eorSectionTitle")}</h3>
              <Dialog open={pricingOpen} onOpenChange={(open) => { setPricingOpen(open); if (open) { setPricingMode("single"); setPricingForm({ pricingType: "country_specific", globalDiscountPercent: "", countryCode: "", selectedCountries: [], serviceType: "eor", fixedPrice: "", visaOneTimeFee: "", currency: "USD", effectiveFrom: formatDateISO(new Date()), effectiveTo: "" }); } }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="w-4 h-4 mr-2" />{t("customers.pricing.addPricing")}</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{t("customers.pricing.addPricing")} Rule</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>{t("customers.pricing.pricingType")} *</Label>
                      <Select value={pricingForm.pricingType} onValueChange={(v) => setPricingForm({ ...pricingForm, pricingType: v as any })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="global_discount">{t("customers.pricing.globalDiscount")}</SelectItem>
                          <SelectItem value="country_specific">{t("customers.pricing.countrySpecificFixedPrice")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {pricingForm.pricingType === "global_discount" ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>{t("customers.pricing.discountPercent")}</Label>
                          <Input type="number" step="0.01" min="0" max="100" value={pricingForm.globalDiscountPercent} onChange={(e) => setPricingForm({ ...pricingForm, globalDiscountPercent: e.target.value })} placeholder={t("customers.pricing.discountPlaceholder")} />
                          <p className="text-xs text-muted-foreground">{t("customers.pricing.discountHint")}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Single vs Batch mode toggle */}
                        <div className="flex gap-2">
                          <Button variant={pricingMode === "single" ? "default" : "outline"} size="sm" onClick={() => setPricingMode("single")}>{t("customers.pricing.singleCountry")}</Button>
                          <Button variant={pricingMode === "batch" ? "default" : "outline"} size="sm" onClick={() => setPricingMode("batch")}>{t("customers.pricing.multipleCountries")}</Button>
                        </div>

                        {pricingMode === "single" ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>{t("customers.form.country")}</Label>
                              <CountrySelect value={pricingForm.countryCode} onValueChange={(v) => setPricingForm({ ...pricingForm, countryCode: v })} />
                            </div>
                            <div className="space-y-2">
                              <Label>{t("employees.create.form.serviceType")} *</Label>
                              <Select value={pricingForm.serviceType} onValueChange={(v) => setPricingForm({ ...pricingForm, serviceType: v as any })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="eor">{t("employees.create.form.serviceType.eor")}</SelectItem>
                                  <SelectItem value="visa_eor">{t("employees.create.form.serviceType.visaEor")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <Label>{t("customers.pricing.selectCountries")}</Label>
                              <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[42px] bg-muted/30">
                                {pricingForm.selectedCountries.length === 0 && <span className="text-sm text-muted-foreground">{t("customers.pricing.noCountriesSelected")}</span>}
                                {pricingForm.selectedCountries.map(cc => {
                                  const name = availableCountries.find(c => c.code === cc)?.name || cc;
                                  return (
                                    <Badge key={cc} variant="secondary" className="cursor-pointer hover:bg-destructive/20" onClick={() => setPricingForm({ ...pricingForm, selectedCountries: pricingForm.selectedCountries.filter(c => c !== cc) })}>
                                      {name} <X className="w-3 h-3 ml-1" />
                                    </Badge>
                                  );
                                })}
                              </div>
                              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                                {availableCountries.filter(c => !pricingForm.selectedCountries.includes(c.code)).map(c => (
                                  <Badge key={c.code} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs" onClick={() => setPricingForm({ ...pricingForm, selectedCountries: [...pricingForm.selectedCountries, c.code] })}>
                                    + {c.name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>{t("employees.create.form.serviceType")} *</Label>
                              <Select value={pricingForm.serviceType} onValueChange={(v) => setPricingForm({ ...pricingForm, serviceType: v as any })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="eor">{t("employees.create.form.serviceType.eor")}</SelectItem>
                                  <SelectItem value="visa_eor">{t("employees.create.form.serviceType.visaEor")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>{t("customers.pricing.fixedPricePerEmployeePerMonth")} *</Label>
                            <Input type="number" step="0.01" value={pricingForm.fixedPrice} onChange={(e) => setPricingForm({ ...pricingForm, fixedPrice: e.target.value })} placeholder="500.00" />
                          </div>
                          {pricingForm.serviceType === "visa_eor" && (
                            <div className="space-y-2">
                              <Label>Visa One Time Fee</Label>
                              <Input type="number" step="0.01" value={pricingForm.visaOneTimeFee} onChange={(e) => setPricingForm({ ...pricingForm, visaOneTimeFee: e.target.value })} placeholder="1000.00" />
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label>{t("common.currency")}</Label>
                            <CurrencySelect value={pricingForm.currency} onValueChange={(v) => setPricingForm({ ...pricingForm, currency: v })} />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t("common.effectiveFrom")} *</Label>
                        <Input type="text" placeholder="YYYY-MM-DD" value={pricingForm.effectiveFrom} onChange={(e) => setPricingForm({ ...pricingForm, effectiveFrom: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("common.effectiveTo")}</Label>
                        <Input type="text" placeholder="YYYY-MM-DD" value={pricingForm.effectiveTo} onChange={(e) => setPricingForm({ ...pricingForm, effectiveTo: e.target.value })} />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="outline" onClick={() => setPricingOpen(false)}>{t("common.cancel")}</Button>
                      <Button onClick={handleSavePricing} disabled={createPricingMutation.isPending || batchCreatePricingMutation.isPending}>
                        {(createPricingMutation.isPending || batchCreatePricingMutation.isPending) ? "Saving..." : "Save Pricing"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* EOR/Visa EOR Pricing Table */}
            <Card>
              <CardContent className="p-0">
                {eorPricingList.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.type")}</TableHead>
                        <TableHead className="min-w-[120px]">{t("customers.table.header.country")}</TableHead>
                        <TableHead>{t("common.service")}</TableHead>
                        <TableHead>{t("customers.pricing.standardRate")}</TableHead>
                        <TableHead>{t("customers.pricing.customerPrice")}</TableHead>
                        <TableHead>{t("customers.pricing.visaSetupFee")}</TableHead>
                        <TableHead>{t("customers.pricing.effectivePeriod")}</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>{t("customers.table.header.status")}</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eorPricingList.map((p: any) => {
                        const stdRates = p.countryCode ? standardRatesMap[p.countryCode] : undefined;
                        const stdRate = stdRates && p.serviceType ? stdRates[p.serviceType as keyof typeof stdRates] : undefined;
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm capitalize">{p.pricingType?.replace("_", " ")}</TableCell>
                            <TableCell className="text-sm">{p.countryCode || "Global"}</TableCell>
                            <TableCell className="text-sm uppercase">{p.serviceType || "All"}</TableCell>
                            <TableCell className="text-sm font-mono text-muted-foreground">
                              {stdRate ? `${stdRates?.currency || "USD"} ${stdRate}/mo` : "—"}
                            </TableCell>
                            <TableCell className="text-sm font-mono font-medium">
                              {p.pricingType === "global_discount"
                                ? `${p.globalDiscountPercent}% discount`
                                : p.fixedPrice ? `${p.currency} ${p.fixedPrice}/mo` : "—"}
                            </TableCell>
                            <TableCell className="text-sm font-mono text-muted-foreground">
                              {p.serviceType === "visa_eor"
                                ? (p.visaOneTimeFee
                                  ? `${p.currency} ${p.visaOneTimeFee} (one-time)`
                                  : (p.countryCode && stdRates?.visaSetupFee ? `${stdRates?.currency || "USD"} ${stdRates.visaSetupFee} (one-time)` : "—"))
                                : "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                               {formatDate(p.effectiveFrom)}
                               {p.effectiveTo ? ` — ${formatDate(p.effectiveTo)}` : " — ongoing"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {(p as any).quotationNumber ? (
                                <a 
                                  href={`/quotations/${p.sourceQuotationId}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                >
                                  <FileText className="w-3 h-3" />
                                  {(p as any).quotationNumber}
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-xs">Manual</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs">{p.isActive ? "Active" : "Inactive"}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("Delete this pricing rule?")) deletePricingMutation.mutate({ id: p.id }); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <DollarSign className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("customers.empty_state.no_pricing")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("customers.pricing.emptyHint")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Contacts Tab ── */}
        {activeTab === "contacts" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={contactOpen} onOpenChange={setContactOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><UserPlus className="w-4 h-4 mr-2" />{t("customers.button.add_contact")}</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>{t("customers.button.add_contact")}</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>{t("common.name")} *</Label>
                      <Input value={contactForm.contactName} onChange={(e) => setContactForm({ ...contactForm, contactName: e.target.value })} placeholder="Jane Smith" />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("common.email")} *</Label>
                      <Input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} placeholder="jane@company.com" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t("customers.form.phone")}</Label>
                        <Input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="+65 9123 4567" />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("customers.contacts.jobTitle") || "Job Title"}</Label>
                        <Select value={contactForm.role || "none"} onValueChange={(v) => setContactForm({ ...contactForm, role: v === "none" ? "" : v })}>
                          <SelectTrigger><SelectValue placeholder="Select title" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t("customers.contacts.noSpecificRole")}</SelectItem>
                            <SelectItem value="HR Manager">{t("customers.contacts.role.hrManager")}</SelectItem>
                            <SelectItem value="Finance Manager">{t("customers.contacts.role.financeManager")}</SelectItem>
                            <SelectItem value="CEO">{t("customers.contacts.role.ceo")}</SelectItem>
                            <SelectItem value="COO">{t("customers.contacts.role.coo")}</SelectItem>
                            <SelectItem value="Legal">{t("customers.contacts.role.legal")}</SelectItem>
                            <SelectItem value="Other">{t("common.other")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={contactForm.isPrimary} onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })} className="rounded" />
                        Primary Contact
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={contactForm.hasPortalAccess} onChange={(e) => setContactForm({ ...contactForm, hasPortalAccess: e.target.checked })} className="rounded" />
                        Portal Access
                      </label>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="outline" onClick={() => setContactOpen(false)}>{t("common.cancel")}</Button>
                      <Button onClick={() => { if (!contactForm.contactName || !contactForm.email) { toast.error("Name and email are required"); return; } createContactMutation.mutate({ customerId: id, ...contactForm }); }} disabled={createContactMutation.isPending}>
                        {createContactMutation.isPending ? "Saving..." : "Save Contact"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <Card>
              <CardContent className="p-0">
                {contacts && contacts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.name")}</TableHead>
                        <TableHead>{t("customers.form.email")}</TableHead>
                        <TableHead>{t("customers.form.phone")}</TableHead>
                        <TableHead>{t("customers.contacts.jobTitle") || "Job Title"}</TableHead>
                        <TableHead>{t("customers.contacts.portalRole") || "Portal Role"}</TableHead>
                        <TableHead>{t("customers.contacts.portalStatus")}</TableHead>
                        <TableHead className="text-right">{t("common.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm font-medium">
                            <div className="flex items-center gap-1">
                              {c.contactName}
                              {c.isPrimary && <Badge className="text-xs ml-1" variant="default">{t("customers.contacts.primary")}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{c.email}</TableCell>
                          <TableCell className="text-sm">{c.phone || "\u2014"}</TableCell>
                          <TableCell className="text-sm">{c.role || "\u2014"}</TableCell>
                          <TableCell className="text-sm">
                            {(c as any).isPortalActive || c.hasPortalAccess ? (
                              <Badge className="text-xs" variant="outline">{(c as any).portalRole || "viewer"}</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">\u2014</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 items-center">
                              {(c as any).isPortalActive ? (
                                <Badge className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200" variant="outline">
                                  <ShieldCheck className="w-3 h-3 mr-1" />Active
                                </Badge>
                              ) : c.hasPortalAccess ? (
                                <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200" variant="outline">
                                  <Send className="w-3 h-3 mr-1" />Invited
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">{t("customers.contacts.noAccess")}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end items-center">
                              {/* Edit contact info */}
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditContactDialog(c)} title={t("common.edit") || "Edit"}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              {/* Invite (only when no portal access) */}
                              {!(c as any).isPortalActive && !c.hasPortalAccess && (
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openInviteDialog(c.id)}>
                                  <Send className="w-3 h-3 mr-1" />{t("customers.contacts.inviteToPortal") || "Invite"}
                                </Button>
                              )}
                              {c.hasPortalAccess && !(c as any).isPortalActive && (
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openInviteDialog(c.id)}>
                                  <Send className="w-3 h-3 mr-1" />{t("customers.contacts.resendInvite") || "Resend"}
                                </Button>
                              )}
                              {/* Login As (inline for active portal users) */}
                              {(c as any).isPortalActive && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleLoginAs(c.id)} title={t("customers.contacts.loginAs") || "Login As"}>
                                  <LogIn className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {/* More actions dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {(c as any).isPortalActive && (
                                    <>
                                      <DropdownMenuItem onClick={() => openPermDialog(c)}>
                                        <Shield className="w-3.5 h-3.5 mr-2" />{t("customers.contacts.changePermission") || "Change Permission"}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openResetPwDialog(c.id, c.contactName)}>
                                        <KeyRound className="w-3.5 h-3.5 mr-2" />{t("customers.contacts.resetPassword") || "Reset Password"}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm(t("customers.contacts.revokeConfirm") || "Revoke portal access for this contact?")) revokeAccessMutation.mutate({ contactId: c.id }); }}>
                                        <ShieldX className="w-3.5 h-3.5 mr-2" />{t("customers.contacts.revoke") || "Revoke Access"}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                    </>
                                  )}
                                  {!c.isPrimary && (
                                    <DropdownMenuItem onClick={() => {
                                      if (confirm(t("customers.contacts.setPrimaryConfirm") || `Set ${c.contactName} as the primary contact?`))
                                        updateContactMutation.mutate({ id: c.id, customerId: id, data: { isPrimary: true } });
                                    }}>
                                      <ShieldCheck className="w-3.5 h-3.5 mr-2" />{t("customers.contacts.setPrimary") || "Set Primary"}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm(t("customers.contacts.deleteConfirm") || "Delete this contact?")) deleteContactMutation.mutate({ id: c.id }); }}>
                                    <Trash2 className="w-3.5 h-3.5 mr-2" />{t("common.delete") || "Delete"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("customers.contacts.empty")}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Portal Invite Dialog ── */}
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {inviteResult ? "Invitation Sent" : "Invite to Client Portal"}
                  </DialogTitle>
                </DialogHeader>
                {!inviteResult ? (
                  <div className="space-y-4 mt-2">
                    <p className="text-sm text-muted-foreground">
                      Generate an invite link for this contact to access the Client Portal. They will set a password and can then log in to view employees, invoices, and manage leave requests.
                    </p>
                    <div className="space-y-2">
                      <Label>{t("customers.contacts.portalRole")}</Label>
                      <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">{t("customers.contacts.portalRoleAdmin")}</SelectItem>
                          <SelectItem value="hr_manager">{t("customers.contacts.portalRoleHr")}</SelectItem>
                          <SelectItem value="finance">{t("customers.contacts.portalRoleFinance")}</SelectItem>
                          <SelectItem value="viewer">{t("customers.contacts.portalRoleViewer")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>{t("common.cancel")}</Button>
                      <Button onClick={handleGenerateInvite} disabled={generateInviteMutation.isPending}>
                        {generateInviteMutation.isPending ? "Generating..." : "Generate Invite Link"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 mt-2">
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                      <p className="text-sm"><span className="font-medium">{t("customers.invite.contact")}:</span> {inviteResult.contactName}</p>
                      <p className="text-sm"><span className="font-medium">{t("common.email")}:</span> {inviteResult.email}</p>
                      <p className="text-sm"><span className="font-medium">{t("common.role")}:</span> {inviteRole}</p>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.invite.link")}</Label>
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={getInviteLink(inviteResult.token)}
                          className="text-xs font-mono"
                        />
                        <Button variant="outline" size="icon" onClick={copyInviteLink} className="shrink-0">
                          {copiedInvite ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        An invitation email has been sent. You can also share this link as a backup. It expires in 72 hours.
                      </p>
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button onClick={() => setInviteDialogOpen(false)}>{t("common.done")}</Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* ── Reset Password Dialog ── */}
            <Dialog open={resetPwOpen} onOpenChange={setResetPwOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>{t("customers.contacts.resetPortalPassword")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <p className="text-sm text-muted-foreground">
                    Set a new password for <span className="font-medium text-foreground">{resetPwContactName}</span>.
                    The user will need to use this new password to log in.
                  </p>
                  <div className="space-y-2">
                    <Label>{t("customers.contacts.newPassword")}</Label>
                    <Input
                      type="password"
                      value={resetPwValue}
                      onChange={(e) => setResetPwValue(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="h-10"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={() => setResetPwOpen(false)}>{t("common.cancel")}</Button>
                    <Button
                      onClick={() => {
                        if (!resetPwContactId || resetPwValue.length < 8) {
                          toast.error("Password must be at least 8 characters");
                          return;
                        }
                        resetPasswordMutation.mutate({ contactId: resetPwContactId, newPassword: resetPwValue });
                      }}
                      disabled={resetPasswordMutation.isPending || resetPwValue.length < 8}
                    >
                      {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* ── Edit Contact Dialog ── */}
            <Dialog open={editContactOpen} onOpenChange={setEditContactOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{t("customers.contacts.editContact") || "Edit Contact"}</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>{t("common.name")} *</Label>
                    <Input value={editContactForm.contactName} onChange={(e) => setEditContactForm({ ...editContactForm, contactName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("common.email")} *</Label>
                    <Input type="email" value={editContactForm.email} onChange={(e) => setEditContactForm({ ...editContactForm, email: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("customers.form.phone")}</Label>
                      <Input value={editContactForm.phone} onChange={(e) => setEditContactForm({ ...editContactForm, phone: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.contacts.jobTitle") || "Job Title"}</Label>
                      <Select value={editContactForm.role || "none"} onValueChange={(v) => setEditContactForm({ ...editContactForm, role: v === "none" ? "" : v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("customers.contacts.noSpecificRole")}</SelectItem>
                          <SelectItem value="HR Manager">{t("customers.contacts.role.hrManager")}</SelectItem>
                          <SelectItem value="Finance Manager">{t("customers.contacts.role.financeManager")}</SelectItem>
                          <SelectItem value="CEO">{t("customers.contacts.role.ceo")}</SelectItem>
                          <SelectItem value="COO">{t("customers.contacts.role.coo")}</SelectItem>
                          <SelectItem value="Legal">{t("customers.contacts.role.legal")}</SelectItem>
                          <SelectItem value="Other">{t("common.other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={() => setEditContactOpen(false)}>{t("common.cancel")}</Button>
                    <Button onClick={handleSaveEditContact} disabled={updateContactMutation.isPending}>
                      {updateContactMutation.isPending ? (t("common.saving") || "Saving...") : (t("common.save") || "Save")}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* ── Change Permission Dialog ── */}
            <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>{t("customers.contacts.changePermission") || "Change Portal Permission"}</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-2">
                  <p className="text-sm text-muted-foreground">
                    {t("customers.contacts.changePermissionDesc") || `Update the portal permission for`} <span className="font-medium text-foreground">{permContactName}</span>
                  </p>
                  <div className="space-y-2">
                    <Label>{t("customers.contacts.portalRole") || "Portal Role"}</Label>
                    <Select value={permRole} onValueChange={(v: any) => setPermRole(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{t("customers.contacts.portalRoleAdmin")}</SelectItem>
                        <SelectItem value="hr_manager">{t("customers.contacts.portalRoleHr")}</SelectItem>
                        <SelectItem value="finance">{t("customers.contacts.portalRoleFinance")}</SelectItem>
                        <SelectItem value="viewer">{t("customers.contacts.portalRoleViewer")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={() => setPermDialogOpen(false)}>{t("common.cancel")}</Button>
                    <Button onClick={handleSavePermission} disabled={updateContactMutation.isPending}>
                      {updateContactMutation.isPending ? (t("common.saving") || "Saving...") : (t("common.save") || "Save")}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* ── Contracts Tab ── */}
        {activeTab === "contracts" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={contractOpen} onOpenChange={(open) => { setContractOpen(open); if (!open) { setSelectedFile(null); } }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Upload className="w-4 h-4 mr-2" />{t("customers.contracts.uploadContract")}</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>{t("customers.contracts.uploadContract")}</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>{t("customers.contracts.contractName")} *</Label>
                      <Input value={contractForm.contractName} onChange={(e) => setContractForm({ ...contractForm, contractName: e.target.value })} placeholder="Service Agreement 2026" />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("customers.contracts.contractType")}</Label>
                      <Select value={contractForm.contractType} onValueChange={(v) => setContractForm({ ...contractForm, contractType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="service_agreement">{t("customers.contracts.type.serviceAgreement")}</SelectItem>
                          <SelectItem value="nda">{t("customers.contracts.type.nda")}</SelectItem>
                          <SelectItem value="amendment">{t("customers.contracts.type.amendment")}</SelectItem>
                          <SelectItem value="addendum">{t("customers.contracts.type.addendum")}</SelectItem>
                          <SelectItem value="other">{t("common.other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("common.file")} *</Label>
                      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]); }} />
                      <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="w-4 h-4 mr-2" />Choose File
                        </Button>
                        {selectedFile && <span className="text-sm text-muted-foreground max-w-[250px] truncate inline-block align-middle" title={selectedFile.name}>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>{t("customers.contracts.signedDate")}</Label>
                        <DatePicker value={contractForm.signedDate} onChange={(d) => setContractForm({ ...contractForm, signedDate: d })} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("customers.contracts.effectiveDate")}</Label>
                        <DatePicker value={contractForm.effectiveDate} onChange={(d) => setContractForm({ ...contractForm, effectiveDate: d })} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("customers.contracts.expiryDate")}</Label>
                        <DatePicker value={contractForm.expiryDate} onChange={(d) => setContractForm({ ...contractForm, expiryDate: d })} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="outline" onClick={() => setContractOpen(false)}>{t("common.cancel")}</Button>
                      <Button onClick={handleUploadContract} disabled={uploadContractMutation.isPending}>
                        {uploadContractMutation.isPending ? "Uploading..." : "Upload Contract"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <Card>
              <CardContent className="p-0">
                {contracts && contracts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("customers.contracts.contractName")}</TableHead>
                        <TableHead>{t("common.type")}</TableHead>
                        <TableHead>{t("customers.contracts.signedDate")}</TableHead>
                        <TableHead>{t("customers.contracts.effective")}</TableHead>
                        <TableHead>{t("customers.contracts.expiry")}</TableHead>
                        <TableHead>{t("customers.table.header.status")}</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contracts.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm font-medium">{c.contractName}</TableCell>
                          <TableCell className="text-sm capitalize">{c.contractType?.replace("_", " ") || "—"}</TableCell>
                          <TableCell className="text-sm">{formatDate(c.signedDate)}</TableCell>
                          <TableCell className="text-sm">{formatDate(c.effectiveDate)}</TableCell>
                          <TableCell className="text-sm">{formatDate(c.expiryDate)}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === "signed" ? "default" : "secondary"} className="text-xs capitalize">{c.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {c.fileUrl && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(c.fileUrl!, "_blank")}>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("Delete this contract?")) deleteContractMutation.mutate({ id: c.id }); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("customers.empty_state.no_contracts")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("customers.contracts.emptyHint")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Leave Policy Tab ── */}
        {activeTab === "leavePolicy" && (
          <LeavePolicyTab customerId={id} customer={customer} leavePolicies={leavePolicies ?? []} refetch={refetchLeavePolicies} />
        )}

        {/* ── Wallet Tab ── */}
        {activeTab === "wallet" && (
          <WalletTab customerId={id} currency={customer.settlementCurrency || "USD"} />
        )}
      </div>
    </Layout>
  );
}

/* ========== Leave Policy Tab Component ========== */
function LeavePolicyTab({ customerId, customer, leavePolicies, refetch }: {
  customerId: number;
  customer: any;
  leavePolicies: any[];
  refetch: () => void;
}) {
  const { t } = useI18n();
  const [initCountry, setInitCountry] = useState("");
  const [editingCountry, setEditingCountry] = useState<string | null>(null);
  const [editForms, setEditForms] = useState<Record<number, { annualEntitlement: number; expiryRule: "year_end" | "anniversary" | "no_expiry"; carryOverDays: number }>>({});
  const [savingCountry, setSavingCountry] = useState(false);

  const { data: countriesData } = trpc.countries.list.useQuery();
  const initMutation = trpc.customerLeavePolicies.initializeFromStatutory.useMutation({
    onSuccess: (result) => {
      toast.success(`Initialized ${result.created} leave policies from statutory defaults`);
      refetch();
      setInitCountry("");
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.customerLeavePolicies.update.useMutation();
  const deleteMutation = trpc.customerLeavePolicies.delete.useMutation({
    onSuccess: () => {
      toast.success(t("leave.policy.deleted") || "Leave policy deleted");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Start editing all policies for a country
  const startEditCountry = (countryCode: string, policies: any[]) => {
    const forms: Record<number, { annualEntitlement: number; expiryRule: "year_end" | "anniversary" | "no_expiry"; carryOverDays: number }> = {};
    policies.forEach((p) => {
      forms[p.id] = {
        annualEntitlement: p.annualEntitlement,
        expiryRule: p.expiryRule,
        carryOverDays: p.carryOverDays,
      };
    });
    setEditForms(forms);
    setEditingCountry(countryCode);
  };

  // Save all policies for the editing country
  const saveCountryPolicies = async () => {
    setSavingCountry(true);
    try {
      const promises = Object.entries(editForms).map(([idStr, data]) =>
        updateMutation.mutateAsync({ id: parseInt(idStr), data })
      );
      await Promise.all(promises);
      toast.success(t("leave.policy.countryUpdated") || "Leave policies updated");
      setEditingCountry(null);
      setEditForms({});
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to update policies");
    } finally {
      setSavingCountry(false);
    }
  };

  // Group policies by country
  const policiesByCountry = leavePolicies.reduce((acc: Record<string, any[]>, p) => {
    if (!acc[p.countryCode]) acc[p.countryCode] = [];
    acc[p.countryCode].push(p);
    return acc;
  }, {});

  // Countries that don't have policies yet
  const countriesWithPolicies = new Set(Object.keys(policiesByCountry));
  const availableCountries = countriesData?.filter(c => !countriesWithPolicies.has(c.countryCode)) ?? [];

  const expiryRuleLabels: Record<string, string> = {
    year_end: t("leave.expiryRule.yearEnd"),
    anniversary: t("leave.expiryRule.anniversary"),
    no_expiry: t("leave.expiryRule.noExpiry"),
  };

  return (
    <div className="space-y-4">
      {/* Initialize for new country */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("employees.leave.initializePolicy")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            {t("customers.leave.initialize_hint")}
          </p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">{t("customers.table.header.country")}</Label>
              <Select value={initCountry} onValueChange={setInitCountry}>
                <SelectTrigger><SelectValue placeholder={t("customers.leave.select_country_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {availableCountries.map(c => (
                    <SelectItem key={c.countryCode} value={c.countryCode}>{c.countryName} ({c.countryCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!initCountry || initMutation.isPending}
              onClick={() => initMutation.mutate({ customerId, countryCode: initCountry })}
            >
              <Plus className="w-4 h-4 mr-1" />
              {t("customers.leave.initialize_button")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Policies by country */}
      {Object.entries(policiesByCountry).map(([countryCode, policies]) => {
        const isEditing = editingCountry === countryCode;
        return (
          <Card key={countryCode}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t("customers.leave.countryPolicies", { country: countryCode })}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{t("customers.leave.typesCount", { count: policies.length })}</Badge>
                  {isEditing ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="default" className="h-7 text-xs" disabled={savingCountry} onClick={saveCountryPolicies}>
                        {savingCountry ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        {t("common.save")}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingCountry(null); setEditForms({}); }}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => startEditCountry(countryCode, policies)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> {t("common.edit") || "Edit"}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("leave.table.header.leaveType")}</TableHead>
                    <TableHead>{t("leave.table.header.annualEntitlement")}</TableHead>
                    <TableHead>{t("leave.table.header.expiryRule")}</TableHead>
                    <TableHead>{t("leave.table.header.carryOverDays")}</TableHead>
                    <TableHead className="w-16">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.map((policy: any) => {
                    const form = editForms[policy.id];
                    return (
                      <TableRow key={policy.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{policy.leaveTypeName}</span>
                            {policy.isPaid === false && <Badge variant="outline" className="text-xs">{t("leave.badge.unpaid")}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isEditing && form ? (
                            <Input
                              type="number"
                              min={0}
                              className="w-20 h-8"
                              value={form.annualEntitlement}
                              onChange={(e) => setEditForms({ ...editForms, [policy.id]: { ...form, annualEntitlement: parseInt(e.target.value) || 0 } })}
                            />
                          ) : (
                            <span className="text-sm">{policy.annualEntitlement} {t("common.days")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing && form ? (
                            <Select value={form.expiryRule} onValueChange={(v) => setEditForms({ ...editForms, [policy.id]: { ...form, expiryRule: v as "year_end" | "anniversary" | "no_expiry" } })}>
                              <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="year_end">{t("leave.expiryRule.yearEnd")}</SelectItem>
                                <SelectItem value="anniversary">{t("leave.expiryRule.anniversary")}</SelectItem>
                                <SelectItem value="no_expiry">{t("leave.expiryRule.noExpiry")}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm">{expiryRuleLabels[policy.expiryRule] || policy.expiryRule}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing && form ? (
                            <Input
                              type="number"
                              min={0}
                              className="w-20 h-8"
                              value={form.carryOverDays}
                              onChange={(e) => setEditForms({ ...editForms, [policy.id]: { ...form, carryOverDays: parseInt(e.target.value) || 0 } })}
                            />
                          ) : (
                            <span className="text-sm">{policy.carryOverDays > 0 ? `${policy.carryOverDays} ${t("common.days")}` : t("common.none")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => {
                            if (confirm(t("leave.policy.deleteConfirm") || "Delete this leave policy?")) deleteMutation.mutate({ id: policy.id });
                          }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      {leavePolicies.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("employees.leave.empty")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("employees.leave.emptyHint")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WalletTab({ customerId, currency }: { customerId: number; currency: string }) {
  const { t } = useI18n();
  const utils = trpc.useContext();
  const [walletTab, setWalletTab] = useState<"operating" | "deposit">("operating");

  // ── Operating Wallet Data ──
  const { data: wallet, isLoading: isWalletLoading } = trpc.wallet.get.useQuery({ customerId, currency });
  const { data: transactions, isLoading: isTxLoading } = trpc.wallet.listTransactions.useQuery(
    { walletId: wallet?.id || 0 },
    { enabled: !!wallet }
  );

  // ── Frozen Wallet Data ──
  const { data: frozenWallet, isLoading: isFrozenLoading } = trpc.wallet.getFrozen.useQuery({ customerId, currency });
  const { data: frozenTransactions, isLoading: isFrozenTxLoading } = trpc.wallet.listFrozenTransactions.useQuery(
    { walletId: frozenWallet?.id || 0 },
    { enabled: !!frozenWallet }
  );

  // ── Mutations ──
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ amount: "", direction: "credit" as "credit" | "debit", description: "", internalNote: "" });

  const adjustMutation = trpc.wallet.manualAdjustment.useMutation({
    onSuccess: () => {
      toast.success("Wallet adjustment successful");
      setAdjustOpen(false);
      setAdjustForm({ amount: "", direction: "credit", description: "", internalNote: "" });
      utils.wallet.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [frozenAdjustOpen, setFrozenAdjustOpen] = useState(false);
  const [frozenAdjustForm, setFrozenAdjustForm] = useState({ amount: "", direction: "credit" as "credit" | "debit", description: "", internalNote: "" });

  const frozenAdjustMutation = trpc.wallet.manualFrozenAdjustment.useMutation({
    onSuccess: () => {
      toast.success("Security deposit adjustment successful");
      setFrozenAdjustOpen(false);
      setFrozenAdjustForm({ amount: "", direction: "credit", description: "", internalNote: "" });
      utils.wallet.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseForm, setReleaseForm] = useState({ amount: "", reason: "" });

  const releaseMutation = trpc.wallet.releaseFrozen.useMutation({
    onSuccess: () => {
      toast.success("Deposit released to operating account");
      setReleaseOpen(false);
      setReleaseForm({ amount: "", reason: "" });
      utils.wallet.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAdjust = () => {
    if (!adjustForm.amount || !adjustForm.description) return;
    adjustMutation.mutate({
      customerId,
      currency,
      amount: adjustForm.amount,
      direction: adjustForm.direction,
      description: adjustForm.description,
      internalNote: adjustForm.internalNote,
    });
  };

  const handleFrozenAdjust = () => {
    if (!frozenAdjustForm.amount || !frozenAdjustForm.description) return;
    frozenAdjustMutation.mutate({
      customerId,
      currency,
      amount: frozenAdjustForm.amount,
      direction: frozenAdjustForm.direction,
      description: frozenAdjustForm.description,
      internalNote: frozenAdjustForm.internalNote,
    });
  };

  const handleRelease = () => {
    if (!releaseForm.amount || !releaseForm.reason) return;
    releaseMutation.mutate({
      customerId,
      currency,
      amount: releaseForm.amount,
      reason: releaseForm.reason,
    });
  };

  if (isWalletLoading || isFrozenLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      {/* Wallet Type Tabs */}
      <div className="flex border-b border-border w-full">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${walletTab === "operating" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setWalletTab("operating")}
        >
          Operating Account
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${walletTab === "deposit" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setWalletTab("deposit")}
        >
          Security Deposit
        </button>
      </div>

      {walletTab === "operating" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-left-2 duration-300">
          <Card className="md:col-span-1 bg-primary/5 border-primary/20 h-fit">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Operating Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight text-primary">
                {formatCurrency(currency, wallet?.balance || "0")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Available for automatic invoice deduction
              </p>
              <div className="mt-4">
                <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full">
                      Adjust Balance
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Manual Wallet Adjustment</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Direction</Label>
                          <Select
                            value={adjustForm.direction}
                            onValueChange={(v: "credit" | "debit") => setAdjustForm({ ...adjustForm, direction: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="credit">Credit (Add Funds)</SelectItem>
                              <SelectItem value="debit">Debit (Deduct Funds)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Amount ({currency})</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={adjustForm.amount}
                            onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Description (Visible to Client)</Label>
                        <Input
                          placeholder="e.g. Refund adjustment"
                          value={adjustForm.description}
                          onChange={(e) => setAdjustForm({ ...adjustForm, description: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Internal Note (Optional)</Label>
                        <Textarea
                          placeholder="Reason for adjustment..."
                          value={adjustForm.internalNote}
                          onChange={(e) => setAdjustForm({ ...adjustForm, internalNote: e.target.value })}
                        />
                      </div>
                      <Button 
                        className="w-full" 
                        onClick={handleAdjust} 
                        disabled={adjustMutation.isPending || !adjustForm.amount || !adjustForm.description}
                      >
                        {adjustMutation.isPending ? "Processing..." : "Confirm Adjustment"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Transaction History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isTxLoading ? (
                <div className="p-6 space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !transactions || transactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No transactions found</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateISO(tx.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize font-normal">
                            {tx.type.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[300px]" title={tx.description || ""}>
                          {tx.description}
                        </TableCell>
                        <TableCell className={`text-sm text-right font-medium ${tx.direction === "credit" ? "text-emerald-600" : "text-red-600"}`}>
                          {tx.direction === "credit" ? "+" : "-"}{formatCurrency(currency, tx.amount)}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {formatCurrency(currency, tx.balanceAfter)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {walletTab === "deposit" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-2 duration-300">
          <Card className="md:col-span-1 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 h-fit">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Security Deposit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight text-amber-900 dark:text-amber-300">
                {formatCurrency(currency, frozenWallet?.balance || "0")}
              </div>
              <p className="text-xs text-amber-700/80 dark:text-amber-500/80 mt-1">
                Held as security deposit. Not available for automatic deduction.
              </p>
              <div className="mt-4 space-y-2">
                <Dialog open={releaseOpen} onOpenChange={setReleaseOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white" size="sm">
                      Release to Operating
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Release Deposit</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <p className="text-sm text-muted-foreground">
                        This will transfer funds from the Security Deposit (Frozen) wallet to the Operating Account wallet.
                      </p>
                      <div className="space-y-2">
                        <Label>Amount ({currency})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={releaseForm.amount}
                          onChange={(e) => setReleaseForm({ ...releaseForm, amount: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">Max available: {frozenWallet?.balance}</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Reason</Label>
                        <Textarea
                          placeholder="e.g. Employee termination, contract end"
                          value={releaseForm.reason}
                          onChange={(e) => setReleaseForm({ ...releaseForm, reason: e.target.value })}
                        />
                      </div>
                      <Button 
                        className="w-full" 
                        onClick={handleRelease} 
                        disabled={releaseMutation.isPending || !releaseForm.amount || !releaseForm.reason}
                      >
                        {releaseMutation.isPending ? "Processing..." : "Confirm Release"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={frozenAdjustOpen} onOpenChange={setFrozenAdjustOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full border-amber-200 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/40">
                      Adjust Deposit
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adjust Security Deposit</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Direction</Label>
                          <Select
                            value={frozenAdjustForm.direction}
                            onValueChange={(v: "credit" | "debit") => setFrozenAdjustForm({ ...frozenAdjustForm, direction: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="credit">Credit (Add Funds)</SelectItem>
                              <SelectItem value="debit">Debit (Deduct Funds)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Amount ({currency})</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={frozenAdjustForm.amount}
                            onChange={(e) => setFrozenAdjustForm({ ...frozenAdjustForm, amount: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input
                          placeholder="e.g. Initial deposit"
                          value={frozenAdjustForm.description}
                          onChange={(e) => setFrozenAdjustForm({ ...frozenAdjustForm, description: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Internal Note (Optional)</Label>
                        <Textarea
                          placeholder="Internal reference..."
                          value={frozenAdjustForm.internalNote}
                          onChange={(e) => setFrozenAdjustForm({ ...frozenAdjustForm, internalNote: e.target.value })}
                        />
                      </div>
                      <Button 
                        className="w-full" 
                        onClick={handleFrozenAdjust} 
                        disabled={frozenAdjustMutation.isPending || !frozenAdjustForm.amount || !frozenAdjustForm.description}
                      >
                        {frozenAdjustMutation.isPending ? "Processing..." : "Confirm Adjustment"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Deposit History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isFrozenTxLoading ? (
                <div className="p-6 space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !frozenTransactions || frozenTransactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No deposit transactions found</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {frozenTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateISO(tx.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize font-normal border-amber-200 text-amber-700 bg-amber-50">
                            {tx.type.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[300px]" title={tx.description || ""}>
                          {tx.description}
                        </TableCell>
                        <TableCell className={`text-sm text-right font-medium ${tx.direction === "credit" ? "text-emerald-600" : "text-red-600"}`}>
                          {tx.direction === "credit" ? "+" : "-"}{formatCurrency(currency, tx.amount)}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {formatCurrency(currency, tx.balanceAfter)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string, value?: string | number | null, icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-muted-foreground w-36 flex-shrink-0 pt-0.5">{label}</span>
      <div className="flex items-center gap-1.5 text-sm">
        {icon}
        <span>{value || "—"}</span>
      </div>
    </div>
  );
}

export default function Customers() {
  const [matchDetail, params] = useRoute("/customers/:id");
  if (matchDetail && params?.id) {
    const id = parseInt(params.id, 10);
    if (!isNaN(id)) return <CustomerDetail id={id} />;
  }
  return <CustomerList />;
}
