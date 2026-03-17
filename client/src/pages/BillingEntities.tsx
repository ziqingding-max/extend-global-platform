/**
 * GEA Admin — Billing Entities Management
 * Full CRUD with logo upload, IBAN/beneficiary, invoice prefix
 */
import { useState, useRef } from "react";
import Layout from "@/components/Layout";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Landmark, Upload, Image as ImageIcon,
} from "lucide-react";
import CountrySelect from "@/components/CountrySelect";
import CurrencySelect from "@/components/CurrencySelect";
import { PageSkeleton } from "@/components/PageSkeleton";

type FormState = {
  entityName: string; legalName: string; registrationNumber: string; taxId: string;
  country: string; address: string; city: string; state: string; postalCode: string;
  bankDetails: string;
  currency: string; contactEmail: string; contactPhone: string;
  isDefault: boolean; invoicePrefix: string; notes: string;
};

const emptyForm: FormState = {
  entityName: "", legalName: "", registrationNumber: "", taxId: "",
  country: "", address: "", city: "", state: "", postalCode: "",
  bankDetails: "",
  currency: "USD", contactEmail: "", contactPhone: "",
  isDefault: false, invoicePrefix: "", notes: "",
};

export default function BillingEntities({ embedded }: { embedded?: boolean } = {}) {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });

  const { data: entities, isLoading, refetch } = trpc.billingEntities.list.useQuery();
  const { data: countriesList } = trpc.countries.list.useQuery();
  const createMut = trpc.billingEntities.create.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); toast.success("Billing entity created"); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = trpc.billingEntities.update.useMutation({
    onSuccess: () => { refetch(); setEditId(null); toast.success("Billing entity updated"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.billingEntities.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Billing entity deleted"); },
    onError: (err) => toast.error(err.message),
  });
  const uploadLogoMut = trpc.billingEntities.uploadLogo.useMutation({
    onSuccess: (res) => { refetch(); toast.success("Logo uploaded"); },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => setForm({ ...emptyForm });

  const openEdit = (entity: any) => {
    setForm({
      entityName: entity.entityName || "",
      legalName: entity.legalName || "",
      registrationNumber: entity.registrationNumber || "",
      taxId: entity.taxId || "",
      country: entity.country || "",
      address: entity.address || "",
      city: entity.city || "",
      state: entity.state || "",
      postalCode: entity.postalCode || "",
      bankDetails: entity.bankDetails || "",
      currency: entity.currency || "USD",
      contactEmail: entity.contactEmail || "",
      contactPhone: entity.contactPhone || "",
      isDefault: entity.isDefault || false,
      invoicePrefix: entity.invoicePrefix || "",
      notes: entity.notes || "",
    });
    setEditId(entity.id);
  };

  const handleSubmit = () => {
    if (editId) {
      updateMut.mutate({ id: editId, data: form });
    } else {
      createMut.mutate(form);
    }
  };

  const handleLogoUpload = (entityId: number, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo file must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadLogoMut.mutate({
        id: entityId,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || "image/png",
      });
    };
    reader.readAsDataURL(file);
  };

  if (isLoading && !entities) {
    if (embedded) return <PageSkeleton cards={0} hasTable={false} />;
    return (
      <Layout title={t("billing.title")} breadcrumb={[t("nav.finance"), t("billing.title")]}>
        <PageSkeleton cards={0} hasTable={false} />
      </Layout>
    );
  }

  const content = (
      <div className={embedded ? "space-y-6" : "p-6 space-y-6 page-enter"}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t("billing.subtitle")}
            </p>
          </div>
          <Button onClick={() => { resetForm(); setShowCreate(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Add Entity
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {entities?.map((entity: any) => (
            <EntityCard
              key={entity.id}
              entity={entity}
              countriesList={countriesList}
              onEdit={() => openEdit(entity)}
              onDelete={() => {
                if (confirm("Delete this billing entity?")) deleteMut.mutate({ id: entity.id });
              }}
              onLogoUpload={(file) => handleLogoUpload(entity.id, file)}
              isUploadingLogo={uploadLogoMut.isPending}
            />
          ))}
          {(!entities || entities.length === 0) && (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No billing entities configured yet</p>
                <Button variant="outline" className="mt-3" onClick={() => { resetForm(); setShowCreate(true); }}>
                  <Plus className="w-4 h-4 mr-2" /> Add Your First Entity
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );

  const dialog = (
    <Dialog
      open={showCreate || editId !== null}
      onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditId(null); } }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editId ? "Edit Billing Entity" : "Add Billing Entity"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Entity Name *</Label>
            <Input value={form.entityName} onChange={(e) => setForm((f) => ({ ...f, entityName: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Legal Name *</Label>
            <Input value={form.legalName} onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Registration Number</Label>
            <Input value={form.registrationNumber} onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Tax ID</Label>
            <Input value={form.taxId} onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Country/Region *</Label>
            <CountrySelect
              value={form.country}
              onValueChange={(v) => {
                const countryConfig = countriesList?.find((c: any) => c.countryCode === v);
                setForm((f) => ({ ...f, country: v, currency: countryConfig?.localCurrency || f.currency }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <CurrencySelect
              value={form.currency}
              onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>State</Label>
            <Input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Postal Code</Label>
            <Input value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Contact Email</Label>
            <Input value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Contact Phone</Label>
            <Input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} />
          </div>
          <div className="col-span-2 border-t pt-4 mt-2">
            <h4 className="font-semibold mb-3">Invoice Configuration</h4>
            <div className="space-y-2">
              <Label>Invoice Prefix</Label>
              <Input
                value={form.invoicePrefix}
                onChange={(e) => setForm((f) => ({ ...f, invoicePrefix: e.target.value.toUpperCase() }))}
                placeholder="e.g. APAC- or EU-"
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground">
                Prefix for invoice numbers. E.g. "APAC-" → APAC-202601-0001
              </p>
            </div>
          </div>
          <div className="col-span-2 border-t pt-4 mt-2">
            <h4 className="font-semibold mb-3">Bank Information</h4>
            <div className="space-y-2">
              <Label>Bank Details</Label>
              <Textarea
                value={form.bankDetails}
                onChange={(e) => setForm((f) => ({ ...f, bankDetails: e.target.value }))}
                rows={5}
                placeholder={"Bank Name: ...\nAccount Number: ...\nSWIFT/BIC: ...\nIBAN: ...\nBeneficiary: ..."}
              />
              <p className="text-xs text-muted-foreground">Free-form text. Enter bank details in any format suitable for the country/region. This will appear on invoices as-is.</p>
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <Switch
              checked={form.isDefault}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))}
            />
            <Label>Set as default billing entity</Label>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.entityName || !form.legalName || !form.country || createMut.isPending || updateMut.isPending}
          >
            {createMut.isPending || updateMut.isPending ? "Saving..." : editId ? "Save Changes" : "Create Entity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (embedded) {
    return (
      <>
        {content}
        {dialog}
      </>
    );
  }

  return (
    <Layout title={t("billing.title")} breadcrumb={[t("nav.finance"), t("billing.title")]}>
      {content}
      {dialog}
    </Layout>
  );
}

/* ========== Entity Card ========== */
function EntityCard({
  entity,
  countriesList,
  onEdit,
  onDelete,
  onLogoUpload,
  isUploadingLogo,
}: {
  entity: any;
  countriesList?: any[];
  onEdit: () => void;
  onDelete: () => void;
  onLogoUpload: (file: File) => void;
  isUploadingLogo: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const countryName = countriesList?.find((c: any) => c.countryCode === entity.country)?.countryName;

  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {entity.logoUrl ? (
              <img
                src={entity.logoUrl}
                alt={entity.entityName}
                className="w-10 h-10 rounded-md object-cover border"
              />
            ) : (
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Landmark className="w-5 h-5 text-primary" />
              </div>
            )}
            <div>
              <CardTitle className="text-base">{entity.entityName}</CardTitle>
              {entity.invoicePrefix && (
                <span className="text-xs text-muted-foreground font-mono">
                  Prefix: {entity.invoicePrefix}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1 flex-wrap justify-end">
            {entity.isDefault && <Badge variant="default" className="text-xs">Default</Badge>}
            <Badge variant={entity.isActive ? "outline" : "secondary"} className="text-xs">
              {entity.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div><span className="text-muted-foreground">Legal Name:</span> {entity.legalName}</div>
        <div><span className="text-muted-foreground">Country:</span> {countryName ? `${entity.country} — ${countryName}` : entity.country}</div>
        <div><span className="text-muted-foreground">Currency:</span> {entity.currency}</div>
        {entity.taxId && <div><span className="text-muted-foreground">Tax ID:</span> {entity.taxId}</div>}
        {entity.bankDetails && (
          <div>
            <span className="text-muted-foreground">Bank Details:</span>
            <pre className="text-xs mt-1 whitespace-pre-wrap bg-muted/50 rounded p-2">{entity.bankDetails}</pre>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="w-3 h-3 mr-1" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingLogo}
          >
            <Upload className="w-3 h-3 mr-1" /> {isUploadingLogo ? "Uploading..." : "Logo"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onLogoUpload(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="w-3 h-3 mr-1" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
