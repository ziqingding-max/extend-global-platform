/**
 * FX Stripping Router
 *
 * Provides endpoints for FX markup analysis:
 *   - Get FX stripping summary for a date range
 *   - Get FX breakdown for a single invoice
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure, userProcedure } from "../procedures";
import {
  getFxStrippingSummary,
  getInvoiceFxBreakdown,
} from "../services/fxStrippingEngine";

export const fxStrippingRouter = router({
  /**
   * Get FX stripping summary for a date range.
   * Returns pass-through costs, FX markup revenue, service fee revenue, and breakdowns.
   */
  summary: userProcedure
    .input(
      z.object({
        startMonth: z.string().regex(/^\d{4}-\d{2}$/),
        endMonth: z.string().regex(/^\d{4}-\d{2}$/),
        channelPartnerId: z.number().optional(),
        customerId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return getFxStrippingSummary(
        input.startMonth,
        input.endMonth,
        input.channelPartnerId,
        input.customerId,
      );
    }),

  /**
   * Get FX breakdown for a single invoice.
   */
  invoiceBreakdown: userProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ input }) => {
      return getInvoiceFxBreakdown(input.invoiceId);
    }),
});
