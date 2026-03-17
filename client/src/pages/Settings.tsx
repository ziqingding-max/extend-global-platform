/*
 * GEA Admin — Settings (Consolidated)
 * Tabs: Payroll Config | Exchange Rates | User Management
 * Admin-only access for Exchange Rates and User Management
 */

import Layout from "@/components/Layout";
import { formatDate, formatDateISO, formatDateTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/DatePicker";
import {
  Settings as SettingsIcon, Users, Shield,
  CalendarClock, Clock, Play, Save, Loader2, CheckCircle2,
  ArrowLeftRight, Plus, Trash2, RefreshCw, Download,
  UserCog, ShieldCheck, User, AlertTriangle,
  Landmark, ClipboardList, Globe, Bell, Mail,
} from "lucide-react";
import { toast } from "sonner";
import BillingEntitiesSection from "./BillingEntities";

/**
 * Bug 15: Clipboard copy with fallback for non-HTTPS environments
 * navigator.clipboard.writeText only works in secure contexts (HTTPS).
 * Fallback uses a temporary textarea element.
 */
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback: create temporary textarea
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}
import AuditLogsSection from "./AuditLogs";
import CountriesContent from "@/components/pages/CountriesContent";
import NotificationSettingsSection from "@/components/pages/NotificationSettingsSection";
import { useI18n } from "@/lib/i18n";

export default function Settings() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <Layout breadcrumb={["GEA", "Settings"]}>
      <div className="p-6 space-y-6 page-enter">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("settings.description")}
          </p>
        </div>

        <Tabs defaultValue="countries" className="w-full">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="countries" className="gap-1.5">
              <Globe className="w-3.5 h-3.5" />{t("nav.countries")}
            </TabsTrigger>
            <TabsTrigger value="payroll" className="gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" />{t("settings.tabs.payrollConfig")}
            </TabsTrigger>
            <TabsTrigger value="exchange-rates" className="gap-1.5">
              <ArrowLeftRight className="w-3.5 h-3.5" />{t("settings.tabs.exchangeRates")}
            </TabsTrigger>
            <TabsTrigger value="billing-entities" className="gap-1.5">
              <Landmark className="w-3.5 h-3.5" />{t("settings.tabs.billingEntities")}
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="notifications" className="gap-1.5">
                <Bell className="w-3.5 h-3.5" />{lang === "zh" ? "通知设置" : "Notifications"}
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="users" className="gap-1.5">
                <UserCog className="w-3.5 h-3.5" />{t("settings.tabs.userManagement")}
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="audit-logs" className="gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" />{t("settings.tabs.auditLogs")}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="countries" className="mt-6">
            <CountriesContent />
          </TabsContent>

          <TabsContent value="payroll" className="mt-6">
            <PayrollConfigSection />
          </TabsContent>

          <TabsContent value="exchange-rates" className="mt-6">
            <ExchangeRatesSection />
          </TabsContent>

          <TabsContent value="billing-entities" className="mt-6">
            <BillingEntitiesSection embedded />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="notifications" className="mt-6">
              <NotificationSettingsSection />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="users" className="mt-6">
              <UserManagementSection />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="audit-logs" className="mt-6">
              <AuditLogsSection embedded />
            </TabsContent>
          )}

        </Tabs>
      </div>
    </Layout>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAYROLL CONFIGURATION
   ══════════════════════════════════════════════════════════════════════════════ */
