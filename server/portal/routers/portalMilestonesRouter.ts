/**
 * Portal Milestones Router
 *
 * Allows portal users to view, create, approve/reject milestones for their contractors.
 * All queries are SCOPED to ctx.portalUser.customerId.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  protectedPortalProcedure,
  portalHrProcedure,
  portalRouter,
} from "../portalTrpc";
import { getDb } from "../../db";
import {
  contractors,
  contractorMilestones,
} from "../../../drizzle/schema";

export const portalMilestonesRouter = portalRouter({
  /**
   * List all milestones for the customer's contractors
   */
  list: protectedPortalProcedure
    .input(
      z.object({
        contractorId: z.number().optional(),
        status: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return [];

      const customerId = ctx.portalUser.customerId;

      // First get all contractor IDs belonging to this customer
      const customerContractors = await db
        .select({ id: contractors.id })
        .from(contractors)
        .where(eq(contractors.customerId, customerId));

      const contractorIds = customerContractors.map((c) => c.id);
      if (contractorIds.length === 0) return [];

      // Build conditions
      const conditions = [inArray(contractorMilestones.contractorId, contractorIds)];

      if (input.contractorId) {
        // Verify the contractor belongs to this customer
        if (!contractorIds.includes(input.contractorId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Contractor not found" });
        }
        conditions.push(eq(contractorMilestones.contractorId, input.contractorId));
      }

      if (input.status) {
        conditions.push(eq(contractorMilestones.status, input.status as any));
      }

      const milestones = await db
        .select({
          id: contractorMilestones.id,
          contractorId: contractorMilestones.contractorId,
          title: contractorMilestones.title,
          description: contractorMilestones.description,
          amount: contractorMilestones.amount,
          currency: contractorMilestones.currency,
          status: contractorMilestones.status,
          dueDate: contractorMilestones.dueDate,
          completedAt: contractorMilestones.completedAt,
          clientApprovedAt: contractorMilestones.clientApprovedAt,
          createdAt: contractorMilestones.createdAt,
        })
        .from(contractorMilestones)
        .where(and(...conditions))
        .orderBy(desc(contractorMilestones.createdAt));

      // Enrich with contractor name
      const contractorMap = new Map<number, { firstName: string; lastName: string }>();
      if (milestones.length > 0) {
        const uniqueIds = Array.from(new Set(milestones.map((m) => m.contractorId)));
        const contractorDetails = await db
          .select({ id: contractors.id, firstName: contractors.firstName, lastName: contractors.lastName })
          .from(contractors)
          .where(inArray(contractors.id, uniqueIds));
        contractorDetails.forEach((c) => contractorMap.set(c.id, c));
      }

      return milestones.map((m) => ({
        ...m,
        contractorName: contractorMap.has(m.contractorId)
          ? `${contractorMap.get(m.contractorId)!.firstName} ${contractorMap.get(m.contractorId)!.lastName}`
          : "Unknown",
      }));
    }),

  /**
   * Create a new milestone for a contractor
   */
  create: portalHrProcedure
    .input(
      z.object({
        contractorId: z.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        amount: z.string().min(1),
        currency: z.string().default("USD"),
        dueDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const customerId = ctx.portalUser.customerId;

      // Verify contractor belongs to this customer and get its locked currency
      const [con] = await db
        .select({ id: contractors.id, currency: contractors.currency, customerId: contractors.customerId })
        .from(contractors)
        .where(and(eq(contractors.id, input.contractorId), eq(contractors.customerId, customerId)))
        .limit(1);

      if (!con) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Contractor not found" });
      }

      // Currency is locked from the contractor record, ignore frontend value
      const currency = con.currency || input.currency;

      const result = await db
        .insert(contractorMilestones)
        .values({
          contractorId: input.contractorId,
          customerId: con.customerId,
          title: input.title,
          description: input.description || null,
          amount: input.amount,
          currency,
          dueDate: input.dueDate || null,
          status: "pending",
        })
        .returning();

      return { id: result[0]?.id };
    }),

  /**
   * Approve a submitted milestone
   */
  approve: portalHrProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const customerId = ctx.portalUser.customerId;

      // Verify milestone belongs to a contractor of this customer
      const milestone = await db
        .select({
          id: contractorMilestones.id,
          contractorId: contractorMilestones.contractorId,
          status: contractorMilestones.status,
        })
        .from(contractorMilestones)
        .where(eq(contractorMilestones.id, input.id))
        .limit(1);

      if (milestone.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Milestone not found" });
      }

      // Verify contractor belongs to customer
      const contractor = await db
        .select({ id: contractors.id })
        .from(contractors)
        .where(and(eq(contractors.id, milestone[0].contractorId), eq(contractors.customerId, customerId)))
        .limit(1);

      if (contractor.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      if (milestone[0].status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only submitted milestones can be approved" });
      }

      await db
        .update(contractorMilestones)
        .set({
          status: "client_approved" as any,
          clientApprovedBy: ctx.portalUser.contactId,
          clientApprovedAt: new Date(),
        })
        .where(eq(contractorMilestones.id, input.id));

      return { success: true };
    }),

  /**
   * Reject a submitted milestone
   */
  reject: portalHrProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const customerId = ctx.portalUser.customerId;

      const milestone = await db
        .select({
          id: contractorMilestones.id,
          contractorId: contractorMilestones.contractorId,
          status: contractorMilestones.status,
        })
        .from(contractorMilestones)
        .where(eq(contractorMilestones.id, input.id))
        .limit(1);

      if (milestone.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Milestone not found" });
      }

      const contractor = await db
        .select({ id: contractors.id })
        .from(contractors)
        .where(and(eq(contractors.id, milestone[0].contractorId), eq(contractors.customerId, customerId)))
        .limit(1);

      if (contractor.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      if (milestone[0].status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only submitted milestones can be rejected" });
      }

       await db
        .update(contractorMilestones)
        .set({
          status: "client_rejected" as any,
          clientApprovedBy: ctx.portalUser.contactId,
          clientApprovedAt: new Date(),
        })
        .where(eq(contractorMilestones.id, input.id));
      return { success: true };
    }),
});
