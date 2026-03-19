/*
 * EG Admin — Country Configuration
 * All countries are pre-populated. Admin only configures service fees.
 * Country becomes active when any service fee is set.
 */
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Search, CalendarDays, Clock, Briefcase, Pencil, DollarSign, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import CurrencySelect from "@/components/CurrencySelect";

type FilterStatus = "all" | "active" | "inactive";

export default function CountriesContent() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [editOpen, setEditOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>(null);

  const { data: countries, isLoading, refetch } = trpc.countries.list.useQuery();
  const { data: leaveTypes, refetch: refetchLeaveTypes } = trpc.countries.leaveTypes.list.useQuery(
    { countryCode: selectedCountry! },
    { enabled: !!selectedCountry }
  );

  const updateMutation = trpc.countries.update.useMutation({
    onSuccess: () => {
      toast.success("Country configuration updated");
      setEditOpen(false);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleEdit = (country: any) => {
    setEditFormData({
      id: country.id,
      countryCode: country.countryCode,
      countryName: country.countryName,
      standardEorRate: country.standardEorRate || "",
      standardVisaEorRate: country.standardVisaEorRate || "",
      standardAorRate: country.standardAorRate || "",
      visaEorSetupFee: country.visaEorSetupFee || "",
      standardRateCurrency: country.standardRateCurrency || "USD",
      vatApplicable: country.vatApplicable ?? false,
      vatRate: country.vatRate || "",
      notes: country.notes || "",
    });
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editFormData) return;
    const { id, countryCode, countryName, ...data } = editFormData;
    // Convert empty strings to null for service fee fields
    const cleanedData: any = { ...data };
    for (const key of ["standardEorRate", "standardVisaEorRate", "standardAorRate", "visaEorSetupFee"]) {
      if (cleanedData[key] === "") cleanedData[key] = null;
    }
    // vatRate should default to "0" when empty, not null
    if (cleanedData.vatRate === "" || cleanedData.vatRate == null) {
      cleanedData.vatRate = "0";
    }
    updateMutation.mutate({ id, data: cleanedData });
  };

  // Computed stats
  const stats = useMemo(() => {
    if (!countries) return { total: 0, active: 0, inactive: 0 };
    const active = countries.filter((c: any) => c.isActive).length;
    return { total: countries.length, active, inactive: countries.length - active };
  }, [countries]);

  const filtered = useMemo(() => {
    return countries?.filter((c: any) => {
      const matchesSearch = !search ||
        c.countryName.toLowerCase().includes(search.toLowerCase()) ||
        c.countryCode.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "active" && c.isActive) ||
        (statusFilter === "inactive" && !c.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [countries, search, statusFilter]);

  const selectedCountryData = countries?.find((c: any) => c.countryCode === selectedCountry);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Countries</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure service fees to activate countries. Legal data is pre-populated.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 max-w-lg">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter("all")}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Countries</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter("active")}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
              <div className="text-xs text-muted-foreground">Active</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter("inactive")}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-muted-foreground">{stats.inactive}</div>
              <div className="text-xs text-muted-foreground">Inactive</div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search countries..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterStatus)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Country list */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Country</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Payroll Cycle</TableHead>
                      <TableHead>EOR Rate</TableHead>
                      <TableHead>Annual Leave</TableHead>
                      <TableHead>VAT</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16">Fees</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filtered && filtered.length > 0 ? (
                      filtered.map((c: any) => (
                        <TableRow
                          key={c.id}
                          className={`cursor-pointer hover:bg-muted/50 ${selectedCountry === c.countryCode ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                          onClick={() => setSelectedCountry(c.countryCode)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Globe className="w-4 h-4 text-primary" />
                              <div>
                                <div className="font-medium text-sm">{c.countryName}</div>
                                <div className="text-xs text-muted-foreground">{c.countryCode}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-mono">{c.localCurrency}</TableCell>
                          <TableCell className="text-sm capitalize">{c.payrollCycle?.replace("_", " ")}</TableCell>
                          <TableCell className="text-sm font-mono">
                            {c.standardEorRate ? `${c.standardRateCurrency || 'USD'} ${c.standardEorRate}` : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-sm">
                            {c.statutoryAnnualLeave ? `${c.statutoryAnnualLeave} days` : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {c.vatApplicable ? (
                              <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                                {c.vatRate ? `${c.vatRate}%` : "Yes"}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.isActive ? "default" : "secondary"} className="text-xs">
                              {c.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(c)} title="Configure service fees">
                                <DollarSign className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12">
                          <Globe className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">
                            {search || statusFilter !== "all" ? "No countries match your filters" : "No countries configured"}
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Country detail panel */}
          <div className="space-y-4">
            {selectedCountryData ? (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />
                      {selectedCountryData.countryName}
                      <Badge variant="outline" className="text-xs ml-auto">{selectedCountryData.countryCode}</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      {(selectedCountryData as any).isActive ? (
                        <Badge variant="default" className="text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs gap-1"><XCircle className="w-3 h-3" />This country is inactive</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="rates">
                      <TabsList className="w-full">
                        <TabsTrigger value="rates" className="flex-1">Service Fees</TabsTrigger>
                        <TabsTrigger value="rules" className="flex-1">Legal Info</TabsTrigger>
                        <TabsTrigger value="leave" className="flex-1">Leave Types</TabsTrigger>
                      </TabsList>

                      <TabsContent value="rates" className="mt-4 space-y-3">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Monthly Rates</div>
                        <DetailRow label="EOR Rate" value={(selectedCountryData as any).standardEorRate ? `${(selectedCountryData as any).standardRateCurrency || 'USD'} ${(selectedCountryData as any).standardEorRate}` : "Not configured"} />
                        <DetailRow label="Visa EOR Rate" value={(selectedCountryData as any).standardVisaEorRate ? `${(selectedCountryData as any).standardRateCurrency || 'USD'} ${(selectedCountryData as any).standardVisaEorRate}` : "Not configured"} />
                        <DetailRow label="AOR Rate" value={(selectedCountryData as any).standardAorRate ? `${(selectedCountryData as any).standardRateCurrency || 'USD'} ${(selectedCountryData as any).standardAorRate}` : "Not configured"} />
                        <div className="border-t pt-2 mt-2">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">One-time Fees</div>
                          <DetailRow label="Visa EOR Setup Fee" value={(selectedCountryData as any).visaEorSetupFee ? `${(selectedCountryData as any).standardRateCurrency || 'USD'} ${(selectedCountryData as any).visaEorSetupFee}` : "Not configured"} />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-3"
                          onClick={() => handleEdit(selectedCountryData)}
                        >
                          <Pencil className="w-3 h-3 mr-2" />Configure Service Fees
                        </Button>
                      </TabsContent>

                      <TabsContent value="rules" className="mt-4 space-y-3">
                        <DetailRow icon={<Clock className="w-3.5 h-3.5" />} label="Currency" value={selectedCountryData.localCurrency} />
                        <DetailRow icon={<CalendarDays className="w-3.5 h-3.5" />} label="Payroll Cycle" value={(selectedCountryData.payrollCycle || "monthly").replace("_", " ")} />
                        <DetailRow icon={<Clock className="w-3.5 h-3.5" />} label="Probation Period" value={`${selectedCountryData.probationPeriodDays || 90} days`} />
                        <DetailRow icon={<Clock className="w-3.5 h-3.5" />} label="Notice Period" value={`${selectedCountryData.noticePeriodDays || 30} days`} />
                        <DetailRow icon={<Briefcase className="w-3.5 h-3.5" />} label="Working Days/Week" value={`${selectedCountryData.workingDaysPerWeek || 5} days`} />
                        <DetailRow icon={<CalendarDays className="w-3.5 h-3.5" />} label="Statutory Leave" value={`${(selectedCountryData as any).statutoryAnnualLeave || 14} days/year`} />
                        {selectedCountryData.notes && (
                          <div className="pt-2 border-t">
                            <div className="text-xs text-muted-foreground mb-1">Notes</div>
                            <p className="text-sm">{selectedCountryData.notes}</p>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="leave" className="mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium">Leave Types</span>
                          <span className="text-xs text-muted-foreground">{leaveTypes?.length || 0} types</span>
                        </div>
                        {leaveTypes && leaveTypes.length > 0 ? (
                          <div className="space-y-2">
                            {leaveTypes.map((lt: any) => (
                              <div key={lt.id} className="flex items-center justify-between py-2 px-3 rounded-md border bg-muted/30">
                                <div>
                                  <div className="text-sm font-medium">{lt.leaveTypeName}</div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <span>{lt.isPaid ? "Paid" : "Unpaid"}</span>
                                    {lt.requiresApproval && <span>· Approval required</span>}
                                    {lt.applicableGender && lt.applicableGender !== "all" && (
                                      <span>· {lt.applicableGender === "female" ? "Female only" : "Male only"}</span>
                                    )}
                                  </div>
                                </div>
                                <span className="text-sm font-mono">{lt.annualEntitlement || 0} days/yr</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No leave types configured for this country
                          </p>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Globe className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Select a country to view details</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

      {/* Edit Service Fees Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditFormData(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Configure Service Fees — {editFormData?.countryName}
            </DialogTitle>
          </DialogHeader>
          {editFormData && (
            <div className="space-y-6 mt-2">
              <p className="text-sm text-muted-foreground">
                Set service fees to activate this country. Countries with at least one configured rate are automatically marked as active.
              </p>

              {/* Rate Currency */}
              <div className="space-y-2">
                <Label>Rate Currency</Label>
                <CurrencySelect
                  value={editFormData.standardRateCurrency}
                  onValueChange={(v) => setEditFormData({ ...editFormData, standardRateCurrency: v })}
                />
              </div>

              {/* Monthly Rates */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Monthly Rates</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>EOR Rate</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editFormData.standardEorRate}
                      onChange={(e) => setEditFormData({ ...editFormData, standardEorRate: e.target.value })}
                      placeholder="499.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Visa EOR Rate</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editFormData.standardVisaEorRate}
                      onChange={(e) => setEditFormData({ ...editFormData, standardVisaEorRate: e.target.value })}
                      placeholder="699.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>AOR Rate</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editFormData.standardAorRate}
                      onChange={(e) => setEditFormData({ ...editFormData, standardAorRate: e.target.value })}
                      placeholder="349.00"
                    />
                  </div>
                </div>
              </div>

              {/* One-time Fees */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">One-time Fees</h3>
                <div className="space-y-2">
                  <Label>Visa EOR Setup Fee</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editFormData.visaEorSetupFee}
                    onChange={(e) => setEditFormData({ ...editFormData, visaEorSetupFee: e.target.value })}
                    placeholder="1500.00"
                  />
                  <p className="text-xs text-muted-foreground">Setup fee for visa EOR service</p>
                </div>
              </div>

              {/* VAT Configuration */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">VAT Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>VAT Applicable</Label>
                    <div className="flex items-center gap-3 h-9">
                      <Switch
                        checked={editFormData.vatApplicable || false}
                        onCheckedChange={(checked) => setEditFormData({ ...editFormData, vatApplicable: checked, vatRate: checked ? editFormData.vatRate : "" })}
                      />
                      <span className="text-sm text-muted-foreground">
                        {editFormData.vatApplicable ? "VAT is charged on employment costs" : "No VAT"}
                      </span>
                    </div>
                  </div>
                  {editFormData.vatApplicable && (
                    <div className="space-y-2">
                      <Label>VAT Rate</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g. 7.5"
                        value={editFormData.vatRate}
                        onChange={(e) => setEditFormData({ ...editFormData, vatRate: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">Applied to total employment cost for this country</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>

              {/* Status indicator */}
              <div className="p-3 rounded-md bg-muted/50 border">
                <div className="flex items-center gap-2 text-sm">
                  {(editFormData.standardEorRate || editFormData.standardVisaEorRate || editFormData.standardAorRate) ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span>This country will be <strong>active</strong> after saving</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-muted-foreground" />
                      <span>Set at least one service rate to activate this country</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Service Fees"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-xs text-muted-foreground w-28 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}