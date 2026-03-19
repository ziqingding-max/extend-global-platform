import React, { useState } from "react";
import { useRoute, useLocation } from "wouter";
import Layout from "@/components/Layout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  ArrowLeft,
  Edit,
  GripVertical,
  Sparkles,
  Trash2,
  Eye,
  CheckCircle2,
  Archive,
  FileEdit,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Helper to get status color
const getStatusColor = (status: string) => {
  switch (status) {
    case "published":
      return "default";
    case "draft":
      return "secondary";
    case "review":
      return "destructive";
    case "archived":
      return "outline";
    default:
      return "outline";
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "published":
      return <CheckCircle2 className="h-3 w-3" />;
    case "draft":
      return <FileEdit className="h-3 w-3" />;
    case "review":
      return <Eye className="h-3 w-3" />;
    case "archived":
      return <Archive className="h-3 w-3" />;
    default:
      return null;
  }
};

export default function CountryGuideEditor() {
  const [, params] = useRoute("/admin/knowledge/country-guides/:countryCode");
  const countryCode = params?.countryCode;
  const [, setLocation] = useLocation();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingChapter, setEditingChapter] = useState<any>(null);
  const [previewTab, setPreviewTab] = useState<"edit" | "preview">("edit");
  const [previewLang, setPreviewLang] = useState<"en" | "zh">("en");

  // Form states
  const [formData, setFormData] = useState<any>({});

  // Fetch country details for title
  const { data: country } = trpc.countries.get.useQuery(
    { countryCode: countryCode || "" },
    { enabled: !!countryCode }
  );

  // Fetch chapters (admin view)
  const {
    data: chapters,
    isLoading,
    refetch,
  } = trpc.countryGuides.listAllChapters.useQuery(
    { countryCode: countryCode || "" },
    { enabled: !!countryCode }
  );

  const upsertMutation = trpc.countryGuides.upsertChapter.useMutation({
    onSuccess: () => {
      toast.success("Chapter saved");
      setIsSheetOpen(false);
      setEditingChapter(null);
      setFormData({});
      refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = trpc.countryGuides.deleteChapter.useMutation({
    onSuccess: () => {
      toast.success("Chapter deleted");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const statusMutation = trpc.countryGuides.updateChapterStatus.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const bulkStatusMutation = trpc.countryGuides.bulkUpdateStatus.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const generateMutation = trpc.countryGuides.generateContent.useMutation({
    onSuccess: (data) => {
      setFormData((prev: any) => ({
        ...prev,
        contentEn: data.contentEn,
        contentZh: data.contentZh,
      }));
      toast.success("Content generated");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleEdit = (chapter: any) => {
    setEditingChapter(chapter);
    setFormData({ ...chapter });
    setPreviewTab("edit");
    setIsSheetOpen(true);
  };

  const handleCreate = () => {
    const newChapter = {
      countryCode: countryCode,
      part: 1,
      sortOrder: (chapters?.length || 0) + 1,
      status: "draft",
      version: "2026-Q1",
      chapterKey: "",
      titleEn: "",
      titleZh: "",
      contentEn: "",
      contentZh: "",
    };
    setEditingChapter(null);
    setFormData(newChapter);
    setPreviewTab("edit");
    setIsSheetOpen(true);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      id: editingChapter?.id,
      countryCode: countryCode!,
      part: Number(formData.part),
      chapterKey: formData.chapterKey,
      titleEn: formData.titleEn,
      titleZh: formData.titleZh,
      contentEn: formData.contentEn,
      contentZh: formData.contentZh,
      sortOrder: Number(formData.sortOrder),
      version: formData.version,
      status: formData.status,
    };

    upsertMutation.mutate(data);
  };

  if (!countryCode) return null;

  // Group chapters by part
  const chaptersByPart = new Map<number, any[]>();
  chapters?.forEach((ch) => {
    const list = chaptersByPart.get(ch.part) || [];
    list.push(ch);
    chaptersByPart.set(ch.part, list);
  });

  const partLabels: Record<number, string> = {
    1: "Country Overview",
    2: "Hiring & Employment",
    3: "Compensation & Taxes",
    4: "Working Conditions & Leave",
    5: "Termination & Compliance",
    6: "Benefits & Additional Info",
  };

  // Stats
  const publishedCount = chapters?.filter((c) => c.status === "published").length || 0;
  const draftCount = chapters?.filter((c) => c.status === "draft").length || 0;
  const reviewCount = chapters?.filter((c) => c.status === "review").length || 0;

  return (
    <Layout
      breadcrumb={[
        "EG",
        "System",
        "Country Guide Admin",
        country?.countryName || countryCode,
      ]}
    >
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/admin/knowledge/country-guides")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {country?.countryName}{" "}
                <Badge variant="outline">{countryCode}</Badge>
              </h1>
              <p className="text-muted-foreground">
                Edit country guide chapters and content
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Bulk actions */}
            {chapters && chapters.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    bulkStatusMutation.mutate({
                      countryCode: countryCode!,
                      status: "published",
                    })
                  }
                  disabled={bulkStatusMutation.isPending}
                >
                  <Send className="h-4 w-4 mr-1" />
                  Publish All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    bulkStatusMutation.mutate({
                      countryCode: countryCode!,
                      status: "draft",
                    })
                  }
                  disabled={bulkStatusMutation.isPending}
                >
                  <FileEdit className="h-4 w-4 mr-1" />
                  Unpublish All
                </Button>
              </>
            )}
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Chapter
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            {chapters?.length || 0} chapters total
          </span>
          {publishedCount > 0 && (
            <Badge variant="default" className="bg-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {publishedCount} published
            </Badge>
          )}
          {draftCount > 0 && (
            <Badge variant="secondary">
              <FileEdit className="h-3 w-3 mr-1" />
              {draftCount} draft
            </Badge>
          )}
          {reviewCount > 0 && (
            <Badge variant="destructive">
              <Eye className="h-3 w-3 mr-1" />
              {reviewCount} in review
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(chaptersByPart.entries())
              .sort(([a], [b]) => a - b)
              .map(([part, partChapters]) => (
                <div key={part}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Part {part}: {partLabels[part] || `Part ${part}`}
                  </h3>
                  <div className="space-y-2">
                    {partChapters.map((chapter: any) => (
                      <Card
                        key={chapter.id}
                        className="group hover:bg-accent/5 transition-colors"
                      >
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="cursor-move text-muted-foreground">
                            <GripVertical className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold truncate">
                                {chapter.titleEn}
                              </span>
                              <span className="text-muted-foreground text-sm truncate">
                                / {chapter.titleZh}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground flex gap-2 items-center flex-wrap">
                              <Badge
                                variant={getStatusColor(chapter.status) as any}
                                className="gap-1"
                              >
                                {getStatusIcon(chapter.status)}
                                {chapter.status
                                  .replace(/_/g, " ")
                                  .replace(/\b\w/g, (c) => c.toUpperCase())}
                              </Badge>
                              <span className="text-muted-foreground/60">
                                Key: {chapter.chapterKey}
                              </span>
                              <span className="text-muted-foreground/60">
                                v{chapter.version}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {chapter.status !== "published" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600 hover:text-green-700"
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: chapter.id,
                                    status: "published",
                                  })
                                }
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            {chapter.status === "published" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-yellow-600 hover:text-yellow-700"
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: chapter.id,
                                    status: "draft",
                                  })
                                }
                              >
                                <FileEdit className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(chapter)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Confirm Delete
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete &quot;
                                    {chapter.titleEn}&quot;. This action cannot
                                    be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      deleteMutation.mutate({
                                        id: chapter.id,
                                      })
                                    }
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            {chapters?.length === 0 && (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                No data available
                <p className="text-sm mt-2">
                  Click &quot;Add Chapter&quot; to create the first chapter for
                  this country.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Edit Sheet */}
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent className="sm:max-w-[80vw] w-[80vw] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>
                {editingChapter?.id
                  ? "Edit Chapter"
                  : "Add Chapter"}
              </SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-6 mt-6">
              {/* Meta fields */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label>Chapter Key</Label>
                  <Input
                    value={formData.chapterKey || ""}
                    onChange={(e) =>
                      handleInputChange("chapterKey", e.target.value)
                    }
                    required
                    placeholder="e.g. overview, taxes"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={formData.status || "draft"}
                    onValueChange={(val) => handleInputChange("status", val)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">
                        Draft
                      </SelectItem>
                      <SelectItem value="review">
                        Review
                      </SelectItem>
                      <SelectItem value="published">
                        Published
                      </SelectItem>
                      <SelectItem value="archived">
                        Archived
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Part Number</Label>
                  <Input
                    type="number"
                    value={formData.part || ""}
                    onChange={(e) =>
                      handleInputChange("part", e.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sortOrder || ""}
                    onChange={(e) =>
                      handleInputChange("sortOrder", e.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Version</Label>
                  <Input
                    value={formData.version || ""}
                    onChange={(e) =>
                      handleInputChange("version", e.target.value)
                    }
                    required
                  />
                </div>
              </div>

              {/* Titles */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title (English)</Label>
                  <Input
                    value={formData.titleEn || ""}
                    onChange={(e) =>
                      handleInputChange("titleEn", e.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Title (Chinese)</Label>
                  <Input
                    value={formData.titleZh || ""}
                    onChange={(e) =>
                      handleInputChange("titleZh", e.target.value)
                    }
                    required
                  />
                </div>
              </div>

              {/* Content with Preview */}
              <Tabs
                value={previewTab}
                onValueChange={(v) => setPreviewTab(v as "edit" | "preview")}
              >
                <div className="flex items-center justify-between mb-2">
                  <TabsList>
                    <TabsTrigger value="edit">
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </TabsTrigger>
                    <TabsTrigger value="preview">
                      <Eye className="h-3 w-3 mr-1" />
                      Preview
                    </TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-2">
                    {previewTab === "preview" && (
                      <Select
                        value={previewLang}
                        onValueChange={(v) => setPreviewLang(v as "en" | "zh")}
                      >
                        <SelectTrigger className="w-24 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="zh">中文</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 text-purple-600 border-purple-200 hover:bg-purple-50"
                      onClick={() => {
                        if (!countryCode || !formData.titleEn) {
                          toast.error(
                            "Please fill in all required fields"
                          );
                          return;
                        }
                        generateMutation.mutate({
                          countryCode,
                          topic: formData.titleEn,
                        });
                      }}
                      disabled={generateMutation.isPending}
                    >
                      {generateMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Generate AI Content
                    </Button>
                  </div>
                </div>

                <TabsContent value="edit" className="mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Content (English, Markdown)
                      </Label>
                      <Textarea
                        className="h-[500px] font-mono text-sm"
                        value={formData.contentEn || ""}
                        onChange={(e) =>
                          handleInputChange("contentEn", e.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Content (Chinese, Markdown)
                      </Label>
                      <Textarea
                        className="h-[500px] font-mono text-sm"
                        value={formData.contentZh || ""}
                        onChange={(e) =>
                          handleInputChange("contentZh", e.target.value)
                        }
                        required
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="preview" className="mt-0">
                  <div className="border rounded-lg p-6 bg-white min-h-[500px] max-h-[600px] overflow-y-auto">
                    <h2 className="text-2xl font-bold mb-4 text-primary border-b pb-3">
                      {previewLang === "en"
                        ? formData.titleEn
                        : formData.titleZh}
                    </h2>
                    <div className="overflow-x-auto">
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-table:text-sm prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-th:text-left prose-table:border prose-th:border prose-td:border">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {previewLang === "en"
                          ? formData.contentEn || ""
                          : formData.contentZh || ""}
                      </ReactMarkdown>
                    </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <SheetFooter className="mt-8">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsSheetOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </div>
    </Layout>
  );
}