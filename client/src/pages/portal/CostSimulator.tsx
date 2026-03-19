import { useState } from "react";
import { portalTrpc } from "@/lib/portalTrpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Calculator, Info } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import PortalLayout from "@/components/PortalLayout";

export default function CostSimulator() {
  const [countryCode, setCountryCode] = useState<string>("");
  const [regionCode, setRegionCode] = useState<string>(""); // For China
  const [salary, setSalary] = useState<string>("");
  const [result, setResult] = useState<any>(null);

  const { data: countries } = portalTrpc.toolkit.listCountries.useQuery();
  const calculateMutation = portalTrpc.toolkit.calculateCost.useMutation({
    onSuccess: (data) => setResult(data),
  });

  const handleCalculate = () => {
    if (!countryCode || !salary) return;
    calculateMutation.mutate({
      countryCode,
      salary: parseFloat(salary),
      regionCode: regionCode || undefined,
    });
  };

  const selectedCountry = countries?.find(c => c.countryCode === countryCode);

  return (
    <PortalLayout title="Cost Simulator">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Cost Simulator</h1>
          <p className="text-muted-foreground">Estimate your total employment cost based on country and salary.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Input Card */}
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries?.map((c) => (
                      <SelectItem key={c.countryCode} value={c.countryCode}>
                        {c.countryName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {countryCode === "CN" && (
                <div className="space-y-2">
                  <Label>City</Label>
                  <Select value={regionCode} onValueChange={setRegionCode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a city" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CN-BJ">Beijing</SelectItem>
                      <SelectItem value="CN-SH">Shanghai</SelectItem>
                      <SelectItem value="CN-SZ">Shenzhen</SelectItem>
                      <SelectItem value="CN-GZ">Guangzhou</SelectItem>
                      <SelectItem value="CN-HZ">Hangzhou</SelectItem>
                      <SelectItem value="CN-CD">Chengdu</SelectItem>
                      <SelectItem value="CN-CQ">Chongqing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Salary ({selectedCountry?.localCurrency || "USD"})</Label>
                <Input 
                  type="number" 
                  value={salary} 
                  onChange={(e) => setSalary(e.target.value)} 
                  placeholder="Enter your monthly salary"
                />
              </div>

              <Button 
                onClick={handleCalculate} 
                disabled={calculateMutation.isPending || !countryCode || !salary}
                className="w-full"
              >
                {calculateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                Calculate
              </Button>
            </CardContent>
          </Card>

          {/* Result Card */}
          {result && (
            <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4">
              <CardHeader className="bg-primary/5 pb-4">
                <CardTitle className="text-primary">Total Employment Cost</CardTitle>
                <div className="text-3xl font-bold mt-2">
                  {formatCurrency(result.countryCode === "CN" ? "CNY" : selectedCountry?.localCurrency || "USD", parseFloat(result.totalCost))}
                </div>
                <CardDescription>
                  Base salary plus employer contributions
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Base Salary</span>
                    <span className="font-medium">{formatCurrency(selectedCountry?.localCurrency, result.salary)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Employer Contributions</span>
                    <span className="font-medium text-destructive">+{formatCurrency(selectedCountry?.localCurrency, parseFloat(result.totalEmployer))}</span>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-3 text-sm">Breakdown</h4>
                  <div className="space-y-2">
                    {result.items.map((item: any) => (
                      parseFloat(item.employerContribution) > 0 && (
                        <div key={item.itemKey} className="flex justify-between text-sm">
                          <span>{item.itemNameEn} <span className="text-xs text-muted-foreground">({item.employerRate})</span></span>
                          <span>{formatCurrency(selectedCountry?.localCurrency, parseFloat(item.employerContribution))}</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg flex gap-2 text-xs text-muted-foreground">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <p>
                    This is an estimate and actual costs may vary.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}