/**
 * Channel Partner Wallet Service
 *
 * Manages prepayment wallets and frozen deposit wallets for Channel Partners.
 * This is a parallel implementation to walletService.ts (which handles End Client wallets),
 * operating on channel_partner_wallets and channel_partner_frozen_wallets tables.
 *
 * Architecture mirrors walletService.ts exactly:
 * - Lazy wallet creation with upsert
 * - Optimistic locking via `version` field
 * - Immutable ledger inserts after each balance update
 * - Transaction-aware methods (optional externalTx to avoid SQLITE_BUSY)
 * - Strict negative-balance prevention
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "./db/connection";
import {
  channelPartnerWallets,
  cpWalletTransactions,
  channelPartnerFrozenWallets,
  cpFrozenWalletTransactions,
  invoices,
  type CpWalletTransaction,
  type ChannelPartnerWallet,
  type CpFrozenWalletTransaction,
} from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";

export type CpWalletTransactionType = CpWalletTransaction["type"];
export type CpFrozenWalletTransactionType = CpFrozenWalletTransaction["type"];

export class CpWalletService {
  // ── Main Wallet Methods ─────────────────────────────────────────────

  /**
   * Get or create a wallet for a Channel Partner and currency.
   * Accepts an optional transaction object to participate in an outer transaction.
   */
  async getWallet(channelPartnerId: number, currency: string, externalTx?: any) {
    const db = externalTx || getDb();
    if (!db) throw new Error("Database not initialized");

    const existing = await db.query.channelPartnerWallets.findFirst({
      where: (t: any, { and, eq }: any) =>
        and(eq(t.channelPartnerId, channelPartnerId), eq(t.currency, currency)),
    });

    if (existing) return existing;

    // Create new wallet if not exists — upsert handles race conditions
    const [inserted] = await db
      .insert(channelPartnerWallets)
      .values({
        channelPartnerId,
        currency,
        balance: "0",
        version: 1,
      })
      .onConflictDoUpdate({
        target: [channelPartnerWallets.channelPartnerId, channelPartnerWallets.currency],
        set: { updatedAt: new Date() }, // Dummy update to return existing
      })
      .returning();

    return inserted;
  }

  /**
   * Core wallet transaction logic that operates on a given transaction context.
   * This is the internal implementation shared by both standalone and nested-tx paths.
   */
  private async _transactWithTx(
    tx: any,
    params: {
      walletId: number;
      channelPartnerId: number;
      type: CpWalletTransactionType;
      amount: string;
      direction: "credit" | "debit";
      referenceId: number;
      referenceType: CpWalletTransaction["referenceType"];
      description?: string;
      internalNote?: string;
      createdBy?: number;
    }
  ) {
    const amountNum = parseFloat(params.amount);
    if (amountNum <= 0) throw new Error("Transaction amount must be positive");

    // 1. Get current wallet state
    const wallet = await tx.query.channelPartnerWallets.findFirst({
      where: eq(channelPartnerWallets.id, params.walletId),
    });

    if (!wallet) throw new Error(`CP Wallet ${params.walletId} not found`);

    const currentBalance = parseFloat(wallet.balance);
    let newBalance = currentBalance;

    if (params.direction === "credit") {
      newBalance += amountNum;
    } else {
      newBalance -= amountNum;
      // Prevent negative balance (strict mode)
      if (newBalance < 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Insufficient CP wallet balance. Current: ${currentBalance}, Required: ${amountNum}`,
        });
      }
    }

    // 2. Update wallet balance with optimistic locking
    const result = await tx
      .update(channelPartnerWallets)
      .set({
        balance: newBalance.toFixed(2),
        version: wallet.version + 1,
      })
      .where(
        and(
          eq(channelPartnerWallets.id, params.walletId),
          eq(channelPartnerWallets.version, wallet.version)
        )
      );

    if (result.rowsAffected === 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "CP Wallet balance was updated concurrently. Please try again.",
      });
    }

    // 3. Record immutable transaction
    const [transaction] = await tx
      .insert(cpWalletTransactions)
      .values({
        walletId: params.walletId,
        channelPartnerId: params.channelPartnerId,
        type: params.type,
        amount: params.amount,
        direction: params.direction,
        balanceBefore: currentBalance.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        referenceId: params.referenceId,
        referenceType: params.referenceType,
        description: params.description,
        internalNote: params.internalNote,
        createdBy: params.createdBy,
      })
      .returning();

    return { wallet: { ...wallet, balance: newBalance.toFixed(2) }, transaction };
  }

  /**
   * Execute a wallet transaction with optimistic locking.
   * Accepts an optional external transaction object to avoid nested transactions (SQLITE_BUSY).
   */
  async transact(
    params: {
      walletId: number;
      channelPartnerId: number;
      type: CpWalletTransactionType;
      amount: string; // Always positive
      direction: "credit" | "debit";
      referenceId: number;
      referenceType: CpWalletTransaction["referenceType"];
      description?: string;
      internalNote?: string;
      createdBy?: number;
    },
    externalTx?: any
  ) {
    if (externalTx) {
      return await this._transactWithTx(externalTx, params);
    }

    const db = getDb();
    if (!db) throw new Error("Database not initialized");
    return await db.transaction(async (tx: any) => {
      return await this._transactWithTx(tx, params);
    });
  }

  /**
   * Top up the CP wallet (e.g. from bank transfer confirmation)
   */
  async topUp(
    channelPartnerId: number,
    currency: string,
    amount: string,
    description: string,
    createdBy?: number
  ) {
    const wallet = await this.getWallet(channelPartnerId, currency);
    return await this.transact({
      walletId: wallet.id,
      channelPartnerId,
      type: "top_up",
      amount,
      direction: "credit",
      referenceId: 0,
      referenceType: "payment",
      description,
      createdBy,
    });
  }

  /**
   * Deduct from wallet for an EG→CP invoice payment
   */
  async deductForInvoice(
    channelPartnerId: number,
    currency: string,
    amount: string,
    invoiceId: number,
    createdBy?: number
  ) {
    const db = getDb();
    // Look up the human-readable invoice number
    let invoiceLabel = `#${invoiceId}`;
    if (db) {
      const invoiceRecord = await db
        .select({ invoiceNumber: invoices.invoiceNumber })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      if (invoiceRecord.length > 0 && invoiceRecord[0].invoiceNumber) {
        invoiceLabel = invoiceRecord[0].invoiceNumber;
      }
    }

    const wallet = await this.getWallet(channelPartnerId, currency);
    return await this.transact({
      walletId: wallet.id,
      channelPartnerId,
      type: "invoice_deduction",
      amount,
      direction: "debit",
      referenceId: invoiceId,
      referenceType: "invoice",
      description: `Deduction for Invoice ${invoiceLabel}`,
      createdBy,
    });
  }

  /**
   * Refund a deduction (e.g. when invoice is rejected/voided)
   */
  async refundDeduction(
    channelPartnerId: number,
    currency: string,
    amount: string,
    invoiceId: number,
    createdBy?: number
  ) {
    if (parseFloat(amount) <= 0) return;

    const db = getDb();
    let invoiceLabel = `#${invoiceId}`;
    if (db) {
      const invoiceRecord = await db
        .select({ invoiceNumber: invoices.invoiceNumber })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      if (invoiceRecord.length > 0 && invoiceRecord[0].invoiceNumber) {
        invoiceLabel = invoiceRecord[0].invoiceNumber;
      }
    }

    const wallet = await this.getWallet(channelPartnerId, currency);
    return await this.transact({
      walletId: wallet.id,
      channelPartnerId,
      type: "invoice_refund",
      amount,
      direction: "credit",
      referenceId: invoiceId,
      referenceType: "invoice",
      description: `Refund for rejected/voided Invoice ${invoiceLabel}`,
      createdBy,
    });
  }

  /**
   * Manual adjustment by admin
   */
  async manualAdjustment(
    channelPartnerId: number,
    currency: string,
    amount: string,
    direction: "credit" | "debit",
    description: string,
    createdBy?: number,
    internalNote?: string
  ) {
    const wallet = await this.getWallet(channelPartnerId, currency);
    return await this.transact({
      walletId: wallet.id,
      channelPartnerId,
      type: "manual_adjustment",
      amount,
      direction,
      referenceId: 0,
      referenceType: "manual",
      description,
      internalNote,
      createdBy,
    });
  }

  // ── Frozen Wallet Methods ─────────────────────────────────────────────

  /**
   * Get or create a frozen wallet for a Channel Partner and currency.
   */
  async getFrozenWallet(channelPartnerId: number, currency: string, externalTx?: any) {
    const db = externalTx || getDb();
    if (!db) throw new Error("Database not initialized");

    const existing = await db.query.channelPartnerFrozenWallets.findFirst({
      where: (t: any, { and, eq }: any) =>
        and(eq(t.channelPartnerId, channelPartnerId), eq(t.currency, currency)),
    });

    if (existing) return existing;

    const [inserted] = await db
      .insert(channelPartnerFrozenWallets)
      .values({
        channelPartnerId,
        currency,
        balance: "0",
        version: 1,
      })
      .onConflictDoUpdate({
        target: [channelPartnerFrozenWallets.channelPartnerId, channelPartnerFrozenWallets.currency],
        set: { updatedAt: new Date() },
      })
      .returning();

    return inserted;
  }

  /**
   * Core frozen wallet transaction logic.
   */
  private async _frozenTransactWithTx(
    tx: any,
    params: {
      walletId: number;
      channelPartnerId: number;
      type: CpFrozenWalletTransactionType;
      amount: string;
      direction: "credit" | "debit";
      referenceId: number;
      referenceType: string;
      description?: string;
      internalNote?: string;
      createdBy?: number;
    }
  ) {
    const amountNum = parseFloat(params.amount);
    if (amountNum <= 0) throw new Error("Transaction amount must be positive");

    const wallet = await tx.query.channelPartnerFrozenWallets.findFirst({
      where: eq(channelPartnerFrozenWallets.id, params.walletId),
    });

    if (!wallet) throw new Error(`CP Frozen Wallet ${params.walletId} not found`);

    const currentBalance = parseFloat(wallet.balance);
    let newBalance = currentBalance;

    if (params.direction === "credit") {
      newBalance += amountNum;
    } else {
      newBalance -= amountNum;
      if (newBalance < 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Insufficient CP frozen wallet balance. Current: ${currentBalance}, Required: ${amountNum}`,
        });
      }
    }

    // Optimistic locking update
    const result = await tx
      .update(channelPartnerFrozenWallets)
      .set({
        balance: newBalance.toFixed(2),
        version: wallet.version + 1,
      })
      .where(
        and(
          eq(channelPartnerFrozenWallets.id, params.walletId),
          eq(channelPartnerFrozenWallets.version, wallet.version)
        )
      );

    if (result.rowsAffected === 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "CP Frozen Wallet balance was updated concurrently. Please try again.",
      });
    }

    // Immutable ledger entry
    const [transaction] = await tx
      .insert(cpFrozenWalletTransactions)
      .values({
        walletId: params.walletId,
        channelPartnerId: params.channelPartnerId,
        type: params.type,
        amount: params.amount,
        direction: params.direction,
        balanceBefore: currentBalance.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        referenceId: params.referenceId,
        referenceType: params.referenceType,
        description: params.description,
        internalNote: params.internalNote,
        createdBy: params.createdBy,
      })
      .returning();

    return { wallet: { ...wallet, balance: newBalance.toFixed(2) }, transaction };
  }

  /**
   * Execute a frozen wallet transaction with optimistic locking.
   */
  async frozenTransact(
    params: {
      walletId: number;
      channelPartnerId: number;
      type: CpFrozenWalletTransactionType;
      amount: string;
      direction: "credit" | "debit";
      referenceId: number;
      referenceType: string;
      description?: string;
      internalNote?: string;
      createdBy?: number;
    },
    externalTx?: any
  ) {
    if (externalTx) {
      return await this._frozenTransactWithTx(externalTx, params);
    }

    const db = getDb();
    if (!db) throw new Error("Database not initialized");
    return await db.transaction(async (tx: any) => {
      return await this._frozenTransactWithTx(tx, params);
    });
  }

  /**
   * Deposit funds into frozen wallet (e.g. from paid deposit invoice)
   */
  async depositToFrozen(
    channelPartnerId: number,
    currency: string,
    amount: string,
    invoiceId: number,
    createdBy?: number
  ) {
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    // Idempotency check: prevent duplicate deposit_in for the same invoice
    const existingTx = await db.query.cpFrozenWalletTransactions.findFirst({
      where: (t: any, { and, eq }: any) =>
        and(
          eq(t.type, "deposit_in"),
          eq(t.referenceId, invoiceId),
          eq(t.referenceType, "invoice")
        ),
    });
    if (existingTx) {
      console.warn(
        `[CpWalletService] Skipping duplicate depositToFrozen for invoice #${invoiceId} — transaction #${existingTx.id} already exists.`
      );
      return { wallet: null, transaction: existingTx, skipped: true };
    }

    // Look up human-readable invoice number
    let invoiceLabel = `#${invoiceId}`;
    const invoiceRecord = await db
      .select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    if (invoiceRecord.length > 0 && invoiceRecord[0].invoiceNumber) {
      invoiceLabel = invoiceRecord[0].invoiceNumber;
    }

    const wallet = await this.getFrozenWallet(channelPartnerId, currency);
    return await this.frozenTransact({
      walletId: wallet.id,
      channelPartnerId,
      type: "deposit_in",
      amount,
      direction: "credit",
      referenceId: invoiceId,
      referenceType: "invoice",
      description: `Deposit received from Invoice ${invoiceLabel}`,
      createdBy,
    });
  }

  /**
   * Release funds from frozen wallet directly to main wallet.
   * Atomic operation: debit frozen + credit main in a single transaction.
   */
  async releaseFrozenToMain(
    channelPartnerId: number,
    currency: string,
    amount: string,
    reason: string,
    createdBy?: number
  ) {
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    return await db.transaction(async (tx: any) => {
      // 1. Debit from frozen wallet
      const frozenWallet = await this.getFrozenWallet(channelPartnerId, currency, tx);
      await this._frozenTransactWithTx(tx, {
        walletId: frozenWallet.id,
        channelPartnerId,
        type: "deposit_release",
        amount,
        direction: "debit",
        referenceId: 0,
        referenceType: "manual",
        description: `Released to operating account: ${reason}`,
        createdBy,
      });

      // 2. Credit to main wallet
      const mainWallet = await this.getWallet(channelPartnerId, currency, tx);
      const result = await this._transactWithTx(tx, {
        walletId: mainWallet.id,
        channelPartnerId,
        type: "deposit_release",
        amount,
        direction: "credit",
        referenceId: 0,
        referenceType: "manual",
        description: `Received from frozen deposit: ${reason}`,
        createdBy,
      });

      return result;
    });
  }

  /**
   * Withdraw funds from main wallet (Refund Out)
   */
  async withdrawFromWallet(
    channelPartnerId: number,
    currency: string,
    amount: string,
    reason: string,
    createdBy?: number
  ) {
    const wallet = await this.getWallet(channelPartnerId, currency);
    return await this.transact({
      walletId: wallet.id,
      channelPartnerId,
      type: "payout",
      amount,
      direction: "debit",
      referenceId: 0,
      referenceType: "manual",
      description: `Withdrawal (Refund Out): ${reason}`,
      createdBy,
    });
  }
}

export const cpWalletService = new CpWalletService();
