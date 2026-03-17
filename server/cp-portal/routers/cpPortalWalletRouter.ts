/**
 * CP Portal Wallet Router
 *
 * Provides CP wallet viewing from the Channel Partner's perspective.
 * All queries are SCOPED to ctx.cpUser.channelPartnerId.
 *
 * CP can see:
 * - Prepaid wallet balance and transaction history
 * - Frozen (deposit) wallet balance and transaction history
 * - Wallet summary for dashboard
 *
 * CP CANNOT:
 * - Top up directly (EG Admin manages top-ups)
 * - Withdraw directly (EG Admin manages withdrawals)
 * - Modify any wallet state
 *
 * All wallet mutations are done via EG Admin (channelPartners router).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, count, sql, SQL } from "drizzle-orm";
import {
  protectedCpProcedure,
  cpFinanceProcedure,
  cpPortalRouter,
} from "../cpPortalTrpc";
import { getDb } from "../../db";
import {
  channelPartnerWallets,
  cpWalletTransactions,
  channelPartnerFrozenWallets,
  cpFrozenWalletTransactions,
} from "../../../drizzle/schema";
import { cpWalletService } from "../../services/cpWalletService";

export const cpPortalWalletRouter = cpPortalRouter({
  // =========================================================================
  // Prepaid Wallet
  // =========================================================================

  /**
   * Get prepaid wallet balance for a specific currency
   */
  getBalance: protectedCpProcedure
    .input(
      z.object({
        currency: z.string().max(3).default("USD"),
      })
    )
    .query(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;
      const wallet = await cpWalletService.getWallet(cpId, input.currency);

      return {
        channelPartnerId: cpId,
        currency: input.currency,
        balance: wallet.balance,
        version: wallet.version,
      };
    }),

  /**
   * Get frozen (deposit) wallet balance for a specific currency
   */
  getFrozenBalance: protectedCpProcedure
    .input(
      z.object({
        currency: z.string().max(3).default("USD"),
      })
    )
    .query(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;
      const frozenWallet = await cpWalletService.getFrozenWallet(cpId, input.currency);

      return {
        channelPartnerId: cpId,
        currency: input.currency,
        balance: frozenWallet?.balance ?? "0",
        version: frozenWallet?.version ?? 0,
      };
    }),

  /**
   * Get all wallets (all currencies) for this CP
   */
  listWallets: protectedCpProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { prepaid: [], frozen: [] };

    const cpId = ctx.cpUser.channelPartnerId;

    const [prepaid, frozen] = await Promise.all([
      db
        .select({
          id: channelPartnerWallets.id,
          currency: channelPartnerWallets.currency,
          balance: channelPartnerWallets.balance,
          version: channelPartnerWallets.version,
        })
        .from(channelPartnerWallets)
        .where(eq(channelPartnerWallets.channelPartnerId, cpId)),
      db
        .select({
          id: channelPartnerFrozenWallets.id,
          currency: channelPartnerFrozenWallets.currency,
          balance: channelPartnerFrozenWallets.balance,
          version: channelPartnerFrozenWallets.version,
        })
        .from(channelPartnerFrozenWallets)
        .where(eq(channelPartnerFrozenWallets.channelPartnerId, cpId)),
    ]);

    return { prepaid, frozen };
  }),

  /**
   * Wallet summary for dashboard — all currencies combined (converted to USD)
   */
  summary: cpFinanceProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) {
      return {
        totalPrepaidUsd: 0,
        totalFrozenUsd: 0,
        currencies: [],
      };
    }

    const cpId = ctx.cpUser.channelPartnerId;

    const [prepaid, frozen] = await Promise.all([
      db
        .select({
          currency: channelPartnerWallets.currency,
          balance: channelPartnerWallets.balance,
        })
        .from(channelPartnerWallets)
        .where(eq(channelPartnerWallets.channelPartnerId, cpId)),
      db
        .select({
          currency: channelPartnerFrozenWallets.currency,
          balance: channelPartnerFrozenWallets.balance,
        })
        .from(channelPartnerFrozenWallets)
        .where(eq(channelPartnerFrozenWallets.channelPartnerId, cpId)),
    ]);

    // For now, treat all as USD (FX conversion to be added later)
    const totalPrepaid = prepaid.reduce((sum, w) => sum + parseFloat(w.balance), 0);
    const totalFrozen = frozen.reduce((sum, w) => sum + parseFloat(w.balance), 0);

    const currencies = Array.from(new Set([
      ...prepaid.map((w) => w.currency),
      ...frozen.map((w) => w.currency),
    ]));

    return {
      totalPrepaidUsd: totalPrepaid,
      totalFrozenUsd: totalFrozen,
      currencies,
    };
  }),

  // =========================================================================
  // Transaction History
  // =========================================================================

  /**
   * List prepaid wallet transactions
   */
  listTransactions: protectedCpProcedure
    .input(
      z.object({
        currency: z.string().max(3).default("USD"),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        type: z.string().optional(), // top_up, invoice_deduction, refund, etc.
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;
      const offset = (input.page - 1) * input.pageSize;

      // Filter by walletId (which encodes currency) instead of a currency column on transactions
      // First find the wallet for this CP + currency
      const walletRows = await db
        .select({ id: channelPartnerWallets.id })
        .from(channelPartnerWallets)
        .where(
          and(
            eq(channelPartnerWallets.channelPartnerId, cpId),
            eq(channelPartnerWallets.currency, input.currency)
          )
        )
        .limit(1);

      if (walletRows.length === 0) return { items: [], total: 0 };
      const walletId = walletRows[0].id;

      const conditions: SQL[] = [
        eq(cpWalletTransactions.walletId, walletId),
      ];

      if (input.type) {
        conditions.push(sql`${cpWalletTransactions.type} = ${input.type}`);
      }

      const whereClause = and(...conditions);

      const [items, totalResult] = await Promise.all([
        db
          .select({
            id: cpWalletTransactions.id,
            type: cpWalletTransactions.type,
            amount: cpWalletTransactions.amount,
            balanceBefore: cpWalletTransactions.balanceBefore,
            balanceAfter: cpWalletTransactions.balanceAfter,
            referenceType: cpWalletTransactions.referenceType,
            referenceId: cpWalletTransactions.referenceId,
            description: cpWalletTransactions.description,
            createdAt: cpWalletTransactions.createdAt,
          })
          .from(cpWalletTransactions)
          .where(whereClause)
          .orderBy(desc(cpWalletTransactions.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(cpWalletTransactions)
          .where(whereClause),
      ]);

      return {
        items,
        total: totalResult[0]?.total ?? 0,
      };
    }),

  /**
   * List frozen wallet transactions
   */
  listFrozenTransactions: protectedCpProcedure
    .input(
      z.object({
        currency: z.string().max(3).default("USD"),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        type: z.string().optional(), // deposit_hold, deposit_release, etc.
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;
      const offset = (input.page - 1) * input.pageSize;

      // Find the frozen wallet for this CP + currency
      const frozenWalletRows = await db
        .select({ id: channelPartnerFrozenWallets.id })
        .from(channelPartnerFrozenWallets)
        .where(
          and(
            eq(channelPartnerFrozenWallets.channelPartnerId, cpId),
            eq(channelPartnerFrozenWallets.currency, input.currency)
          )
        )
        .limit(1);

      if (frozenWalletRows.length === 0) return { items: [], total: 0 };
      const frozenWalletId = frozenWalletRows[0].id;

      const conditions: SQL[] = [
        eq(cpFrozenWalletTransactions.walletId, frozenWalletId),
      ];

      if (input.type) {
        conditions.push(sql`${cpFrozenWalletTransactions.type} = ${input.type}`);
      }

      const whereClause = and(...conditions);

      const [items, totalResult] = await Promise.all([
        db
          .select({
            id: cpFrozenWalletTransactions.id,
            type: cpFrozenWalletTransactions.type,
            amount: cpFrozenWalletTransactions.amount,
            balanceBefore: cpFrozenWalletTransactions.balanceBefore,
            balanceAfter: cpFrozenWalletTransactions.balanceAfter,
            referenceType: cpFrozenWalletTransactions.referenceType,
            referenceId: cpFrozenWalletTransactions.referenceId,
            description: cpFrozenWalletTransactions.description,
            createdAt: cpFrozenWalletTransactions.createdAt,
          })
          .from(cpFrozenWalletTransactions)
          .where(whereClause)
          .orderBy(desc(cpFrozenWalletTransactions.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(cpFrozenWalletTransactions)
          .where(whereClause),
      ]);

      return {
        items,
        total: totalResult[0]?.total ?? 0,
      };
    }),
});
