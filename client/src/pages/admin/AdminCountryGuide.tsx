/**
 * Admin Country Guide — Browse & Download
 * Mirrors the Client Portal's Country Guide page for internal sales use.
 * Removed: "Start Hiring" / onboarding CTA button.
 * Uses admin tRPC (trpc.countryGuides.*) and admin PDF endpoint.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen,
  Globe,
  Search,
  ChevronRight,
  Building2,
  DollarSign,
  Clock,
  Briefcase,
  Shield,
  Gift,
  ArrowUp,
  Download,
  Calendar,
  Users,
  FileText,
  Coins,
  Timer,
  AlertCircle,
} from "lucide-react";
import Layout from "@/components/Layout";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Chapter icon mapping
const chapterIcons: Record<string, any> = {
  overview: Globe,
  hiring: Briefcase,
  compensation: DollarSign,
  "working-conditions": Clock,
  termination: Shield,
  benefits: Gift,
};

// Chapters that should use accordion (long-form, multi-item content)
const ACCORDION_CHAPTER_KEYS = new Set([
  "working-conditions",
  "termination",
  "benefits",
]);

// Part labels
const partLabelsEn: Record<number, string> = {
  1: "Country Overview",
  2: "Hiring & Employment",
  3: "Compensation & Taxes",
  4: "Working Conditions & Leave",
  5: "Termination & Compliance",
  6: "Benefits & Additional Info",
};

const partLabelsZh: Record<number, string> = {
  1: "国家概览",
  2: "招聘与雇佣",
  3: "薪酬与税务",
  4: "工作条件与假期",
  5: "终止与合规",
  6: "福利与附加信息",
};

// Payroll cycle labels
const payrollCycleLabels: Record<string, { en: string; zh: string }> = {
  monthly: { en: "Monthly", zh: "每月" },
  semi_monthly: { en: "Semi-monthly", zh: "每半月" },
};

// ─── At-a-Glance Card Component ─────────────────────────────────────────────
function QuickFactCard({
  icon: Icon,
  label,
  value,
  highlight = false,
}: {
  icon: any;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border bg-background shadow-sm transition-all hover:shadow-md ${
        highlight ? "border-primary/30 bg-primary/5" : "border-border"
      }`}
    >
      <div
        className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          highlight ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide leading-tight">
          {label}
        </p>
        <p className="text-sm font-semibold text-foreground mt-0.5 leading-snug">
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── Markdown Renderer ───────────────────────────────────────────────────────
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="overflow-x-auto">
      <div className="prose prose-sm max-w-none dark:prose-invert
        prose-headings:text-foreground prose-headings:font-semibold
        prose-p:text-muted-foreground prose-p:leading-relaxed
        prose-strong:text-foreground
        prose-li:text-muted-foreground prose-ul:my-2 prose-ol:my-2
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-h2:text-base prose-h3:text-sm prose-h2:mt-4 prose-h3:mt-3
        prose-table:text-sm prose-table:w-full
        prose-th:bg-primary/8 prose-th:text-foreground prose-th:font-semibold
        prose-th:px-3 prose-th:py-2.5 prose-th:text-left prose-th:border prose-th:border-border
        prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-border prose-td:text-muted-foreground
        prose-table:border prose-table:border-border prose-table:rounded-lg prose-table:overflow-hidden
        [&_table]:border-collapse [&_table]:w-full
        [&_tbody_tr:nth-child(even)_td]:bg-muted/30
        [&_tbody_tr:hover_td]:bg-primary/5 [&_tbody_tr:hover_td]:transition-colors">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AdminCountryGuide() {
  const { t, locale } = useI18n();
  const [countryCode, setCountryCode] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Use admin tRPC — countries list and countries-with-guides
  const { data: allCountries } = trpc.countries.list.useQuery();
  const { data: countriesWithGuides } = trpc.countryGuides.listCountriesWithGuides.useQuery();
  const { data: chapters, isLoading } = trpc.countryGuides.listChapters.useQuery(
    { countryCode },
    { enabled: !!countryCode }
  );

  // Set default country to first country with guides
  useEffect(() => {
    if (!countryCode && countriesWithGuides && countriesWithGuides.length > 0) {
      setCountryCode(countriesWithGuides[0].countryCode);
    }
  }, [countriesWithGuides, countryCode]);

  // Track scroll position for active chapter highlighting
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      setShowScrollTop(container.scrollTop > 300);

      const chapterElements = container.querySelectorAll("[data-chapter-id]");
      let currentActive: number | null = null;

      chapterElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top <= containerRect.top + 150) {
          currentActive = Number(el.getAttribute("data-chapter-id"));
        }
      });

      if (currentActive !== null) {
        setActiveChapterId(currentActive);
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [chapters]);

  // Group chapters by part
  const chaptersByPart = useMemo(() => {
    const map = new Map<number, any[]>();
    chapters?.forEach((ch) => {
      const list = map.get(ch.part) || [];
      list.push(ch);
      map.set(ch.part, list);
    });
    return map;
  }, [chapters]);

  // Get current country info
  const currentCountry = useMemo(() => {
    return countriesWithGuides?.find((c) => c.countryCode === countryCode)
      ?? allCountries?.find((c) => c.countryCode === countryCode);
  }, [allCountries, countriesWithGuides, countryCode]);

  // Only show countries that have published guides
  const publishedCountries = useMemo(() => {
    if (!allCountries || !countriesWithGuides) return allCountries || [];
    const publishedCodes = new Set(countriesWithGuides.map((c) => c.countryCode));
    return allCountries.filter((c) => publishedCodes.has(c.countryCode));
  }, [allCountries, countriesWithGuides]);

  const filteredCountries = useMemo(() => {
    if (!publishedCountries) return [];
    const q = searchQuery.toLowerCase();
    if (!q) return publishedCountries;
    return publishedCountries.filter(
      (c) =>
        c.countryName.toLowerCase().includes(q) ||
        c.countryCode.toLowerCase().includes(q)
    );
  }, [publishedCountries, searchQuery]);

  const scrollToChapter = (chapterId: number) => {
    const el = document.querySelector(`[data-chapter-id="${chapterId}"]`);
    if (el && contentRef.current) {
      const containerTop = contentRef.current.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      contentRef.current.scrollTo({
        top: contentRef.current.scrollTop + (elTop - containerTop) - 20,
        behavior: "smooth",
      });
    }
  };

  const scrollToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // PDF Download handler — uses admin endpoint with admin session cookie
  const handleDownloadPdf = async () => {
    if (!countryCode || isDownloading) return;
    setIsDownloading(true);
    try {
      const pdfLocale = locale === "zh" ? "zh" : "en";
      const response = await fetch(
        `/api/admin-country-guide/${countryCode}/pdf?locale=${pdfLocale}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const langSuffix = pdfLocale === "zh" ? "-zh" : "";
      a.download = `country-guide-${countryCode}${langSuffix}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download error:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const partLabels = locale === "zh" ? partLabelsZh : partLabelsEn;

  return (
    <Layout title={t("nav.countryGuide")} breadcrumb={["GEA", "Sales", t("nav.countryGuide")]}>
      <div className="h-[calc(100vh-3.5rem)] flex flex-col">
        {/* ── Hero Header ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-6 py-5 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-primary" />
                {t("nav.countryGuide")}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {locale === "zh"
                  ? "全面的全球扩展指南，涵盖雇佣、薪酬、合规等关键信息"
                  : "Comprehensive guides for global expansion covering hiring, compensation, compliance and more"}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* PDF Download Button */}
              {countryCode && chapters && chapters.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={isDownloading}
                  className="gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  {isDownloading
                    ? locale === "zh" ? "生成中..." : "Generating..."
                    : locale === "zh" ? "下载 PDF" : "Download PDF"}
                </Button>
              )}

              {/* Country Selector */}
              <div className="w-[220px]">
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger className="bg-white/80 backdrop-blur-sm h-8 text-xs">
                    <SelectValue
                      placeholder={
                        locale === "zh" ? "选择国家" : "Select country"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 pb-2">
                      <Input
                        placeholder={locale === "zh" ? "搜索国家..." : "Search..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8"
                      />
                    </div>
                    {filteredCountries?.map((c) => (
                      <SelectItem key={c.countryCode} value={c.countryCode}>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{c.countryName}</span>
                          <span className="text-xs text-muted-foreground">
                            ({c.countryCode})
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── At-a-Glance Quick Facts ──────────────────────────── */}
          {currentCountry && chapters && chapters.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
              <QuickFactCard
                icon={Coins}
                label={locale === "zh" ? "当地货币" : "Local Currency"}
                value={(currentCountry as any).localCurrency ?? "—"}
              />
              <QuickFactCard
                icon={Timer}
                label={locale === "zh" ? "发薪周期" : "Payroll Cycle"}
                value={
                  (currentCountry as any).payrollCycle
                    ? (locale === "zh"
                        ? payrollCycleLabels[(currentCountry as any).payrollCycle]?.zh
                        : payrollCycleLabels[(currentCountry as any).payrollCycle]?.en) ?? (currentCountry as any).payrollCycle
                    : "—"
                }
              />
              <QuickFactCard
                icon={Calendar}
                label={locale === "zh" ? "法定年假（天）" : "Statutory Annual Leave"}
                value={
                  (currentCountry as any).statutoryAnnualLeave != null
                    ? `${(currentCountry as any).statutoryAnnualLeave} ${locale === "zh" ? "天" : "days"}`
                    : "—"
                }
              />
              <QuickFactCard
                icon={AlertCircle}
                label={locale === "zh" ? "通知期（天）" : "Notice Period"}
                value={
                  (currentCountry as any).noticePeriodDays != null
                    ? `${(currentCountry as any).noticePeriodDays} ${locale === "zh" ? "天" : "days"}`
                    : "—"
                }
              />
              <QuickFactCard
                icon={Users}
                label={locale === "zh" ? "每周工作日" : "Working Days / Week"}
                value={
                  (currentCountry as any).workingDaysPerWeek != null
                    ? `${(currentCountry as any).workingDaysPerWeek} ${locale === "zh" ? "天" : "days"}`
                    : "—"
                }
              />
            </div>
          )}
        </div>

        {/* ── Main Content Area ────────────────────────────────────── */}
        {!countryCode ? (
          /* Country Selection Grid */
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-lg font-semibold mb-4">
              {locale === "zh" ? "选择一个国家开始浏览" : "Select a country to get started"}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {countriesWithGuides?.map((c) => (
                <Card
                  key={c.countryCode}
                  className="cursor-pointer hover:bg-accent/50 hover:border-primary/30 transition-all"
                  onClick={() => setCountryCode(c.countryCode)}
                >
                  <CardContent className="p-4">
                    <div className="font-medium">{c.countryName}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {c.chapterCount} {locale === "zh" ? "章节" : "chapters"}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          /* Guide Content */
          <div className="flex-1 min-h-0 flex">
            {/* ── Sidebar Navigation ─────────────────────────────── */}
            <div className="w-64 border-r bg-muted/30 flex-shrink-0 overflow-y-auto p-4">
              <nav className="space-y-4">
                {Array.from(chaptersByPart.entries())
                  .sort(([a], [b]) => a - b)
                  .map(([part, partChapters]) => (
                    <div key={part}>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
                        {partLabels[part] || `Part ${part}`}
                      </h3>
                      <div className="space-y-0.5">
                        {partChapters.map((chapter: any) => {
                          const Icon =
                            chapterIcons[chapter.chapterKey] || BookOpen;
                          const isActive = activeChapterId === chapter.id;
                          return (
                            <button
                              key={chapter.id}
                              onClick={() => scrollToChapter(chapter.id)}
                              className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                                isActive
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">
                                {locale === "zh"
                                  ? chapter.titleZh
                                  : chapter.titleEn}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </nav>
            </div>

            {/* ── Content Area ───────────────────────────────────── */}
            <div
              ref={contentRef}
              className="flex-1 overflow-y-auto relative"
            >
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : chapters && chapters.length > 0 ? (
                <div className="max-w-4xl mx-auto px-8 py-6">
                  {/* Country Title */}
                  <div className="mb-8 pb-6 border-b">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h1 className="text-3xl font-bold text-foreground">
                          {currentCountry?.countryName}
                        </h1>
                        <p className="text-muted-foreground mt-2">
                          {locale === "zh"
                            ? `${currentCountry?.countryName}的全面雇佣指南`
                            : `Comprehensive employment guide for ${currentCountry?.countryName}`}
                        </p>
                      </div>
                      <Badge variant="secondary" className="flex-shrink-0 mt-1">
                        {chapters.length} {locale === "zh" ? "章节" : "chapters"}
                      </Badge>
                    </div>
                  </div>

                  {/* Chapters */}
                  {Array.from(chaptersByPart.entries())
                    .sort(([a], [b]) => a - b)
                    .map(([part, partChapters]) => (
                      <div key={part} className="mb-10">
                        {/* Part Header */}
                        <div className="flex items-center gap-3 mb-6">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-bold text-primary">
                              {part}
                            </span>
                          </div>
                          <h2 className="text-xl font-bold text-foreground">
                            {partLabels[part] || `Part ${part}`}
                          </h2>
                          <div className="flex-1 h-px bg-border" />
                        </div>

                        {/* Chapters within this part */}
                        {partChapters.map((chapter: any) => {
                          const useAccordion = ACCORDION_CHAPTER_KEYS.has(chapter.chapterKey);
                          const content = locale === "zh"
                            ? chapter.contentZh
                            : chapter.contentEn;

                          return (
                            <div
                              key={chapter.id}
                              data-chapter-id={chapter.id}
                              className="mb-8 scroll-mt-6"
                            >
                              {useAccordion ? (
                                /* ── Accordion layout for long chapters ── */
                                <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                                  <div className="flex items-center gap-2 px-5 py-4 bg-muted/40 border-b">
                                    <ChevronRight className="h-4 w-4 text-primary" />
                                    <h3 className="text-base font-semibold text-foreground">
                                      {locale === "zh"
                                        ? chapter.titleZh
                                        : chapter.titleEn}
                                    </h3>
                                  </div>
                                  <Accordion
                                    type="multiple"
                                    className="px-5"
                                  >
                                    {parseAccordionSections(content).map(
                                      (section, idx) => (
                                        <AccordionItem
                                          key={idx}
                                          value={`section-${chapter.id}-${idx}`}
                                        >
                                          <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline hover:text-primary">
                                            {section.title}
                                          </AccordionTrigger>
                                          <AccordionContent>
                                            <MarkdownContent content={section.content} />
                                          </AccordionContent>
                                        </AccordionItem>
                                      )
                                    )}
                                  </Accordion>
                                </div>
                              ) : (
                                /* ── Standard layout for regular chapters ── */
                                <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                                  <div className="flex items-center gap-2 px-5 py-4 bg-muted/40 border-b">
                                    <ChevronRight className="h-4 w-4 text-primary" />
                                    <h3 className="text-base font-semibold text-foreground">
                                      {locale === "zh"
                                        ? chapter.titleZh
                                        : chapter.titleEn}
                                    </h3>
                                  </div>
                                  <div className="px-5 py-5">
                                    <MarkdownContent content={content} />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}

                  {/* ── Download Banner (replaces CTA) ──────────── */}
                  <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-6 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-foreground text-base">
                        {locale === "zh"
                          ? `下载${currentCountry?.countryName}雇佣指南`
                          : `Download the ${currentCountry?.countryName} Employment Guide`}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {locale === "zh"
                          ? "将完整指南导出为 PDF，方便分享给客户或离线查阅。"
                          : "Export the full guide as a PDF to share with clients or read offline."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadPdf}
                        disabled={isDownloading}
                        className="gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {locale === "zh" ? "下载指南" : "Download Guide"}
                      </Button>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="border-t pt-6 pb-12 text-center text-xs text-muted-foreground">
                    <p>
                      {locale === "zh"
                        ? "本指南仅供参考，不构成法律建议。如有具体问题，请咨询专业顾问。"
                        : "This guide is for informational purposes only and does not constitute legal advice. Please consult with a professional advisor for specific questions."}
                    </p>
                    <p className="mt-1">
                      {locale === "zh" ? "最后更新：2026年第一季度" : "Last updated: Q1 2026"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>
                      {locale === "zh"
                        ? "该国家暂无指南内容"
                        : "No guide content available for this country yet"}
                    </p>
                  </div>
                </div>
              )}
              {/* Scroll to top button */}
              {showScrollTop && (
                <button
                  onClick={scrollToTop}
                  className="fixed bottom-6 right-6 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors z-50"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── Helper: Parse Markdown into Accordion Sections ─────────────────────────
function parseAccordionSections(
  markdown: string
): { title: string; content: string }[] {
  const lines = markdown.split("\n");
  const sections: { title: string; content: string }[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];
  let foundH3 = false;
  for (const line of lines) {
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      foundH3 = true;
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
      }
      currentTitle = h3Match[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
  }
  if (!foundH3) {
    return [{ title: "Details", content: markdown.trim() }];
  }
  return sections.filter((s) => s.content.length > 0 || s.title);
}
