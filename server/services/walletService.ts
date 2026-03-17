import { eq, sql, and } from "drizzle-orm";
import { getDb } from "./db/connection";
import {
  customerWallets,
  walletTransactions,
  customerFrozenWallets,
  frozenWalletTransactions,
  invoices,
  type WalletTransaction,
  type CustomerWallet,
  type FrozenWalletTransaction,
} from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";

export type WalletTransactionType = WalletTransaction["type"];
export type FrozenWalletTransactionType = FrozenWalletTransaction["type"];

export class WalletService {
  /**
   * Get or create a wallet for a customer and currency.
   * Accepts an optional transaction object to participate in an outer transaction.
   */
  async getWallet(customerId: number, currency: string, externalTx?: any) {
    const db = externalTx || getDb();
    if (!db) throw new Error("Database not initialized");

    const existing = await db.query.customerWallets.findFirst({
      where: (t: any, { and, eq }: any) => and(eq(t.customerId, customerId), eq(t.currency, currency)),
    });

    if (existing) return existing;

    // Create new wallet if not exists
    // Use upsert to handle race conditions during creation
    const [inserted] = await db
      .insert(customerWallets)
      .values({
        customerId,
        currency,
        balance: "0",
        version: 1,
      })
      .onConflictDoUpdate({
        target: [customerWallets.customerId, customerWallets.currency],
        set: { updatedAt: new Date() }, // Dummy update to return existing
      })
      .returning();

    return inserted;
  }

