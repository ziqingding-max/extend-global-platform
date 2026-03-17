/**
 * CP Portal Pricing Management
 * 
 * Configure CP→Client pricing rules for each end client.
 */
import { useState } from "react";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CpPortalPricing() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: rules, isLoading, refetch } = cpTrpc.pricing.list.useQuery({});
  const { data: clients } = cpTrpc.clients.list.useQuery({ page: 1, pageSize: 200 });

  const createMutation = cpTrpc.pricing.create.useMutation({
    onSuccess: () => {
      toast.success("Pricing rule created");
      setShowCreate(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = cpTrpc.pricing.delete.useMutation({
    onSuccess: () => {
      toast.success("Pricing rule deleted");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Form state
  const [form, setForm] = useState({
    customerId: "",
    serviceType: "eor" as string,
    pricingType: "fixed_per_employee" as string,
    fixedAmount: "",
    percentageRate: "",
    currency: "USD",
    countryCode: "",
  });

  const handleCreate = () => {
    createMutation.mutate({
      customerId: Number(form.customerId),
      serviceType: form.serviceType,
      pricingType: form.pricingType,
      fixedAmount: form.fixedAmount ? form.fixedAmount : undefined,
      percentageRate: form.percentageRate ? form.percentageRate : undefined,
      currency: form.currency,
      countryCode: form.countryCode || undefined,
    } as any);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pricing</h1>
          <p className="text-muted-foreground">Configure pricing rules for your clients</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Pricing Rule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.items?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Service Type</Label>
                  <Select value={form.serviceType} onValueChange={(v) => setForm({ ...form, serviceType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eor">EOR</SelectItem>
                      <SelectItem value="peo">PEO</SelectItem>
                      <SelectItem value="payroll">Payroll</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pricing Type</Label>
                  <Select value={form.pricingType} onValueChange={(v) => setForm({ ...form, pricingType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_per_employee">Fixed per Employee</SelectItem>
                      <SelectItem value="percentage_of_salary">% of Salary</SelectItem>
                      <SelectItem value="tiered">Tiered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.pricingType === "fixed_per_employee" && (
                <div className="space-y-2">
                  <Label>Fixed Amount ({form.currency})</Label>
                  <Input
                    type="number"
                    value={form.fixedAmount}
                    onChange={(e) => setForm({ ...form, fixedAmount: e.target.value })}
                    placeholder="e.g. 500"
                  />
                </div>
              )}
              {form.pricingType === "percentage_of_salary" && (
                <div className="space-y-2">
                  <Label>Percentage Rate (%)</Label>
                  <Input
                    type="number"
                    value={form.percentageRate}
                    onChange={(e) => setForm({ ...form, percentageRate: e.target.value })}
                    placeholder="e.g. 15"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Country (optional)</Label>
                <Input
                  value={form.countryCode}
                  onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                  placeholder="e.g. SG, HK"
                />
              </div>
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending ? "Creating..." : "Create Rule"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rules Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Pricing Rules</CardTitle>
            <CardDescription>
              {rules?.length ?? 0} rule{(rules?.length ?? 0) !== 1 ? "s" : ""} configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules?.map((rule: any) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.customerName ?? "All Clients"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{rule.serviceType}</Badge>
                    </TableCell>
                    <TableCell>{rule.pricingType?.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      {rule.fixedAmount
                        ? `${rule.currency} ${rule.fixedAmount}`
                        : rule.percentageRate
                        ? `${rule.percentageRate}%`
                        : "—"}
                    </TableCell>
                    <TableCell>{rule.countryCode || "Global"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Delete this pricing rule?")) {
                            deleteMutation.mutate({ id: rule.id });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!rules || rules.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No pricing rules configured yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
