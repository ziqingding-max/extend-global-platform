import { z } from "zod";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedPortalProcedure, portalRouter } from "../portalTrpc";
import { getDb } from "../../db";
import { knowledgeFeedbackEvents, knowledgeItems, knowledgeMarketingEvents } from "../../../drizzle/schema";

const topicEnum = ["payroll", "compliance", "leave", "invoice", "onboarding", "general"] as const;

export const portalKnowledgeBaseRouter = portalRouter({
  dashboard: protectedPortalProcedure
    .input(
      z
        .object({
          locale: z.enum(["en", "zh"]).default("en"),
          topics: z.array(z.enum(topicEnum)).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const customerId = ctx.portalUser.customerId;
      const topics = input?.topics?.length ? input.topics : [...topicEnum];

      const items = await db
        .select()
        .from(knowledgeItems)
        .where(
          and(
            inArray(knowledgeItems.topic, topics),
            eq(knowledgeItems.language, input?.locale ?? "en"),
            eq(knowledgeItems.status, "published"),
            or(eq(knowledgeItems.customerId, customerId), isNull(knowledgeItems.customerId))
          )
        )
        .orderBy(desc(knowledgeItems.publishedAt), desc(knowledgeItems.createdAt))
        .limit(500);

      const topicCounts = topics.reduce<Record<string, number>>((acc, topic) => {
        acc[topic] = items.filter((item) => item.topic === topic).length;
        return acc;
      }, {});

      return {
        customerId,
        generatedAt: Date.now(),
        topicCounts,
        items,
      };
    }),

  marketingPreview: protectedPortalProcedure
    .input(
      z.object({
        locale: z.enum(["en", "zh"]).default("en"),
        cadence: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
        topics: z.array(z.enum(topicEnum)).min(1),
        channel: z.enum(["email"]).default("email"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const payload = {
        audienceKey: `customer-${ctx.portalUser.customerId}`,
        locale: input.locale,
        cadence: input.cadence,
        topics: input.topics,
        channel: input.channel,
        generatedAt: Date.now(),
      };

      await db.insert(knowledgeMarketingEvents).values({
        customerId: ctx.portalUser.customerId,
        contactId: ctx.portalUser.contactId,
        channel: input.channel,
        cadence: input.cadence,
        topics: input.topics,
        payload,
      });

      return {
        success: true,
        integrationType: "marketing-api-preview",
        payload,
        message:
          input.locale === "zh"
            ? "已生成营销接口预览载荷，并记录到知识库营销事件。"
            : "Marketing integration payload preview generated and saved as knowledge marketing event.",
      };
    }),

  submitSearchFeedback: protectedPortalProcedure
    .input(
      z.object({
        locale: z.enum(["en", "zh"]).default("en"),
        query: z.string().max(500).optional(),
        topics: z.array(z.enum(topicEnum)).default([]),
        feedbackType: z.enum(["no_results", "not_helpful"]).default("not_helpful"),
        note: z.string().max(2000).optional(),
        metadata: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      await db.insert(knowledgeFeedbackEvents).values({
        customerId: ctx.portalUser.customerId,
        contactId: ctx.portalUser.contactId,
        locale: input.locale,
        query: input.query || null,
        topics: input.topics,
        feedbackType: input.feedbackType,
        note: input.note || null,
        metadata: input.metadata || {
          contactId: ctx.portalUser.contactId,
          submittedAt: Date.now(),
        },
      });

      return {
        success: true,
        message:
          input.locale === "zh"
            ? "感谢反馈，我们会持续优化知识内容。"
            : "Thanks for your feedback. We will keep improving the knowledge content.",
      };
    }),
});
