import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import { operationsManagerProcedure, userProcedure } from "../procedures";
import {
  createReimbursement,
  listReimbursements,
  getReimbursementById,
  updateReimbursement,
  deleteReimbursement,
  logAuditAction,
  getEmployeeById,
} from "../db";
import { storagePut, storageGet, storageDownload } from "../storage";

export const reimbursementsRouter = router({
  list: userProcedure
    .input(
      z.object({
        customerId: z.number().optional(),
        employeeId: z.number().optional(),
        status: z.string().optional(),
        category: z.string().optional(),
        effectiveMonth: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const page = Math.floor(input.offset / input.limit) + 1;
      const { data: items, total } = await listReimbursements({
        page,
        pageSize: input.limit,
        customerId: input.customerId,
        employeeId: input.employeeId,
        status: input.status,
        category: input.category,
        effectiveMonth: input.effectiveMonth,
      });

      // Map to signed URLs for viewing receipts
      // Note: We also provide a separate download endpoint for proxying if signed URLs fail
      const processedItems = await Promise.all(items.map(async (item) => {
        if (item.receiptFileKey) {
          try {
            const { url } = await storageGet(item.receiptFileKey);
            return { ...item, receiptFileUrl: url };
          } catch (e) {
            return item;
          }
        }
        return item;
      }));
      
      return { data: processedItems, total };
    }),

  downloadReceipt: userProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const item = await getReimbursementById(input.id);
      if (!item || !item.receiptFileKey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found" });
      }

      try {
        const { content, contentType } = await storageDownload(item.receiptFileKey);
        return {
          content: content.toString("base64"),
          filename: item.receiptFileKey.split("/").pop() || "receipt.pdf",
          contentType: contentType || "application/pdf"
        };
      } catch (error) {
        console.error("Failed to download receipt:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download receipt" });
      }
    }),

  get: userProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getReimbursementById(input.id);
    }),

  create: operationsManagerProcedure
    .input(
      z.object({
        employeeId: z.number(),
        category: z.enum([
          "travel", "equipment", "meals", "transportation",
          "medical", "education", "office_supplies", "communication", "other",
        ]),
        description: z.string().optional(),
        amount: z.string(),
        effectiveMonth: z.string(),
        receiptFileUrl: z.string().optional(),
        receiptFileKey: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const parts = input.effectiveMonth.split("-");
      const normalizedMonth = `${parts[0]}-${parts[1].padStart(2, "0")}-01`;

      const employee = await getEmployeeById(input.employeeId);
      if (!employee) throw new TRPCError({ code: 'BAD_REQUEST', message: "Employee not found" });

      const currency = employee.salaryCurrency || "USD";
      const customerId = employee.customerId;

      if (!input.receiptFileUrl) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Reimbursement claims require a receipt attachment." });
      }

      const result = await createReimbursement({
        employeeId: input.employeeId,
        customerId,
        category: input.category,
        description: input.description,
        amount: input.amount,
        currency,
        effectiveMonth: normalizedMonth,
        receiptFileUrl: input.receiptFileUrl,
        receiptFileKey: input.receiptFileKey,
        status: "submitted",
        submittedBy: ctx.user.id,
      });

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        action: "create",
        entityType: "reimbursement",
        changes: JSON.stringify({ ...input, customerId, currency }),
      });

      return result;
    }),

  update: operationsManagerProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          category: z.enum([
            "travel", "equipment", "meals", "transportation",
            "medical", "education", "office_supplies", "communication", "other",
          ]).optional(),
          description: z.string().optional(),
          amount: z.string().optional(),
          receiptFileUrl: z.string().optional().nullable(),
          receiptFileKey: z.string().optional().nullable(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await getReimbursementById(input.id);
      if (!existing) throw new TRPCError({ code: 'BAD_REQUEST', message: "Reimbursement not found" });
      if (existing.status === "locked" || existing.status === "admin_approved") {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Cannot edit a locked/approved reimbursement" });
      }

      await updateReimbursement(input.id, input.data as any);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        action: "update",
        entityType: "reimbursement",
        entityId: input.id,
        changes: JSON.stringify(input.data),
      });

      return { success: true };
    }),

  delete: operationsManagerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getReimbursementById(input.id);
      if (!existing) throw new TRPCError({ code: 'BAD_REQUEST', message: "Reimbursement not found" });
      if (existing.status === "locked") throw new TRPCError({ code: 'BAD_REQUEST', message: "Cannot delete a locked reimbursement" });

      await deleteReimbursement(input.id);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        action: "delete",
        entityType: "reimbursement",
        entityId: input.id,
      });

      return { success: true };
    }),

  /**
   * Admin approve — confirms a submitted reimbursement
   */
  adminApprove: operationsManagerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getReimbursementById(input.id);
      if (!existing) throw new TRPCError({ code: 'BAD_REQUEST', message: "Reimbursement not found" });
      if (existing.status !== "client_approved") {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Only client-approved reimbursements can be admin-approved. Current status: " + existing.status });
      }

      await updateReimbursement(input.id, {
        status: "admin_approved",
        adminApprovedBy: ctx.user.id,
        adminApprovedAt: new Date(),
      } as any);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        action: "admin_approve",
        entityType: "reimbursement",
        entityId: input.id,
      });

      return { success: true };
    }),

  /**
   * Admin reject — rejects a client-approved reimbursement
   */
  adminReject: operationsManagerProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getReimbursementById(input.id);
      if (!existing) throw new TRPCError({ code: 'BAD_REQUEST', message: "Reimbursement not found" });
      if (existing.status !== "client_approved") {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Only client-approved reimbursements can be admin-rejected. Current status: " + existing.status });
      }

      await updateReimbursement(input.id, {
        status: "admin_rejected",
        adminApprovedBy: ctx.user.id,
        adminApprovedAt: new Date(),
        adminRejectionReason: input.reason || null,
      } as any);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        action: "admin_reject",
        entityType: "reimbursement",
        entityId: input.id,
        changes: JSON.stringify({ reason: input.reason }),
      });

      return { success: true };
    }),

  uploadReceipt: operationsManagerProcedure
    .input(
      z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("application/pdf"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      if (fileBuffer.length > 20 * 1024 * 1024) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "File size must be under 20MB" });
      }

      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `reimbursement-receipts/${Date.now()}-${randomSuffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        action: "upload_receipt",
        entityType: "reimbursement",
        changes: JSON.stringify({ fileName: input.fileName, fileKey }),
      });

      return { url, fileKey };
    }),
});
