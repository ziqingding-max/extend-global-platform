import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { salaryBenchmarks } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const salaryBenchmarkRouter = router({
  getBenchmark: protectedProcedure
    .input(z.object({
        countryCode: z.string(),
        jobCategory: z.string(),
        seniorityLevel: z.enum(["junior", "mid", "senior", "lead", "director"])
    }))
    .query(async ({ input }) => {
        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
        
        return await db.query.salaryBenchmarks.findFirst({
            where: and(
                eq(salaryBenchmarks.countryCode, input.countryCode),
                eq(salaryBenchmarks.jobCategory, input.jobCategory),
                eq(salaryBenchmarks.seniorityLevel, input.seniorityLevel)
            )
        });
    }),
    
  listJobFunctions: protectedProcedure
    .input(z.object({ countryCode: z.string() }))
    .query(async ({ input }) => {
        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
        
        const rows = await db
            .selectDistinct({ category: salaryBenchmarks.jobCategory })
            .from(salaryBenchmarks)
            .where(eq(salaryBenchmarks.countryCode, input.countryCode));
            
        return rows.map(r => r.category);
    }),

  upsertBenchmark: protectedProcedure
    .input(z.object({
        id: z.number().optional(),
        countryCode: z.string(),
        jobCategory: z.string(),
        jobTitle: z.string(),
        seniorityLevel: z.enum(["junior", "mid", "senior", "lead", "director"]),
        salaryP25: z.string(),
        salaryP50: z.string(),
        salaryP75: z.string(),
        currency: z.string(),
        dataYear: z.number(),
        source: z.string().optional()
    }))
    .mutation(async ({ input }) => {
        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
        
        if (input.id) {
            await db.update(salaryBenchmarks)
                .set({ ...input, updatedAt: new Date() })
                .where(eq(salaryBenchmarks.id, input.id));
            return { id: input.id };
        } else {
            const [res] = await db.insert(salaryBenchmarks).values(input).returning({ id: salaryBenchmarks.id });
            return res;
        }
    })
});