function PayrollConfigSection() {
  const { t } = useI18n();
  const { data: configs, isLoading, refetch } = trpc.systemSettings.list.useQuery();
  const { data: cronJobs, isLoading: cronLoading, refetch: refetchCron } = trpc.systemSettings.listCronJobs.useQuery();

  const updateMutation = trpc.systemSettings.update.useMutation({
    onSuccess: () => {
      toast.success(t("settings.payroll.toast.updateSuccess"));
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const updateCronMutation = trpc.systemSettings.updateCronJob.useMutation({
    onSuccess: () => {
      toast.success("Job configuration updated");
      refetchCron();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const triggerCronMutation = trpc.systemSettings.triggerCronJob.useMutation({
    onSuccess: (_data: any, variables: any) => {
      toast.success(`Job "${variables.key}" executed successfully`);
      refetchCron();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Business rule states
  const [cutoffDay, setCutoffDay] = useState("4");
  const [cutoffTime, setCutoffTime] = useState("23:59");
  const [midMonthCutoff, setMidMonthCutoff] = useState("15");

  // Track which cron job is being edited inline
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [editDay, setEditDay] = useState("");
  const [editTime, setEditTime] = useState("");
  // Track which job is currently being triggered
  const [triggeringJob, setTriggeringJob] = useState<string | null>(null);

  useEffect(() => {
    if (configs) {
      const configMap = new Map<string, string>(configs.map((c: any) => [c.configKey, c.configValue]));
      setCutoffDay(configMap.get("payroll_cutoff_day") ?? "4");
      setCutoffTime(configMap.get("payroll_cutoff_time") ?? "23:59");
      setMidMonthCutoff(configMap.get("mid_month_activation_cutoff") ?? "15");
    }
  }, [configs]);

  const handleSaveBusinessRules = async () => {
    const updates = [
      { key: "payroll_cutoff_day", value: cutoffDay },
      { key: "payroll_cutoff_time", value: cutoffTime },
      { key: "mid_month_activation_cutoff", value: midMonthCutoff },
    ];
    for (const u of updates) {
      await updateMutation.mutateAsync(u);
    }
  };

  const handleToggleJob = async (key: string, enabled: boolean) => {
    await updateCronMutation.mutateAsync({ key, enabled });
  };

  const handleSaveJobSchedule = async (key: string) => {
    const payload: { key: string; day?: number; time?: string } = { key };
    if (editDay) payload.day = parseInt(editDay, 10);
    if (editTime) payload.time = editTime;
    await updateCronMutation.mutateAsync(payload);
    setEditingJob(null);
  };

  const handleTriggerJob = async (key: string) => {
    setTriggeringJob(key);
    try {
      await triggerCronMutation.mutateAsync({ key });
    } finally {
      setTriggeringJob(null);
    }
  };

  const startEditing = (job: any) => {
    setEditingJob(job.key);
    setEditDay(String(job.day));
    setEditTime(job.time);
  };

  if (isLoading || cronLoading) {
    return (
      <div className="space-y-6 max-w-4xl animate-pulse-subtle p-6">
        <div className="space-y-2">
          <div className="h-6 w-40 bg-muted rounded" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-card border rounded-lg p-6 space-y-4">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-10 w-full bg-muted rounded" />
            <div className="h-10 w-full bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Section 1: Business Rules ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Business Rules
          </CardTitle>
          <CardDescription>
            Core business parameters that control data submission deadlines and employee onboarding rules. These are NOT cron job schedules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Payroll Cutoff */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              {t("settings.payroll.cutoff.title")}
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              {t("settings.payroll.cutoff.description")} This is the deadline for clients and employees to submit data. Admin users are NOT restricted by this cutoff.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">{t("settings.payroll.cutoff.dayLabel")}</Label>
                <Input type="number" min={1} max={28} value={cutoffDay} onChange={(e) => setCutoffDay(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("settings.payroll.cutoff.timeLabel")}</Label>
                <Input type="time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border-t" />

          {/* Mid-Month Activation Cutoff */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
              {t("settings.payroll.activation.title")}
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              {t("settings.payroll.activation.midMonthCutoffDescription")} Employees activated after this day will receive a Sign-on Bonus in the following month.
            </p>
            <div className="max-w-xs space-y-1">
              <Label className="text-xs">{t("settings.payroll.activation.midMonthCutoffLabel")}</Label>
              <Input type="number" min={1} max={28} value={midMonthCutoff} onChange={(e) => setMidMonthCutoff(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSaveBusinessRules} disabled={updateMutation.isPending} size="sm">
              {updateMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" />Save Business Rules</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Scheduled Jobs ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            Scheduled Jobs
          </CardTitle>
          <CardDescription>
            All automated background tasks. Toggle jobs on/off, adjust their schedule, or trigger them manually. Changes take effect immediately (hot-reload).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(cronJobs ?? []).map((job: any) => (
              <div key={job.key} className="flex items-start gap-4 py-3 px-4 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                {/* Toggle */}
                <div className="pt-0.5">
                  <Switch
                    checked={job.enabled}
                    onCheckedChange={(checked) => handleToggleJob(job.key, checked)}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium">{job.label}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {job.frequency === "daily" ? "Daily" : "Monthly"}
                    </Badge>
                    {!job.enabled && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                        Disabled
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{job.description}</p>

                  {/* Schedule display / edit */}
                  {editingJob === job.key ? (
                    <div className="flex items-center gap-2 mt-2">
                      {job.frequency === "monthly" && (
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-muted-foreground">Day:</Label>
                          <Input
                            type="number" min={1} max={28}
                            value={editDay}
                            onChange={(e) => setEditDay(e.target.value)}
                            className="w-16 h-7 text-xs"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Label className="text-xs text-muted-foreground">Time:</Label>
                        <Input
                          type="time"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className="w-24 h-7 text-xs"
                        />
                      </div>
                      <Button size="sm" variant="default" className="h-7 text-xs px-2" onClick={() => handleSaveJobSchedule(job.key)} disabled={updateCronMutation.isPending}>
                        {updateCronMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        <span className="ml-1">Save</span>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingJob(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-muted-foreground">
                        {job.frequency === "monthly"
                          ? `Runs on the ${job.day}${job.day === 1 ? "st" : job.day === 2 ? "nd" : job.day === 3 ? "rd" : "th"} at ${job.time} (Beijing)`
                          : `Runs daily at ${job.time} (Beijing)`
                        }
                      </span>
                      <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground" onClick={() => startEditing(job)}>
                        Edit
                      </Button>
                      {job.lastRun && (
                        <span className="text-[10px] text-muted-foreground">
                          Last run: {new Date(job.lastRun).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Run Now button */}
                <div className="pt-0.5">
                  <Button
                    variant="outline" size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleTriggerJob(job.key)}
                    disabled={triggeringJob === job.key}
                  >
                    {triggeringJob === job.key ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    <span className="ml-1">Run Now</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   EXCHANGE RATES (moved from standalone page)
   All rates are USD → XXX direction with global markup
   ══════════════════════════════════════════════════════════════════════════════ */
function ExchangeRatesSection() {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [showMarkupEdit, setShowMarkupEdit] = useState(false);
  const [markupInput, setMarkupInput] = useState("");
  const [form, setForm] = useState({
    toCurrency: "", rate: "", effectiveDate: "", source: "manual",
  });

  const { data: ratesData, refetch } = trpc.exchangeRates.list.useQuery({ limit: 200 });
  const { data: markupData, refetch: refetchMarkup } = trpc.exchangeRates.getMarkup.useQuery();

  const upsertMut = trpc.exchangeRates.upsert.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); toast.success("Exchange rate saved"); },
    onError: (err: any) => toast.error(`Failed to save rate: ${err.message}`),
  });
  const deleteMut = trpc.exchangeRates.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Exchange rate deleted"); },
    onError: (err: any) => toast.error(`Failed to delete rate: ${err.message}`),
  });
  const fetchLiveMut = trpc.exchangeRates.fetchLive.useMutation({
    onSuccess: (data: any) => {
      refetch();
      if (data.success) {
        toast.success(`Fetched ${data.ratesStored} live rates from ECB (${data.date})`);
      } else {
        toast.warning(`Fetched ${data.ratesStored} rates with ${data.errors?.length || 0} warnings`);
      }
      if (data.unsupported && data.unsupported.length > 0) {
        toast.info(`Unsupported currencies (need manual entry): ${data.unsupported.join(", ")}`);
      }
    },
    onError: (err: any) => toast.error(`Failed to fetch live rates: ${err.message}`),
  });
  const setMarkupMut = trpc.exchangeRates.setMarkup.useMutation({
    onSuccess: () => {
      refetchMarkup();
      setShowMarkupEdit(false);
      toast.success("Global markup percentage updated");
    },
    onError: (err: any) => toast.error(`Failed to update markup: ${err.message}`),
  });

  const rates = ratesData?.data ?? [];
  const currentMarkup = markupData?.markupPercentage ?? 5;

  const handleSubmit = () => {
    const rateNum = parseFloat(form.rate);
    if (isNaN(rateNum) || rateNum <= 0) { toast.error("Please enter a valid rate"); return; }
    if (!form.toCurrency.trim()) { toast.error("Please enter a target currency"); return; }
    upsertMut.mutate({
      fromCurrency: "USD",
      toCurrency: form.toCurrency.toUpperCase().trim(),
      rate: rateNum,
      effectiveDate: form.effectiveDate || undefined,
      source: form.source || "manual",
    });
  };

  const handleMarkupSave = () => {
    const val = parseFloat(markupInput);
    if (isNaN(val) || val < 0 || val > 50) {
      toast.error("Markup must be between 0% and 50%");
      return;
    }
    setMarkupMut.mutate({ markupPercentage: val });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("settings.tabs.exchangeRates")}</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            All rates are USD → Local Currency. Markup protects against FX risk.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button
            variant="outline"
            onClick={() => fetchLiveMut.mutate()}
            disabled={fetchLiveMut.isPending}
          >
            {fetchLiveMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Fetch Live Rates (ECB)
          </Button>
          <Button onClick={() => {
            setForm({ toCurrency: "", rate: "", effectiveDate: formatDateISO(new Date()), source: "manual" });
            setShowCreate(true);
          }}>
            <Plus className="w-4 h-4 mr-2" /> Add Rate
          </Button>
        </div>
      </div>

      {/* Global Markup Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-medium">{t("settings.exchangeRates.globalMarkup")}</div>
                <div className="text-xs text-muted-foreground">
                  Applied to all rates. Ensures you collect more USD than you pay in local currency.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">{currentMarkup}%</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setMarkupInput(currentMarkup.toString()); setShowMarkupEdit(true); }}
              >
                Adjust
              </Button>
            </div>
          </div>
          <div className="mt-3 bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
            <strong>How it works:</strong> If USD→EUR raw rate is 0.92, with {currentMarkup}% markup the effective rate becomes {(0.92 * (1 - currentMarkup / 100)).toFixed(4)}.
            Each USD buys less EUR, so converting employee EUR costs back to USD yields a higher invoice amount.
            Example: €5,000 cost → Without markup: ${(5000 / 0.92).toFixed(0)} → With {currentMarkup}%: ${(5000 / (0.92 * (1 - currentMarkup / 100))).toFixed(0)} (${((5000 / (0.92 * (1 - currentMarkup / 100))) - (5000 / 0.92)).toFixed(0)} extra)
          </div>
        </CardContent>
      </Card>

      {/* Info banner about auto-fetch */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
        <ArrowLeftRight className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800 dark:text-blue-300">
          <span className="font-medium">Auto-fetch enabled:</span> Exchange rates are automatically fetched daily at 00:05 Beijing time from the European Central Bank (ECB) via Frankfurter API.
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">From</th>
                  <th className="text-left p-3 font-medium">To</th>
                  <th className="text-right p-3 font-medium">Raw Rate</th>
                  <th className="text-right p-3 font-medium">Rate with Markup</th>
                  <th className="text-center p-3 font-medium">Markup %</th>
                  <th className="text-left p-3 font-medium">{t("settings.exchangeRates.table.effectiveDate")}</th>
                  <th className="text-left p-3 font-medium">{t("settings.exchangeRates.table.source")}</th>
                  <th className="text-right p-3 font-medium">{t("settings.userManagement.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate: any) => (
                  <tr key={rate.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono font-medium">{rate.fromCurrency}</td>
                    <td className="p-3 font-mono font-medium">{rate.toCurrency}</td>
                    <td className="p-3 text-right font-mono">{parseFloat(rate.rate).toFixed(6)}</td>
                    <td className="p-3 text-right font-mono text-primary">{parseFloat(rate.rateWithMarkup).toFixed(6)}</td>
                    <td className="p-3 text-center">
                      <Badge variant="secondary" className="text-xs">{parseFloat(rate.markupPercentage).toFixed(1)}%</Badge>
                    </td>
                    <td className="p-3">{formatDate(rate.effectiveDate)}</td>
                    <td className="p-3">
                      <Badge
                        variant={rate.source === "frankfurter_ecb" ? "default" : "outline"}
                        className="text-xs"
                      >
                        {rate.source === "frankfurter_ecb" ? "ECB" : rate.source || "manual"}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                        if (confirm("Delete this exchange rate?")) deleteMut.mutate({ id: rate.id });
                      }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {rates.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      <ArrowLeftRight className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      No exchange rates configured. Click "Fetch Live Rates" to pull ECB rates.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Rate Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.exchangeRates.addDialog.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("settings.exchangeRates.addDialog.description")}</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("settings.exchangeRates.addDialog.fromCurrencyLabel")}</Label>
              <Input value="USD" disabled className="bg-muted font-mono" />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.exchangeRates.addDialog.toCurrencyLabel")}</Label>
              <Input
                value={form.toCurrency}
                onChange={e => setForm(f => ({ ...f, toCurrency: e.target.value }))}
                placeholder="EUR"
                maxLength={3}
                className="font-mono uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.exchangeRates.addDialog.rateLabel")}</Label>
              <Input type="number" step="0.000001" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="0.920000" />
              <p className="text-xs text-muted-foreground">{t("settings.exchangeRates.addDialog.rateDescription")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("settings.exchangeRates.table.effectiveDate")}</Label>
              <DatePicker value={form.effectiveDate} onChange={(date) => setForm(f => ({ ...f, effectiveDate: date }))} placeholder="Select date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.toCurrency || !form.rate || upsertMut.isPending}>
              {upsertMut.isPending ? "Saving..." : "Save Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Markup Edit Dialog */}
      <Dialog open={showMarkupEdit} onOpenChange={setShowMarkupEdit}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("settings.exchangeRates.markupDialog.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This markup is applied to all exchange rates to hedge FX risk.
            New rates fetched from ECB will use this value.
          </p>
          <div className="space-y-2">
            <Label>{t("settings.exchangeRates.markupDialog.label")}</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="50"
              value={markupInput}
              onChange={e => setMarkupInput(e.target.value)}
              placeholder="5.00"
            />
            <p className="text-xs text-muted-foreground">
              Recommended: 3-5%. Higher values provide more FX protection but increase client costs.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkupEdit(false)}>Cancel</Button>
            <Button onClick={handleMarkupSave} disabled={setMarkupMut.isPending}>
              {setMarkupMut.isPending ? "Saving..." : "Save Markup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   USER MANAGEMENT (moved from standalone page, admin-only)
   ══════════════════════════════════════════════════════════════════════════════ */
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  customer_manager: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  operations_manager: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  finance_manager: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  user: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

import { parseRoles, serializeRoles, formatRoles, ROLE_LABELS, MANAGER_ROLES, EXCLUSIVE_ROLES, type RoleValue } from "@shared/roles";
import { Checkbox } from "@/components/ui/checkbox";

import { Copy, UserPlus, Send, KeyRound } from "lucide-react";
import { ALL_ROLES } from "@shared/roles";

function UserManagementSection() {
  const { t } = useI18n();
  const [editUser, setEditUser] = useState<any>(null);
  const [selectedRoles, setSelectedRoles] = useState<RoleValue[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", name: "", roles: [] as RoleValue[] });
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string } | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<any>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<{ temporaryPassword: string; userName: string; userEmail: string } | null>(null);

  const { data: usersData, refetch } = trpc.userManagement.list.useQuery({ limit: 100, offset: 0 });
  const updateRoleMut = trpc.userManagement.updateRole.useMutation({
    onSuccess: () => { refetch(); setEditUser(null); toast.success("User role updated"); },
    onError: (err) => toast.error(err.message),
  });
  const toggleActiveMut = trpc.userManagement.toggleActive.useMutation({
    onSuccess: () => { refetch(); toast.success("User status updated"); },
    onError: (err) => toast.error(err.message),
  });
  const inviteMut = trpc.userManagement.invite.useMutation({
    onSuccess: (data) => {
      refetch();
      setInviteResult({ inviteUrl: data.inviteUrl });
      toast.success("Invite created successfully");
    },
    onError: (err) => toast.error(err.message),
  });
  const resendInviteMut = trpc.userManagement.resendInvite.useMutation({
    onSuccess: (data) => {
      refetch();
      toast.success("Invitation email resent successfully");
      // Also copy link to clipboard as backup
      copyToClipboard(data.inviteUrl).catch(() => {});
    },
    onError: (err) => toast.error(err.message),
  });
  const resetPasswordMut = trpc.userManagement.resetPassword.useMutation({
    onSuccess: (data) => {
      refetch();
      setResetPasswordResult({
        temporaryPassword: data.temporaryPassword,
        userName: data.userName || "User",
        userEmail: data.userEmail || "",
      });
      toast.success("Password has been reset");
    },
    onError: (err) => toast.error(err.message),
  });

  const users = usersData?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("settings.tabs.userManagement")}</h2>
        <p className="text-muted-foreground text-sm mt-0.5">
          Manage system users, assign roles, and control access permissions. Only administrators can access this section.
        </p>
      </div>

      {/* Role permissions card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Role Permissions
          </CardTitle>
          <CardDescription>{t("settings.userManagement.permissions.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border bg-red-50/50 dark:bg-red-950/20">
              <div className="font-medium text-sm flex items-center gap-1.5 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-red-600" /> Admin
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.userManagement.permissions.admin.description")}</p>
            </div>
            <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20">
              <div className="font-medium text-sm flex items-center gap-1.5 mb-1">
                <Users className="w-3.5 h-3.5 text-blue-600" /> Customer Manager
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.userManagement.permissions.customerManager.description")}</p>
            </div>
            <div className="p-3 rounded-lg border bg-green-50/50 dark:bg-green-950/20">
              <div className="font-medium text-sm flex items-center gap-1.5 mb-1">
                <UserCog className="w-3.5 h-3.5 text-green-600" /> Operations Manager
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.userManagement.permissions.operationsManager.description")}</p>
            </div>
            <div className="p-3 rounded-lg border bg-purple-50/50 dark:bg-purple-950/20">
              <div className="font-medium text-sm flex items-center gap-1.5 mb-1">
                <ArrowLeftRight className="w-3.5 h-3.5 text-purple-600" /> Finance Manager
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.userManagement.permissions.financeManager.description")}</p>
            </div>
            <div className="p-3 rounded-lg border bg-gray-50/50 dark:bg-gray-950/20">
              <div className="font-medium text-sm flex items-center gap-1.5 mb-1">
                <User className="w-3.5 h-3.5 text-gray-600" /> User (Read-Only)
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.userManagement.permissions.user.description")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invite button */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex-1 mr-4">
          <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <span className="font-medium">Adding new users:</span> Click "Invite User" to send an invite link. The invited user will set their password and activate their account.
          </div>
        </div>
        <Button onClick={() => { setShowInvite(true); setInviteForm({ email: "", name: "", roles: [] }); setInviteResult(null); }} className="gap-2 flex-shrink-0">
          <UserPlus className="w-4 h-4" /> Invite User
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">{t("settings.userManagement.table.user")}</th>
                  <th className="text-left p-3 font-medium">Email</th>
                  <th className="text-left p-3 font-medium">Role</th>
                  <th className="text-center p-3 font-medium">{t("settings.userManagement.table.status")}</th>
                  <th className="text-left p-3 font-medium">{t("settings.userManagement.table.lastLogin")}</th>
                  <th className="text-right p-3 font-medium">{t("settings.userManagement.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-medium">{u.name || "Unnamed"}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{u.email || "-"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {parseRoles(u.role).map((r: string) => (
                          <Badge key={r} className={`text-xs ${ROLE_COLORS[r] || ""}`} variant="outline">
                            {ROLE_LABELS[r] || r}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <Switch
                        checked={u.isActive}
                        onCheckedChange={(checked) => toggleActiveMut.mutate({ id: u.id, isActive: checked })}
                      />
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {formatDateTime(u.lastSignedIn)}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!u.isActive && u.inviteToken && (
                          <Button variant="outline" size="sm" onClick={() => resendInviteMut.mutate({ id: u.id })} disabled={resendInviteMut.isPending}>
                            <Send className="w-3 h-3 mr-1" /> Resend Invite
                          </Button>
                        )}
                        {u.isActive && u.loginMethod === "password" && (
                          <Button variant="outline" size="sm" onClick={() => { setResetPasswordUser(u); setResetPasswordResult(null); }}>
                            <KeyRound className="w-3 h-3 mr-1" /> Reset Password
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => { setEditUser(u); setSelectedRoles(parseRoles(u.role)); }}>
                          <ShieldCheck className="w-3 h-3 mr-1" /> Change Role
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      <UserCog className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-sm">{t("settings.userManagement.table.user")}</Label>
              <p className="font-medium">{editUser?.name || "Unnamed"} ({editUser?.email})</p>
            </div>
            <div className="space-y-3">
              <Label>Role</Label>
              <p className="text-xs text-muted-foreground">Admin and User are exclusive. Manager roles (Customer, Operations, Finance) can be combined.</p>
              <div className="space-y-2">
                {/* Exclusive roles */}
                {EXCLUSIVE_ROLES.map((role) => {
                  const checked = selectedRoles.includes(role);
                  const disabled = !checked && selectedRoles.some(r => r !== role);
                  return (
                    <label key={role} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${checked ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(c) => {
                          if (c) setSelectedRoles([role]);
                          else setSelectedRoles([]);
                        }}
                      />
                      <div>
                        <span className="text-sm font-medium">{ROLE_LABELS[role]}</span>
                        {role === 'admin' && <span className="text-xs text-muted-foreground ml-2">Full access</span>}
                        {role === 'user' && <span className="text-xs text-muted-foreground ml-2">Read-only</span>}
                      </div>
                    </label>
                  );
                })}
                {/* Divider */}
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">Manager Roles (can combine)</span></div>
                </div>
                {/* Manager roles */}
                {MANAGER_ROLES.map((role) => {
                  const checked = selectedRoles.includes(role);
                  const hasExclusive = selectedRoles.some(r => EXCLUSIVE_ROLES.includes(r));
                  return (
                    <label key={role} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${checked ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'} ${hasExclusive ? 'opacity-40 cursor-not-allowed' : ''}`}>
                      <Checkbox
                        checked={checked}
                        disabled={hasExclusive}
                        onCheckedChange={(c) => {
                          if (c) setSelectedRoles([...selectedRoles.filter(r => !EXCLUSIVE_ROLES.includes(r)), role]);
                          else setSelectedRoles(selectedRoles.filter(r => r !== role));
                        }}
                      />
                      <span className="text-sm font-medium">{ROLE_LABELS[role]}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            {selectedRoles.length > 0 && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                Selected: {selectedRoles.map(r => ROLE_LABELS[r]).join(", ")}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button
              onClick={() => updateRoleMut.mutate({ id: editUser.id, roles: selectedRoles })}
              disabled={updateRoleMut.isPending || selectedRoles.length === 0}
            >
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPasswordUser} onOpenChange={(open) => { if (!open) { setResetPasswordUser(null); setResetPasswordResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
          </DialogHeader>

          {resetPasswordResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Password Reset Successfully!</span>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  A temporary password has been generated for <strong>{resetPasswordResult.userName}</strong> ({resetPasswordResult.userEmail}).
                  Share it securely with the user. They will be required to change it on next login.
                </p>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("settings.userManagement.resetPasswordResult.passwordLabel")}</Label>
                  <div className="flex items-center gap-2">
                    <Input value={resetPasswordResult.temporaryPassword} readOnly className="font-mono text-sm" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        copyToClipboard(resetPasswordResult.temporaryPassword).then(() => toast.success("Password copied to clipboard"));
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>Security Note:</strong> This password is shown only once. Make sure to copy it now and share it through a secure channel.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => { setResetPasswordUser(null); setResetPasswordResult(null); }}>{t("settings.userManagement.inviteResult.doneButton")}</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This will generate a new temporary password for <strong>{resetPasswordUser?.name || "this user"}</strong> ({resetPasswordUser?.email}).
                The user will be required to change their password on next login.
              </p>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>Warning:</strong> This action will immediately invalidate the user's current password. They will not be able to log in with their old password.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setResetPasswordUser(null); setResetPasswordResult(null); }}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={() => resetPasswordMut.mutate({ id: resetPasswordUser.id })}
                  disabled={resetPasswordMut.isPending}
                >
                  {resetPasswordMut.isPending ? "Resetting..." : "Reset Password"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <Dialog open={showInvite} onOpenChange={(open) => { if (!open) { setShowInvite(false); setInviteResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.userManagement.inviteDialog.title")}</DialogTitle>
          </DialogHeader>

          {inviteResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Invitation Sent!</span>
              </div>
              <p className="text-sm text-muted-foreground">
                An invitation email has been sent to the user. They can also use the link below to set their password and activate their account.
              </p>
              <div className="flex items-center gap-2">
                <Input value={inviteResult.inviteUrl} readOnly className="text-xs" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    copyToClipboard(inviteResult.inviteUrl).then(() => toast.success("Link copied to clipboard"));
                  }}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => { setShowInvite(false); setInviteResult(null); }}>{t("settings.userManagement.inviteResult.doneButton")}</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="user@company.com"
                />
              </div>
              <div className="space-y-3">
                <Label>Role *</Label>
                <p className="text-xs text-muted-foreground">Admin and User are exclusive. Manager roles can be combined.</p>
                <div className="space-y-2">
                  {EXCLUSIVE_ROLES.map((role) => {
                    const checked = inviteForm.roles.includes(role);
                    const disabled = !checked && inviteForm.roles.some(r => r !== role);
                    return (
                      <label key={role} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${checked ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        <Checkbox
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(c) => {
                            if (c) setInviteForm(f => ({ ...f, roles: [role] }));
                            else setInviteForm(f => ({ ...f, roles: [] }));
                          }}
                        />
                        <div>
                          <span className="text-sm font-medium">{ROLE_LABELS[role]}</span>
                          {role === 'admin' && <span className="text-xs text-muted-foreground ml-2">Full access</span>}
                          {role === 'user' && <span className="text-xs text-muted-foreground ml-2">Read-only</span>}
                        </div>
                      </label>
                    );
                  })}
                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">Manager Roles (can combine)</span></div>
                  </div>
                  {MANAGER_ROLES.map((role) => {
                    const checked = inviteForm.roles.includes(role);
                    const hasExclusive = inviteForm.roles.some(r => EXCLUSIVE_ROLES.includes(r));
                    return (
                      <label key={role} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${checked ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'} ${hasExclusive ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        <Checkbox
                          checked={checked}
                          disabled={hasExclusive}
                          onCheckedChange={(c) => {
                            if (c) setInviteForm(f => ({ ...f, roles: [...f.roles.filter(r => !EXCLUSIVE_ROLES.includes(r)), role] }));
                            else setInviteForm(f => ({ ...f, roles: f.roles.filter(r => r !== role) }));
                          }}
                        />
                        <span className="text-sm font-medium">{ROLE_LABELS[role]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
                <Button
                  onClick={() => inviteMut.mutate(inviteForm)}
                  disabled={inviteMut.isPending || !inviteForm.email || !inviteForm.name || inviteForm.roles.length === 0}
                >
                  {inviteMut.isPending ? "Sending..." : "Send Invite"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

