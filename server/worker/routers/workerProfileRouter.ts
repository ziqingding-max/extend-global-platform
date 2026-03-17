/**
 * Worker Profile Router
 *
 * Both Employee and Contractor: view and update personal profile.
 * Workers can only update limited personal fields (contact info, address, bank details).
 * Core fields (salary, job title, etc.) are managed by Admin/Client.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  workerRouter,
  protectedWorkerProcedure,
} from "../workerTrpc";
import { getDb } from "../../services/db/connection";
import { contractors, employees } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

export const workerProfileRouter = workerRouter({
  /**
   * Get my profile — returns different data based on workerType
   */
  me: protectedWorkerProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { workerUser } = ctx;

    if (workerUser.workerType === "contractor" && workerUser.contractorId) {
      const [contractor] = await db
        .select({
          id: contractors.id,
          contractorCode: contractors.contractorCode,
          firstName: contractors.firstName,
          lastName: contractors.lastName,
          email: contractors.email,
          phone: contractors.phone,
          dateOfBirth: contractors.dateOfBirth,
          nationality: contractors.nationality,
          address: contractors.address,
          city: contractors.city,
          state: contractors.state,
          country: contractors.country,
          postalCode: contractors.postalCode,
          jobTitle: contractors.jobTitle,
          department: contractors.department,
          startDate: contractors.startDate,
          endDate: contractors.endDate,
          status: contractors.status,
          currency: contractors.currency,
          paymentFrequency: contractors.paymentFrequency,
          rateType: contractors.rateType,
          rateAmount: contractors.rateAmount,
          bankDetails: contractors.bankDetails,
        })
        .from(contractors)
        .where(eq(contractors.id, workerUser.contractorId));

      if (!contractor) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contractor profile not found" });
      }

      return { workerType: "contractor" as const, profile: contractor };
    } else if (workerUser.workerType === "employee" && workerUser.employeeId) {
      const [employee] = await db
        .select({
          id: employees.id,
          employeeCode: employees.employeeCode,
          firstName: employees.firstName,
          lastName: employees.lastName,
          email: employees.email,
          phone: employees.phone,
          dateOfBirth: employees.dateOfBirth,
          nationality: employees.nationality,
          address: employees.address,
          city: employees.city,
          state: employees.state,
          country: employees.country,
          postalCode: employees.postalCode,
          jobTitle: employees.jobTitle,
          department: employees.department,
          startDate: employees.startDate,
          endDate: employees.endDate,
          status: employees.status,
          salaryCurrency: employees.salaryCurrency,
          bankDetails: employees.bankDetails,
        })
        .from(employees)
        .where(eq(employees.id, workerUser.employeeId));

      if (!employee) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee profile not found" });
      }

      return { workerType: "employee" as const, profile: employee };
    }

    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invalid worker profile" });
  }),

  /**
   * Update my profile (limited fields only — contact info, address, bank details)
   */
  update: protectedWorkerProcedure
    .input(
      z.object({
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        bankDetails: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { workerUser } = ctx;

      // Build update payload (only non-undefined fields)
      const updateData: Record<string, any> = {};
      if (input.phone !== undefined) updateData.phone = input.phone;
      if (input.address !== undefined) updateData.address = input.address;
      if (input.city !== undefined) updateData.city = input.city;
      if (input.state !== undefined) updateData.state = input.state;
      if (input.postalCode !== undefined) updateData.postalCode = input.postalCode;
      if (input.bankDetails !== undefined) updateData.bankDetails = input.bankDetails;

      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      if (workerUser.workerType === "contractor" && workerUser.contractorId) {
        await db
          .update(contractors)
          .set(updateData)
          .where(eq(contractors.id, workerUser.contractorId));
      } else if (workerUser.workerType === "employee" && workerUser.employeeId) {
        await db
          .update(employees)
          .set(updateData)
          .where(eq(employees.id, workerUser.employeeId));
      } else {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invalid worker profile" });
      }

      return { success: true };
    }),
});
