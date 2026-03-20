/**
 * EG Admin — Vendor Management
 * List + Detail view for managing external service providers
 *
 * Refactored: Progressive disclosure based on Vendor Type.
 * - Vendor Type is now the first field in Create/Edit forms.
 * - Country uses standardized CountrySelect (ISO 2-letter code).
 * - Government vendors show a simplified form (no contact/tax/address fields).
 */
import Layout from "@/components/Layout";
import CurrencySelect from "@/components/CurrencySelect";
import CountrySelect from "@/components/CountrySelect";
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

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  inactive: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const vendorTypeColors: Record<string, string> = {
  government: "bg-red-500/15 text-red-600 border-red-500/30",
  financial: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  professional_service: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  equipment_provider: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
  hr_recruitment: "bg-pink-500/15 text-pink-600 border-pink-500/30",
  operational: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

const vendorTypeLabels: Record<string, string> = {
  government: "Government",
  financial: "Financial Institution",
  professional_service: "Professional Service",
  equipment_provider: "Equipment Provider",
  hr_recruitment: "HR / Recruitment",
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

/** Helper: check if vendor type is government (simplified form) */
function isGovType(vendorType: string): boolean {
  return vendorType === "government";
}

/* ========== Reusable Vendor Form Fields (used by both Create and Edit) ========== */
function VendorFormFields({ data, onChange, errors }: {
  data: any;
  onChange: (d: any) => void;
  errors?: Record<string, boolean>;
}) {
  const set = (key: string, val: any) => onChange({ ...data, [key]: val });
  const isGov = isGovType(data.vendorType || "operational");
  const err = errors || {};

  return (
    <div className="grid grid-cols-2 gap-4 py-4">
      {/* ── Row 1: Vendor Type (FIRST) + Name ── */}
      <div>
        <Label>Vendor Type *</Label>
        <Select value={data.vendorType || "operational"} onValueChange={(v: any) => set("vendorType", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="government">Government</SelectItem>
            <SelectItem value="financial">Financial Institution</SelectItem>
            <SelectItem value="professional_service">Professional Service</SelectItem>
            <SelectItem value="equipment_provider">Equipment Provider</SelectItem>
            <SelectItem value="hr_recruitment">HR / Recruitment</SelectItem>
            <SelectItem value="operational">Operational</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className={err.name ? "text-destructive" : ""}>
          {isGov ? "Institution Name *" : "Company Name *"}
        </Label>
        <Input
          value={data.name || ""}
          onChange={(e) => set("name", e.target.value)}
          placeholder={isGov ? "e.g. Germany Pension Insurance" : "e.g. Global Payroll Partner Inc."}
          className={err.name ? "border-destructive" : ""}
        />
      </div>

      {/* ── Row 2: Country (standardized) + Currency ── */}
      <div>
        <Label className={err.country ? "text-destructive" : ""}>Country *</Label>
        <CountrySelect
          value={data.country || ""}
          onValueChange={(v) => set("country", v)}
          scope="all"
          className={err.country ? "border-destructive" : ""}
        />
      </div>
      <div>
        <Label>Default Currency</Label>
        <CurrencySelect value={data.currency || "USD"} onValueChange={(v) => set("currency", v)} />
      </div>

      {/* ── Government hint banner ── */}
      {isGov && (
        <div className="col-span-2 rounded-lg border border-dashed border-red-300 bg-red-50 dark:bg-red-950/20 p-3">
          <p className="text-xs text-red-600 dark:text-red-400">
            Government vendor — only essential fields are shown. Contact details, tax ID, and address fields are hidden as they are not applicable for government institutions.
          </p>
        </div>
      )}

      {/* ── Non-government fields: Legal Name, Tax ID, Contact, Address ── */}
      {!isGov && (
        <>
          <div>
            <Label>Legal Name</Label>
            <Input value={data.legalName || ""} onChange={(e) => set("legalName", e.target.value)} placeholder="Legal entity name" />
          </div>
          <div>
            <Label>Tax ID</Label>
            <Input value={data.taxId || ""} onChange={(e) => set("taxId", e.target.value)} placeholder="Tax registration number" />
          </div>
          <div>
            <Label>Contact Name</Label>
            <Input value={data.contactName || ""} onChange={(e) => set("contactName", e.target.value)} placeholder="Primary contact person" />
          </div>
          <div>
            <Label>Contact Email</Label>
            <Input type="email" value={data.contactEmail || ""} onChange={(e) => set("contactEmail", e.target.value)} placeholder="email@example.com" />
          </div>
          <div>
            <Label>Contact Phone</Label>
            <Input value={data.contactPhone || ""} onChange={(e) => set("contactPhone", e.target.value)} placeholder="+1-202-555-0178" />
          </div>
          <div className="col-span-2">
            <Label>Address</Label>
            <Input value={data.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="Street address" />
          </div>
          <div>
            <Label>City</Label>
            <Input value={data.city || ""} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <Label>State/Province</Label>
            <Input value={data.state || ""} onChange={(e) => set("state", e.target.value)} />
          </div>
          <div>
            <Label>Postal Code</Label>
            <Input value={data.postalCode || ""} onChange={(e) => set("postalCode", e.target.value)} />
          </div>
          <div>
            <Label>Service Type</Label>
            <Select value={data.serviceType || ""} onValueChange={(v) => set("serviceType", v)}>
              <SelectTrigger><SelectValue placeholder="Service Type" /></SelectTrigger>
              <SelectContent>
                {serviceTypeOptions.map((sType) => <SelectItem key={sType} value={sType}>{sType}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Payment Terms (Days)</Label>
            <Input type="number" value={data.paymentTermDays || 30} onChange={(e) => set("paymentTermDays", parseInt(e.target.value) || 30)} />
          </div>
        </>
      )}

      {/* ── Status (Edit only — shown for all types) ── */}
      {data.status !== undefined && (
        <div>
          <Label>Status</Label>
          <Select value={data.status || "active"} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Bank Details (all types) ── */}
      <div className="col-span-2">
        <BankDetailsForm
          value={data.bankDetails || {}}
          onChange={(val) => onChange({ ...data, bankDetails: { ...data.bankDetails, ...val } })}
          countryCode={data.country}
          currency={data.currency}
        />
      </div>

      {/* ── Notes (all types) ── */}
      <div className="col-span-2">
        <Label>Notes</Label>
        <Textarea value={data.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Internal notes about this vendor" rows={2} />
      </div>
    </div>
  );
}

/* ========== Vendor List ========== */
function VendorList() {
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
      toast.success("Vendor created successfully.");
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
    paymentTermDays: 30, vendorType: "operational" as "government" | "financial" | "professional_service" | "equipment_provider" | "hr_recruitment" | "operational", notes: "",
  };
  const [formData, setFormData] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  function validateAndCreate() {
    const errors: Record<string, boolean> = {};
    if (!formData.name.trim()) errors.name = true;
    if (!formData.country.trim()) errors.country = true;
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error("Please correct the errors in the form.");
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
            <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your external service providers.</p>
          </div>
          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setFormErrors({}); setFormData(defaultForm); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Add Vendor</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Vendor</DialogTitle>
              </DialogHeader>
              <VendorFormFields data={formData} onChange={setFormData} errors={formErrors} />
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
            <Input placeholder="Search..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="government">Government</SelectItem>
              <SelectItem value="financial">Financial Institution</SelectItem>
              <SelectItem value="professional_service">Professional Service</SelectItem>
              <SelectItem value="equipment_provider">Equipment Provider</SelectItem>
              <SelectItem value="hr_recruitment">HR / Recruitment</SelectItem>
              <SelectItem value="operational">Operational</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Vendor Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Vendor Type</TableHead>
                  <TableHead className="min-w-[120px]">Country</TableHead>
                  <TableHead>Service Type</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
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
                          {vendorTypeLabels[vendor.vendorType] || vendor.vendorType}
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
                          {vendor.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <div>No vendors found.</div>
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
          <FileText className="w-4 h-4" /> Vendor Bills ({bills.length})
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setLocation("/vendor-bills")}>
          Vendor Bills
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : bills.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No vendor bills found for this vendor.</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Bill Number</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Bill Date</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((bill: any) => (
                  <TableRow key={bill.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/vendor-bills/${bill.id}`)}>
                    <TableCell className="font-medium text-sm">{bill.billNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${statusColorMap[bill.status] || ""}`}>
                        {bill.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
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
  const [, setLocation] = useLocation();
  const [editOpen, setEditOpen] = useState(false);

  const { data: vendor, isLoading, refetch } = trpc.vendors.get.useQuery({ id });

  const updateMutation = trpc.vendors.update.useMutation({
    onSuccess: () => {
      toast.success("Vendor updated successfully.");
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
      <Layout breadcrumb={["EG", "Vendors", "Loading..."]}>
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
            <ArrowLeft className="w-4 h-4 mr-2" />Back
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
                {vendorTypeLabels[vendor.vendorType] || vendor.vendorType}
              </Badge>
              <Badge variant="outline" className={statusColors[vendor.status] || ""}>
                {vendor.status === "active" ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{vendor.vendorCode} {vendor.legalName ? `· ${vendor.legalName}` : ""}</p>
          </div>
          <Button variant="outline" onClick={openEdit}>
            <Pencil className="w-4 h-4 mr-2" />Edit
          </Button>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Contact Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Mail className="w-4 h-4" />Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {vendor.contactName && (
                <div><div className="text-xs text-muted-foreground">Contact Name</div><div className="font-medium">{vendor.contactName}</div></div>
              )}
              {vendor.contactEmail && (
                <div><div className="text-xs text-muted-foreground">Email</div><div className="font-medium">{vendor.contactEmail}</div></div>
              )}
              {vendor.contactPhone && (
                <div><div className="text-xs text-muted-foreground">Phone</div><div className="font-medium">{vendor.contactPhone}</div></div>
              )}
              {!vendor.contactName && !vendor.contactEmail && !vendor.contactPhone && (
                <p className="text-sm text-muted-foreground">No data</p>
              )}
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4" />Address
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><div className="text-xs text-muted-foreground">Country</div><div className="font-medium">{countryName(vendor.country)}</div></div>
              {vendor.address && <div><div className="text-xs text-muted-foreground">Address</div><div className="font-medium">{vendor.address}</div></div>}
              {(vendor.city || vendor.state || vendor.postalCode) && (
                <div><div className="text-xs text-muted-foreground">City / State/Province / Postal Code</div><div className="font-medium">{[vendor.city, vendor.state, vendor.postalCode].filter(Boolean).join(", ")}</div></div>
              )}
            </CardContent>
          </Card>

          {/* Financial Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CreditCard className="w-4 h-4" />Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><div className="text-xs text-muted-foreground">Vendor Type</div><div className="font-medium"><Badge variant="outline" className={vendorTypeColors[vendor.vendorType] || ""}>{vendorTypeLabels[vendor.vendorType] || vendor.vendorType}</Badge></div></div>
              <div><div className="text-xs text-muted-foreground">Service Type</div><div className="font-medium">{formatServiceType(vendor.serviceType)}</div></div>
              <div><div className="text-xs text-muted-foreground">Default Currency</div><div className="font-medium">{vendor.currency}</div></div>
              <div><div className="text-xs text-muted-foreground">Payment Terms</div><div className="font-medium">{vendor.paymentTermDays} Days</div></div>
              {vendor.taxId && <div><div className="text-xs text-muted-foreground">Tax ID</div><div className="font-medium">{vendor.taxId}</div></div>}
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
                  <FileText className="w-4 h-4" />Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{vendor.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Vendor Bills */}
        <VendorBillsSection vendorId={id} vendorName={vendor.name} t={(key: string) => {
          const parts = key.split('.');
          const lastPart = parts[parts.length - 1];
          switch (lastPart) {
            case 'bills': return 'Bills';
            case 'noBills': return 'No vendor bills found for this vendor.';
            case 'billNumberHeader': return 'Bill Number';
            case 'statusHeader': return 'Status';
            case 'billDateHeader': return 'Bill Date';
            case 'totalHeader': return 'Total';
            case 'draft': return 'Draft';
            case 'pending_approval': return 'Pending Approval';
            case 'approved': return 'Approved';
            case 'paid': return 'Paid';
            case 'partially_paid': return 'Partially Paid';
            case 'overdue': return 'Overdue';
            case 'cancelled': return 'Cancelled';
            case 'void': return 'Void';
            default: return lastPart.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          }
        }} />

        <div className="text-xs text-muted-foreground">
          Created At: {formatDate(vendor.createdAt)} · Updated At: {formatDate(vendor.updatedAt)}
        </div>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Vendor</DialogTitle>
            </DialogHeader>
            <VendorFormFields data={editData} onChange={setEditData} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={() => updateMutation.mutate({ id, ...editData, bankDetails: JSON.stringify(editData.bankDetails) })} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Loading..." : "Save"}
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
