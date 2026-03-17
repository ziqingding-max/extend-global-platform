/**
 * Portal Contractors Router
 *
 * All queries are SCOPED to ctx.portalUser.customerId.
 * Portal users can view contractors, submit AOR onboarding requests.
 * They CANNOT see admin-only fields (internalNotes, cost data).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, like, count, desc, or } from "drizzle-orm";
import {
  protectedPortalProcedure,
  portalRouter,
} from "../portalTrpc";
import { getDb } from "../../db";
import { notificationService } from "../../services/notificationService";
import {
  contractors,
  contractorMilestones,
  contractorAdjustments,
  customers,
} from "../../../drizzle/schema";

// Fields visible to portal users
const PORTAL_CONTRACTOR_LIST_FIELDS = {
  id: contractors.id,
  contractorCode: contractors.contractorCode,
  firstName: contractors.firstName,
  lastName: contractors.lastName,
  email: contractors.email,
  phone: contractors.phone,
  country: contractors.country,
  jobTitle: contractors.jobTitle,
  department: contractors.department,
  startDate: contractors.startDate,
  endDate: contractors.endDate,
  status: contractors.status,
  currency: contractors.currency,
  paymentFrequency: contractors.paymentFrequency,
  rateAmount: contractors.rateAmount,
  createdAt: contractors.createdAt,
};

export const portalContractorsRouter = portalRouter({
  list: protectedPortalProcedure
    .input(
      z.object({
        status: z.string().optional(),
        search: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const customerId = ctx.portalUser.customerId;
      const conditions = [eq(contractors.customerId, customerId)];

      if (input.status) {
        conditions.push(eq(contractors.status, input.status as any));
      }
      if (input.search) {
        conditions.push(
          or(
            like(contractors.firstName, `%${input.search}%`),
            like(contractors.lastName, `%${input.search}%`),
            like(contractors.email, `%${input.search}%`),
            like(contractors.contractorCode, `%${input.search}%`)
          )!
        );
      }

      const where = and(...conditions);
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalResult] = await Promise.all([
        db
          .select(PORTAL_CONTRACTOR_LIST_FIELDS)
          .from(contractors)
          .where(where)
          .limit(input.pageSize)
          .offset(offset)
          .orderBy(desc(contractors.createdAt)),
        db
          .select({ count: count() })
          .from(contractors)
          .where(where),
      ]);

      return {
        items,
        total: totalResult[0]?.count || 0,
      };
    }),

  getById: protectedPortalProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const customerId = ctx.portalUser.customerId;

      const result = await db
        .select({
          id: contractors.id,
          contractorCode: contractors.contractorCode,
          firstName: contractors.firstName,
          lastName: contractors.lastName,
          email: contractors.email,
          phone: contractors.phone,
          dateOfBirth: contractors.dateOfBirth,
          nationality: contractors.nationality,
          idNumber: contractors.idNumber,
          idType: contractors.idType,
          address: contractors.address,
          city: contractors.city,
          state: contractors.state,
          country: contractors.country,
          postalCode: contractors.postalCode,
          jobTitle: contractors.jobTitle,
          department: contractors.department,
          startDate: contractors.startDate,
          endDate: contractors.endDate,
          status: contractors.status,
          currency: contractors.currency,
          paymentFrequency: contractors.paymentFrequency,
          rateAmount: contractors.rateAmount,
          bankDetails: contractors.bankDetails,
          notes: contractors.notes,
          createdAt: contractors.createdAt,
          updatedAt: contractors.updatedAt,
        })
        .from(contractors)
        .where(and(eq(contractors.id, input.id), eq(contractors.customerId, customerId)))
        .limit(1);

      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contractor not found" });
      }

      return result[0];
    }),

  // Submit AOR onboarding request (creates a new contractor with pending_review status)
  submitOnboarding: protectedPortalProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        dateOfBirth: z.string().optional(),
        nationality: z.string().optional(),
        idType: z.string().optional(),
        idNumber: z.string().optional(),
        address: z.string().optional(),
        country: z.string().min(1),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        department: z.string().optional(),
        jobTitle: z.string().min(1),
        startDate: z.string().min(1),
        endDate: z.string().optional(),
        paymentFrequency: z.enum(["monthly", "semi_monthly", "milestone"]).default("monthly"),
        rateAmount: z.string().optional(),
        currency: z.string().default("USD"),
        bankDetails: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const customerId = ctx.portalUser.customerId;

      // Generate contractor code
      const existing = await db
        .select({ count: count() })
        .from(contractors);
      const nextNum = (existing[0]?.count || 0) + 1;
      const contractorCode = `CTR-${String(nextNum).padStart(4, "0")}`;

      const result = await db
        .insert(contractors)
        .values({
          contractorCode,
          customerId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone || null,
          dateOfBirth: input.dateOfBirth || null,
          nationality: input.nationality || null,
          idType: input.idType || null,
          idNumber: input.idNumber || null,
          address: input.address || null,
          city: input.city || null,
          state: input.state || null,
          country: input.country,
          postalCode: input.postalCode || null,
          department: input.department || null,
          jobTitle: input.jobTitle,
          startDate: input.startDate,
          endDate: input.endDate || null,
          status: "pending_review",
          paymentFrequency: input.paymentFrequency,
          rateAmount: input.rateAmount || null,
          currency: input.currency,
          bankDetails: input.bankDetails || null,
        })
        .returning();

      return { contractorId: result[0]?.id };
    }),

  // Delete a pending_review contractor (only allowed before admin approval)
  delete: protectedPortalProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const customerId = ctx.portalUser.customerId;

      // Verify the contractor exists, belongs to this customer, and is in pending_review status
      const [existing] = await db
        .select({ id: contractors.id, status: contractors.status })
        .from(contractors)
        .where(and(eq(contractors.id, input.id), eq(contractors.customerId, customerId)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contractor not found" });
      }

      if (existing.status !== "pending_review") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only pending_review contractors can be deleted",
        });
      }

      // Delete related milestones and adjustments first
      await db.delete(contractorMilestones).where(eq(contractorMilestones.contractorId, input.id));
      await db.delete(contractorAdjustments).where(eq(contractorAdjustments.contractorId, input.id));

      // Delete the contractor
      await db.delete(contractors).where(eq(contractors.id, input.id));

      return { success: true };
    }),

  /**
   * Request termination for an active contractor.
   * Portal clients can request termination; admin receives notification to process.
   * Only available for contractors in 'active' status.
   */
  requestTermination: protectedPortalProcedure
    .input(
      z.object({
        contractorId: z.number(),
        endDate: z.string().min(1, "End date is required"),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Verify the contractor belongs to this customer and is active
      const [ctr] = await db
        .select({
          id: contractors.id,
          status: contractors.status,
          firstName: contractors.firstName,
          lastName: contractors.lastName,
          contractorCode: contractors.contractorCode,
          country: contractors.country,
        })
        .from(contractors)
        .where(and(eq(contractors.id, input.contractorId), eq(contractors.customerId, cid)))
        .limit(1);

      if (!ctr) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contractor not found" });
      }

      if (ctr.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only active contractors can be submitted for termination request",
        });
      }

      // Get customer name for notification
      const [customer] = await db
        .select({ companyName: customers.companyName })
        .from(customers)
        .where(eq(customers.id, cid));

      // Send notification to admin
      notificationService.send({
        type: "contractor_termination_request",
        customerId: cid,
        data: {
          contractorId: ctr.id,
          contractorName: `${ctr.firstName} ${ctr.lastName}`,
          contractorCode: ctr.contractorCode,
          country: ctr.country,
          requestedEndDate: input.endDate,
          reason: input.reason || "No reason provided",
          requestedBy: ctx.portalUser.contactName || ctx.portalUser.email,
          customerName: customer?.companyName || "Unknown",
        },
      }).catch(err => console.error("Failed to send contractor termination request notification:", err));

      return { success: true, message: "Termination request submitted. Admin will review and process." };
    }),
});
