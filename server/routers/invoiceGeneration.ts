import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure } from "../procedures";
import {
  generateInvoicesFromPayroll,
  getInvoiceGenerationStatus,
  regenerateInvoices,
  regenerateSingleInvoice,
} from "../services/invoiceGenerationService.ts";
import {
  upsertExchangeRate,
  getExchangeRate,
  initializeDefaultRates,
} from "../services/exchangeRateService";
import { logAuditAction } from "../db";

export const invoiceGenerationRouter = router({
  /**
   * Generate draft invoices from approved payroll data for a specific month
   * Service fees are calculated from customer pricing configuration
   * VAT is calculated per country from countries_config
   */
  generateFromPayroll: financeManagerProcedure
    .input(
      z.object({
        payrollMonth: z.string(), // ISO date (first day of month)
      })
    )
    .mutation(async ({ input, ctx }) => {
      const payrollDate = new Date(input.payrollMonth);
      const monthLabel = payrollDate.toLocaleDateString("en", { month: "short", year: "numeric" });
      const result = await generateInvoicesFromPayroll(payrollDate, monthLabel);

      if (result.success) {
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "generate",
          entityType: "invoices",
          changes: JSON.stringify({
            payrollMonth: input.payrollMonth,
            invoiceCount: result.invoiceIds?.length || 0,
            warnings: result.warnings,
          }),
        });
      }

      return result;
    }),

  /**
   * Get status of invoice generation for a specific payroll month
   */
  getStatus: financeManagerProcedure
    .input(z.object({ payrollMonth: z.string() }))
    .query(async ({ input }) => {
      const payrollDate = new Date(input.payrollMonth);
      return await getInvoiceGenerationStatus(payrollDate);
    }),

  /**
   * Pre-check before generate/regenerate: returns existing invoice status breakdown
   * so the frontend can warn the user about non-draft invoices that won't be affected.
   */
  preCheck: financeManagerProcedure
    .input(z.object({ payrollMonth: z.string() }))
    .query(async ({ input }) => {
      const payrollDate = new Date(input.payrollMonth);
      const status = await getInvoiceGenerationStatus(payrollDate);
      if (!status) return { canGenerate: false, message: "Unable to check status" };

      const nonDraftCount = (status.byStatus.sent || 0) + (status.byStatus.paid || 0) + (status.byStatus.overdue || 0);
      const draftCount = status.byStatus.draft || 0;

      let warnings: string[] = [];
      if (nonDraftCount > 0) {
        warnings.push(
          `This month has ${nonDraftCount} invoice(s) in non-draft status (${status.byStatus.sent} sent, ${status.byStatus.paid} paid, ${status.byStatus.overdue} overdue). These will NOT be affected by generate/regenerate.`
        );
      }
      if (draftCount > 0) {
        warnings.push(
          `${draftCount} draft invoice(s) exist. Regenerating will delete and recreate them.`
        );
      }

      return {
        canGenerate: true,
        totalInvoices: status.totalInvoices,
        draftCount,
        nonDraftCount,
        byStatus: status.byStatus,
        warnings,
      };
    }),

  /**
   * Regenerate invoices for a month (deletes draft invoices and recreates)
   */
  regenerate: financeManagerProcedure
    .input(
      z.object({
        payrollMonth: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const payrollDate = new Date(input.payrollMonth);
      const result = await regenerateInvoices(payrollDate);

      if (result.success) {
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "regenerate",
          entityType: "invoices",
          changes: JSON.stringify({
            payrollMonth: input.payrollMonth,
            invoiceCount: result.invoiceIds?.length || 0,
            warnings: result.warnings,
          }),
        });
      }

      return result;
    }),

  /**
   * Regenerate a single invoice (delete and recreate from payroll data)
   */
  regenerateSingle: financeManagerProcedure
    .input(
      z.object({
        invoiceId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await regenerateSingleInvoice(input.invoiceId);

      if (result.success) {
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "regenerate",
          entityType: "invoice",
          entityId: input.invoiceId,
          changes: JSON.stringify({
            type: "single_regenerate",
            invoiceId: input.invoiceId,
            newInvoiceCount: result.invoiceIds?.length || 0,
          }),
        });
      }

      return result;
    }),

  /**
   * Manage exchange rates
   */
  exchangeRate: router({
    /**
     * Get current exchange rate between two currencies
     */
    get: financeManagerProcedure
      .input(
        z.object({
          fromCurrency: z.string(),
          toCurrency: z.string(),
        })
      )
      .query(async ({ input }) => {
        return await getExchangeRate(input.fromCurrency, input.toCurrency);
      }),

    /**
     * Update exchange rate with configurable markup
     */
    update: financeManagerProcedure
      .input(
        z.object({
          fromCurrency: z.string(),
          toCurrency: z.string(),
          rate: z.number().positive(),
          effectiveDate: z.string().optional(),
          source: z.string().optional(),
          markupPercentage: z.number().min(0).max(50).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const effectiveDate = input.effectiveDate
          ? new Date(input.effectiveDate)
          : new Date();

        try {
          await upsertExchangeRate(
            input.fromCurrency,
            input.toCurrency,
            input.rate,
            effectiveDate,
            input.source,
            input.markupPercentage
          );

          await logAuditAction({
            userId: ctx.user.id, userName: ctx.user.name || null,
            action: "update",
            entityType: "exchange_rate",
            changes: JSON.stringify({
              fromCurrency: input.fromCurrency,
              toCurrency: input.toCurrency,
              rate: input.rate,
              markupPercentage: input.markupPercentage,
            }),
          });

          return { success: true, message: "Exchange rate updated" };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }),

    /**
     * Initialize default exchange rates
     */
    initializeDefaults: financeManagerProcedure.mutation(async ({ ctx }) => {
      try {
        await initializeDefaultRates();

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "initialize",
          entityType: "exchange_rates",
          changes: JSON.stringify({ action: "initialize_defaults" }),
        });

        return { success: true, message: "Default exchange rates initialized" };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),
  }),
});
