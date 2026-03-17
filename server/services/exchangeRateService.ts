import { eq, and, desc, lte } from "drizzle-orm";
import { getDb } from "../db";
import { exchangeRates, InsertExchangeRate, systemConfig } from "../../drizzle/schema";

/**
 * Exchange Rate Service
 * All rates are stored as USD → XXX direction.
 * Markup is applied to ensure the company collects more USD from clients
 * than it pays out in local currency to employees.
 *
 * Markup logic:
 * - Raw rate: 1 USD = X local currency (e.g., 1 USD = 0.92 EUR)
 * - Rate with markup: 1 USD = X * (1 - markup%) local currency
 *   This means each USD buys LESS foreign currency after markup,
 *   so converting foreign costs back to USD results in a HIGHER USD amount.
 * - Example: Employee costs 5000 EUR
 *   - Without markup: 5000 / 0.92 = $5,435 USD
 *   - With 5% markup: 5000 / (0.92 * 0.95) = 5000 / 0.874 = $5,721 USD
 *   - Company collects $286 more to hedge FX risk
 */

/**
 * Get the global markup percentage from system config
 */
export async function getGlobalMarkup(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 5.0;

    const result = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.configKey, "exchange_rate_markup_percentage"))
      .limit(1);

    if (result.length > 0) {
      return parseFloat(result[0].configValue) || 5.0;
    }
  } catch {
    // Fall back to default
  }
  return 5.0;
}

/**
 * Get the latest exchange rate for USD → targetCurrency
 * Returns raw rate and rate with markup applied
 */
export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  effectiveDate?: Date
): Promise<{ rate: number; rateWithMarkup: number; markupPercentage: number; effectiveDate: string } | null> {
  if (fromCurrency === toCurrency) {
    return {
      rate: 1,
      rateWithMarkup: 1,
      markupPercentage: 0,
      effectiveDate: effectiveDate ? effectiveDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
    };
  }

  const db = await getDb();
  if (!db) return null;

  let dateCondition = undefined;
  if (effectiveDate) {
    const dateStr = effectiveDate.toISOString().split("T")[0];
    dateCondition = lte(exchangeRates.effectiveDate, dateStr);
  }

  // Try direct lookup
  const result = await db
    .select()
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.fromCurrency, fromCurrency),
        eq(exchangeRates.toCurrency, toCurrency),
        dateCondition
      )
    )
    .orderBy(desc(exchangeRates.effectiveDate))
    .limit(1);

  if (result.length > 0) {
    const rate = parseFloat(result[0].rate.toString());
    const rateWithMarkup = parseFloat(result[0].rateWithMarkup.toString());
    const markupPercentage = parseFloat(result[0].markupPercentage.toString());
    return {
      rate,
      rateWithMarkup,
      markupPercentage,
      effectiveDate: result[0].effectiveDate
    };
  }

  // Try inverse lookup (if we have USD→EUR but need EUR→USD)
  const inverse = await db
    .select()
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.fromCurrency, toCurrency),
        eq(exchangeRates.toCurrency, fromCurrency),
        dateCondition
      )
    )
    .orderBy(desc(exchangeRates.effectiveDate))
    .limit(1);

  if (inverse.length > 0) {
    const rawRate = parseFloat(inverse[0].rate.toString());
    const markupPercentage = parseFloat(inverse[0].markupPercentage.toString());
    const inverseRate = 1 / rawRate;
    const inverseRateWithMarkup = 1 / (rawRate * (1 - markupPercentage / 100));
    return {
      rate: inverseRate,
      rateWithMarkup: inverseRateWithMarkup,
      markupPercentage,
      effectiveDate: inverse[0].effectiveDate
    };
  }

  return null;
}

/**
 * Store or update exchange rate with configurable markup
 * Direction: fromCurrency → toCurrency
 * Markup formula: rateWithMarkup = rate * (1 - markup/100)
 *   This makes each unit of fromCurrency buy LESS toCurrency,
 *   so when converting toCurrency costs back, the fromCurrency amount is HIGHER.
 */
