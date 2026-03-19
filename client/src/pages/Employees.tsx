/*
 * EG Admin — Employee Management
 * List + Detail view with status workflow, document uploads, form validation
 * Enhanced with: Salary Info, Leave Balance, Payroll History, Adjustments, Visa Tracking
 * Documents tab unified: contracts, visa docs, and general documents all in one place
 */
import Layout from "@/components/Layout";
import CurrencySelect from "@/components/CurrencySelect";
import CountrySelect from "@/components/CountrySelect";
import { DatePicker } from "@/components/DatePicker";
import { formatCurrencyAmount } from "@/components/CurrencyAmount";
import { formatDate, formatMonth, formatDateISO, formatDateTime, countryName } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useCpContext } from "@/_core/store/cpContextStore";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Users, Plus, Search, ArrowLeft, ChevronRight, Mail, Phone, MapPin,
  Calendar, Building2, Briefcase, Shield, Globe, Pencil,
  Upload, FileText, Trash2, Eye, DollarSign, CalendarDays,
  Receipt, FileCheck, AlertTriangle, Undo2, Clock, Hash, User, Cake,
  CreditCard, Home, UserPlus, CheckCircle, Send,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractorListContent } from "./Contractors";
import ContractorCreateDialog from "@/components/pages/ContractorCreateDialog";
import { BankDetailsForm, BankDetails } from "@/components/forms/BankDetailsForm";

import { useI18n } from "@/lib/i18n";
const statusColors: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  documents_incomplete: "bg-rose-50 text-rose-700 border-rose-200",
  onboarding: "bg-blue-50 text-blue-700 border-blue-200",
  contract_signed: "bg-cyan-50 text-cyan-700 border-cyan-200",
  on_leave: "bg-purple-50 text-purple-700 border-purple-200",
  offboarding: "bg-orange-50 text-orange-700 border-orange-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
};

const docTypes = [
  "resume",
  "passport",
  "national_id",
  "work_permit",
  "visa",
  "contract",
  "education",
  "payslip",
  "reimbursement_receipt",
  "other",
];

const docTypeLabels: Record<string, string> = {
  resume: "Resume",
  passport: "Passport",
  national_id: "National ID",
  work_permit: "Work Permit",
  visa: "Visa",
  contract: "Contract",
  education: "Education",
  payslip: "Payslip",
  reimbursement_receipt: "Reimbursement Receipt",
  other: "Other",
};

const visaStatusColors: Record<string, string> = {
  not_required: "bg-gray-50 text-gray-600",
  pending_application: "bg-amber-50 text-amber-700",
  application_submitted: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  expired: "bg-orange-50 text-orange-700",
};

