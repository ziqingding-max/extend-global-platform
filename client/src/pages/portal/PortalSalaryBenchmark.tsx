import PortalLayout from "@/components/PortalLayout";
import { trpc } from "@/lib/trpc"; // Using main trpc client for now, but should ideally use portalTrpc if context is separate
import { portalTrpc } from "@/lib/portalTrpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Loader2, Search } from "lucide-react";
import CountrySelect from "@/components/CountrySelect"; // Assuming this component works for portal too or needs adaptation
import { useI18n } from "@/lib/i18n";

export default function PortalSalaryBenchmark() {
  const { t } = useI18n();
  const [countryCode, setCountryCode] = useState<string>("");
  const [jobCategory, setJobCategory] = useState<string>("");
  const [seniority, setSeniority] = useState<"junior" | "mid" | "senior" | "lead" | "director">("mid");
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());

  const { data: countries } = portalTrpc.toolkit.listCountries.useQuery();
  
  // Hardcoded job categories for MVP (since listJobFunctions isn't in portalToolkit yet)
  const jobCategories = [
    "Software Engineer",
    "Product Manager",
    "Data Scientist",
    "Sales Representative",
    "Marketing Specialist",
    "HR Manager",
    "Accountant"
  ];

  const { data: benchmark, isLoading, refetch } = portalTrpc.toolkit.getBenchmark.useQuery(
    { countryCode, jobCategory, seniorityLevel: seniority },
    { enabled: false }
  );

  const handleSearch = () => {
    if (countryCode && jobCategory && seniority) {
      refetch();
    }
  };

  const chartData = benchmark ? [
    {
      name: "P25",
      value: parseFloat(benchmark.salaryP25),
      fill: "#94a3b8"
    },
    {
      name: "Median (P50)",
      value: parseFloat(benchmark.salaryP50),
      fill: "#3b82f6"
    },
    {
      name: "P75",
      value: parseFloat(benchmark.salaryP75),
      fill: "#1e40af"
    }
  ] : [];

  return (
    <PortalLayout title={t("nav.salaryBenchmark") || "Salary Benchmark"}>
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-lg border shadow-sm">
          <div className="space-y-2">
            <Label>Country/Region</Label>
            <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger>
                    <SelectValue placeholder="Select Country" />
                </SelectTrigger>
                <SelectContent>
                    {countries?.map(c => (
                        <SelectItem key={c.countryCode} value={c.countryCode}>{c.countryName}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Job Function</Label>
            <Select value={jobCategory} onValueChange={setJobCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select Role" />
              </SelectTrigger>
              <SelectContent>
                {jobCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Seniority</Label>
            <Select value={seniority} onValueChange={(v: any) => setSeniority(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="junior">Junior</SelectItem>
                <SelectItem value="mid">Mid-Level</SelectItem>
                <SelectItem value="senior">Senior</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="director">Director</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={handleSearch} disabled={!countryCode || !jobCategory}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              View Data
            </Button>
          </div>
        </div>

        {benchmark ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Salary Distribution ({benchmark.currency})</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `${(v/1000)}k`} />
                    <YAxis dataKey="name" type="category" width={80} />
                    <Tooltip 
                        formatter={(value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: benchmark.currency }).format(value)}
                        cursor={{ fill: 'transparent' }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Market Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted/20 rounded-lg border">
                    <div className="text-sm text-muted-foreground mb-1">Median Annual Salary</div>
                    <div className="text-2xl font-bold text-primary">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: benchmark.currency }).format(parseFloat(benchmark.salaryP50))}
                    </div>
                </div>
                
                <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                        Data Source: <span className="font-medium text-foreground">{benchmark.source || "GEA Global Database"}</span>
                    </p>
                    <p>
                        Last Updated: <span className="font-medium text-foreground">{new Date(benchmark.updatedAt).toLocaleDateString()}</span>
                    </p>
                    <p className="italic mt-4">
                        * Figures represent gross annual base salary excluding bonuses and stock options.
                    </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
            <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground bg-white rounded-lg border border-dashed">
                <Search className="w-12 h-12 mb-4 opacity-20" />
                <p>Select criteria to view salary benchmarks</p>
            </div>
        )}
      </div>
    </PortalLayout>
  );
}
