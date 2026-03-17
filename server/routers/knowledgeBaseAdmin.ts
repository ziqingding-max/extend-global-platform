import { z } from "zod";
import { desc, eq, gte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, userProcedure } from "../procedures";
import { router } from "../_core/trpc";
import { getDb } from "../db";
import { knowledgeFeedbackEvents, knowledgeItems, knowledgeSources } from "../../drizzle/schema";
import {
  evaluateSourceAuthorityWithAI,
  generateKnowledgeDraftWithAI,
} from "../services/knowledgeAiService";

async function pullFromSource(url: string): Promise<Array<{ title: string; summary: string; content: string }>> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: `Failed to fetch source: ${res.status}` });

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = (await res.json()) as any;
    if (Array.isArray(json)) {
      return json.slice(0, 20).map((row, idx) => ({
        title: String(row.title || row.name || `Untitled ${idx + 1}`),
        summary: String(row.summary || row.description || ""),
        content: String(row.content || row.body || row.summary || ""),
      }));
    }
    return [
      {
        title: String(json.title || "JSON Source Update"),
        summary: String(json.summary || json.message || "Pulled from JSON endpoint"),
        content: JSON.stringify(json).slice(0, 4000),
      },
    ];
  }

  const text = await res.text();
  const titleMatch = text.match(/<title>(.*?)<\/title>/i);
  return [
    {
      title: titleMatch?.[1]?.trim() || "Web Source Update",
      summary: "Fetched from web source",
      content: text.slice(0, 4000),
    },
  ];
}

function computeFreshnessScore(): number {
  return 92;
}

function computeDuplicationScore(rawContent: string, title: string): number {
  const normalizedLength = Math.min(100, Math.floor((rawContent.length + title.length) / 40));
  return Math.max(5, Math.min(95, normalizedLength));
}

function computeRiskScore(input: {
  authorityScore?: number;
  freshnessScore?: number;
  duplicationScore?: number;
}) {
  const authority = Number(input.authorityScore ?? 0);
  const freshness = Number(input.freshnessScore ?? 0);
  const duplication = Number(input.duplicationScore ?? 0);
  return Math.max(0, Math.min(100, Math.round((100 - authority) * 0.45 + (100 - freshness) * 0.25 + duplication * 0.3)));
}

