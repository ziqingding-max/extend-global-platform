/**
 * Exchange Rate Fetch Service
 *
 * Primary:  ExchangeRate-API (open.er-api.com) — 166 currencies, no key, daily
 * Fallback: Frankfurter API (ECB data) — 30 currencies, no key, daily
 *
 * All rates are stored as USD → XXX direction.
 * The system's base invoicing currency is USD.
 * Markup is applied to protect against exchange rate fluctuation risk.
 */

import { upsertExchangeRate } from "./exchangeRateService";
import { getDb, listCountriesConfig } from "../db";
import { systemConfig } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// API Endpoints
// ============================================================================

const EXCHANGERATE_API_URL = "https://open.er-api.com/v6/latest";
const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1";

// Currencies supported by Frankfurter API (ECB reference rates) — fallback only
const FRANKFURTER_SUPPORTED = new Set([
  "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK",
  "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK",
  "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN",
  "RON", "SEK", "SGD", "THB", "TRY", "ZAR",
]);

// ============================================================================
// Types
// ============================================================================

interface ExchangeRateAPIResponse {
  result: string;
  base_code: string;
  time_last_update_utc: string;
  rates: Record<string, number>;
}

interface FrankfurterResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

// ============================================================================
// Primary: ExchangeRate-API (166 currencies, no API key)
// ============================================================================

async function fetchFromExchangeRateAPI(
  base: string
): Promise<{ rates: Record<string, number>; date: string } | null> {
  const url = `${EXCHANGERATE_API_URL}/${base}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(
        `[ExchangeRateFetch] ExchangeRate-API error: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = (await response.json()) as ExchangeRateAPIResponse;
    if (data.result !== "success") {
      console.error(`[ExchangeRateFetch] ExchangeRate-API returned error result`);
      return null;
    }

    // Extract date from the update timestamp
    const dateMatch = data.time_last_update_utc?.match(/\d{4}-\d{2}-\d{2}/) ||
      data.time_last_update_utc?.match(/\w+, (\d{2}) (\w+) (\d{4})/);
    let dateStr = new Date().toISOString().split("T")[0]; // fallback to today
    if (data.time_last_update_utc) {
      const d = new Date(data.time_last_update_utc);
      if (!isNaN(d.getTime())) {
        dateStr = d.toISOString().split("T")[0];
      }
    }

    return { rates: data.rates, date: dateStr };
  } catch (error) {
    console.error("[ExchangeRateFetch] Failed to fetch from ExchangeRate-API:", error);
    return null;
  }
}

// ============================================================================
// Fallback: Frankfurter API (30 currencies)
// ============================================================================

