import { useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CheckCircle, XCircle, AlertCircle, Building2, Wallet, Landmark, Eye, Clock, CheckCircle2, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { formatCurrencyAmount } from "@/components/CurrencyAmount";
import { formatDate } from "@/lib/format";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function ReleaseTasks() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [disposition, setDisposition] = useState<"to_wallet" | "to_bank">("to_wallet");
  
  const utils = trpc.useUtils();

  const [tab, setTab] = useState<"pending" | "history">("pending");

  // Fetch pending credit notes and deposit refunds for approval
  // Pending includes 'draft' (auto-generated deposit refund) and 'sent' (manually created credit note)
  const pendingStatuses = tab === "pending" ? undefined : undefined; // We filter client side or fetch all?
  // Better to fetch specific statuses based on tab to avoid over-fetching
  
  const { data: creditNoteData, isLoading: isLoadingCN } = trpc.invoices.list.useQuery({
    invoiceType: "credit_note",
    limit: 100,
  });
  const { data: depositRefundData, isLoading: isLoadingDR } = trpc.invoices.list.useQuery({
    invoiceType: "deposit_refund",
    limit: 100,
  });

  const isLoading = isLoadingCN || isLoadingDR;
  
  const allTasks = useMemo(() => {
    const combined = [
      ...((creditNoteData as any)?.data || []),
      ...((depositRefundData as any)?.data || []),
    ];
    
    // Filter by tab
    const pending = ["draft", "sent", "pending_approval"];
    const history = ["paid", "applied", "cancelled"];
    
    return combined.filter(t => 
      tab === "pending" ? pending.includes(t.status) : history.includes(t.status)
    ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [creditNoteData, depositRefundData, tab]);

  const approveMut = trpc.invoices.approveCreditNote.useMutation({
    onSuccess: () => {
      toast.success("Deposit release approved");
      utils.invoices.list.invalidate();
      setShowApproveDialog(false);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Layout breadcrumb={["EG", "Release Tasks"]}>
      <div className="p-6 space-y-6 page-enter">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Release Tasks</h1>
            <p className="text-sm text-muted-foreground mt-1">Approve deposit releases and credit note dispositions</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="w-4 h-4" /> Pending Approval
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <CheckCircle2 className="w-4 h-4" /> History
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">
                  {tab === "pending" ? "Pending Approvals" : "Processed Tasks"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="pl-6">Invoice #</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Date Created</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : allTasks.length > 0 ? (
                      allTasks.map((cn: any) => (
                        <TableRow key={cn.id}>
                          <TableCell className="pl-6 font-medium font-mono">{cn.invoiceNumber}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn.invoiceType === 'deposit_refund' ? 'text-amber-700 border-amber-200 bg-amber-50' : 'text-purple-700 border-purple-200 bg-purple-50'}>
                              {cn.invoiceType === 'deposit_refund' ? 'Deposit Refund' : 'Credit Note'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-medium">{cn.customerName}</TableCell>
                          <TableCell className="font-mono text-emerald-600 font-medium">
                            {formatCurrencyAmount(Math.abs(parseFloat(cn.total)), cn.currency)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground" title={cn.notes}>
                            {cn.notes || "Deposit Release"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(cn.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant="secondary" className="text-xs font-normal">
                                {cn.status}
                              </Badge>
                              {cn.status === 'paid' && cn.creditNoteDisposition === 'to_wallet' && (
                                <Badge className="text-xs font-normal bg-blue-100 text-blue-800 border-blue-200 gap-1">
                                  <Wallet className="w-3 h-3" /> To Wallet
                                </Badge>
                              )}
                              {cn.status === 'paid' && cn.creditNoteDisposition === 'to_bank' && (
                                <Badge className="text-xs font-normal bg-amber-100 text-amber-800 border-amber-200 gap-1">
                                  <Landmark className="w-3 h-3" /> To Bank
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <div className="flex justify-end gap-2">
                              {tab === "pending" && (
                                <Button size="sm" onClick={() => {
                                  setSelectedTask(cn);
                                  setDisposition("to_wallet");
                                  setShowApproveDialog(true);
                                }}>
                                  Review
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setLocation(`/invoices/${cn.id}`)} title="View Details">
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                          <p>No {tab} release tasks found</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Approval Dialog */}
        <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Deposit Release</DialogTitle>
              <DialogDescription>
                Decide how to process this credit note for <b>{selectedTask?.customerName}</b>.
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4 space-y-4">
              <div className="bg-slate-50 p-3 rounded-md border text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credit Note:</span>
                  <span className="font-medium">{selectedTask?.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-bold text-emerald-600">
                    {selectedTask && formatCurrencyAmount(Math.abs(parseFloat(selectedTask.total)), selectedTask.currency)}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Disposition Method</Label>
                <RadioGroup value={disposition} onValueChange={(v: any) => setDisposition(v)}>
                  <div className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${disposition === 'to_wallet' ? 'border-primary bg-primary/5' : 'hover:bg-slate-50'}`}>
                    <RadioGroupItem value="to_wallet" id="r1" />
                    <Label htmlFor="r1" className="flex-1 cursor-pointer flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-primary" />
                      <div>
                        <div className="font-medium">Credit to Main Wallet</div>
                        <div className="text-xs text-muted-foreground">Funds become available balance for future invoices.</div>
                      </div>
                    </Label>
                  </div>
                  
                  <div className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${disposition === 'to_bank' ? 'border-primary bg-primary/5' : 'hover:bg-slate-50'}`}>
                    <RadioGroupItem value="to_bank" id="r2" />
                    <Label htmlFor="r2" className="flex-1 cursor-pointer flex items-center gap-2">
                      <Landmark className="w-4 h-4 text-primary" />
                      <div>
                        <div className="font-medium">Refund to Bank</div>
                        <div className="text-xs text-muted-foreground">Mark as refunded externally. No wallet credit.</div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              
              {disposition === 'to_bank' && (
                <div className="flex items-start gap-2 text-amber-600 bg-amber-50 p-2 rounded text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <span>Note: This action only records the refund in the system. You must manually process the bank transfer.</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApproveDialog(false)}>Cancel</Button>
              <Button onClick={() => approveMut.mutate({ 
                creditNoteId: selectedTask.id,
                disposition 
              })} disabled={approveMut.isPending}>
                {approveMut.isPending ? "Processing..." : "Confirm & Process"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
