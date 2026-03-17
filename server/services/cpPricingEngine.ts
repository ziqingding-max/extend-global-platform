/**
 * CP Pricing Engine
 *
 * Calculates service fees for the dual-layer invoice model:
 *   Layer 1 (EG → CP): Based on cp_pricing_rules table
 *   Layer 2 (CP → Client): Based on cp_client_pricing table
 *
 * This module is consumed by invoiceGenerationService.ts during payroll invoice generation.
 */

import { eq, and, lte, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  cpPricingRules,
  cpClientPricing,
  channelPartners,
} from "../../drizzle/schema";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface CpFeeResult {
  /** Calculated service fee amount (in the rule's currency) */
  feeAmount: number;
  /** Currency of the fee */
  feeCurrency: string;
  /** Pricing type used */
  pricingType: string;
  /** The pricing rule ID that was matched */
  ruleId: number;
  /** FX markup percentage from the pricing rule */
  fxMarkupPercentage: number;
}

export interface TierConfig {
  minHeadcount: number;
  maxHeadcount: number | null;
  feeAmount: number;
}

// ────────────────────────────────────────────────────────────────
// Layer 1: EG → CP Service Fee (from cp_pricing_rules)
// ────────────────────────────────────────────────────────────────

/**
 * Calculate the Layer 1 service fee that EG charges the CP for a single employee.
 *
 * Resolution order:
 *   1. Country-specific + serviceType-specific rule
 *   2. Country-specific + any serviceType rule
 *   3. Global (null country) + serviceType-specific rule
 *   4. Global (null country) + any serviceType rule
 *
 * For tiered pricing, `headcount` is the total active employee count under this CP.
 */
export async function getLayer1ServiceFee(
  channelPartnerId: number,
  countryCode: string,
  serviceType: "eor" | "visa_eor" | "aor",
  headcount: number,
  effectiveDate: string,
  warnings: string[]
): Promise<CpFeeResult | null> {
  const db = await getDb();
  if (!db) return null;

  // Fetch all active rules for this CP, ordered by specificity (country-specific first)
  const rules = await db
    .select()
    .from(cpPricingRules)
    .where(
      and(
        eq(cpPricingRules.channelPartnerId, channelPartnerId),
        eq(cpPricingRules.isActive, true),
        lte(cpPricingRules.effectiveFrom, effectiveDate)
      )
    )
    .orderBy(desc(cpPricingRules.createdAt));

  // Filter out expired rules
  const validRules = rules.filter(
    (r) => !r.effectiveTo || r.effectiveTo >= effectiveDate
  );

  // Resolution: try most specific first
  const candidates = [
    // 1. Exact match: country + serviceType
    validRules.find(
      (r) => r.countryCode === countryCode && r.serviceType === serviceType
    ),
    // 2. Country match, any serviceType
    validRules.find(
      (r) => r.countryCode === countryCode && !r.serviceType
    ),
    // 3. Global rule, serviceType match
    validRules.find(
      (r) => !r.countryCode && r.serviceType === serviceType
    ),
    // 4. Global rule, any serviceType
    validRules.find(
      (r) => !r.countryCode && !r.serviceType
    ),
  ];

  const matchedRule = candidates.find((r) => r !== undefined);

  if (!matchedRule) {
    warnings.push(
      `[Layer1] No cp_pricing_rule found for CP #${channelPartnerId}, country=${countryCode}, serviceType=${serviceType}. Using 0 fee.`
    );
    return null;
  }

  const fxMarkup = parseFloat(matchedRule.fxMarkupPercentage || "3.00");

  switch (matchedRule.pricingType) {
    case "fixed_per_employee": {
      const fee = parseFloat(matchedRule.fixedFeeAmount || "0");
      return {
        feeAmount: fee,
        feeCurrency: matchedRule.currency || "USD",
        pricingType: "fixed_per_employee",
        ruleId: matchedRule.id,
        fxMarkupPercentage: fxMarkup,
      };
    }

    case "percentage_markup": {
      // percentage_markup is applied to employment cost, so we return the percentage
      // The caller will multiply by the employment cost
      const pct = parseFloat(matchedRule.markupPercentage || "0");
      return {
        feeAmount: pct, // This is a percentage, not an absolute amount
        feeCurrency: matchedRule.currency || "USD",
        pricingType: "percentage_markup",
        ruleId: matchedRule.id,
        fxMarkupPercentage: fxMarkup,
      };
    }

    case "tiered": {
      const tiers = (matchedRule.tierConfig as TierConfig[] | null) || [];
      const matchedTier = tiers.find(
        (t) =>
          headcount >= t.minHeadcount &&
          (t.maxHeadcount === null || headcount <= t.maxHeadcount)
      );
      if (!matchedTier) {
        warnings.push(
          `[Layer1] No matching tier for headcount=${headcount} in rule #${matchedRule.id}. Using 0 fee.`
        );
        return {
          feeAmount: 0,
          feeCurrency: matchedRule.currency || "USD",
          pricingType: "tiered",
          ruleId: matchedRule.id,
          fxMarkupPercentage: fxMarkup,
        };
      }
      return {
        feeAmount: matchedTier.feeAmount,
        feeCurrency: matchedRule.currency || "USD",
        pricingType: "tiered",
        ruleId: matchedRule.id,
        fxMarkupPercentage: fxMarkup,
      };
    }

    default:
      warnings.push(
        `[Layer1] Unknown pricing type "${matchedRule.pricingType}" in rule #${matchedRule.id}.`
      );
      return null;
  }
}

