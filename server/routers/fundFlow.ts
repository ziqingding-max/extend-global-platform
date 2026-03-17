/**
 * Fund Flow Router
 *
 * Provides endpoints for the four-party fund flow:
 *   - Process client payment (Layer 2 → auto-deduct Layer 1)
 *   - Process manual Layer 1 payment
 *   - Get CP fund flow summary
 *   - Batch process outstanding Layer 1 invoices
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure, userProcedure } from "../procedures";
import {
  processClientPayment,
  processLayer1Payment,
  getCpFundFlowSummary,
} from "../services/fundFlowEngine";
import { getDb } from "../db";
import {
  invoices,
  cpWalletTransactions,
  channelPartnerWallets,
} from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { cpWalletService } from "../services/cpWalletService";

export const fundFlowRouter = router({
  /**
   * Process a client payment on a Layer 2 invoice.
   * Triggers the full four-party flow:
   *   Client pays → CP wallet credited → CP wallet debited for Layer 1 → Layer 1 marked paid
   */
  processClientPayment: financeManagerProcedure
    .input(
      z.object({
        layer2InvoiceId: z.number(),
        paidAmount: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return processClientPayment(
        input.layer2InvoiceId,
        input.paidAmount,
        ctx.user.id,
      );
    }),

  /**
   * Process a manual Layer 1 payment (CP pays EG directly).
   */
  processLayer1Payment: financeManagerProcedure
    .input(
      z.object({
        layer1InvoiceId: z.number(),
        paidAmount: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return processLayer1Payment(
        input.layer1InvoiceId,
        input.paidAmount,
        ctx.user.id,
      );
    }),

  /**
   * Batch process: Auto-deduct from CP wallet for all outstanding Layer 1 invoices.
   * Useful for monthly settlement runs.
   */
  batchSettleLayer1: financeManagerProcedure
    .input(
      z.object({
        channelPartnerId: z.number(),
        currency: z.string().default("USD"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { settled: 0, failed: 0, errors: [] as string[] };

      // Get all outstanding Layer 1 invoices for this CP
      const outstanding = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.channelPartnerId, input.channelPartnerId),
            eq(invoices.invoiceLayer, "eg_to_cp"),
            sql`${invoices.status} IN ('sent', 'overdue')`,
            eq(invoices.currency, input.currency),
          )
        );

      let settled = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const inv of outstanding) {
        const result = await processLayer1Payment(inv.id, inv.total, ctx.user.id);
        if (result.success) {
          settled++;
        } else {
          failed++;
          errors.push(`${inv.invoiceNumber}: ${result.error}`);
        }
      }

      return { settled, failed, errors };
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
            date: tx.createdAt,
            type: tx.type,
            amount: parseFloat(tx.amount),
            description: tx.description || "",
            invoiceNumber: undefined, // Could be enriched with invoice lookup
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
        frozenBalance: 0, // Will be enriched below
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
