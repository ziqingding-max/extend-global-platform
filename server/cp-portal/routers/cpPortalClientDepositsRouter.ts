/**
 * CP Portal Client Deposits Router (Task Group D)
 *
 * Allows CP to view and manage End Client deposit (frozen) wallets.
 * CP can:
 * - View deposit balances for their clients
 * - View deposit transaction history
 * - Request deposit releases (creates a release task for EG Admin approval)
 *
 * CP CANNOT:
 * - Directly release deposits (requires EG Admin approval)
 * - View deposits of clients belonging to other CPs
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, count, sql, SQL, inArray } from "drizzle-orm";
import {
  protectedCpProcedure,
  cpFinanceProcedure,
  cpPortalRouter,
} from "../cpPortalTrpc";
import { getDb } from "../../db";
import {
  customers,
  customerWallets,
  walletTransactions,
  customerFrozenWallets,
  frozenWalletTransactions,
} from "../../../drizzle/schema";

export const cpPortalClientDepositsRouter = cpPortalRouter({
  /**
   * List all clients with their deposit (frozen wallet) balances.
   * Scoped to this CP's clients only.
   */
  listClientDeposits: cpFinanceProcedure
    .input(
      z.object({
        currency: z.string().max(3).default("USD"),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;

      // Get all customers belonging to this CP
      const cpCustomers = await db
        .select({ id: customers.id, companyName: customers.companyName })
        .from(customers)
        .where(eq(customers.channelPartnerId, cpId));

      if (cpCustomers.length === 0) return { items: [], total: 0 };

      const customerIds = cpCustomers.map((c) => c.id);
      const customerMap = new Map(cpCustomers.map((c) => [c.id, c.companyName]));

      // Get frozen wallets for these customers
      const frozenWallets = await db
        .select({
          id: customerFrozenWallets.id,
          customerId: customerFrozenWallets.customerId,
          currency: customerFrozenWallets.currency,
          balance: customerFrozenWallets.balance,
          updatedAt: customerFrozenWallets.updatedAt,
        })
        .from(customerFrozenWallets)
        .where(
          and(
            inArray(customerFrozenWallets.customerId, customerIds),
            eq(customerFrozenWallets.currency, input.currency)
          )
        )
        .orderBy(desc(customerFrozenWallets.updatedAt));

      // Also get main wallet balances for context
      const mainWallets = await db
        .select({
          customerId: customerWallets.customerId,
          currency: customerWallets.currency,
          balance: customerWallets.balance,
        })
        .from(customerWallets)
        .where(
          and(
            inArray(customerWallets.customerId, customerIds),
            eq(customerWallets.currency, input.currency)
          )
        );

      const mainWalletMap = new Map(
        mainWallets.map((w) => [w.customerId, w.balance])
      );

      const items = frozenWallets.map((fw) => ({
        frozenWalletId: fw.id,
        customerId: fw.customerId,
        customerName: customerMap.get(fw.customerId) || "Unknown",
        currency: fw.currency,
        frozenBalance: fw.balance,
        mainBalance: mainWalletMap.get(fw.customerId) || "0",
        updatedAt: fw.updatedAt,
      }));

      // Paginate
      const offset = (input.page - 1) * input.pageSize;
      const paginatedItems = items.slice(offset, offset + input.pageSize);

      return {
        items: paginatedItems,
        total: items.length,
      };
    }),

  /**
   * Get deposit transaction history for a specific client.
   * Scoped to this CP's clients only.
   */
  getClientDepositHistory: cpFinanceProcedure
    .input(
      z.object({
        customerId: z.number(),
        currency: z.string().max(3).default("USD"),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0, balance: "0" };

      const cpId = ctx.cpUser.channelPartnerId;

      // Verify customer belongs to this CP
      const customer = await db
        .select({ id: customers.id, companyName: customers.companyName })
        .from(customers)
        .where(
          and(
            eq(customers.id, input.customerId),
            eq(customers.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (customer.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      }

      // Find the frozen wallet
      const frozenWallet = await db
        .select({ id: customerFrozenWallets.id, balance: customerFrozenWallets.balance })
        .from(customerFrozenWallets)
        .where(
          and(
            eq(customerFrozenWallets.customerId, input.customerId),
            eq(customerFrozenWallets.currency, input.currency)
          )
        )
        .limit(1);

      if (frozenWallet.length === 0) {
        return { items: [], total: 0, balance: "0", customerName: customer[0].companyName };
      }

      const walletId = frozenWallet[0].id;
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalResult] = await Promise.all([
        db
          .select({
            id: frozenWalletTransactions.id,
            type: frozenWalletTransactions.type,
            amount: frozenWalletTransactions.amount,
            direction: frozenWalletTransactions.direction,
            balanceBefore: frozenWalletTransactions.balanceBefore,
            balanceAfter: frozenWalletTransactions.balanceAfter,
            description: frozenWalletTransactions.description,
            createdAt: frozenWalletTransactions.createdAt,
          })
          .from(frozenWalletTransactions)
          .where(eq(frozenWalletTransactions.walletId, walletId))
          .orderBy(desc(frozenWalletTransactions.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(frozenWalletTransactions)
          .where(eq(frozenWalletTransactions.walletId, walletId)),
      ]);

      return {
        items,
        total: totalResult[0]?.total ?? 0,
        balance: frozenWallet[0].balance,
        customerName: customer[0].companyName,
      };
    }),

  /**
   * Summary of all client deposits for this CP.
   * Aggregated across all clients and currencies.
   */
  summary: cpFinanceProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) {
      return {
        totalFrozenUsd: 0,
        totalMainUsd: 0,
        clientCount: 0,
      };
    }

    const cpId = ctx.cpUser.channelPartnerId;

    // Get all customer IDs for this CP
    const cpCustomers = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.channelPartnerId, cpId));

    if (cpCustomers.length === 0) {
      return { totalFrozenUsd: 0, totalMainUsd: 0, clientCount: 0 };
    }

    const customerIds = cpCustomers.map((c) => c.id);

    const [frozenWallets, mainWallets] = await Promise.all([
      db
        .select({ balance: customerFrozenWallets.balance })
        .from(customerFrozenWallets)
        .where(inArray(customerFrozenWallets.customerId, customerIds)),
      db
        .select({ balance: customerWallets.balance })
        .from(customerWallets)
        .where(inArray(customerWallets.customerId, customerIds)),
    ]);

    const totalFrozen = frozenWallets.reduce(
      (sum, w) => sum + parseFloat(w.balance),
      0
    );
    const totalMain = mainWallets.reduce(
      (sum, w) => sum + parseFloat(w.balance),
      0
    );

    return {
      totalFrozenUsd: totalFrozen,
      totalMainUsd: totalMain,
      clientCount: cpCustomers.length,
    };
  }),
});