export async function upsertExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  effectiveDate: Date | string,
  source?: string,
  markupPercentage?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const markup = markupPercentage ?? await getGlobalMarkup();
  // Markup reduces the rate so that converting back yields more USD
  const rateWithMarkup = rate * (1 - markup / 100);

  // Ensure effectiveDate is stored as YYYY-MM-DD string
  let dateStr: string;
  if (effectiveDate instanceof Date) {
    dateStr = effectiveDate.toISOString().split("T")[0];
  } else {
    dateStr = effectiveDate.split("T")[0];
  }

  const data: InsertExchangeRate = {
    fromCurrency,
    toCurrency,
    rate: rate.toString(),
    rateWithMarkup: rateWithMarkup.toString(),
    markupPercentage: markup.toString(),
    source,
    effectiveDate: dateStr,
  };

  try {
    await db.insert(exchangeRates).values(data).onConflictDoUpdate({
      target: [exchangeRates.fromCurrency, exchangeRates.toCurrency, exchangeRates.effectiveDate],
      set: {
        rate: rate.toString(),
        rateWithMarkup: rateWithMarkup.toString(),
        markupPercentage: markup.toString(),
        source,
      },
    });
  } catch (error) {
    console.error("[ExchangeRateService] Failed to upsert rate:", error);
    throw error;
  }
}

/**
 * Convert local currency amount to USD for invoicing
 * Uses the markup-adjusted rate to ensure company collects more
 *
 * Example: Convert 5000 EUR to USD
 * - Raw rate: 1 USD = 0.92 EUR → 5000/0.92 = $5,435
 * - With 5% markup: 1 USD = 0.874 EUR → 5000/0.874 = $5,721
 * - Company collects $286 extra to hedge FX risk
 */
export async function convertToUSD(
  amount: number,
  localCurrency: string,
  effectiveDate?: Date
): Promise<{ usdAmount: number; rate: number; rateWithMarkup: number; markupPercentage: number } | null> {
  if (localCurrency === "USD") {
    return { usdAmount: amount, rate: 1, rateWithMarkup: 1, markupPercentage: 0 };
  }

  // Get USD → localCurrency rate
  const rateData = await getExchangeRate("USD", localCurrency, effectiveDate);
  if (!rateData) {
    return null;
  }

  // Convert: localAmount / (USD→local rate with markup) = USD amount
  // Since markup reduces the rate, dividing by a smaller number gives more USD
  const usdAmount = amount / rateData.rateWithMarkup;

  return {
    usdAmount,
    rate: rateData.rate,
    rateWithMarkup: rateData.rateWithMarkup,
    markupPercentage: rateData.markupPercentage,
  };
}

/**
 * Convert amount from one currency to another using stored rates
 * Returns the converted amount with markup applied
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  effectiveDate?: Date
): Promise<{ convertedAmount: number; rate: number; rateWithMarkup: number; markupPercentage: number } | null> {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, rate: 1, rateWithMarkup: 1, markupPercentage: 0 };
  }

  const rateData = await getExchangeRate(fromCurrency, toCurrency, effectiveDate);
  if (!rateData) {
    return null;
  }

  const convertedAmount = amount * rateData.rateWithMarkup;

  return {
    convertedAmount,
    rate: rateData.rate,
    rateWithMarkup: rateData.rateWithMarkup,
    markupPercentage: rateData.markupPercentage,
  };
}

/**
 * Get all exchange rates for a specific date
 */
export async function getExchangeRatesForDate(effectiveDate: Date) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.effectiveDate, effectiveDate))
    .orderBy(exchangeRates.fromCurrency, exchangeRates.toCurrency);
}

/**
 * Initialize default exchange rates (if needed)
 * All rates as USD → XXX direction
 */
export async function initializeDefaultRates(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const markup = await getGlobalMarkup();

  // Common currency pairs - USD → XXX
  const defaultRates = [
    { to: "EUR", rate: 0.92 },
    { to: "GBP", rate: 0.79 },
    { to: "JPY", rate: 150.5 },
    { to: "CNY", rate: 7.24 },
    { to: "SGD", rate: 1.34 },
    { to: "HKD", rate: 7.82 },
    { to: "AUD", rate: 1.56 },
    { to: "CAD", rate: 1.35 },
    { to: "CHF", rate: 0.88 },
  ];

  try {
    for (const pair of defaultRates) {
      await upsertExchangeRate("USD", pair.to, pair.rate, today, "system_default", markup);
    }
    console.log("[ExchangeRateService] Default rates initialized");
  } catch (error) {
    console.error("[ExchangeRateService] Failed to initialize default rates:", error);
  }
}
