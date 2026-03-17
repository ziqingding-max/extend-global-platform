import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Globe, Search, CheckCircle2, FileEdit, Archive } from "lucide-react";

export default function CountryGuideList() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const { data: countries, isLoading: countriesLoading } = trpc.countries.list.useQuery();
  const { data: stats, isLoading: statsLoading } = trpc.countryGuides.getCountryStats.useQuery();

  const isLoading = countriesLoading || statsLoading;

  // Build stats map
  const statsMap = useMemo(() => {
    const map = new Map<string, { total: number; published: number; draft: number; lastUpdated: string }>();
    stats?.forEach((s) => {
      map.set(s.countryCode, {
        total: Number(s.totalChapters) || 0,
        published: Number(s.publishedChapters) || 0,
        draft: Number(s.draftChapters) || 0,
        lastUpdated: s.lastUpdated || "",
      });
    });
    return map;
  }, [stats]);

  // Filter countries by search
  const filteredCountries = useMemo(() => {
    if (!countries) return [];
    const q = search.toLowerCase();
    return countries.filter(
      (c) =>
        c.countryName.toLowerCase().includes(q) ||
        c.countryCode.toLowerCase().includes(q)
    );
  }, [countries, search]);

  // Separate countries with and without guides
  const countriesWithGuides = filteredCountries.filter((c) => statsMap.has(c.countryCode));
  const countriesWithoutGuides = filteredCountries.filter((c) => !statsMap.has(c.countryCode));

  // Summary stats
  const totalCountriesWithGuides = stats?.length || 0;
  const totalChapters = stats?.reduce((sum, s) => sum + (Number(s.totalChapters) || 0), 0) || 0;
  const totalPublished = stats?.reduce((sum, s) => sum + (Number(s.publishedChapters) || 0), 0) || 0;

  return (
    <Layout breadcrumb={["GEA", "System", t("nav.countryGuideAdmin")]}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("country_guide_admin.title")}</h1>
            <p className="text-muted-foreground">{t("country_guide_admin.subtitle")}</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Countries/Regions with Guides</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCountriesWithGuides}</div>
              <p className="text-xs text-muted-foreground">of {countries?.length || 0} active countries/regions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Chapters</CardTitle>
              <FileEdit className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalChapters}</div>
              <p className="text-xs text-muted-foreground">across all countries/regions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Published</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{totalPublished}</div>
              <p className="text-xs text-muted-foreground">{totalChapters > 0 ? Math.round((totalPublished / totalChapters) * 100) : 0}% of total</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search countries/regions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Countries with guides */}
            {countriesWithGuides.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Countries/Regions with Guides ({countriesWithGuides.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {countriesWithGuides.map((country) => {
                    const stat = statsMap.get(country.countryCode);
                    return (
                      <Card
                        key={country.countryCode}
                        className="cursor-pointer hover:bg-accent/50 transition-colors border-green-200/50"
                        onClick={() => setLocation(`/admin/knowledge/country-guides/${country.countryCode}`)}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">{country.countryName}</CardTitle>
                          <Badge variant="outline" className="text-xs">{country.countryCode}</Badge>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="default" className="text-xs bg-green-600">
                              {stat?.published || 0} published
                            </Badge>
                            {(stat?.draft || 0) > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {stat?.draft} draft
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {stat?.total || 0} chapters total
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Countries without guides */}
            {countriesWithoutGuides.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Archive className="h-5 w-5 text-muted-foreground" />
                  Countries/Regions without Guides ({countriesWithoutGuides.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {countriesWithoutGuides.map((country) => (
                    <Card
                      key={country.countryCode}
                      className="cursor-pointer hover:bg-accent/50 transition-colors opacity-60"
                      onClick={() => setLocation(`/admin/knowledge/country-guides/${country.countryCode}`)}
                    >
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{country.countryName}</CardTitle>
                        <Badge variant="outline" className="text-xs">{country.countryCode}</Badge>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground">No guide content yet</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
