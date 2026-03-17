import { z } from "zod";
import { router } from "../../_core/trpc";
import { financeManagerProcedure, userProcedure } from "../../procedures";
import { TRPCError } from "@trpc/server";
import { walletService } from "../../services/walletService";
import { getDb } from "../../db";
import { walletTransactions, customerWallets, frozenWalletTransactions } from "../../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

export const walletRouter = router({
  get: userProcedure
    .input(z.object({
      customerId: z.number(),
      currency: z.string(),
    }))
    .query(async ({ input }) => {
      return await walletService.getWallet(input.customerId, input.currency);
    }),

  getFrozen: userProcedure
    .input(z.object({
      customerId: z.number(),
      currency: z.string(),
    }))
    .query(async ({ input }) => {
      return await walletService.getFrozenWallet(input.customerId, input.currency);
    }),

  listTransactions: userProcedure
    .input(z.object({
      walletId: z.number(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

      return await db.query.walletTransactions.findMany({
        where: eq(walletTransactions.walletId, input.walletId),
        orderBy: [desc(walletTransactions.createdAt)],
        limit: input.limit,
        offset: input.offset,
      });
    }),

  listFrozenTransactions: userProcedure
    .input(z.object({
      walletId: z.number(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

      return await db.query.frozenWalletTransactions.findMany({
        where: eq(frozenWalletTransactions.walletId, input.walletId),
        orderBy: [desc(frozenWalletTransactions.createdAt)],
        limit: input.limit,
        offset: input.offset,
      });
    }),

  // Admin manual adjustment
  manualAdjustment: financeManagerProcedure
    .input(z.object({
      customerId: z.number(),
      currency: z.string(),
      amount: z.string(), // Positive number
      direction: z.enum(["credit", "debit"]),
      description: z.string(),
      internalNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const wallet = await walletService.getWallet(input.customerId, input.currency);
      
      return await walletService.transact({
        walletId: wallet.id,
        type: "manual_adjustment",
        amount: input.amount,
        direction: input.direction,
        referenceId: 0, // 0 for manual adjustments
        referenceType: "manual",
        description: input.description,
        internalNote: input.internalNote,
        createdBy: ctx.user.id,
      });
    }),

  // Admin manual frozen adjustment
  manualFrozenAdjustment: financeManagerProcedure
    .input(z.object({
      customerId: z.number(),
      currency: z.string(),
      amount: z.string(), // Positive number
      direction: z.enum(["credit", "debit"]),
      description: z.string(),
      internalNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const wallet = await walletService.getFrozenWallet(input.customerId, input.currency);
      
      return await walletService.frozenTransact({
        walletId: wallet.id,
        type: "manual_adjustment",
        amount: input.amount,
        direction: input.direction,
        referenceId: 0, // 0 for manual adjustments
        referenceType: "manual",
        description: input.description,
        internalNote: input.internalNote,
        createdBy: ctx.user.id,
      });
    }),

  // Release frozen funds to main wallet
  releaseFrozen: financeManagerProcedure
    .input(z.object({
      customerId: z.number(),
      currency: z.string(),
      amount: z.string(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await walletService.releaseFrozenToMain(
        input.customerId,
        input.currency,
        input.amount,
        input.reason,
        ctx.user.id
      );
      return { success: true };
    }),
});
