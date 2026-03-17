/**
 * Fund Flow Router
 *
 * Provides endpoints for the four-party fund flow:
 *   - CP manually pays Layer 1 invoice from wallet
 *   - List outstanding Layer 1 invoices for a CP
 *   - Get CP fund flow summary
 *   - Get fund flow overview across all CPs
 *
 * IMPORTANT: All wallet deductions are CP-initiated (manual).
 * The system NEVER auto-deducts from CP wallets.
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure, userProcedure } from "../procedures";
import {
  payLayer1FromWallet,
  getLayer1OutstandingForCp,
  getCpFundFlowSummary,
} from "../services/fundFlowEngine";
import { getDb } from "../db";
import {
  invoices,
  cpWalletTransactions,
  channelPartnerWallets,
  customers,
} from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { cpWalletService } from "../services/cpWalletService";

export const fundFlowRouter = router({
  /**
   * CP manually pays a Layer 1 (EG → CP) invoice from their wallet.
   * This is the ONLY way to pay Layer 1 invoices.
   * CP must have sufficient wallet balance and must explicitly initiate this.
   */
  payLayer1: financeManagerProcedure
    .input(
      z.object({
        layer1InvoiceId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return payLayer1FromWallet(input.layer1InvoiceId, ctx.user.id);
    }),

  /**
   * List outstanding (unpaid) Layer 1 invoices for a CP.
   * Used in CP Portal "Pay from Wallet" view.
   */
  outstandingLayer1: userProcedure
    .input(
      z.object({
        channelPartnerId: z.number(),
        currency: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const outstanding = await getLayer1OutstandingForCp(
        input.channelPartnerId,
        input.currency,
      );

      // Enrich with customer names
      const db = getDb();
      if (db && outstanding.length > 0) {
        const invoiceIds = outstanding.map((inv) => inv.id);
        const invoiceRecords = await db
          .select({
            id: invoices.id,
            customerId: invoices.customerId,
          })
          .from(invoices)
          .where(sql`${invoices.id} IN (${sql.join(invoiceIds.map(id => sql`${id}`), sql`, `)})`);

        const customerIds = Array.from(new Set(invoiceRecords.map((r) => r.customerId)));
        const customerRecords = await db
          .select({ id: customers.id, name: customers.companyName })
          .from(customers)
          .where(sql`${customers.id} IN (${sql.join(customerIds.map(id => sql`${id}`), sql`, `)})`);

        const customerMap = new Map(customerRecords.map((c) => [c.id, c.name]));
        const invoiceCustomerMap = new Map(invoiceRecords.map((r) => [r.id, r.customerId]));

        for (const inv of outstanding) {
          const customerId = invoiceCustomerMap.get(inv.id);
          inv.customerName = customerId ? (customerMap.get(customerId) || "Unknown") : "Unknown";
        }
      }

      return outstanding;
    }),

  /**
   * Get CP fund flow summary for the admin dashboard.
   */
  cpSummary: userProcedure
    .input(
      z.object({
        channelPartnerId: z.number(),
        currency: z.string().default("USD"),
      })
    )
    .query(async ({ input }) => {
      const summary = await getCpFundFlowSummary(
        input.channelPartnerId,
        input.currency,
      );

      // Enrich with recent transactions from CP wallet
      const db = getDb();
      if (db) {
        try {
          const wallet = await cpWalletService.getWallet(
            input.channelPartnerId,
            input.currency,
          );
          const recentTxns = await db
            .select()
            .from(cpWalletTransactions)
            .where(eq(cpWalletTransactions.walletId, wallet.id))
            .orderBy(desc(cpWalletTransactions.createdAt))
            .limit(20);

          summary.recentTransactions = recentTxns.map((tx) => ({
            date: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : String(tx.createdAt),
            type: tx.type as string,
            amount: parseFloat(tx.amount),
            description: tx.description || "",
            invoiceNumber: undefined as string | undefined,
          }));
        } catch {
          // Wallet may not exist yet
        }
      }

      return summary;
    }),

  /**
   * Get fund flow overview across all CPs (admin dashboard).
   */
  overview: userProcedure.query(async () => {
    const db = getDb();
    if (!db) {
      return {
        totalCpWalletBalance: 0,
        totalCpFrozenBalance: 0,
        totalOutstandingLayer1: 0,
        totalOutstandingLayer2: 0,
        cpBalances: [] as {
          channelPartnerId: number;
          currency: string;
          balance: number;
          frozenBalance: number;
        }[],
      };
    }

    // Get all CP wallet balances
    const wallets = await db
      .select()
      .from(channelPartnerWallets);

    let totalCpWalletBalance = 0;
    let totalCpFrozenBalance = 0;
    const cpBalances = wallets.map((w) => {
      const bal = parseFloat(w.balance);
      totalCpWalletBalance += bal;
      return {
        channelPartnerId: w.channelPartnerId,
        currency: w.currency,
        balance: bal,
        frozenBalance: 0,
      };
    });

    // Get outstanding Layer 1 totals
    const [outstandingL1] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS REAL)), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.invoiceLayer, "eg_to_cp"),
          sql`${invoices.status} IN ('sent', 'overdue')`,
        )
      );

    // Get outstanding Layer 2 totals
    const [outstandingL2] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS REAL)), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.invoiceLayer, "cp_to_client"),
          sql`${invoices.status} IN ('sent', 'overdue')`,
        )
      );

    return {
      totalCpWalletBalance: Math.round(totalCpWalletBalance * 100) / 100,
      totalCpFrozenBalance: Math.round(totalCpFrozenBalance * 100) / 100,
      totalOutstandingLayer1: Math.round(parseFloat(outstandingL1?.total || "0") * 100) / 100,
      totalOutstandingLayer2: Math.round(parseFloat(outstandingL2?.total || "0") * 100) / 100,
      cpBalances,
    };
  }),
});
