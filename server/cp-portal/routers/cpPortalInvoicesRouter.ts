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
import { sendCpInvoiceToClient, sendCpInvoiceOverdueReminder } from "../../services/cpEmailService";

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

  /**
   * Send a CP→Client invoice to the End Client.
   * Updates the invoice status from 'draft' to 'sent' and sends a white-labeled email
   * with the PDF attached to the customer's finance/admin contacts.
   * Only CP→Client (Layer 2) invoices can be sent by the CP.
   */
  sendInvoice: cpFinanceProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify invoice belongs to this CP and is a Layer 2 draft
      const invoice = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.id, input.invoiceId),
          eq(invoices.channelPartnerId, ctx.cpUser.channelPartnerId)
        ),
      });

      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      if (invoice.invoiceLayer !== "cp_to_client") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only CP→Client invoices can be sent from the CP Portal",
        });
      }

      if (invoice.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invoice is already in '${invoice.status}' status. Only draft invoices can be sent.`,
        });
      }

      // Update status to 'sent'
      const now = new Date();
      await db
        .update(invoices)
        .set({
          status: "sent",
          sentDate: now,
          updatedAt: now,
        })
        .where(eq(invoices.id, input.invoiceId));

      // Send the white-labeled email with PDF attachment
      const result = await sendCpInvoiceToClient({
        invoiceId: input.invoiceId,
        channelPartnerId: ctx.cpUser.channelPartnerId,
        customerId: invoice.customerId,
        invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id}`,
        invoiceMonth: invoice.invoiceMonth || undefined,
        currency: invoice.currency || "USD",
        totalAmount: invoice.total?.toString() || "0.00",
      });

      return {
        success: true,
        invoiceId: input.invoiceId,
        newStatus: "sent",
        emailSent: result.success,
        recipientCount: result.recipientCount,
      };
    }),

  // =========================================================================
  // Task Group D: CP Invoice Lifecycle — Custom Items & Mark Paid
  // =========================================================================

  /**
   * Add a custom line item to a CP→Client (L2) invoice.
   * Only allowed on draft-status L2 invoices.
   * CP can add markup, consulting fees, or other charges.
   * Items with isImmutableCost=true (employment costs from EG) CANNOT be modified.
   */
  addCustomItem: cpFinanceProcedure
    .input(
      z.object({
        invoiceId: z.number(),
        description: z.string().min(1).max(500),
        quantity: z.string().default("1"),
        unitPrice: z.string(),
        itemType: z.enum([
          "eor_service_fee",
          "visa_eor_service_fee",
          "aor_service_fee",
          "equipment_procurement_fee",
          "onboarding_fee",
          "offboarding_fee",
          "admin_setup_fee",
          "contract_termination_fee",
          "payroll_processing_fee",
          "tax_filing_fee",
          "hr_advisory_fee",
          "legal_compliance_fee",
          "visa_immigration_fee",
          "relocation_fee",
          "benefits_admin_fee",
          "bank_transfer_fee",
          "consulting_fee",
          "management_consulting_fee",
        ]),
        vatRate: z.string().default("0"),
        countryCode: z.string().max(3).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Verify invoice belongs to this CP, is L2, and is draft
      const invoice = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.id, input.invoiceId),
          eq(invoices.channelPartnerId, cpId)
        ),
      });

      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      if (invoice.invoiceLayer !== "cp_to_client") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Custom items can only be added to CP→Client (L2) invoices",
        });
      }
      if (invoice.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invoice is in '${invoice.status}' status. Custom items can only be added to draft invoices.`,
        });
      }

      // Calculate amount
      const qty = parseFloat(input.quantity) || 1;
      const price = parseFloat(input.unitPrice) || 0;
      const amount = (qty * price).toFixed(2);

      // Insert the custom item
      const result = await db.insert(invoiceItems).values({
        invoiceId: input.invoiceId,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        amount,
        itemType: input.itemType,
        vatRate: input.vatRate,
        countryCode: input.countryCode || null,
        isImmutableCost: false, // CP-added items are always mutable
      });

      // Recalculate invoice totals
      const allItems = await db
        .select({ amount: invoiceItems.amount, vatRate: invoiceItems.vatRate })
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, input.invoiceId));

      let newSubtotal = 0;
      let newTax = 0;
      for (const item of allItems) {
        const itemAmount = parseFloat(item.amount) || 0;
        const itemVat = parseFloat(item.vatRate || "0") || 0;
        newSubtotal += itemAmount;
        newTax += itemAmount * (itemVat / 100);
      }
      const newTotal = newSubtotal + newTax;

      await db
        .update(invoices)
        .set({
          subtotal: newSubtotal.toFixed(2),
          tax: newTax.toFixed(2),
          total: newTotal.toFixed(2),
          amountDue: newTotal.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, input.invoiceId));

      return {
        success: true,
        itemId: (result as any).lastInsertRowid || 0,
        newTotal: newTotal.toFixed(2),
      };
    }),

  /**
   * Remove a custom (mutable) line item from a CP→Client (L2) invoice.
   * Only items with isImmutableCost=false can be removed.
   * Only allowed on draft-status invoices.
   */
  removeCustomItem: cpFinanceProcedure
    .input(
      z.object({
        invoiceId: z.number(),
        itemId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Verify invoice belongs to this CP, is L2, and is draft
      const invoice = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.id, input.invoiceId),
          eq(invoices.channelPartnerId, cpId)
        ),
      });

      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      if (invoice.invoiceLayer !== "cp_to_client") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only modify CP→Client (L2) invoices" });
      }
      if (invoice.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only remove items from draft invoices" });
      }

      // Verify item exists and is mutable
      const item = await db
        .select({ id: invoiceItems.id, isImmutableCost: invoiceItems.isImmutableCost })
        .from(invoiceItems)
        .where(
          and(
            eq(invoiceItems.id, input.itemId),
            eq(invoiceItems.invoiceId, input.invoiceId)
          )
        )
        .limit(1);

      if (item.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Line item not found" });
      }
      if (item[0].isImmutableCost) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot remove employment cost items (locked by EG)",
        });
      }

      // Delete the item
      await db.delete(invoiceItems).where(eq(invoiceItems.id, input.itemId));

      // Recalculate invoice totals
      const remainingItems = await db
        .select({ amount: invoiceItems.amount, vatRate: invoiceItems.vatRate })
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, input.invoiceId));

      let newSubtotal = 0;
      let newTax = 0;
      for (const ri of remainingItems) {
        const riAmount = parseFloat(ri.amount) || 0;
        const riVat = parseFloat(ri.vatRate || "0") || 0;
        newSubtotal += riAmount;
        newTax += riAmount * (riVat / 100);
      }
      const newTotal = newSubtotal + newTax;

      await db
        .update(invoices)
        .set({
          subtotal: newSubtotal.toFixed(2),
          tax: newTax.toFixed(2),
          total: newTotal.toFixed(2),
          amountDue: newTotal.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, input.invoiceId));

      return { success: true, newTotal: newTotal.toFixed(2) };
    }),

  /**
   * Mark a CP→Client (L2) invoice as paid.
   * This is triggered when the CP confirms they received payment from the End Client
   * (e.g., via offline bank transfer). 
   * 
   * IMPORTANT: This does NOT deduct from any wallet. The customer pays manually,
   * and the CP marks the invoice as paid after confirming receipt.
   */
  markPaid: cpFinanceProcedure
    .input(
      z.object({
        invoiceId: z.number(),
        paidAmount: z.string().optional(), // If partial payment, specify amount
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Verify invoice belongs to this CP and is L2
      const invoice = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.id, input.invoiceId),
          eq(invoices.channelPartnerId, cpId)
        ),
      });

      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      if (invoice.invoiceLayer !== "cp_to_client") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only CP→Client (L2) invoices can be marked as paid from CP Portal",
        });
      }
      if (invoice.status !== "sent" && invoice.status !== "overdue") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invoice is in '${invoice.status}' status. Only sent or overdue invoices can be marked as paid.`,
        });
      }

      const totalAmount = parseFloat(invoice.total || "0");
      const paidAmount = input.paidAmount ? parseFloat(input.paidAmount) : totalAmount;
      const remainingDue = totalAmount - paidAmount;
      const newStatus = remainingDue <= 0.01 ? "paid" : "partially_paid";

      await db
        .update(invoices)
        .set({
          status: newStatus,
          paidDate: new Date(),
          paidAmount: paidAmount.toFixed(2),
          amountDue: Math.max(0, remainingDue).toFixed(2),
          notes: input.notes
            ? (invoice.notes ? invoice.notes + "\n" + input.notes : input.notes)
            : invoice.notes,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, input.invoiceId));

      return {
        success: true,
        invoiceId: input.invoiceId,
        newStatus,
        paidAmount: paidAmount.toFixed(2),
        remainingDue: Math.max(0, remainingDue).toFixed(2),
      };
    }),

  /**
   * Send an overdue reminder for a CP→Client invoice.
   * Only invoices with 'sent' or 'overdue' status can receive reminders.
   */
  sendOverdueReminder: cpFinanceProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const invoice = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.id, input.invoiceId),
          eq(invoices.channelPartnerId, ctx.cpUser.channelPartnerId)
        ),
      });

      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      if (invoice.invoiceLayer !== "cp_to_client") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only CP→Client invoices can have reminders sent from CP Portal",
        });
      }

      if (invoice.status !== "sent" && invoice.status !== "overdue") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only sent or overdue invoices can receive reminders",
        });
      }

      // Calculate days overdue
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : new Date();
      const daysOverdue = Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

      // Update status to 'overdue' if still 'sent'
      if (invoice.status === "sent") {
        await db
          .update(invoices)
          .set({ status: "overdue", updatedAt: new Date() })
          .where(eq(invoices.id, input.invoiceId));
      }

      const result = await sendCpInvoiceOverdueReminder({
        invoiceId: input.invoiceId,
        channelPartnerId: ctx.cpUser.channelPartnerId,
        customerId: invoice.customerId,
        invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id}`,
        currency: invoice.currency || "USD",
        totalAmount: invoice.total?.toString() || "0.00",
        dueDate: invoice.dueDate || "N/A",
        daysOverdue,
      });

      return {
        success: result.success,
        recipientCount: result.recipientCount,
      };
    }),
});