export const knowledgeBaseAdminRouter = router({
  listReviewQueue: userProcedure
    .input(
      z
        .object({
          statuses: z
            .array(z.enum(["pending_review", "published", "rejected", "draft"]))
            .default(["pending_review"]),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const statuses: Array<"draft" | "pending_review" | "published" | "rejected"> =
        input?.statuses?.length ? input.statuses : ["pending_review"];

      const rows = await db
        .select()
        .from(knowledgeItems)
        .where(inArray(knowledgeItems.status, statuses))
        .orderBy(desc(knowledgeItems.createdAt))
        .limit(200);

      return rows
        .map((row) => {
          const meta = (row.metadata || {}) as Record<string, any>;
          const riskScore = computeRiskScore({
            authorityScore: meta.authorityScore,
            freshnessScore: meta.freshnessScore,
            duplicationScore: meta.duplicationScore,
          });
          return {
            ...row,
            riskScore,
            metadata: {
              ...meta,
              freshnessScore: Number(meta.freshnessScore ?? 0),
              duplicationScore: Number(meta.duplicationScore ?? 0),
            },
          };
        })
        .sort((a, b) => b.riskScore - a.riskScore || Number(b.createdAt) - Number(a.createdAt));
    }),

  listSources: userProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    return db.select().from(knowledgeSources).orderBy(desc(knowledgeSources.updatedAt));
  }),

  listContentGaps: userProcedure
    .input(
      z
        .object({
          days: z.number().min(1).max(90).default(30),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const rows = await db
        .select()
        .from(knowledgeFeedbackEvents)
        .where(gte(knowledgeFeedbackEvents.createdAt, since))
        .orderBy(desc(knowledgeFeedbackEvents.createdAt))
        .limit(500);

      const bucket = new Map<string, { query: string; hits: number; topics: Set<string>; latestAt: Date }>();
      for (const row of rows) {
        const key = (row.query || "(empty)").trim().toLowerCase() || "(empty)";
        const current = bucket.get(key) || {
          query: row.query || "",
          hits: 0,
          topics: new Set<string>(),
          latestAt: row.createdAt,
        };
        current.hits += 1;
        const topicsArr = Array.isArray(row.topics) ? row.topics : [];
        for (const topic of topicsArr) current.topics.add(String(topic));
        if (row.createdAt > current.latestAt) current.latestAt = row.createdAt;
        bucket.set(key, current);
      }

      return Array.from(bucket.values())
        .map((item) => ({
          query: item.query,
          hits: item.hits,
          topics: Array.from(item.topics),
          latestAt: item.latestAt,
        }))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 20);
    }),

  upsertSource: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(2),
        url: z.string().url(),
        sourceType: z.enum(["rss", "api", "web"]).default("web"),
        language: z.enum(["en", "zh", "multi"]).default("multi"),
        topic: z
          .enum(["payroll", "compliance", "leave", "invoice", "onboarding", "general"])
          .default("general"),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const authority = await evaluateSourceAuthorityWithAI({
        sourceName: input.name,
        url: input.url,
        sourceType: input.sourceType,
      });

      if (input.id) {
        await db
          .update(knowledgeSources)
          .set({
            name: input.name,
            url: input.url,
            sourceType: input.sourceType,
            language: input.language,
            topic: input.topic,
            isActive: input.isActive,
            authorityScore: authority.score,
            authorityLevel: authority.level,
            authorityReason: authority.reason,
            aiReviewedAt: new Date(),
            updatedBy: ctx.user.id,
          })
          .where(eq(knowledgeSources.id, input.id));
        return { success: true, id: input.id };
      }

      const result = await db.insert(knowledgeSources).values({
        name: input.name,
        url: input.url,
        sourceType: input.sourceType,
        language: input.language,
        topic: input.topic,
        isActive: input.isActive,
        authorityScore: authority.score,
        authorityLevel: authority.level,
        authorityReason: authority.reason,
        aiReviewedAt: new Date(),
        updatedBy: ctx.user.id,
      });
      return { success: true, id: Number((result as any).insertId ?? 0), authority };
    }),

  auditSourceAuthority: adminProcedure
    .input(z.object({ sourceId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [source] = await db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, input.sourceId))
        .limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });

      const authority = await evaluateSourceAuthorityWithAI({
        sourceName: source.name,
        url: source.url,
        sourceType: source.sourceType,
      });

      await db
        .update(knowledgeSources)
        .set({
          authorityScore: authority.score,
          authorityLevel: authority.level,
          authorityReason: authority.reason,
          aiReviewedAt: new Date(),
        })
        .where(eq(knowledgeSources.id, source.id));

      return { success: true, authority };
    }),

  ingestSourceNow: adminProcedure
    .input(z.object({ sourceId: z.number(), customerId: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [source] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, input.sourceId)).limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });

      const pulled = await pullFromSource(source.url);
      if (!pulled.length) return { success: true, created: 0 };

      const drafts = await Promise.all(
        pulled.map((item) =>
          generateKnowledgeDraftWithAI({
            sourceName: source.name,
            sourceUrl: source.url,
            topic: source.topic,
            languageHint: source.language,
            rawTitle: item.title,
            rawContent: `${item.summary}\n\n${item.content}`,
          })
        )
      );

      await db.insert(knowledgeItems).values(
        drafts.map((draft, idx) => {
          const raw = pulled[idx];
          const freshnessScore = computeFreshnessScore();
          const duplicationScore = computeDuplicationScore(raw.content, raw.title);
          const riskScore = computeRiskScore({
            authorityScore: source.authorityScore,
            freshnessScore,
            duplicationScore,
          });

          return {
            customerId: input.customerId ?? null,
            sourceId: source.id,
            title: draft.title,
            summary: draft.summary,
            content: draft.content,
            status: "pending_review" as const,
            category: draft.category,
            topic: draft.topic,
            language: draft.language,
            aiConfidence: draft.confidence,
            aiSummary: draft.summary,
            metadata: {
              sourceName: source.name,
              sourceUrl: source.url,
              aiTags: draft.tags,
              aiCountries: draft.countries,
              authorityScore: source.authorityScore,
              authorityLevel: source.authorityLevel,
              freshnessScore,
              duplicationScore,
              riskScore,
            },
          };
        })
      );

      await db.update(knowledgeSources).set({ lastFetchedAt: new Date() }).where(eq(knowledgeSources.id, source.id));

      return { success: true, created: drafts.length };
    }),

  generateFromInternalData: adminProcedure
    .input(
      z.object({
        types: z.array(
          z.enum([
            "countryOverview",
            "socialInsurance",
            "publicHolidays",
            "leaveEntitlements",
            "hiringGuide",
            "compensationGuide",
            "terminationGuide",
            "workingConditions",
          ])
        ).optional(),
        countryCodes: z.array(z.string()).optional(),
        dryRun: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const { generateKnowledgeFromInternalData } = await import("../services/knowledgeInternalGeneratorService");
      const result = await generateKnowledgeFromInternalData({
        types: input.types as any,
        countryCodes: input.countryCodes,
        dryRun: input.dryRun,
      });
      return result;
    }),

  reviewItem: adminProcedure
    .input(z.object({ id: z.number(), action: z.enum(["publish", "reject"]), note: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [item] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, input.id)).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });

      await db
        .update(knowledgeItems)
        .set({
          status: input.action === "publish" ? "published" : "rejected",
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          publishedAt: input.action === "publish" ? new Date() : item.publishedAt,
          reviewNote: input.note || null,
        })
        .where(eq(knowledgeItems.id, input.id));

      return { success: true };
    }),
});
