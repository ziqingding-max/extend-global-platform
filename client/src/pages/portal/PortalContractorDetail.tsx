/**
 * Portal Contractor Detail Page
 *
 * Read-only view of contractor profile, service details, and financial configuration.
 * All data scoped to the logged-in customer.
 * Pending_review contractors can be deleted by the portal user.
 */

import { useState } from "react";
import { useParams, useLocation } from "wouter";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  User,
  Briefcase,
  MapPin,
  DollarSign,
  Calendar,
  Mail,
  Phone,
  Globe,
  FileText,
  Building2,
  Hash,
  Coins,
  StickyNote,
  CreditCard,
  Trash2,
} from "lucide-react";
import { formatStatusLabel, formatDate, countryName } from "@/lib/format";
import { portalPath } from "@/lib/portalBasePath";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/DatePicker";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  pending_review: "bg-yellow-100 text-yellow-800 border-yellow-200",
  terminated: "bg-red-100 text-red-800 border-red-200",
};

function InfoItem({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: any }) {
  return (
    <div className="flex items-start gap-3 py-3 px-1">
      {Icon && (
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium mt-0.5">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function PortalContractorDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const contractorId = Number(params.id);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [terminateRequestOpen, setTerminateRequestOpen] = useState(false);
  const [terminateEndDate, setTerminateEndDate] = useState("");
  const [terminateReason, setTerminateReason] = useState("");

  const { data: contractor, isLoading } = portalTrpc.contractors.getById.useQuery(
    { id: contractorId },
    { enabled: !!contractorId }
  );

  const requestTerminationMutation = portalTrpc.contractors.requestTermination.useMutation({
    onSuccess: () => {
      toast.success("Termination request submitted successfully");
      setTerminateRequestOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = portalTrpc.contractors.delete.useMutation({
    onSuccess: () => {
      toast.success("Contractor deleted successfully");
      setLocation(portalPath("/people?tab=contractors"));
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <PortalLayout title="Contractor Detail">
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-80 lg:col-span-1" />
            <Skeleton className="h-80 lg:col-span-2" />
          </div>
        </div>
      </PortalLayout>
    );
  }

  if (!contractor) {
    return (
      <PortalLayout title="Contractor Detail">
        <div className="p-6 flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FileText className="w-10 h-10 mb-3" />
          <p className="text-lg font-medium">Contractor not found</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation(portalPath("/people?tab=contractors"))}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to People
          </Button>
        </div>
      </PortalLayout>
    );
  }

  const paymentLabel = contractor.paymentFrequency
    ? contractor.paymentFrequency.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
    : null;

  const amountDisplay = contractor.rateAmount
    ? `${contractor.currency || "USD"} ${Number(contractor.rateAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    : null;

  const isPendingReview = contractor.status === "pending_review";

  return (
    <PortalLayout title={`${contractor.firstName} ${contractor.lastName}`}>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(portalPath("/people?tab=contractors"))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {contractor.firstName} {contractor.lastName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {contractor.contractorCode} {contractor.jobTitle ? `· ${contractor.jobTitle}` : ""}
                </p>
              </div>
              <Badge variant="outline" className={`ml-1 ${statusColors[contractor.status] || ""}`}>
                {formatStatusLabel(contractor.status)}
              </Badge>
            </div>
          </div>
          {/* Delete button for pending_review contractors */}
          {contractor.status === "active" && (
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
          {isPendingReview && (
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete Contractor Request?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {`Are you sure you want to delete the contractor request for ${contractor.firstName} ${contractor.lastName}? This action cannot be undone.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteMutation.mutate({ id: contractorId })}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending
                      ? "Deleting..."
                      : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Summary Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Country</p>
              <p className="text-sm font-semibold mt-1">{countryName(contractor.country) || "—"}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment Frequency</p>
              <p className="text-sm font-semibold mt-1">{paymentLabel || "—"}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Start Date</p>
              <p className="text-sm font-semibold mt-1">{contractor.startDate ? formatDate(contractor.startDate) : "—"}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</p>
              <p className="text-sm font-semibold mt-1">{amountDisplay || "—"}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Personal Information */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-primary" /> Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 pt-0">
              <InfoItem label="Email" value={contractor.email} icon={Mail} />
              <Separator />
              <InfoItem label="Phone" value={contractor.phone} icon={Phone} />
              <Separator />
              <InfoItem label="Date Of Birth" value={contractor.dateOfBirth ? formatDate(contractor.dateOfBirth) : null} icon={Calendar} />
              <Separator />
              <InfoItem label="Nationality" value={contractor.nationality} icon={Globe} />
              <Separator />
              <InfoItem label="Address" value={[contractor.address, contractor.city, contractor.state, contractor.postalCode].filter(Boolean).join(", ") || null} icon={MapPin} />
            </CardContent>
          </Card>

          {/* Right Column: Service & Financial */}
          <div className="lg:col-span-2 space-y-6">
            {/* Service Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-primary" /> Service Details
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  <InfoItem label="Job Title" value={contractor.jobTitle} icon={Briefcase} />
                  <InfoItem label="Department" value={contractor.department} icon={Building2} />
                  <InfoItem label="Start Date" value={contractor.startDate ? formatDate(contractor.startDate) : null} icon={Calendar} />
                  <InfoItem label="End Date" value={contractor.endDate ? formatDate(contractor.endDate) : null} icon={Calendar} />
                </div>
              </CardContent>
            </Card>

            {/* Financial Configuration */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" /> Financial Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  <InfoItem label="Payment Frequency" value={paymentLabel} icon={DollarSign} />
                  <InfoItem label="Amount" value={amountDisplay} icon={DollarSign} />
                  <InfoItem label="Currency" value={contractor.currency} icon={Coins} />
                  <InfoItem label="Country" value={countryName(contractor.country)} icon={Globe} />
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            {contractor.notes && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <StickyNote className="w-4 h-4 text-primary" /> Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground leading-relaxed">{contractor.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        {/* Request Termination Dialog */}
        <Dialog open={terminateRequestOpen} onOpenChange={setTerminateRequestOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Request Termination</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Please provide the termination end date and reason.
              </p>
              <div className="space-y-2">
                <Label>End Date</Label>
                <DatePicker
                  value={terminateEndDate}
                  onChange={(d) => setTerminateEndDate(d || "")}
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={terminateReason}
                  onChange={(e) => setTerminateReason(e.target.value)}
                  placeholder="Enter reason for termination"
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
                    contractorId,
                    endDate: terminateEndDate,
                    reason: terminateReason || undefined,
                  });
                }}
              >
                {requestTerminationMutation.isPending
                  ? "Submitting..."
                  : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}