/**
 * CP Portal Settings
 * 
 * Manage CP profile, branding, billing info, and portal users.
 */
import { useState } from "react";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { useBranding } from "@/hooks/useBranding";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Palette, CreditCard, Users, Plus, Loader2, Save, Key } from "lucide-react";
import { toast } from "sonner";

export default function CpPortalSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your portal settings</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">
            <Building2 className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="branding">
            <Palette className="h-4 w-4 mr-2" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="h-4 w-4 mr-2" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="branding">
          <BrandingTab />
        </TabsContent>
        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileTab() {
  const { data: profile, isLoading, refetch } = cpTrpc.settings.getProfile.useQuery();
  const updateMutation = cpTrpc.settings.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState<any>(null);

  // Initialize form when data loads
  if (profile && !form) {
    setForm({
      companyName: profile.companyName || "",
      primaryContactEmail: profile.primaryContactEmail || "",
      primaryContactPhone: profile.primaryContactPhone || "",
      primaryContactName: profile.primaryContactName || "",
      address: profile.address || "",
    });
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Profile</CardTitle>
        <CardDescription>Update your company information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Contact Email</Label>
            <Input value={form.primaryContactEmail} onChange={(e) => setForm({ ...form, primaryContactEmail: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Contact Phone</Label>
            <Input value={form.primaryContactPhone} onChange={(e) => setForm({ ...form, primaryContactPhone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Contact Name</Label>
            <Input value={form.primaryContactName} onChange={(e) => setForm({ ...form, primaryContactName: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Address</Label>
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <Button
          onClick={() => updateMutation.mutate(form)}
          disabled={updateMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}

function BrandingTab() {
  const { data: branding, isLoading, refetch } = cpTrpc.settings.getBranding.useQuery();
  const updateMutation = cpTrpc.settings.updateBranding.useMutation({
    onSuccess: () => {
      toast.success("Branding updated");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState<any>(null);

  if (branding && !form) {
    setForm({
      logoUrl: branding.logoUrl || "",
      brandPrimaryColor: branding.brandPrimaryColor || "#2563EB",
      brandSecondaryColor: branding.brandSecondaryColor || "",
    });
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>Customize your portal appearance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Logo URL</Label>
          <Input
            value={form.logoUrl}
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            placeholder="https://..."
          />
          {form.logoUrl && (
            <div className="mt-2 p-4 border rounded-lg bg-muted/50">
              <img src={form.logoUrl} alt="Logo preview" className="h-12 object-contain" />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Primary Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.brandPrimaryColor}
                onChange={(e) => setForm({ ...form, brandPrimaryColor: e.target.value })}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={form.brandPrimaryColor}
                onChange={(e) => setForm({ ...form, brandPrimaryColor: e.target.value })}
                placeholder="#2563EB"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Secondary Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.brandSecondaryColor || "#000000"}
                onChange={(e) => setForm({ ...form, brandSecondaryColor: e.target.value })}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={form.brandSecondaryColor}
                onChange={(e) => setForm({ ...form, brandSecondaryColor: e.target.value })}
                placeholder="#10B981"
              />
            </div>
          </div>
        </div>
        <Button
          onClick={() => updateMutation.mutate(form)}
          disabled={updateMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {updateMutation.isPending ? "Saving..." : "Save Branding"}
        </Button>
      </CardContent>
    </Card>
  );
}

function BillingTab() {
  const { data: billing, isLoading, refetch } = cpTrpc.settings.getBillingInfo.useQuery();
  const updateMutation = cpTrpc.settings.updateBillingInfo.useMutation({
    onSuccess: () => {
      toast.success("Billing info updated");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState<any>(null);

  if (billing && !form) {
    setForm({
      cpBillingEntityName: billing.cpBillingEntityName || "",
      cpBillingAddress: billing.cpBillingAddress || "",
      cpBillingTaxId: billing.cpBillingTaxId || "",
      cpBankDetails: billing.cpBankDetails || "",
    });
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing Information</CardTitle>
        <CardDescription>This information appears on invoices sent to your clients</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Billing Entity Name</Label>
            <Input
              value={form.cpBillingEntityName}
              onChange={(e) => setForm({ ...form, cpBillingEntityName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Tax ID / Registration Number</Label>
            <Input
              value={form.cpBillingTaxId}
              onChange={(e) => setForm({ ...form, cpBillingTaxId: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Billing Address</Label>
          <Textarea
            value={form.cpBillingAddress}
            onChange={(e) => setForm({ ...form, cpBillingAddress: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Bank Details</Label>
          <Textarea
            value={form.cpBankDetails}
            onChange={(e) => setForm({ ...form, cpBankDetails: e.target.value })}
            placeholder="Bank name, account number, SWIFT code, etc."
            rows={4}
          />
        </div>
        <Button
          onClick={() => updateMutation.mutate(form)}
          disabled={updateMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {updateMutation.isPending ? "Saving..." : "Save Billing Info"}
        </Button>
      </CardContent>
    </Card>
  );
}

function UsersTab() {
  const { data: users, isLoading, refetch } = cpTrpc.settings.listUsers.useQuery();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    contactName: "",
    email: "",
    portalRole: "viewer" as "admin" | "finance" | "operations" | "viewer",
  });

  const inviteMutation = cpTrpc.settings.inviteUser.useMutation({
    onSuccess: () => {
      toast.success("Invitation sent");
      setShowInvite(false);
      setInviteForm({ contactName: "", email: "", portalRole: "viewer" });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const ROLE_LABELS: Record<string, string> = {
    cp_admin: "Admin",
    cp_finance: "Finance",
    cp_hr: "HR",
    cp_viewer: "Viewer",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Portal Users</CardTitle>
          <CardDescription>Manage who has access to this portal</CardDescription>
        </div>
        <Dialog open={showInvite} onOpenChange={setShowInvite}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Portal User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={inviteForm.contactName}
                  onChange={(e) => setInviteForm({ ...inviteForm, contactName: e.target.value })}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="user@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={inviteForm.portalRole}
                  onValueChange={(v) => setInviteForm({ ...inviteForm, portalRole: v as "admin" | "finance" | "operations" | "viewer" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="operations">Operations</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => inviteMutation.mutate(inviteForm)}
                disabled={inviteMutation.isPending}
                className="w-full"
              >
                {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((user: any) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.contactName}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROLE_LABELS[user.portalRole] || user.portalRole}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isPortalActive ? "default" : "secondary"}>
                      {user.isPortalActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!users || users.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
