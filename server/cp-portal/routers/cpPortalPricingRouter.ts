/**
 * CP Portal Pricing Router
 *
 * Manages CP→End Client pricing rules from the CP's perspective.
 * All queries are SCOPED to ctx.cpUser.channelPartnerId.
 *
 * Capabilities:
 * - List pricing rules for all clients or a specific client
 * - Create/update/delete pricing rules
 * - Only cp_admin and cp_finance roles can manage pricing
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, count } from "drizzle-orm";
import {
  cpFinanceProcedure,
  protectedCpProcedure,
  cpPortalRouter,
} from "../cpPortalTrpc";
import { getDb } from "../../db";
import {
  cpClientPricing,
  customers,
} from "../../../drizzle/schema";
import {
  listCpClientPricing,
  getCpClientPricingById,
  createCpClientPricing,
  updateCpClientPricing,
  deleteCpClientPricing,
  logAuditAction,
} from "../../db";

// ============================================================================
// Input Schemas
// ============================================================================

const pricingInput = z.object({
  customerId: z.number(),
  pricingType: z.enum(["fixed_per_employee", "percentage_markup", "mixed"]),
  fixedFeeAmount: z.string().optional(),
  markupPercentage: z.string().optional(),
  baseFeeAmount: z.string().optional(),
  additionalMarkupPercentage: z.string().optional(),
  countryCode: z.string().max(3).optional(),
  serviceType: z.enum(["eor", "visa_eor"]).optional(),
  currency: z.string().max(3).default("USD"),
  fxMarkupPercentage: z.string().default("5.00"),
  effectiveFrom: z.string(), // YYYY-MM-DD
  effectiveTo: z.string().optional(),
  isActive: z.boolean().default(true),
});

// ============================================================================
// Router
// ============================================================================

export const cpPortalPricingRouter = cpPortalRouter({
  /**
   * List all pricing rules for this CP (optionally filtered by client)
   */
  list: protectedCpProcedure
    .input(
      z.object({
        customerId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;
      const rules = await listCpClientPricing(cpId, input.customerId);

      // Enrich with customer name
      const db = getDb();
      if (!db || rules.length === 0) return rules;

      const customerIds = Array.from(new Set(rules.map((r: any) => r.customerId)));
      const customerRows = await db
        .select({ id: customers.id, companyName: customers.companyName })
        .from(customers)
        .where(
          and(
            eq(customers.channelPartnerId, cpId),
            // Only fetch customers that belong to this CP
          )
        );

      const customerMap = new Map(customerRows.map((c) => [c.id, c.companyName]));

      return rules.map((rule: any) => ({
        ...rule,
        customerName: customerMap.get(rule.customerId) || "Unknown",
      }));
    }),

  /**
   * Get a specific pricing rule
   */
  get: protectedCpProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const rule = await getCpClientPricingById(input.id);
      if (!rule || rule.channelPartnerId !== ctx.cpUser.channelPartnerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pricing rule not found" });
      }
      return rule;
    }),

  /**
   * Create a new pricing rule
   */
  create: cpFinanceProcedure
    .input(pricingInput)
    .mutation(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify the customer belongs to this CP
      const customerCheck = await db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.id, input.customerId),
            eq(customers.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (customerCheck.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Client not found or not assigned to your organization" });
      }

      // Validate pricing type fields
      validatePricingFields(input);

      const resultRows = await createCpClientPricing({
        channelPartnerId: cpId,
        ...input,
      });

      const newRule = Array.isArray(resultRows) ? resultRows[0] : resultRows;

      await logAuditAction({
        action: "cp_client_pricing_create",
        entityType: "cp_client_pricing",
        entityId: newRule?.id ?? 0,
        channelPartnerId: cpId,
        portalSource: "cp_portal",
        userName: ctx.cpUser.contactName,
        changes: JSON.stringify(input),
      });

      return newRule;
    }),

  /**
   * Update an existing pricing rule
   */
  update: cpFinanceProcedure
    .input(
      z.object({
        id: z.number(),
        data: pricingInput.partial(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;

      // Verify ownership
      const existingRule = await getCpClientPricingById(input.id);
      if (!existingRule || existingRule.channelPartnerId !== cpId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pricing rule not found" });
      }

      const result = await updateCpClientPricing(input.id, input.data);

      await logAuditAction({
        action: "cp_client_pricing_update",
        entityType: "cp_client_pricing",
        entityId: input.id,
        channelPartnerId: cpId,
        portalSource: "cp_portal",
        userName: ctx.cpUser.contactName,
        changes: JSON.stringify(input.data),
      });

      return result;
    }),

  /**
   * Delete a pricing rule
   */
  delete: cpFinanceProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;

      // Verify ownership
      const existingRule = await getCpClientPricingById(input.id);
      if (!existingRule || existingRule.channelPartnerId !== cpId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pricing rule not found" });
      }

      await deleteCpClientPricing(input.id);

      await logAuditAction({
        action: "cp_client_pricing_delete",
        entityType: "cp_client_pricing",
        entityId: input.id,
        channelPartnerId: cpId,
        portalSource: "cp_portal",
        userName: ctx.cpUser.contactName,
      });

      return { success: true };
    }),
});

// ============================================================================
// Helpers
// ============================================================================

function validatePricingFields(input: z.infer<typeof pricingInput>) {
  switch (input.pricingType) {
    case "fixed_per_employee":
      if (!input.fixedFeeAmount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "fixedFeeAmount is required for fixed_per_employee pricing",
        });
      }
      break;
    case "percentage_markup":
      if (!input.markupPercentage) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "markupPercentage is required for percentage_markup pricing",
        });
      }
      break;
    case "mixed":
      if (!input.baseFeeAmount || !input.additionalMarkupPercentage) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "baseFeeAmount and additionalMarkupPercentage are required for mixed pricing",
        });
      }
      break;
  }
}
