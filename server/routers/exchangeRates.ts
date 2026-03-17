import { z } from "zod";
import { router } from "../_core/trpc";
import { adminProcedure, userProcedure } from "../procedures";
import { listAllExchangeRates, deleteExchangeRate, logAuditAction } from "../db";
import { upsertExchangeRate, getGlobalMarkup, getExchangeRate } from "../services/exchangeRateService";
import { fetchAndStoreExchangeRates, setDefaultMarkup, getDefaultMarkup } from "../services/exchangeRateFetchService";

export const exchangeRatesRouter = router({
  get: userProcedure
    .input(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const rateData = await getExchangeRate(input.from, input.to);
      if (!rateData) {
        return { rate: null };
      }
      return { 
        rate: rateData.rate,
        rateWithMarkup: rateData.rateWithMarkup,
        markupPercentage: rateData.markupPercentage
      };
    }),

  list: userProcedure
    .input(
      z.object({
        limit: z.number().default(200),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const page = Math.floor(input.offset / input.limit) + 1;
      return await listAllExchangeRates({
        page,
        pageSize: input.limit,
      });
    }),

  /** Get the current global markup percentage */
  getMarkup: userProcedure.query(async () => {
    const markup = await getDefaultMarkup();
    return { markupPercentage: markup };
  }),

  /** Update the global markup percentage (admin only) */
  setMarkup: adminProcedure
    .input(z.object({ markupPercentage: z.number().min(0).max(50) }))
    .mutation(async ({ input, ctx }) => {
      await setDefaultMarkup(input.markupPercentage);
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update",
        entityType: "exchange_rate_markup",
        changes: JSON.stringify({ markupPercentage: input.markupPercentage }),
      });
      return { success: true };
    }),

  upsert: adminProcedure
    .input(
      z.object({
        fromCurrency: z.string().min(1).default("USD"),
        toCurrency: z.string().min(1),
        rate: z.number().positive(),
        effectiveDate: z.string().optional(),
        source: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : new Date();
      // Use global markup for manual entries
      const markup = await getGlobalMarkup();
      await upsertExchangeRate(
        input.fromCurrency,
        input.toCurrency,
        input.rate,
        effectiveDate,
        input.source || "manual",
        markup
      );
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "upsert",
        entityType: "exchange_rate",
        changes: JSON.stringify({ ...input, markupPercentage: markup }),
      });
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteExchangeRate(input.id);
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "delete",
        entityType: "exchange_rate",
        entityId: input.id,
      });
      return { success: true };
    }),

  /**
   * Get a real-time reference exchange rate for a currency pair.
   * Fetches from ExchangeRate-API (no key needed) and returns the live rate.
   * Used for reference display on invoice detail page (finance managers only).
   * Does NOT store the rate in DB.
   */
  liveRate: userProcedure
    .input(z.object({
      from: z.string().min(1).default("USD"),
      to: z.string().min(1),
    }))
    .query(async ({ input }) => {
      try {
        const url = `https://open.er-api.com/v6/latest/${input.from}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) {
          return { success: false, rate: null, error: `API returned ${response.status}` };
        }
        const data = await response.json() as { result: string; rates: Record<string, number>; time_last_update_utc: string };
        if (data.result !== "success" || !data.rates[input.to]) {
          return { success: false, rate: null, error: `Rate not available for ${input.from}→${input.to}` };
        }
        return {
          success: true,
          rate: data.rates[input.to],
          from: input.from,
          to: input.to,
          lastUpdate: data.time_last_update_utc,
        };
      } catch (err: any) {
        return { success: false, rate: null, error: err.message || "Failed to fetch live rate" };
      }
    }),

  /**
   * Manually trigger exchange rate fetch.
   * Primary: ExchangeRate-API (166 currencies)
   * Fallback: Frankfurter API (ECB data, 30 currencies)
   * Fetches latest USD→XXX rates and stores them with global markup applied
   */
  fetchLive: adminProcedure.mutation(async ({ ctx }) => {
    const result = await fetchAndStoreExchangeRates();
    await logAuditAction({
      userId: ctx.user.id, userName: ctx.user.name || null,
      action: "fetch_live",
      entityType: "exchange_rates",
      changes: JSON.stringify({
        ratesFetched: result.ratesFetched,
        ratesStored: result.ratesStored,
        date: result.date,
        errors: result.errors,
        unsupported: result.unsupported,
      }),
    });
    return result;
  }),
});
