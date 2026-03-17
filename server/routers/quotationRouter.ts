import { router } from "../_core/trpc";
import { crmProcedure } from "../procedures";
import { z } from "zod";
import { quotationService } from "../services/quotationService";
import { storageGet, storageDownload } from "../storage";
import { getDb } from "../db";
import { quotations } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const quotationRouter = router({
  create: crmProcedure
    .input(
      z.object({
        leadId: z.number().optional(),
        customerId: z.number().optional(),
        includeCountryGuide: z.boolean().optional(),
        items: z.array(
          z.object({
            countryCode: z.string(),
            regionCode: z.string().optional(),
            headcount: z.number().min(1),
            salary: z.number(),
            currency: z.string().default("USD"),
            serviceType: z.enum(["eor", "visa_eor", "aor"]),
            serviceFee: z.number(),
            oneTimeFee: z.number().optional(),
          })
        ),
        validUntil: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await quotationService.createQuotation({
        ...input,
        createdBy: ctx.user.id,
      });
    }),

  update: crmProcedure
    .input(
      z.object({
        id: z.number(),
        leadId: z.number().optional(),
        customerId: z.number().optional(),
        includeCountryGuide: z.boolean().optional(),
        items: z.array(
          z.object({
            countryCode: z.string(),
            regionCode: z.string().optional(),
            headcount: z.number().min(1),
            salary: z.number(),
            currency: z.string().default("USD"),
            serviceType: z.enum(["eor", "visa_eor", "aor"]),
            serviceFee: z.number(),
            oneTimeFee: z.number().optional(),
          })
        ),
        validUntil: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Re-use create logic but update existing record
      // Ideally quotationService should have an update method
      return await quotationService.updateQuotation({
        ...input,
        updatedBy: ctx.user.id,
      });
    }),

  list: crmProcedure
    .input(
      z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
        search: z.string().optional(),
        customerId: z.number().optional(),
        leadId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      const whereConditions = [];
      if (input.customerId) whereConditions.push(eq(quotations.customerId, input.customerId));
      if (input.leadId) whereConditions.push(eq(quotations.leadId, input.leadId));
      
      // Note: Full-text search on joined tables (customer/lead) is complex with Drizzle query builder.
      // For now, we rely on client-side filtering or exact ID matches if provided.
      // If 'search' is provided, we can try to filter by quotationNumber.
      if (input.search) {
          // whereConditions.push(like(quotations.quotationNumber, `%${input.search}%`));
          // Using a simple workaround since 'like' import might be missing or different in this context
      }

      const items = await db.query.quotations.findMany({
        where: (quotations, { eq, or, and, like }) => {
            const conditions = [];
            if (input.customerId) conditions.push(eq(quotations.customerId, input.customerId));
            if (input.leadId) conditions.push(eq(quotations.leadId, input.leadId));
            if (input.search) {
                // Basic search on quotation number
                conditions.push(like(quotations.quotationNumber, `%${input.search}%`));
            }
            return and(...conditions);
        },
        orderBy: (quotations, { desc }) => [desc(quotations.createdAt)],
        limit: input.limit,
        offset: input.offset,
        with: {
          customer: true,
          salesLead: true
        }
      });

      // Simple count for now, optimizing later if needed
      const allItems = await db.select().from(quotations);
      const total = allItems.length;

      return { items, total };
    }),

  get: crmProcedure
    .input(z.number())
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      const quotation = await db.query.quotations.findFirst({
        where: eq(quotations.id, input),
      });
      return quotation;
    }),

  updateStatus: crmProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["draft", "sent", "accepted", "expired", "rejected"]),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      await db.update(quotations)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(quotations.id, input.id));

      return { success: true };
    }),

  downloadPdf: crmProcedure
    .input(z.number())
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      const quotation = await db.query.quotations.findFirst({
        where: eq(quotations.id, input),
      });

      if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });

      // Always try to serve content directly (proxy) to avoid browser blocking and mixed content issues
      // If we have a key, try to fetch from storage
      if (quotation.pdfKey) {
        try {
            // Using storageDownload to get actual file content instead of just URL
            const { content, contentType } = await storageDownload(quotation.pdfKey);
            return {
                content: content.toString('base64'),
                filename: `Quotation-${quotation.quotationNumber}.pdf`,
                contentType
            };
        } catch (e) {
            console.warn("Failed to fetch existing PDF from storage, regenerating...", e);
        }
      }

      // If no key or fetch failed, regenerate
      try {
          const { buffer } = await quotationService.generatePdf(input);
          return { 
              content: buffer.toString('base64'),
              filename: `Quotation-${quotation.quotationNumber}.pdf`
          };
      } catch (err) {
          console.error("Failed to generate PDF:", err);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PDF generation failed" });
      }
    }),
});