/* ========== Employee List ========== */
function EmployeeList() {
  const { t } = useI18n();
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  
  const getUrlTab = () => {
    const t = new URLSearchParams(searchString).get("tab");
    return (t === "contractors" || t === "employees") ? t : "employees";
  };
  
  const [activeTab, setActiveTab] = useState(getUrlTab);

  useEffect(() => {
    setActiveTab(getUrlTab());
  }, [searchString]);

  const handleTabChange = (val: string) => {
    const params = new URLSearchParams(searchString);
    params.set("tab", val);
    params.delete("page"); // Reset page when switching tabs
    setLocation(`${location}?${params.toString()}`);
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [cpFilter, setCpFilter] = useState<string>("all");
  const [, _setLocation] = useLocation();
  // const searchString = useSearch(); // Already defined above
  const [createOpen, setCreateOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  // Initialize page from URL params (e.g. /employees?page=2)
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
  }, [search, statusFilter, customerFilter, countryFilter, cpFilter]);

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

  const { data, isLoading, refetch } = trpc.employees.list.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    customerId: customerFilter !== "all" ? parseInt(customerFilter) : undefined,
    country: countryFilter !== "all" ? countryFilter : undefined,
    channelPartnerId: resolvedChannelPartnerId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const { data: customers } = trpc.customers.list.useQuery({ limit: 200 });
  const { data: countriesList } = trpc.countries.list.useQuery();
  const { data: cpList } = trpc.channelPartners.list.useQuery({ limit: 200, includeInternal: true });

  // Onboarding Invites
  const [showInvites, setShowInvites] = useState(false);
  const { data: invites, refetch: refetchInvites } = trpc.employees.onboardingInvites.list.useQuery({});
  const deleteInvite = trpc.employees.onboardingInvites.delete.useMutation({
    onSuccess: () => { refetchInvites(); toast.success("Invite deleted"); },
    onError: (e) => toast.error(e.message),
  });
  // Only show pending and expired invites (completed/cancelled are hidden — those employees are in the main list)
  const activeInvites = invites?.filter((i: any) => {
    if (i.status === "completed" || i.status === "cancelled") return false;
    return true; // pending + expired
  }) || [];
  const pendingInvites = activeInvites.filter((i: any) => i.status === "pending");

  const defaultForm = {
    customerId: 0,
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    gender: "" as "male" | "female" | "other" | "prefer_not_to_say" | "",
    nationality: "",
    idType: "",
    idNumber: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    department: "",
    jobTitle: "",
    serviceType: "eor" as "eor" | "visa_eor",
    employmentType: "long_term" as "fixed_term" | "long_term",
    startDate: "",
    endDate: "",
    baseSalary: "",
    salaryCurrency: "",
    estimatedEmployerCost: "",
    requiresVisa: false,
    bankDetails: {} as BankDetails,
  };
  const [formData, setFormData] = useState(defaultForm);

  // Auto-detect visa requirement
  const { data: visaCheck } = trpc.employees.checkVisaRequired.useQuery(
    { nationality: formData.nationality, workCountry: formData.country },
    { enabled: !!formData.nationality && !!formData.country }
  );

  // Cost Estimation Logic
  const [estimationBreakdown, setEstimationBreakdown] = useState<any[]>([]);
  const calculateMutation = trpc.calculation.calculateContributions.useMutation({
    onSuccess: (data) => {
      setFormData(prev => ({ ...prev, estimatedEmployerCost: data.totalEmployer }));
      setEstimationBreakdown(data.items);
    },
    onError: (err) => {
      console.error("Estimation failed", err);
      // Optional: clear breakdown or show error
      setEstimationBreakdown([]);
    }
  });

  // Debounced calculation effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.country && formData.baseSalary && !isNaN(parseFloat(formData.baseSalary))) {
        calculateMutation.mutate({
          countryCode: formData.country,
          salary: parseFloat(formData.baseSalary),
          year: new Date().getFullYear(),
        });
      } else {
        setEstimationBreakdown([]);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [formData.country, formData.baseSalary]);

  useEffect(() => {
    if (false) {
      // AOR service does not require visa check
      setFormData(f => ({ ...f, requiresVisa: false }));
    } else if (visaCheck) {
      // Auto-detect based on nationality vs work country
      if (visaCheck.requiresVisa) {
        // Nationality differs from work country → visa required, auto-switch to visa_eor
        setFormData(f => ({ ...f, requiresVisa: true, serviceType: "visa_eor" }));
      } else {
        // Nationality matches work country → no visa, revert to standard eor if was visa_eor
        setFormData(f => ({
          ...f,
          requiresVisa: false,
          serviceType: f.serviceType === "visa_eor" ? "eor" : f.serviceType,
        }));
      }
    }
  }, [visaCheck, formData.serviceType, formData.nationality, formData.country]);

  // Get statutory annual leave for selected country
  const selectedCountryConfig = countriesList?.find((c: any) => c.countryCode === formData.country);
  const statutoryAnnualLeave = selectedCountryConfig?.statutoryAnnualLeave ?? 0;

  const createMutation = trpc.employees.create.useMutation({
    onSuccess: () => {
      toast.success("Employee created successfully");
      setCreateOpen(false);
      refetch();
      setFormData(defaultForm);
      setErrors({});
    },
    onError: (err) => toast.error(err.message),
  });

  const validate = () => {
    const errs: Record<string, boolean> = {};
    if (!formData.customerId) errs.customerId = true;
    if (!formData.firstName.trim()) errs.firstName = true;
    if (!formData.lastName.trim()) errs.lastName = true;
    if (!formData.email.trim()) errs.email = true;
    if (!formData.dateOfBirth) errs.dateOfBirth = true;
    if (!formData.gender) errs.gender = true;
    if (!formData.nationality) errs.nationality = true;
    if (!formData.idType) errs.idType = true;
    if (!formData.idNumber?.trim()) errs.idNumber = true;
    if (!formData.address?.trim()) errs.address = true;
    if (!formData.country) errs.country = true;
    if (!formData.jobTitle.trim()) errs.jobTitle = true;
    if (!formData.startDate) errs.startDate = true;
    if (!formData.baseSalary) errs.baseSalary = true;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = () => {
    if (!validate()) {
      toast.error("Please fill in all required fields (highlighted in red)");
      return;
    }
    const submitData: any = { ...formData };
    if (!submitData.dateOfBirth) delete submitData.dateOfBirth;
    if (!submitData.endDate) delete submitData.endDate;
    if (!submitData.phone) delete submitData.phone;
    if (!submitData.nationality) delete submitData.nationality;
    if (!submitData.gender) delete submitData.gender;
    if (!submitData.idType) delete submitData.idType;
    if (!submitData.idNumber) delete submitData.idNumber;
    if (!submitData.address) delete submitData.address;
    if (!submitData.city) delete submitData.city;
    if (!submitData.state) delete submitData.state;
    if (!submitData.postalCode) delete submitData.postalCode;
    if (!submitData.department) delete submitData.department;
    createMutation.mutate(submitData);
  };

  const errCls = (field: string) => errors[field] ? "border-red-500 ring-1 ring-red-500" : "";

  return (
    <Layout breadcrumb={["EG", "People"]}>
      <div className="p-6 space-y-6 page-enter">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">People</h1>
                <p className="text-sm text-muted-foreground mt-1">Manage your workforce, including employees and contractors.</p>
              </div>
              <TabsList>
                <TabsTrigger value="employees">Employees</TabsTrigger>
                <TabsTrigger value="contractors">Contractors</TabsTrigger>
              </TabsList>
            </div>
            {activeTab === "employees" && (
            <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setErrors({}); }}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />{t("employees.actions.addEmployee")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("employees.create.title")}</DialogTitle></DialogHeader>
              <div className="space-y-6 mt-4">
                {/* Section: Client Assignment */}
                <fieldset className="rounded-lg border p-4 space-y-4">
                  <legend className="text-sm font-semibold text-muted-foreground px-2 uppercase tracking-wider">{t("employees.create.sections.clientAssignment")}</legend>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.customer")} <span className="text-red-500">*</span></Label>
                      <Select value={formData.customerId ? String(formData.customerId) : ""} onValueChange={(v) => { setFormData({ ...formData, customerId: parseInt(v) }); setErrors({ ...errors, customerId: false }); }}>
                        <SelectTrigger className={errCls("customerId")}><SelectValue placeholder="Select customer" /></SelectTrigger>
                        <SelectContent>
                          {customers?.data?.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.customerId && <p className="text-xs text-red-500">{t("employees.validation.customerRequired")}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.serviceType")} <span className="text-red-500">*</span>{visaCheck?.requiresVisa && formData.serviceType === "visa_eor" && <span className="text-xs text-amber-600 font-normal ml-1">{t("employees.create.form.autoVisaHint")}</span>}</Label>
                      <Select value={formData.serviceType} onValueChange={(v) => setFormData({ ...formData, serviceType: v as any })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="eor">{t("employees.create.form.serviceType.eor")}</SelectItem>
                          <SelectItem value="visa_eor">{t("employees.create.form.serviceType.visaEor")}</SelectItem>
                          {/* AOR removed from Employees - use Contractor module */}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </fieldset>

                {/* Section: Personal Information */}
                <fieldset className="rounded-lg border p-4 space-y-4">
                  <legend className="text-sm font-semibold text-muted-foreground px-2 uppercase tracking-wider">{t("employees.create.sections.personalInformation")}</legend>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.firstName")} <span className="text-red-500">*</span></Label>
                      <Input className={errCls("firstName")} value={formData.firstName} onChange={(e) => { setFormData({ ...formData, firstName: e.target.value }); setErrors({ ...errors, firstName: false }); }} placeholder="John" />
                      {errors.firstName && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.lastName")} <span className="text-red-500">*</span></Label>
                      <Input className={errCls("lastName")} value={formData.lastName} onChange={(e) => { setFormData({ ...formData, lastName: e.target.value }); setErrors({ ...errors, lastName: false }); }} placeholder="Doe" />
                      {errors.lastName && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.dateOfBirth")} <span className="text-red-500">*</span></Label>
                      <div className={errors.dateOfBirth ? "rounded-md ring-1 ring-red-500" : ""}>
                        <DatePicker value={formData.dateOfBirth} onChange={(d) => { setFormData({ ...formData, dateOfBirth: d }); setErrors({ ...errors, dateOfBirth: false }); }} />
                      </div>
                      {errors.dateOfBirth && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.email")} <span className="text-red-500">*</span></Label>
                      <Input type="email" className={errCls("email")} value={formData.email} onChange={(e) => { setFormData({ ...formData, email: e.target.value.toLowerCase() }); setErrors({ ...errors, email: false }); }} placeholder="john@example.com" />
                      {errors.email && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.phone")}</Label>
                      <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+65 9123 4567" />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.gender")} <span className="text-red-500">*</span></Label>
                      <div className={errors.gender ? "rounded-md ring-1 ring-red-500" : ""}>
                        <Select value={formData.gender} onValueChange={(v) => { setFormData({ ...formData, gender: v as any }); setErrors({ ...errors, gender: false }); }}>
                          <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {errors.gender && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.nationality")} <span className="text-red-500">*</span></Label>
                      <div className={errors.nationality ? "rounded-md ring-1 ring-red-500" : ""}>
                        <CountrySelect value={formData.nationality} onValueChange={(v) => { setFormData({ ...formData, nationality: v }); setErrors({ ...errors, nationality: false }); }} showCode={false} scope="all" />
                      </div>
                      {errors.nationality && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>ID Type <span className="text-red-500">*</span></Label>
                      <div className={errors.idType ? "rounded-md ring-1 ring-red-500" : ""}>
                        <Select value={formData.idType} onValueChange={(v) => { setFormData({ ...formData, idType: v }); setErrors({ ...errors, idType: false }); }}>
                          <SelectTrigger><SelectValue placeholder="Select ID type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="national_id">National ID</SelectItem>
                            <SelectItem value="passport">Passport</SelectItem>
                            <SelectItem value="driver_license">Driver License</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {errors.idType && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>ID Number <span className="text-red-500">*</span></Label>
                      <Input className={errCls("idNumber")} value={formData.idNumber} onChange={(e) => { setFormData({ ...formData, idNumber: e.target.value }); setErrors({ ...errors, idNumber: false }); }} placeholder="ID number" />
                      {errors.idNumber && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Street Address <span className="text-red-500">*</span></Label>
                    <Textarea className={errCls("address")} value={formData.address} onChange={(e) => { setFormData({ ...formData, address: e.target.value }); setErrors({ ...errors, address: false }); }} placeholder="Full street address" rows={2} />
                    {errors.address && <p className="text-xs text-red-500">{t("common.required")}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="City" />
                    </div>
                    <div className="space-y-2">
                      <Label>State / Province</Label>
                      <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} placeholder="State" />
                    </div>
                    <div className="space-y-2">
                      <Label>Postal Code</Label>
                      <Input value={formData.postalCode} onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })} placeholder="Postal code" />
                    </div>
                  </div>
                </fieldset>

                {/* Section: Employment */}
                <fieldset className="rounded-lg border p-4 space-y-4">
                  <legend className="text-sm font-semibold text-muted-foreground px-2 uppercase tracking-wider">{t("employees.sections.employmentDetails")}</legend>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.workCountry")} <span className="text-red-500">*</span></Label>
                      <div className={errors.country ? "rounded-md ring-1 ring-red-500" : ""}>
                        <CountrySelect value={formData.country} onValueChange={(v) => {
                          const countryConfig = countriesList?.find((c: any) => c.countryCode === v);
                          setFormData({ ...formData, country: v, salaryCurrency: countryConfig?.localCurrency || "USD" });
                          setErrors({ ...errors, country: false });
                        }} showCode={false} />
                      </div>
                      {errors.country && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.employmentType")}</Label>
                      <Select value={formData.employmentType} onValueChange={(v) => setFormData({ ...formData, employmentType: v as any })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed_term">{t("employees.create.form.employmentType.fixedTerm")}</SelectItem>
                          <SelectItem value="long_term">{t("employees.create.form.employmentType.longTerm")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.jobTitle")} <span className="text-red-500">*</span></Label>
                      <Input className={errCls("jobTitle")} value={formData.jobTitle} onChange={(e) => { setFormData({ ...formData, jobTitle: e.target.value }); setErrors({ ...errors, jobTitle: false }); }} placeholder="Software Engineer" />
                      {errors.jobTitle && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.department")}</Label>
                      <Input value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} placeholder="Engineering" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.startDate")} <span className="text-red-500">*</span></Label>
                      <div className={errors.startDate ? "rounded-md ring-1 ring-red-500" : ""}>
                        <DatePicker value={formData.startDate} onChange={(d) => { setFormData({ ...formData, startDate: d }); setErrors({ ...errors, startDate: false }); }} />
                      </div>
                      {errors.startDate && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                    {formData.employmentType === "fixed_term" && (
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.endDate")}</Label>
                      <DatePicker value={formData.endDate} onChange={(d) => setFormData({ ...formData, endDate: d })} />
                    </div>
                    )}
                  </div>
                </fieldset>

                {/* Section: Compensation */}
                <fieldset className="rounded-lg border p-4 space-y-4">
                  <legend className="text-sm font-semibold text-muted-foreground px-2 uppercase tracking-wider">{t("employees.sections.compensationLeave")}</legend>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.baseSalaryMonthly")} <span className="text-red-500">*</span></Label>
                      <Input type="number" step="0.01" className={errCls("baseSalary")} value={formData.baseSalary} onChange={(e) => { setFormData({ ...formData, baseSalary: e.target.value }); setErrors({ ...errors, baseSalary: false }); }} placeholder="5000.00" />
                      {errors.baseSalary && <p className="text-xs text-red-500">{t("common.required")}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.salaryCurrency")} <span className="text-xs text-muted-foreground font-normal">{t("employees.create.form.currencyAutoFromCountry")}</span></Label>
                      <Input value={formData.salaryCurrency || (formData.country ? "Loading..." : "Select country first")} disabled className="bg-muted" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.estimatedEmployerCostMonthly")}</Label>
                      <div className="relative">
                        <Input 
                          type="number" 
                          step="0.01" 
                          value={formData.estimatedEmployerCost} 
                          onChange={(e) => setFormData({ ...formData, estimatedEmployerCost: e.target.value })} 
                          placeholder="0.00" 
                        />
                        {calculateMutation.isPending && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{t("employees.create.form.estimatedEmployerCostMonthlyDescription")}</p>
                      {estimationBreakdown.length > 0 && (
                        <div className="mt-2 p-2 bg-muted/50 rounded text-xs space-y-1">
                          <p className="font-semibold text-muted-foreground">Employer Cost Breakdown:</p>
                          {estimationBreakdown.map((item, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span>{item.itemNameEn}:</span>
                              <span className="font-mono">{item.employerContribution}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.create.form.totalEmploymentCost")} <span className="text-xs text-muted-foreground font-normal">{t("employees.create.form.calculated")}</span></Label>
                      <Input value={((parseFloat(formData.baseSalary) || 0) + (parseFloat(formData.estimatedEmployerCost) || 0)).toFixed(2)} disabled className="bg-muted font-mono" />
                      <p className="text-xs text-muted-foreground">{t("employees.create.form.totalEmploymentCostFormula")}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("employees.create.form.leavePolicyHint")}</p>
                </fieldset>

                {/* Section: Bank Details */}
                <BankDetailsForm 
                  value={formData.bankDetails || {}}
                  onChange={(val) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, ...val } })}
                  countryCode={formData.country}
                  currency={formData.salaryCurrency}
                />

                {/* Section: Visa - Auto-detected, conditionally shown */}
                {/* AOR logic removed */}

                {formData.requiresVisa && (
                  <fieldset className="rounded-lg border p-4 space-y-4 border-amber-200 bg-amber-50/30">
                    <legend className="text-sm font-semibold text-amber-700 px-2 uppercase tracking-wider">{t("employees.create.form.visaRequired")}</legend>
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>
                        {formData.serviceType === "visa_eor"
                          ? "Visa EOR service type selected — visa sponsorship required."
                          : "Visa auto-detected: employee nationality differs from work country. Visa documents can be uploaded after creating the employee."}
                      </span>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={formData.requiresVisa} onChange={(e) => setFormData({ ...formData, requiresVisa: e.target.checked })} className="rounded" />
                      This employee requires a work visa
                    </label>
                  </fieldset>
                )}

                {!formData.requiresVisa && formData.nationality && formData.country && (
                  <p className="text-xs text-muted-foreground">{t("employees.create.form.noVisaRequiredHint")}</p>
                )}

                <p className="text-xs text-muted-foreground">{t("employees.create.form.documentsUploadHint")}</p>

                <div className="flex justify-end gap-3 pt-2 border-t">
                  <Button variant="outline" onClick={() => { setCreateOpen(false); setErrors({}); }}>{t("common.cancel")}</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? t("employees.create.creating") : t("employees.create.createEmployee")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          )}
          {activeTab === "contractors" && <ContractorCreateDialog />}
        </div>

        <TabsContent value="employees" className="mt-0 space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder={t("employees.create.form.customer")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("employees.list.filters.customer.all")}</SelectItem>
              {customers?.data?.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder={t("employees.list.table.header.country")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("employees.list.filters.country.all")}</SelectItem>
              {countriesList?.map((c: any) => (
                <SelectItem key={c.countryCode} value={c.countryCode}>{c.countryCode} — {c.countryName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder={t("employees.list.table.header.status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("employees.all_statuses")}</SelectItem>
              <SelectItem value="active">{t("status.active")}</SelectItem>
              <SelectItem value="pending_review">{t("status.pending_review")}</SelectItem>
              <SelectItem value="documents_incomplete">{t("status.documents_incomplete")}</SelectItem>
              <SelectItem value="onboarding">{t("status.onboarding")}</SelectItem>
              <SelectItem value="contract_signed">{t("status.contract_signed")}</SelectItem>
              <SelectItem value="on_leave">{t("status.on_leave")}</SelectItem>
              <SelectItem value="offboarding">{t("status.offboarding")}</SelectItem>
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

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>{t("employees.list.table.header.employee")}</TableHead>
                  <TableHead>{t("employees.create.form.customer")}</TableHead>
                  <TableHead className="min-w-[120px]">{t("employees.list.table.header.country")}</TableHead>
                  <TableHead>{t("employees.list.table.header.service")}</TableHead>
                  <TableHead>{t("employees.list.table.header.salary")}</TableHead>
                  <TableHead>{t("employees.list.table.header.status")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                      ))}
                      <TableCell></TableCell>
                    </TableRow>
                  ))
                ) : data?.data && data.data.length > 0 ? (
                  data.data.map((emp) => (
                    <TableRow key={emp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/people/${emp.id}?from_page=${page}`)}>
                      <TableCell className="text-sm text-muted-foreground font-mono">{emp.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {emp.firstName?.[0]}{emp.lastName?.[0]}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{emp.firstName} {emp.lastName}</div>
                            <div className="text-xs text-muted-foreground">{emp.employeeCode ? `${emp.employeeCode} · ` : ""}{emp.jobTitle || emp.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{emp.customerName || `Customer #${emp.customerId}`}</div>
                        {emp.clientCode && <div className="text-xs text-muted-foreground">{emp.clientCode}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{countryName(emp.country)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs uppercase">{emp.serviceType?.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {emp.salaryCurrency} {formatCurrencyAmount(emp.baseSalary, emp.salaryCurrency || "USD")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusColors[emp.status] || ""}`}>
                          {t(`status.${emp.status}`) || emp.status}
                        </Badge>
                      </TableCell>
                      <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">{t("employees.list.empty.message")}</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {data && (() => {
          const totalPages = Math.ceil(data.total / pageSize);
          return (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total} employees</p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t("employees.list.pagination.previous")}</Button>
                  <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t("employees.list.pagination.next")}</Button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Onboarding Invites Section */}
        <div className="mt-6">
          <button
            onClick={() => setShowInvites(!showInvites)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Mail className="w-4 h-4" />
            Self-Service Onboarding Invites
            {activeInvites.length > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                {pendingInvites.length} pending{activeInvites.length > pendingInvites.length ? ` · ${activeInvites.length - pendingInvites.length} expired` : ""}
              </Badge>
            )}
            <ChevronRight className={`w-4 h-4 transition-transform ${showInvites ? "rotate-90" : ""}`} />
          </button>

          {showInvites && (
            <Card className="mt-3">
              <CardContent className="p-0">
                {activeInvites.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("employees.invites.table.header.employeeName")}</TableHead>
                        <TableHead>{t("employees.create.form.email")}</TableHead>
                        <TableHead>{t("employees.create.form.customer")}</TableHead>
                        <TableHead>{t("employees.list.table.header.status")}</TableHead>
                        <TableHead>{t("employees.invites.table.header.sent")}</TableHead>
                        <TableHead>{t("employees.invites.table.header.expires")}</TableHead>
                        <TableHead className="w-20">{t("employees.invites.table.header.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeInvites.map((inv: any) => {
                        const isExpired = inv.status === "pending" && new Date(inv.expiresAt) < new Date();
                        const invStatus = isExpired ? "expired" : inv.status;
                        const invStatusColor: Record<string, string> = {
                          pending: "bg-amber-50 text-amber-700 border-amber-200",
                          completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
                          expired: "bg-red-50 text-red-700 border-red-200",
                          cancelled: "bg-gray-50 text-gray-500 border-gray-200",
                        };
                        return (
                          <TableRow key={inv.id}>
                            <TableCell className="text-sm font-medium">{inv.employeeName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{inv.employeeEmail}</TableCell>
                            <TableCell className="text-sm">{inv.customerName || `#${inv.customerId}`}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${invStatusColor[invStatus] || ""}`}>
                                {invStatus === "pending" ? t("employees.invites.awaitingResponse") : t("employees.invites.expired")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(inv.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(inv.expiresAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  if (confirm("Delete this onboarding invite?")) {
                                    deleteInvite.mutate({ id: inv.id });
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <Mail className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("employees.invites.empty.message")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        </TabsContent>
        <TabsContent value="contractors" className="mt-0">
          <ContractorListContent />
        </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

/* ========== Employee Detail ========== */
type DetailTab = "info" | "leave" | "payroll" | "adjustments" | "visa" | "documents";

function EmployeeDetail({ id }: { id: number }) {
  const { t, locale } = useI18n();
  const visaStatusLabels: Record<string, string> = {
    not_required: t("employees.visaStatus.not_required"),
    pending_application: t("employees.visaStatus.pending_application"),
    application_submitted: t("employees.visaStatus.application_submitted"),
    approved: t("employees.visaStatus.approved"),
    rejected: t("employees.visaStatus.rejected"),
    expired: t("employees.visaStatus.expired"),
  };
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const fromPage = new URLSearchParams(searchString).get("from_page") || "1";
  const [activeTab, setActiveTab] = useState<DetailTab>("info");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] = useState("resume");
  const [uploadDocName, setUploadDocName] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Offboarding / Termination dialog state
  const [offboardingDialogOpen, setOffboardingDialogOpen] = useState(false);
  const [offboardingEndDate, setOffboardingEndDate] = useState("");
  const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
  const [terminateEndDate, setTerminateEndDate] = useState("");
  const [terminateReason, setTerminateReason] = useState("");

  // Leave balance editing
  const [editLeaveId, setEditLeaveId] = useState<number | null>(null);
  const [editLeaveForm, setEditLeaveForm] = useState({ totalEntitlement: 0, used: 0, expiryDate: "" });

  const { data: employee, isLoading, refetch } = trpc.employees.get.useQuery({ id });
  const { data: documents, refetch: refetchDocs } = trpc.employees.documents.list.useQuery({ employeeId: id });
  const { data: contracts, refetch: refetchContracts } = trpc.employees.contracts.list.useQuery({ employeeId: id });
  const { data: salaryInfo } = trpc.employees.salaryInfo.useQuery({ id });
  const { data: leaveBalances, refetch: refetchLeave } = trpc.employees.leaveBalances.useQuery({ employeeId: id, year: new Date().getFullYear() });
  const { data: payrollHistory } = trpc.employees.payrollHistory.useQuery({ employeeId: id });
  const { data: adjustmentHistory } = trpc.employees.adjustmentHistory.useQuery({ employeeId: id });
  const { data: customers } = trpc.customers.list.useQuery({ limit: 200 });
  const { data: detailCountriesList } = trpc.countries.list.useQuery();

  // Worker Portal invite
  const { data: workerPortalStatus, refetch: refetchWpStatus } = trpc.employees.workerPortalStatus.useQuery(
    { employeeId: id },
    { enabled: !!id }
  );
  const inviteToWorkerPortalMutation = trpc.employees.inviteToWorkerPortal.useMutation({
    onSuccess: (data) => {
      if (data.alreadyExists) {
        toast.success(`Invite resent to ${data.email}`);
      } else {
        toast.success(`Worker Portal invite sent to ${data.email}`);
      }
      refetchWpStatus();
    },
    onError: (err) => toast.error(err.message),
  });

  // Auto-detect visa requirement when editing nationality/country
  const { data: editVisaCheck } = trpc.employees.checkVisaRequired.useQuery(
    { nationality: editForm.nationality || "", workCountry: editForm.country || "" },
    { enabled: !!editForm.nationality && !!editForm.country && editOpen }
  );

  // React to visa check changes in edit form: auto-update serviceType
  useEffect(() => {
    if (!editOpen || !editVisaCheck) return;
    if (editForm.serviceType === "aor") return; // AOR doesn't need visa check
    if (editVisaCheck.requiresVisa) {
      setEditForm((f: any) => ({ ...f, requiresVisa: true, serviceType: "visa_eor" }));
    } else {
      setEditForm((f: any) => ({
        ...f,
        requiresVisa: false,
        serviceType: f.serviceType === "visa_eor" ? "eor" : f.serviceType,
      }));
    }
  }, [editVisaCheck, editOpen]);

  const updateMutation = trpc.employees.update.useMutation({
    onSuccess: () => { toast.success("Employee updated"); setEditOpen(false); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const uploadMutation = trpc.employees.documents.upload.useMutation({
    onSuccess: () => { toast.success("Document uploaded"); setUploadDialogOpen(false); refetchDocs(); setUploadDocName(""); setUploadNotes(""); setSelectedFile(null); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.employees.documents.delete.useMutation({
    onSuccess: () => { toast.success("Document deleted"); refetchDocs(); },
    onError: (err) => toast.error(err.message),
  });

  const contractDeleteMut = trpc.employees.contracts.delete.useMutation({
    onSuccess: () => { toast.success("Contract deleted"); refetchContracts(); },
    onError: (err) => toast.error(err.message),
  });

  const contractUpdateMut = trpc.employees.contracts.update.useMutation({
    onSuccess: () => { toast.success("Contract updated"); refetchContracts(); },
    onError: (err) => toast.error(err.message),
  });

  const initLeaveBalanceMut = trpc.employees.initializeLeaveBalances.useMutation({
    onSuccess: (result) => { toast.success(`Initialized ${result.added} leave balance(s)`); refetchLeave(); },
    onError: (err) => toast.error(err.message),
  });

  const updateLeaveBalanceMut = trpc.employees.updateLeaveBalance.useMutation({
    onSuccess: () => { toast.success("Leave balance updated"); setEditLeaveId(null); refetchLeave(); },
    onError: (err) => toast.error(err.message),
  });

  // Merge all documents: contracts + visa docs + general documents
  // MUST be called before any early returns to respect React hooks rules
  const allDocuments = useMemo(() => {
    const docs: any[] = [];
    contracts?.forEach((c: any) => {
      docs.push({
        id: `contract-${c.id}`,
        type: "contract",
        category: "Contract",
        name: `${(c.contractType || "employment").replace(/_/g, " ")} contract`,
        status: c.status,
        date: c.signedDate || c.createdAt,
        fileUrl: c.fileUrl,
        contractId: c.id,
        contractType: c.contractType,
        effectiveDate: c.effectiveDate,
        expiryDate: c.expiryDate,
      });
    });
    documents?.forEach((d: any) => {
      docs.push({
        id: `doc-${d.id}`,
        type: d.documentType,
        category: d.documentType,
        name: d.documentName,
        date: d.createdAt,
        fileUrl: d.fileUrl,
        fileSize: d.fileSize,
        notes: d.notes,
        docId: d.id,
      });
    });
    return docs;
  }, [contracts, documents, t]);

  function openEditDialog() {
    if (!employee) return;
    setEditForm({
      firstName: employee.firstName || "",
      lastName: employee.lastName || "",
      email: employee.email || "",
      phone: employee.phone || "",
      dateOfBirth: formatDateISO(employee.dateOfBirth),
      gender: employee.gender || "",
      nationality: employee.nationality || "",
      idType: employee.idType || "",
      idNumber: employee.idNumber || "",
      address: employee.address || "",
      city: employee.city || "",
      state: employee.state || "",
      postalCode: employee.postalCode || "",
      country: employee.country || "",
      department: employee.department || "",
      jobTitle: employee.jobTitle || "",
      serviceType: employee.serviceType || "eor",
      employmentType: employee.employmentType || "long_term",
      baseSalary: employee.baseSalary || "",
      salaryCurrency: employee.salaryCurrency || "USD",
      estimatedEmployerCost: employee.estimatedEmployerCost || "",
      startDate: formatDateISO(employee.startDate),
      endDate: formatDateISO(employee.endDate),
      requiresVisa: employee.requiresVisa || false,
      visaStatus: employee.visaStatus || "not_required",
      visaExpiryDate: formatDateISO(employee.visaExpiryDate),
      visaNotes: employee.visaNotes || "",
    });
    setEditOpen(true);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }
    setSelectedFile(file);
    if (!uploadDocName) setUploadDocName(file.name);
  }

  function handleConfirmUpload() {
    if (!selectedFile) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        employeeId: id,
        documentType: uploadDocType as any,
        documentName: uploadDocName || selectedFile.name,
        fileBase64: base64,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/octet-stream",
        fileSize: selectedFile.size,
        notes: uploadNotes || undefined,
      });
    };
    reader.readAsDataURL(selectedFile);
  }

  if (isLoading) {
    return (
      <Layout breadcrumb={["EG", "Employees", "Loading..."]}>
        <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>
      </Layout>
    );
  }

  if (!employee) {
    return (
      <Layout breadcrumb={["EG", "Employees", "Not Found"]}>
        <div className="p-6 text-center py-20">
          <p className="text-muted-foreground">{t("employees.detail.notFound")}</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation(`/people?page=${fromPage}&tab=employees`)}>{t("employees.button.backToEmployees")}</Button>
        </div>
      </Layout>
    );
  }

  const customerName = customers?.data?.find((c) => c.id === employee.customerId)?.companyName || `Customer #${employee.customerId}`;

  // Status transitions with rollback capability
  const nextStatuses: Record<string, { label: string; value: string; variant?: string; icon?: any; dialogAction?: string }[]> = {
    pending_review: [
      { label: t("employees.actions.startOnboarding"), value: "onboarding" },
      { label: t("employees.actions.markDocumentsIncomplete"), value: "documents_incomplete", variant: "outline" },
      { label: t("employees.actions.reject"), value: "terminated", variant: "destructive" },
    ],
    documents_incomplete: [
      { label: t("employees.actions.documentsComplete"), value: "pending_review" },
      { label: t("employees.actions.reject"), value: "terminated", variant: "destructive" },
    ],
    onboarding: [
      { label: t("employees.actions.markContractSigned"), value: "contract_signed" },
      { label: t("employees.actions.rollbackToReview"), value: "pending_review", variant: "outline", icon: Undo2 },
    ],
    contract_signed: [
      // Note: auto-activation happens via cron when startDate arrives
      // Manual activation is available as fallback
      { label: t("employees.actions.activateNow"), value: "active", variant: "outline" },
      { label: t("employees.actions.rollbackToOnboarding"), value: "onboarding", variant: "outline", icon: Undo2 },
    ],
    active: [
      { label: t("employees.actions.startOffboarding"), value: "offboarding", dialogAction: "offboarding" },
      { label: t("employees.actions.putOnLeave"), value: "on_leave", variant: "outline" },
    ],
    on_leave: [
      { label: t("employees.actions.returnToActive"), value: "active" },
    ],
    offboarding: [
      { label: t("employees.actions.terminate"), value: "terminated", dialogAction: "terminate" },
      { label: t("employees.actions.rollbackToActive"), value: "active", variant: "outline", icon: Undo2 },
    ],
    terminated: [
      { label: t("employees.actions.reactivate"), value: "active", variant: "outline", icon: Undo2 },
    ],
  };
  const transitions = nextStatuses[employee.status] || [];

  const tabs: { key: DetailTab; label: string; show?: boolean }[] = [
    { key: "info", label: t("employees.detail.tabs.info") },
    { key: "leave", label: t("employees.detail.tabs.leave"), show: employee.status === "active" || employee.status === "on_leave" || employee.status === "offboarding" },
    { key: "payroll", label: `${t("employees.detail.tabs.payroll")}${payrollHistory?.length ? ` (${payrollHistory.length})` : ""}` },
    { key: "adjustments", label: `${t("employees.detail.tabs.adjustments")}${adjustmentHistory?.data?.length ? ` (${adjustmentHistory.data.length})` : ""}` },
    { key: "visa", label: t("employees.detail.tabs.visa"), show: employee.requiresVisa || employee.serviceType === "visa_eor" },
    { key: "documents", label: `${t("employees.detail.tabs.documents")} (${allDocuments.length})` },
  ];

  return (
    <Layout breadcrumb={["EG", "Employees", `${employee.firstName} ${employee.lastName}`]}>
      <div className="p-6 space-y-6 page-enter">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/people?page=${fromPage}&tab=employees`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{employee.firstName} {employee.lastName}</h1>
              <Badge variant="outline" className={`${statusColors[employee.status] || ""}`}>{t(`status.${employee.status}`) || employee.status}</Badge>
              <Badge variant="outline" className="text-xs uppercase">{t(`employees.create.form.serviceType.${employee.serviceType?.replace(/_([a-z])/g, g => g[1].toUpperCase()) || "eor"}`) || employee.serviceType}</Badge>
              {employee.requiresVisa && (
                <Badge variant="outline" className={`text-xs ${visaStatusColors[employee.visaStatus || ""] || ""}`}>
                  {t("employees.detail.visa.status.title")}: {t(`employees.visaStatus.${employee.visaStatus || "not_required"}`) || employee.visaStatus}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {(employee as any).employeeCode && <span className="font-mono mr-1">{(employee as any).employeeCode}</span>}
              {employee.jobTitle} · {customerName} {employee.department ? `· ${employee.department}` : ""}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {/* Worker Portal Invite Button */}
            {workerPortalStatus && !workerPortalStatus.hasAccount && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => inviteToWorkerPortalMutation.mutate({ employeeId: employee.id, email: employee.email || undefined })}
                disabled={inviteToWorkerPortalMutation.isPending}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Invite to Worker Portal
              </Button>
            )}
            {workerPortalStatus?.hasAccount && !workerPortalStatus.passwordSet && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => inviteToWorkerPortalMutation.mutate({ employeeId: employee.id })}
                disabled={inviteToWorkerPortalMutation.isPending}
                className="text-amber-600 border-amber-300"
              >
                <Send className="w-4 h-4 mr-2" />
                Resend Invite
              </Button>
            )}
            {workerPortalStatus?.hasAccount && workerPortalStatus.passwordSet && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 h-9 px-3 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                Worker Portal Active
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={openEditDialog}>
              <Pencil className="w-4 h-4 mr-2" />Edit
            </Button>
            {transitions.map((t) => (
              <Button key={t.value}
                variant={t.variant === "destructive" ? "destructive" : t.variant === "outline" ? "outline" : "default"}
                size="sm"
                onClick={() => {
                  if ((t as any).dialogAction === "offboarding") {
                    setOffboardingEndDate("");
                    setOffboardingDialogOpen(true);
                    return;
                  }
                  if ((t as any).dialogAction === "terminate") {
                    setTerminateEndDate(new Date().toISOString().split('T')[0]);
                    setTerminateReason("");
                    setTerminateDialogOpen(true);
                    return;
                  }
                  if (t.variant === "destructive" && !confirm(`Are you sure you want to ${t.label.toLowerCase()} this employee?`)) return;
                  updateMutation.mutate({ id: employee.id, data: { status: t.value as any } });
                }}
                disabled={updateMutation.isPending}>
                {t.icon && <t.icon className="w-3 h-3 mr-1" />}
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {tabs.filter(t => t.show !== false).map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Info Tab - All fields have icons */}
        {activeTab === "info" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" />{t("employees.create.sections.personalInformation")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label={t("employees.create.form.email")} value={employee.email} />
                <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label={t("employees.create.form.phone")} value={employee.phone} />
                <InfoRow icon={<Cake className="w-3.5 h-3.5" />} label={t("employees.detail.dateOfBirth")} value={formatDate(employee.dateOfBirth)} />
                <InfoRow icon={<Globe className="w-3.5 h-3.5" />} label={t("employees.create.form.nationality")} value={countryName(employee.nationality)} />
                <InfoRow icon={<User className="w-3.5 h-3.5" />} label={t("employees.detail.gender")} value={employee.gender ? employee.gender.charAt(0).toUpperCase() + employee.gender.slice(1) : undefined} />
                <div className="border-t pt-3 mt-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("employees.detail.identification")}</div>
                  <InfoRow icon={<CreditCard className="w-3.5 h-3.5" />} label={t("employees.detail.idType")} value={employee.idType ? employee.idType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : undefined} />
                  <InfoRow icon={<Hash className="w-3.5 h-3.5" />} label={t("employees.detail.idNumber")} value={employee.idNumber} />
                </div>
                <div className="border-t pt-3 mt-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("employees.detail.info.labels.address")}</div>
                  <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label={t("employees.detail.info.labels.address")} value={employee.address} />
                  <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label="City" value={employee.city} />
                  <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label="State / Province" value={employee.state} />
                  <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label="Postal Code" value={employee.postalCode} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="w-4 h-4" />{t("employees.sections.employmentDetails")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <InfoRow icon={<Building2 className="w-3.5 h-3.5" />} label={t("employees.create.form.customer")} value={customerName} />
                <InfoRow icon={<Briefcase className="w-3.5 h-3.5" />} label={t("employees.detail.jobTitle")} value={employee.jobTitle} />
                <InfoRow icon={<Users className="w-3.5 h-3.5" />} label={t("employees.create.form.department")} value={employee.department} />
                <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label={t("employees.list.table.header.country")} value={countryName(employee.country)} />
                <InfoRow icon={<Clock className="w-3.5 h-3.5" />} label={t("employees.detail.employmentType")} value={employee.employmentType?.replace(/_/g, " ")} />
                <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label={t("employees.detail.startDate")} value={formatDate(employee.startDate)} />
                <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label={t("employees.detail.endDate")} value={formatDate(employee.endDate)} />
                <div className="border-t pt-3 mt-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("employees.create.sections.compensation")}</div>
                  <InfoRow icon={<DollarSign className="w-3.5 h-3.5" />} label={t("employees.detail.baseSalary")} value={formatCurrencyAmount(employee.baseSalary, employee.salaryCurrency, { showCurrency: true })} />
                  <InfoRow icon={<DollarSign className="w-3.5 h-3.5" />} label={t("employees.detail.estEmployerCost")} value={formatCurrencyAmount(employee.estimatedEmployerCost, employee.salaryCurrency, { showCurrency: true })} />
                  <InfoRow icon={<DollarSign className="w-3.5 h-3.5" />} label={t("employees.detail.totalEmplCost")} value={formatCurrencyAmount(parseFloat(employee.baseSalary?.toString() || "0") + parseFloat(employee.estimatedEmployerCost?.toString() || "0"), employee.salaryCurrency, { showCurrency: true })} />
                </div>
                {(() => {
                  const bd = employee.bankDetails as Record<string, string> | null;
                  if (!bd || typeof bd !== "object" || Object.keys(bd).length === 0) return null;
                  return (
                    <div className="border-t pt-3 mt-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bank Details</div>
                      {Object.entries(bd).map(([key, value]) => (
                        value ? (
                          <InfoRow key={key} icon={<CreditCard className="w-3.5 h-3.5" />} label={key.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase()).trim()} value={String(value)} />
                        ) : null
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Leave Balance Tab - read-only display, policy-driven */}
        {activeTab === "leave" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Leave balances for {new Date().getFullYear()}. Entitlements are defined by Customer Leave Policy. Used days are auto-calculated from approved leave records.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {leaveBalances && leaveBalances.length > 0 ? leaveBalances
                .filter((lb: any) => {
                  // Filter out gender-mismatched balances where used === 0
                  const applicable = lb.applicableGender || "all";
                  if (applicable === "all") return true;
                  const empGender = employee?.gender;
                  if (!empGender || empGender === "other" || empGender === "prefer_not_to_say") return true;
                  if (applicable === empGender) return true;
                  return (lb.used ?? 0) > 0; // Keep if used > 0 (historical data)
                })
                .map((lb: any) => (
                <Card key={lb.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-medium text-sm">{lb.leaveTypeName || `Leave Type #${lb.leaveTypeId}`}</h4>
                        <p className="text-xs text-muted-foreground">{lb.year}</p>
                      </div>
                    </div>
                    <div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-lg font-bold text-primary">{lb.totalEntitlement}</div>
                          <div className="text-xs text-muted-foreground">{t("employees.detail.leave.table.header.entitled")}</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-amber-600">{lb.used}</div>
                          <div className="text-xs text-muted-foreground">{t("employees.detail.leave.table.header.used")}</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-emerald-600">{lb.remaining}</div>
                          <div className="text-xs text-muted-foreground">{t("employees.detail.leave.table.header.remaining")}</div>
                        </div>
                      </div>
                      {lb.expiryDate && (
                        <p className="text-xs text-muted-foreground mt-2 text-center">Expires: {formatDate(lb.expiryDate)}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )) : (
                <Card className="col-span-full">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t("employees.detail.leave.empty.message")}</p>
                    <p className="text-xs mt-1">{t("employees.detail.leave.empty.description")}</p>
                  </CardContent>
                </Card>
              )}
            </div>

          </div>
        )}

        {/* Payroll History Tab */}
        {activeTab === "payroll" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("employees.detail.payroll.description")}</p>
            <Card>
              <CardContent className="p-0">
                {payrollHistory && payrollHistory.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("employees.detail.payroll.table.header.month")}</TableHead>
                        <TableHead>{t("employees.list.table.header.status")}</TableHead>
                        <TableHead className="text-right">{t("employees.detail.info.labels.baseSalary")}</TableHead>
                        <TableHead className="text-right">{t("employees.detail.payroll.table.header.gross")}</TableHead>
                        <TableHead className="text-right">{t("employees.detail.payroll.table.header.deductions")}</TableHead>
                        <TableHead className="text-right">{t("employees.detail.payroll.table.header.net")}</TableHead>
                        <TableHead className="text-right">{t("employees.detail.payroll.table.header.employerCost")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payrollHistory.map((ph: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{ph.run?.payrollMonth ? formatMonth(ph.run.payrollMonth) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{ph.run?.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{ph.item?.currency} {ph.item?.baseSalary}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{ph.item?.gross}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-600">
                            {(parseFloat(ph.item?.taxDeduction || "0") + parseFloat(ph.item?.socialSecurityDeduction || "0")).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">{ph.item?.net}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{ph.item?.totalEmploymentCost}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <DollarSign className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("employees.detail.payroll.empty.message")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("employees.detail.payroll.empty.description")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Adjustments Tab */}
        {activeTab === "adjustments" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("employees.detail.adjustments.description")}</p>
            <Card>
              <CardContent className="p-0">
                {adjustmentHistory?.data && adjustmentHistory.data.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("employees.detail.adjustments.table.header.type")}</TableHead>
                        <TableHead>{t("employees.detail.adjustments.table.header.description")}</TableHead>
                        <TableHead className="text-right">{t("employees.detail.adjustments.table.header.amount")}</TableHead>
                        <TableHead>{t("employees.detail.payroll.table.header.month")}</TableHead>
                        <TableHead>{t("employees.list.table.header.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustmentHistory.data.map((adj: any) => (
                        <TableRow key={adj.id}>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">{adj.adjustmentType}</Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{adj.description}</TableCell>
                          <TableCell className={`text-right font-mono text-sm ${adj.adjustmentType === "deduction" ? "text-red-600" : "text-emerald-600"}`}>
                            {adj.adjustmentType === "deduction" ? "-" : "+"}{adj.currency} {adj.amount}
                          </TableCell>
                          <TableCell className="text-sm">{adj.effectiveMonth ? formatMonth(adj.effectiveMonth) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${adj.status === "approved" ? "bg-emerald-50 text-emerald-700" : adj.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                              {adj.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("employees.detail.adjustments.empty.message")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Visa Tab */}
        {activeTab === "visa" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" />{t("employees.detail.visa.status.title")}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <InfoRow icon={<Shield className="w-3.5 h-3.5" />} label="Requires Visa" value={employee.requiresVisa ? "Yes" : "No"} />
                  <InfoRow icon={<FileCheck className="w-3.5 h-3.5" />} label="Visa Status" value={visaStatusLabels[employee.visaStatus || ""] || employee.visaStatus} />
                  <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="Visa Expiry" value={formatDate(employee.visaExpiryDate)} />
                  <InfoRow icon={<FileText className="w-3.5 h-3.5" />} label="Visa Notes" value={employee.visaNotes} />
                  {employee.visaExpiryDate && new Date(employee.visaExpiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mt-3">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{t("employees.detail.visa.expiryWarning")}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">{t("employees.detail.visa.updateTitle")}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("employees.detail.visa.status.title")}</Label>
                    <Select value={editForm.visaStatus || employee.visaStatus || "not_required"} onValueChange={v => setEditForm((f: any) => ({ ...f, visaStatus: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_required">{t("employees.detail.visa.status.notRequired")}</SelectItem>
                        <SelectItem value="pending_application">{t("employees.detail.visa.status.pendingApplication")}</SelectItem>
                        <SelectItem value="application_submitted">{t("employees.detail.visa.status.applicationSubmitted")}</SelectItem>
                        <SelectItem value="approved">{t("status.approved")}</SelectItem>
                        <SelectItem value="rejected">{t("status.rejected")}</SelectItem>
                        <SelectItem value="expired">{t("employees.invites.status.expired")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("employees.detail.visa.status.labels.expiryDate")}</Label>
                    <DatePicker value={editForm.visaExpiryDate} onChange={d => setEditForm((f: any) => ({ ...f, visaExpiryDate: d }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("employees.detail.status.update.notes")}</Label>
                    <Textarea value={editForm.visaNotes ?? employee.visaNotes ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, visaNotes: e.target.value }))} rows={3} />
                  </div>
                  <Button size="sm" onClick={() => {
                    const data: any = {};
                    if (editForm.visaStatus) data.visaStatus = editForm.visaStatus;
                    if (editForm.visaExpiryDate) data.visaExpiryDate = editForm.visaExpiryDate;
                    if (editForm.visaNotes !== undefined) data.visaNotes = editForm.visaNotes;
                    if (Object.keys(data).length) updateMutation.mutate({ id, data });
                  }} disabled={updateMutation.isPending}>{t("employees.detail.visa.save")}</Button>
                </CardContent>
              </Card>
            </div>

            {/* Visa documents reference — view-only, managed in Documents tab */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t("employees.detail.visa.documents.title")}</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setActiveTab("documents")}>
                    Go to Documents Tab
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {allDocuments.filter(d => d.type === "visa" || d.type === "work_permit").length ? (
                  <div className="space-y-2">
                    {allDocuments.filter(d => d.type === "visa" || d.type === "work_permit").map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <span className="text-sm font-medium max-w-[200px] truncate inline-block align-middle">{doc.name}</span>
                            <Badge variant="outline" className="text-xs ml-2">{t(`employees.documents.category.${doc.category}`) || t(`employees.documentType.${doc.category}`) || doc.category}</Badge>
                          </div>
                        </div>
                        {doc.fileUrl && (
                          <Button variant="ghost" size="sm" onClick={() => window.open(doc.fileUrl, "_blank")}>
                            <Eye className="w-3.5 h-3.5 mr-1" /> View
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("employees.detail.visa.documents.emptyHint")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Unified Documents Tab - contracts, visa docs, and general documents */}
        {activeTab === "documents" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{t("employees.documents.allFilesHint")}</p>
              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Upload className="w-4 h-4 mr-2" />{t("employees.detail.actions.uploadDocument")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("employees.detail.actions.uploadDocument")}</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>{t("employees.detail.documents.upload.form.documentType")}</Label>
                      <Select value={uploadDocType} onValueChange={setUploadDocType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(docTypeLabels).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.documents.documentName")}</Label>
                      <Input value={uploadDocName} onChange={(e) => setUploadDocName(e.target.value)} placeholder={t("employees.documents.documentNamePlaceholder")} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.detail.documents.upload.form.notes")}</Label>
                      <Textarea value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} rows={2} placeholder="Any additional notes..." />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("employees.documents.fileMax10mb")}</Label>
                      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif" onChange={handleFileSelect} className="hidden" />
                      <div className="flex items-center gap-3">
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="w-4 h-4 mr-2" />
                          {t("employees.documents.chooseFile")}
                        </Button>
                        {selectedFile && <span className="text-sm text-muted-foreground">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</span>}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>{t("common.cancel")}</Button>
                    <Button onClick={handleConfirmUpload} disabled={!selectedFile || uploadMutation.isPending}>
                      {uploadMutation.isPending ? t("employees.documents.uploading") : t("employees.documents.upload")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                {allDocuments.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("employees.documents.table.document")}</TableHead>
                        <TableHead>{t("employees.documents.table.category")}</TableHead>
                        <TableHead>{t("employees.list.table.header.status")}</TableHead>
                        <TableHead>{t("common.date")}</TableHead>
                        <TableHead>{t("employees.detail.status.update.notes")}</TableHead>
                        <TableHead className="w-24">{t("employees.invites.table.header.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allDocuments.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium capitalize max-w-[200px] truncate inline-block">{doc.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{t(`employees.documents.category.${doc.category}`) || t(`employees.documentType.${doc.category}`) || doc.category}</Badge>
                          </TableCell>
                          <TableCell>
                            {doc.status ? (
                              <Badge variant="outline" className={`text-xs ${doc.status === "signed" ? "bg-emerald-50 text-emerald-700" : doc.status === "expired" ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-700"}`}>
                                {t(`employees.documents.status.${doc.status}`) || doc.status}
                              </Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(doc.date)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{doc.notes || "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {doc.fileUrl && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(doc.fileUrl, "_blank")} title="View/Download">
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {doc.contractId && doc.status === "draft" && (
                                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => contractUpdateMut.mutate({ id: doc.contractId, data: { status: "signed", signedDate: formatDateISO(new Date()) } })}>
                                  <FileCheck className="w-3 h-3 mr-1" /> {t("employees.documents.sign")}
                                </Button>
                              )}
                              {doc.docId && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => {
                                  if (confirm(t("employees.documents.confirmDeleteDoc"))) deleteMutation.mutate({ id: doc.docId });
                                }} title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {doc.contractId && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => {
                                  if (confirm(t("employees.documents.confirmDeleteContract"))) contractDeleteMut.mutate({ id: doc.contractId });
                                }} title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("employees.documents.empty")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("employees.documents.emptyHint")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Edit Employee Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("employees.edit.title")}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <fieldset className="rounded-lg border p-4 space-y-4">
                <legend className="text-sm font-semibold text-muted-foreground px-2">{t("employees.detail.info.sections.personal")}</legend>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.firstName")}</Label>
                    <Input value={editForm.firstName || ""} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.lastName")}</Label>
                    <Input value={editForm.lastName || ""} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.email")}</Label>
                    <Input type="email" value={editForm.email || ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value.toLowerCase() })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.phone")}</Label>
                    <Input value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.dateOfBirth")}</Label>
                    <DatePicker value={editForm.dateOfBirth} onChange={(d) => setEditForm({ ...editForm, dateOfBirth: d })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("employees.edit.gender")}</Label>
                    <Select value={editForm.gender || "_none"} onValueChange={(v) => setEditForm({ ...editForm, gender: v === "_none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">{t("common.notSpecified")}</SelectItem>
                        <SelectItem value="male">{t("employees.detail.gender.male")}</SelectItem>
                        <SelectItem value="female">{t("employees.detail.gender.female")}</SelectItem>
                        <SelectItem value="other">{t("employees.detail.gender.other")}</SelectItem>
                        <SelectItem value="prefer_not_to_say">{t("employees.detail.gender.preferNotToSay")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.nationality")}</Label>
                    <CountrySelect value={editForm.nationality || ""} onValueChange={(v) => setEditForm({ ...editForm, nationality: v })} showCode={false} scope="all" />
                  </div>
                  {editVisaCheck && editForm.nationality && editForm.country && (
                    <p className="text-xs text-muted-foreground">
                      {editVisaCheck.requiresVisa
                        ? "\u26A0 Nationality differs from work country \u2014 visa may be required. Service type will auto-update."
                        : "Nationality matches work country \u2014 no visa required."}
                    </p>
                  )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("employees.edit.idType")}</Label>
                    <Select value={editForm.idType || "_none"} onValueChange={(v) => setEditForm({ ...editForm, idType: v === "_none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Select ID type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">{t("common.notSpecified")}</SelectItem>
                        <SelectItem value="passport">{t("employees.detail.idType.passport")}</SelectItem>
                        <SelectItem value="national_id">{t("employees.detail.idType.nationalId")}</SelectItem>
                        <SelectItem value="drivers_license">{t("employees.detail.idType.driversLicense")}</SelectItem>
                        <SelectItem value="other">{t("employees.detail.gender.other")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("employees.edit.idNumber")}</Label>
                    <Input value={editForm.idNumber || ""} onChange={(e) => setEditForm({ ...editForm, idNumber: e.target.value })} placeholder="ID document number" />
                  </div>
                </div>
              </fieldset>

              <fieldset className="rounded-lg border p-4 space-y-4">
                <legend className="text-sm font-semibold text-muted-foreground px-2">{t("employees.detail.info.labels.address")}</legend>
                <div className="space-y-2">
                  <Label>{t("employees.edit.streetAddress")}</Label>
                  <Input value={editForm.address || ""} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} placeholder="Street address" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("common.city")}</Label>
                    <Input value={editForm.city || ""} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("common.stateProvince")}</Label>
                    <Input value={editForm.state || ""} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("common.postalCode")}</Label>
                  <Input value={editForm.postalCode || ""} onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })} className="max-w-[200px]" />
                </div>
              </fieldset>

              <fieldset className="rounded-lg border p-4 space-y-4">
                <legend className="text-sm font-semibold text-muted-foreground px-2">{t("employees.sections.employment")}</legend>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.jobTitle")}</Label>
                    <Input value={editForm.jobTitle || ""} onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.department")}</Label>
                    <Input value={editForm.department || ""} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("employees.list.table.header.country")}</Label>
                    <CountrySelect value={editForm.country || ""} onValueChange={(v) => {
                      const countryConfig = detailCountriesList?.find((c: any) => c.countryCode === v);
                      setEditForm({ ...editForm, country: v, salaryCurrency: countryConfig?.localCurrency || editForm.salaryCurrency });
                    }} showCode={false} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.serviceType")}</Label>
                    <Select value={editForm.serviceType || "eor"} onValueChange={(v) => setEditForm({ ...editForm, serviceType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eor">{t("employees.create.form.serviceType.eor")}</SelectItem>
                        <SelectItem value="visa_eor">{t("employees.create.form.serviceType.visaEor")}</SelectItem>
                        <SelectItem value="aor">{t("employees.create.form.serviceType.aor")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.employmentType")}</Label>
                    <Select value={editForm.employmentType || "long_term"} onValueChange={(v) => setEditForm({ ...editForm, employmentType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed_term">{t("employees.create.form.employmentType.fixedTerm")}</SelectItem>
                        <SelectItem value="long_term">{t("employees.create.form.employmentType.longTerm")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("employees.edit.startDateContractEffective")}</Label>
                    <DatePicker value={editForm.startDate} onChange={(d) => setEditForm({ ...editForm, startDate: d })} />
                  </div>
                  {(editForm.employmentType === "fixed_term") && (
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.endDate")}</Label>
                    <DatePicker value={editForm.endDate} onChange={(d) => setEditForm({ ...editForm, endDate: d })} />
                  </div>
                  )}
                </div>
              </fieldset>

              <fieldset className="rounded-lg border p-4 space-y-4">
                <legend className="text-sm font-semibold text-muted-foreground px-2">{t("employees.sections.compensationLeave")}</legend>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("employees.detail.info.labels.baseSalary")}</Label>
                    <Input type="number" step="0.01" value={editForm.baseSalary || ""} onChange={(e) => setEditForm({ ...editForm, baseSalary: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.salaryCurrency")} <span className="text-xs text-muted-foreground font-normal">{t("employees.create.form.currencyAutoFromCountry")}</span></Label>
                    <Input value={editForm.salaryCurrency || "—"} disabled className="bg-muted" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.estimatedEmployerCostMonthly")}</Label>
                    <Input type="number" step="0.01" value={editForm.estimatedEmployerCost || ""} onChange={(e) => setEditForm({ ...editForm, estimatedEmployerCost: e.target.value })} placeholder="0.00" />
                    <p className="text-xs text-muted-foreground">{t("employees.edit.usedForDepositCalculation")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("employees.create.form.totalEmploymentCost")} <span className="text-xs text-muted-foreground font-normal">{t("employees.create.form.calculated")}</span></Label>
                    <Input value={((parseFloat(editForm.baseSalary?.toString() || "0") || 0) + (parseFloat(editForm.estimatedEmployerCost?.toString() || "0") || 0)).toFixed(2)} disabled className="bg-muted font-mono" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t("employees.create.form.leavePolicyHint")}</p>
              </fieldset>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={() => updateMutation.mutate({ id, data: editForm })} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {/* Start Offboarding Dialog */}
        <Dialog open={offboardingDialogOpen} onOpenChange={setOffboardingDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("employees.actions.startOffboarding")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                {t("offboarding.dialog.description")}
              </p>
              <div className="space-y-2">
                <Label>{t("offboarding.dialog.endDate")}</Label>
                <DatePicker
                  value={offboardingEndDate}
                  onChange={(d) => setOffboardingEndDate(d || "")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOffboardingDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={!offboardingEndDate || updateMutation.isPending}
                onClick={() => {
                  updateMutation.mutate(
                    { id: employee.id, data: { status: "offboarding" as any, endDate: offboardingEndDate } },
                    { onSuccess: () => { setOffboardingDialogOpen(false); toast.success(t("offboarding.dialog.success")); refetch(); } }
                  );
                }}
              >
                {updateMutation.isPending ? t("common.processing") : t("offboarding.dialog.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Terminate Now Dialog */}
        <Dialog open={terminateDialogOpen} onOpenChange={setTerminateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("employees.actions.terminate")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                {t("terminate.dialog.description")}
              </p>
              <div className="space-y-2">
                <Label>{t("terminate.dialog.endDate")}</Label>
                <DatePicker
                  value={terminateEndDate}
                  onChange={(d) => setTerminateEndDate(d || new Date().toISOString().split('T')[0])}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("terminate.dialog.reason")}</Label>
                <Textarea
                  value={terminateReason}
                  onChange={(e) => setTerminateReason(e.target.value)}
                  placeholder={t("terminate.dialog.reasonPlaceholder")}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTerminateDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={updateMutation.isPending}
                onClick={() => {
                  const data: any = { status: "terminated" };
                  if (terminateEndDate) data.endDate = terminateEndDate;
                  updateMutation.mutate(
                    { id: employee.id, data },
                    { onSuccess: () => { setTerminateDialogOpen(false); toast.success(t("terminate.dialog.success")); refetch(); } }
                  );
                }}
              >
                {updateMutation.isPending ? t("common.processing") : t("terminate.dialog.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

function InfoRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-4 flex-shrink-0 flex items-center justify-center">{icon || <span className="w-3.5 h-3.5" />}</span>
      <span className="text-xs text-muted-foreground w-32 flex-shrink-0">{label}</span>
      <span className="text-sm capitalize">{value || "—"}</span>
    </div>
  );
}

export default function Employees() {
  const [matchDetail, params] = useRoute("/people/:id");
  // Also support legacy route
  const [matchLegacy, paramsLegacy] = useRoute("/employees/:id");
  
  const effectiveParams = matchDetail ? params : (matchLegacy ? paramsLegacy : null);
  
  if (effectiveParams?.id) {
    const id = parseInt(effectiveParams.id, 10);
    if (!isNaN(id)) return <EmployeeDetail id={id} />;
  }
  return <EmployeeList />;
}