  /**
   * Core wallet transaction logic that operates on a given transaction context.
   * This is the internal implementation shared by both standalone and nested-tx paths.
   */
  private async _transactWithTx(tx: any, params: {
    walletId: number;
    type: WalletTransactionType;
    amount: string;
    direction: "credit" | "debit";
    referenceId: number;
    referenceType: WalletTransaction["referenceType"];
    description?: string;
    internalNote?: string;
    createdBy?: number;
  }) {
    const amountNum = parseFloat(params.amount);
    if (amountNum <= 0) throw new Error("Transaction amount must be positive");

    // 1. Get current wallet state with lock
    const wallet = await tx.query.customerWallets.findFirst({
      where: eq(customerWallets.id, params.walletId),
    });

    if (!wallet) throw new Error(`Wallet ${params.walletId} not found`);

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
          message: `Insufficient wallet balance. Current: ${currentBalance}, Required: ${amountNum}`,
        });
      }
    }

    // 2. Update wallet balance with optimistic locking
    const result = await tx
      .update(customerWallets)
      .set({
        balance: newBalance.toFixed(2),
        version: wallet.version + 1,
      })
      .where(
        // Ensure version hasn't changed since read
        and(eq(customerWallets.id, params.walletId), eq(customerWallets.version, wallet.version))
      );

    if (result.rowsAffected === 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Wallet balance was updated concurrently. Please try again.",
      });
    }

    // 3. Record transaction
    const [transaction] = await tx
      .insert(walletTransactions)
      .values({
        walletId: params.walletId,
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
  async transact(params: {
    walletId: number;
    type: WalletTransactionType;
    amount: string; // Always positive
    direction: "credit" | "debit";
    referenceId: number;
    referenceType: WalletTransaction["referenceType"];
    description?: string;
    internalNote?: string;
    createdBy?: number;
  }, externalTx?: any) {
    if (externalTx) {
      // Use the provided external transaction — no nested db.transaction()
      return await this._transactWithTx(externalTx, params);
    }

    // Standalone: create our own transaction
    const db = getDb();
    if (!db) throw new Error("Database not initialized");
    return await db.transaction(async (tx: any) => {
      return await this._transactWithTx(tx, params);
    });
  }

  /**
   * Auto-deduct from wallet for an invoice
   * Returns the amount deducted
   */
  async attemptAutoDeduction(invoiceId: number, customerId: number, currency: string, totalAmount: string) {
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    const wallet = await this.getWallet(customerId, currency);
    const balance = parseFloat(wallet.balance);
    const total = parseFloat(totalAmount);

    if (balance <= 0) return "0";

    // Look up the human-readable invoice number
    let invoiceLabel = `#${invoiceId}`;
    const invoiceRecord = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (invoiceRecord.length > 0 && invoiceRecord[0].invoiceNumber) {
      invoiceLabel = invoiceRecord[0].invoiceNumber;
    }

    // Calculate deduction amount: min(balance, invoiceTotal)
    const deductionAmount = Math.min(balance, total).toFixed(2);

    if (parseFloat(deductionAmount) > 0) {
      await this.transact({
        walletId: wallet.id,
        type: "invoice_deduction",
        amount: deductionAmount,
        direction: "debit",
        referenceId: invoiceId,
        referenceType: "invoice",
        description: `Auto-deduction for Invoice ${invoiceLabel}`,
      });
    }

    return deductionAmount;
  }

  /**
   * Refund a deduction (e.g. when invoice is rejected)
   */
  async refundDeduction(invoiceId: number, customerId: number, currency: string, amount: string) {
    if (parseFloat(amount) <= 0) return;

    const db = getDb();
    // Look up the human-readable invoice number
    let invoiceLabel = `#${invoiceId}`;
    if (db) {
      const invoiceRecord = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (invoiceRecord.length > 0 && invoiceRecord[0].invoiceNumber) {
        invoiceLabel = invoiceRecord[0].invoiceNumber;
      }
    }

    const wallet = await this.getWallet(customerId, currency);

    await this.transact({
      walletId: wallet.id,
      type: "invoice_refund",
      amount: amount,
      direction: "credit",
      referenceId: invoiceId,
      referenceType: "invoice",
      description: `Refund for rejected/voided Invoice ${invoiceLabel}`,
    });
  }

  // ── Frozen Wallet Methods ─────────────────────────────────────────────

  /**
   * Get or create a frozen wallet for a customer and currency.
   * Accepts an optional transaction object to participate in an outer transaction.
   */
  async getFrozenWallet(customerId: number, currency: string, externalTx?: any) {
    const db = externalTx || getDb();
    if (!db) throw new Error("Database not initialized");

    const existing = await db.query.customerFrozenWallets.findFirst({
      where: (t: any, { and, eq }: any) => and(eq(t.customerId, customerId), eq(t.currency, currency)),
    });

    if (existing) return existing;

    // Create new frozen wallet if not exists
    const [inserted] = await db
      .insert(customerFrozenWallets)
      .values({
        customerId,
        currency,
        balance: "0",
        version: 1,
      })
      .onConflictDoUpdate({
        target: [customerFrozenWallets.customerId, customerFrozenWallets.currency],
        set: { updatedAt: new Date() },
      })
      .returning();

    return inserted;
  }

  /**
   * Core frozen wallet transaction logic that operates on a given transaction context.
   */
  private async _frozenTransactWithTx(tx: any, params: {
    walletId: number;
    type: FrozenWalletTransactionType;
    amount: string;
    direction: "credit" | "debit";
    referenceId: number;
    referenceType: string;
    description?: string;
    internalNote?: string;
    createdBy?: number;
  }) {
    const amountNum = parseFloat(params.amount);
    if (amountNum <= 0) throw new Error("Transaction amount must be positive");

    // 1. Get current wallet state with lock
    const wallet = await tx.query.customerFrozenWallets.findFirst({
      where: eq(customerFrozenWallets.id, params.walletId),
    });

    if (!wallet) throw new Error(`Frozen Wallet ${params.walletId} not found`);

    const currentBalance = parseFloat(wallet.balance);
    let newBalance = currentBalance;

    if (params.direction === "credit") {
      newBalance += amountNum;
    } else {
      newBalance -= amountNum;
      if (newBalance < 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Insufficient frozen wallet balance. Current: ${currentBalance}, Required: ${amountNum}`,
        });
      }
    }

    // 2. Update wallet balance with optimistic locking
    const result = await tx
      .update(customerFrozenWallets)
      .set({
        balance: newBalance.toFixed(2),
        version: wallet.version + 1,
      })
      .where(
        and(eq(customerFrozenWallets.id, params.walletId), eq(customerFrozenWallets.version, wallet.version))
      );

    if (result.rowsAffected === 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Frozen Wallet balance was updated concurrently. Please try again.",
      });
    }

    // 3. Record transaction
    const [transaction] = await tx
      .insert(frozenWalletTransactions)
      .values({
        walletId: params.walletId,
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
   * Accepts an optional external transaction object to avoid nested transactions (SQLITE_BUSY).
   */
  async frozenTransact(params: {
    walletId: number;
    type: FrozenWalletTransactionType;
    amount: string; // Always positive
    direction: "credit" | "debit";
    referenceId: number;
    referenceType: string;
    description?: string;
    internalNote?: string;
    createdBy?: number;
  }, externalTx?: any) {
    if (externalTx) {
      // Use the provided external transaction — no nested db.transaction()
      return await this._frozenTransactWithTx(externalTx, params);
    }

    // Standalone: create our own transaction
    const db = getDb();
    if (!db) throw new Error("Database not initialized");
    return await db.transaction(async (tx: any) => {
      return await this._frozenTransactWithTx(tx, params);
    });
  }

  /**
   * Deposit funds into frozen wallet (e.g. from paid deposit invoice)
   */
  async depositToFrozen(customerId: number, currency: string, amount: string, invoiceId: number, createdBy?: number) {
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    // Idempotency check: prevent duplicate deposit_in for the same invoice
    const existingTx = await db.query.frozenWalletTransactions.findFirst({
      where: (t: any, { and, eq }: any) => and(
        eq(t.type, "deposit_in"),
        eq(t.referenceId, invoiceId),
        eq(t.referenceType, "invoice")
      ),
    });
    if (existingTx) {
      console.warn(`[WalletService] Skipping duplicate depositToFrozen for invoice #${invoiceId} — transaction #${existingTx.id} already exists.`);
      return { wallet: null, transaction: existingTx, skipped: true };
    }

    // Look up the human-readable invoice number
    let invoiceLabel = `#${invoiceId}`;
    const invoiceRecord = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (invoiceRecord.length > 0 && invoiceRecord[0].invoiceNumber) {
      invoiceLabel = invoiceRecord[0].invoiceNumber;
    }

    const wallet = await this.getFrozenWallet(customerId, currency);
    return await this.frozenTransact({
      walletId: wallet.id,
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
   * Release funds from frozen wallet to a credit note (e.g. after employee termination)
   * The Credit Note will then be processed by Finance to either credit Main Wallet or refund to Bank.
   * Accepts an optional external transaction object to avoid nested transactions.
   */
  async releaseDepositToCreditNote(customerId: number, currency: string, amount: string, creditNoteId: number, reason: string, createdBy?: number, externalTx?: any) {
    // Look up the human-readable credit note number
    const db = externalTx || getDb();
    let cnLabel = `#${creditNoteId}`;
    if (db) {
      const cnRecord = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, creditNoteId)).limit(1);
      if (cnRecord.length > 0 && cnRecord[0].invoiceNumber) {
        cnLabel = cnRecord[0].invoiceNumber;
      }
    }

    const frozenWallet = await this.getFrozenWallet(customerId, currency, externalTx);

    return await this.frozenTransact({
      walletId: frozenWallet.id,
      type: "deposit_release",
      amount,
      direction: "debit",
      referenceId: creditNoteId,
      referenceType: "credit_note",
      description: `Deposit released to Credit Note ${cnLabel}: ${reason}`,
      createdBy,
    }, externalTx);
  }

  /**
   * Withdraw funds from main wallet (Refund Out)
   */
  async withdrawFromWallet(customerId: number, currency: string, amount: string, reason: string, createdBy?: number) {
    const wallet = await this.getWallet(customerId, currency);
    
    return await this.transact({
      walletId: wallet.id,
      type: "payout", // or "refund_out"
      amount,
      direction: "debit",
      referenceId: 0, // Manual withdrawal request
      referenceType: "manual",
      description: `Withdrawal (Refund Out): ${reason}`,
      createdBy,
    });
  }

  /**
   * Release funds from frozen wallet directly to main wallet.
   * This is an atomic operation: debit frozen wallet + credit main wallet in a single transaction.
   */
  async releaseFrozenToMain(customerId: number, currency: string, amount: string, reason: string, createdBy?: number) {
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    return await db.transaction(async (tx: any) => {
      // 1. Debit from frozen wallet
      const frozenWallet = await this.getFrozenWallet(customerId, currency, tx);
      await this._frozenTransactWithTx(tx, {
        walletId: frozenWallet.id,
        type: "deposit_release",
        amount,
        direction: "debit",
        referenceId: 0,
        referenceType: "manual",
        description: `Released to operating account: ${reason}`,
        createdBy,
      });

      // 2. Credit to main wallet
      const mainWallet = await this.getWallet(customerId, currency, tx);
      const result = await this._transactWithTx(tx, {
        walletId: mainWallet.id,
        type: "manual_adjustment",
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
}

export const walletService = new WalletService();
