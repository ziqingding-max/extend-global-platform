import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { 
  Bell, Mail, Edit, Loader2, Save
} from "lucide-react";
import { toast } from "sonner";
import { MultiSelect } from "@/components/ui/multi-select";
import ErrorBoundary from "@/components/ErrorBoundary";

// Type definitions
type NotificationChannel = "email" | "in_app";

type TemplateConfig = {
  emailSubject: string;
  emailBody: string;
  inAppMessage: string;
};

type NotificationRule = {
  enabled: boolean;
  channels: NotificationChannel[];
  recipients: string[];
  templates: {
    en: TemplateConfig;
    zh: TemplateConfig;
  };
};

type NotificationSettings = Record<string, NotificationRule>;

const EVENT_LABELS: Record<string, string> = {
  invoice_sent: "Invoice Sent",
  invoice_overdue: "Invoice Overdue",
  payroll_draft_created: "Payroll Draft Ready",
  new_employee_request: "New Employee Request",
  worker_invite: "Worker Invite",
  worker_invoice_ready: "Worker Invoice Ready",
  worker_payment_sent: "Worker Payment Sent",
  leave_policy_country_activated: "Leave Policy Country Activated",
  employee_termination_request: "Employee Termination Request",
  contractor_termination_request: "Contractor Termination Request",
};

const EVENT_DESCRIPTIONS: Record<string, string> = {
  invoice_sent: "Triggered when an invoice is sent to a customer.",
  invoice_overdue: "Triggered daily for invoices past their due date.",
  payroll_draft_created: "Triggered when monthly payroll draft is auto-generated.",
  new_employee_request: "Triggered when a customer submits a new employee onboarding request.",
  worker_invite: "Triggered when a new worker is invited to the portal.",
  worker_invoice_ready: "Triggered when a worker's payslip or invoice is ready for review.",
  worker_payment_sent: "Triggered when a worker's payment has been processed.",
  leave_policy_country_activated: "Triggered when a country's leave policy is activated.",
  employee_termination_request: "Triggered when a portal client requests employee termination.",
  contractor_termination_request: "Triggered when a portal client requests contractor termination.",
};

const AVAILABLE_RECIPIENTS = [
  { value: "client:finance", label: "Client: Finance" },
  { value: "client:admin", label: "Client: Admin" },
  { value: "client:hr_manager", label: "Client: HR Manager" },
  { value: "admin:customer_manager", label: "EG: Customer Manager" },
  { value: "admin:operations_manager", label: "EG: Ops Manager" },
  { value: "admin:finance_manager", label: "EG: Finance Manager" },
  { value: "admin:admin", label: "EG: Admin" },
  { value: "worker:user", label: "Worker: User" },
];

