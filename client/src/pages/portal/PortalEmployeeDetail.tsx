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
      toast.success("Termination request submitted successfully.");
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
      toast.success("Document uploaded successfully.");
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
      toast.error("File size exceeds 10MB limit.");
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

  // Helper: get doc type label
  function docTypeLabel(dt: string): string {
    switch (dt) {
      case "passport": return "Passport";
      case "national_id": return "National ID";
      case "resume": return "Resume";
      case "work_permit": return "Work Permit";
      case "visa": return "Visa";
      case "education": return "Education Certificate";
      case "other": return "Other";
      default: return dt;
    }
  }

  // Helper: get status label
  function statusLabel(s: string): string {
    switch (s) {
      case "pending_review": return "Pending Review";
      case "documents_incomplete": return "Documents Incomplete";
      case "onboarding": return "Onboarding";
      case "contract_signed": return "Contract Signed";
      case "active": return "Active";
      case "on_leave": return "On Leave";
      case "offboarding": return "Offboarding";
      case "terminated": return "Terminated";
      default: return s;
    }
  }

  // Can upload documents when status is documents_incomplete or pending_review
  const canUploadDocuments = employee?.status === "documents_incomplete" || employee?.status === "pending_review";

  if (isLoading) {
    return (
      <PortalLayout title="Employee Details">
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
      <PortalLayout title="Employee Details">
        <div className="p-6 max-w-5xl mx-auto">
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mb-4" />
            <p className="text-lg font-medium">Employee not found.</p>
            <Button variant="outline" className="mt-4" onClick={() => setLocation(portalPath("/people?tab=employees"))}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Employees
            </Button>
          </div>
        </div>
      </PortalLayout>
    );
  }

  const statusColor = statusColors[employee.status] || statusColors.active;

  return (
    <PortalLayout title="Employee Details">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation(portalPath("/people?tab=employees"))}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
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
              Request Termination
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
                <ContactRow icon={Mail} label="Email" value={employee.email} />
                <ContactRow icon={Phone} label="Phone" value={employee.phone} />
                <ContactRow icon={MapPin} label="Location" value={
                  [employee.city, employee.state, countryName(employee.country)].filter(Boolean).join(", ") || undefined
                } />
                <ContactRow icon={Globe} label="Nationality" value={countryName(employee.nationality)} />
                <ContactRow icon={Calendar} label="Date of Birth" value={
                  employee.dateOfBirth ? formatDate(employee.dateOfBirth) : undefined
                } />
              </div>
            </CardContent>
          </Card>

          {/* Right: Tabs */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="personal">
              <TabsList>
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="employment">Employment</TabsTrigger>
                <TabsTrigger value="documents">Documents ({employee.documents?.length || 0})</TabsTrigger>
                <TabsTrigger value="contracts">Contracts ({employee.contracts?.length || 0})</TabsTrigger>
                {(employee.status === "active" || employee.status === "on_leave") && (
                  <TabsTrigger value="leave">Leave</TabsTrigger>
                )}
              </TabsList>

              {/* Personal Information Tab */}
              <TabsContent value="personal" className="mt-4">
                <Card>
                  <CardContent className="pt-6">
                    <SectionTitle>Basic Information</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                      <InfoField icon={User} label="Full Name" value={`${employee.firstName} ${employee.lastName}`} hint="Employee's full legal name." />
                      <InfoField icon={Mail} label="Email" value={employee.email} hint="Primary email address for communication." />
                      <InfoField icon={Phone} label="Phone Number" value={employee.phone} hint="Primary contact phone number." />
                      <InfoField icon={Calendar} label="Date of Birth" value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : undefined} hint="Employee's date of birth." />
                      <InfoField icon={User} label="Gender" value={
                        employee.gender === "male" ? "Male" :
                        employee.gender === "female" ? "Female" :
                        employee.gender === "other" ? "Other" : undefined
                      } hint="Employee's gender." />
                      <InfoField icon={Globe} label="Nationality" value={countryName(employee.nationality)} hint="Employee's country of nationality." />
                    </div>

                    <SectionTitle className="mt-8">Identification</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                      <InfoField icon={CreditCard} label="ID Type" value={
                        employee.idType === "passport" ? "Passport" :
                        employee.idType === "national_id" ? "National ID" :
                        employee.idType === "drivers_license" ? "Driver's License" :
                        employee.idType
                      } hint="Type of identification document." />
                      <InfoField icon={Hash} label="ID Number" value={employee.idNumber} hint="Identification document number." />
                    </div>

                    <SectionTitle className="mt-8">Address</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                      <InfoField icon={Home} label="Street Address" value={employee.address} hint="Employee's residential street address." />
                      <InfoField icon={MapPin} label="City" value={employee.city} />
                      <InfoField icon={MapPin} label="State/Province" value={employee.state} />
                      <InfoField icon={Hash} label="Postal Code" value={employee.postalCode} />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Employment Tab */}
              <TabsContent value="employment" className="mt-4">
                <Card>
                  <CardContent className="pt-6">
                    <SectionTitle>Employment Details</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                      <InfoField icon={Briefcase} label="Service Type" value={
                        employee.serviceType === "eor" ? "Employer of Record (EOR)" :
                        employee.serviceType === "visa_eor" ? "Visa & EOR" :
                        employee.serviceType === "aor" ? "Agent of Record (AOR)" :
                        employee.serviceType
                      } hint="Type of service provided for the employee." />
                      <InfoField icon={Briefcase} label="Employment Type" value={
                        employee.employmentType === "long_term" ? "Long-term" :
                        employee.employmentType === "fixed_term" ? "Fixed-term" :
                        employee.employmentType
                      } hint="Type of employment contract." />
                      <InfoField icon={Calendar} label="Start Date" value={employee.startDate ? formatDate(employee.startDate) : undefined} hint="Date employment officially began." />
                      <InfoField icon={Calendar} label="End Date" value={employee.endDate ? formatDate(employee.endDate) : undefined} hint="Date employment officially ended (if applicable)." />
                      <InfoField icon={MapPin} label="Employment Country" value={countryName(employee.country)} hint="Country where the employee is employed." />
                      <InfoField icon={Briefcase} label="Department" value={employee.department} hint="Department the employee belongs to." />
                      <InfoField icon={Briefcase} label="Job Title" value={employee.jobTitle} hint="Employee's official job title." />
                      <InfoField icon={Hash} label="Employee Code" value={employee.employeeCode} hint="Unique identifier for the employee." />
                    </div>

                    <SectionTitle className="mt-8">Compensation</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                      <InfoField icon={CreditCard} label="Base Salary" value={
                        employee.baseSalary != null
                          ? `${Number(employee.baseSalary).toLocaleString()} ${employee.salaryCurrency || "USD"}/month`
                          : undefined
                      } hint="Employee's gross base salary." />
                      <InfoField icon={CreditCard} label="Salary Currency" value={employee.salaryCurrency} hint="Currency in which the salary is paid." />
                    </div>

                    {/* Bank Details Section */}
                    {(() => {
                      const bd = employee.bankDetails as Record<string, string> | null;
                      if (!bd || typeof bd !== "object" || Object.keys(bd).length === 0) return null;
                      return (
                        <>
                          <SectionTitle className="mt-8">Bank Details</SectionTitle>
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
                        <SectionTitle className="mt-8">Visa Information</SectionTitle>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
                          <InfoField icon={Shield} label="Visa Status" value={
                            employee.visaStatus
                              ? employee.visaStatus.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                              : "Pending"
                          } hint="Current status of the employee's visa." />
                          <InfoField icon={Calendar} label="Visa Expiry Date" value={employee.visaExpiryDate ? formatDate(employee.visaExpiryDate) : undefined} hint="Date the employee's visa expires." />
                          <InfoField icon={FileText} label="Visa Notes" value={employee.visaNotes} hint="Any additional notes regarding the employee's visa." />
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
                          <p className="text-sm font-semibold text-rose-800">Documents Incomplete</p>
                          <p className="text-xs text-rose-600 mt-1">
                            Some required documents are missing or need review. Please upload them to proceed.
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
                      <Upload className="w-4 h-4 mr-2" /> Upload Document
                    </Button>
                  </div>
                )}

                {(employee.documents?.length || 0) === 0 ? (
                  <Card>
                    <CardContent className="py-12">
                      <div className="flex flex-col items-center text-muted-foreground">
                        <FileText className="w-10 h-10 mb-3" />
                        <p className="font-medium">No documents uploaded yet.</p>
                        <p className="text-sm mt-1">
                          {canUploadDocuments
                            ? "Upload documents to complete your profile."
                            : "Uploaded documents will appear here."}
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
                                  <Download className="w-4 h-4 mr-1" /> View
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
                        <p className="font-medium">No contracts found.</p>
                        <p className="text-sm mt-1">Signed contracts will appear here.</p>
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
                                <p className="text-sm font-medium">{contract.contractType || "Employment Contract"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {contract.effectiveDate && `Effective: ${formatDate(contract.effectiveDate)}`}
                                  {contract.expiryDate && ` — Expires: ${formatDate(contract.expiryDate)}`}
                                  {!contract.effectiveDate && !contract.expiryDate && contract.uploadedAt && `Uploaded: ${formatDate(contract.uploadedAt)}`}
                                  {contract.notes && ` · ${contract.notes}`}
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
                        <p className="font-medium">No leave balances found.</p>
                        <p className="text-sm mt-1">Leave balances will appear here once configured.</p>
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
                                <span>Used: {balance.used}</span>
                                <span>Total: {balance.totalEntitlement}</span>
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
                              <p className="text-xs text-muted-foreground">Remaining</p>
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
              <DialogTitle>Upload Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={uploadDocType} onValueChange={setUploadDocType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="national_id">National ID</SelectItem>
                    <SelectItem value="resume">Resume</SelectItem>
                    <SelectItem value="work_permit">Work Permit</SelectItem>
                    <SelectItem value="visa">Visa</SelectItem>
                    <SelectItem value="education">Education Certificate</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Document Name</Label>
                <Input
                  value={uploadDocName}
                  onChange={(e) => setUploadDocName(e.target.value)}
                  placeholder="e.g., John Doe Passport"
                />
              </div>
              <div className="space-y-2">
                <Label>File</Label>
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
                  Uploading...
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        {/* Request Termination Dialog */}
        <Dialog open={terminateRequestOpen} onOpenChange={setTerminateRequestOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Request Termination</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Please provide the last day of employment and a reason for the termination request.
              </p>
              <div className="space-y-2">
                <Label>Last Day of Employment</Label>
                <DatePicker
                  value={terminateEndDate}
                  onChange={(d) => setTerminateEndDate(d || "")}
                />
              </div>
              <div className="space-y-2">
                <Label>Reason for Termination</Label>
                <Textarea
                  value={terminateReason}
                  onChange={(e) => setTerminateReason(e.target.value)}
                  placeholder="e.g., Resignation, End of contract, Performance issues"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTerminateRequestOpen(false)}>
                Cancel
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
                  ? "Submitting..."
                  : "Submit Request"}
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