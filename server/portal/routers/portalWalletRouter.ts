import { z } from "zod";
import { portalRouter, protectedPortalProcedure } from "../portalTrpc";
import { walletService } from "../../services/walletService";
import { getDb } from "../../db";
import { walletTransactions, invoices } from "../../../drizzle/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getInvoiceById } from "../../services/db/financeService";

export const portalWalletRouter = portalRouter({
  get: protectedPortalProcedure
    .input(z.object({
      currency: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      // Security: Always use ctx.portalUser.customerId
      const customerId = ctx.portalUser.customerId;
      const [wallet, frozenWallet] = await Promise.all([
        walletService.getWallet(customerId, input.currency),
        walletService.getFrozenWallet(customerId, input.currency),
      ]);
      return {
        ...wallet,
        frozenBalance: frozenWallet?.balance ?? "0",
      };
    }),

  payWithWallet: protectedPortalProcedure
    .input(z.object({
      invoiceId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

      const customerId = ctx.portalUser.customerId;

      // 1. Verify invoice belongs to this customer and is payable
      const invoice = await getInvoiceById(input.invoiceId);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (invoice.customerId !== customerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "void") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Invoice is already ${invoice.status}` });
      }

      // 2. Calculate how much to deduct
      const total = parseFloat(invoice.total?.toString() || "0");
      const currentPaid = parseFloat(invoice.paidAmount?.toString() || "0");
      const currentWalletApplied = parseFloat(invoice.walletAppliedAmount?.toString() || "0");
      const remainingDue = Math.max(0, total - currentPaid - currentWalletApplied);

      if (remainingDue <= 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No balance due on this invoice" });
      }

      // 3. Check wallet balance
      const wallet = await walletService.getWallet(customerId, invoice.currency);
      const walletBal = parseFloat(wallet.balance);
      if (walletBal <= 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Insufficient wallet balance" });
      }

      // Deduct the lesser of wallet balance and remaining due
      const deductAmount = Math.min(walletBal, remainingDue);

      // 4. Execute wallet deduction AND invoice update in a single transaction
      const newWalletApplied = currentWalletApplied + deductAmount;
      const newRemainingDue = Math.max(0, total - currentPaid - newWalletApplied);
      const newStatus = newRemainingDue <= 0.01 ? "paid" : invoice.status;

      await db.transaction(async (tx: any) => {
        // 4a. Deduct from wallet (within transaction)
        await walletService.transact({
          walletId: wallet.id,
          type: "invoice_deduction",
          amount: deductAmount.toFixed(2),
          direction: "debit",
          referenceId: invoice.id,
          referenceType: "invoice",
          description: `Wallet payment for Invoice #${invoice.invoiceNumber}`,
          createdBy: ctx.portalUser.contactId,
        }, tx);

        // 4b. Update invoice (within same transaction)
        const updateData: any = {
          walletAppliedAmount: newWalletApplied.toFixed(2),
          amountDue: newRemainingDue.toFixed(2),
          status: newStatus,
        };
        if (newStatus === "paid") {
          updateData.paidDate = new Date();
        }
        await tx.update(invoices).set(updateData).where(eq(invoices.id, invoice.id));
      });

      return {
        success: true,
        deducted: deductAmount.toFixed(2),
        newStatus,
        remainingDue: newRemainingDue.toFixed(2),
      };
    }),

  listTransactions: protectedPortalProcedure
    .input(z.object({
      currency: z.string(),
      limit: z.number().default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

      const wallet = await walletService.getWallet(ctx.portalUser.customerId, input.currency);

      // Bug 4&5 fix: Join with invoices table to get invoiceNumber for display
      const txs = await db.query.walletTransactions.findMany({
        where: eq(walletTransactions.walletId, wallet.id),
        orderBy: [desc(walletTransactions.createdAt)],
        limit: input.limit,
        offset: input.offset,
      });

      // Enrich transactions with invoiceNumber when referenceType is "invoice"
      const invoiceRefIds = txs
        .filter((tx: any) => tx.referenceType === "invoice" && tx.referenceId)
        .map((tx: any) => tx.referenceId);

      let invoiceNumberMap: Record<number, string> = {};
      if (invoiceRefIds.length > 0) {
        const invRows = await db
          .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
          .from(invoices)
          .where(sql`${invoices.id} IN (${sql.join(invoiceRefIds.map((id: number) => sql`${id}`), sql`, `)})`);

        for (const row of invRows) {
          invoiceNumberMap[row.id] = row.invoiceNumber;
        }
      }

      return txs.map((tx: any) => ({
        ...tx,
        // Replace internal referenceId display with human-readable invoiceNumber
        invoiceNumber: tx.referenceType === "invoice" && tx.referenceId
          ? invoiceNumberMap[tx.referenceId] || null
          : null,
      }));
    }),
});
