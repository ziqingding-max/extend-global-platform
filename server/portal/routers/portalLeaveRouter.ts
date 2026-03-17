/**
 * Portal Leave Router
 *
 * All queries are SCOPED to ctx.portalUser.customerId via employee join.
 * Portal users can view and submit leave records.
 *
 * Unified approval flow: submitted → client_approved → admin_approved → locked
 * Cross-month leave is automatically split into monthly portions (matching Admin behavior).
 * Cutoff enforcement ensures submissions respect payroll deadlines.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, count } from "drizzle-orm";
import {
  protectedPortalProcedure,
  portalHrProcedure,
  portalRouter,
} from "../portalTrpc";
import { getDb } from "../../db";
import {
  leaveRecords,
  leaveBalances,
  leaveTypes,
  employees,
  publicHolidays,
  payrollRuns,
  payrollItems,
} from "../../../drizzle/schema";
import {
  enforceCutoff,
  isLeavesCrossMonth,
  splitLeaveByMonth,
  getLeavePayrollMonth,
} from "../../utils/cutoff";

export const portalLeaveRouter = portalRouter({
  /**
   * List leave records — scoped to customerId via employee join
   */
  list: protectedPortalProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.string().optional(),
        employeeId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const cid = ctx.portalUser.customerId;

      const conditions = [eq(employees.customerId, cid)];

      if (input.status) {
        conditions.push(eq(leaveRecords.status, input.status as any));
      }
      if (input.employeeId) {
        conditions.push(eq(leaveRecords.employeeId, input.employeeId));
      }

      const where = and(...conditions);

      const [totalResult] = await db
        .select({ count: count() })
        .from(leaveRecords)
        .innerJoin(employees, eq(leaveRecords.employeeId, employees.id))
        .where(where);

      const items = await db
        .select({
          id: leaveRecords.id,
          employeeId: leaveRecords.employeeId,
          leaveTypeId: leaveRecords.leaveTypeId,
          startDate: leaveRecords.startDate,
          endDate: leaveRecords.endDate,
          days: leaveRecords.days,
          status: leaveRecords.status,
          reason: leaveRecords.reason,
          clientApprovedBy: leaveRecords.clientApprovedBy,
          clientApprovedAt: leaveRecords.clientApprovedAt,
          clientRejectionReason: leaveRecords.clientRejectionReason,
          adminApprovedBy: leaveRecords.adminApprovedBy,
          adminApprovedAt: leaveRecords.adminApprovedAt,
          adminRejectionReason: leaveRecords.adminRejectionReason,
          createdAt: leaveRecords.createdAt,
          // Employee info
          employeeFirstName: employees.firstName,
          employeeLastName: employees.lastName,
          // Leave type info
          leaveTypeName: leaveTypes.leaveTypeName,
        })
        .from(leaveRecords)
        .innerJoin(employees, eq(leaveRecords.employeeId, employees.id))
        .leftJoin(leaveTypes, eq(leaveRecords.leaveTypeId, leaveTypes.id))
        .where(where)
        .orderBy(sql`${leaveRecords.updatedAt} DESC`)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, total: totalResult?.count ?? 0 };
    }),

  /**
   * Get leave balances for an employee — scoped to customerId
   */
  balances: protectedPortalProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const cid = ctx.portalUser.customerId;

      // Verify employee belongs to this customer
      const [emp] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.customerId, cid)));

      if (!emp) return [];

      const balances = await db
        .select({
          id: leaveBalances.id,
          leaveTypeId: leaveBalances.leaveTypeId,
          year: leaveBalances.year,
          totalEntitlement: leaveBalances.totalEntitlement,
          used: leaveBalances.used,
          remaining: leaveBalances.remaining,
          leaveTypeName: leaveTypes.leaveTypeName,
          applicableGender: leaveTypes.applicableGender,
        })
        .from(leaveBalances)
        .leftJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
        .where(eq(leaveBalances.employeeId, input.employeeId));

      return balances;
    }),

  /**
   * Submit leave record — only HR managers and admins
   *
   * Now includes:
   * - Cutoff enforcement (matching Admin behavior)
   * - Cross-month leave auto-splitting (matching Admin behavior)
   * - Business day calculation for accurate day counts
   */
  create: portalHrProcedure
    .input(
      z.object({
        employeeId: z.number(),
        leaveTypeId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
        days: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // CRITICAL: Verify employee belongs to this customer
      const [emp] = await db
        .select({ id: employees.id, country: employees.country })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.customerId, cid)));

      if (!emp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      // Enforce cutoff based on the end date's payroll month (matching Admin behavior)
      const endPayrollMonth = getLeavePayrollMonth(input.endDate);
      const endPayrollMonthNormalized = `${endPayrollMonth}-01`;
      await enforceCutoff(endPayrollMonthNormalized, "portal_hr", "create leave record");

      // Check if payroll run for the end date's month is already approved/locked
      const [existingPayroll] = await db
        .select({ id: payrollRuns.id, status: payrollRuns.status })
        .from(payrollRuns)
        .innerJoin(payrollItems, eq(payrollRuns.id, payrollItems.payrollRunId))
        .where(
          and(
            eq(payrollRuns.countryCode, emp.country),
            eq(payrollRuns.payrollMonth, endPayrollMonthNormalized),
            eq(payrollItems.employeeId, input.employeeId)
          )
        )
        .limit(1);

      if (existingPayroll && (existingPayroll.status === "approved" || existingPayroll.status === "pending_approval")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Payroll run for ${endPayrollMonth} is already ${existingPayroll.status}. Leave requests cannot be added.`,
        });
      }

      // Validate gender compatibility with leave type
      const [leaveTypeGenderInfo] = await db
        .select({ applicableGender: leaveTypes.applicableGender, leaveTypeName: leaveTypes.leaveTypeName })
        .from(leaveTypes)
        .where(eq(leaveTypes.id, input.leaveTypeId))
        .limit(1);
      if (leaveTypeGenderInfo) {
        const applicable = leaveTypeGenderInfo.applicableGender || "all";
        // Get employee gender
        const [empGenderInfo] = await db
          .select({ gender: employees.gender })
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const empGender = empGenderInfo?.gender;
        if (applicable !== "all" && empGender && empGender !== "other" && empGender !== "prefer_not_to_say" && applicable !== empGender) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `This leave type (${leaveTypeGenderInfo.leaveTypeName}) is only applicable to ${applicable} employees.` });
        }
      }

      // Days already include half-day deduction (calculated on frontend, matching Admin behavior)
      const totalDays = parseFloat(input.days);

      // Cross-month leave splitting (matching Admin behavior)
      const crossMonth = isLeavesCrossMonth(input.startDate, input.endDate);
      const splits = crossMonth
        ? splitLeaveByMonth(input.startDate, input.endDate, totalDays)
        : [{ startDate: input.startDate, endDate: input.endDate, days: totalDays, payrollMonth: getLeavePayrollMonth(input.endDate) }];

      // Check if this is a paid leave type
      const [leaveTypeInfo] = await db
        .select({ isPaid: leaveTypes.isPaid })
        .from(leaveTypes)
        .where(eq(leaveTypes.id, input.leaveTypeId))
        .limit(1);
      const isPaid = leaveTypeInfo?.isPaid !== false;

      // Check balance and auto-split if insufficient (paid leave only)
      const year = parseInt(input.endDate.split("-")[0], 10);
      let paidDays = totalDays;
      let unpaidDays = 0;
      let unpaidLeaveTypeId: number | null = null;
      let balanceSplit = false;

      if (isPaid) {
        // Get current balance
        const balanceRows = await db
          .select({ id: leaveBalances.id, remaining: leaveBalances.remaining, used: leaveBalances.used })
          .from(leaveBalances)
          .where(and(
            eq(leaveBalances.employeeId, input.employeeId),
            eq(leaveBalances.leaveTypeId, input.leaveTypeId),
            eq(leaveBalances.year, year)
          ))
          .limit(1);
        const balance = balanceRows[0];
        const remaining = balance ? Number(balance.remaining ?? 0) : 0;

        if (totalDays > remaining) {
          paidDays = Math.max(0, remaining);
          unpaidDays = totalDays - paidDays;
          // Find Unpaid Leave type for this country
          const [unpaidType] = await db
            .select({ id: leaveTypes.id })
            .from(leaveTypes)
            .where(and(eq(leaveTypes.countryCode, emp.country), eq(leaveTypes.isPaid, false)))
            .limit(1);
          if (!unpaidType) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient leave balance (${remaining} days remaining, ${totalDays} requested). No Unpaid Leave type configured for this country.` });
          }
          unpaidLeaveTypeId = unpaidType.id;
          balanceSplit = true;
        }
      }

      // Helper to update balance
      const deductBalance = async (leaveTypeId: number, days: number, yr: number) => {
        const [bal] = await db
          .select({ id: leaveBalances.id, used: leaveBalances.used, remaining: leaveBalances.remaining })
          .from(leaveBalances)
          .where(and(
            eq(leaveBalances.employeeId, input.employeeId),
            eq(leaveBalances.leaveTypeId, leaveTypeId),
            eq(leaveBalances.year, yr)
          ))
          .limit(1);
        if (bal) {
          await db.update(leaveBalances).set({
            used: Math.max(0, (bal.used ?? 0) + days),
            remaining: Math.max(0, (bal.remaining ?? 0) - days),
          }).where(eq(leaveBalances.id, bal.id));
        }
      };

      // Create records
      if (balanceSplit) {
        // Create paid portion records
        if (paidDays > 0) {
          const paidRatio = paidDays / totalDays;
          for (const split of splits) {
            const splitPaidDays = Math.round(split.days * paidRatio * 10) / 10;
            if (splitPaidDays <= 0) continue;
            await db.insert(leaveRecords).values({
              employeeId: input.employeeId,
              leaveTypeId: input.leaveTypeId,
              startDate: split.startDate,
              endDate: split.endDate,
              days: String(splitPaidDays),
              status: "submitted",
              reason: `${input.reason || ""}${input.reason ? " | " : ""}[Paid portion: ${splitPaidDays} days]`.trim(),
            });
            const splitYear = parseInt(split.endDate.split("-")[0], 10);
            await deductBalance(input.leaveTypeId, splitPaidDays, splitYear);
          }
        }
        // Create unpaid portion records
        if (unpaidDays > 0 && unpaidLeaveTypeId) {
          const unpaidRatio = unpaidDays / totalDays;
          for (const split of splits) {
            const splitUnpaidDays = Math.round(split.days * unpaidRatio * 10) / 10;
            if (splitUnpaidDays <= 0) continue;
            await db.insert(leaveRecords).values({
              employeeId: input.employeeId,
              leaveTypeId: unpaidLeaveTypeId,
              startDate: split.startDate,
              endDate: split.endDate,
              days: String(splitUnpaidDays),
              status: "submitted",
              reason: `${input.reason || ""}${input.reason ? " | " : ""}[Unpaid portion: ${splitUnpaidDays} days \u2014 auto-split due to insufficient balance]`.trim(),
            });
          }
        }
        return { success: true, splits: splits.length, balanceSplit: true, paidDays, unpaidDays };
      } else {
        // Normal flow: sufficient balance or unpaid leave type
        for (const split of splits) {
          await db.insert(leaveRecords).values({
            employeeId: input.employeeId,
            leaveTypeId: input.leaveTypeId,
            startDate: split.startDate,
            endDate: split.endDate,
            days: String(split.days),
            status: "submitted",
            reason: input.reason || null,
          });
          // Deduct balance for paid leave
          if (isPaid) {
            const splitYear = parseInt(split.endDate.split("-")[0], 10);
            await deductBalance(input.leaveTypeId, split.days, splitYear);
          }
        }
        return { success: true, splits: crossMonth ? splits.length : undefined };
      }
    }),

  /**
   * Delete leave record — only if status is 'submitted'
   */
  delete: portalHrProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Verify leave record belongs to an employee of this customer
      const records = await db
        .select({
          id: leaveRecords.id,
          status: leaveRecords.status,
          endDate: leaveRecords.endDate,
          employeeId: leaveRecords.employeeId,
          leaveTypeId: leaveRecords.leaveTypeId,
          days: leaveRecords.days,
        })
        .from(leaveRecords)
        .innerJoin(employees, eq(leaveRecords.employeeId, employees.id))
        .where(and(eq(leaveRecords.id, input.id), eq(employees.customerId, cid)));

      if (records.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Leave record not found" });
      }

      if (records[0].status !== "submitted") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Leave record is locked and cannot be deleted" });
      }

      // Enforce cutoff before allowing deletion
      if (records[0].endDate) {
        const payrollMonth = getLeavePayrollMonth(records[0].endDate);
        await enforceCutoff(`${payrollMonth}-01`, "portal_hr", "delete leave record");
      }

      // Restore leave balance before deleting
      const record = records[0];
      const days = parseFloat(String(record.days ?? "0"));
      if (days > 0 && record.endDate) {
        const yr = parseInt(String(record.endDate).split("-")[0], 10);
        // Check if this is a paid leave type
        const [ltInfo] = await db
          .select({ isPaid: leaveTypes.isPaid })
          .from(leaveTypes)
          .where(eq(leaveTypes.id, record.leaveTypeId))
          .limit(1);
        if (ltInfo?.isPaid !== false) {
          const [bal] = await db
            .select({ id: leaveBalances.id, used: leaveBalances.used, remaining: leaveBalances.remaining })
            .from(leaveBalances)
            .where(and(
              eq(leaveBalances.employeeId, record.employeeId),
              eq(leaveBalances.leaveTypeId, record.leaveTypeId),
              eq(leaveBalances.year, yr)
            ))
            .limit(1);
          if (bal) {
            await db.update(leaveBalances).set({
              used: Math.max(0, (bal.used ?? 0) - days),
              remaining: (bal.remaining ?? 0) + days,
            }).where(eq(leaveBalances.id, bal.id));
          }
        }
      }

      await db.delete(leaveRecords).where(eq(leaveRecords.id, input.id));
      return { success: true };
    }),

  /**
   * Client approve leave record — HR manager / admin approves a submitted leave
   */
  approve: portalHrProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      const records = await db
        .select({ id: leaveRecords.id, status: leaveRecords.status })
        .from(leaveRecords)
        .innerJoin(employees, eq(leaveRecords.employeeId, employees.id))
        .where(and(eq(leaveRecords.id, input.id), eq(employees.customerId, cid)));

      if (records.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Leave record not found" });
      }

      if (records[0].status !== "submitted") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only submitted leave records can be approved" });
      }

      await db.update(leaveRecords).set({
        status: "client_approved",
        clientApprovedBy: ctx.portalUser.contactId,
        clientApprovedAt: new Date(),
      }).where(eq(leaveRecords.id, input.id));

      return { success: true };
    }),

  /**
   * Client reject leave record
   */
  reject: portalHrProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      const records = await db
        .select({ id: leaveRecords.id, status: leaveRecords.status })
        .from(leaveRecords)
        .innerJoin(employees, eq(leaveRecords.employeeId, employees.id))
        .where(and(eq(leaveRecords.id, input.id), eq(employees.customerId, cid)));

      if (records.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Leave record not found" });
      }

      if (records[0].status !== "submitted") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only submitted leave records can be rejected" });
      }

      await db.update(leaveRecords).set({
        status: "client_rejected",
        clientApprovedBy: ctx.portalUser.contactId,
        clientApprovedAt: new Date(),
        clientRejectionReason: input.reason || null,
      }).where(eq(leaveRecords.id, input.id));

      return { success: true };
    }),

  /**
   * Get public holidays for countries where this customer has active employees
   */
  publicHolidays: protectedPortalProcedure
    .input(z.object({ year: z.number().default(2026) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const cid = ctx.portalUser.customerId;

      // Get countries where this customer has active employees
      const activeCountries = await db
        .select({ country: employees.country })
        .from(employees)
        .where(and(eq(employees.customerId, cid), eq(employees.status, "active")))
        .groupBy(employees.country);

      if (activeCountries.length === 0) return [];

      // employees.country stores full names (e.g. "Australia"),
      // but publicHolidays.countryCode stores ISO codes (e.g. "AU").
      // We need a reverse mapping from name → code.
      const NAME_TO_CODE: Record<string, string> = {
        // A
        "United Arab Emirates": "AE", "Albania": "AL", "Armenia": "AM", "Argentina": "AR",
        "Austria": "AT", "Australia": "AU", "Azerbaijan": "AZ",
        // B
        "Bosnia and Herzegovina": "BA", "Bangladesh": "BD", "Belgium": "BE", "Bulgaria": "BG",
        "Bahrain": "BH", "Brunei": "BN", "Bolivia": "BO", "Brazil": "BR", "Belarus": "BY",
        // C
        "Canada": "CA", "Switzerland": "CH", "C\u00f4te d'Ivoire": "CI", "Chile": "CL",
        "Cameroon": "CM", "China": "CN", "Colombia": "CO", "Costa Rica": "CR",
        "Cyprus": "CY", "Czech Republic": "CZ",
        // D
        "Germany": "DE", "Denmark": "DK", "Dominican Republic": "DO", "Algeria": "DZ",
        // E
        "Ecuador": "EC", "Estonia": "EE", "Egypt": "EG", "Spain": "ES", "Ethiopia": "ET",
        // F
        "Finland": "FI", "Fiji": "FJ", "France": "FR",
        // G
        "United Kingdom": "GB", "Georgia": "GE", "Ghana": "GH", "Greece": "GR",
        "Guatemala": "GT",
        // H
        "Hong Kong, China": "HK", "Hong Kong": "HK", "Hong Kong S.A.R.": "HK",
        "Honduras": "HN", "Croatia": "HR", "Hungary": "HU",
        // I
        "Indonesia": "ID", "Ireland": "IE", "Israel": "IL", "India": "IN",
        "Iraq": "IQ", "Iran": "IR", "Iceland": "IS", "Italy": "IT",
        // J
        "Jamaica": "JM", "Jordan": "JO", "Japan": "JP",
        // K
        "Kenya": "KE", "Cambodia": "KH", "South Korea": "KR", "Kuwait": "KW", "Kazakhstan": "KZ",
        // L
        "Laos": "LA", "Lebanon": "LB", "Sri Lanka": "LK",
        "Lithuania": "LT", "Luxembourg": "LU", "Latvia": "LV",
        // M
        "Morocco": "MA", "Moldova": "MD", "Montenegro": "ME", "North Macedonia": "MK",
        "Myanmar": "MM", "Mongolia": "MN", "Macau, China": "MO", "Macau": "MO",
        "Malta": "MT", "Mauritius": "MU", "Maldives": "MV", "Mexico": "MX", "Malaysia": "MY",
        // N
        "Nigeria": "NG", "Nicaragua": "NI", "Netherlands": "NL", "Norway": "NO",
        "Nepal": "NP", "New Zealand": "NZ",
        // O
        "Oman": "OM",
        // P
        "Panama": "PA", "Peru": "PE", "Papua New Guinea": "PG", "Philippines": "PH",
        "Pakistan": "PK", "Poland": "PL", "Puerto Rico": "PR", "Portugal": "PT", "Paraguay": "PY",
        // Q
        "Qatar": "QA",
        // R
        "Romania": "RO", "Serbia": "RS", "Russia": "RU", "Rwanda": "RW",
        // S
        "Saudi Arabia": "SA", "Sweden": "SE", "Singapore": "SG", "Slovenia": "SI",
        "Slovakia": "SK", "Senegal": "SN", "El Salvador": "SV",
        // T
        "Thailand": "TH", "Timor-Leste": "TL", "Tunisia": "TN", "Turkey": "TR",
        "Trinidad and Tobago": "TT", "Taiwan, China": "TW", "Taiwan": "TW", "Tanzania": "TZ",
        // U
        "Ukraine": "UA", "Uganda": "UG", "United States": "US", "Uruguay": "UY",
        "Uzbekistan": "UZ",
        // V
        "Venezuela": "VE", "Vietnam": "VN",
        // X
        "Kosovo": "XK",
        // Z
        "South Africa": "ZA",
        // Common aliases
        "UAE": "AE",
      };

      // Convert full names to ISO codes; if already a 2-letter code, keep as-is
      const countryCodes = activeCountries
        .map((c) => {
          const val = c.country;
          if (!val) return null;
          if (val.length === 2) return val.toUpperCase();
          return NAME_TO_CODE[val] || null;
        })
        .filter((c): c is string => c !== null);

      if (countryCodes.length === 0) return [];

      const holidays = await db
        .select()
        .from(publicHolidays)
        .where(
          and(
            sql`${publicHolidays.countryCode} IN (${sql.join(countryCodes.map(c => sql`${c}`), sql`, `)})`,
            eq(publicHolidays.year, input.year)
          )
        )
        .orderBy(publicHolidays.holidayDate);

      return holidays;
    }),
});
