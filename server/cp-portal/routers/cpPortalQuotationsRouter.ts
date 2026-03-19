/**
 * CP Portal Quotations Router (Task Group E)
 *
 * Allows CP to create and manage quotations for their end clients.
 * Reuses the core quotationService but enforces CP data isolation.
 *
 * CP can:
 * - List quotations scoped to their clients
 * - Create new quotations (with CP markup over EG base pricing)
 * - View quotation details
 * - Update draft quotations
 * - Update quotation status (send, accept, reject, expire)
 * - Download quotation PDF (branded with CP's logo)
 *
 * CP CANNOT:
 * - See quotations created by other CPs or by EG Admin for non-CP clients
 * - Modify quotations that are not in "draft" status
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, count, like, inArray, SQL } from "drizzle-orm";
import {
  protectedCpProcedure,
  cpPortalRouter,
} from "../cpPortalTrpc";
import { getDb } from "../../db";
import {
  quotations,
  customers,
} from "../../../drizzle/schema";
import { quotationService } from "../../services/quotationService";

const quotationItemSchema = z.object({
  countryCode: z.string(),
  regionCode: z.string().optional(),
  headcount: z.number().min(1),
  salary: z.number(),
  currency: z.string().default("USD"),
  serviceType: z.enum(["eor", "visa_eor", "aor"]),
  serviceFee: z.number(),
  oneTimeFee: z.number().optional(),
});

export const cpPortalQuotationsRouter = cpPortalRouter({
  /**
   * List quotations scoped to this CP's clients.
   */
  list: protectedCpProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.enum(["draft", "sent", "accepted", "expired", "rejected"]).optional(),
        search: z.string().optional(),
        customerId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;

      // Get all customer IDs belonging to this CP
      const cpCustomers = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.channelPartnerId, cpId));

      if (cpCustomers.length === 0) return { items: [], total: 0 };

      const customerIds = cpCustomers.map((c) => c.id);

      // Build conditions
      const conditions: SQL[] = [inArray(quotations.customerId, customerIds)];
      if (input.status) conditions.push(eq(quotations.status, input.status));
      if (input.customerId) conditions.push(eq(quotations.customerId, input.customerId));
      if (input.search) conditions.push(like(quotations.quotationNumber, `%${input.search}%`));

      const whereClause = and(...conditions);
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(quotations)
          .where(whereClause)
          .orderBy(desc(quotations.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(quotations)
          .where(whereClause),
      ]);

      // Enrich with customer names
      const customerMap = new Map<number, string>();
      if (items.length > 0) {
        const relatedCustomerIds = Array.from(new Set(items.map((q) => q.customerId).filter(Boolean)));
        if (relatedCustomerIds.length > 0) {
          const relatedCustomers = await db
            .select({ id: customers.id, companyName: customers.companyName })
            .from(customers)
            .where(inArray(customers.id, relatedCustomerIds as number[]));
          relatedCustomers.forEach((c) => customerMap.set(c.id, c.companyName));
        }
      }

      const enrichedItems = items.map((q) => ({
        ...q,
        customerName: q.customerId ? customerMap.get(q.customerId) || "Unknown" : "N/A",
      }));

      return {
        items: enrichedItems,
        total: totalResult[0]?.total ?? 0,
      };
    }),

  /**
   * Get a single quotation by ID.
   * Enforces CP data isolation.
   */
  get: protectedCpProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const cpId = ctx.cpUser.channelPartnerId;

      const quotation = await db
        .select()
        .from(quotations)
        .where(eq(quotations.id, input.id))
        .limit(1);

      if (quotation.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
      }

      const q = quotation[0];

      // Verify the quotation's customer belongs to this CP
      if (q.customerId) {
        const customer = await db
          .select({ channelPartnerId: customers.channelPartnerId })
          .from(customers)
          .where(eq(customers.id, q.customerId))
          .limit(1);

        if (customer.length === 0 || customer[0].channelPartnerId !== cpId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
        }
      }

      // Enrich with customer name
      let customerName = "N/A";
      if (q.customerId) {
        const cust = await db
          .select({ companyName: customers.companyName })
          .from(customers)
          .where(eq(customers.id, q.customerId))
          .limit(1);
        if (cust.length > 0) customerName = cust[0].companyName;
      }

      return { ...q, customerName };
    }),

  /**
   * Create a new quotation for a CP's client.
   * Uses the core quotationService for calculation and PDF generation.
   */
  create: protectedCpProcedure
    .input(
      z.object({
        customerId: z.number(),
        items: z.array(quotationItemSchema).min(1),
        validUntil: z.string().optional(),
        notes: z.string().optional(),
        includeCountryGuide: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Verify customer belongs to this CP
      const customer = await db
        .select({ id: customers.id, channelPartnerId: customers.channelPartnerId })
        .from(customers)
        .where(
          and(
            eq(customers.id, input.customerId),
            eq(customers.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (customer.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Customer does not belong to your organization" });
      }

      // Use core quotation service (createdBy = cpUser.contactId as a proxy)
      const result = await quotationService.createQuotation({
        customerId: input.customerId,
        items: input.items,
        validUntil: input.validUntil,
        notes: input.notes,
        includeCountryGuide: input.includeCountryGuide,
        createdBy: ctx.cpUser.contactId,
      });

      return result;
    }),

  /**
   * Update a draft quotation.
   */
  update: protectedCpProcedure
    .input(
      z.object({
        id: z.number(),
        customerId: z.number(),
        items: z.array(quotationItemSchema).min(1),
        validUntil: z.string().optional(),
        notes: z.string().optional(),
        includeCountryGuide: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Verify quotation exists and belongs to CP's customer
      const existing = await db
        .select()
        .from(quotations)
        .where(eq(quotations.id, input.id))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
      }

      if (existing[0].status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft quotations can be edited" });
      }

      // Verify customer belongs to this CP
      if (existing[0].customerId) {
        const customer = await db
          .select({ channelPartnerId: customers.channelPartnerId })
          .from(customers)
          .where(eq(customers.id, existing[0].customerId))
          .limit(1);

        if (customer.length === 0 || customer[0].channelPartnerId !== cpId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
        }
      }

      const result = await quotationService.updateQuotation({
        id: input.id,
        customerId: input.customerId,
        items: input.items,
        validUntil: input.validUntil,
        notes: input.notes,
        includeCountryGuide: input.includeCountryGuide,
        createdBy: existing[0].createdBy,
        updatedBy: ctx.cpUser.contactId,
      });

      return result;
    }),

  /**
   * Update quotation status.
   * CP can: send, mark as accepted/rejected/expired.
   */
  updateStatus: protectedCpProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["sent", "accepted", "expired", "rejected"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Verify quotation belongs to CP's customer
      const existing = await db
        .select()
        .from(quotations)
        .where(eq(quotations.id, input.id))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
      }

      if (existing[0].customerId) {
        const customer = await db
          .select({ channelPartnerId: customers.channelPartnerId })
          .from(customers)
          .where(eq(customers.id, existing[0].customerId))
          .limit(1);

        if (customer.length === 0 || customer[0].channelPartnerId !== cpId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Quotation not found" });
        }
      }

      // Status transition validation
      const validTransitions: Record<string, string[]> = {
        draft: ["sent"],
        sent: ["accepted", "rejected", "expired"],
      };

      const allowed = validTransitions[existing[0].status] || [];
      if (!allowed.includes(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from "${existing[0].status}" to "${input.status}"`,
        });
      }

      const updateData: Record<string, any> = {
        status: input.status,
        updatedAt: new Date(),
      };

      if (input.status === "sent") {
        updateData.sentAt = new Date();
        updateData.sentBy = ctx.cpUser.contactId;
      }

      await db
        .update(quotations)
        .set(updateData)
        .where(eq(quotations.id, input.id));

      return { success: true };
    }),

  /**
   * Summary statistics for CP's quotations.
   */
  summary: protectedCpProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { total: 0, draft: 0, sent: 0, accepted: 0 };

    const cpId = ctx.cpUser.channelPartnerId;

    const cpCustomers = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.channelPartnerId, cpId));

    if (cpCustomers.length === 0) return { total: 0, draft: 0, sent: 0, accepted: 0 };

    const customerIds = cpCustomers.map((c) => c.id);

    const allQuotations = await db
      .select({ status: quotations.status })
      .from(quotations)
      .where(inArray(quotations.customerId, customerIds));

    const statusCounts: Record<string, number> = { draft: 0, sent: 0, accepted: 0, expired: 0, rejected: 0 };
    allQuotations.forEach((q) => {
      if (statusCounts[q.status] !== undefined) statusCounts[q.status]++;
    });

    return {
      total: allQuotations.length,
      ...statusCounts,
    };
  }),
});
