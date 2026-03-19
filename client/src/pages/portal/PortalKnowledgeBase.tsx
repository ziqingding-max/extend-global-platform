import { useMemo, useState } from "react";
import { toast } from "sonner";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Bell,
  BookOpen,
  Search,
  Sparkles,
  MessageSquareWarning,
  ChevronRight,
  ArrowLeft,
  ChevronLeft,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Topic = "payroll" | "compliance" | "leave" | "invoice" | "onboarding" | "general";

const topicList: Topic[] = ["payroll", "compliance", "leave", "invoice", "onboarding", "general"];

const PAGE_SIZE = 20;

export default function PortalKnowledgeBase() {
  const [search, setSearch] = useState("");
  const [topics, setTopics] = useState<Topic[]>(topicList);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = portalTrpc.knowledgeBase.dashboard.useQuery({
    locale: undefined,
    topics,
  });

  const feedbackMutation = portalTrpc.knowledgeBase.submitSearchFeedback.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const allItems = data?.items ?? [];

  const filteredItems = useMemo(() => {
    if (!search.trim()) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.summary || "").toLowerCase().includes(q)
    );
  }, [allItems, search]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when search/topics change
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const selectedItem = useMemo(() => {
    if (selectedItemId === null) return null;
    return allItems.find((item) => item.id === selectedItemId) || null;
  }, [allItems, selectedItemId]);

  const toggleTopic = (topic: Topic, checked: boolean) => {
    setTopics((prev) => {
      if (checked) {
        if (prev.includes(topic)) return prev;
        return [...prev, topic];
      }
      return prev.filter((t) => t !== topic);
    });
    setPage(1);
  };

  const hasNoResults = !isLoading && filteredItems.length === 0;

  // ─── Article Detail View ───
  if (selectedItem) {
    return (
      <PortalLayout title={selectedItem.title}>
        <div className="p-6 space-y-6 page-enter max-w-4xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => setSelectedItemId(null)}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to list
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                {selectedItem.category === "alert" ? (
                  <Bell className="w-4 h-4 text-amber-600" />
                ) : (
                  <BookOpen className="w-4 h-4 text-primary" />
                )}
                <Badge variant="secondary">
                  {selectedItem.category === "alert" ? "Alert" : selectedItem.category.charAt(0).toUpperCase() + selectedItem.category.slice(1)}
                </Badge>
                <Badge variant="outline">
                  {selectedItem.topic.charAt(0).toUpperCase() + selectedItem.topic.slice(1)}
                </Badge>
              </div>
              <CardTitle className="text-xl">{selectedItem.title}</CardTitle>
              {selectedItem.summary && (
                <CardDescription className="text-sm mt-2">
                  {selectedItem.summary}
                </CardDescription>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                {selectedItem.publishedAt && (
                  <span>
                    Published at:{" "}
                    {formatDate(selectedItem.publishedAt)}
                  </span>
                )}
                <span>
                  Source:{" "}
                  {selectedItem.sourceId ? `#${selectedItem.sourceId}` : "system"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {selectedItem.content ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedItem.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No content available.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </PortalLayout>
    );
  }

  // ─── List View ───
  return (
    <PortalLayout title="Knowledge Base">
      <div className="p-6 space-y-6 page-enter max-w-6xl mx-auto">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground">
            Find answers and helpful articles about our platform.
          </p>
        </div>

        {/* ─── Filters ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Personalization
            </CardTitle>
            <CardDescription>
              Customize your knowledge base feed by selecting topics you are interested in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search..."
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-4">
              {topicList.map((topic) => {
                const label = topic.charAt(0).toUpperCase() + topic.slice(1);
                return (
                  <div key={topic} className="flex items-center gap-2">
                    <Checkbox
                      id={topic}
                      checked={topics.includes(topic)}
                      onCheckedChange={(checked) =>
                        toggleTopic(topic, checked === true)
                      }
                    />
                    <Label htmlFor={topic}>{label}</Label>
                  </div>
                );
              })}
            </div>

            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Loading..." : "Refresh"}
            </Button>
          </CardContent>
        </Card>

        {/* ─── Stats ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {filteredItems.length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {
                  Object.values(data?.topicCounts ?? {}).filter(
                    (v) => Number(v) > 0
                  ).length
                }
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Updated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium text-muted-foreground">
                {data?.generatedAt ? formatDate(data.generatedAt) : "-"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Article List ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Feed
            </CardTitle>
            <CardDescription>
              Latest articles and updates from the knowledge base.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading...
              </p>
            ) : filteredItems.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No articles found.
                </p>
                <Button
                  variant="outline"
                  disabled={feedbackMutation.isPending}
                  onClick={() =>
                    feedbackMutation.mutate({
                      locale: undefined,
                      query: search,
                      topics,
                      feedbackType: hasNoResults ? "no_results" : "not_helpful",
                    })
                  }
                >
                  <MessageSquareWarning className="w-4 h-4 mr-2" />
                  {feedbackMutation.isPending
                    ? "Loading..."
                    : "Not helpful"}
                </Button>
              </div>
            ) : (
              <>
                {pagedItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border p-4 space-y-2 cursor-pointer hover:bg-accent/50 hover:border-primary/30 transition-colors group"
                    onClick={() => setSelectedItemId(item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedItemId(item.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {item.category === "alert" ? (
                        <Bell className="w-4 h-4 text-amber-600" />
                      ) : (
                        <BookOpen className="w-4 h-4 text-primary" />
                      )}
                      <Badge variant="secondary">
                        {item.category === "alert" ? "Alert" : item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                      </Badge>
                      <Badge variant="outline">
                        {item.topic.charAt(0).toUpperCase() + item.topic.slice(1)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {item.summary || "-"}
                    </p>
                  </div>
                ))}

                {/* ─── Pagination ─── */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * PAGE_SIZE + 1}-
                      {Math.min(currentPage * PAGE_SIZE, filteredItems.length)}{" "}
                      of {filteredItems.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground px-2">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* ─── Feedback ─── */}
                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={feedbackMutation.isPending}
                    onClick={() =>
                      feedbackMutation.mutate({
                        locale: undefined,
                        query: search,
                        topics,
                        feedbackType: "not_helpful",
                      })
                    }
                  >
                    {feedbackMutation.isPending
                      ? "Loading..."
                      : "Not helpful"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}