// ────────────────────────────────────────────────────────────────
// Layer 2: CP → Client Service Fee (from cp_client_pricing)
// ────────────────────────────────────────────────────────────────

/**
 * Calculate the Layer 2 service fee that the CP charges the End Client for a single employee.
 *
 * Resolution order:
 *   1. Customer-specific + country-specific + serviceType-specific rule
 *   2. Customer-specific + country-specific + any serviceType
 *   3. Customer-specific + global (null country) + serviceType-specific
 *   4. Customer-specific + global (null country) + any serviceType
 */
export async function getLayer2ServiceFee(
  channelPartnerId: number,
  customerId: number,
  countryCode: string,
  serviceType: "eor" | "visa_eor" | "aor",
  effectiveDate: string,
  warnings: string[]
): Promise<CpFeeResult | null> {
  const db = await getDb();
  if (!db) return null;

  const rules = await db
    .select()
    .from(cpClientPricing)
    .where(
      and(
        eq(cpClientPricing.channelPartnerId, channelPartnerId),
        eq(cpClientPricing.customerId, customerId),
        eq(cpClientPricing.isActive, true),
        lte(cpClientPricing.effectiveFrom, effectiveDate)
      )
    )
    .orderBy(desc(cpClientPricing.createdAt));

  // Filter out expired rules
  const validRules = rules.filter(
    (r) => !r.effectiveTo || r.effectiveTo >= effectiveDate
  );

  // Resolution: try most specific first
  const candidates = [
    validRules.find(
      (r) => r.countryCode === countryCode && r.serviceType === serviceType
    ),
    validRules.find(
      (r) => r.countryCode === countryCode && !r.serviceType
    ),
    validRules.find(
      (r) => !r.countryCode && r.serviceType === serviceType
    ),
    validRules.find(
      (r) => !r.countryCode && !r.serviceType
    ),
  ];

  const matchedRule = candidates.find((r) => r !== undefined);

  if (!matchedRule) {
    warnings.push(
      `[Layer2] No cp_client_pricing found for CP #${channelPartnerId}, customer #${customerId}, country=${countryCode}. Using 0 fee.`
    );
    return null;
  }

  const fxMarkup = parseFloat(matchedRule.fxMarkupPercentage || "5.00");

  switch (matchedRule.pricingType) {
    case "fixed_per_employee": {
      const fee = parseFloat(matchedRule.fixedFeeAmount || "0");
      return {
        feeAmount: fee,
        feeCurrency: matchedRule.currency || "USD",
        pricingType: "fixed_per_employee",
        ruleId: matchedRule.id,
        fxMarkupPercentage: fxMarkup,
      };
    }

    case "percentage_markup": {
      const pct = parseFloat(matchedRule.markupPercentage || "0");
      return {
        feeAmount: pct, // Percentage, not absolute
        feeCurrency: matchedRule.currency || "USD",
        pricingType: "percentage_markup",
        ruleId: matchedRule.id,
        fxMarkupPercentage: fxMarkup,
      };
    }

    case "mixed": {
      // Mixed = base fee + additional markup percentage
      const baseFee = parseFloat(matchedRule.baseFeeAmount || "0");
      const additionalPct = parseFloat(
        matchedRule.additionalMarkupPercentage || "0"
      );
      // Return base fee; the caller will add the percentage portion
      return {
        feeAmount: baseFee, // Base fee portion
        feeCurrency: matchedRule.currency || "USD",
        pricingType: `mixed:${additionalPct}`, // Encode the percentage in pricingType for the caller
        ruleId: matchedRule.id,
        fxMarkupPercentage: fxMarkup,
      };
    }

    default:
      warnings.push(
        `[Layer2] Unknown pricing type "${matchedRule.pricingType}" in rule #${matchedRule.id}.`
      );
      return null;
  }
}