async function fetchFromFrankfurter(
  base: string,
  symbols: string[]
): Promise<FrankfurterResponse | null> {
  const validSymbols = symbols.filter((s) => s !== base && FRANKFURTER_SUPPORTED.has(s));
  if (validSymbols.length === 0) return null;

  const symbolsParam = validSymbols.join(",");
  const url = `${FRANKFURTER_BASE_URL}/latest?base=${base}&symbols=${symbolsParam}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(
        `[ExchangeRateFetch] Frankfurter API error: ${response.status} ${response.statusText}`
      );
      return null;
    }

    return (await response.json()) as FrankfurterResponse;
  } catch (error) {
    console.error("[ExchangeRateFetch] Failed to fetch from Frankfurter:", error);
    return null;
  }
}

// ============================================================================
// System Config Helpers
// ============================================================================

/**
 * Get the system default markup percentage from config
 */
export async function getDefaultMarkup(): Promise<number> {
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
 * Set the global markup percentage in system config
 */
export async function setDefaultMarkup(percentage: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(systemConfig).values({
    configKey: "exchange_rate_markup_percentage",
    configValue: percentage.toFixed(2),
    description: "Global exchange rate markup percentage applied to all currency conversions",
  }).onConflictDoUpdate({
    target: systemConfig.configKey,
    set: {
      configValue: percentage.toFixed(2),
    },
  });
}

/**
 * Get list of currencies needed based on active countries
 */
async function getRequiredCurrencies(): Promise<string[]> {
  try {
    const countries = await listCountriesConfig();
    const currencies = new Set<string>();
    for (const c of countries) {
      if (c.localCurrency && c.localCurrency !== "USD") {
        currencies.add(c.localCurrency);
      }
    }
    return Array.from(currencies);
  } catch {
    // Fallback to common currencies
    return [
      "EUR", "GBP", "SGD", "JPY", "AUD", "CNY", "HKD", "CAD",
      "CHF", "KRW", "INR", "MYR", "THB", "PHP", "IDR",
    ];
  }
}

// ============================================================================
// Main Fetch & Store
// ============================================================================

/**
 * Fetch and store all exchange rates.
 * Strategy:
 *   1. Try ExchangeRate-API (covers 166 currencies including all 99 we need)
 *   2. If that fails, fall back to Frankfurter (30 currencies only)
 *
 * All rates stored as USD → XXX direction.
 */
export async function fetchAndStoreExchangeRates(): Promise<{
  success: boolean;
  ratesFetched: number;
  ratesStored: number;
  date: string;
  errors: string[];
  unsupported: string[];
  source: string;
}> {
  const errors: string[] = [];
  const unsupported: string[] = [];
  let ratesFetched = 0;
  let ratesStored = 0;
  let rateDate = "";
  let source = "";

  const markup = await getDefaultMarkup();
  const requiredCurrencies = await getRequiredCurrencies();

  // ---- Attempt 1: ExchangeRate-API (primary, 166 currencies) ----
  const erApiData = await fetchFromExchangeRateAPI("USD");

  if (erApiData) {
    source = "exchangerate_api";
    rateDate = erApiData.date;
    const effectiveDate = new Date(erApiData.date + "T00:00:00Z");

    for (const currency of requiredCurrencies) {
      const rate = erApiData.rates[currency];
      if (rate != null) {
        ratesFetched++;
        try {
          await upsertExchangeRate(
            "USD",
            currency,
            rate,
            effectiveDate,
            "exchangerate_api",
            markup
          );
          ratesStored++;
        } catch (err) {
          errors.push(`Failed to store USD→${currency}: ${err}`);
        }
      } else {
        unsupported.push(currency);
      }
    }

    console.log(
      `[ExchangeRateFetch] ExchangeRate-API: ${ratesStored}/${ratesFetched} rates stored for ${rateDate}` +
        (unsupported.length > 0 ? ` | Not found: ${unsupported.join(", ")}` : "")
    );

    return { success: errors.length === 0, ratesFetched, ratesStored, date: rateDate, errors, unsupported, source };
  }

  // ---- Attempt 2: Frankfurter API (fallback, 30 currencies) ----
  console.log("[ExchangeRateFetch] ExchangeRate-API unavailable, falling back to Frankfurter...");
  source = "frankfurter_ecb";

  const supported = requiredCurrencies.filter((c) => FRANKFURTER_SUPPORTED.has(c));
  const notSupported = requiredCurrencies.filter((c) => !FRANKFURTER_SUPPORTED.has(c));
  unsupported.push(...notSupported);

  const usdData = await fetchFromFrankfurter("USD", supported);
  if (!usdData) {
    errors.push("Both ExchangeRate-API and Frankfurter API failed");
    return { success: false, ratesFetched: 0, ratesStored: 0, date: "", errors, unsupported, source };
  }

  rateDate = usdData.date;
  const effectiveDate = new Date(usdData.date + "T00:00:00Z");

  for (const [currency, rate] of Object.entries(usdData.rates)) {
    ratesFetched++;
    try {
      await upsertExchangeRate("USD", currency, rate, effectiveDate, "frankfurter_ecb", markup);
      ratesStored++;
    } catch (err) {
      errors.push(`Failed to store USD→${currency}: ${err}`);
    }
  }

  console.log(
    `[ExchangeRateFetch] Frankfurter fallback: ${ratesStored}/${ratesFetched} rates stored for ${rateDate}` +
      (unsupported.length > 0 ? ` | Unsupported: ${unsupported.join(", ")}` : "")
  );

  return { success: errors.length === 0, ratesFetched, ratesStored, date: rateDate, errors, unsupported, source };
}

/**
 * Fetch historical rates for a specific date
 * Uses Frankfurter API (supports historical queries)
 * ExchangeRate-API open endpoint does not support historical dates
 */
export async function fetchHistoricalRates(
  dateStr: string
): Promise<{
  success: boolean;
  ratesStored: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let ratesStored = 0;

  const markup = await getDefaultMarkup();
  const requiredCurrencies = await getRequiredCurrencies();
  const supported = requiredCurrencies.filter((c) => FRANKFURTER_SUPPORTED.has(c));

  const symbolsParam = supported.join(",");
  const url = `${FRANKFURTER_BASE_URL}/${dateStr}?base=USD&symbols=${symbolsParam}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        success: false,
        ratesStored: 0,
        errors: [`API returned ${response.status}`],
      };
    }

    const data = (await response.json()) as FrankfurterResponse;
    const effectiveDate = new Date(data.date + "T00:00:00Z");

    for (const [currency, rate] of Object.entries(data.rates)) {
      try {
        await upsertExchangeRate("USD", currency, rate, effectiveDate, "frankfurter_ecb", markup);
        ratesStored++;
      } catch (err) {
        errors.push(`Failed to store USD→${currency}: ${err}`);
      }
    }
  } catch (err) {
    errors.push(`Fetch failed: ${err}`);
  }

  return { success: errors.length === 0, ratesStored, errors };
}
