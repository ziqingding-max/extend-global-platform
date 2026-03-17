/**
 * Portal Employee Detail Page
 *
 * Shows full employee profile, documents, contracts, and leave balances.
 * Unified design language with consistent field display patterns.
 */
import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import PortalLayout from "@/components/PortalLayout";
import { portalPath } from "@/lib/portalBasePath";
import { portalTrpc } from "@/lib/portalTrpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/DatePicker";
import {
  ArrowLeft,
  User,
  Briefcase,
  FileText,
  Calendar,
  MapPin,
  Mail,
  Phone,
  Globe,
  Download,
  Upload,
  Shield,
  CreditCard,
  Home,
  Hash,
  Clock,
  AlertCircle,
  AlertTriangle,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDate, countryName } from "@/lib/format";

import { useI18n } from "@/lib/i18n";

const statusColors: Record<string, string> = {
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  documents_incomplete: "bg-rose-50 text-rose-700 border-rose-200",
  onboarding: "bg-blue-50 text-blue-700 border-blue-200",
  contract_signed: "bg-indigo-50 text-indigo-700 border-indigo-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  on_leave: "bg-purple-50 text-purple-700 border-purple-200",
  offboarding: "bg-orange-50 text-orange-700 border-orange-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
};

export default function PortalEmployeeDetail() {
  const { t, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const employeeId = parseInt(params.id || "0", 10);

  const { data: employee, isLoading, refetch } = portalTrpc.employees.detail.useQuery(
    { id: employeeId },
    { enabled: !!employeeId }
  );

  // Termination request state
  const [terminateRequestOpen, setTerminateRequestOpen] = useState(false);
  const [terminateEndDate, setTerminateEndDate] = useState("");
  const [terminateReason, setTerminateReason] = useState("");

  const requestTerminationMutation = portalTrpc.employees.requestTermination.useMutation({
    onSuccess: () => {
      toast.success(t("portal.termination.dialog.success"));
      setTerminateRequestOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  // Document upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDocType, setUploadDocType] = useState("passport");
  const [uploadDocName, setUploadDocName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = portalTrpc.employees.uploadDocument.useMutation({
    onSuccess: () => {
      toast.success(t("portal_employees.toast.uploadSuccess"));
      setUploadOpen(false);
      setUploadDocName("");
      setUploadDocType("passport");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("portal_employees.toast.fileTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        employeeId,
        documentType: uploadDocType as any,
        documentName: uploadDocName || file.name,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
      });
    };
    reader.readAsDataURL(file);
  }

  // Helper: get i18n'd doc type label
  function docTypeLabel(dt: string): string {
    const key = `portal_employees.docType.${dt}`;
    const val = t(key);
    return val !== key ? val : dt;
  }

  // Helper: get i18n'd status label
  function statusLabel(s: string): string {
    const key = `portal_employees.status.${s}`;
    const val = t(key);
    return val !== key ? val : s;
  }

  // Can upload documents when status is documents_incomplete or pending_review
  const canUploadDocuments = employee?.status === "documents_incomplete" || employee?.status === "pending_review";

  if (isLoading) {
    return (
      <PortalLayout title={t("portal_employees.detail.title")}>
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-64 col-span-1" />
            <Skeleton className="h-64 col-span-2" />
          </div>
        </div>
      </PortalLayout>
    );
  }

  if (!employee) {
    return (
      <PortalLayout title={t("portal_employees.detail.title")}>
        <div className="p-6 max-w-5xl mx-auto">
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mb-4" />
            <p className="text-lg font-medium">{t("portal_employees.detail.notFound")}</p>
            <Button variant="outline" className="mt-4" onClick={() => setLocation(portalPath("/people?tab=employees"))}>
              <ArrowLeft className="w-4 h-4 mr-2" /> {t("portal_employees.detail.backToEmployees")}
            </Button>
          </div>
        </div>
      </PortalLayout>
    );
  }

  const statusColor = statusColors[employee.status] || statusColors.active;

  return (
    <PortalLayout title={t("portal_employees.detail.title")}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation(portalPath("/people?tab=employees"))}>
              <ArrowLeft className="w-4 h-4 mr-2" /> {t("portal_employees.detail.back")}
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold tracking-tight">
                  {employee.firstName} {employee.lastName}
                </h2>
                <Badge variant="outline" className={statusColor}>{statusLabel(employee.status)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {employee.employeeCode && <span className="mr-3">{employee.employeeCode}</span>}
                {employee.jobTitle} · {countryName(employee.country)}
              </p>
            </div>
          </div>
          {employee.status === "active" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setTerminateEndDate("");
                setTerminateReason("");
                setTerminateRequestOpen(true);
              }}
            >
              {t("portal.termination.requestButton")}
            </Button>
          )}
        </div>

        {/* Profile + Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Profile Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <User className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{employee.firstName} {employee.lastName}</h3>
                <p className="text-sm text-muted-foreground">{employee.jobTitle}</p>
                {employee.department && (
                  <p className="text-xs text-muted-foreground mt-1">{employee.department}</p>
                )}
              </div>
              <div className="mt-6 space-y-3">
                <ContactRow icon={Mail} label={t("portal_employees.profile.email")} value={employee.email} />
                <ContactRow icon={Phone} label={t("portal_employees.profile.phone")} value={employee.phone} />
                <ContactRow icon={MapPin} label={t("portal_employees.profile.location")} value={
                  [employee.city, employee.state, countryName(employee.country)].filter(Boolean).join(", ") || undefined
                } />
                <ContactRow icon={Globe} label={t("portal_employees.personal.nationality")} value={countryName(employee.nationality)} />
                <ContactRow icon={Calendar} label={t("portal_employees.profile.dob")} value={
                  employee.dateOfBirth ? formatDate(employee.dateOfBirth) : undefined
                } />
              </div>
            </CardContent>
          </Card>

          {/* Right: Tabs */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="personal">
              <TabsList>
                <TabsTrigger value="personal">{t("portal_employees.tabs.personal")}</TabsTrigger>
                <TabsTrigger value="employment">{t("portal_employees.tabs.employment")}</TabsTrigger>
                <TabsTrigger value="documents">{t("portal_employees.tabs.documents")} ({employee.documents?.length || 0})</TabsTrigger>
                <TabsTrigger value="contracts">{t("portal_employees.tabs.contracts")} ({employee.contracts?.length || 0})</TabsTrigger>
                {(employee.status === "active" || employee.status === "on_leave") && (
                  <TabsTrigger value="leave">{t("portal_employees.tabs.leave")}</TabsTrigger>
                )}
              </TabsList>

              {/* Personal Information Tab */}
              <TabsContent value="personal" className="mt-4">
                <Card>
                  <CardContent className="pt-6">
                    <SectionTitle>{t("portal_employees.personal.basicInfo")}</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                      <InfoField icon={User} label={t("portal_employees.personal.fullNameLabel")} value={`${employee.firstName} ${employee.lastName}`} hint={t("portal_employees.personal.fullNameHint")} />
                      <InfoField icon={Mail} label={t("portal_employees.personal.emailLabel")} value={employee.email} hint={t("portal_employees.personal.emailHint")} />
                      <InfoField icon={Phone} label={t("portal_employees.personal.phoneLabel")} value={employee.phone} hint={t("portal_employees.personal.phoneHint")} />
                      <InfoField icon={Calendar} label={t("portal_employees.personal.dobLabel")} value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : undefined} hint={t("portal_employees.personal.dobHint")} />
                      <InfoField icon={User} label={t("portal_employees.personal.gender")} value={
                        employee.gender === "male" ? t("portal_employees.gender.male") :
                        employee.gender === "female" ? t("portal_employees.gender.female") :
                        employee.gender === "other" ? t("portal_employees.gender.other") : undefined
                      } hint={t("portal_employees.personal.genderHint")} />
                      <InfoField icon={Globe} label={t("portal_employees.personal.nationalityLabel")} value={countryName(employee.nationality)} hint={t("portal_employees.personal.nationalityHint")} />
                    </div>

                    <SectionTitle className="mt-8">{t("portal_employees.personal.identification")}</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                      <InfoField icon={CreditCard} label={t("portal_employees.personal.idTypeLabel")} value={
                        employee.idType === "passport" ? t("portal_employees.idType.passport") :
                        employee.idType === "national_id" ? t("portal_employees.idType.national_id") :
                        employee.idType === "drivers_license" ? t("portal_employees.idType.drivers_license") :
                        employee.idType
                      } hint={t("portal_employees.personal.idTypeHint")} />
                      <InfoField icon={Hash} label={t("portal_employees.personal.idNumberLabel")} value={employee.idNumber} hint={t("portal_employees.personal.idNumberHint")} />
                    </div>

                    <SectionTitle className="mt-8">{t("portal_employees.personal.address")}</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                      <InfoField icon={Home} label={t("portal_employees.personal.streetLabel")} value={employee.address} hint={t("portal_employees.personal.addressHint")} />
                      <InfoField icon={MapPin} label={t("portal_employees.personal.city")} value={employee.city} />
                      <InfoField icon={MapPin} label={t("portal_employees.personal.stateLabel")} value={employee.state} />
                      <InfoField icon={Hash} label={t("portal_employees.personal.postalCodeLabel")} value={employee.postalCode} />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Employment Tab */}
              <TabsContent value="employment" className="mt-4">
                <Card>
                  <CardContent className="pt-6">
                    <SectionTitle>{t("portal_employees.employment.details")}</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                      <InfoField icon={Briefcase} label={t("portal_employees.employment.serviceType")} value={
                        employee.serviceType === "eor" ? t("portal_employees.serviceType.eor") :
                        employee.serviceType === "visa_eor" ? t("portal_employees.serviceType.visa_eor") :
                        employee.serviceType === "aor" ? t("portal_employees.serviceType.aor") :
                        employee.serviceType
                      } hint={t("portal_employees.employment.serviceTypeHint")} />
                      <InfoField icon={Briefcase} label={t("portal_employees.employment.employmentType")} value={
                        employee.employmentType === "long_term" ? t("portal_employees.employmentType.long_term") :
                        employee.employmentType === "fixed_term" ? t("portal_employees.employmentType.fixed_term") :
                        employee.employmentType
                      } hint={t("portal_employees.employment.typeHint")} />
                      <InfoField icon={Calendar} label={t("portal_employees.employment.startDate")} value={employee.startDate ? formatDate(employee.startDate) : undefined} hint={t("portal_employees.employment.startDateHint")} />
                      <InfoField icon={Calendar} label={t("portal_employees.employment.endDate")} value={employee.endDate ? formatDate(employee.endDate) : undefined} hint={t("portal_employees.employment.endDateHint")} />
                      <InfoField icon={MapPin} label={t("portal_employees.employment.employmentCountry")} value={countryName(employee.country)} hint={t("portal_employees.employment.employmentCountryHint")} />
                      <InfoField icon={Briefcase} label={t("portal_employees.employment.department")} value={employee.department} hint={t("portal_employees.employment.departmentHint")} />
                      <InfoField icon={Briefcase} label={t("portal_employees.employment.jobTitle")} value={employee.jobTitle} hint={t("portal_employees.employment.jobTitleHint")} />
                      <InfoField icon={Hash} label={t("portal_employees.employment.employeeCode")} value={employee.employeeCode} hint={t("portal_employees.employment.employeeCodeHint")} />
                    </div>

                    <SectionTitle className="mt-8">{t("portal_employees.employment.compensation")}</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                      <InfoField icon={CreditCard} label={t("portal_employees.employment.baseSalary")} value={
                        employee.baseSalary != null
                          ? `${Number(employee.baseSalary).toLocaleString()} ${employee.salaryCurrency || "USD"}/month`
                          : undefined
                      } hint={t("portal_employees.employment.baseSalaryHint")} />
                      <InfoField icon={CreditCard} label={t("portal_employees.employment.salaryCurrency")} value={employee.salaryCurrency} hint={t("portal_employees.employment.salaryCurrencyHint")} />
                    </div>

                    {/* Bank Details Section */}
                    {(() => {
                      const bd = employee.bankDetails as Record<string, string> | null;
                      if (!bd || typeof bd !== "object" || Object.keys(bd).length === 0) return null;
                      return (
                        <>
                          <SectionTitle className="mt-8">{t("portal_employees.employment.bankDetails")}</SectionTitle>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                            {Object.entries(bd).map(([key, value]) => (
                              value ? (
                                <InfoField
                                  key={key}
                                  icon={CreditCard}
                                  label={key.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase()).trim()}
                                  value={String(value)}
                                />
                              ) : null
                            ))}
                          </div>
                        </>
                      );
                    })()}

                    {employee.requiresVisa && (
                      <>
                        <SectionTitle className="mt-8">{t("portal_employees.visa.title")}</SectionTitle>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                          <InfoField icon={Shield} label={t("portal_employees.visa.status")} value={
                            employee.visaStatus
                              ? employee.visaStatus.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                              : t("portal_employees.visa.pending")
                          } hint={t("portal_employees.visa.statusHint")} />
                          <InfoField icon={Calendar} label={t("portal_employees.visa.expiry")} value={employee.visaExpiryDate ? formatDate(employee.visaExpiryDate) : undefined} hint={t("portal_employees.visa.expiryHint")} />
                          <InfoField icon={FileText} label={t("portal_employees.visa.notes")} value={employee.visaNotes} hint={t("portal_employees.visa.notesHint")} />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="mt-4 space-y-4">
                {/* Documents Incomplete Banner */}
                {employee.status === "documents_incomplete" && (
                  <Card className="border-rose-200 bg-rose-50">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-rose-800">{t("portal_employees.status.documents_incomplete")}</p>
                          <p className="text-xs text-rose-600 mt-1">
                            {t("portal_employees.documents.bannerText")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Upload Button */}
                {canUploadDocuments && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => setUploadOpen(true)}>
                      <Upload className="w-4 h-4 mr-2" /> {t("portal_employees.documents.uploadButton")}
                    </Button>
                  </div>
                )}

                {(employee.documents?.length || 0) === 0 ? (
                  <Card>
                    <CardContent className="py-12">
                      <div className="flex flex-col items-center text-muted-foreground">
                        <FileText className="w-10 h-10 mb-3" />
                        <p className="font-medium">{t("portal_employees.documents.noDocumentsUploaded")}</p>
                        <p className="text-sm mt-1">
                          {canUploadDocuments
                            ? t("portal_employees.documents.uploadHint")
                            : t("portal_employees.documents.willAppear")}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {employee.documents!.map((doc) => (
                      <Card key={doc.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{doc.documentName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {docTypeLabel(doc.documentType)}
                                  {doc.uploadedAt && ` · ${formatDate(doc.uploadedAt)}`}
                                </p>
                              </div>
                            </div>
                            {doc.fileUrl && (
                              <Button variant="ghost" size="sm" asChild>
                                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                                  <Download className="w-4 h-4 mr-1" /> {t("portal_employees.documents.view")}
                                </a>
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Contracts Tab */}
              <TabsContent value="contracts" className="mt-4">
                {(employee.contracts?.length || 0) === 0 ? (
                  <Card>
                    <CardContent className="py-12">
                      <div className="flex flex-col items-center text-muted-foreground">
                        <Shield className="w-10 h-10 mb-3" />
                        <p className="font-medium">{t("portal_employees.contracts.noContractsTitle")}</p>
                        <p className="text-sm mt-1">{t("portal_employees.contracts.willAppear")}</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {employee.contracts!.map((contract: any) => (
                      <Card key={`${contract.source || "contract"}-${contract.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                <Shield className="w-5 h-5 text-indigo-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{contract.contractType || t("portal_employees.contracts.employmentContract")}</p>
                                <p className="text-xs text-muted-foreground">
                                  {contract.effectiveDate && `${t("portal_employees.contracts.effective")}: ${formatDate(contract.effectiveDate)}`}
                                  {contract.expiryDate && ` \u2014 ${t("portal_employees.contracts.expires")}: ${formatDate(contract.expiryDate)}`}
                                  {!contract.effectiveDate && !contract.expiryDate && contract.uploadedAt && `Uploaded: ${formatDate(contract.uploadedAt)}`}
                                  {contract.notes && ` \u00b7 ${contract.notes}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {contract.status && (
                                <Badge variant="outline" className={
                                  contract.status === "signed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                  contract.status === "draft" ? "bg-gray-50 text-gray-600 border-gray-200" :
                                  "bg-amber-50 text-amber-700 border-amber-200"
                                }>
                                  {contract.status}
                                </Badge>
                              )}
                              {contract.fileUrl && (
                                <Button variant="ghost" size="sm" asChild>
                                  <a href={contract.fileUrl} target="_blank" rel="noopener noreferrer">
                                    <Download className="w-4 h-4" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Leave Balances Tab */}
              <TabsContent value="leave" className="mt-4">
                {/* Filter leave balances by gender */}
                {(() => {
                  const empGender = employee.gender;
                  const filtered = (employee.leaveBalances || []).filter((b: any) => {
                    const applicable = b.applicableGender || "all";
                    if (applicable === "all") return true;
                    if (!empGender || empGender === "other" || empGender === "prefer_not_to_say") return true;
                    if (applicable === empGender) return true;
                    return (b.used ?? 0) > 0;
                  });
                  return filtered;
                })().length === 0 ? (
                  <Card>
                    <CardContent className="py-12">
                      <div className="flex flex-col items-center text-muted-foreground">
                        <Calendar className="w-10 h-10 mb-3" />
                        <p className="font-medium">{t("portal_employees.leave.noBalances")}</p>
                        <p className="text-sm mt-1">{t("portal_employees.leave.willAppear")}</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(() => {
                      const empGender = employee.gender;
                      return (employee.leaveBalances || []).filter((b: any) => {
                        const applicable = b.applicableGender || "all";
                        if (applicable === "all") return true;
                        if (!empGender || empGender === "other" || empGender === "prefer_not_to_say") return true;
                        if (applicable === empGender) return true;
                        return (b.used ?? 0) > 0;
                      });
                    })().map((balance) => (
                      <Card key={balance.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium">{balance.leaveTypeName || `Leave Type #${balance.leaveTypeId}`}</p>
                            <span className="text-xs text-muted-foreground">{balance.year}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                <span>{t("portal_employees.leave.used")}: {balance.used}</span>
                                <span>{t("portal_employees.leave.total")}: {balance.totalEntitlement}</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${Number(balance.totalEntitlement) > 0 ? Math.min(100, (Number(balance.used) / Number(balance.totalEntitlement)) * 100) : 0}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-primary">{balance.remaining}</p>
                              <p className="text-xs text-muted-foreground">{t("portal_employees.leave.remaining")}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>


            </Tabs>
          </div>
        </div>
        {/* Upload Document Dialog */}
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("portal_employees.documents.upload")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>{t("portal_employees.upload.docType")}</Label>
                <Select value={uploadDocType} onValueChange={setUploadDocType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passport">{t("portal_employees.docType.passport")}</SelectItem>
                    <SelectItem value="national_id">{t("portal_employees.docType.national_id")}</SelectItem>
                    <SelectItem value="resume">{t("portal_employees.docType.resume")}</SelectItem>
                    <SelectItem value="work_permit">{t("portal_employees.docType.work_permit")}</SelectItem>
                    <SelectItem value="visa">{t("portal_employees.docType.visa")}</SelectItem>
                    <SelectItem value="education">{t("portal_employees.docType.education")}</SelectItem>
                    <SelectItem value="other">{t("portal_employees.docType.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("portal_employees.upload.docName")}</Label>
                <Input
                  value={uploadDocName}
                  onChange={(e) => setUploadDocName(e.target.value)}
                  placeholder={t("portal_employees.upload.docNamePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("portal_employees.upload.file")}</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={handleFileUpload}
                  disabled={uploadMutation.isPending}
                />
              </div>
              {uploadMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("portal_employees.upload.uploading")}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        {/* Request Termination Dialog */}
        <Dialog open={terminateRequestOpen} onOpenChange={setTerminateRequestOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("portal.termination.dialog.title.employee")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                {t("portal.termination.dialog.description")}
              </p>
              <div className="space-y-2">
                <Label>{t("portal.termination.dialog.endDate")}</Label>
                <DatePicker
                  value={terminateEndDate}
                  onChange={(d) => setTerminateEndDate(d || "")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("portal.termination.dialog.reason")}</Label>
                <Textarea
                  value={terminateReason}
                  onChange={(e) => setTerminateReason(e.target.value)}
                  placeholder={t("portal.termination.dialog.reasonPlaceholder")}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTerminateRequestOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={!terminateEndDate || requestTerminationMutation.isPending}
                onClick={() => {
                  requestTerminationMutation.mutate({
                    employeeId,
                    endDate: terminateEndDate,
                    reason: terminateReason || undefined,
                  });
                }}
              >
                {requestTerminationMutation.isPending
                  ? t("portal.termination.dialog.submitting")
                  : t("portal.termination.dialog.submit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}

/* ── Shared UI Components ── */

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h4 className={cn("text-sm font-semibold text-foreground/80 uppercase tracking-wider mb-4", className)}>
      {children}
    </h4>
  );
}

function InfoField({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value?: string | null; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-sm font-medium mt-0.5 truncate">{value || "—"}</p>
        {hint && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function ContactRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="truncate">{value}</p>
      </div>
    </div>
  );
}
