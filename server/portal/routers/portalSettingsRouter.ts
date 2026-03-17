/**
 * Portal Settings Router
 *
 * Handles: company profile, leave policies, user management (invite/roles).
 * All queries are SCOPED to ctx.portalUser.customerId.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, count } from "drizzle-orm";
import {
  protectedPortalProcedure,
  portalAdminProcedure,
  portalRouter,
} from "../portalTrpc";
import { getDb } from "../../db";
import {
  customers,
  customerContacts,
  customerLeavePolicies,
  leaveTypes,
  countriesConfig,
  employees,
} from "../../../drizzle/schema";
import {
  generateInviteToken,
  getInviteExpiryDate,
} from "../portalAuth";
import { sendPortalInviteEmail } from "../../services/authEmailService";
import {
  getCurrentPayrollPeriod,
  getPayrollPeriodInfo,
  checkCutoffPassed,
  splitLeaveByMonth,
  isLeavesCrossMonth,
} from "../../utils/cutoff";

export const portalSettingsRouter = portalRouter({
  // ── Payroll Period Endpoints (for Portal PayrollCycleIndicator) ──

  /**
   * Get the current active payroll period with cutoff info.
   */
  currentPayrollPeriod: protectedPortalProcedure.query(async () => {
    return await getCurrentPayrollPeriod();
  }),

  /**
   * Get payroll period info for a specific month.
   */
  payrollPeriodInfo: protectedPortalProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ input }) => {
      return await getPayrollPeriodInfo(input.month);
    }),

  /**
   * Check cutoff status for a specific effective month.
   */
  checkCutoff: protectedPortalProcedure
    .input(z.object({ effectiveMonth: z.string() }))
    .query(async ({ input }) => {
      const result = await checkCutoffPassed(input.effectiveMonth);
      return {
        passed: result.passed,
        cutoffDate: result.cutoffDate.toISOString(),
      };
    }),

  /**
   * Preview how a cross-month leave would be split into monthly portions.
   */
  previewLeaveSplit: protectedPortalProcedure
    .input(z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      totalDays: z.number().positive(),
    }))
    .query(({ input }) => {
      const crossMonth = isLeavesCrossMonth(input.startDate, input.endDate);
      const splits = splitLeaveByMonth(input.startDate, input.endDate, input.totalDays);
      return { crossMonth, splits };
    }),

  /**
   * Get company profile — scoped to customerId
   */
  companyProfile: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const cid = ctx.portalUser.customerId;

    const [company] = await db
      .select({
        id: customers.id,
        companyName: customers.companyName,
        legalEntityName: customers.legalEntityName,
        registrationNumber: customers.registrationNumber,
        industry: customers.industry,
        address: customers.address,
        city: customers.city,
        state: customers.state,
        country: customers.country,
        postalCode: customers.postalCode,
        primaryContactName: customers.primaryContactName,
        primaryContactEmail: customers.primaryContactEmail,
        primaryContactPhone: customers.primaryContactPhone,
        settlementCurrency: customers.settlementCurrency,
        language: customers.language,
        // Exclude: internalNotes, pricing info, markup data, depositMultiplier
      })
      .from(customers)
      .where(eq(customers.id, cid));

    return company || null;
  }),

  /**
   * Update company profile — admin only
   * Legal entity name and settlement currency are NOT editable by client
   */
  updateCompanyProfile: portalAdminProcedure
    .input(
      z.object({
        companyName: z.string().min(1).optional(),
        registrationNumber: z.string().optional().nullable(),
        industry: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        country: z.string().optional(),
        postalCode: z.string().optional().nullable(),
        primaryContactName: z.string().optional().nullable(),
        primaryContactEmail: z.string().email().optional().nullable(),
        primaryContactPhone: z.string().optional().nullable(),
        language: z.enum(["en", "zh"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Build update object — only include fields that were provided
      const updateData: Record<string, any> = {};
      if (input.companyName !== undefined) updateData.companyName = input.companyName;
      if (input.registrationNumber !== undefined) updateData.registrationNumber = input.registrationNumber;
      if (input.industry !== undefined) updateData.industry = input.industry;
      if (input.address !== undefined) updateData.address = input.address;
      if (input.city !== undefined) updateData.city = input.city;
      if (input.state !== undefined) updateData.state = input.state;
      if (input.country !== undefined) updateData.country = input.country;
      if (input.postalCode !== undefined) updateData.postalCode = input.postalCode;
      if (input.primaryContactName !== undefined) updateData.primaryContactName = input.primaryContactName;
      if (input.primaryContactEmail !== undefined) updateData.primaryContactEmail = input.primaryContactEmail;
      if (input.primaryContactPhone !== undefined) updateData.primaryContactPhone = input.primaryContactPhone;
      if (input.language !== undefined) updateData.language = input.language;

      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      await db
        .update(customers)
        .set(updateData)
        .where(eq(customers.id, cid));

      return { success: true };
    }),

  /**
   * Get leave policies for this customer — per country
   */
  leavePolicies: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const cid = ctx.portalUser.customerId;

    const policies = await db
      .select({
        id: customerLeavePolicies.id,
        countryCode: customerLeavePolicies.countryCode,
        leaveTypeId: customerLeavePolicies.leaveTypeId,
        annualEntitlement: customerLeavePolicies.annualEntitlement,
        expiryRule: customerLeavePolicies.expiryRule,
        carryOverDays: customerLeavePolicies.carryOverDays,
        clientConfirmed: customerLeavePolicies.clientConfirmed,
        leaveTypeName: leaveTypes.leaveTypeName,
        countryName: countriesConfig.countryName,
        statutoryMinimum: leaveTypes.annualEntitlement,
      })
      .from(customerLeavePolicies)
      .leftJoin(leaveTypes, eq(customerLeavePolicies.leaveTypeId, leaveTypes.id))
      .leftJoin(countriesConfig, eq(customerLeavePolicies.countryCode, countriesConfig.countryCode))
      .where(eq(customerLeavePolicies.customerId, cid));

    return policies;
  }),

  /**
   * Update leave policy — admin only
   */
  updateLeavePolicy: portalAdminProcedure
    .input(
      z.object({
        id: z.number(),
        annualEntitlement: z.number().min(0),
        expiryRule: z.enum(["year_end", "anniversary", "no_expiry"]),
        carryOverDays: z.number().min(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Verify policy belongs to this customer
      const [policy] = await db
        .select({ id: customerLeavePolicies.id, leaveTypeId: customerLeavePolicies.leaveTypeId })
        .from(customerLeavePolicies)
        .where(and(eq(customerLeavePolicies.id, input.id), eq(customerLeavePolicies.customerId, cid)));

      if (!policy) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Leave policy not found" });
      }

      // Verify entitlement >= statutory minimum
      const [leaveType] = await db
        .select({ annualEntitlement: leaveTypes.annualEntitlement })
        .from(leaveTypes)
        .where(eq(leaveTypes.id, policy.leaveTypeId));

      if (leaveType && leaveType.annualEntitlement && input.annualEntitlement < leaveType.annualEntitlement) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Annual entitlement cannot be less than statutory minimum (${leaveType.annualEntitlement} days)`,
        });
      }

      await db
        .update(customerLeavePolicies)
        .set({
          annualEntitlement: input.annualEntitlement,
          expiryRule: input.expiryRule,
          carryOverDays: input.carryOverDays,
          clientConfirmed: true,
        })
        .where(eq(customerLeavePolicies.id, input.id));

      return { success: true };
    }),

  // ============================================================================
  // User Management (Portal Admin only)
  // ============================================================================

  /**
   * List portal users for this customer
   */
  listUsers: portalAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const cid = ctx.portalUser.customerId;

    const users = await db
      .select({
        id: customerContacts.id,
        contactName: customerContacts.contactName,
        email: customerContacts.email,
        phone: customerContacts.phone,
        role: customerContacts.role,
        portalRole: customerContacts.portalRole,
        hasPortalAccess: customerContacts.hasPortalAccess,
        isPortalActive: customerContacts.isPortalActive,
        lastLoginAt: customerContacts.lastLoginAt,
        isPrimary: customerContacts.isPrimary,
        // passwordHash is NOT included
      })
      .from(customerContacts)
      .where(eq(customerContacts.customerId, cid))
      .orderBy(customerContacts.contactName);

    return users;
  }),

  /**
   * Invite a new portal user
   */
  inviteUser: portalAdminProcedure
    .input(
      z.object({
        contactName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        role: z.string().optional(), // Business role
        portalRole: z.enum(["admin", "hr_manager", "finance", "viewer"]).default("viewer"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Check if email already exists
      const existing = await db
        .select({ id: customerContacts.id })
        .from(customerContacts)
        .where(eq(customerContacts.email, input.email.toLowerCase().trim()));

      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists" });
      }

      const inviteToken = generateInviteToken();
      const inviteExpiresAt = getInviteExpiryDate();

      await db.insert(customerContacts).values({
        customerId: cid, // ALWAYS from context
        contactName: input.contactName,
        email: input.email.toLowerCase().trim(),
        phone: input.phone || null,
        role: input.role || null,
        portalRole: input.portalRole,
        hasPortalAccess: true,
        isPortalActive: false, // Activated when they set password
        inviteToken,
        inviteExpiresAt,
      });

      // Send portal invite email
      try {
        const custRows = await db
          .select({ companyName: customers.companyName })
          .from(customers)
          .where(eq(customers.id, cid))
          .limit(1);
        const companyName = custRows[0]?.companyName || "Your Company";

        const portalOrigin = process.env.PORTAL_APP_URL || "https://app.extendglobal.ai";
        const inviteUrl = `${portalOrigin}/register?token=${inviteToken}`;

        await sendPortalInviteEmail({
          to: input.email.toLowerCase().trim(),
          contactName: input.contactName,
          companyName,
          portalRole: input.portalRole,
          inviteUrl,
        });
      } catch (err) {
        console.error("[PortalSettings] Failed to send invite email:", err);
      }

      return {
        success: true,
        inviteToken,
        inviteExpiresAt: inviteExpiresAt.toISOString(),
      };
    }),

  /**
   * Update a portal user's role
   */
  updateUserRole: portalAdminProcedure
    .input(
      z.object({
        contactId: z.number(),
        portalRole: z.enum(["admin", "hr_manager", "finance", "viewer"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Cannot change own role — check before DB to fail fast
      if (input.contactId === ctx.portalUser.contactId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Verify contact belongs to this customer
      const [contact] = await db
        .select({ id: customerContacts.id })
        .from(customerContacts)
        .where(and(eq(customerContacts.id, input.contactId), eq(customerContacts.customerId, cid)));

      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await db
        .update(customerContacts)
        .set({ portalRole: input.portalRole })
        .where(eq(customerContacts.id, input.contactId));

      return { success: true };
    }),

  /**
   * Deactivate a portal user
   */
  deactivateUser: portalAdminProcedure
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Cannot deactivate self — check before DB to fail fast
      if (input.contactId === ctx.portalUser.contactId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot deactivate your own account" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Verify contact belongs to this customer
      const [contact] = await db
        .select({ id: customerContacts.id })
        .from(customerContacts)
        .where(and(eq(customerContacts.id, input.contactId), eq(customerContacts.customerId, cid)));

      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await db
        .update(customerContacts)
        .set({ hasPortalAccess: false, isPortalActive: false })
        .where(eq(customerContacts.id, input.contactId));

      return { success: true };
    }),

  /**
   * Resend invite to a user who hasn't activated yet
   */
  resendInvite: portalAdminProcedure
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      const [contact] = await db
        .select({ id: customerContacts.id, isPortalActive: customerContacts.isPortalActive })
        .from(customerContacts)
        .where(and(eq(customerContacts.id, input.contactId), eq(customerContacts.customerId, cid)));

      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (contact.isPortalActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is already activated" });
      }

      const inviteToken = generateInviteToken();
      const inviteExpiresAt = getInviteExpiryDate();

      await db
        .update(customerContacts)
        .set({ inviteToken, inviteExpiresAt })
        .where(eq(customerContacts.id, input.contactId));

      // Resend portal invite email
      try {
        const contactDetails = await db
          .select({ contactName: customerContacts.contactName, email: customerContacts.email })
          .from(customerContacts)
          .where(eq(customerContacts.id, input.contactId))
          .limit(1);
        const contactName = contactDetails[0]?.contactName || "User";
        const contactEmail = contactDetails[0]?.email || "";

        const custRows = await db
          .select({ companyName: customers.companyName })
          .from(customers)
          .where(eq(customers.id, cid))
          .limit(1);
        const companyName = custRows[0]?.companyName || "Your Company";

        const portalOrigin = process.env.PORTAL_APP_URL || "https://app.extendglobal.ai";
        const inviteUrl = `${portalOrigin}/register?token=${inviteToken}`;

        await sendPortalInviteEmail({
          to: contactEmail,
          contactName,
          companyName,
          portalRole: "viewer",
          inviteUrl,
        });
      } catch (err) {
        console.error("[PortalSettings] Failed to resend invite email:", err);
      }

      return {
        success: true,
        inviteToken,
        inviteExpiresAt: inviteExpiresAt.toISOString(),
      };
    }),

  /**
   * Bug 12: Initialize leave policies from statutory defaults for a country
   */
  initializeFromStatutory: portalAdminProcedure
    .input(z.object({ countryCode: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Check if policies already exist for this country
      const existing = await db
        .select({ id: customerLeavePolicies.id })
        .from(customerLeavePolicies)
        .where(and(
          eq(customerLeavePolicies.customerId, cid),
          eq(customerLeavePolicies.countryCode, input.countryCode)
        ));

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Leave policies already exist for this country. Please edit them instead.",
        });
      }

      // Get statutory leave types for this country
      const statutoryTypes = await db
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.countryCode, input.countryCode));

      if (statutoryTypes.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No statutory leave types found for this country.",
        });
      }

      // Create customer leave policies from statutory defaults
      for (const lt of statutoryTypes) {
        await db.insert(customerLeavePolicies).values({
          customerId: cid,
          countryCode: input.countryCode,
          leaveTypeId: lt.id,
          annualEntitlement: lt.annualEntitlement || 0,
          expiryRule: "year_end",
          carryOverDays: 0,
        });
      }

      return { success: true, count: statutoryTypes.length };
    }),

  /**
   * Get countries where this customer has employees (for leave policy setup)
   */
  activeCountries: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const cid = ctx.portalUser.customerId;

    const countries = await db
      .select({
        country: employees.country,
        countryName: countriesConfig.countryName,
      })
      .from(employees)
      .leftJoin(countriesConfig, eq(employees.country, countriesConfig.countryCode))
      .where(eq(employees.customerId, cid))
      .groupBy(employees.country, countriesConfig.countryName);

    return countries;
  }),
});
