/**
 * Portal Settings Page
 *
 * Company profile, leave policies, user management (invite/manage contacts).
 */

import { useState } from "react";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2, Users, Shield, UserPlus, Loader2, Copy, CheckCircle2,
  CalendarDays, MoreHorizontal, RefreshCw, UserMinus, Pencil, Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";
import { getPortalOrigin, getPortalBasePath } from "@/lib/portalBasePath";

// ─── Company Profile ─────────────────────────────────────────────────────────

function CompanyProfileTab() {
  const { t } = useI18n();
  const { user } = usePortalAuth();
  const isAdmin = user?.portalRole === "admin";
  const { data: profile, isLoading, refetch } = portalTrpc.settings.companyProfile.useQuery();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const updateMutation = portalTrpc.settings.updateCompanyProfile.useMutation({
    onSuccess: () => {
      toast.success(t("portal_settings.company_profile.update_success_toast"));
      setEditing(false);
      refetch();
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to update profile");
    },
  });

  const startEdit = () => {
    if (!profile) return;
    setForm({
      companyName: profile.companyName || "",
      registrationNumber: profile.registrationNumber || "",
      industry: profile.industry || "",
      address: profile.address || "",
      city: profile.city || "",
      state: profile.state || "",
      country: profile.country || "",
      postalCode: profile.postalCode || "",
      primaryContactName: profile.primaryContactName || "",
      primaryContactEmail: profile.primaryContactEmail || "",
      primaryContactPhone: profile.primaryContactPhone || "",
      language: profile.language || "en",
    });
    setEditing(true);
  };

  const saveEdit = () => {
    updateMutation.mutate({
      companyName: form.companyName || undefined,
      registrationNumber: form.registrationNumber || null,
      industry: form.industry || null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      country: form.country || undefined,
      postalCode: form.postalCode || null,
      // Primary contact fields are read-only - not sent to backend
      language: (form.language as "en" | "zh") || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!profile) return null;

  // Helper for read-only locked fields
  const LockedField = ({ label, value, tooltip }: { label: string; value: string; tooltip: string }) => (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Shield className="w-3 h-3 text-muted-foreground/50" />
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">{tooltip}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-2">
        <p className="font-medium">{value || "—"}</p>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">{t("portal_settings.company_profile.locked_badge")}</Badge>
      </div>
    </div>
  );

  // Helper for editable fields
  const EditableField = ({ label, fieldKey, type = "text" }: { label: string; fieldKey: string; type?: string }) => (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
      {editing ? (
        <Input
          type={type}
          value={form[fieldKey] || ""}
          onChange={(e) => setForm({ ...form, [fieldKey]: e.target.value })}
          className="h-9"
        />
      ) : (
        <p className="font-medium">{(profile as any)[fieldKey] || "—"}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Action bar */}
      {isAdmin && (
        <div className="flex justify-end">
          {editing ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={updateMutation.isPending}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {t("common.save")}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Pencil className="w-4 h-4 mr-1" />
              {t("common.edit")}
            </Button>
          )}
        </div>
      )}

      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("portal_settings.company_profile.section_title")}</CardTitle>
          <CardDescription>{t("portal_settings.company_profile.section_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <EditableField label={t("portal_settings.company.display_name")} fieldKey="companyName" />
            <LockedField label={t("portal_settings.company.legal_name")} value={profile.legalEntityName || ""} tooltip={t("portal_settings.company.contact_support")} />
            <EditableField label={t("portal_settings.company.registration_number")} fieldKey="registrationNumber" />
            <EditableField label={t("portal_settings.company_profile.industry_label")} fieldKey="industry" />
            <EditableField label={t("portal_settings.company_profile.country_label")} fieldKey="country" />
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">{t("portal_settings.company_profile.language_label")}</Label>
              {editing ? (
                <Select value={form.language || "en"} onValueChange={(v) => setForm({ ...form, language: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="zh">中文</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{profile.language === "zh" ? "中文" : "English"}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("portal_settings.company_profile.address_section_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <EditableField label={t("portal_settings.company.address")} fieldKey="address" />
            </div>
            <EditableField label={t("portal_settings.company_profile.city_label")} fieldKey="city" />
            <EditableField label={t("portal_settings.company.state")} fieldKey="state" />
            <EditableField label={t("portal_settings.company.postal_code")} fieldKey="postalCode" />
          </div>
        </CardContent>
      </Card>

      {/* Primary Contact - Read Only */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("portal_settings.company_profile.primary_contact_section_title")}</CardTitle>
          <CardDescription>{t("portal_settings.company_profile.primary_contact_section_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <LockedField label={t("portal_settings.team.table.name")} value={profile.primaryContactName || ""} tooltip={t("portal_settings.company.contact_support")} />
            <LockedField label={t("portal_settings.company.email")} value={profile.primaryContactEmail || ""} tooltip={t("portal_settings.company.contact_support")} />
            <LockedField label={t("portal_settings.company.phone")} value={profile.primaryContactPhone || ""} tooltip={t("portal_settings.company.contact_support")} />
          </div>
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
            <Shield className="w-3 h-3" />
            {t("portal_settings.company.contact_support")}
          </p>
        </CardContent>
      </Card>

      {/* Billing Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("portal_settings.company_profile.billing_section_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <LockedField label={t("portal_settings.company.currency")} value={profile.settlementCurrency || "USD"} tooltip={t("portal_settings.company.contact_support")} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Leave Policies ──────────────────────────────────────────────────────────

function LeavePoliciesTab() {
  const { t } = useI18n();
  const { user } = usePortalAuth();
  const canEdit = user && ["admin", "hr_manager"].includes(user.portalRole);
  const { data: policies, isLoading, refetch } = portalTrpc.settings.leavePolicies.useQuery();
  const { data: countries } = portalTrpc.settings.activeCountries.useQuery();
  const [editingCountry, setEditingCountry] = useState<string | null>(null);
  const [editForms, setEditForms] = useState<Record<number, {
    annualEntitlement: number;
    expiryRule: string;
    carryOverDays: number;
  }>>({});
  const [savingCountry, setSavingCountry] = useState(false);

  const updateMutation = portalTrpc.settings.updateLeavePolicy.useMutation();

  // Start editing all policies for a country
  const startEditCountry = (countryCode: string, countryPolicies: any[]) => {
    const forms: Record<number, { annualEntitlement: number; expiryRule: string; carryOverDays: number }> = {};
    countryPolicies.forEach((p: any) => {
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
        updateMutation.mutateAsync({
          id: parseInt(idStr),
          annualEntitlement: data.annualEntitlement,
          expiryRule: data.expiryRule as any,
          carryOverDays: data.carryOverDays,
        })
      );
      await Promise.all(promises);
      toast.success(t("portal_settings.leave_policies.country_updated") || "Leave policies updated");
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
  const groupedPolicies = (policies ?? []).reduce((acc: Record<string, any[]>, p: any) => {
    const key = p.countryCode;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  if (Object.keys(groupedPolicies).length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <CalendarDays className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">{t("portal_settings.leave_policies.no_policies")}</p>
            <p className="text-xs mt-1">{t("portal_settings.leave_policies.no_policies_hint")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
        <Info className="w-4 h-4 shrink-0" />
        <span>{t("portal_settings.leave_policies.info_banner")}</span>
      </div>

      {Object.entries(groupedPolicies).map(([countryCode, countryPolicies]) => {
        const countryName = (countryPolicies as any[])[0]?.countryName || countryCode;
        const isEditing = editingCountry === countryCode;
        const hasUnconfirmed = (countryPolicies as any[]).some((p: any) => !p.clientConfirmed);
        return (
          <Card key={countryCode}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">{countryCode}</Badge>
                  {countryName}
                </CardTitle>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="default" className="h-7 text-xs" disabled={savingCountry} onClick={saveCountryPolicies}>
                          {savingCountry ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                          {t("common.save") || "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingCountry(null); setEditForms({}); }}>
                          {t("common.cancel") || "Cancel"}
                        </Button>
                      </div>
                    ) : (
                      <div className="relative inline-flex">
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => startEditCountry(countryCode, countryPolicies as any[])}>
                          <Pencil className="w-3.5 h-3.5 mr-1" /> {t("common.edit") || "Edit"}
                        </Button>
                        {hasUnconfirmed && (
                          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("portal_settings.leave_policies.table_header.leave_type") || "Leave Type"}</TableHead>
                    <TableHead className="text-center">{t("portal_settings.leave_policies.table_header.statutory_min") || "Statutory Min."}</TableHead>
                    <TableHead className="text-center">{t("portal_settings.leave_policies.table_header.entitlement") || "Your Entitlement"}</TableHead>
                    <TableHead className="text-center">{t("portal_settings.leave_policies.table_header.carry_over") || "Carry Over"}</TableHead>
                    <TableHead>{t("portal_settings.leave_policies.table_header.expiry_rule") || "Expiry Rule"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(countryPolicies as any[]).map((policy: any) => {
                    const form = editForms[policy.id];
                    return (
                      <TableRow key={policy.id}>
                        <TableCell className="font-medium">{policy.leaveTypeName}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{policy.statutoryMinimum ?? "—"} {t("common.days") || "days"}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing && form ? (
                            <Input
                              type="number"
                              min={policy.statutoryMinimum || 0}
                              className="w-20 mx-auto text-center"
                              value={form.annualEntitlement}
                              onChange={(e) => setEditForms({ ...editForms, [policy.id]: { ...form, annualEntitlement: parseInt(e.target.value) || 0 } })}
                            />
                          ) : (
                            <span className="font-medium">{policy.annualEntitlement} {t("common.days") || "days"}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing && form ? (
                            <Input
                              type="number"
                              min={0}
                              className="w-20 mx-auto text-center"
                              value={form.carryOverDays}
                              onChange={(e) => setEditForms({ ...editForms, [policy.id]: { ...form, carryOverDays: parseInt(e.target.value) || 0 } })}
                            />
                          ) : (
                            <span>{policy.carryOverDays} {t("common.days") || "days"}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing && form ? (
                            <Select value={form.expiryRule} onValueChange={(v) => setEditForms({ ...editForms, [policy.id]: { ...form, expiryRule: v } })}>
                              <SelectTrigger className="w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="year_end">{t("leave.expiryRule.yearEnd") || "Year End"}</SelectItem>
                                <SelectItem value="anniversary">{t("leave.expiryRule.anniversary") || "Anniversary"}</SelectItem>
                                <SelectItem value="no_expiry">{t("leave.expiryRule.noExpiry") || "No Expiry"}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="capitalize">{policy.expiryRule?.replace(/_/g, " ")}</span>
                          )}
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
    </div>
  );
}

// ─── User Management ─────────────────────────────────────────────────────────

function UserManagementTab() {
  const { t } = useI18n();
  const { user } = usePortalAuth();
  const { data: contacts, isLoading, refetch } = portalTrpc.settings.listUsers.useQuery();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteLink, setInviteLink] = useState("");

  const inviteMutation = portalTrpc.settings.inviteUser.useMutation({
    onSuccess: (data: { inviteToken: string }) => {
      const link = `${getPortalOrigin()}${getPortalBasePath()}/register?token=${data.inviteToken}`;
      setInviteLink(link);
      toast.success(t("portal_settings.team.create_invite_success_toast"));
      refetch();
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to send invitation");
    },
  });

  const updateRoleMutation = portalTrpc.settings.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated successfully");
      refetch();
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to update role");
    },
  });

  const deactivateMutation = portalTrpc.settings.deactivateUser.useMutation({
    onSuccess: () => {
      toast.success(t("portal_settings.team.deactivate_user_success_toast"));
      refetch();
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to deactivate user");
    },
  });

  const resendMutation = portalTrpc.settings.resendInvite.useMutation({
    onSuccess: (data: { inviteToken: string }) => {
      const link = `${getPortalOrigin()}${getPortalBasePath()}/register?token=${data.inviteToken}`;
      navigator.clipboard.writeText(link);
      toast.success("New invite link copied to clipboard");
      refetch();
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to resend invite");
    },
  });

  const handleInvite = () => {
    if (!inviteEmail || !inviteName) {
      toast.error("Please fill in all fields");
      return;
    }
    inviteMutation.mutate({
      email: inviteEmail.trim(),
      contactName: inviteName.trim(),
      portalRole: inviteRole as any,
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success(t("portal_settings.team.copy_link_success_toast"));
  };

  const isAdmin = user?.portalRole === "admin";

  const roleColors: Record<string, string> = {
    admin: "bg-purple-100 text-purple-800 border-purple-200",
    hr_manager: "bg-blue-100 text-blue-800 border-blue-200",
    finance: "bg-green-100 text-green-800 border-green-200",
    viewer: "bg-gray-100 text-gray-800 border-gray-200",
  };

  const roleLabels: Record<string, string> = {
    admin: t("portal_settings.team.role.admin"),
    hr_manager: t("portal_settings.team.role.hr_manager"),
    finance: t("portal_settings.team.role.finance_manager"),
    viewer: t("portal_settings.team.role.viewer"),
  };

  const roleDescriptions: Record<string, string> = {
    admin: "Full access to all features including settings and team management",
    hr_manager: "Manage employees, leave, adjustments, and onboarding",
    finance: "View invoices, payroll, and financial reports",
    viewer: "Read-only access to all modules",
  };

  return (
    <div className="space-y-6">
      {/* Role descriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            {t("portal_settings.team.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(roleDescriptions).map(([role, desc]) => (
              <div key={role} className="p-3 rounded-lg border bg-card">
                <Badge variant="outline" className={`${roleColors[role]} mb-2`}>
                  {roleLabels[role]}
                </Badge>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Team members table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("portal_settings.team.team_members_title")}</CardTitle>
            <CardDescription>{t("portal_settings.team.team_members_description")}</CardDescription>
          </div>
          {isAdmin && (
            <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) { setInviteLink(""); setInviteEmail(""); setInviteName(""); setInviteRole("viewer"); } }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="w-4 h-4 mr-2" />
                  {t("portal_settings.team.invite_button")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("portal_settings.team.invite_dialog_title")}</DialogTitle>
                  <DialogDescription>
                    {t("portal_settings.team.description")}
                  </DialogDescription>
                </DialogHeader>
                {inviteLink ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 text-green-800">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm font-medium">Invitation email has been sent to {inviteEmail}.</span>
                    </div>
                    <div>
                      <Label>Backup: Copy invite link</Label>
                      <div className="flex gap-2 mt-1">
                        <Input value={inviteLink} readOnly className="font-mono text-xs" />
                        <Button variant="outline" size="icon" onClick={copyLink}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        If the recipient didn't receive the email, you can share this link directly.
                      </p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setInviteOpen(false); setInviteLink(""); }}>
                        {t("common.done") || "Done"}
                      </Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>{t("portal_settings.team.full_name_label")}</Label>
                        <Input
                          placeholder="John Doe"
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("portal_settings.company_profile.email_label")}</Label>
                        <Input
                          type="email"
                          placeholder="john@company.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("portal_settings.team.role_label")}</Label>
                        <Select value={inviteRole} onValueChange={setInviteRole}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">{t("portal_settings.team.role_select.admin")}</SelectItem>
                            <SelectItem value="hr_manager">{t("portal_settings.team.role_select.hr_manager")}</SelectItem>
                            <SelectItem value="finance">{t("portal_settings.team.role_select.finance")}</SelectItem>
                            <SelectItem value="viewer">{t("portal_settings.team.role_select.viewer")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setInviteOpen(false)}>{t("common.cancel")}</Button>
                      <Button onClick={handleInvite} disabled={inviteMutation.isPending}>
                        {inviteMutation.isPending ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("portal_settings.team.creating_invitation_button")}</>
                        ) : (
                          t("portal_settings.team.invite_dialog.send_button")
                        )}
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("portal_settings.team.table_header.name")}</TableHead>
                  <TableHead>{t("portal_settings.company_profile.email_label")}</TableHead>
                  <TableHead>{t("portal_settings.team.role_label")}</TableHead>
                  <TableHead>{t("portal_settings.team.table_header.status")}</TableHead>
                  {isAdmin && <TableHead className="text-right">{t("portal_settings.leave_policies.table_header.actions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(contacts ?? []).map((contact: any) => {
                  const isSelf = contact.id === user?.contactId;
                  return (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">
                        {contact.contactName}
                        {isSelf && <Badge variant="outline" className="ml-2 text-xs">{t("portal_settings.team.you_badge")}</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{contact.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={roleColors[contact.portalRole || "viewer"] || ""}>
                          {roleLabels[contact.portalRole || "viewer"] || contact.portalRole}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={contact.isPortalActive ? "default" : "secondary"}>
                          {contact.isPortalActive ? t("portal_settings.team.status.active") : t("portal_settings.team.status.invited")}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          {!isSelf && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {/* Role change options */}
                                {["admin", "hr_manager", "finance", "viewer"]
                                  .filter(r => r !== contact.portalRole)
                                  .map(role => (
                                    <DropdownMenuItem
                                      key={role}
                                      onClick={() => updateRoleMutation.mutate({ contactId: contact.id, portalRole: role as any })}
                                    >
                                      <Shield className="w-4 h-4 mr-2" />
                                      Change to {roleLabels[role]}
                                    </DropdownMenuItem>
                                  ))}
                                <DropdownMenuSeparator />
                                {!contact.isPortalActive && (
                                  <DropdownMenuItem
                                    onClick={() => resendMutation.mutate({ contactId: contact.id })}
                                  >
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    {t("common.resend") || "Resend Invite"}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to deactivate ${contact.contactName}?`)) {
                                      deactivateMutation.mutate({ contactId: contact.id });
                                    }
                                  }}
                                >
                                  <UserMinus className="w-4 h-4 mr-2" />
                                  {t("portal_settings.team.remove_button")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Settings Page ──────────────────────────────────────────────────────

export default function PortalSettings() {
  const { t } = useI18n();
  return (
    <PortalLayout title={t("portal_settings.title")}>
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("portal_settings.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("portal_settings.team.description")}
          </p>
        </div>

        <Tabs defaultValue="company" className="space-y-6">
          <TabsList>
            <TabsTrigger value="company" className="gap-2">
              <Building2 className="w-4 h-4" />
              {t("portal_settings.tabs.company")}
            </TabsTrigger>
            <TabsTrigger value="leave" className="gap-2">
              <CalendarDays className="w-4 h-4" />
              {t("portal_settings.leave_policies.section_title") || "Leave Policy"}
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2">
              <Users className="w-4 h-4" />
              {t("portal_settings.tabs.team")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company">
            <CompanyProfileTab />
          </TabsContent>

          <TabsContent value="leave">
            <LeavePoliciesTab />
          </TabsContent>

          <TabsContent value="team">
            <UserManagementTab />
          </TabsContent>
        </Tabs>
      </div>
    </PortalLayout>
  );
}
