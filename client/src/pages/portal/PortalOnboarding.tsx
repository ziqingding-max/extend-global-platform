/**
 * Portal Onboarding — Unified Employee Onboarding
 *
 * Apple Liquid Glass inspired design:
 * - Frosted glass cards with backdrop-filter
 * - Soft shadows and subtle gradients
 * - Fluid animations and transitions
 * - Rounded, organic shapes
 *
 * Unified flow: single "New Onboarding" entry → choose path → wizard
 */
import { useState, useMemo } from "react";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { ALL_COUNTRIES } from "@/components/CountrySelect";
import CurrencySelect from "@/components/CurrencySelect";
import { toast } from "sonner";
import {
  UserPlus,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Upload,
  Send,
  X,
  FileText,
  Copy,
  Mail,
  Loader2,
  User,
  Briefcase,
  DollarSign,
  FileCheck,
  XCircle,
  Globe,
  Shield,
  Sparkles,
  ClipboardList,
  Link2,
  Trash2,
  Eye,
  Wallet,
} from "lucide-react";
import { getPortalOrigin, portalPath } from "@/lib/portalBasePath";
import { cn } from "@/lib/utils";
import { BankDetailsForm, BankDetails } from "@/components/forms/BankDetailsForm";

import { useI18n } from "@/lib/i18n";
// ── Status Configs ──
// statusConfig removed — employee records no longer shown on Onboarding page

const inviteStatusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Awaiting Response", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  completed: { label: "Submitted", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  expired: { label: "Expired", color: "bg-gray-50 text-gray-500 border-gray-200", icon: XCircle },
  cancelled: { label: "Cancelled", color: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
};

// ── Service Type Cards ──
const SERVICE_TYPES = [
  {
    id: "eor",
    title: "Employer of Record",
    shortTitle: "EOR",
    description: "We become the legal employer, handling payroll, taxes, and compliance so you can focus on managing your team.",
    icon: Globe,
    gradient: "from-emerald-500/20 to-teal-500/20",
    borderColor: "border-emerald-200/60",
    iconColor: "text-emerald-600",
    features: ["Full payroll management", "Tax compliance", "Benefits administration", "Employment contracts"],
  },
  {
    id: "aor",
    title: "Agent of Record",
    shortTitle: "AOR",
    description: "We act as your local agent, managing regulatory filings and compliance while you maintain the employment relationship.",
    icon: Shield,
    gradient: "from-blue-500/20 to-indigo-500/20",
    borderColor: "border-blue-200/60",
    iconColor: "text-blue-600",
    features: ["Regulatory compliance", "Local representation", "Filing management", "Advisory services"],
  },
  // Visa EOR is auto-detected based on nationality vs work country mismatch
  // No manual selection card needed
];

// ── Wizard Steps ──
const EMPLOYER_FILL_STEPS_EOR = [
  { id: 1, title: "Service", icon: Globe, description: "Choose service type" },
  { id: 2, title: "Personal Info", icon: User, description: "Basic details" },
  { id: 3, title: "Employment", icon: Briefcase, description: "Job & contract" },
  { id: 4, title: "Compensation", icon: DollarSign, description: "Salary details" },
  { id: 5, title: "Documents", icon: FileCheck, description: "Upload files" },
  { id: 6, title: "Bank Details", icon: Wallet, description: "Payment info" },
];

const EMPLOYER_FILL_STEPS_AOR = [
  { id: 1, title: "Service", icon: Globe, description: "Choose service type" },
  { id: 2, title: "Basic Info", icon: User, description: "Contractor details" },
  { id: 3, title: "Engagement", icon: Briefcase, description: "Scope & contract" },
  { id: 4, title: "Payment", icon: DollarSign, description: "Payment terms" },
  { id: 5, title: "Bank Details", icon: Wallet, description: "Payment info" },
];

const INVITE_STEPS = [
  { id: 1, title: "Service", icon: Globe, description: "Choose service type" },
  { id: 2, title: "Employer Info", icon: Briefcase, description: "Job & compensation" },
  { id: 3, title: "Send Invite", icon: Send, description: "Employee details" },
];

// AOR-specific invite steps (employer → client label)
const INVITE_STEPS_AOR = [
  { id: 1, title: "Service", icon: Globe, description: "Choose service type" },
  { id: 2, title: "Client Info", icon: Briefcase, description: "Job & compensation" },
  { id: 3, title: "Send Invite", icon: Send, description: "Worker details" },
];

interface OnboardingFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  idType: string;
  idNumber: string;
  address: string;
  country: string;
  city: string;
  state: string;
  postalCode: string;
  department: string;
  jobTitle: string;
  serviceType: string;
  employmentType: string;
  startDate: string;
  endDate: string;
  baseSalary: string;
  salaryCurrency: string;
  requiresVisa: boolean;
  // AOR-specific fields
  paymentFrequency: string;
  rateAmount: string;
  contractorCurrency: string;
  // Bank Details
  bankDetails: Partial<BankDetails>;
}

interface DocumentFile {
  type: string;
  name: string;
  file: File | null;
  base64: string;
  mimeType: string;
}

const initialFormData: OnboardingFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  gender: "",
  nationality: "",
  idType: "",
  idNumber: "",
  address: "",
  country: "",
  city: "",
  state: "",
  postalCode: "",
  department: "",
  jobTitle: "",
  serviceType: "",
  employmentType: "long_term",
  startDate: "",
  endDate: "",
  baseSalary: "",
  salaryCurrency: "USD",
  requiresVisa: false,
  paymentFrequency: "monthly",
  rateAmount: "",
  contractorCurrency: "USD",
  bankDetails: {},
};

// ── Glass Card Component ──
function GlassCard({ children, className, onClick, hover = false }: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-2xl border bg-white/60 backdrop-blur-xl shadow-sm",
        "transition-all duration-300 ease-out",
        hover && "cursor-pointer hover:shadow-lg hover:shadow-primary/5 hover:scale-[1.01] hover:border-primary/20",
        className
      )}
    >
      {children}
    </div>
  );
}

