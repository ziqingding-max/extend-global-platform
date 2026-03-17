import { z } from "zod";
import { router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { customerManagerProcedure, userProcedure } from "../procedures";
import {
  listCustomerLeavePolicies,
  createCustomerLeavePolicy,
  updateCustomerLeavePolicy,
  deleteCustomerLeavePolicy,
  listLeaveTypesByCountry,
  getCountryConfig,
  syncLeaveBalancesOnPolicyUpdate,
} from "../db";

export const customerLeavePoliciesRouter = router({
  // List all leave policies for a customer, optionally filtered by country
  list: userProcedure
    .input(
      z.object({
        customerId: z.number(),
        countryCode: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return await listCustomerLeavePolicies(input.customerId, input.countryCode);
    }),

  // Create a new leave policy
  create: customerManagerProcedure
    .input(
      z.object({
        customerId: z.number(),
        countryCode: z.string(),
        leaveTypeId: z.number(),
        annualEntitlement: z.number().min(0),
        expiryRule: z.enum(["year_end", "anniversary", "no_expiry"]).default("year_end"),
        carryOverDays: z.number().min(0).default(0),
      })
    )
    .mutation(async ({ input }) => {
      // Validate: entitlement must be >= statutory minimum for this leave type
      const countryConfig = await getCountryConfig(input.countryCode);
      const leaveTypes = await listLeaveTypesByCountry(input.countryCode);
      const leaveType = leaveTypes.find((lt) => lt.id === input.leaveTypeId);

      if (!leaveType) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Leave type ${input.leaveTypeId} not found for country ${input.countryCode}`,
        });
      }

      // Check statutory minimum for annual leave
      if (
        leaveType.leaveTypeName.toLowerCase().includes("annual") &&
        countryConfig?.statutoryAnnualLeave
      ) {
        if (input.annualEntitlement < countryConfig.statutoryAnnualLeave) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Annual entitlement (${input.annualEntitlement}) cannot be less than statutory minimum (${countryConfig.statutoryAnnualLeave}) for ${input.countryCode}`,
          });
        }
      }

      // Check if the leave type has a statutory entitlement
      if (leaveType.annualEntitlement && input.annualEntitlement < leaveType.annualEntitlement) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Annual entitlement (${input.annualEntitlement}) cannot be less than statutory minimum (${leaveType.annualEntitlement}) for ${leaveType.leaveTypeName}`,
        });
      }

      return await createCustomerLeavePolicy(input);
    }),

  // Update an existing leave policy
  update: customerManagerProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          annualEntitlement: z.number().min(0).optional(),
          expiryRule: z.enum(["year_end", "anniversary", "no_expiry"]).optional(),
          carryOverDays: z.number().min(0).optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      // Admin editing resets client confirmation — client must re-review
      const updateResult = await updateCustomerLeavePolicy(input.id, {
        ...input.data,
        clientConfirmed: false,
      });

      // After successful policy update, sync leave balances for all affected employees
      syncLeaveBalancesOnPolicyUpdate(input.id).catch(err => {
        console.error(`[LeaveSync] Background sync failed for policy ID ${input.id}:`, err);
      });

      return updateResult;
    }),

  // Delete a leave policy
  delete: customerManagerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteCustomerLeavePolicy(input.id);
    }),

  // Batch create: initialize policies for a customer + country from statutory defaults
  initializeFromStatutory: customerManagerProcedure
    .input(
      z.object({
        customerId: z.number(),
        countryCode: z.string(),
        overrides: z
          .array(
            z.object({
              leaveTypeId: z.number(),
              annualEntitlement: z.number().min(0),
              expiryRule: z.enum(["year_end", "anniversary", "no_expiry"]).optional(),
              carryOverDays: z.number().min(0).optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const leaveTypes = await listLeaveTypesByCountry(input.countryCode);
      if (leaveTypes.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No leave types configured for country ${input.countryCode}`,
        });
      }

      // Check existing policies
      const existing = await listCustomerLeavePolicies(input.customerId, input.countryCode);
      const existingTypeIds = new Set(existing.map((p) => p.leaveTypeId));

      const overrideMap = new Map(
        (input.overrides ?? []).map((o) => [o.leaveTypeId, o])
      );

      let created = 0;
      for (const lt of leaveTypes) {
        if (existingTypeIds.has(lt.id)) continue;

        const override = overrideMap.get(lt.id);
        await createCustomerLeavePolicy({
          customerId: input.customerId,
          countryCode: input.countryCode,
          leaveTypeId: lt.id,
          annualEntitlement: override?.annualEntitlement ?? lt.annualEntitlement ?? 0,
          expiryRule: override?.expiryRule ?? "year_end",
          carryOverDays: override?.carryOverDays ?? 0,
        });
        created++;
      }

      return { created };
    }),
});
