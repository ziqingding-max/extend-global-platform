import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { calculationService } from "../services/calculationService";
import { getDb } from "../db";
import { countrySocialInsuranceItems } from "../../drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const calculationRouter = router({
  calculateContributions: protectedProcedure
    .input(
      z.object({
        countryCode: z.string(),
        year: z.number().optional().default(2025),
        salary: z.number(),
        regionCode: z.string().optional(),
        age: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await calculationService.calculateSocialInsurance({
        ...input,
        year: input.year || 2025
      });
    }),

  listSocialInsuranceRules: protectedProcedure
    .input(
      z.object({
        countryCode: z.string(),
        year: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      return await db
        .select()
        .from(countrySocialInsuranceItems)
        .where(
          and(
            eq(countrySocialInsuranceItems.countryCode, input.countryCode),
            eq(countrySocialInsuranceItems.effectiveYear, input.year),
            eq(countrySocialInsuranceItems.isActive, true)
          )
        )
        .orderBy(countrySocialInsuranceItems.sortOrder);
    }),

  listRegions: protectedProcedure
    .input(
      z.object({
        countryCode: z.string(),
        year: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      // Get distinct regions
      const result = await db
        .selectDistinct({
          regionCode: countrySocialInsuranceItems.regionCode,
          regionName: countrySocialInsuranceItems.regionName,
        })
        .from(countrySocialInsuranceItems)
        .where(
          and(
            eq(countrySocialInsuranceItems.countryCode, input.countryCode),
            eq(countrySocialInsuranceItems.effectiveYear, input.year),
            isNotNull(countrySocialInsuranceItems.regionCode)
          )
        );
      
      return result;
    }),
});
