import { useState } from "react";
import { workerTrpc } from "@/lib/workerTrpc";
import WorkerLayout from "./WorkerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Flag, ChevronRight, Upload, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "submitted", label: "Submitted" },
  { value: "client_approved", label: "Client Approved" },
  { value: "client_rejected", label: "Client Rejected" },
  { value: "admin_approved", label: "Admin Approved" },
  { value: "locked", label: "Locked" },
];

const statusStyles: Record<string, string> = {
  pending: "bg-orange-100 text-orange-700",
  submitted: "bg-yellow-100 text-yellow-700",
  client_approved: "bg-blue-100 text-blue-700",
  client_rejected: "bg-red-100 text-red-700",
  admin_approved: "bg-green-100 text-green-700",
  admin_rejected: "bg-red-100 text-red-700",
  locked: "bg-green-100 text-green-700",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  submitted: "Submitted",
  client_approved: "Client Approved",
  client_rejected: "Rejected",
  admin_approved: "Approved",
  admin_rejected: "Rejected",
  locked: "Locked",
};

export default function WorkerMilestones() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitMilestoneId, setSubmitMilestoneId] = useState<number | null>(null);
  const [submissionNote, setSubmissionNote] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");

  const utils = workerTrpc.useUtils();

  const { data, isLoading } = workerTrpc.milestones.list.useQuery({
    page,
    pageSize: 20,
    status: statusFilter === "all" ? undefined : statusFilter as any,
  });

  const { data: milestoneDetail } = workerTrpc.milestones.getById.useQuery(
    { id: selectedMilestoneId! },
    { enabled: !!selectedMilestoneId }
  );

  const submitMutation = workerTrpc.milestones.submit.useMutation({
    onSuccess: () => {
      toast.success("Milestone submitted successfully");
      setSubmitDialogOpen(false);
      setSubmitMilestoneId(null);
      setSubmissionNote("");
      setFileUrl("");
      setFileName("");
      utils.milestones.list.invalidate();
      utils.milestones.getById.invalidate();
      utils.dashboard.getSummary.invalidate();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to submit milestone");
    },
  });

  const handleSubmit = () => {
    if (!submitMilestoneId || !fileUrl || !fileName) {
      toast.error("Please provide a deliverable file URL and name");
      return;
    }
    submitMutation.mutate({
      id: submitMilestoneId,
      deliverableFileUrl: fileUrl,
      deliverableFileKey: fileUrl,
      deliverableFileName: fileName,
      submissionNote: submissionNote || undefined,
    });
  };

  const openSubmitDialog = (milestoneId: number) => {
    setSubmitMilestoneId(milestoneId);
    setSubmitDialogOpen(true);
    setSelectedMilestoneId(null);
  };

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <WorkerLayout>
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Milestones</h1>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : data?.items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Flag className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No milestones found.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {data?.items.map((ms) => (
                <Card key={ms.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedMilestoneId(ms.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{ms.title}</p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusStyles[ms.status] || "bg-gray-100 text-gray-700"}`}>
                            {statusLabels[ms.status] || ms.status}
                          </span>
                        </div>
                        {ms.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{ms.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {ms.dueDate && <span>Due: {ms.dueDate}</span>}
                          {ms.effectiveMonth && <span>Period: {ms.effectiveMonth}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="font-bold">
                          {parseFloat(ms.amount || "0").toLocaleString("en-US", { style: "currency", currency: ms.currency || "USD" })}
                        </p>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                    {["pending", "client_rejected"].includes(ms.status) && (
                      <div className="mt-3 pt-3 border-t">
                        <Button
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={(e) => { e.stopPropagation(); openSubmitDialog(ms.id); }}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {ms.status === "client_rejected" ? "Resubmit Deliverable" : "Submit Deliverable"}
                        </Button>
                      </div>
                    )}
                    {ms.status === "client_rejected" && ms.clientRejectionReason && (
                      <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                        <strong>Rejection reason:</strong> {ms.clientRejectionReason}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Milestone Detail Dialog */}
        <Dialog open={!!selectedMilestoneId} onOpenChange={(open) => !open && setSelectedMilestoneId(null)}>
          <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Milestone Detail</DialogTitle>
            </DialogHeader>
            {milestoneDetail && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">{milestoneDetail.title}</h3>
                  {milestoneDetail.description && (
                    <p className="text-sm text-muted-foreground mt-1">{milestoneDetail.description}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Amount</p>
                    <p className="font-bold">
                      {parseFloat(milestoneDetail.amount || "0").toLocaleString("en-US", { style: "currency", currency: milestoneDetail.currency || "USD" })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[milestoneDetail.status] || "bg-gray-100 text-gray-700"}`}>
                      {statusLabels[milestoneDetail.status] || milestoneDetail.status}
                    </span>
                  </div>
                  {milestoneDetail.dueDate && (
                    <div>
                      <p className="text-sm text-muted-foreground">Due Date</p>
                      <p className="font-medium">{milestoneDetail.dueDate}</p>
                    </div>
                  )}
                  {milestoneDetail.completedAt && (
                    <div>
                      <p className="text-sm text-muted-foreground">Completed</p>
                      <p className="font-medium">{new Date(milestoneDetail.completedAt).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
                {milestoneDetail.deliverableFileUrl && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Deliverable</p>
                    <a href={milestoneDetail.deliverableFileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <ExternalLink className="w-4 h-4" />
                      {milestoneDetail.deliverableFileName || "View File"}
                    </a>
                    {milestoneDetail.submissionNote && (
                      <p className="text-sm mt-2">{milestoneDetail.submissionNote}</p>
                    )}
                  </div>
                )}
                {milestoneDetail.clientRejectionReason && (
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-sm font-medium text-red-700">Client Rejection Reason</p>
                    <p className="text-sm text-red-600 mt-1">{milestoneDetail.clientRejectionReason}</p>
                  </div>
                )}
                {milestoneDetail.adminRejectionReason && (
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-sm font-medium text-red-700">Admin Rejection Reason</p>
                    <p className="text-sm text-red-600 mt-1">{milestoneDetail.adminRejectionReason}</p>
                  </div>
                )}
                {["pending", "client_rejected"].includes(milestoneDetail.status) && (
                  <DialogFooter>
                    <Button className="w-full" onClick={() => openSubmitDialog(milestoneDetail.id)}>
                      <Upload className="w-4 h-4 mr-2" />
                      {milestoneDetail.status === "client_rejected" ? "Resubmit Deliverable" : "Submit Deliverable"}
                    </Button>
                  </DialogFooter>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Submit Deliverable Dialog */}
        <Dialog open={submitDialogOpen} onOpenChange={(open) => { if (!open) { setSubmitDialogOpen(false); setSubmitMilestoneId(null); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Submit Deliverable</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>File URL *</Label>
                <Input
                  placeholder="https://storage.example.com/file.pdf"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Upload your file to the file storage first, then paste the URL here.
                </p>
              </div>
              <div className="space-y-2">
                <Label>File Name *</Label>
                <Input
                  placeholder="deliverable-v1.pdf"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Note (optional)</Label>
                <Textarea
                  placeholder="Add any notes about this submission..."
                  value={submissionNote}
                  onChange={(e) => setSubmissionNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitMutation.isPending || !fileUrl || !fileName}>
                {submitMutation.isPending ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </WorkerLayout>
  );
}
