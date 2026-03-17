/**
 * Worker Payslips Router
 *
 * Employee-only: view and download payslips.
 *
 * Primary data source: employee_documents table (documentType = "payslip")
 *   — Admin uploads payslip files via the unified document upload flow.
 *
 * Secondary data source: employee_payslips table (isPublished = true)
 *   — Reserved for future structured payslip records with pay period, amounts, etc.
 *
 * Both sources are merged and displayed together in the Worker Portal Payslips page.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  workerRouter,
  employeeOnlyProcedure,
} from "../workerTrpc";
import { getDb } from "../../services/db/connection";
import { employeePayslips, employeeDocuments } from "../../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// Unified payslip item shape returned to frontend
interface PayslipItem {
  id: number;
  source: "payslip" | "document";
  payPeriod: string;
  payDate: string | null;
  fileName: string | null;
  fileUrl: string;
  currency: string | null;
  grossAmount: string | null;
  netAmount: string | null;
  publishedAt: Date | null;
  notes: string | null;
}

export const workerPayslipsRouter = workerRouter({
  /**
   * List payslips — merges employee_documents (documentType=payslip) + employee_payslips
   */
  list: employeeOnlyProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const employeeId = ctx.workerUser.employeeId!;

      // Source 1 (primary): employee_documents with documentType = "payslip"
      const payslipDocs = await db
        .select({
          id: employeeDocuments.id,
          documentName: employeeDocuments.documentName,
          fileUrl: employeeDocuments.fileUrl,
          mimeType: employeeDocuments.mimeType,
          fileSize: employeeDocuments.fileSize,
          notes: employeeDocuments.notes,
          uploadedAt: employeeDocuments.uploadedAt,
        })
        .from(employeeDocuments)
        .where(
          and(
            eq(employeeDocuments.employeeId, employeeId),
            eq(employeeDocuments.documentType, "payslip")
          )
        )
        .orderBy(desc(employeeDocuments.uploadedAt));

      // Source 2 (secondary): employee_payslips (published only)
      const payslipRecords = await db
        .select({
          id: employeePayslips.id,
          payPeriod: employeePayslips.payPeriod,
          payDate: employeePayslips.payDate,
          fileName: employeePayslips.fileName,
          fileUrl: employeePayslips.fileUrl,
          currency: employeePayslips.currency,
          grossAmount: employeePayslips.grossAmount,
          netAmount: employeePayslips.netAmount,
          publishedAt: employeePayslips.publishedAt,
          notes: employeePayslips.notes,
        })
        .from(employeePayslips)
        .where(
          and(
            eq(employeePayslips.employeeId, employeeId),
            eq(employeePayslips.isPublished, true)
          )
        )
        .orderBy(desc(employeePayslips.payPeriod));

      // Merge into unified format
      const allItems: PayslipItem[] = [];

      for (const doc of payslipDocs) {
        allItems.push({
          id: doc.id,
          source: "document",
          payPeriod: doc.documentName || "Payslip",
          payDate: doc.uploadedAt ? new Date(doc.uploadedAt).toISOString().slice(0, 10) : null,
          fileName: doc.documentName,
          fileUrl: doc.fileUrl,
          currency: ctx.workerUser.currency || null,
          grossAmount: null,
          netAmount: null,
          publishedAt: doc.uploadedAt,
          notes: doc.notes,
        });
      }

      for (const ps of payslipRecords) {
        allItems.push({
          id: ps.id,
          source: "payslip",
          payPeriod: ps.payPeriod,
          payDate: ps.payDate,
          fileName: ps.fileName,
          fileUrl: ps.fileUrl,
          currency: ps.currency,
          grossAmount: ps.grossAmount,
          netAmount: ps.netAmount,
          publishedAt: ps.publishedAt,
          notes: ps.notes,
        });
      }

      // Sort by date descending
      allItems.sort((a, b) => {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
        return b.payPeriod.localeCompare(a.payPeriod);
      });

      // Paginate
      const total = allItems.length;
      const offset = (input.page - 1) * input.pageSize;
      const items = allItems.slice(offset, offset + input.pageSize);

      return { items, total, page: input.page, pageSize: input.pageSize };
    }),

  /**
   * Get a single payslip detail — supports both sources
   */
  getById: employeeOnlyProcedure
    .input(z.object({
      id: z.number(),
      source: z.enum(["payslip", "document"]).default("document"),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const employeeId = ctx.workerUser.employeeId!;

      if (input.source === "document") {
        const [doc] = await db
          .select()
          .from(employeeDocuments)
          .where(
            and(
              eq(employeeDocuments.id, input.id),
              eq(employeeDocuments.employeeId, employeeId),
              eq(employeeDocuments.documentType, "payslip")
            )
          );

        if (!doc) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Payslip document not found" });
        }

        return {
          id: doc.id,
          source: "document" as const,
          payPeriod: doc.documentName || "Payslip",
          payDate: doc.uploadedAt ? new Date(doc.uploadedAt).toISOString().slice(0, 10) : null,
          fileName: doc.documentName,
          fileUrl: doc.fileUrl,
          fileKey: doc.fileKey,
          mimeType: doc.mimeType,
          currency: ctx.workerUser.currency || null,
          grossAmount: null,
          netAmount: null,
          notes: doc.notes,
          publishedAt: doc.uploadedAt,
        };
      } else {
        // Source: employee_payslips
        const [payslip] = await db
          .select()
          .from(employeePayslips)
          .where(
            and(
              eq(employeePayslips.id, input.id),
              eq(employeePayslips.employeeId, employeeId),
              eq(employeePayslips.isPublished, true)
            )
          );

        if (!payslip) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Payslip not found" });
        }

        return {
          ...payslip,
          source: "payslip" as const,
        };
      }
    }),
});
