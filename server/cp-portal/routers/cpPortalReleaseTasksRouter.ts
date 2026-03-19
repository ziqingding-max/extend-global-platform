/**
 * CP Portal Release Tasks Router
 *
 * Allows CP to view and manage deposit release tasks for their end clients.
 * When an employee is terminated, a deposit_refund or credit_note invoice is generated.
 * CP can view these pending release tasks and approve the disposition:
 *   - Release to Client's Main Wallet (available balance)
 *   - Mark as Refunded to Bank (external transfer)
 *
 * SECURITY:
 * - All queries scoped by ctx.cpUser.channelPartnerId
 * - Only cp_admin and cp_finance roles can approve releases
 * - CP cannot access release tasks for clients of other CPs
 *
 * BUSINESS RULES:
 * - CP can only approve releases for their own clients' frozen wallets
 * - The actual wallet transaction is handled by the creditNoteService.approveCreditNote
 *   which debits frozen wallet and credits main wallet (or marks as bank refund)
 * - CP does NOT have the ability to force-deduct from client wallets
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { cpPortalRouter, cpFinanceProcedure, protectedCpProcedure } from "../cpPortalTrpc";
import { getDb } from "../../db";
import { invoices, invoiceItems, customers, employees } from "../../../drizzle/schema";
import { eq, and, sql, desc, count, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { approveCreditNote } from "../../services/creditNoteService";

export const cpPortalReleaseTasksRouter = cpPortalRouter({
  /**
   * List release tasks (deposit_refund and credit_note invoices) for CP's clients.
   * Supports tab filtering: "pending" (actionable) vs "history" (processed).
   */
  list: protectedCpProcedure
    .input(
      z.object({
        tab: z.enum(["pending", "history"]).default("pending"),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };
      const cpId = ctx.cpUser.channelPartnerId;
      const offset = (input.page - 1) * input.pageSize;

      // Build conditions — only deposit_refund and credit_note for this CP's clients
      const conditions: SQL[] = [
        eq(invoices.channelPartnerId, cpId),
        sql`${invoices.invoiceType} IN ('deposit_refund', 'credit_note')`,
      ];

      // Tab filtering
      if (input.tab === "pending") {
        conditions.push(
          sql`${invoices.status} IN ('draft', 'sent', 'pending_approval')`
        );
      } else {
        conditions.push(
          sql`${invoices.status} IN ('paid', 'applied', 'cancelled')`
        );
      }

      const whereClause = and(...conditions);

      const [items, totalResult] = await Promise.all([
        db
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            invoiceType: invoices.invoiceType,
            invoiceLayer: invoices.invoiceLayer,
            status: invoices.status,
            currency: invoices.currency,
            total: invoices.total,
            amountDue: invoices.amountDue,
            customerId: invoices.customerId,
            relatedInvoiceId: invoices.relatedInvoiceId,
            creditNoteDisposition: invoices.creditNoteDisposition,
            notes: invoices.notes,
            createdAt: invoices.createdAt,
            paidDate: invoices.paidDate,
          })
          .from(invoices)
          .where(whereClause)
          .orderBy(desc(invoices.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(invoices)
          .where(whereClause),
      ]);

      // Enrich with customer names
      const customerIds = Array.from(
        new Set(items.map((i) => i.customerId).filter(Boolean))
      ) as number[];
      let customerMap = new Map<number, string>();
      if (customerIds.length > 0) {
        const customerRows = await db
          .select({ id: customers.id, companyName: customers.companyName })
          .from(customers)
          .where(
            and(
              eq(customers.channelPartnerId, cpId),
              inArray(customers.id, customerIds)
            )
          );
        customerMap = new Map(customerRows.map((c) => [c.id, c.companyName]));
      }

      // Enrich with employee info from invoice items
      const invoiceIds = items.map((i) => i.id);
      let employeeMap = new Map<number, { name: string; code: string }>();
      if (invoiceIds.length > 0) {
        const lineItems = await db
          .select({
            invoiceId: invoiceItems.invoiceId,
            employeeId: invoiceItems.employeeId,
          })
          .from(invoiceItems)
          .where(inArray(invoiceItems.invoiceId, invoiceIds));

        const empIds = Array.from(
          new Set(lineItems.map((li) => li.employeeId).filter(Boolean))
        ) as number[];

        if (empIds.length > 0) {
          const empRows = await db
            .select({
              id: employees.id,
              firstName: employees.firstName,
              lastName: employees.lastName,
              employeeCode: employees.employeeCode,
            })
            .from(employees)
            .where(inArray(employees.id, empIds));

          const empLookup = new Map(empRows.map((e) => [e.id, e]));

          // Map invoiceId → employee info
          for (const li of lineItems) {
            if (li.employeeId && empLookup.has(li.employeeId)) {
              const emp = empLookup.get(li.employeeId)!;
              employeeMap.set(li.invoiceId, {
                name: `${emp.firstName} ${emp.lastName}`,
                code: emp.employeeCode || "",
              });
            }
          }
        }
      }

      return {
        items: items.map((inv) => ({
          ...inv,
          customerName: inv.customerId
            ? customerMap.get(inv.customerId) || "Unknown"
            : null,
          employeeName: employeeMap.get(inv.id)?.name || null,
          employeeCode: employeeMap.get(inv.id)?.code || null,
        })),
        total: totalResult[0]?.total ?? 0,
      };
    }),

  /**
   * Approve a deposit release / credit note.
   * Disposition: "to_wallet" (credit to client's main wallet) or "to_bank" (mark as bank refund).
   *
   * This delegates to the shared creditNoteService.approveCreditNote which handles:
   * 1. Debiting the frozen wallet
   * 2. Crediting the main wallet (or marking as bank refund)
   * 3. Updating the invoice status to "paid"
   *
   * SECURITY: Only cp_finance and cp_admin can approve.
   * The invoice must belong to this CP's client.
   */
  approve: cpFinanceProcedure
    .input(
      z.object({
        creditNoteId: z.number(),
        disposition: z.enum(["to_wallet", "to_bank"]).default("to_wallet"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const cpId = ctx.cpUser.channelPartnerId;

      // Verify the invoice belongs to this CP
      const invoice = await db
        .select({
          id: invoices.id,
          channelPartnerId: invoices.channelPartnerId,
          invoiceType: invoices.invoiceType,
          status: invoices.status,
        })
        .from(invoices)
        .where(eq(invoices.id, input.creditNoteId));

      if (invoice.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      if (invoice[0].channelPartnerId !== cpId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied: this invoice does not belong to your organization" });
      }

      if (!["credit_note", "deposit_refund"].includes(invoice[0].invoiceType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only credit notes and deposit refunds can be approved here" });
      }

      if (invoice[0].status === "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This release has already been processed" });
      }

      // Delegate to the shared service
      const result = await approveCreditNote(
        input.creditNoteId,
        undefined, // CP user doesn't have an admin user ID
        input.disposition
      );

      return result;
    }),

  /**
   * Summary statistics for the release tasks dashboard.
   */
  summary: protectedCpProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { pendingCount: 0, pendingAmount: 0, processedCount: 0, currency: "USD" };
    const cpId = ctx.cpUser.channelPartnerId;

    const [pending, processed] = await Promise.all([
      db
        .select({
          cnt: count(),
          totalAmt: sql<string>`COALESCE(SUM(ABS(CAST(${invoices.total} AS REAL))), 0)`,
          currency: invoices.currency,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.channelPartnerId, cpId),
            sql`${invoices.invoiceType} IN ('deposit_refund', 'credit_note')`,
            sql`${invoices.status} IN ('draft', 'sent', 'pending_approval')`
          )
        )
        .groupBy(invoices.currency),
      db
        .select({ cnt: count() })
        .from(invoices)
        .where(
          and(
            eq(invoices.channelPartnerId, cpId),
            sql`${invoices.invoiceType} IN ('deposit_refund', 'credit_note')`,
            sql`${invoices.status} IN ('paid', 'applied')`
          )
        ),
    ]);

    return {
      pendingCount: pending.reduce((sum, p) => sum + p.cnt, 0),
      pendingAmount: pending.reduce((sum, p) => sum + parseFloat(p.totalAmt || "0"), 0),
      processedCount: processed[0]?.cnt ?? 0,
      currency: pending[0]?.currency || "USD",
    };
  }),
});
