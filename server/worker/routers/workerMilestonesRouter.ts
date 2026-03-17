/**
 * Worker Milestones Router
 *
 * Contractor-only: view milestones and submit deliverables for client review.
 *
 * Workflow:
 * 1. Client/Admin creates milestone (status: "pending")
 * 2. Worker uploads deliverable and submits (status: "submitted")
 * 3. Client reviews and approves/rejects
 * 4. Admin confirms
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  workerRouter,
  contractorOnlyProcedure,
} from "../workerTrpc";
import { getDb } from "../../services/db/connection";
import { contractorMilestones } from "../../../drizzle/schema";
import { eq, desc, and, count, inArray } from "drizzle-orm";

export const workerMilestonesRouter = workerRouter({
  /**
   * List my milestones with pagination and optional status filter
   */
  list: contractorOnlyProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.enum([
          "pending", "submitted", "client_approved", "client_rejected",
          "admin_approved", "admin_rejected", "locked",
        ]).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const contractorId = ctx.workerUser.contractorId!;
      const offset = (input.page - 1) * input.pageSize;

      const baseCondition = eq(contractorMilestones.contractorId, contractorId);
      const whereCondition = input.status
        ? and(baseCondition, eq(contractorMilestones.status, input.status))
        : baseCondition;

      const [totalResult] = await db
        .select({ count: count() })
        .from(contractorMilestones)
        .where(whereCondition);

      const items = await db
        .select({
          id: contractorMilestones.id,
          title: contractorMilestones.title,
          description: contractorMilestones.description,
          amount: contractorMilestones.amount,
          currency: contractorMilestones.currency,
          status: contractorMilestones.status,
          dueDate: contractorMilestones.dueDate,
          effectiveMonth: contractorMilestones.effectiveMonth,
          deliverableFileUrl: contractorMilestones.deliverableFileUrl,
          deliverableFileName: contractorMilestones.deliverableFileName,
          submissionNote: contractorMilestones.submissionNote,
          completedAt: contractorMilestones.completedAt,
          clientRejectionReason: contractorMilestones.clientRejectionReason,
          adminRejectionReason: contractorMilestones.adminRejectionReason,
          createdAt: contractorMilestones.createdAt,
        })
        .from(contractorMilestones)
        .where(whereCondition)
        .limit(input.pageSize)
        .offset(offset)
        .orderBy(desc(contractorMilestones.createdAt));

      return {
        items,
        total: totalResult?.count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * Get milestone detail
   */
  getById: contractorOnlyProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const contractorId = ctx.workerUser.contractorId!;

      const [milestone] = await db
        .select()
        .from(contractorMilestones)
        .where(
          and(
            eq(contractorMilestones.id, input.id),
            eq(contractorMilestones.contractorId, contractorId)
          )
        );

      if (!milestone) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Milestone not found" });
      }

      return milestone;
    }),

  /**
   * Submit a milestone with deliverable file.
   * Only allowed when status is "pending" or "client_rejected" (resubmission).
   */
  submit: contractorOnlyProcedure
    .input(
      z.object({
        id: z.number(),
        deliverableFileUrl: z.string().url(),
        deliverableFileKey: z.string(),
        deliverableFileName: z.string(),
        submissionNote: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const contractorId = ctx.workerUser.contractorId!;

      // Verify milestone belongs to this contractor
      const [milestone] = await db
        .select()
        .from(contractorMilestones)
        .where(
          and(
            eq(contractorMilestones.id, input.id),
            eq(contractorMilestones.contractorId, contractorId)
          )
        );

      if (!milestone) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Milestone not found" });
      }

      // Only allow submission from "pending" or "client_rejected" (resubmission after rejection)
      if (!["pending", "client_rejected"].includes(milestone.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot submit milestone in "${milestone.status}" status. Only "pending" or "client_rejected" milestones can be submitted.`,
        });
      }

      // Determine effective month (current month if not set)
      const now = new Date();
      const effectiveMonth = milestone.effectiveMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

      await db
        .update(contractorMilestones)
        .set({
          status: "submitted",
          deliverableFileUrl: input.deliverableFileUrl,
          deliverableFileKey: input.deliverableFileKey,
          deliverableFileName: input.deliverableFileName,
          submissionNote: input.submissionNote || null,
          submittedBy: ctx.workerUser.id,
          completedAt: new Date(),
          effectiveMonth,
        })
        .where(eq(contractorMilestones.id, input.id));

      return { success: true };
    }),
});