/**
 * Resolve the actual fee amount from a CpFeeResult, given the employment cost.
 * Handles percentage_markup and mixed types by multiplying against the cost.
 */
export function resolveActualFee(
  result: CpFeeResult,
  employmentCostInFeeCurrency: number
): number {
  if (result.pricingType === "percentage_markup") {
    // feeAmount is the percentage (e.g. 5.00 = 5%)
    return employmentCostInFeeCurrency * (result.feeAmount / 100);
  }

  if (result.pricingType.startsWith("mixed:")) {
    // feeAmount is the base fee, the percentage is encoded after "mixed:"
    const additionalPct = parseFloat(result.pricingType.split(":")[1] || "0");
    return (
      result.feeAmount +
      employmentCostInFeeCurrency * (additionalPct / 100)
    );
  }

  // fixed_per_employee or tiered: feeAmount is absolute
  return result.feeAmount;
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

/**
 * Get the CP headcount (active employees) for tiered pricing calculation.
 */
export async function getCpActiveHeadcount(
  channelPartnerId: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Import employees dynamically to avoid circular dependency
  const { employees } = await import("../../drizzle/schema");

  const result = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.channelPartnerId, channelPartnerId),
        eq(employees.status, "active")
      )
    );

  return result.length;
}

/**
 * Get the CP's invoice numbering prefix and increment the sequence.
 * Returns the next invoice number string (e.g. "CIIC-00042").
 */
export async function generateCpInvoiceNumber(
  channelPartnerId: number
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current CP record
  const cpResult = await db
    .select({
      cpInvoicePrefix: channelPartners.cpInvoicePrefix,
      cpInvoiceSequence: channelPartners.cpInvoiceSequence,
    })
    .from(channelPartners)
    .where(eq(channelPartners.id, channelPartnerId))
    .limit(1);

  if (cpResult.length === 0) {
    throw new Error(`Channel Partner #${channelPartnerId} not found`);
  }

  const prefix = cpResult[0].cpInvoicePrefix || "CP-INV-";
  const currentSeq = cpResult[0].cpInvoiceSequence || 0;
  const nextSeq = currentSeq + 1;

  // Atomically increment the sequence
  await db
    .update(channelPartners)
    .set({ cpInvoiceSequence: nextSeq })
    .where(
      and(
        eq(channelPartners.id, channelPartnerId),
        eq(channelPartners.cpInvoiceSequence, currentSeq) // Optimistic lock
      )
    );

  // Pad sequence to 5 digits
  const paddedSeq = nextSeq.toString().padStart(5, "0");
  return `${prefix}${paddedSeq}`;
}
