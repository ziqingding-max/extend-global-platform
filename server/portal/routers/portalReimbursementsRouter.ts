/**
 * Portal Reimbursements Router
 *
 * All queries are SCOPED to ctx.portalUser.customerId.
 * Portal users can view, create, approve/reject reimbursements.
 * Reimbursements follow the approval workflow:
 *   submitted → client_approved/client_rejected → admin_approved/admin_rejected → locked
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, count } from "drizzle-orm";
import {
  protectedPortalProcedure,
  portalHrProcedure,
  portalRouter,
} from "../portalTrpc";
import { getDb } from "../../db";
import { reimbursements, employees, payrollRuns, payrollItems } from "../../../drizzle/schema";
import { storagePut } from "../../storage";
import { enforceCutoff } from "../../utils/cutoff";

export const portalReimbursementsRouter = portalRouter({
  /**
   * List reimbursements — scoped to customerId
   */
  list: protectedPortalProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.string().optional(),
        effectiveMonth: z.string().optional(),
        employeeId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const cid = ctx.portalUser.customerId;

      const conditions = [eq(reimbursements.customerId, cid)];

      if (input.status) {
        conditions.push(eq(reimbursements.status, input.status as any));
      }
      if (input.effectiveMonth) {
        conditions.push(eq(reimbursements.effectiveMonth, input.effectiveMonth as any));
      }
      if (input.employeeId) {
        conditions.push(eq(reimbursements.employeeId, input.employeeId));
      }

      const where = and(...conditions);

      const [totalResult] = await db
        .select({ count: count() })
        .from(reimbursements)
        .where(where);

      const items = await db
        .select({
          id: reimbursements.id,
          employeeId: reimbursements.employeeId,
          category: reimbursements.category,
          amount: reimbursements.amount,
          currency: reimbursements.currency,
          effectiveMonth: reimbursements.effectiveMonth,
          description: reimbursements.description,
          status: reimbursements.status,
          receiptFileUrl: reimbursements.receiptFileUrl,
          clientApprovedBy: reimbursements.clientApprovedBy,
          clientApprovedAt: reimbursements.clientApprovedAt,
          clientRejectionReason: reimbursements.clientRejectionReason,
          adminApprovedBy: reimbursements.adminApprovedBy,
          adminApprovedAt: reimbursements.adminApprovedAt,
          adminRejectionReason: reimbursements.adminRejectionReason,
          createdAt: reimbursements.createdAt,
          updatedAt: reimbursements.updatedAt,
          // Join employee name
          employeeFirstName: employees.firstName,
          employeeLastName: employees.lastName,
        })
        .from(reimbursements)
        .innerJoin(employees, eq(reimbursements.employeeId, employees.id))
        .where(where)
        .orderBy(sql`${reimbursements.updatedAt} DESC`)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return {
        items,
        total: totalResult?.count ?? 0,
      };
    }),

  /**
   * Create reimbursement — only HR managers and admins
   */
  create: portalHrProcedure
    .input(
      z.object({
        employeeId: z.number(),
        category: z.enum([
          "travel", "equipment", "meals", "transportation",
          "medical", "education", "office_supplies", "communication", "other",
        ]),
        amount: z.string(),
        currency: z.string().default("USD"),
        effectiveMonth: z.string(),
        description: z.string().optional(),
        receiptFileUrl: z.string().optional(),
        receiptFileKey: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Verify employee belongs to this customer
      const [emp] = await db
        .select({ id: employees.id, country: employees.country, salaryCurrency: employees.salaryCurrency })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.customerId, cid)));

      if (!emp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      // Require receipt for reimbursements
      if (!input.receiptFileUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Receipt is required for reimbursement claims" });
      }

      // Normalize effectiveMonth to YYYY-MM-01 format
      const parts = input.effectiveMonth.split("-");
      if (parts.length < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid effective month format" });
      }
      const normalizedMonth = `${parts[0]}-${parts[1].padStart(2, "0")}-01`;

      // Check if payroll run for this month is already approved/locked
      const [existingPayroll] = await db
        .select({ id: payrollRuns.id, status: payrollRuns.status })
        .from(payrollRuns)
        .innerJoin(payrollItems, eq(payrollRuns.id, payrollItems.payrollRunId))
        .where(
          and(
            eq(payrollRuns.countryCode, emp.country),
            eq(payrollRuns.payrollMonth, normalizedMonth),
            eq(payrollItems.employeeId, input.employeeId)
          )
        )
        .limit(1);

      if (existingPayroll && (existingPayroll.status === "approved" || existingPayroll.status === "pending_approval")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Payroll run for ${normalizedMonth.substring(0, 7)} is already ${existingPayroll.status}. Reimbursements cannot be added.`,
        });
      }

      // Enforce cutoff — prevent submissions after cutoff date
      await enforceCutoff(normalizedMonth, "portal_hr", "create reimbursement");

      // Use employee's salary currency
      const currency = emp.salaryCurrency || input.currency;

      await db.insert(reimbursements).values({
        employeeId: input.employeeId,
        customerId: cid,
        category: input.category,
        amount: input.amount,
        currency,
        effectiveMonth: normalizedMonth,
        description: input.description || null,
        receiptFileUrl: input.receiptFileUrl || null,
        receiptFileKey: input.receiptFileKey || null,
        status: "submitted",
        submittedBy: ctx.portalUser.contactId,
      });

      return { success: true };
    }),

  /**
   * Update reimbursement — only if status is 'submitted' (not yet approved)
   */
  update: portalHrProcedure
    .input(
      z.object({
        id: z.number(),
        amount: z.string().optional(),
        description: z.string().optional(),
        receiptFileUrl: z.string().optional(),
        receiptFileKey: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      const [reimb] = await db
        .select({ id: reimbursements.id, status: reimbursements.status })
        .from(reimbursements)
        .where(and(eq(reimbursements.id, input.id), eq(reimbursements.customerId, cid)));

      if (!reimb) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Reimbursement not found" });
      }

      if (reimb.status !== "submitted") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Reimbursement cannot be edited after approval" });
      }

      const updates: Record<string, any> = {};
      if (input.amount !== undefined) updates.amount = input.amount;
      if (input.description !== undefined) updates.description = input.description;
      if (input.receiptFileUrl !== undefined) updates.receiptFileUrl = input.receiptFileUrl;
      if (input.receiptFileKey !== undefined) updates.receiptFileKey = input.receiptFileKey;

      if (Object.keys(updates).length > 0) {
        await db.update(reimbursements).set(updates).where(eq(reimbursements.id, input.id));
      }

      return { success: true };
    }),

  /**
   * Delete reimbursement — only if status is 'submitted'
   */
  delete: portalHrProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      const [reimb] = await db
        .select({ id: reimbursements.id, status: reimbursements.status })
        .from(reimbursements)
        .where(and(eq(reimbursements.id, input.id), eq(reimbursements.customerId, cid)));

      if (!reimb) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Reimbursement not found" });
      }

      if (reimb.status !== "submitted") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Reimbursement cannot be deleted after approval" });
      }

      await db.delete(reimbursements).where(eq(reimbursements.id, input.id));
      return { success: true };
    }),

  /**
   * Client approve reimbursement — HR manager / admin approves a submitted reimbursement
   */
  approve: portalHrProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      const [reimb] = await db
        .select({ id: reimbursements.id, status: reimbursements.status })
        .from(reimbursements)
        .where(and(eq(reimbursements.id, input.id), eq(reimbursements.customerId, cid)));

      if (!reimb) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Reimbursement not found" });
      }

      if (reimb.status !== "submitted") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only submitted reimbursements can be approved" });
      }

      await db.update(reimbursements).set({
        status: "client_approved",
        clientApprovedBy: ctx.portalUser.contactId,
        clientApprovedAt: new Date(),
      }).where(eq(reimbursements.id, input.id));

      return { success: true };
    }),

  /**
   * Client reject reimbursement
   */
  reject: portalHrProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      const [reimb] = await db
        .select({ id: reimbursements.id, status: reimbursements.status })
        .from(reimbursements)
        .where(and(eq(reimbursements.id, input.id), eq(reimbursements.customerId, cid)));

      if (!reimb) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Reimbursement not found" });
      }

      if (reimb.status !== "submitted") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only submitted reimbursements can be rejected" });
      }

      await db.update(reimbursements).set({
        status: "client_rejected",
        clientApprovedBy: ctx.portalUser.contactId,
        clientApprovedAt: new Date(),
        clientRejectionReason: input.reason || null,
      }).where(eq(reimbursements.id, input.id));

      return { success: true };
    }),

  /**
   * Upload receipt file
   */
  uploadReceipt: portalHrProcedure
    .input(
      z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("application/pdf"),
      })
    )
    .mutation(async ({ input }) => {
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      if (fileBuffer.length > 20 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File size must be under 20MB" });
      }
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `reimbursement-receipts/${Date.now()}-${randomSuffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
      return { url, fileKey };
    }),
});
