import { useI18n } from "@/lib/i18n";
import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/DatePicker";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, Calculator, Info, ArrowLeft } from "lucide-react";
import CountrySelect from "@/components/CountrySelect";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";

interface QuotationItem {
  countryCode: string;
  regionCode?: string;
  serviceType: "eor" | "visa_eor" | "aor";
  headcount: number;
  salary: number;
  currency: string; // Local Currency
  exchangeRate?: number; // USD -> Local (with markup)
  serviceFee: number; // USD
  oneTimeFee?: number; // USD
  // Computed fields
  employerCost?: number; // Local Currency
  totalMonthly?: number; // USD
  totalOneTime?: number; // USD
}

export default function QuotationCreatePage({ params }: { params?: { id?: string } }) {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const editId = params?.id ? parseInt(params.id) : undefined;
  const isEditMode = !!editId;

  const [leadId, setLeadId] = useState<number | undefined>();
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [validUntil, setValidUntil] = useState<string>("");
  const [items, setItems] = useState<QuotationItem[]>([
    { countryCode: "", serviceType: "eor", headcount: 1, salary: 0, currency: "USD", serviceFee: 0, exchangeRate: 1 }
  ]);
  const [showCostPreview, setShowCostPreview] = useState(false);
  const [includeCountryGuide, setIncludeCountryGuide] = useState(false);

  const { data: leads } = trpc.sales.list.useQuery({ limit: 100 });
  const { data: customers } = trpc.customers.list.useQuery({ limit: 100 });
  const { data: existingQuotation, isLoading: isLoadingQuotation } = trpc.quotations.get.useQuery(
     editId || 0,
     { enabled: isEditMode }
  );

  useEffect(() => {
    if (isEditMode && existingQuotation) {
       setLeadId(existingQuotation.leadId || undefined);
       setCustomerId(existingQuotation.customerId || undefined);
       setValidUntil(existingQuotation.validUntil ? new Date(existingQuotation.validUntil).toISOString().split("T")[0] : "");
       
       const parsedItems = typeof existingQuotation.countries === 'string' 
           ? JSON.parse(existingQuotation.countries) 
           : existingQuotation.countries;
       
       if (Array.isArray(parsedItems)) {
           setItems(parsedItems.map((i: any) => ({
               countryCode: i.countryCode,
               regionCode: i.regionCode,
               serviceType: i.serviceType,
               headcount: i.headcount,
               salary: i.salary,
               currency: i.currency,
               exchangeRate: i.exchangeRate || 1,
               serviceFee: i.serviceFee,
               oneTimeFee: i.oneTimeFee,
               employerCost: i.employerCost,
               totalMonthly: i.totalMonthly,
               totalOneTime: i.totalOneTime
           })));
           setShowCostPreview(true);
       }
    }
  }, [isEditMode, existingQuotation]);

  const calculateMutation = trpc.calculation.calculateContributions.useMutation();
  const { data: guideChapters } = trpc.countryGuides.listChapters.useQuery(
    { countryCode: items[0].countryCode || "CN" },
    { enabled: !!items[0].countryCode && items.length === 1 }
  );

  const utils = trpc.useUtils();

  const createMutation = trpc.quotations.create.useMutation({
    onSuccess: () => {
      toast.success(t("common.create") + " ✓");
      setLocation("/quotations");
    },
    onError: (err) => toast.error(err.message)
  });

  const updateMutation = trpc.quotations.update.useMutation({
    onSuccess: () => {
      toast.success(t("common.updated") || "Updated ✓");
      setLocation("/quotations");
    },
    onError: (err) => toast.error(err.message)
  });

  const handleAddItem = () => {
    setItems([...items, { countryCode: "", serviceType: "eor", headcount: 1, salary: 0, currency: "USD", serviceFee: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof QuotationItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    // Reset computed fields when inputs change
    if (["countryCode", "salary", "headcount", "serviceFee"].includes(field)) {
        newItems[index].employerCost = undefined;
        newItems[index].totalMonthly = undefined;
    }
    setItems(newItems);
  };

  const handleCountryChange = async (index: number, countryCode: string) => {
    // 1. Update country code
    const newItems = [...items];
    // Default region for China to Shanghai to avoid 0 cost calculation if user forgets
    const defaultRegion = countryCode === "CN" ? "CN-SH" : undefined;
    newItems[index] = { ...newItems[index], countryCode, regionCode: defaultRegion, employerCost: undefined, totalMonthly: undefined, exchangeRate: 1 };
    setItems(newItems);

    // 2. Fetch config
    if (countryCode) {
        try {
            const config = await utils.countries.get.fetch({ countryCode });
            if (config) {
                // Fetch exchange rate
                const localCurrency = config.localCurrency || "USD";
                let exchangeRate = 1;
                if (localCurrency !== "USD") {
                   const rateData = await utils.exchangeRates.get.fetch({ from: "USD", to: localCurrency });
                   if (rateData && rateData.rateWithMarkup) {
                       exchangeRate = Number(rateData.rateWithMarkup);
                   }
                }

                setItems(currentItems => {
                    const updated = [...currentItems];
                    const st = updated[index].serviceType;
                    updated[index] = { 
                        ...updated[index], 
                        currency: localCurrency,
                        exchangeRate: exchangeRate,
                        serviceFee: st === "aor"
                            ? parseFloat((config as any).standardAorRate || "0")
                            : st === "visa_eor" 
                                ? parseFloat(config.standardVisaEorRate || "0") 
                                : parseFloat(config.standardEorRate || "0"),
                        oneTimeFee: st === "visa_eor"
                            ? parseFloat(config.visaEorSetupFee || "0")
                            : undefined
                    };
                    return updated;
                });
            }
        } catch (err) {
            console.error("Failed to fetch country config", err);
        }
    }
  };

  const handleServiceTypeChange = async (index: number, serviceType: "eor" | "visa_eor" | "aor") => {
      // 1. Update service type
      const newItems = [...items];
      newItems[index] = { ...newItems[index], serviceType, employerCost: undefined, totalMonthly: undefined };
      setItems(newItems);
      
      // 2. Update fees based on service type
      const countryCode = items[index].countryCode;
      if (countryCode) {
          try {
              const config = await utils.countries.get.fetch({ countryCode });
              if (config) {
                  setItems(currentItems => {
                      const updated = [...currentItems];
                      if (serviceType === "aor") {
                          // AOR: use standardAorRate, no one-time fee, no employer cost
                          updated[index] = {
                              ...updated[index],
                              serviceFee: parseFloat((config as any).standardAorRate || "0"),
                              oneTimeFee: undefined,
                              employerCost: undefined,
                          };
                      } else {
                          updated[index] = {
                              ...updated[index],
                              serviceFee: serviceType === "visa_eor" 
                                  ? parseFloat(config.standardVisaEorRate || "0") 
                                  : parseFloat(config.standardEorRate || "0"),
                              oneTimeFee: serviceType === "visa_eor"
                                  ? parseFloat(config.visaEorSetupFee || "0")
                                  : undefined
                          };
                      }
                      return updated;
                  });
              }
          } catch (err) {
              console.error("Failed to fetch country config", err);
          }
      }
  };

  const handleCalculateCosts = async () => {
    const updatedItems = [...items];
    let hasError = false;

    for (let i = 0; i < updatedItems.length; i++) {
        const item = updatedItems[i];
        if (item.countryCode && item.salary > 0) {
            if (item.serviceType === "aor") {
                // AOR: no employer cost calculation, total = (contractorRate / exchangeRate + serviceFee) * headcount
                updatedItems[i].employerCost = undefined;
                const rate = item.exchangeRate || 1;
                const usdContractorCost = item.salary / rate;
                updatedItems[i].totalMonthly = (usdContractorCost + item.serviceFee) * item.headcount;
            } else {
                try {
                    const result = await calculateMutation.mutateAsync({
                        countryCode: item.countryCode,
                        salary: item.salary,
                        year: 2025,
                        regionCode: item.regionCode
                    });
                    
                    const employerCost = parseFloat(result.totalEmployer);
                    updatedItems[i].employerCost = employerCost;
                    
                    // Calculate Total in USD
                    // Salary (Local) + EmployerCost (Local) -> Convert to USD
                    // Service Fee (USD) -> Add
                    
                    const localTotal = item.salary + employerCost;
                    const rate = item.exchangeRate || 1;
                    const usdEmploymentCost = localTotal / rate;
                    
                    updatedItems[i].totalMonthly = (usdEmploymentCost + item.serviceFee) * item.headcount;
                } catch (err) {
                    console.error(`Failed to calculate for item ${i}`, err);
                    hasError = true;
                }
            }
        }
    }

    setItems(updatedItems);
    setShowCostPreview(true);
    if (!hasError) toast.success(t("quotations.create.calc_success"));
    else toast.warning(t("quotations.create.calc_warning"));
  };

  const handleSubmit = () => {
    if (!leadId && !customerId) {
        toast.error(t("quotations.create.select_customer_error"));
        return;
    }
    // Basic validation
    if (items.some(i => !i.countryCode || i.salary <= 0)) {
        toast.error(t("quotations.create.fill_details_error"));
        return;
    }

    const payload = {
      leadId,
      customerId,
      validUntil: validUntil || undefined,
      includeCountryGuide,
      items: items.map(i => ({
        ...i,
        currency: i.currency || "USD"
      }))
    };

    if (isEditMode && editId) {
        updateMutation.mutate({ ...payload, id: editId });
    } else {
        createMutation.mutate(payload);
    }
  };

  const totalQuotationValue = items.reduce((sum, item) => sum + (item.totalMonthly || 0), 0);

  return (
    <Layout breadcrumb={["EG", t("nav.sales"), t("nav.quotations"), isEditMode ? "Edit Quotation" : t("quotations.create.title")]}>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/quotations")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{isEditMode ? "Edit Quotation" : t("quotations.create.title")}</h1>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("quotations.create.basic_info")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("quotations.create.customerLabel")}</Label>
                  <Select 
                    value={leadId ? `lead-${leadId}` : customerId ? `cust-${customerId}` : ""} 
                    onValueChange={(val) => {
                        if (val.startsWith("lead-")) {
                            setLeadId(parseInt(val.split("-")[1]));
                            setCustomerId(undefined);
                        } else {
                            setCustomerId(parseInt(val.split("-")[1]));
                            setLeadId(undefined);
                        }
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder={t("quotations.create.select_placeholder")} /></SelectTrigger>
                    <SelectContent>
                        {leads?.data.filter((l: any) => l.status !== "closed_won" && l.status !== "closed_lost").map((l: any) => (
                            <SelectItem key={`lead-${l.id}`} value={`lead-${l.id}`}>{t("quotations.create.lead_prefix")} {l.companyName}</SelectItem>
                        ))}
                        {customers?.data.map((c: any) => (
                            <SelectItem key={`cust-${c.id}`} value={`cust-${c.id}`}>{t("quotations.create.customer_prefix")} {c.companyName}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("quotations.create.validUntil")}</Label>
                  <DatePicker value={validUntil} onChange={setValidUntil} />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                  <h3 className="font-medium text-lg">{t("quotations.items.title")}</h3>
                  <Button variant="outline" size="sm" onClick={handleAddItem}>
                    <Plus className="w-4 h-4 mr-2" />{t("quotations.items.add")}
                  </Button>
              </div>
              
              {items.map((item, index) => (
                  <Card key={index} className="overflow-hidden">
                    <CardContent className="p-0">
                      {/* Header row: item number + delete button */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/50">
                        <span className="text-xs font-medium text-muted-foreground">Item #{index + 1}</span>
                        <Button variant="ghost" size="sm" className="text-destructive h-7 px-2 text-xs" onClick={() => handleRemoveItem(index)} disabled={items.length === 1}>
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            {t("common.delete")}
                        </Button>
                      </div>

                      <div className="p-4 space-y-4">
                        {/* Row 1: Country + Service Type + Headcount */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">{t("quotations.items.country")}</Label>
                                <CountrySelect value={item.countryCode} onValueChange={(v) => handleCountryChange(index, v)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">{t("quotations.items.serviceType")}</Label>
                                <Select value={item.serviceType} onValueChange={(v) => handleServiceTypeChange(index, v as any)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="eor">{t("quotations.create.service_eor")}</SelectItem>
                                        <SelectItem value="visa_eor">{t("quotations.create.service_visa_eor")}</SelectItem>
                                        <SelectItem value="aor">{t("quotations.create.service_aor")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">{t("quotations.items.headcount")}</Label>
                                <Input type="number" min={1} value={item.headcount} onChange={(e) => updateItem(index, "headcount", parseInt(e.target.value))} />
                            </div>
                        </div>

                        {/* China region selector */}
                        {item.countryCode === "CN" && (
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">{t("quotations.create.city_region")}</Label>
                                <Select value={item.regionCode} onValueChange={(v) => updateItem(index, "regionCode", v)}>
                                    <SelectTrigger><SelectValue placeholder={t("quotations.create.select_city")} /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="CN-BJ">Beijing</SelectItem>
                                        <SelectItem value="CN-SH">Shanghai</SelectItem>
                                        <SelectItem value="CN-SZ">Shenzhen</SelectItem>
                                        <SelectItem value="CN-GZ">Guangzhou</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                          </div>
                        )}

                        {/* Row 2: Salary/Rate + Service Fee + One Time Fee (if visa_eor) */}
                        <div className={`grid gap-4 ${item.serviceType === "visa_eor" ? "grid-cols-3" : "grid-cols-2"}`}>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground truncate block" title={item.serviceType === "aor" ? t("quotations.create.contractor_rate") : t("quotations.items.salary")}>
                                  {item.serviceType === "aor" ? t("quotations.create.contractor_rate") : t("quotations.items.salary")}
                                </Label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">{item.currency || "USD"}</span>
                                  <Input type="number" className="pl-14" value={item.salary} onChange={(e) => updateItem(index, "salary", parseFloat(e.target.value))} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground truncate block" title={t("quotations.items.fee")}>
                                  {t("quotations.items.fee")}
                                </Label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">USD</span>
                                  <Input type="number" className="pl-14" value={item.serviceFee} onChange={(e) => updateItem(index, "serviceFee", parseFloat(e.target.value))} />
                                </div>
                            </div>
                            {item.serviceType === "visa_eor" && (
                              <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">One Time Fee</Label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">USD</span>
                                    <Input type="number" className="pl-14" value={item.oneTimeFee || 0} onChange={(e) => updateItem(index, "oneTimeFee", parseFloat(e.target.value))} />
                                  </div>
                              </div>
                            )}
                        </div>

                        {/* Cost preview row */}
                        {item.serviceType === "aor" && item.totalMonthly !== undefined && (
                            <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg text-sm flex justify-between items-center border border-green-200/50 dark:border-green-800/30">
                                <span className="text-xs text-muted-foreground">{t("quotations.create.aor_no_employer_cost")}</span>
                                <span className="font-semibold text-green-700 dark:text-green-400">{t("quotations.create.total_monthly")}: <span className="font-mono">{formatCurrency("USD", item.totalMonthly || 0)}</span></span>
                            </div>
                        )}
                        {item.serviceType !== "aor" && item.employerCost !== undefined && (
                            <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg text-sm flex justify-between items-center border border-blue-200/50 dark:border-blue-800/30">
                                <span className="text-muted-foreground">{t("quotations.create.employer_cost")}: <span className="font-mono font-medium text-foreground">{formatCurrency(item.currency, item.employerCost)}</span></span>
                                <span className="font-semibold text-blue-700 dark:text-blue-400">{t("quotations.create.total_monthly")}: <span className="font-mono">{formatCurrency("USD", item.totalMonthly || 0)}</span></span>
                            </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
              ))}
            </div>
            
            <div className="flex justify-start pt-4">
                <Button variant="secondary" onClick={handleCalculateCosts} disabled={calculateMutation.isPending}>
                    {calculateMutation.isPending ? <Calculator className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}
                    {t("quotations.create.preview_costs")}
                </Button>
            </div>
          </div>

          {/* Right Panel: Summary & Guide */}
          <div className="space-y-6">
             <Card className="border-primary/20 shadow-sm sticky top-6">
                <CardHeader className="bg-primary/5 pb-3 border-b border-primary/10">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary" />
                    {t("quotations.create.summary_title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("quotations.create.total_headcount")}</span>
                            <span className="font-medium">{items.reduce((sum, i) => sum + i.headcount, 0)}</span>
                        </div>
                        {showCostPreview && (
                            <div className="flex justify-between items-end pt-3 border-t border-border">
                                <span className="font-medium">{t("quotations.create.est_monthly_total")}</span>
                                <span className="text-xl font-bold text-primary">{formatCurrency("USD", totalQuotationValue)}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-start space-x-2 pt-4 border-t border-border">
                        <Checkbox 
                            id="include-guide" 
                            checked={includeCountryGuide} 
                            onCheckedChange={(checked) => setIncludeCountryGuide(!!checked)} 
                            className="mt-0.5"
                        />
                        <div className="grid gap-1.5 leading-none">
                          <label 
                              htmlFor="include-guide" 
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                              {t("quotations.create.include_guide")}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            Append country guide to the final PDF
                          </p>
                        </div>
                    </div>
                    
                    <div className="pt-4 flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setLocation("/quotations")}>{t("common.cancel")}</Button>
                      <Button className="flex-1" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                          {createMutation.isPending || updateMutation.isPending ? t("common.loading") : (isEditMode ? "Update" : t("common.create"))}
                      </Button>
                    </div>
                </CardContent>
             </Card>

             {items.length === 1 && items[0].countryCode && guideChapters && guideChapters.length > 0 && (
                 <div className="space-y-3">
                    <h3 className="font-medium text-sm text-muted-foreground px-1">{t("quotations.create.guide_preview")}: {items[0].countryCode}</h3>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                        {guideChapters.slice(0, 3).map(chapter => (
                            <Card key={chapter.id} className="text-xs bg-muted/30">
                                <CardContent className="p-3">
                                    <div className="font-medium mb-1.5 text-primary">{chapter.titleEn}</div>
                                    <div className="text-muted-foreground line-clamp-4 leading-relaxed">{chapter.contentEn}</div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                 </div>
             )}
          </div>
        </div>
      </div>
    </Layout>
  );
}