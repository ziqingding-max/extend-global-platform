/**
 * Portal Adjustments Router
 *
 * Unified adjustments for both EOR (employees) and AOR (contractors).
 * All queries are SCOPED to ctx.portalUser.customerId.
 * Portal users can view and submit adjustments.
 * Adjustments are editable until locked (monthly cutoff on 4th).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, count, desc } from "drizzle-orm";
import {
  protectedPortalProcedure,
  portalHrProcedure,
  portalRouter,
} from "../portalTrpc";
import { getDb } from "../../db";
import {
  adjustments,
  employees,
  payrollRuns,
  payrollItems,
  contractorAdjustments,
  contractors,
} from "../../../drizzle/schema";
import { storagePut } from "../../storage";
import { enforceCutoff, checkCutoffPassed } from "../../utils/cutoff";

export const portalAdjustmentsRouter = portalRouter({
  /**
   * List adjustments — returns both EOR and AOR adjustments, scoped to customerId
   */
  list: protectedPortalProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.string().optional(),
        effectiveMonth: z.string().optional(),
        workerType: z.enum(["all", "employee", "contractor"]).default("all"),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const cid = ctx.portalUser.customerId;

      const allItems: any[] = [];

      // ── EOR adjustments ──
      if (input.workerType === "all" || input.workerType === "employee") {
        const eorConditions = [eq(adjustments.customerId, cid)];
        if (input.status) {
          eorConditions.push(eq(adjustments.status, input.status as any));
        }
        if (input.effectiveMonth) {
          eorConditions.push(eq(adjustments.effectiveMonth, input.effectiveMonth as any));
        }

        const eorItems = await db
          .select({
            id: adjustments.id,
            adjustmentType: adjustments.adjustmentType,
            category: adjustments.category,
            amount: adjustments.amount,
            currency: adjustments.currency,
            effectiveMonth: adjustments.effectiveMonth,
            description: adjustments.description,
            status: adjustments.status,
            receiptFileUrl: adjustments.receiptFileUrl,
            clientApprovedBy: adjustments.clientApprovedBy,
            clientApprovedAt: adjustments.clientApprovedAt,
            clientRejectionReason: adjustments.clientRejectionReason,
            adminApprovedBy: adjustments.adminApprovedBy,
            adminApprovedAt: adjustments.adminApprovedAt,
            adminRejectionReason: adjustments.adminRejectionReason,
            createdAt: adjustments.createdAt,
            updatedAt: adjustments.updatedAt,
            workerFirstName: employees.firstName,
            workerLastName: employees.lastName,
          })
          .from(adjustments)
          .innerJoin(employees, eq(adjustments.employeeId, employees.id))
          .where(and(...eorConditions))
          .orderBy(sql`${adjustments.updatedAt} DESC`);

        for (const item of eorItems) {
          allItems.push({
            ...item,
            workerType: "employee" as const,
            workerLabel: "EOR",
            // Keep backward compat fields
            employeeFirstName: item.workerFirstName,
            employeeLastName: item.workerLastName,
          });
        }
      }

      // ── AOR adjustments ──
      if (input.workerType === "all" || input.workerType === "contractor") {
        const aorConditions = [eq(contractorAdjustments.customerId, cid)];
        if (input.status) {
          aorConditions.push(eq(contractorAdjustments.status, input.status as any));
        }
        if (input.effectiveMonth) {
          aorConditions.push(eq(contractorAdjustments.effectiveMonth, input.effectiveMonth as any));
        }

        const aorItems = await db
          .select({
            id: contractorAdjustments.id,
            adjustmentType: contractorAdjustments.type,
            amount: contractorAdjustments.amount,
            currency: contractorAdjustments.currency,
            effectiveMonth: contractorAdjustments.effectiveMonth,
            description: contractorAdjustments.description,
            status: contractorAdjustments.status,
            receiptFileUrl: contractorAdjustments.attachmentUrl,
            clientApprovedBy: contractorAdjustments.clientApprovedBy,
            clientApprovedAt: contractorAdjustments.clientApprovedAt,
            clientRejectionReason: contractorAdjustments.clientRejectionReason,
            adminApprovedBy: contractorAdjustments.adminApprovedBy,
            adminApprovedAt: contractorAdjustments.adminApprovedAt,
            adminRejectionReason: contractorAdjustments.adminRejectionReason,
            createdAt: contractorAdjustments.createdAt,
            updatedAt: contractorAdjustments.updatedAt,
            workerFirstName: contractors.firstName,
            workerLastName: contractors.lastName,
          })
          .from(contractorAdjustments)
          .innerJoin(contractors, eq(contractorAdjustments.contractorId, contractors.id))
          .where(and(...aorConditions))
          .orderBy(sql`${contractorAdjustments.updatedAt} DESC`);

        for (const item of aorItems) {
          allItems.push({
            ...item,
            category: null,
            workerType: "contractor" as const,
            workerLabel: "AOR",
            employeeFirstName: item.workerFirstName,
            employeeLastName: item.workerLastName,
          });
        }
      }

      // Sort combined by updatedAt desc
      allItems.sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      });

      // Paginate
      const total = allItems.length;
      const offset = (input.page - 1) * input.pageSize;
      const items = allItems.slice(offset, offset + input.pageSize);

      return { items, total };
    }),

  /**
   * Create adjustment — supports both EOR (employee) and AOR (contractor)
   * workerType + workerId determine which table to insert into
   */
  create: portalHrProcedure
    .input(
      z.object({
        workerType: z.enum(["employee", "contractor"]),
        workerId: z.number(),
        adjustmentType: z.enum(["bonus", "allowance", "deduction", "other"]),
        category: z.enum(["housing", "transport", "meals", "performance_bonus", "year_end_bonus", "overtime", "travel_reimbursement", "equipment_reimbursement", "absence_deduction", "other"]).optional(),
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

      // Normalize effectiveMonth to YYYY-MM-01 format
      const parts = input.effectiveMonth.split("-");
      if (parts.length < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid effective month format" });
      }
      const normalizedMonth = `${parts[0]}-${parts[1].padStart(2, "0")}-01`;

      if (input.workerType === "employee") {
        // ── EOR path ──
        const [emp] = await db
          .select({ id: employees.id, country: employees.country, salaryCurrency: employees.salaryCurrency })
          .from(employees)
          .where(and(eq(employees.id, input.workerId), eq(employees.customerId, cid)));

        if (!emp) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
        }

        // Check if payroll run for this month is already approved/locked
        const [existingPayroll] = await db
          .select({ id: payrollRuns.id, status: payrollRuns.status })
          .from(payrollRuns)
          .innerJoin(payrollItems, eq(payrollRuns.id, payrollItems.payrollRunId))
          .where(
            and(
              eq(payrollRuns.countryCode, emp.country),
              eq(payrollRuns.payrollMonth, normalizedMonth),
              eq(payrollItems.employeeId, input.workerId)
            )
          )
          .limit(1);

        if (existingPayroll && (existingPayroll.status === "approved" || existingPayroll.status === "pending_approval")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Payroll run for ${normalizedMonth.substring(0, 7)} is already ${existingPayroll.status}. Adjustments cannot be added.`,
          });
        }

        // Enforce cutoff
        await enforceCutoff(normalizedMonth, "portal_hr", "create adjustment");

        // Use employee's salary currency (locked)
        const currency = emp.salaryCurrency || input.currency;

        await db.insert(adjustments).values({
          employeeId: input.workerId,
          customerId: cid,
          adjustmentType: input.adjustmentType,
          category: input.category || null,
          amount: input.amount,
          currency,
          effectiveMonth: normalizedMonth,
          description: input.description || null,
          receiptFileUrl: input.receiptFileUrl || null,
          receiptFileKey: input.receiptFileKey || null,
          status: "submitted",
        });
      } else {
        // ── AOR path ──
        const [con] = await db
          .select({ id: contractors.id, currency: contractors.currency })
          .from(contractors)
          .where(and(eq(contractors.id, input.workerId), eq(contractors.customerId, cid)));

        if (!con) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contractor not found" });
        }

        // Map adjustment types: EOR has bonus/allowance/deduction/other, AOR has bonus/expense/deduction
        let aorType: "bonus" | "expense" | "deduction" = "bonus";
        if (input.adjustmentType === "deduction") {
          aorType = "deduction";
        } else if (input.adjustmentType === "allowance" || input.adjustmentType === "other") {
          aorType = "expense";
        } else {
          aorType = "bonus";
        }

        // Use contractor's currency (locked)
        const currency = con.currency;

        await db.insert(contractorAdjustments).values({
          contractorId: input.workerId,
          customerId: cid,
          type: aorType,
          description: input.description && input.description.trim() ? input.description.trim() : "Adjustment",
          amount: input.amount,
          currency,
          effectiveMonth: normalizedMonth,
          attachmentUrl: input.receiptFileUrl && input.receiptFileUrl.trim() ? input.receiptFileUrl.trim() : null,
          attachmentFileKey: input.receiptFileKey && input.receiptFileKey.trim() ? input.receiptFileKey.trim() : null,
          status: "submitted",
        });
      }

      return { success: true };
    }),

  /**
   * Update adjustment — only if status is 'submitted' (not locked)
   * Supports both EOR and AOR
   */
  update: portalHrProcedure
    .input(
      z.object({
        id: z.number(),
        workerType: z.enum(["employee", "contractor"]).default("employee"),
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

      if (input.workerType === "contractor") {
        const [adj] = await db
          .select({ id: contractorAdjustments.id, status: contractorAdjustments.status })
          .from(contractorAdjustments)
          .where(and(eq(contractorAdjustments.id, input.id), eq(contractorAdjustments.customerId, cid)));

        if (!adj) throw new TRPCError({ code: "NOT_FOUND", message: "Adjustment not found" });
        if (adj.status !== "submitted") throw new TRPCError({ code: "FORBIDDEN", message: "Adjustment is locked and cannot be edited" });

        const updates: Record<string, any> = {};
        if (input.amount !== undefined) updates.amount = input.amount;
        if (input.description !== undefined) updates.description = input.description;
        if (input.receiptFileUrl !== undefined) updates.attachmentUrl = input.receiptFileUrl;
        if (input.receiptFileKey !== undefined) updates.attachmentFileKey = input.receiptFileKey;

        if (Object.keys(updates).length > 0) {
          await db.update(contractorAdjustments).set(updates).where(eq(contractorAdjustments.id, input.id));
        }
      } else {
        const [adj] = await db
          .select({ id: adjustments.id, status: adjustments.status })
          .from(adjustments)
          .where(and(eq(adjustments.id, input.id), eq(adjustments.customerId, cid)));

        if (!adj) throw new TRPCError({ code: "NOT_FOUND", message: "Adjustment not found" });
        if (adj.status !== "submitted") throw new TRPCError({ code: "FORBIDDEN", message: "Adjustment is locked and cannot be edited" });

        const updates: Record<string, any> = {};
        if (input.amount !== undefined) updates.amount = input.amount;
        if (input.description !== undefined) updates.description = input.description;
        if (input.receiptFileUrl !== undefined) updates.receiptFileUrl = input.receiptFileUrl;
        if (input.receiptFileKey !== undefined) updates.receiptFileKey = input.receiptFileKey;

        if (Object.keys(updates).length > 0) {
          await db.update(adjustments).set(updates).where(eq(adjustments.id, input.id));
        }
      }

      return { success: true };
    }),

  /**
   * Delete adjustment — only if status is 'submitted'
   */
  delete: portalHrProcedure
    .input(z.object({
      id: z.number(),
      workerType: z.enum(["employee", "contractor"]).default("employee"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      if (input.workerType === "contractor") {
        const [adj] = await db
          .select({ id: contractorAdjustments.id, status: contractorAdjustments.status })
          .from(contractorAdjustments)
          .where(and(eq(contractorAdjustments.id, input.id), eq(contractorAdjustments.customerId, cid)));

        if (!adj) throw new TRPCError({ code: "NOT_FOUND", message: "Adjustment not found" });
        if (adj.status !== "submitted") throw new TRPCError({ code: "FORBIDDEN", message: "Adjustment is locked and cannot be deleted" });

        await db.delete(contractorAdjustments).where(eq(contractorAdjustments.id, input.id));
      } else {
        const [adj] = await db
          .select({ id: adjustments.id, status: adjustments.status })
          .from(adjustments)
          .where(and(eq(adjustments.id, input.id), eq(adjustments.customerId, cid)));

        if (!adj) throw new TRPCError({ code: "NOT_FOUND", message: "Adjustment not found" });
        if (adj.status !== "submitted") throw new TRPCError({ code: "FORBIDDEN", message: "Adjustment is locked and cannot be deleted" });

        await db.delete(adjustments).where(eq(adjustments.id, input.id));
      }

      return { success: true };
    }),

  /**
   * Client approve adjustment — HR manager / admin approves a submitted adjustment
   */
  approve: portalHrProcedure
    .input(z.object({
      id: z.number(),
      workerType: z.enum(["employee", "contractor"]).default("employee"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      if (input.workerType === "contractor") {
        const [adj] = await db
          .select({ id: contractorAdjustments.id, status: contractorAdjustments.status })
          .from(contractorAdjustments)
          .where(and(eq(contractorAdjustments.id, input.id), eq(contractorAdjustments.customerId, cid)));

        if (!adj) throw new TRPCError({ code: "NOT_FOUND", message: "Adjustment not found" });
        if (adj.status !== "submitted") throw new TRPCError({ code: "FORBIDDEN", message: "Only submitted adjustments can be approved" });

        await db.update(contractorAdjustments).set({
          status: "client_approved" as any,
          clientApprovedBy: ctx.portalUser.contactId,
          clientApprovedAt: new Date(),
        }).where(eq(contractorAdjustments.id, input.id));
      } else {
        const [adj] = await db
          .select({ id: adjustments.id, status: adjustments.status })
          .from(adjustments)
          .where(and(eq(adjustments.id, input.id), eq(adjustments.customerId, cid)));

        if (!adj) throw new TRPCError({ code: "NOT_FOUND", message: "Adjustment not found" });
        if (adj.status !== "submitted") throw new TRPCError({ code: "FORBIDDEN", message: "Only submitted adjustments can be approved" });

        await db.update(adjustments).set({
          status: "client_approved",
          clientApprovedBy: ctx.portalUser.contactId,
          clientApprovedAt: new Date(),
        }).where(eq(adjustments.id, input.id));
      }

      return { success: true };
    }),

  /**
   * Client reject adjustment
   */
  reject: portalHrProcedure
    .input(z.object({
      id: z.number(),
      workerType: z.enum(["employee", "contractor"]).default("employee"),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      if (input.workerType === "contractor") {
        const [adj] = await db
          .select({ id: contractorAdjustments.id, status: contractorAdjustments.status })
          .from(contractorAdjustments)
          .where(and(eq(contractorAdjustments.id, input.id), eq(contractorAdjustments.customerId, cid)));

        if (!adj) throw new TRPCError({ code: "NOT_FOUND", message: "Adjustment not found" });
        if (adj.status !== "submitted") throw new TRPCError({ code: "FORBIDDEN", message: "Only submitted adjustments can be rejected" });

        await db.update(contractorAdjustments).set({
          status: "client_rejected" as any,
          clientApprovedBy: ctx.portalUser.contactId,
          clientApprovedAt: new Date(),
          clientRejectionReason: input.reason || null,
        }).where(eq(contractorAdjustments.id, input.id));
      } else {
        const [adj] = await db
          .select({ id: adjustments.id, status: adjustments.status })
          .from(adjustments)
          .where(and(eq(adjustments.id, input.id), eq(adjustments.customerId, cid)));

        if (!adj) throw new TRPCError({ code: "NOT_FOUND", message: "Adjustment not found" });
        if (adj.status !== "submitted") throw new TRPCError({ code: "FORBIDDEN", message: "Only submitted adjustments can be rejected" });

        await db.update(adjustments).set({
          status: "client_rejected",
          clientApprovedBy: ctx.portalUser.contactId,
          clientApprovedAt: new Date(),
          clientRejectionReason: input.reason || null,
        }).where(eq(adjustments.id, input.id));
      }

      return { success: true };
    }),

  /**
   * Upload receipt file for an adjustment
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
      const fileKey = `adjustment-receipts/${Date.now()}-${randomSuffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
      return { url, fileKey };
    }),
});
