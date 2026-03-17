/**
 * Reconciliation Router
 *
 * Provides endpoints for dual-currency reconciliation:
 *   - Get reconciliation summary for a payroll month
 *   - Suggest auto-matches (Invoice ↔ Vendor Bill)
 *   - Execute a single reconciliation match
 *   - Batch reconcile all high-confidence matches
 *   - Un-reconcile (reset) a vendor bill
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure, userProcedure } from "../procedures";
import {
  suggestReconciliationMatches,
  executeReconciliation,
  batchReconcile,
  getReconciliationSummary,
  unreconciledVendorBill,
} from "../services/reconciliationEngine";
import { logAuditAction } from "../services/db/commonService";

export const reconciliationRouter = router({
  /**
   * Get reconciliation summary for a payroll month.
   * Returns counts of matched/unmatched bills and invoices, total variance, FX gain/loss.
   */
  summary: userProcedure
    .input(z.object({ payrollMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ input }) => {
      return getReconciliationSummary(input.payrollMonth);
    }),

  /**
   * Suggest reconciliation matches for a payroll month.
   * Returns a list of potential Invoice ↔ Vendor Bill matches with confidence scores.
   */
  suggestMatches: userProcedure
    .input(z.object({ payrollMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ input }) => {
      return suggestReconciliationMatches(input.payrollMonth);
    }),

  /**
   * Execute a single reconciliation match.
   * Links a vendor bill to an invoice and calculates variance + FX gain/loss.
   */
  execute: financeManagerProcedure
    .input(
      z.object({
        vendorBillId: z.number(),
        invoiceId: z.number(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await executeReconciliation(
        input.vendorBillId,
        input.invoiceId,
        input.note,
      );

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "reconcile",
        entityType: "vendor_bill",
        entityId: input.vendorBillId,
        changes: {
          invoiceId: input.invoiceId,
          varianceUsd: result.varianceUsd,
          fxGainLoss: result.fxGainLoss,
          status: result.status,
        },
      });

      return result;
    }),

  /**
   * Batch reconcile all high-confidence matches for a payroll month.
   */
  batchReconcile: financeManagerProcedure
    .input(z.object({ payrollMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
    .mutation(async ({ input, ctx }) => {
      const results = await batchReconcile(input.payrollMonth);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "batch_reconcile",
        entityType: "vendor_bill",
        entityId: 0,
        changes: {
          payrollMonth: input.payrollMonth,
          matchedCount: results.length,
          totalVariance: results.reduce((sum, r) => sum + r.varianceUsd, 0),
        },
      });

      return {
        matchedCount: results.length,
        results,
      };
    }),

  /**
   * Un-reconcile a vendor bill (reset to pending).
   */
  unreconcile: financeManagerProcedure
    .input(z.object({ vendorBillId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await unreconciledVendorBill(input.vendorBillId);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "unreconcile",
        entityType: "vendor_bill",
        entityId: input.vendorBillId,
        changes: { reset: true },
      });

      return { success: true };
    }),
});
