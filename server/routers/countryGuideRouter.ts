import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { countryGuideChapters, countriesConfig } from "../../drizzle/schema";
import { eq, and, asc, sql, inArray, desc } from "drizzle-orm";
import { generateCountryGuideDraft } from "../services/knowledgeAiService";
import { TRPCError } from "@trpc/server";

export const countryGuideRouter = router({
  /** AI-generate content for a chapter */
  generateContent: protectedProcedure
    .input(z.object({ countryCode: z.string(), topic: z.string() }))
    .mutation(async ({ input }) => {
      return await generateCountryGuideDraft(input);
    }),

  /** List published chapters for a country (portal-facing) */
  listChapters: protectedProcedure
    .input(z.object({ countryCode: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      return await db
        .select()
        .from(countryGuideChapters)
        .where(
          and(
            eq(countryGuideChapters.countryCode, input.countryCode),
            eq(countryGuideChapters.status, "published")
          )
        )
        .orderBy(asc(countryGuideChapters.sortOrder));
    }),

  /** List ALL chapters for a country (admin view, includes drafts) */
  listAllChapters: protectedProcedure
    .input(z.object({ countryCode: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      return await db
        .select()
        .from(countryGuideChapters)
        .where(eq(countryGuideChapters.countryCode, input.countryCode))
        .orderBy(asc(countryGuideChapters.sortOrder));
    }),

  /** Get a single chapter by ID */
  getChapter: protectedProcedure
    .input(z.number())
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      const chapter = await db.query.countryGuideChapters.findFirst({
        where: eq(countryGuideChapters.id, input),
      });
      return chapter;
    }),

  /** Create or update a chapter */
  upsertChapter: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        countryCode: z.string(),
        part: z.number(),
        chapterKey: z.string(),
        titleEn: z.string(),
        titleZh: z.string(),
        contentEn: z.string(),
        contentZh: z.string(),
        sortOrder: z.number().default(0),
        version: z.string().default("2026-Q1"),
        status: z.enum(["draft", "review", "published", "archived"]).default("draft"),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      if (input.id) {
        await db
          .update(countryGuideChapters)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(countryGuideChapters.id, input.id));
        return { id: input.id };
      } else {
        const [res] = await db
          .insert(countryGuideChapters)
          .values(input)
          .returning({ id: countryGuideChapters.id });
        return res;
      }
    }),

  /** Delete a chapter */
  deleteChapter: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      await db.delete(countryGuideChapters).where(eq(countryGuideChapters.id, input.id));
      return { success: true };
    }),

  /** Update chapter status (publish / archive / draft) */
  updateChapterStatus: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["draft", "review", "published", "archived"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      await db
        .update(countryGuideChapters)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(countryGuideChapters.id, input.id));
      return { success: true };
    }),

  /** Bulk update status for all chapters of a country */
  bulkUpdateStatus: protectedProcedure
    .input(
      z.object({
        countryCode: z.string(),
        status: z.enum(["draft", "review", "published", "archived"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      const result = await db
        .update(countryGuideChapters)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(countryGuideChapters.countryCode, input.countryCode));
      return { success: true };
    }),

  /** List countries that have published guides (for admin browse view) */
  listCountriesWithGuides: protectedProcedure.query(async () => {
    const db = getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
    const countriesWithGuides = await db
      .select({
        countryCode: countryGuideChapters.countryCode,
        chapterCount: sql<number>`count(*)`.as("chapterCount"),
      })
      .from(countryGuideChapters)
      .where(eq(countryGuideChapters.status, "published"))
      .groupBy(countryGuideChapters.countryCode);
    const allCountries = await db
      .select({
        countryCode: countriesConfig.countryCode,
        countryName: countriesConfig.countryName,
        localCurrency: countriesConfig.localCurrency,
        payrollCycle: countriesConfig.payrollCycle,
        workingDaysPerWeek: countriesConfig.workingDaysPerWeek,
        statutoryAnnualLeave: countriesConfig.statutoryAnnualLeave,
        noticePeriodDays: countriesConfig.noticePeriodDays,
        probationPeriodDays: countriesConfig.probationPeriodDays,
      })
      .from(countriesConfig)
      .where(eq(countriesConfig.isActive, true));
    const guideMap = new Map(countriesWithGuides.map((c) => [c.countryCode, c.chapterCount]));
    return allCountries
      .filter((c) => guideMap.has(c.countryCode))
      .map((c) => ({
        ...c,
        chapterCount: guideMap.get(c.countryCode) || 0,
      }));
  }),

  /** Get summary stats for the country guide list page */
  getCountryStats: protectedProcedure.query(async () => {
    const db = getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

    const stats = await db
      .select({
        countryCode: countryGuideChapters.countryCode,
        totalChapters: sql<number>`count(*)`.as("totalChapters"),
        publishedChapters: sql<number>`sum(case when ${countryGuideChapters.status} = 'published' then 1 else 0 end)`.as("publishedChapters"),
        draftChapters: sql<number>`sum(case when ${countryGuideChapters.status} = 'draft' then 1 else 0 end)`.as("draftChapters"),
        lastUpdated: sql<string>`max(${countryGuideChapters.updatedAt})`.as("lastUpdated"),
      })
      .from(countryGuideChapters)
      .groupBy(countryGuideChapters.countryCode);

    return stats;
  }),

  /** Bulk import chapters (for seeding from generated data) */
  bulkImport: protectedProcedure
    .input(
      z.object({
        chapters: z.array(
          z.object({
            countryCode: z.string(),
            part: z.number(),
            chapterKey: z.string(),
            titleEn: z.string(),
            titleZh: z.string(),
            contentEn: z.string(),
            contentZh: z.string(),
            sortOrder: z.number().default(0),
            version: z.string().default("2026-Q1"),
            status: z.enum(["draft", "review", "published", "archived"]).default("published"),
          })
        ),
        overwrite: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      let imported = 0;
      for (const chapter of input.chapters) {
        if (input.overwrite) {
          // Delete existing chapter with same countryCode + chapterKey
          await db
            .delete(countryGuideChapters)
            .where(
              and(
                eq(countryGuideChapters.countryCode, chapter.countryCode),
                eq(countryGuideChapters.chapterKey, chapter.chapterKey)
              )
            );
        }
        await db.insert(countryGuideChapters).values(chapter);
        imported++;
      }

      return { imported };
    }),
});