export default function PortalOnboarding() {
  const { t } = useI18n();
  // ── State ──
  const [mode, setMode] = useState<"list" | "choose-path" | "employer-fill" | "invite-flow">("list");
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<OnboardingFormData>(initialFormData);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  // Filter state removed — Onboarding page now only shows invites (pending + expired)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isAor = formData.serviceType === "aor";

  // ── Queries ──
  // Onboarding page only shows pending/expired invites — employees are managed in People page
  const { data: invites, isLoading: loadingInvites } = portalTrpc.employees.listOnboardingInvites.useQuery();
  const { data: countries } = portalTrpc.employees.availableCountries.useQuery();

  const utils = portalTrpc.useUtils();

  // ── Mutations ──
  const submitAorMutation = portalTrpc.contractors.submitOnboarding.useMutation({
    onSuccess: () => {
      toast.success("Contractor onboarding submitted successfully");
      utils.contractors.list.invalidate();
      resetAll();
    },
    onError: (err) => toast.error(err.message),
  });

  const submitMutation = portalTrpc.employees.submitOnboarding.useMutation({
    onSuccess: () => {
      toast.success(t("portal_onboarding.toast.onboarding_success"));
      utils.employees.list.invalidate();
      resetAll();
    },
    onError: (err) => toast.error(err.message),
  });

  const uploadDocMutation = portalTrpc.employees.uploadDocument.useMutation({
    onError: (err) => toast.error(`Document upload failed: ${err.message}`),
  });

  const sendInviteMutation = portalTrpc.employees.sendOnboardingInvite.useMutation({
    onSuccess: () => {
      toast.success(t("portal_onboarding.toast.invite_sent"));
      utils.employees.listOnboardingInvites.invalidate();
      resetAll();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelInviteMutation = portalTrpc.employees.cancelOnboardingInvite.useMutation({
    onSuccess: () => {
      toast.success(t("portal_onboarding.toast.invite_cancelled"));
      utils.employees.listOnboardingInvites.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const resendInviteMutation = portalTrpc.employees.resendOnboardingInvite.useMutation({
    onSuccess: (data) => {
      toast.success(t("portal_onboarding.toast.invite_resent"));
      utils.employees.listOnboardingInvites.invalidate();
      // Auto-copy the new link
      const link = buildSelfOnboardingInviteLink(data.token);
      navigator.clipboard.writeText(link);
      toast.info(t("portal_onboarding.toast.link_copied"));
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Computed ──
  // Only show pending and expired invites (completed/cancelled are hidden)
  const activeInvites = useMemo(() => {
    return (invites || []).filter((i) => {
      if (i.status === "completed" || i.status === "cancelled") return false;
      return true; // pending + expired
    });
  }, [invites]);

  const selectedCountry = useMemo(() => {
    return countries?.find((c) => c.countryCode === formData.country);
  }, [countries, formData.country]);

  const needsVisa = useMemo(() => {
    if (!formData.nationality || !formData.country) return false;
    return formData.nationality !== formData.country;
  }, [formData.nationality, formData.country]);

  const filteredItems = useMemo(() => {
    return activeInvites
      .map((i) => ({ type: "invite" as const, data: i, date: new Date(i.createdAt) }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [activeInvites]);

  // ── Helpers ──
  function resetAll() {
    setMode("list");
    setCurrentStep(1);
    setFormData(initialFormData);
    setDocuments([]);
    setInviteName("");
    setInviteEmail("");
  }

  function updateField(field: keyof OnboardingFormData, value: any) {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // Inline validation
      const errors = { ...fieldErrors };
      if (field === "email") {
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.email = "Please enter a valid email address";
        } else {
          delete errors.email;
        }
      }
      if (field === "startDate") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(value);
        start.setHours(0, 0, 0, 0);
        if (value && start < today) {
          errors.startDate = "Start date cannot be earlier than today";
        } else {
          delete errors.startDate;
        }
        // Also re-validate endDate against new startDate
        if (next.endDate && value) {
          const end = new Date(next.endDate);
          end.setHours(0, 0, 0, 0);
          if (end < start) {
            errors.endDate = "End date cannot be earlier than start date";
          } else {
            delete errors.endDate;
          }
        }
      }
      if (field === "endDate") {
        if (value && next.startDate) {
          const start = new Date(next.startDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(value);
          end.setHours(0, 0, 0, 0);
          if (end < start) {
            errors.endDate = "End date cannot be earlier than start date";
          } else {
            delete errors.endDate;
          }
        } else {
          delete errors.endDate;
        }
      }
      setFieldErrors(errors);
      return next;
    });
  }

  function handleFileChange(docType: string, docName: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setDocuments((prev) => {
        const existing = prev.findIndex((d) => d.type === docType);
        const newDoc: DocumentFile = { type: docType, name: docName, file, base64, mimeType: file.type };
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newDoc;
          return updated;
        }
        return [...prev, newDoc];
      });
    };
    reader.readAsDataURL(file);
  }

  function removeDocument(docType: string) {
    setDocuments((prev) => prev.filter((d) => d.type !== docType));
  }

  function copyInviteLink(token: string) {
    const link = buildSelfOnboardingInviteLink(token);
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied to clipboard");
  }

  async function handleSubmitOnboarding() {
    // Block submission if there are inline field errors
    if (Object.keys(fieldErrors).length > 0) {
      toast.error("Please fix the highlighted errors before submitting");
      return;
    }
    // Validation: start date must not be in the past
    if (formData.startDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(formData.startDate);
      start.setHours(0, 0, 0, 0);
      if (start < today) {
        toast.error("Start date cannot be earlier than today");
        return;
      }
    }
    // Validation: email format
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    // Validation: salary/amount must be positive
    if (!isAor && formData.baseSalary && Number(formData.baseSalary) <= 0) {
      toast.error("Base salary must be a positive number");
      return;
    }
    if (isAor && formData.rateAmount && Number(formData.rateAmount) <= 0) {
      toast.error("Payment amount must be a positive number");
      return;
    }
    // Validation: required documents must be uploaded (EOR/Visa EOR only)
    if (!isAor) {
      const requiredDocTypes = ["national_id"];
      if (needsVisa || formData.serviceType === "visa_eor") {
        requiredDocTypes.push("passport");
        requiredDocTypes.push("resume");
        requiredDocTypes.push("education");
      }
      const missingDocs = requiredDocTypes.filter(
        (docType) => !documents.find((d) => d.type === docType)
      );
      if (missingDocs.length > 0) {
        const labels = missingDocs.map((t) =>
          t === "national_id" ? "National ID" : t === "passport" ? "Passport" : t === "resume" ? "Resume" : t === "education" ? "Education Certificate" : t
        );
        toast.error(`Please upload required documents: ${labels.join(", ")}`);
        return;
      }
    }
    try {
      if (isAor) {
        // AOR → create contractor
        await submitAorMutation.mutateAsync({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone || undefined,
          nationality: formData.nationality || undefined,
          address: formData.address || undefined,
          country: formData.country,
          city: formData.city || undefined,
          state: formData.state || undefined,
          postalCode: formData.postalCode || undefined,
          department: formData.department || undefined,
          jobTitle: formData.jobTitle,
          startDate: formData.startDate,
          endDate: formData.endDate || undefined,
          paymentFrequency: (formData.paymentFrequency as any) || "monthly",
          rateAmount: formData.rateAmount || undefined,
          currency: formData.contractorCurrency || "USD",
          bankDetails: Object.keys(formData.bankDetails).length > 0 ? formData.bankDetails : undefined,
        });
      } else {
        // EOR / Visa EOR → create employee
        const result = await submitMutation.mutateAsync({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone || undefined,
          dateOfBirth: formData.dateOfBirth || undefined,
          gender: (formData.gender || undefined) as any,
          nationality: formData.nationality || undefined,
          idType: formData.idType || undefined,
          idNumber: formData.idNumber || undefined,
          address: formData.address || undefined,
          country: formData.country,
          city: formData.city || undefined,
          state: formData.state || undefined,
          postalCode: formData.postalCode || undefined,
          department: formData.department || undefined,
          jobTitle: formData.jobTitle,
          serviceType: (needsVisa && formData.serviceType === "eor" ? "visa_eor" : formData.serviceType) as any || "eor",
          employmentType: (formData.employmentType as any) || "long_term",
          startDate: formData.startDate,
          endDate: formData.endDate || undefined,
          baseSalary: formData.baseSalary,
          salaryCurrency: formData.salaryCurrency || "USD",
          requiresVisa: needsVisa || formData.requiresVisa || formData.serviceType === "visa_eor",
          bankDetails: Object.keys(formData.bankDetails).length > 0 ? formData.bankDetails : undefined,
        });

        if (documents.length > 0 && result.employeeId) {
          for (const doc of documents) {
            await uploadDocMutation.mutateAsync({
              employeeId: result.employeeId,
              documentType: doc.type as any,
              documentName: doc.name,
              fileBase64: doc.base64,
              fileName: doc.file?.name || doc.name,
              mimeType: doc.mimeType,
              fileSize: doc.file?.size,
            });
          }
        }
      }
    } catch (err) {
      // handled by mutation onError
    }
  }

  async function handleSendInvite() {
    sendInviteMutation.mutate({
      employeeName: inviteName,
      employeeEmail: inviteEmail,
      // Employer-provided fields from step 2
      serviceType: (formData.serviceType as any) || "eor",
      country: formData.country || undefined,
      jobTitle: formData.jobTitle || undefined,
      department: formData.department || undefined,
      startDate: formData.startDate || undefined,
      endDate: formData.endDate || undefined,
      employmentType: formData.employmentType || undefined,
      baseSalary: formData.baseSalary || undefined,
      salaryCurrency: formData.salaryCurrency || undefined,
      paymentFrequency: formData.paymentFrequency || undefined,
      rateAmount: formData.rateAmount || undefined,
      contractorCurrency: formData.contractorCurrency || undefined,
    });
  }

  // ═══════════════════════════════════════════════════
  // SERVICE SELECTION (Step 1 for both flows)
  // ═══════════════════════════════════════════════════
  const renderServiceSelection = () => (
    <div className="space-y-6 animate-page-in">
      <div className="text-center mb-8">
        <h3 className="text-xl font-semibold text-foreground">{t("portal_onboarding.service_selection.title")}</h3>
        <p className="text-sm text-muted-foreground mt-2">{t("portal_onboarding.service_selection.description")}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {SERVICE_TYPES.map((service) => {
          const isSelected = formData.serviceType === service.id;
          const Icon = service.icon;
          return (
            <GlassCard
              key={service.id}
              hover
              onClick={() => updateField("serviceType", service.id)}
              className={cn(
                "p-6 relative overflow-hidden",
                isSelected
                  ? "border-primary/40 bg-primary/5 shadow-md shadow-primary/10 ring-1 ring-primary/20"
                  : "border-border/50"
              )}
            >
              {/* Gradient overlay */}
              <div className={cn(
                "absolute inset-0 bg-gradient-to-br opacity-40 rounded-2xl",
                service.gradient
              )} />
              <div className="relative z-10">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
                  "bg-white/80 backdrop-blur-sm shadow-sm border border-white/60",
                )}>
                  <Icon className={cn("w-6 h-6", service.iconColor)} />
                </div>
                <h4 className="text-base font-semibold mb-1">{service.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">{service.description}</p>
                <div className="space-y-1.5">
                  {service.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
                {isSelected && (
                  <div className="absolute top-4 right-4">
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════
  // EMPLOYER FILL: Personal Info (Step 2)
  // ═══════════════════════════════════════════════════
  const renderPersonalInfo = () => (
    <div className="space-y-6 animate-page-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.personal_info.label.first_name")} <span className="text-destructive">*</span></Label>
          <Input value={formData.firstName} onChange={(e) => updateField("firstName", e.target.value)} placeholder={t("portal_onboarding.personal_info.placeholder.first_name")} className="h-10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.personal_info.label.last_name")} <span className="text-destructive">*</span></Label>
          <Input value={formData.lastName} onChange={(e) => updateField("lastName", e.target.value)} placeholder={t("portal_onboarding.personal_info.placeholder.last_name")} className="h-10 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.personal_info.label.email")} <span className="text-destructive">*</span></Label>
          <Input type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} placeholder={t("portal_onboarding.personal_info.placeholder.email")} className={`h-10 rounded-xl ${fieldErrors.email ? "border-destructive" : ""}`} />
          {fieldErrors.email && <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.personal_info.label.phone")}</Label>
          <Input value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="+65 9123 4567" className="h-10 rounded-xl" />
        </div>
      </div>
      {!isAor && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("portal_onboarding.personal_info.label.dob")} <span className="text-destructive">*</span></Label>
            <DatePicker value={formData.dateOfBirth} onChange={(v: string) => updateField("dateOfBirth", v)} placeholder="Select date" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("portal_onboarding.personal_info.label.gender")} <span className="text-destructive">*</span></Label>
            <Select value={formData.gender} onValueChange={(v) => updateField("gender", v)}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">{t("portal_onboarding.personal_info.gender.male")}</SelectItem>
                <SelectItem value="female">{t("portal_onboarding.personal_info.gender.female")}</SelectItem>
                <SelectItem value="other">{t("portal_onboarding.personal_info.gender.other")}</SelectItem>
                <SelectItem value="prefer_not_to_say">{t("portal_onboarding.personal_info.gender.prefer_not_to_say")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.personal_info.label.nationality")} <span className="text-destructive">*</span></Label>
          <Select value={formData.nationality} onValueChange={(v) => updateField("nationality", v)}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select nationality" /></SelectTrigger>
            <SelectContent>
              {ALL_COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!isAor && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("portal_onboarding.personal_info.label.id_type")} <span className="text-destructive">*</span></Label>
            <Select value={formData.idType} onValueChange={(v) => updateField("idType", v)}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select ID type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="national_id">{t("portal_onboarding.personal_info.id_type.national_id")}</SelectItem>
                <SelectItem value="passport">{t("portal_onboarding.personal_info.id_type.passport")}</SelectItem>
                <SelectItem value="driver_license">{t("portal_onboarding.personal_info.id_type.drivers_license")}</SelectItem>
                <SelectItem value="other">{t("portal_onboarding.personal_info.gender.other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {!isAor && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.personal_info.label.id_number")} <span className="text-destructive">*</span></Label>
          <Input value={formData.idNumber} onChange={(e) => updateField("idNumber", e.target.value)} placeholder="Enter ID number" className="h-10 rounded-xl" />
        </div>
      )}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("portal_onboarding.personal_info.label.address")} {!isAor && <span className="text-destructive">*</span>}</Label>
        <Textarea value={formData.address} onChange={(e) => updateField("address", e.target.value)} placeholder="Full residential address" rows={2} className="rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.employment.label.city")}</Label>
          <Input value={formData.city} onChange={(e) => updateField("city", e.target.value)} placeholder="City" className="h-10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">State / Province</Label>
          <Input value={formData.state} onChange={(e) => updateField("state", e.target.value)} placeholder="State / Province" className="h-10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Postal Code</Label>
          <Input value={formData.postalCode} onChange={(e) => updateField("postalCode", e.target.value)} placeholder="Postal Code" className="h-10 rounded-xl" />
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════
  // EMPLOYER FILL: Employment (Step 3)
  // ═══════════════════════════════════════════════════
  const renderEmployment = () => (
    <div className="space-y-6 animate-page-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{isAor ? t("portal_onboarding.employment.label.onboarding_country") : t("portal_onboarding.employment.label.country")} <span className="text-destructive">*</span></Label>
          <Select value={formData.country} onValueChange={(v) => {
            updateField("country", v);
            const c = countries?.find((c) => c.countryCode === v);
            if (c) updateField("salaryCurrency", c.currency);
          }}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select country" /></SelectTrigger>
            <SelectContent>
              {(countries || []).map((c) => (
                <SelectItem key={c.countryCode} value={c.countryCode}>{c.countryName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {!isAor && needsVisa && (
        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/50 backdrop-blur-sm p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">{t("portal_onboarding.employment.visa_required.title")}</p>
              <p className="text-sm text-amber-700 mt-1">
                The employee's nationality differs from the employment country. Visa sponsorship will be required.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{isAor ? "Role / Scope" : t("portal_onboarding.employment.label.job_title")} <span className="text-destructive">*</span></Label>
          <Input value={formData.jobTitle} onChange={(e) => updateField("jobTitle", e.target.value)} placeholder={isAor ? "e.g. Frontend Developer" : "e.g. Software Engineer"} className="h-10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.employment.label.department")}</Label>
          <Input value={formData.department} onChange={(e) => updateField("department", e.target.value)} placeholder="e.g. Engineering" className="h-10 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!isAor && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("portal_onboarding.employment.label.employment_type")}</Label>
            <Select value={formData.employmentType} onValueChange={(v) => updateField("employmentType", v)}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="long_term">{t("portal_onboarding.employment.employment_type.permanent")}</SelectItem>
                <SelectItem value="fixed_term">{t("portal_onboarding.employment.employment_type.fixed_term")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{isAor ? "Contract Start Date" : t("portal_onboarding.employment.label.start_date")} <span className="text-destructive">*</span></Label>
          <DatePicker value={formData.startDate} onChange={(v: string) => updateField("startDate", v)} placeholder="Select start date" />
          {fieldErrors.startDate && <p className="text-xs text-destructive mt-1">{fieldErrors.startDate}</p>}
        </div>
      </div>
      {(isAor || formData.employmentType === "fixed_term") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{isAor ? "Contract End Date" : t("portal_onboarding.employment.label.end_date")}</Label>
            <DatePicker value={formData.endDate} onChange={(v: string) => updateField("endDate", v)} placeholder="Select end date" />
            {fieldErrors.endDate && <p className="text-xs text-destructive mt-1">{fieldErrors.endDate}</p>}
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════
  // EMPLOYER FILL: Compensation (Step 4)
  // ═══════════════════════════════════════════════════
  const renderCompensation = () => {
    if (isAor) {
      // AOR: Payment Frequency + Amount
      return (
        <div className="space-y-6 animate-page-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Payment Frequency <span className="text-destructive">*</span></Label>
              <Select value={formData.paymentFrequency} onValueChange={(v) => updateField("paymentFrequency", v)}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select frequency" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="semi_monthly">Semi-monthly</SelectItem>
                  <SelectItem value="milestone">Milestone-based</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Currency</Label>
              <CurrencySelect value={formData.contractorCurrency} onValueChange={(v) => updateField("contractorCurrency", v)} />
            </div>
          </div>
          {formData.paymentFrequency !== "milestone" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {formData.paymentFrequency === "semi_monthly" ? "Semi-monthly Amount" : "Monthly Amount"}
                  <span className="text-destructive"> *</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={formData.rateAmount}
                    onChange={(e) => updateField("rateAmount", e.target.value)}
                    placeholder="0.00"
                    className="flex-1 h-10 rounded-xl"
                  />
                  <div className="flex items-center px-3 bg-muted/50 rounded-xl border text-sm font-medium min-w-[60px] justify-center">
                    {formData.contractorCurrency || "USD"}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-border/50 bg-muted/20 backdrop-blur-sm p-4">
            <p className="text-sm text-muted-foreground">
              {formData.paymentFrequency === "milestone"
                ? "Payment will be made based on milestone completion. You can define milestones after onboarding through the Milestones module."
                : "The amount entered is the gross payment per period. Additional adjustments can be made through the Adjustments module after onboarding."}
            </p>
          </div>
        </div>
      );
    }

    // EOR: Base Salary
    return (
      <div className="space-y-6 animate-page-in">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("portal_onboarding.compensation.label.base_salary")} <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={formData.baseSalary}
                onChange={(e) => updateField("baseSalary", e.target.value)}
                placeholder="0.00"
                className="flex-1 h-10 rounded-xl"
              />
              <div className="flex items-center px-3 bg-muted/50 rounded-xl border text-sm font-medium min-w-[60px] justify-center">
                {formData.salaryCurrency || "USD"}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("portal_onboarding.compensation.label.salary_currency")}</Label>
            <div className="flex items-center h-10 px-3 bg-muted/30 rounded-xl border text-sm font-medium">
              {formData.salaryCurrency || "USD"}
              {selectedCountry && (
                <span className="ml-2 text-xs text-muted-foreground">(locked to {selectedCountry.countryName})</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("portal_onboarding.compensation.currency_auto_set_message")}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-muted/20 backdrop-blur-sm p-4">
          <p className="text-sm text-muted-foreground">
            The salary entered here is the gross monthly base salary before any deductions.
            Additional compensation items (bonuses, allowances) can be added through the Adjustments module after onboarding.
          </p>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════
  // EMPLOYER FILL: Documents (Step 5)
  // ═══════════════════════════════════════════════════
  const renderDocuments = () => {
    const requiredDocs = [
      { type: "national_id", label: t("portal_onboarding.documents.type.national_id"), required: true },
    ];
    if (needsVisa || formData.serviceType === "visa_eor") {
      requiredDocs.push({ type: "passport", label: t("portal_onboarding.personal_info.id_type.passport"), required: true });
      requiredDocs.push({ type: "visa", label: t("portal_onboarding.documents.type.visa"), required: false });
    }
    const isVisaEor = needsVisa || formData.serviceType === "visa_eor";
    const optionalDocs = [
      { type: "resume", label: t("portal_onboarding.documents.type.resume"), required: isVisaEor },
      { type: "education", label: t("portal_onboarding.documents.type.education_certificate"), required: isVisaEor },
    ];
    const allDocs = [...requiredDocs, ...optionalDocs];

    return (
      <div className="space-y-6 animate-page-in">
        <div className="rounded-2xl border border-border/50 bg-muted/20 backdrop-blur-sm p-4">
          <p className="text-sm text-muted-foreground">
            Upload the required documents for the employee. Accepted formats: PDF, JPG, PNG (max 10MB each).
            {(needsVisa || formData.serviceType === "visa_eor") && (
              <span className="block mt-1 text-amber-600 font-medium">
                Visa-related documents are required for this employee.
              </span>
            )}
          </p>
        </div>
        <div className="space-y-3">
          {allDocs.map((doc) => {
            const uploaded = documents.find((d) => d.type === doc.type);
            return (
              <GlassCard key={doc.type} className="p-4 border-border/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      uploaded ? "bg-emerald-50 text-emerald-600" : "bg-muted/50 text-muted-foreground"
                    )}>
                      {uploaded ? <CheckCircle2 className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {doc.label}
                        {doc.required && <span className="text-destructive ml-1">*</span>}
                      </p>
                      {uploaded && (
                        <p className="text-xs text-muted-foreground">{uploaded.file?.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {uploaded && (
                      <Button variant="ghost" size="sm" onClick={() => removeDocument(doc.type)} className="rounded-xl">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileChange(doc.type, doc.label, e)}
                      />
                      <Button variant={uploaded ? "outline" : "default"} size="sm" asChild className="rounded-xl">
                        <span>
                          <Upload className="w-4 h-4 mr-1" />
                          {uploaded ? "Replace" : "Upload"}
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════
  // EMPLOYER FILL: Bank Details (Step 6)
  // ═══════════════════════════════════════════════════
  const renderBankDetails = () => (
    <div className="space-y-6 animate-page-in">
      <div className="rounded-2xl border border-border/50 bg-muted/20 backdrop-blur-sm p-4">
        <p className="text-sm text-muted-foreground">
          Please provide the employee's bank account details for salary payments. Fields marked with * are required.
        </p>
      </div>
      <BankDetailsForm
        value={formData.bankDetails}
        onChange={(val) => updateField("bankDetails", val)}
        countryCode={formData.country}
        currency={formData.salaryCurrency}
      />
    </div>
  );

  // ═══════════════════════════════════════════════════
  // INVITE FLOW: Employer Info (Step 2)
  // ═══════════════════════════════════════════════════
  const renderInviteEmployerInfo = () => (
    <div className="space-y-6 animate-page-in">
      <div className="rounded-2xl border border-blue-200/60 bg-blue-50/30 backdrop-blur-sm p-4 mb-2">
        <div className="flex items-start gap-3">
          <Briefcase className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">{isAor ? t("portal_onboarding.wizard.invite_flow.step2.title.aor") : t("portal_onboarding.wizard.invite_flow.step2.title")}</p>
            <p className="text-sm text-blue-700 mt-1">
              {t("portal_onboarding.invite_flow.step2.description")}
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{isAor ? t("portal_onboarding.employment.label.onboarding_country") : t("portal_onboarding.employment.label.country")} <span className="text-destructive">*</span></Label>
          <Select value={formData.country} onValueChange={(v) => {
            updateField("country", v);
            const c = countries?.find((c) => c.countryCode === v);
            if (c) updateField("salaryCurrency", c.currency);
          }}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select country" /></SelectTrigger>
            <SelectContent>
              {(countries || []).map((c) => (
                <SelectItem key={c.countryCode} value={c.countryCode}>{c.countryName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.employment.label.job_title")} <span className="text-destructive">*</span></Label>
          <Input value={formData.jobTitle} onChange={(e) => updateField("jobTitle", e.target.value)} placeholder="e.g. Software Engineer" className="h-10 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.employment.label.department")}</Label>
          <Input value={formData.department} onChange={(e) => updateField("department", e.target.value)} placeholder="e.g. Engineering" className="h-10 rounded-xl" />
        </div>
        {/* Bug 9: Hide Employment Type for AOR — it's EOR-specific */}
        {!isAor && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("portal_onboarding.employment.label.employment_type")}</Label>
            <Select value={formData.employmentType} onValueChange={(v) => updateField("employmentType", v)}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="long_term">{t("portal_onboarding.employment.employment_type.permanent")}</SelectItem>
                <SelectItem value="fixed_term">{t("portal_onboarding.employment.employment_type.fixed_term")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{isAor ? "Contract Start Date" : t("portal_onboarding.employment.label.start_date")} <span className="text-destructive">*</span></Label>
          <DatePicker value={formData.startDate} onChange={(v: string) => updateField("startDate", v)} placeholder="Select start date" />
          {fieldErrors.startDate && <p className="text-xs text-destructive mt-1">{fieldErrors.startDate}</p>}
        </div>
        {/* Bug 9: For AOR, always show end date; for EOR, only show for fixed_term */}
        {(isAor || formData.employmentType === "fixed_term") && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">{isAor ? "Contract End Date" : t("portal_onboarding.employment.label.end_date")}</Label>
            <DatePicker value={formData.endDate} onChange={(v: string) => updateField("endDate", v)} placeholder="Select end date" />
            {fieldErrors.endDate && <p className="text-xs text-destructive mt-1">{fieldErrors.endDate}</p>}
          </div>
        )}
      </div>
      <div className="border-t border-border/40 pt-4">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          {t("portal_onboarding.compensation.title")}
        </h4>
        {isAor ? (
          /* AOR: Payment Frequency + Rate Amount */
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("portal_onboarding.compensation.label.payment_frequency")} <span className="text-destructive">*</span></Label>
                <Select value={formData.paymentFrequency} onValueChange={(v) => updateField("paymentFrequency", v)}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder={t("portal_onboarding.compensation.placeholder.select_frequency")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{t("portal_onboarding.compensation.frequency.monthly")}</SelectItem>
                    <SelectItem value="semi_monthly">{t("portal_onboarding.compensation.frequency.semi_monthly")}</SelectItem>
                    <SelectItem value="milestone">{t("portal_onboarding.compensation.frequency.milestone")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("portal_onboarding.compensation.label.currency")}</Label>
                <CurrencySelect value={formData.contractorCurrency} onValueChange={(v) => updateField("contractorCurrency", v)} />
              </div>
            </div>
            {formData.paymentFrequency !== "milestone" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {formData.paymentFrequency === "semi_monthly" ? t("portal_onboarding.compensation.label.semi_monthly_amount") : t("portal_onboarding.compensation.label.monthly_amount")}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={formData.rateAmount}
                      onChange={(e) => updateField("rateAmount", e.target.value)}
                      placeholder="0.00"
                      className="flex-1 h-10 rounded-xl"
                    />
                    <div className="flex items-center px-3 bg-muted/50 rounded-xl border text-sm font-medium min-w-[60px] justify-center">
                      {formData.contractorCurrency || "USD"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* EOR: Base Salary */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("portal_onboarding.compensation.label.base_salary")} <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={formData.baseSalary}
                  onChange={(e) => updateField("baseSalary", e.target.value)}
                  placeholder="0.00"
                  className="flex-1 h-10 rounded-xl"
                />
                <div className="flex items-center px-3 bg-muted/50 rounded-xl border text-sm font-medium min-w-[60px] justify-center">
                  {formData.salaryCurrency || "USD"}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("portal_onboarding.compensation.label.salary_currency")}</Label>
              <div className="flex items-center h-10 px-3 bg-muted/30 rounded-xl border text-sm font-medium">
                {formData.salaryCurrency || "USD"}
                {selectedCountry && (
                  <span className="ml-2 text-xs text-muted-foreground">(locked to {selectedCountry.countryName})</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("portal_onboarding.compensation.currency_auto_set_message")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════
  // INVITE FLOW: Send Invite (Step 3)
  // ═══════════════════════════════════════════════════
  const renderInviteSend = () => (
    <div className="space-y-6 animate-page-in">
      <div className="rounded-2xl border border-border/50 bg-muted/20 backdrop-blur-sm p-4 mb-2">
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">{t("portal_onboarding.wizard.invite_flow.step3.title")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("portal_onboarding.invite_flow.step3.description")}
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.invite_flow.send_invite.label.worker_name")} <span className="text-destructive">*</span></Label>
          <Input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Full name"
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("portal_onboarding.invite_flow.send_invite.label.worker_email")} <span className="text-destructive">*</span></Label>
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="name@example.com"
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      {/* Summary of employer-filled info */}
      <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-5">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          {t("portal_onboarding.invite_flow.step3.summary_title")}
        </h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">{t("common.service")}:</span>{" "}
            <span className="font-medium">{SERVICE_TYPES.find((s) => s.id === formData.serviceType)?.shortTitle || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("common.country")}:</span>{" "}
            <span className="font-medium">{countries?.find((c) => c.countryCode === formData.country)?.countryName || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("portal_onboarding.employment.label.job_title")}:</span>{" "}
            <span className="font-medium">{formData.jobTitle || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("portal_onboarding.employment.label.start_date")}:</span>{" "}
            <span className="font-medium">{formData.startDate ? new Date(formData.startDate).toLocaleDateString() : "-"}</span>
          </div>
          {isAor ? (
            <>
              <div>
                <span className="text-muted-foreground">{t("portal_onboarding.compensation.label.payment_frequency")}:</span>{" "}
                <span className="font-medium">{formData.paymentFrequency || "-"}</span>
              </div>
              {formData.paymentFrequency !== "milestone" && (
                <div>
                  <span className="text-muted-foreground">{t("portal_onboarding.compensation.label.rate_amount")}:</span>{" "}
                  <span className="font-medium">{formData.rateAmount ? `${formData.contractorCurrency || "USD"} ${Number(formData.rateAmount).toLocaleString()}` : "-"}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <span className="text-muted-foreground">{t("common.salary")}:</span>{" "}
                <span className="font-medium">{formData.baseSalary ? `${formData.salaryCurrency} ${Number(formData.baseSalary).toLocaleString()}` : "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("common.type")}:</span>{" "}
                <span className="font-medium">{formData.employmentType === "long_term" ? t("portal_onboarding.employment_type.permanent") : t("portal_onboarding.employment_type.fixed_term")}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-muted/10 p-3">
        <div className="flex items-start gap-2">
          <Link2 className="w-4 h-4 text-muted-foreground mt-0.5" />
          <p className="text-xs text-muted-foreground">
            {t("portal_onboarding.invite_flow.step3.link_info")}
          </p>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════
  // WIZARD NAVIGATION LOGIC
  // ═══════════════════════════════════════════════════
  const steps = mode === "employer-fill"
    ? (isAor ? EMPLOYER_FILL_STEPS_AOR : EMPLOYER_FILL_STEPS_EOR)
    : (isAor ? INVITE_STEPS_AOR : INVITE_STEPS);
  const totalSteps = steps.length;

  function canProceedStep(): boolean {
    if (mode === "employer-fill") {
      switch (currentStep) {
        case 1: return !!formData.serviceType;
        case 2: {
          const baseValid = !!(formData.firstName && formData.lastName && formData.email);
          if (isAor) return baseValid;
          // EOR/Visa EOR: require DOB, gender, nationality, idType, idNumber, address
          return baseValid && !!(formData.dateOfBirth && formData.gender && formData.nationality && formData.idType && formData.idNumber && formData.address);
        }
        case 3: return !!(formData.country && formData.jobTitle && formData.startDate);
        case 4:
          if (isAor) {
            // Milestone-based doesn't require amount
            if (formData.paymentFrequency === "milestone") return true;
            return !!formData.rateAmount;
          }
          return !!formData.baseSalary;
        case 5:
          if (isAor) {
            // AOR step 5 = Bank Details
            return !!(formData.bankDetails?.accountHolderName && formData.bankDetails?.bankName && (formData.bankDetails?.accountNumber || formData.bankDetails?.iban));
          }
          return true; // EOR Documents step
        case 6: return !!(formData.bankDetails?.accountHolderName && formData.bankDetails?.bankName && (formData.bankDetails?.accountNumber || formData.bankDetails?.iban)); // EOR Bank Details
        default: return false;
      }
    } else {
      // invite flow
      switch (currentStep) {
        case 1: return !!formData.serviceType;
        case 2: {
          const baseValid = !!(formData.country && formData.jobTitle && formData.startDate);
          if (isAor) {
            if (formData.paymentFrequency === "milestone") return baseValid;
            return baseValid && !!formData.rateAmount;
          }
          return baseValid && !!formData.baseSalary;
        }
        case 3: return !!(inviteName && inviteEmail);
        default: return false;
      }
    }
  }

  function renderCurrentStep() {
    if (mode === "employer-fill") {
      switch (currentStep) {
        case 1: return renderServiceSelection();
        case 2: return renderPersonalInfo();
        case 3: return renderEmployment();
        case 4: return renderCompensation();
        case 5: return isAor ? renderBankDetails() : renderDocuments(); // AOR: Bank Details, EOR: Documents
        case 6: return renderBankDetails(); // EOR Bank Details step
      }
    } else {
      switch (currentStep) {
        case 1: return renderServiceSelection();
        case 2: return renderInviteEmployerInfo();
        case 3: return renderInviteSend();
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // CHOOSE PATH VIEW
  // ═══════════════════════════════════════════════════
  if (mode === "choose-path") {
    return (
      <PortalLayout title="Onboarding">
        <div className="p-6 max-w-3xl mx-auto animate-page-in">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{t("portal_onboarding.wizard.header.title")}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t("portal_onboarding.choose_path.description")}</p>
            </div>
            <Button variant="ghost" onClick={resetAll} className="rounded-xl">
              <X className="w-4 h-4 mr-2" /> {t("common.cancel")}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Path 1: Fill it myself */}
            <GlassCard
              hover
              onClick={() => setMode("employer-fill")}
              className="p-8 border-border/40"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 backdrop-blur-sm border border-primary/10 flex items-center justify-center mb-5">
                  <ClipboardList className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t("portal_onboarding.choose_path.employer_fill.title")}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {t("portal_onboarding.choose_path.employer_fill.description")}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t("portal_onboarding.choose_path.employer_fill.time")}</span>
                </div>
              </div>
            </GlassCard>

            {/* Path 2: Send to employee */}
            <GlassCard
              hover
              onClick={() => setMode("invite-flow")}
              className="p-8 border-border/40"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/5 backdrop-blur-sm border border-blue-200/30 flex items-center justify-center mb-5">
                  <Send className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t("portal_onboarding.choose_path.invite.title")}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {t("portal_onboarding.choose_path.invite.description")}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t("portal_onboarding.choose_path.invite.time")}</span>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </PortalLayout>
    );
  }

  // ═══════════════════════════════════════════════════
  // WIZARD VIEW (both employer-fill and invite-flow)
  // ═══════════════════════════════════════════════════
  if (mode === "employer-fill" || mode === "invite-flow") {
    const isLastStep = currentStep === totalSteps;
    const isSubmitting = mode === "employer-fill"
      ? (isAor ? submitAorMutation.isPending : submitMutation.isPending || uploadDocMutation.isPending)
      : sendInviteMutation.isPending;

    return (
      <PortalLayout title="Onboarding">
        <div className="p-6 max-w-4xl mx-auto animate-page-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {mode === "employer-fill" ? t("portal_onboarding.wizard.header.title") : t("portal_onboarding.invite_flow.send_invite.title")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === "employer-fill"
                  ? t("portal_onboarding.wizard.employerFillDescription")
                  : t("portal_onboarding.wizard.inviteDescription")
                }
              </p>
            </div>
            <Button variant="ghost" onClick={resetAll} className="rounded-xl">
              <X className="w-4 h-4 mr-2" /> {t("common.cancel")}
            </Button>
          </div>

          {/* Step Indicator — Glass Pill Style */}
          <div className="flex items-center justify-center mb-8 overflow-x-auto">
            <div className="inline-flex items-center gap-0.5 p-1 rounded-2xl bg-muted/40 backdrop-blur-sm border border-border/40">
              {steps.map((step, idx) => {
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;
                const StepIcon = step.icon;
                return (
                  <div key={step.id} className="flex items-center">
                    <button
                      onClick={() => {
                        if (isCompleted) setCurrentStep(step.id);
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all duration-300 whitespace-nowrap",
                        isActive
                          ? "bg-white shadow-sm text-foreground"
                          : isCompleted
                            ? "text-primary cursor-pointer hover:bg-white/50"
                            : "text-muted-foreground cursor-default"
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <StepIcon className={cn("w-3.5 h-3.5 flex-shrink-0", isActive ? "text-primary" : "")} />
                      )}
                      <span className="hidden md:inline">{step.title}</span>
                    </button>
                    {idx < steps.length - 1 && (
                      <div className={cn(
                        "w-4 h-px mx-0.5",
                        isCompleted ? "bg-emerald-300" : "bg-border/60"
                      )} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <GlassCard className="p-6 md:p-8 border-border/40">
            <div className="mb-6">
              <h3 className="text-lg font-semibold">{steps[currentStep - 1].title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{steps[currentStep - 1].description}</p>
            </div>
            {renderCurrentStep()}
          </GlassCard>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              onClick={() => {
                if (currentStep === 1) {
                  setMode("choose-path");
                  setCurrentStep(1);
                  setFormData((prev) => ({ ...prev, serviceType: "" }));
                } else {
                  setCurrentStep((s) => s - 1);
                }
              }}
              className="rounded-xl"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {currentStep === 1 ? t("common.back") : t("portal_onboarding.wizard.buttons.previous")}
            </Button>
            {!isLastStep ? (
              <Button
                onClick={() => setCurrentStep((s) => s + 1)}
                disabled={!canProceedStep()}
                className="rounded-xl"
              >
                {t("portal_onboarding.wizard.buttons.next")} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={mode === "employer-fill" ? handleSubmitOnboarding : handleSendInvite}
                disabled={isSubmitting || !canProceedStep()}
                className="rounded-xl"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {mode === "employer-fill" ? t("common.submitting") : t("common.sending")}</>
                ) : mode === "employer-fill" ? (
                  <><CheckCircle2 className="w-4 h-4 mr-2" /> {t("portal_onboarding.wizard.buttons.submit")}</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> {t("portal_onboarding.wizard.buttons.send_invite")}</>
                )}
              </Button>
            )}
          </div>
        </div>
      </PortalLayout>
    );
  }

  // ═══════════════════════════════════════════════════
  // LIST VIEW — Unified Timeline
  // ═══════════════════════════════════════════════════
  const isLoading = loadingInvites;
  const pendingInviteCount = activeInvites.filter((i) => i.status === "pending").length;
  const expiredInviteCount = activeInvites.filter((i) => {
    if (i.status === "pending" && new Date(i.expiresAt) < new Date()) return true;
    return i.status === "expired";
  }).length;

  return (
    <PortalLayout title="Onboarding">
      <div className="p-6 space-y-6 animate-page-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("portal_onboarding.header.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("portal_onboarding.header.description")}
            </p>
          </div>
          <Button onClick={() => setMode("choose-path")} className="rounded-xl shadow-sm">
            <UserPlus className="w-4 h-4 mr-2" /> {t("portal_onboarding.header.button.new_onboarding")}
          </Button>
        </div>

        {/* Summary Stats */}
        {activeInvites.length > 0 && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{pendingInviteCount} awaiting response</span>
            {expiredInviteCount > 0 && (
              <span className="text-amber-600">{expiredInviteCount} expired</span>
            )}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full rounded-xl" /></CardContent></Card>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <GlassCard className="border-border/40">
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4">
                <UserPlus className="w-8 h-8 text-primary/60" />
              </div>
              <p className="text-lg font-medium text-foreground">{t("portal_onboarding.empty_state.title")}</p>
              <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
                {t("portal_onboarding.empty_state.description")}
              </p>
              <Button onClick={() => setMode("choose-path")} className="rounded-xl">
                <UserPlus className="w-4 h-4 mr-2" /> {t("portal_onboarding.header.button.new_onboarding")}
              </Button>
            </div>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const invite = item.data as any;
              const isExpired = invite.status === "pending" && new Date(invite.expiresAt) < new Date();
              const displayStatus = isExpired ? "expired" : invite.status;
              const config = inviteStatusConfig[displayStatus] || inviteStatusConfig.pending;
              const StatusIcon = config.icon;
              return (
                <GlassCard key={`inv-${invite.id}`} className="p-4 border-border/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/5 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{invite.employeeName}</p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal border-blue-200/60 text-blue-600 bg-blue-50/50">
                            {invite.serviceType === "aor" ? "AOR" : "EOR"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{invite.employeeEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {new Date(invite.createdAt).toLocaleDateString()}
                      </span>
                      <Badge variant="outline" className={cn("rounded-lg", config.color)}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {config.label}
                      </Badge>
                      {invite.status === "pending" && !isExpired && (
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                            onClick={() => copyInviteLink(invite.token)}
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            {t("portal_onboarding.list.copy_link")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-xs gap-1.5"
                            onClick={() => resendInviteMutation.mutate({ id: invite.id })}
                            disabled={resendInviteMutation.isPending}
                          >
                            <Send className="w-3.5 h-3.5" />
                            {t("portal_onboarding.list.resend")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                            onClick={() => cancelInviteMutation.mutate({ id: invite.id })}
                            title="Cancel invite"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                      {isExpired && (
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                            onClick={() => resendInviteMutation.mutate({ id: invite.id })}
                            disabled={resendInviteMutation.isPending}
                          >
                            <Send className="w-3.5 h-3.5" />
                            Re-invite
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                            onClick={() => cancelInviteMutation.mutate({ id: invite.id })}
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
  function buildSelfOnboardingInviteLink(token: string) {
    const origin = getPortalOrigin() || window.location.origin;
    return `${origin}${portalPath("/self-onboarding")}?token=${token}`;
  }
