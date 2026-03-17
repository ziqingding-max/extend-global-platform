/**
 * CP Portal Invoices Router
 *
 * Provides CP-layer invoice viewing from the Channel Partner's perspective.
 * All queries are SCOPED to ctx.cpUser.channelPartnerId.
 *
 * CP can see two types of invoices:
 * 1. EG→CP invoices (invoiceLayer = 'eg_to_cp') — what EG charges the CP
 * 2. CP→Client invoices (invoiceLayer = 'cp_to_client') — what CP charges End Clients
 *
 * CP CANNOT see:
 * - internalNotes (EG admin-only field)
 * - EG cost breakdowns on eg_to_cp invoices (only totals)
 *
 * CP CAN see:
 * - Invoice list with filtering by status, month, layer, client
 * - Invoice detail with line items
 * - Invoice summary statistics
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, sql, count, desc, inArray, SQL } from "drizzle-orm";
import {
  protectedCpProcedure,
  cpFinanceProcedure,
  cpPortalRouter,
} from "../cpPortalTrpc";
import { getDb } from "../../db";
import {
  invoices,
  invoiceItems,
  customers,
} from "../../../drizzle/schema";

// Fields visible to CP portal — excludes internalNotes
const CP_INVOICE_FIELDS = {
  id: invoices.id,
  invoiceNumber: invoices.invoiceNumber,
  invoiceType: invoices.invoiceType,
  invoiceMonth: invoices.invoiceMonth,
  invoiceLayer: invoices.invoiceLayer,
  parentInvoiceId: invoices.parentInvoiceId,
  customerId: invoices.customerId,
  currency: invoices.currency,
  subtotal: invoices.subtotal,
  serviceFeeTotal: invoices.serviceFeeTotal,
  tax: invoices.tax,
  total: invoices.total,
  status: invoices.status,
  dueDate: invoices.dueDate,
  sentDate: invoices.sentDate,
  paidDate: invoices.paidDate,
  paidAmount: invoices.paidAmount,
  amountDue: invoices.amountDue,
  walletAppliedAmount: invoices.walletAppliedAmount,
  localCurrencyTotal: invoices.localCurrencyTotal,
  localCurrency: invoices.localCurrency,
  settlementAmountUsd: invoices.settlementAmountUsd,
  fxRateUsed: invoices.fxRateUsed,
  fxMarkupRate: invoices.fxMarkupRate,
  notes: invoices.notes, // Client-facing notes only
  // internalNotes is NOT included — admin-only field
  createdAt: invoices.createdAt,
  updatedAt: invoices.updatedAt,
} as const;

// Only show invoices that have been sent (not drafts or pending_review)
const VISIBLE_STATUSES = ["sent", "paid", "overdue", "cancelled", "void"];

export const cpPortalInvoicesRouter = cpPortalRouter({
  /**
   * List invoices — scoped to this CP
   * Supports filtering by layer (eg_to_cp / cp_to_client), status, month, client
   */
  list: protectedCpProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        layer: z.enum(["eg_to_cp", "cp_to_client", "all"]).default("all"),
        status: z.string().optional(),
        invoiceMonth: z.string().optional(), // YYYY-MM
        customerId: z.number().optional(),
        tab: z.enum(["active", "history"]).default("active"),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;
      const offset = (input.page - 1) * input.pageSize;

      // Build conditions — always scoped to this CP
      const conditions: SQL[] = [
        eq(invoices.channelPartnerId, cpId),
        // Only show visible invoices (not drafts)
        sql`${invoices.status} IN ('sent', 'paid', 'overdue', 'cancelled', 'void')`,
      ];

      if (input.layer !== "all") {
        conditions.push(sql`${invoices.invoiceLayer} = ${input.layer}`);
      }
      if (input.status) {
        conditions.push(sql`${invoices.status} = ${input.status}`);
      }
      if (input.invoiceMonth) {
        conditions.push(eq(invoices.invoiceMonth, input.invoiceMonth));
      }
      if (input.customerId) {
        conditions.push(eq(invoices.customerId, input.customerId));
      }

      // Tab filtering
      if (input.tab === "active") {
        conditions.push(
          sql`${invoices.status} NOT IN ('paid', 'cancelled', 'void')`
        );
      } else {
        conditions.push(
          sql`${invoices.status} IN ('paid', 'cancelled', 'void')`
        );
      }

      const whereClause = and(...conditions);

      const [items, totalResult] = await Promise.all([
        db
          .select(CP_INVOICE_FIELDS)
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
      const customerIds = Array.from(new Set(items.map((i) => i.customerId).filter(Boolean)));
      let customerMap = new Map<number, string>();
      if (customerIds.length > 0) {
        const customerRows = await db
          .select({ id: customers.id, companyName: customers.companyName })
          .from(customers)
          .where(eq(customers.channelPartnerId, cpId));
        customerMap = new Map(customerRows.map((c) => [c.id, c.companyName]));
      }

      return {
        items: items.map((inv) => ({
          ...inv,
          customerName: inv.customerId ? customerMap.get(inv.customerId) || "Unknown" : null,
        })),
        total: totalResult[0]?.total ?? 0,
      };
    }),

  /**
   * Get invoice detail with line items
   */
  get: protectedCpProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Fetch invoice — must belong to this CP
      const invoiceRows = await db
        .select(CP_INVOICE_FIELDS)
        .from(invoices)
        .where(
          and(
            eq(invoices.id, input.id),
            eq(invoices.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (invoiceRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      const invoice = invoiceRows[0];

      // Fetch line items
      const items = await db
        .select({
          id: invoiceItems.id,
          description: invoiceItems.description,
          quantity: invoiceItems.quantity,
          unitPrice: invoiceItems.unitPrice,
          amount: invoiceItems.amount,
          itemType: invoiceItems.itemType,
          employeeId: invoiceItems.employeeId,
          isImmutableCost: invoiceItems.isImmutableCost,
        })
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, input.id));

      // Get customer name
      let customerName: string | null = null;
      if (invoice.customerId) {
        const customerRows = await db
          .select({ companyName: customers.companyName })
          .from(customers)
          .where(eq(customers.id, invoice.customerId))
          .limit(1);
        customerName = customerRows[0]?.companyName || null;
      }

      return {
        ...invoice,
        customerName,
        items,
      };
    }),

  /**
   * Invoice summary statistics for CP dashboard
   */
  summary: cpFinanceProcedure
    .input(
      z.object({
        layer: z.enum(["eg_to_cp", "cp_to_client", "all"]).default("all"),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) {
        return {
          totalOutstanding: 0,
          totalOverdue: 0,
          totalPaidThisMonth: 0,
          invoiceCount: { sent: 0, paid: 0, overdue: 0 },
        };
      }

      const cpId = ctx.cpUser.channelPartnerId;

      const baseConditions: SQL[] = [eq(invoices.channelPartnerId, cpId)];
      if (input.layer !== "all") {
        baseConditions.push(sql`${invoices.invoiceLayer} = ${input.layer}`);
      }

      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

      const [outstanding, overdue, paidThisMonth, statusCounts] = await Promise.all([
        // Total outstanding (sent but not paid)
        db
          .select({
            total: sql<string>`COALESCE(SUM(CAST(${invoices.amountDue} AS REAL)), 0)`,
          })
          .from(invoices)
          .where(and(...baseConditions, eq(invoices.status, "sent"))),

        // Total overdue
        db
          .select({
            total: sql<string>`COALESCE(SUM(CAST(${invoices.amountDue} AS REAL)), 0)`,
          })
          .from(invoices)
          .where(and(...baseConditions, eq(invoices.status, "overdue"))),

        // Total paid this month
        db
          .select({
            total: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS REAL)), 0)`,
          })
          .from(invoices)
          .where(
            and(
              ...baseConditions,
              eq(invoices.status, "paid"),
              eq(invoices.invoiceMonth, currentMonth)
            )
          ),

        // Status counts
        db
          .select({
            status: invoices.status,
            cnt: count(),
          })
          .from(invoices)
          .where(
            and(
              ...baseConditions,
              sql`${invoices.status} IN ('sent', 'paid', 'overdue', 'cancelled', 'void')`
            )
          )
          .groupBy(invoices.status),
      ]);

      const statusMap: Record<string, number> = {};
      for (const row of statusCounts) {
        if (row.status) statusMap[row.status] = row.cnt;
      }

      return {
        totalOutstanding: parseFloat(outstanding[0]?.total || "0"),
        totalOverdue: parseFloat(overdue[0]?.total || "0"),
        totalPaidThisMonth: parseFloat(paidThisMonth[0]?.total || "0"),
        invoiceCount: {
          sent: statusMap["sent"] || 0,
          paid: statusMap["paid"] || 0,
          overdue: statusMap["overdue"] || 0,
        },
      };
    }),
});
