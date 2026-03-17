/**
 * EG Admin — Vendor Management
 * List + Detail view for managing external service providers
 */
import Layout from "@/components/Layout";
import CurrencySelect from "@/components/CurrencySelect";
import { BankDetailsForm, BankDetails } from "@/components/forms/BankDetailsForm";
import { formatDate, formatAmount, countryName } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Truck, Plus, Search, ArrowLeft, Mail, Phone, Globe, ChevronRight,
  Pencil, Building2, MapPin, CreditCard, FileText, Hash,
} from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
const statusColors: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  inactive: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const vendorTypeColors: Record<string, string> = {
  client_related: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  operational: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

const vendorTypeLabels: Record<string, string> = {
  client_related: "Client Related",
  operational: "Operational",
};

const serviceTypeOptions = [
  "Payroll Processing",
  "Social Contributions",
  "Tax Filing",
  "Legal & Compliance",
  "Visa & Immigration",
  "HR Advisory",
  "IT Services",
  "Insurance",
  "Consulting",
  "Equipment Procurement",
  "Office & Facilities",
  "Other",
];

const acronyms = new Set(["hr", "it"]);
function formatServiceType(raw: string | null | undefined): string {
  if (!raw) return "—";
  return raw.split("_").map(w => acronyms.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/* ========== Vendor List ========== */
function VendorList() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [, setLocation] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, refetch } = trpc.vendors.list.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    vendorType: typeFilter !== "all" ? typeFilter : undefined,
    limit: 100,
  });

  const createMutation = trpc.vendors.create.useMutation({
    onSuccess: () => {
      toast.success(t("vendors.toast.create.success"));
      setCreateOpen(false);
      refetch();
      setFormData(defaultForm);
    },
    onError: (err) => toast.error(err.message),
  });

  const defaultForm = {
    name: "", legalName: "", contactName: "", contactEmail: "", contactPhone: "",
    country: "", address: "", city: "", state: "", postalCode: "",
    serviceType: "", currency: "USD", bankDetails: {} as BankDetails, taxId: "",
    paymentTermDays: 30, vendorType: "client_related" as const, status: "active" as const, notes: "",
  };
  const [formData, setFormData] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  function validateAndCreate() {
    const errors: Record<string, boolean> = {};
    if (!formData.name.trim()) errors.name = true;
    if (!formData.country.trim()) errors.country = true;
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error(t("vendors.toast.create.error"));
      return;
    }
    setFormErrors({});
    createMutation.mutate({
      ...formData,
      bankDetails: JSON.stringify(formData.bankDetails),
    });
  }

  return (
    <Layout breadcrumb={["EG", "Vendors"]}>
      <div className="p-6 space-y-6 page-enter">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("vendors.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("vendors.description")}</p>
          </div>
          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setFormErrors({}); }}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />{t("vendors.list.add_button")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("vendors.create.title")}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2">
                  <Label className={formErrors.name ? "text-destructive" : ""}>{t("vendors.form.company_name.label")}</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Global Payroll Partner Inc." className={formErrors.name ? "border-destructive" : ""} />
                </div>
                <div>
                  <Label>{t("vendors.form.legal_name.label")}</Label>
                  <Input value={formData.legalName} onChange={(e) => setFormData({ ...formData, legalName: e.target.value })} placeholder="Legal entity name" />
                </div>
                <div>
                  <Label>{t("vendors.form.tax_id.label")}</Label>
                  <Input value={formData.taxId} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} placeholder="Tax registration number" />
                </div>
                <div>
                  <Label>{t("vendors.form.contact_name.label")}</Label>
                  <Input value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} placeholder="Primary contact person" />
                </div>
                <div>
                  <Label>{t("vendors.form.contact_email.label")}</Label>
                  <Input type="email" value={formData.contactEmail} onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })} placeholder="email@example.com" />
                </div>
                <div>
                  <Label>{t("vendors.form.contact_phone.label")}</Label>
                  <Input value={formData.contactPhone} onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })} placeholder="+1-202-555-0178" />
                </div>
                <div>
                  <Label className={formErrors.country ? "text-destructive" : ""}>{t("vendors.form.country.label")}</Label>
                  <Input value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} placeholder="e.g. USA, UK, Singapore" className={formErrors.country ? "border-destructive" : ""} />
                </div>
                <div className="col-span-2">
                  <Label>{t("vendors.form.address.label")}</Label>
                  <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Street address" />
                </div>
                <div>
                  <Label>{t("vendors.form.city.label")}</Label>
                  <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                </div>
                <div>
                  <Label>{t("vendors.form.state_province.label")}</Label>
                  <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} />
                </div>
                <div>
                  <Label>{t("vendors.form.postal_code.label")}</Label>
                  <Input value={formData.postalCode} onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })} />
                </div>
                <div>
                  <Label>{t("vendors.form.vendor_type.label")}</Label>
                  <Select value={formData.vendorType} onValueChange={(v: any) => setFormData({ ...formData, vendorType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client_related">{t("vendors.form.vendor_type.client_related")}</SelectItem>
                      <SelectItem value="operational">{t("vendors.form.vendor_type.operational")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("vendors.form.service_type.label")}</Label>
                  <Select value={formData.serviceType} onValueChange={(v) => setFormData({ ...formData, serviceType: v })}>
                    <SelectTrigger><SelectValue placeholder={t("vendors.form.service_type.label")} /></SelectTrigger>
                    <SelectContent>
                      {serviceTypeOptions.map((sType) => <SelectItem key={sType} value={sType}>{sType}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("vendors.form.default_currency.label")}</Label>
                  <CurrencySelect value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })} />
                </div>
                <div>
                  <Label>{t("vendors.form.payment_terms.label")}</Label>
                  <Input type="number" value={formData.paymentTermDays} onChange={(e) => setFormData({ ...formData, paymentTermDays: parseInt(e.target.value) || 30 })} />
                </div>
                <div className="col-span-2">
                  <BankDetailsForm
                    value={formData.bankDetails}
                    onChange={(val) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, ...val } })}
                    countryCode={formData.country}
                    currency={formData.currency}
                  />
                </div>
                <div className="col-span-2">
                  <Label>{t("vendors.form.notes.label")}</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Internal notes about this vendor" rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={validateAndCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Vendor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={t("common.search") + "..."} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("vendors.list.filter.type.all")}</SelectItem>
              <SelectItem value="client_related">{t("vendors.list.filter.type.client_related")}</SelectItem>
              <SelectItem value="operational">{t("vendors.list.filter.type.operational")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.status.all")}</SelectItem>
              <SelectItem value="active">{t("vendors.list.filter.status.active")}</SelectItem>
              <SelectItem value="inactive">{t("vendors.list.filter.status.inactive")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Vendor Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("vendors.table.header.vendor")}</TableHead>
                  <TableHead>{t("vendors.detail.field.vendor_type")}</TableHead>
                  <TableHead className="min-w-[120px]">{t("vendors.table.header.country")}</TableHead>
                  <TableHead>{t("vendors.form.service_type.label")}</TableHead>
                  <TableHead>{t("vendors.table.header.contact")}</TableHead>
                  <TableHead>{t("common.currency")}</TableHead>
                  <TableHead>{t("vendors.table.header.status")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : data && data.data.length > 0 ? (
                  data.data.map((vendor) => (
                    <TableRow key={vendor.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/vendors/${vendor.id}`)}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{vendor.name}</div>
                          <div className="text-xs text-muted-foreground">{vendor.vendorCode}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={vendorTypeColors[vendor.vendorType] || ""}>
                          {vendor.vendorType === "client_related" ? t("vendors.list.filter.type.client_related") : t("vendors.list.filter.type.operational")}
                        </Badge>
                      </TableCell>
                      <TableCell>{countryName(vendor.country)}</TableCell>
                      <TableCell>{formatServiceType(vendor.serviceType)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {vendor.contactName && <div>{vendor.contactName}</div>}
                          {vendor.contactEmail && <div className="text-muted-foreground text-xs">{vendor.contactEmail}</div>}
                        </div>
                      </TableCell>
                      <TableCell>{vendor.currency}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[vendor.status] || ""}>
                          {vendor.status === "active" ? t("vendors.list.filter.status.active") : t("vendors.list.filter.status.inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <div>{t("vendors.table.empty.title")}</div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

/* ========== Vendor Bills Section (embedded in VendorDetail) ========== */
function VendorBillsSection({ vendorId, vendorName, t }: { vendorId: number; vendorName: string; t: (key: string) => string }) {
  const [, setLocation] = useLocation();
  const { data, isLoading } = trpc.vendorBills.list.useQuery({
    vendorId,
    limit: 50,
  });

  const bills = Array.isArray(data) ? data : (data as any)?.data || [];

  const statusColorMap: Record<string, string> = {
    draft: "bg-gray-500/15 text-gray-600 border-gray-500/30",
    pending_approval: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    approved: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    paid: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    partially_paid: "bg-teal-500/15 text-teal-600 border-teal-500/30",
    overdue: "bg-red-500/15 text-red-600 border-red-500/30",
    cancelled: "bg-gray-500/15 text-gray-400 border-gray-500/30",
    void: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <FileText className="w-4 h-4" /> {t("vendorBills.vendor.bills")} ({bills.length})
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setLocation("/vendor-bills")}>
          {t("vendorBills.title")}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : bills.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{t("vendorBills.vendor.noBills")}</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("vendorBills.table.billNumberHeader")}</TableHead>
                  <TableHead className="text-xs">{t("vendorBills.table.statusHeader")}</TableHead>
                  <TableHead className="text-xs">{t("vendorBills.table.billDateHeader")}</TableHead>
                  <TableHead className="text-xs text-right">{t("vendorBills.table.totalHeader")}</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((bill: any) => (
                  <TableRow key={bill.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/vendor-bills/${bill.id}`)}>
                    <TableCell className="font-medium text-sm">{bill.billNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${statusColorMap[bill.status] || ""}`}>
                        {t(`vendorBills.status.${bill.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(bill.billDate)}</TableCell>
                    <TableCell className="text-sm text-right font-medium">{bill.currency} {formatAmount(parseFloat(bill.totalAmount || "0"))}</TableCell>
                    <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ========== Vendor Detail ========== */
function VendorDetail({ id }: { id: number }) {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [editOpen, setEditOpen] = useState(false);

  const { data: vendor, isLoading, refetch } = trpc.vendors.get.useQuery({ id });

  const updateMutation = trpc.vendors.update.useMutation({
    onSuccess: () => {
      toast.success(t("vendors.toast.update.success"));
      setEditOpen(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [editData, setEditData] = useState<any>({});

  function openEdit() {
    if (!vendor) return;
    let parsedBankDetails: Partial<BankDetails> = {};
    try {
      if (vendor.bankDetails?.trim().startsWith("{")) {
        parsedBankDetails = JSON.parse(vendor.bankDetails);
      } else if (vendor.bankDetails) {
        // Legacy text fallback
        parsedBankDetails = { bankName: vendor.bankDetails };
      }
    } catch (e) {
      parsedBankDetails = { bankName: vendor.bankDetails || "" };
    }

    setEditData({
      name: vendor.name, legalName: vendor.legalName || "", contactName: vendor.contactName || "",
      contactEmail: vendor.contactEmail || "", contactPhone: vendor.contactPhone || "",
      country: vendor.country, address: vendor.address || "", city: vendor.city || "",
      state: vendor.state || "", postalCode: vendor.postalCode || "",
      serviceType: vendor.serviceType || "", currency: vendor.currency,
      bankDetails: parsedBankDetails, taxId: vendor.taxId || "",
      paymentTermDays: vendor.paymentTermDays, vendorType: vendor.vendorType, status: vendor.status, notes: vendor.notes || "",
    });
    setEditOpen(true);
  }

  if (isLoading) {
    return (
      <Layout breadcrumb={["EG", "Vendors", t("common.loading") + "..."]}>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (!vendor) {
    return (
      <Layout breadcrumb={["EG", "Vendors", "Not Found"]}>
        <div className="p-6 text-center py-20">
          <Truck className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h2 className="text-xl font-semibold">Vendor not found</h2>
          <Button variant="outline" className="mt-4" onClick={() => setLocation("/vendors")}>
            <ArrowLeft className="w-4 h-4 mr-2" />{t("common.back")}
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout breadcrumb={["EG", "Vendors", vendor.name]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/vendors")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{vendor.name}</h1>
              <Badge variant="outline" className={vendorTypeColors[vendor.vendorType] || ""}>
                {vendor.vendorType === "client_related" ? t("vendors.list.filter.type.client_related") : t("vendors.list.filter.type.operational")}
              </Badge>
              <Badge variant="outline" className={statusColors[vendor.status] || ""}>
                {vendor.status === "active" ? t("vendors.list.filter.status.active") : t("vendors.list.filter.status.inactive")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{vendor.vendorCode} {vendor.legalName ? `· ${vendor.legalName}` : ""}</p>
          </div>
          <Button variant="outline" onClick={openEdit}>
            <Pencil className="w-4 h-4 mr-2" />{t("common.edit")}
          </Button>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Contact Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Mail className="w-4 h-4" />{t("vendors.table.header.contact")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {vendor.contactName && (
                <div><div className="text-xs text-muted-foreground">{t("vendors.form.contact_name.label")}</div><div className="font-medium">{vendor.contactName}</div></div>
              )}
              {vendor.contactEmail && (
                <div><div className="text-xs text-muted-foreground">{t("vendors.detail.field.email")}</div><div className="font-medium">{vendor.contactEmail}</div></div>
              )}
              {vendor.contactPhone && (
                <div><div className="text-xs text-muted-foreground">{t("vendors.detail.field.phone")}</div><div className="font-medium">{vendor.contactPhone}</div></div>
              )}
              {!vendor.contactName && !vendor.contactEmail && !vendor.contactPhone && (
                <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
              )}
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4" />{t("vendors.form.address.label")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><div className="text-xs text-muted-foreground">{t("vendors.table.header.country")}</div><div className="font-medium">{countryName(vendor.country)}</div></div>
              {vendor.address && <div><div className="text-xs text-muted-foreground">{t("vendors.form.address.label")}</div><div className="font-medium">{vendor.address}</div></div>}
              {(vendor.city || vendor.state || vendor.postalCode) && (
                <div><div className="text-xs text-muted-foreground">{t("vendors.form.city.label")} / {t("vendors.form.state_province.label")} / {t("vendors.form.postal_code.label")}</div><div className="font-medium">{[vendor.city, vendor.state, vendor.postalCode].filter(Boolean).join(", ")}</div></div>
              )}
            </CardContent>
          </Card>

          {/* Financial Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CreditCard className="w-4 h-4" />{t("payroll.viewItemDialog.section.summary")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><div className="text-xs text-muted-foreground">{t("vendors.detail.field.vendor_type")}</div><div className="font-medium"><Badge variant="outline" className={vendorTypeColors[vendor.vendorType] || ""}>{vendor.vendorType === "client_related" ? t("vendors.list.filter.type.client_related") : t("vendors.list.filter.type.operational")}</Badge></div></div>
              <div><div className="text-xs text-muted-foreground">{t("vendors.form.service_type.label")}</div><div className="font-medium">{formatServiceType(vendor.serviceType)}</div></div>
              <div><div className="text-xs text-muted-foreground">{t("vendors.form.default_currency.label")}</div><div className="font-medium">{vendor.currency}</div></div>
              <div><div className="text-xs text-muted-foreground">{t("vendors.detail.field.payment_terms")}</div><div className="font-medium">{vendor.paymentTermDays} {t("employees.detail.field.days")}</div></div>
              {vendor.taxId && <div><div className="text-xs text-muted-foreground">{t("vendors.form.tax_id.label")}</div><div className="font-medium">{vendor.taxId}</div></div>}
            </CardContent>
          </Card>
        </div>

        {/* Bank Details & Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {vendor.bankDetails && (
            <BankDetailsForm
              value={(() => {
                try {
                  return vendor.bankDetails.startsWith("{") ? JSON.parse(vendor.bankDetails) : { bankName: vendor.bankDetails };
                } catch { return { bankName: vendor.bankDetails }; }
              })()}
              readOnly
              onChange={() => {}}
            />
          )}
          {vendor.notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4" />{t("vendors.form.notes.label")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{vendor.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Vendor Bills */}
        <VendorBillsSection vendorId={id} vendorName={vendor.name} t={t} />

        <div className="text-xs text-muted-foreground">
          {t("employees.detail.field.createdAt")}: {formatDate(vendor.createdAt)} · {t("employees.detail.field.updatedAt")}: {formatDate(vendor.updatedAt)}
        </div>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("vendors.detail.edit_button")}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2">
                <Label>{t("vendors.form.company_name.label")}</Label>
                <Input value={editData.name || ""} onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
              </div>
              <div>
                <Label>{t("vendors.form.legal_name.label")}</Label>
                <Input value={editData.legalName || ""} onChange={(e) => setEditData({ ...editData, legalName: e.target.value })} />
              </div>
              <div>
                <Label>{t("vendors.form.tax_id.label")}</Label>
                <Input value={editData.taxId || ""} onChange={(e) => setEditData({ ...editData, taxId: e.target.value })} />
              </div>
              <div>
                <Label>{t("vendors.form.contact_name.label")}</Label>
                <Input value={editData.contactName || ""} onChange={(e) => setEditData({ ...editData, contactName: e.target.value })} />
              </div>
              <div>
                <Label>{t("vendors.form.contact_email.label")}</Label>
                <Input value={editData.contactEmail || ""} onChange={(e) => setEditData({ ...editData, contactEmail: e.target.value })} />
              </div>
              <div>
                <Label>{t("vendors.form.contact_phone.label")}</Label>
                <Input value={editData.contactPhone || ""} onChange={(e) => setEditData({ ...editData, contactPhone: e.target.value })} />
              </div>
              <div>
                <Label>{t("vendors.form.country.label")}</Label>
                <Input value={editData.country || ""} onChange={(e) => setEditData({ ...editData, country: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>{t("vendors.form.address.label")}</Label>
                <Input value={editData.address || ""} onChange={(e) => setEditData({ ...editData, address: e.target.value })} />
              </div>
              <div>
                <Label>{t("vendors.form.city.label")}</Label>
                <Input value={editData.city || ""} onChange={(e) => setEditData({ ...editData, city: e.target.value })} />
              </div>
              <div>
                <Label>{t("vendors.form.state_province.label")}</Label>
                <Input value={editData.state || ""} onChange={(e) => setEditData({ ...editData, state: e.target.value })} />
              </div>
              <div>
                <Label>{t("vendors.form.postal_code.label")}</Label>
                <Input value={editData.postalCode || ""} onChange={(e) => setEditData({ ...editData, postalCode: e.target.value })} />
              </div>
              <div>
                <Label>{t("vendors.detail.field.vendor_type")}</Label>
                <Select value={editData.vendorType || "client_related"} onValueChange={(v) => setEditData({ ...editData, vendorType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_related">{t("vendors.list.filter.type.client_related")}</SelectItem>
                    <SelectItem value="operational">{t("vendors.list.filter.type.operational")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("vendors.form.service_type.label")}</Label>
                <Select value={editData.serviceType || ""} onValueChange={(v) => setEditData({ ...editData, serviceType: v })}>
                  <SelectTrigger><SelectValue placeholder={t("vendors.form.service_type.label")} /></SelectTrigger>
                  <SelectContent>
                    {serviceTypeOptions.map((sType) => <SelectItem key={sType} value={sType}>{sType}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("vendors.form.default_currency.label")}</Label>
                <CurrencySelect value={editData.currency || "USD"} onValueChange={(v) => setEditData({ ...editData, currency: v })} />
              </div>
              <div>
                <Label>{t("vendors.form.payment_terms.label")}</Label>
                <Input type="number" value={editData.paymentTermDays || 30} onChange={(e) => setEditData({ ...editData, paymentTermDays: parseInt(e.target.value) || 30 })} />
              </div>
              <div>
                <Label>{t("vendors.table.header.status")}</Label>
                <Select value={editData.status || "active"} onValueChange={(v) => setEditData({ ...editData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("vendors.list.filter.status.active")}</SelectItem>
                    <SelectItem value="inactive">{t("vendors.list.filter.status.inactive")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <BankDetailsForm
                  value={editData.bankDetails || {}}
                  onChange={(val) => setEditData({ ...editData, bankDetails: { ...editData.bankDetails, ...val } })}
                  countryCode={editData.country}
                  currency={editData.currency}
                />
              </div>
              <div className="col-span-2">
                <Label>{t("vendors.form.notes.label")}</Label>
                <Textarea value={editData.notes || ""} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => updateMutation.mutate({ id, ...editData, bankDetails: JSON.stringify(editData.bankDetails) })} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("common.loading") : t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

/* ========== Main Component ========== */
export default function Vendors() {
  const [match, params] = useRoute("/vendors/:id");
  if (match && params?.id) {
    return <VendorDetail id={parseInt(params.id)} />;
  }
  return <VendorList />;
}
