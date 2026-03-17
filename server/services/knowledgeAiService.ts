import { executeTaskLLM } from "./aiGatewayService";

export type SourceAuthorityResult = {
  score: number;
  level: "high" | "medium" | "low";
  reason: string;
};

export type KnowledgeDraft = {
  title: string;
  summary: string;
  content: string;
  category: "article" | "alert" | "guide";
  topic: "payroll" | "compliance" | "leave" | "invoice" | "onboarding" | "general";
  language: "en" | "zh";
  tags: string[];
  countries: string[];
  confidence: number;
};

function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function authorityLevel(score: number): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function heuristicAuthority(sourceName: string, url: string): SourceAuthorityResult {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  const authorityHosts = [
    "littler.com",
    "fragomen.com",
    "ilo.org",
    "shrm.org",
    "gov",
    "oecd.org",
    "imf.org",
    "worldbank.org",
  ];

  const mediumHosts = ["papayaglobal.com", "remote.com", "deel.com"];

  let score = 40;
  if (authorityHosts.some((h) => host.includes(h))) score += 40;
  else if (mediumHosts.some((h) => host.includes(h))) score += 20;
  if (host.endsWith(".gov") || host.includes("gov.")) score += 20;
  if (sourceName.length > 5) score += 5;

  const finalScore = clampScore(score);
  return {
    score: finalScore,
    level: authorityLevel(finalScore),
    reason: `Heuristic authority evaluation for host ${host || "unknown"}.`,
  };
}

export async function evaluateSourceAuthorityWithAI(params: {
  sourceName: string;
  url: string;
  sourceType: "rss" | "api" | "web";
}): Promise<SourceAuthorityResult> {
  const fallback = heuristicAuthority(params.sourceName, params.url);

  try {
    const result = await executeTaskLLM("source_authority_review", {
      messages: [
        {
          role: "system",
          content:
            "You are a compliance intelligence assistant. Evaluate source authority for global employment, payroll, labor law and immigration topics.",
        },
        {
          role: "user",
          content: JSON.stringify(params),
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 300,
    });

    const raw = result.choices?.[0]?.message?.content;
    const text = typeof raw === "string" ? raw : "";
    const parsed = JSON.parse(text || "{}");

    const score = clampScore(Number(parsed.score ?? fallback.score));
    const reason = String(parsed.reason ?? fallback.reason).slice(0, 500);
    const level = authorityLevel(score);
    return { score, level, reason };
  } catch {
    return fallback;
  }
}

export async function generateKnowledgeDraftWithAI(params: {
  sourceName: string;
  sourceUrl: string;
  topic: "payroll" | "compliance" | "leave" | "invoice" | "onboarding" | "general";
  languageHint: "en" | "zh" | "multi";
  rawTitle: string;
  rawContent: string;
}): Promise<KnowledgeDraft> {
  const fallback: KnowledgeDraft = {
    title: params.rawTitle || "Knowledge Update",
    summary: (params.rawContent || "").slice(0, 220),
    content: (params.rawContent || "").slice(0, 2000),
    category: "article",
    topic: params.topic,
    language: params.languageHint === "zh" ? "zh" : "en",
    tags: [params.topic, "auto-generated"],
    countries: [],
    confidence: 65,
  };

  try {
    const prompt = {
      goal: "Summarize and normalize raw web content for enterprise knowledge base",
      constraints: {
        audience: "B2B clients using EOR/AOR/visa services",
        output_language: params.languageHint,
        style: "concise, practical, policy-aware",
      },
      input: {
        sourceName: params.sourceName,
        sourceUrl: params.sourceUrl,
        topic: params.topic,
        rawTitle: params.rawTitle,
        rawContent: params.rawContent.slice(0, 6000),
      },
      output_schema: {
        title: "string",
        summary: "string <= 240 chars",
        content: "string markdown format",
        category: "article|alert|guide",
        topic: "payroll|compliance|leave|invoice|onboarding|general",
        language: "en|zh",
        tags: "string[]",
        countries: "string[] ISO country code if possible",
        confidence: "number 0-100",
      },
    };

    const result = await executeTaskLLM("knowledge_summarize", {
      messages: [
        {
          role: "system",
          content:
            "You are a legal/compliance editor for global employment operations. Return strict JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify(prompt),
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 900,
    });

    const raw = result.choices?.[0]?.message?.content;
    const text = typeof raw === "string" ? raw : "";
    const parsed = JSON.parse(text || "{}");

    return {
      title: String(parsed.title || fallback.title).slice(0, 500),
      summary: String(parsed.summary || fallback.summary).slice(0, 500),
      content: String(parsed.content || fallback.content).slice(0, 10000),
      category: ["article", "alert", "guide"].includes(parsed.category)
        ? parsed.category
        : fallback.category,
      topic: ["payroll", "compliance", "leave", "invoice", "onboarding", "general"].includes(parsed.topic)
        ? parsed.topic
        : fallback.topic,
      language: parsed.language === "zh" ? "zh" : "en",
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((x: unknown) => String(x)).slice(0, 12) : fallback.tags,
      countries: Array.isArray(parsed.countries)
        ? parsed.countries.map((x: unknown) => String(x).toUpperCase()).slice(0, 8)
        : fallback.countries,
      confidence: clampScore(Number(parsed.confidence ?? fallback.confidence)),
    };
  } catch {
    return fallback;
  }
}

export async function generateCountryGuideDraft(params: {
  countryCode: string;
  topic: string;
}): Promise<{ contentEn: string; contentZh: string }> {
  try {
    const prompt = {
      goal: "Write a comprehensive country guide chapter",
      constraints: {
        audience: "B2B clients, HR managers, international expansion teams",
        style: "professional, authoritative, clear, practical",
        format: "markdown",
      },
      input: {
        country: params.countryCode,
        topic: params.topic,
      },
      output_schema: {
        contentEn: "string markdown (English)",
        contentZh: "string markdown (Chinese Simplified)",
      },
    };

    const result = await executeTaskLLM("knowledge_generate_guide", {
      messages: [
        {
          role: "system",
          content:
            "You are a global employment and compliance expert. Write a detailed guide chapter for the specified country and topic. Return strict JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify(prompt),
        },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 2000,
    });

    const raw = result.choices?.[0]?.message?.content;
    const text = typeof raw === "string" ? raw : "";
    const parsed = JSON.parse(text || "{}");

    return {
      contentEn: parsed.contentEn || "",
      contentZh: parsed.contentZh || "",
    };
  } catch (error) {
    console.error("AI Generation Failed:", error);
    throw new Error("Failed to generate content via AI");
  }
}
