import { z } from "zod";
import { router } from "../_core/trpc";
import { adminProcedure, userProcedure } from "../procedures";
import {
  listCountriesConfig,
  getCountryConfig,
  createCountryConfig,
  updateCountryConfig,
  deleteCountryConfig,
  listLeaveTypesByCountry,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
  logAuditAction,
} from "../db";

export const countriesRouter = router({
  list: userProcedure.query(async () => {
    return await listCountriesConfig();
  }),

  get: userProcedure
    .input(z.object({ countryCode: z.string() }))
    .query(async ({ input }) => {
      return await getCountryConfig(input.countryCode);
    }),

  create: adminProcedure
    .input(
      z.object({
        countryCode: z.string().min(2).max(3),
        countryName: z.string().min(1),
        localCurrency: z.string().min(3).max(3),
        payrollCycle: z.enum(["monthly", "semi_monthly"]).default("monthly"),
        probationPeriodDays: z.number().default(90),
        noticePeriodDays: z.number().default(30),
        workingDaysPerWeek: z.number().default(5),
        statutoryAnnualLeave: z.number().default(14),
        standardEorRate: z.string().optional(),
        standardVisaEorRate: z.string().optional(),
        standardAorRate: z.string().optional(),
        visaEorSetupFee: z.string().optional(),
        standardRateCurrency: z.string().default("USD"),
        vatApplicable: z.boolean().default(false),
        vatRate: z.string().default("0"),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Auto-set isActive based on whether any service fee is configured
      const hasServiceFee = !!(input.standardEorRate || input.standardVisaEorRate || input.standardAorRate);
      const result = await createCountryConfig({
        ...input,
        isActive: hasServiceFee,
      });

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "create",
        entityType: "country_config",
        changes: JSON.stringify(input),
      });

      return result;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          countryName: z.string().optional(),
          localCurrency: z.string().optional(),
          payrollCycle: z.enum(["monthly", "semi_monthly"]).optional(),
          probationPeriodDays: z.number().optional(),
          noticePeriodDays: z.number().optional(),
          workingDaysPerWeek: z.number().optional(),
          statutoryAnnualLeave: z.number().optional(),
          standardEorRate: z.string().nullable().optional(),
          standardVisaEorRate: z.string().nullable().optional(),
          standardAorRate: z.string().nullable().optional(),
          visaEorSetupFee: z.string().nullable().optional(),
          standardRateCurrency: z.string().optional(),
          vatApplicable: z.boolean().optional(),
          vatRate: z.string().nullable().optional(),
          notes: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Auto-determine isActive based on service fees
      const data = { ...input.data };
      const hasServiceFee = !!(data.standardEorRate || data.standardVisaEorRate || data.standardAorRate);
      const updateData = { ...data, isActive: hasServiceFee };
      await updateCountryConfig(input.id, updateData);

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update",
        entityType: "country_config",
        entityId: input.id,
        changes: JSON.stringify(input.data),
      });

      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteCountryConfig(input.id);

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "delete",
        entityType: "country_config",
        entityId: input.id,
      });

      return { success: true };
    }),

  // Batch create multiple countries at once
  batchCreate: adminProcedure
    .input(
      z.object({
        countries: z.array(
          z.object({
            countryCode: z.string().min(2).max(3),
            countryName: z.string().min(1),
            localCurrency: z.string().min(3).max(3),
            payrollCycle: z.enum(["monthly", "semi_monthly"]).default("monthly"),
            probationPeriodDays: z.number().default(90),
            noticePeriodDays: z.number().default(30),
            workingDaysPerWeek: z.number().default(5),
            statutoryAnnualLeave: z.number().default(14),
            standardEorRate: z.string().optional(),
            standardVisaEorRate: z.string().optional(),
            standardAorRate: z.string().optional(),
            visaEorSetupFee: z.string().optional(),
            standardRateCurrency: z.string().default("USD"),
            vatApplicable: z.boolean().default(false),
            vatRate: z.string().default("0"),
            notes: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const results = [];
      const errors = [];
      for (const country of input.countries) {
        try {
          const result = await createCountryConfig({
            ...country,
            isActive: true,
          });
          results.push(result);
        } catch (err: any) {
          errors.push({ countryCode: country.countryCode, error: err.message });
        }
      }

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "batch_create",
        entityType: "country_config",
        changes: JSON.stringify({ created: results.length, errors: errors.length }),
      });

      return { created: results.length, errors };
    }),

  // Leave types sub-router
  leaveTypes: router({
    list: userProcedure
      .input(z.object({ countryCode: z.string() }))
      .query(async ({ input }) => {
        return await listLeaveTypesByCountry(input.countryCode);
      }),

    create: adminProcedure
      .input(
        z.object({
          countryCode: z.string(),
          leaveTypeName: z.string().min(1),
          annualEntitlement: z.number().default(0),
          isPaid: z.boolean().default(true),
          requiresApproval: z.boolean().default(true),
          applicableGender: z.enum(["male", "female", "all"]).default("all"),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await createLeaveType(input);

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "create",
          entityType: "leave_type",
          changes: JSON.stringify(input),
        });

        return result;
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          data: z.object({
            leaveTypeName: z.string().optional(),
            annualEntitlement: z.number().optional(),
            isPaid: z.boolean().optional(),
            requiresApproval: z.boolean().optional(),
            applicableGender: z.enum(["male", "female", "all"]).optional(),
            description: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await updateLeaveType(input.id, input.data);

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "update",
          entityType: "leave_type",
          entityId: input.id,
          changes: JSON.stringify(input.data),
        });

        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteLeaveType(input.id);

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "delete",
          entityType: "leave_type",
          entityId: input.id,
        });

        return { success: true };
      }),
  }),
});
