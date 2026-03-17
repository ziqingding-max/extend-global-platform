/**
 * Portal Invoices Router
 *
 * All queries are SCOPED to ctx.portalUser.customerId.
 * Portal users can view invoices and download PDFs.
 * They CANNOT see internalNotes or modify invoices.
 *
 * Status mapping for portal display:
 *   draft / pending_review → hidden (not shown to clients)
 *   sent → "Issued"
 *   paid → "Paid" (or "Partially Paid" if follow-up invoice exists)
 *   overdue → "Overdue"
 *   cancelled → "Cancelled"
 *   void → "Void"
 *   (applied status removed — credit notes go through Release Tasks → Wallet)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, count, inArray } from "drizzle-orm";
import {
  protectedPortalProcedure,
  portalRouter,
} from "../portalTrpc";
import { getDb } from "../../db";
import { invoices, invoiceItems } from "../../../drizzle/schema";

// Fields visible to portal users — internalNotes is explicitly excluded
const PORTAL_INVOICE_FIELDS = {
  id: invoices.id,
  invoiceNumber: invoices.invoiceNumber,
  invoiceType: invoices.invoiceType,
  invoiceMonth: invoices.invoiceMonth,
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
  relatedInvoiceId: invoices.relatedInvoiceId,
  notes: invoices.notes, // Client-facing notes only
  // internalNotes is NOT included — admin-only field
  createdAt: invoices.createdAt,
  updatedAt: invoices.updatedAt,
} as const;

// Visibility filter: only show invoices that have been sent (not drafts or pending_review)
const VISIBLE_FILTER = sql`${invoices.status} NOT IN ('draft', 'pending_review')`;

// Active filter: exclude cancelled and void
const ACTIVE_FILTER = sql`${invoices.status} NOT IN ('draft', 'pending_review', 'cancelled', 'void')`;

export const portalInvoicesRouter = portalRouter({
  /**
   * List invoices — scoped to customerId
   * Supports filtering by status, type category, and invoice month
   * tab: "active" (default) shows non-cancelled/void; "history" shows paid/applied/cancelled/void
   */
  list: protectedPortalProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.string().optional(),
        invoiceMonth: z.string().optional(),
        tab: z.enum(["active", "history"]).default("active"),
        typeCategory: z.enum(["all", "receivables", "credits", "deposits"]).default("all"),
        excludeCreditNotes: z.boolean().default(true),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const cid = ctx.portalUser.customerId;

      const conditions = [
        eq(invoices.customerId, cid),
        VISIBLE_FILTER,
      ];

      // Exclude credit notes if requested (e.g. for main invoices tab)
      if (input.excludeCreditNotes) {
        conditions.push(sql`${invoices.invoiceType} NOT IN ('credit_note', 'deposit_refund')`);
      }

      // Tab filter
      if (input.tab === "active") {
        // Active: sent, overdue, applied (exclude cancelled/void/paid)
        conditions.push(sql`${invoices.status} NOT IN ('cancelled', 'void', 'paid')`);
      } else {
        // History: paid, applied, cancelled, void
        conditions.push(sql`${invoices.status} IN ('paid', 'applied', 'cancelled', 'void')`);
      }

      // Status filter
      if (input.status) {
        conditions.push(eq(invoices.status, input.status as any));
      }

      // Type category filter
      if (input.typeCategory === "receivables") {
        conditions.push(sql`${invoices.invoiceType} IN ('monthly_eor', 'monthly_visa_eor', 'monthly_aor', 'visa_service', 'manual')`);
      } else if (input.typeCategory === "credits") {
        conditions.push(eq(invoices.invoiceType, "credit_note"));
      } else if (input.typeCategory === "deposits") {
        conditions.push(sql`${invoices.invoiceType} IN ('deposit', 'deposit_refund')`);
      }

      // Month filter
      if (input.invoiceMonth) {
        conditions.push(eq(invoices.invoiceMonth, input.invoiceMonth as any));
      }

      const where = and(...conditions);

      const [totalResult] = await db
        .select({ count: count() })
        .from(invoices)
        .where(where);

      const items = await db
        .select(PORTAL_INVOICE_FIELDS)
        .from(invoices)
        .where(where)
        .orderBy(sql`${invoices.createdAt} DESC`)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      // Credit Note Apply mechanism removed — credit notes now go through Release Tasks → Wallet.
      // No need to calculate credit note application balances.

      // For each item, check if there are related invoices (follow-up for underpayment, CN for overpayment)
      const itemIds = items.map((inv: any) => inv.id);
      let relatedInvoicesMap: Record<number, Array<{ id: number; invoiceNumber: string; invoiceType: string; total: string; status: string }>> = {};
      if (itemIds.length > 0) {
        const relatedInvs = await db
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            invoiceType: invoices.invoiceType,
            total: invoices.total,
            status: invoices.status,
            relatedInvoiceId: invoices.relatedInvoiceId,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.customerId, cid),
              VISIBLE_FILTER,
              inArray(invoices.relatedInvoiceId, itemIds)
            )
          );

        for (const rel of relatedInvs) {
          const parentId = rel.relatedInvoiceId!;
          if (!relatedInvoicesMap[parentId]) relatedInvoicesMap[parentId] = [];
          relatedInvoicesMap[parentId].push({
            id: rel.id,
            invoiceNumber: rel.invoiceNumber,
            invoiceType: rel.invoiceType,
            total: String(rel.total),
            status: rel.status,
          });
        }
      }

      // Enrich items with computed fields
      const enrichedItems = items.map((inv: any) => {
        const total = Number(inv.total);
        const paidAmount = inv.paidAmount != null ? Number(inv.paidAmount) : 0;
        const amountDue = inv.amountDue != null ? Number(inv.amountDue) : total;

        // Balance Due calculation
        let balanceDue = 0;
        if (inv.invoiceType === "credit_note" || inv.invoiceType === "deposit_refund") {
          // Credit notes and deposit refunds: no balance due (handled via Release Tasks → Wallet)
          balanceDue = 0;
        } else if (inv.status === "paid") {
          // Paid: check if partially paid (has follow-up invoice)
          const followUps = relatedInvoicesMap[inv.id] || [];
          const hasFollowUp = followUps.some(f => f.invoiceType === "manual" || f.invoiceType === "monthly_eor");
          if (hasFollowUp) {
            balanceDue = 0; // The follow-up invoice carries the remaining balance
          } else {
            balanceDue = 0;
          }
        } else if (inv.status === "cancelled" || inv.status === "void") {
          balanceDue = 0;
        } else {
          // sent, overdue: balance = amountDue - paidAmount
          balanceDue = Math.max(0, amountDue - paidAmount);
        }

        // Determine display status
        let displayStatus = inv.status;
        let isPartiallyPaid = false;
        let isOverpaid = false;

        if (inv.status === "paid") {
          const followUps = relatedInvoicesMap[inv.id] || [];
          const hasUnderpaymentFollowUp = followUps.some(f =>
            f.invoiceType === "manual" && Number(f.total) > 0
          );
          const hasOverpaymentCN = followUps.some(f =>
            f.invoiceType === "credit_note"
          );

          if (hasUnderpaymentFollowUp) {
            isPartiallyPaid = true;
          }
          if (hasOverpaymentCN) {
            isOverpaid = true;
          }
        }

        return {
          ...inv,
          balanceDue,
          displayStatus,
          isPartiallyPaid,
          isOverpaid,
          relatedDocuments: relatedInvoicesMap[inv.id] || [],
        };
      });

      return {
        items: enrichedItems,
        total: totalResult?.count ?? 0,
      };
    }),

  /**
   * Get invoice detail with line items, credit applications, and related documents
   */
  detail: protectedPortalProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // CRITICAL: Always filter by customerId
      const [invoice] = await db
        .select(PORTAL_INVOICE_FIELDS)
        .from(invoices)
        .where(
          and(
            eq(invoices.id, input.id),
            eq(invoices.customerId, cid),
            VISIBLE_FILTER
          )
        );

      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      // Get line items — exclude internal markup data
      const items = await db
        .select({
          id: invoiceItems.id,
          description: invoiceItems.description,
          quantity: invoiceItems.quantity,
          unitPrice: invoiceItems.unitPrice,
          amount: invoiceItems.amount,
          itemType: invoiceItems.itemType,
          vatRate: invoiceItems.vatRate,
          countryCode: invoiceItems.countryCode,
          localCurrency: invoiceItems.localCurrency,
          localAmount: invoiceItems.localAmount,
          exchangeRate: invoiceItems.exchangeRate,
          // exchangeRateWithMarkup is NOT included — admin-only field
        })
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, input.id));

      // Credit Note Apply mechanism removed — credit notes go through Release Tasks → Wallet.
      // Related documents are now found via relatedInvoiceId (bidirectional).

      // ── Related Documents (bidirectional via relatedInvoiceId) ──
      // 1. Documents that point to this invoice (children)
      const childDocuments = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          invoiceType: invoices.invoiceType,
          total: invoices.total,
          status: invoices.status,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.relatedInvoiceId, input.id),
            eq(invoices.customerId, cid),
            VISIBLE_FILTER
          )
        );

      // 2. Parent document (if this invoice points to another)
      let parentDocument: any = null;
      if (invoice.relatedInvoiceId) {
        const [parent] = await db
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            invoiceType: invoices.invoiceType,
            total: invoices.total,
            status: invoices.status,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.id, invoice.relatedInvoiceId),
              eq(invoices.customerId, cid)
            )
          );
        parentDocument = parent || null;
      }

      // ── Payment analysis ──
      const total = Number(invoice.total);
      const paidAmount = invoice.paidAmount != null ? Number(invoice.paidAmount) : 0;
      const amountDue = invoice.amountDue != null ? Number(invoice.amountDue) : total;

      let isPartiallyPaid = false;
      let isOverpaid = false;

      if (invoice.status === "paid") {
        const hasUnderpaymentFollowUp = childDocuments.some(d =>
          d.invoiceType === "manual" && Number(d.total) > 0
        );
        const hasOverpaymentCN = childDocuments.some(d =>
          d.invoiceType === "credit_note"
        );
        if (hasUnderpaymentFollowUp) isPartiallyPaid = true;
        if (hasOverpaymentCN) isOverpaid = true;
      }

      // Balance Due calculation
      let balanceDue = 0;
      if (invoice.invoiceType === "credit_note" || invoice.invoiceType === "deposit_refund") {
        // Credit notes and deposit refunds: handled via Release Tasks → Wallet
        balanceDue = 0;
      } else if (invoice.status === "paid") {
        balanceDue = 0;
      } else if (invoice.status === "cancelled" || invoice.status === "void") {
        balanceDue = 0;
      } else {
        balanceDue = Math.max(0, amountDue - paidAmount);
      }

      return {
        ...invoice,
        items,
        // Related documents (bidirectional via relatedInvoiceId)
        relatedDocuments: {
          parent: parentDocument,
          children: childDocuments.map(d => ({
            id: d.id,
            invoiceNumber: d.invoiceNumber,
            invoiceType: d.invoiceType,
            total: String(d.total),
            status: d.status,
          })),
        },
        // Computed display fields
        isPartiallyPaid,
        isOverpaid,
        balanceDue,
      };
    }),

  /**
   * Account summary — overview of all financial activity
   */
  accountSummary: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { totalInvoiced: 0, totalPaid: 0, totalCreditNotes: 0, totalDeposits: 0, outstandingBalance: 0 };
    const cid = ctx.portalUser.customerId;

    // Total invoiced (excluding credit notes and deposit refunds)
    const [invoiced] = await db
      .select({ total: sql<string>`COALESCE(SUM(${invoices.total}), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.customerId, cid),
          sql`${invoices.invoiceType} IN ('monthly_eor', 'monthly_visa_eor', 'monthly_aor', 'visa_service', 'manual')`,
          ACTIVE_FILTER
        )
      );

    // Total paid
    const [paid] = await db
      .select({ total: sql<string>`COALESCE(SUM(${invoices.paidAmount}), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.customerId, cid),
          eq(invoices.status, "paid")
        )
      );

    // Total credit notes issued (absolute value)
    const [credits] = await db
      .select({ total: sql<string>`COALESCE(SUM(ABS(${invoices.total})), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.customerId, cid),
          eq(invoices.invoiceType, "credit_note"),
          ACTIVE_FILTER
        )
      );

    // Credit Note Apply mechanism removed — credit balance is now tracked via Wallet.

    // Total deposits (gross - paid deposits)
    const [depositsGross] = await db
      .select({ total: sql<string>`COALESCE(SUM(${invoices.total}), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.customerId, cid),
          eq(invoices.invoiceType, "deposit"),
          ACTIVE_FILTER
        )
      );

    // Subtract credit notes derived from deposits
    const [depositCreditNotes] = await db
      .select({ total: sql<string>`COALESCE(SUM(ABS(${invoices.total})), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.customerId, cid),
          eq(invoices.invoiceType, "credit_note"),
          ACTIVE_FILTER,
          sql`${invoices.relatedInvoiceId} IN (SELECT id FROM invoices WHERE customerId = ${cid} AND invoiceType = 'deposit')`
        )
      );

    // Subtract deposit refunds
    const [depositRefunds] = await db
      .select({ total: sql<string>`COALESCE(SUM(ABS(${invoices.total})), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.customerId, cid),
          eq(invoices.invoiceType, "deposit_refund"),
          ACTIVE_FILTER
        )
      );

    // Net deposit balance
    const netDeposits = Math.max(0,
      Number(depositsGross?.total || 0) -
      Number(depositCreditNotes?.total || 0) -
      Number(depositRefunds?.total || 0)
    );

    // Outstanding balance (sent + overdue, excluding credit notes)
    const [outstanding] = await db
      .select({ total: sql<string>`COALESCE(SUM(COALESCE(${invoices.amountDue}, ${invoices.total})), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.customerId, cid),
          sql`${invoices.status} IN ('sent', 'overdue')`,
          sql`${invoices.invoiceType} NOT IN ('credit_note', 'deposit_refund')`
        )
      );

    const totalCreditIssued = Number(credits?.total || 0);

    return {
      totalInvoiced: Number(invoiced?.total || 0),
      totalPaid: Number(paid?.total || 0),
      totalCreditNotes: totalCreditIssued,
      // Credit balance is now tracked via Wallet, not via credit note applications
      totalDeposits: netDeposits,
      outstandingBalance: Number(outstanding?.total || 0),
    };
  }),
});
