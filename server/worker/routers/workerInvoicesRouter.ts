/**
 * Worker Invoices Router
 *
 * Contractor-only: view and download invoices.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  workerRouter,
  contractorOnlyProcedure,
} from "../workerTrpc";
import { getDb } from "../../services/db/connection";
import { contractorInvoices, contractorInvoiceItems } from "../../../drizzle/schema";
import { eq, desc, and, count, sql } from "drizzle-orm";

export const workerInvoicesRouter = workerRouter({
  /**
   * List my invoices with pagination and optional status filter
   */
  list: contractorOnlyProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.enum(["draft", "pending_approval", "approved", "paid", "rejected"]).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const contractorId = ctx.workerUser.contractorId!;
      const offset = (input.page - 1) * input.pageSize;

      // Build where conditions
      const baseCondition = eq(contractorInvoices.contractorId, contractorId);
      const whereCondition = input.status
        ? and(baseCondition, eq(contractorInvoices.status, input.status))
        : baseCondition;

      // Count total
      const [totalResult] = await db
        .select({ count: count() })
        .from(contractorInvoices)
        .where(whereCondition);

      // Fetch items
      const items = await db
        .select({
          id: contractorInvoices.id,
          invoiceNumber: contractorInvoices.invoiceNumber,
          invoiceDate: contractorInvoices.invoiceDate,
          dueDate: contractorInvoices.dueDate,
          periodStart: contractorInvoices.periodStart,
          periodEnd: contractorInvoices.periodEnd,
          currency: contractorInvoices.currency,
          totalAmount: contractorInvoices.totalAmount,
          status: contractorInvoices.status,
          createdAt: contractorInvoices.createdAt,
        })
        .from(contractorInvoices)
        .where(whereCondition)
        .limit(input.pageSize)
        .offset(offset)
        .orderBy(desc(contractorInvoices.createdAt));

      return {
        items,
        total: totalResult?.count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * Get invoice detail with line items
   */
  getById: contractorOnlyProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const contractorId = ctx.workerUser.contractorId!;

      const [invoice] = await db
        .select()
        .from(contractorInvoices)
        .where(
          and(
            eq(contractorInvoices.id, input.id),
            eq(contractorInvoices.contractorId, contractorId)
          )
        );

      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      // Fetch line items
      const items = await db
        .select()
        .from(contractorInvoiceItems)
        .where(eq(contractorInvoiceItems.invoiceId, invoice.id));

      return { ...invoice, items };
    }),
});
