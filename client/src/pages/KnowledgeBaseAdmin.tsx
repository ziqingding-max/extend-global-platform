import { useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Database, RefreshCw } from "lucide-react";

const ARTICLE_TYPES = [
  "countryOverview",
  "hiringGuide",
  "compensationGuide",
  "terminationGuide",
  "workingConditions",
  "socialInsurance",
  "publicHolidays",
  "leaveEntitlements",
] as const;

type ArticleType = (typeof ARTICLE_TYPES)[number];

export default function KnowledgeBaseAdmin() {
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");

  // Generate tab state
  const [selectedTypes, setSelectedTypes] = useState<ArticleType[]>([...ARTICLE_TYPES]);
  const [countryCodesInput, setCountryCodesInput] = useState("");
  const [generateResult, setGenerateResult] = useState<{
    totalGenerated: number;
    byType: Record<string, number>;
    countries: string[];
    errors: string[];
  } | null>(null);

  const { data: queue, refetch: refetchQueue } = trpc.knowledgeBaseAdmin.listReviewQueue.useQuery({
    statuses: ["pending_review"],
  });
  const { data: publishedItems, refetch: refetchPublished } = trpc.knowledgeBaseAdmin.listReviewQueue.useQuery({
    statuses: ["published"],
  });
  const { data: sources, refetch: refetchSources } = trpc.knowledgeBaseAdmin.listSources.useQuery();
  const { data: contentGaps } = trpc.knowledgeBaseAdmin.listContentGaps.useQuery({ days: 30 });

  const createSourceMutation = trpc.knowledgeBaseAdmin.upsertSource.useMutation({
    onSuccess: async () => {
      toast.success("Source saved");
      setNewSourceName("");
      setNewSourceUrl("");
      await refetchSources();
    },
    onError: (error) => toast.error(error.message),
  });

  const auditSourceMutation = trpc.knowledgeBaseAdmin.auditSourceAuthority.useMutation({
    onSuccess: async () => {
      toast.success("Source audited");
      await refetchSources();
    },
    onError: (error) => toast.error(error.message),
  });

  const ingestMutation = trpc.knowledgeBaseAdmin.ingestSourceNow.useMutation({
    onSuccess: async (res) => {
      toast.success(`Ingested ${res.created}`);
      await Promise.all([refetchQueue(), refetchSources()]);
    },
    onError: (error) => toast.error(error.message),
  });

  const reviewMutation = trpc.knowledgeBaseAdmin.reviewItem.useMutation({
    onSuccess: async () => {
      toast.success("Reviewed");
      await refetchQueue();
    },
    onError: (error) => toast.error(error.message),
  });

  const generateMutation = trpc.knowledgeBaseAdmin.generateFromInternalData.useMutation({
    onSuccess: async (result) => {
      setGenerateResult(result);
      toast.success(`Generate success (${result.totalGenerated})`);
      await Promise.all([refetchQueue(), refetchPublished()]);
    },
    onError: (error) => toast.error(error.message),
  });

  const pendingCount = queue?.length ?? 0;
  const publishedCount = publishedItems?.length ?? 0;
  const topSources = useMemo(() => (sources ?? []).slice(0, 20), [sources]);

  const toggleType = (type: ArticleType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleGenerate = (dryRun: boolean) => {
    const countryCodes = countryCodesInput
      .split(/[,;\s]+/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);

    generateMutation.mutate({
      types: selectedTypes.length > 0 ? selectedTypes : undefined,
      countryCodes: countryCodes.length > 0 ? countryCodes : undefined,
      dryRun,
    });
  };

  return (
    <Layout title="Knowledge Base Admin">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base Admin</h1>
          <p className="text-muted-foreground">Manage and review knowledge base content</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pending</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold">{pendingCount}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Published</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold">{publishedCount}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Sources</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold">{sources?.length ?? 0}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Content Gaps</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold">{contentGaps?.length ?? 0}</div></CardContent>
          </Card>
        </div>

        <Tabs defaultValue="generate">
          <TabsList>
            <TabsTrigger value="generate">
              <Database className="w-4 h-4 mr-1.5" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="gaps">Content Gaps</TabsTrigger>
          </TabsList>

          {/* ─── Generate from Internal Data Tab ─── */}
          <TabsContent value="generate" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Generate Knowledge Base Content
                </CardTitle>
                <CardDescription>Generate articles from internal data sources</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Article type selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Article Types</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelectedTypes(
                          selectedTypes.length === ARTICLE_TYPES.length ? [] : [...ARTICLE_TYPES]
                        )
                      }
                    >
                      {selectedTypes.length === ARTICLE_TYPES.length
                        ? "Deselect All"
                        : "Select All"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {ARTICLE_TYPES.map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={`type-${type}`}
                          checked={selectedTypes.includes(type)}
                          onCheckedChange={() => toggleType(type)}
                        />
                        <Label htmlFor={`type-${type}`} className="text-sm cursor-pointer">
                          {{
                            countryOverview: "Country Overview",
                            hiringGuide: "Hiring Guide",
                            compensationGuide: "Compensation Guide",
                            terminationGuide: "Termination Guide",
                            workingConditions: "Working Conditions",
                            socialInsurance: "Social Insurance",
                            publicHolidays: "Public Holidays",
                            leaveEntitlements: "Leave Entitlements",
                          }[type]}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Country codes input */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Country</Label>
                  <Input
                    value={countryCodesInput}
                    onChange={(e) => setCountryCodesInput(e.target.value)}
                    placeholder="Enter country codes separated by commas"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <Button
                    onClick={() => handleGenerate(false)}
                    disabled={generateMutation.isPending || selectedTypes.length === 0}
                  >
                    {generateMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                        Running...
                      </>
                    ) : (
                      "Generate"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleGenerate(true)}
                    disabled={generateMutation.isPending || selectedTypes.length === 0}
                  >
                    Preview
                  </Button>
                </div>

                {/* Results display */}
                {generateResult && (
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Total Generated</p>
                          <p className="text-xl font-semibold">{generateResult.totalGenerated}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Countries</p>
                          <p className="text-xl font-semibold">{generateResult.countries.length}</p>
                        </div>
                        {generateResult.errors.length > 0 && (
                          <div>
                            <p className="text-xs text-destructive">Errors</p>
                            <p className="text-xl font-semibold text-destructive">{generateResult.errors.length}</p>
                          </div>
                        )}
                      </div>
                      {/* Per-type breakdown */}
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(generateResult.byType)
                          .filter(([, count]) => count > 0)
                          .map(([type, count]) => (
                            <Badge key={type} variant="secondary">
                              {{
                                countryOverview: "Country Overview",
                                hiringGuide: "Hiring Guide",
                                compensationGuide: "Compensation Guide",
                                terminationGuide: "Termination Guide",
                                workingConditions: "Working Conditions",
                                socialInsurance: "Social Insurance",
                                publicHolidays: "Public Holidays",
                                leaveEntitlements: "Leave Entitlements",
                              }[type]} : {count}
                            </Badge>
                          ))}
                      </div>
                      {/* Error list */}
                      {generateResult.errors.length > 0 && (
                        <div className="text-xs text-destructive space-y-1 max-h-40 overflow-y-auto">
                          {generateResult.errors.map((err, i) => (
                            <p key={i}>{err}</p>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Review Tab ─── */}
          <TabsContent value="review" className="space-y-3">
            {(queue ?? []).map((item) => {
              const meta = (item.metadata || {}) as Record<string, any>;
              const riskScore = Number((item as any).riskScore ?? meta.riskScore ?? 0);
              return (
                <Card key={item.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription>{item.summary || "-"}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{item.topic}</Badge>
                      <Badge variant="outline">{item.language}</Badge>
                      <Badge>{item.category}</Badge>
                      <Badge variant="outline">AI {item.aiConfidence}</Badge>
                      <Badge variant={riskScore >= 60 ? "destructive" : "secondary"}>Risk: {riskScore}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground grid grid-cols-1 md:grid-cols-3 gap-2">
                      <span>Authority Score: {Number(meta.authorityScore ?? 0)}</span>
                      <span>Freshness Score: {Number(meta.freshnessScore ?? 0)}</span>
                      <span>Duplication Score: {Number(meta.duplicationScore ?? 0)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => reviewMutation.mutate({ id: item.id, action: "publish" })}>
                        Publish
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => reviewMutation.mutate({ id: item.id, action: "reject" })}>
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {pendingCount === 0 && <p className="text-sm text-muted-foreground">No items pending review</p>}
          </TabsContent>

          {/* ─── Sources Tab ─── */}
          <TabsContent value="sources" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Add New Source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input value={newSourceName} onChange={(e) => setNewSourceName(e.target.value)} placeholder="Source Name" />
                <Input value={newSourceUrl} onChange={(e) => setNewSourceUrl(e.target.value)} placeholder="Source URL" />
                <Button
                  onClick={() => createSourceMutation.mutate({ name: newSourceName, url: newSourceUrl, sourceType: "web", language: "multi", topic: "general", isActive: true })}
                  disabled={!newSourceName || !newSourceUrl || createSourceMutation.isPending}
                >
                  Save Source
                </Button>
              </CardContent>
            </Card>

            {topSources.map((source) => (
              <Card key={source.id}>
                <CardHeader>
                  <CardTitle className="text-base">{source.name}</CardTitle>
                  <CardDescription>{source.url}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">{source.sourceType}</Badge>
                    <Badge variant="outline">{source.topic}</Badge>
                    <Badge>{source.authorityLevel} ({source.authorityScore})</Badge>
                  </div>
                  {source.authorityReason && (
                    <p className="text-xs text-muted-foreground">{source.authorityReason}</p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => ingestMutation.mutate({ sourceId: source.id })}>
                      Ingest
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => auditSourceMutation.mutate({ sourceId: source.id })}
                      disabled={auditSourceMutation.isPending}
                    >
                      Audit Source
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ─── Content Gaps Tab ─── */}
          <TabsContent value="gaps" className="space-y-3">
            {(contentGaps ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No content gaps found</p>
            ) : (
              (contentGaps ?? []).map((gap) => (
                <Card key={`${gap.query}-${gap.latestAt}`}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{gap.query || "No query specified"}</p>
                      <Badge>Hits: {gap.hits}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {gap.topics.map((topic) => (
                        <Badge key={`${gap.query}-${topic}`} variant="outline">{{
                          hiring: "Hiring",
                          compensation: "Compensation",
                          termination: "Termination",
                          working_conditions: "Working Conditions",
                          social_insurance: "Social Insurance",
                          public_holidays: "Public Holidays",
                          leave_entitlements: "Leave Entitlements",
                          country_overview: "Country Overview",
                        }[topic] ?? topic}</Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Latest: {formatDate(gap.latestAt)}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}