function NotificationSettingsContent() {
  const [settings, setSettings] = useState<NotificationSettings>({});
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ channels: NotificationChannel[]; recipients: string[] } | null>(null);
  
  const { data: serverSettings, isLoading, refetch } = trpc.notifications.getSettings.useQuery();
  
  const updateMutation = trpc.notifications.updateRule.useMutation({
    onSuccess: () => {
      toast.success("Notification settings updated");
      refetch();
      setEditingType(null);
    },
    onError: (err) => {
      toast.error(`Failed to update settings: ${err.message}`);
    }
  });

  useEffect(() => {
    if (serverSettings) {
      setSettings(serverSettings as NotificationSettings);
    }
  }, [serverSettings]);

  const handleToggleEnabled = (type: string, enabled: boolean) => {
    const rule = settings[type];
    if (!rule) return;
    
    updateMutation.mutate({
      type,
      config: { ...rule, enabled }
    });
  };

  const handleEditClick = (type: string) => {
    const rule = settings[type];
    if (!rule) return;
    setEditingType(type);
    setEditForm({
      channels: [...(rule.channels || [])],
      recipients: [...(rule.recipients || [])],
    });
  };

  const handleSaveEdit = () => {
    if (!editingType || !editForm) return;
    const rule = settings[editingType];
    if (!rule) return;

    updateMutation.mutate({
      type: editingType,
      config: {
        ...rule,
        channels: editForm.channels,
        recipients: editForm.recipients,
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const groups: Record<string, string[]> = {
    "Finance": ["invoice_sent", "invoice_overdue"],
    "Payroll": ["payroll_draft_created"],
    "Onboarding": ["new_employee_request"],
    "Worker Portal": ["worker_invite", "worker_invoice_ready", "worker_payment_sent"],
    "Offboarding": ["employee_termination_request", "contractor_termination_request"],
    "Leave": ["leave_policy_country_activated"],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Notification Rules</h2>
          <p className="text-sm text-muted-foreground">
            Control notification toggles, delivery channels, and recipients. Email templates are managed by the system to ensure brand consistency.
          </p>
        </div>
      </div>

      {Object.entries(groups).map(([category, types]) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{category} Notifications</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-4 font-medium w-[250px]">Event</th>
                    <th className="p-4 font-medium w-[150px]">Channels</th>
                    <th className="p-4 font-medium">Recipients</th>
                    <th className="p-4 font-medium w-[100px] text-center">Status</th>
                    <th className="p-4 font-medium w-[100px] text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map(type => {
                    const rule = settings[type];
                    if (!rule) return null;
                    
                    return (
                      <tr key={type} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-4">
                          <div className="font-medium">{EVENT_LABELS[type] || type}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {EVENT_DESCRIPTIONS[type] || ""}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <Badge variant={rule.channels?.includes("email") ? "default" : "outline"} className="gap-1">
                              <Mail className="w-3 h-3" /> Email
                            </Badge>
                            <Badge variant={rule.channels?.includes("in_app") ? "default" : "outline"} className="gap-1">
                              <Bell className="w-3 h-3" /> In-App
                            </Badge>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {(rule.recipients || []).map(r => {
                              const recipient = AVAILABLE_RECIPIENTS.find(rec => rec.value === r);
                              return (
                                <Badge key={r} variant="secondary" className="text-xs font-mono">
                                  {recipient ? recipient.label : r}
                                </Badge>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <Switch 
                            checked={rule.enabled}
                            onCheckedChange={(checked) => handleToggleEnabled(type, checked)}
                          />
                        </td>
                        <td className="p-4 text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleEditClick(type)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Edit Dialog — Channels & Recipients only */}
      <Dialog open={!!editingType} onOpenChange={(open) => !open && setEditingType(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit Notification Rule: {editingType ? (EVENT_LABELS[editingType] || editingType) : ""}
            </DialogTitle>
            <DialogDescription>
              Configure delivery channels and recipients for this notification.
            </DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="space-y-6 py-4">
              {/* Channels */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Delivery Channels</Label>
                <div className="flex flex-col gap-3 border p-4 rounded-md">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Switch 
                      checked={(editForm.channels || []).includes("email")}
                      onCheckedChange={(c) => {
                        const current = editForm.channels || [];
                        const updated = c 
                          ? [...current, "email" as const]
                          : current.filter(ch => ch !== "email");
                        setEditForm({ ...editForm, channels: updated });
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span>Email Notification</span>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Switch 
                      checked={(editForm.channels || []).includes("in_app")}
                      onCheckedChange={(c) => {
                        const current = editForm.channels || [];
                        const updated = c 
                          ? [...current, "in_app" as const]
                          : current.filter(ch => ch !== "in_app");
                        setEditForm({ ...editForm, channels: updated });
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-muted-foreground" />
                      <span>In-App Notification</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Recipients */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Recipients</Label>
                <MultiSelect
                  options={AVAILABLE_RECIPIENTS.map(r => ({ value: r.value, label: r.label }))}
                  selected={editForm.recipients || []}
                  onChange={(selected: string[]) => setEditForm({ ...editForm, recipients: selected })}
                  placeholder="Select recipients..."
                />
                <p className="text-xs text-muted-foreground">
                  Notifications will be sent to all users matching these roles.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingType(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} className="gap-2">
              <Save className="w-4 h-4" />
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function NotificationSettingsSection() {
  return (
    <ErrorBoundary>
      <NotificationSettingsContent />
    </ErrorBoundary>
  );
}
