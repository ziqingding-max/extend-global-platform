/**
 * CP Portal Settings Router
 *
 * Manages CP organization settings from the CP admin's perspective.
 * All queries are SCOPED to ctx.cpUser.channelPartnerId.
 *
 * Capabilities:
 * - View/update branding (logo, colors, favicon)
 * - View/update billing info (for CP→Client invoices)
 * - Manage CP portal users (invite, list, update role, deactivate)
 * - View organization profile
 *
 * Only cp_admin role can modify settings.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import {
  protectedCpProcedure,
  cpAdminProcedure,
  cpPortalRouter,
} from "../cpPortalTrpc";
import { getDb } from "../../db";
import {
  channelPartners,
  channelPartnerContacts,
} from "../../../drizzle/schema";
import {
  getChannelPartnerById,
  updateChannelPartner,
  listChannelPartnerContacts,
  createChannelPartnerContact,
  updateChannelPartnerContact,
  logAuditAction,
} from "../../db";
import {
  generateCpInviteToken,
  getCpInviteExpiryDate,
} from "../cpPortalAuth";

export const cpPortalSettingsRouter = cpPortalRouter({
  // =========================================================================
  // Organization Profile (read-only for non-admins)
  // =========================================================================

  /**
   * Get CP organization profile
   */
  getProfile: protectedCpProcedure.query(async ({ ctx }) => {
    const cp = await getChannelPartnerById(ctx.cpUser.channelPartnerId);
    if (!cp) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });

    // Return only fields visible to CP portal users
    return {
      id: cp.id,
      partnerCode: cp.partnerCode,
      companyName: cp.companyName,
      legalEntityName: cp.legalEntityName,
      registrationNumber: cp.registrationNumber,
      country: cp.country,
      address: cp.address,
      city: cp.city,
      state: cp.state,
      postalCode: cp.postalCode,
      primaryContactName: cp.primaryContactName,
      primaryContactEmail: cp.primaryContactEmail,
      primaryContactPhone: cp.primaryContactPhone,
      settlementCurrency: cp.settlementCurrency,
      paymentTermDays: cp.paymentTermDays,
      subdomain: cp.subdomain,
      status: cp.status,
      createdAt: cp.createdAt,
    };
  }),

  /**
   * Update CP organization profile (admin only)
   */
  updateProfile: cpAdminProcedure
    .input(
      z.object({
        companyName: z.string().min(1).optional(),
        primaryContactEmail: z.string().email().optional(),
        primaryContactPhone: z.string().optional(),
        primaryContactName: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;
      await updateChannelPartner(cpId, input);
      await logAuditAction({
        userId: ctx.cpUser.contactId,
        action: "cp_profile_updated",
        entityType: "channel_partner",
        entityId: cpId,
        changes: JSON.stringify(input),
        channelPartnerId: cpId,
        portalSource: "cp_portal",
      });
      return { success: true };
    }),

  // =========================================================================
  // Branding Management (cp_admin only)
  // =========================================================================

  /**
   * Get current branding configuration
   */
  getBranding: protectedCpProcedure.query(async ({ ctx }) => {
    const cp = await getChannelPartnerById(ctx.cpUser.channelPartnerId);
    if (!cp) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });

    return {
      logoUrl: cp.logoUrl,
      brandPrimaryColor: cp.brandPrimaryColor,
      brandSecondaryColor: cp.brandSecondaryColor,
      brandAccentColor: cp.brandAccentColor,
      faviconUrl: cp.faviconUrl,
      companyName: cp.companyName,
      subdomain: cp.subdomain,
    };
  }),

  /**
   * Update branding configuration
   */
  updateBranding: cpAdminProcedure
    .input(
      z.object({
        logoUrl: z.string().url().optional(),
        logoFileKey: z.string().optional(),
        brandPrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        brandSecondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
        brandAccentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
        faviconUrl: z.string().url().optional(),
        faviconFileKey: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;

      await updateChannelPartner(cpId, input);

      await logAuditAction({
        action: "cp_branding_update",
        entityType: "channel_partner",
        entityId: cpId,
        channelPartnerId: cpId,
        portalSource: "cp_portal",
        userName: ctx.cpUser.contactName,
        changes: JSON.stringify(input),
      });

      return { success: true };
    }),

  // =========================================================================
  // Billing Info Management (cp_admin only)
  // =========================================================================

  /**
   * Get CP billing info (shown on CP→Client invoices)
   */
  getBillingInfo: protectedCpProcedure.query(async ({ ctx }) => {
    const cp = await getChannelPartnerById(ctx.cpUser.channelPartnerId);
    if (!cp) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });

    return {
      cpBillingEntityName: cp.cpBillingEntityName,
      cpBillingAddress: cp.cpBillingAddress,
      cpBillingTaxId: cp.cpBillingTaxId,
      cpBankDetails: cp.cpBankDetails,
      cpInvoicePrefix: cp.cpInvoicePrefix,
    };
  }),

  /**
   * Update CP billing info
   */
  updateBillingInfo: cpAdminProcedure
    .input(
      z.object({
        cpBillingEntityName: z.string().optional(),
        cpBillingAddress: z.string().optional(),
        cpBillingTaxId: z.string().optional(),
        cpBankDetails: z.string().optional(),
        cpInvoicePrefix: z.string().max(20).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;

      await updateChannelPartner(cpId, input);

      await logAuditAction({
        action: "cp_billing_info_update",
        entityType: "channel_partner",
        entityId: cpId,
        channelPartnerId: cpId,
        portalSource: "cp_portal",
        userName: ctx.cpUser.contactName,
        changes: JSON.stringify(input),
      });

      return { success: true };
    }),

  // =========================================================================
  // CP Portal User Management (cp_admin only)
  // =========================================================================

  /**
   * List all portal users for this CP
   */
  listUsers: cpAdminProcedure.query(async ({ ctx }) => {
    const contacts = await listChannelPartnerContacts(ctx.cpUser.channelPartnerId);
    return contacts.map((c: any) => ({
      id: c.id,
      contactName: c.contactName,
      email: c.email,
      phone: c.phone,
      role: c.role,
      portalRole: c.portalRole,
      isPrimary: c.isPrimary,
      hasPortalAccess: c.hasPortalAccess,
      isPortalActive: c.isPortalActive,
      lastLoginAt: c.lastLoginAt,
      createdAt: c.createdAt,
    }));
  }),

  /**
   * Invite a new portal user
   */
  inviteUser: cpAdminProcedure
    .input(
      z.object({
        contactName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        role: z.string().optional(), // Business role
        portalRole: z.enum(["admin", "finance", "operations", "viewer"]).default("viewer"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Check if email already exists
      const existing = await db
        .select({ id: channelPartnerContacts.id })
        .from(channelPartnerContacts)
        .where(eq(channelPartnerContacts.email, input.email.toLowerCase().trim()))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists" });
      }

      const inviteToken = generateCpInviteToken();
      const inviteExpiresAt = getCpInviteExpiryDate();

      const resultRows = await createChannelPartnerContact({
        channelPartnerId: cpId,
        contactName: input.contactName,
        email: input.email.toLowerCase().trim(),
        phone: input.phone,
        role: input.role,
        portalRole: input.portalRole,
        hasPortalAccess: true,
        isPortalActive: false, // Activated when they set password
        inviteToken,
        inviteExpiresAt,
      });

      const newContact = Array.isArray(resultRows) ? resultRows[0] : resultRows;

      // TODO: Send white-labeled invite email using CP branding config
      console.log(`[CP Portal] Invite token for ${input.email}: ${inviteToken}`);

      await logAuditAction({
        action: "cp_portal_user_invite",
        entityType: "channel_partner_contact",
        entityId: newContact?.id ?? 0,
        channelPartnerId: cpId,
        portalSource: "cp_portal",
        userName: ctx.cpUser.contactName,
        changes: JSON.stringify({ email: input.email, portalRole: input.portalRole }),
      });

      return { success: true, contactId: newContact?.id ?? 0 };
    }),

  /**
   * Update a portal user's role or status
   */
  updateUser: cpAdminProcedure
    .input(
      z.object({
        contactId: z.number(),
        portalRole: z.enum(["admin", "finance", "operations", "viewer"]).optional(),
        isPortalActive: z.boolean().optional(),
        role: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify the contact belongs to this CP
      const contactCheck = await db
        .select({ id: channelPartnerContacts.id })
        .from(channelPartnerContacts)
        .where(
          and(
            eq(channelPartnerContacts.id, input.contactId),
            eq(channelPartnerContacts.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (contactCheck.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Prevent self-demotion from admin
      if (input.contactId === ctx.cpUser.contactId && input.portalRole && input.portalRole !== "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own admin role" });
      }

      const updateData: Record<string, any> = {};
      if (input.portalRole !== undefined) updateData.portalRole = input.portalRole;
      if (input.isPortalActive !== undefined) updateData.isPortalActive = input.isPortalActive;
      if (input.role !== undefined) updateData.role = input.role;

      await updateChannelPartnerContact(input.contactId, updateData);

      await logAuditAction({
        action: "cp_portal_user_update",
        entityType: "channel_partner_contact",
        entityId: input.contactId,
        channelPartnerId: cpId,
        portalSource: "cp_portal",
        userName: ctx.cpUser.contactName,
        changes: JSON.stringify(updateData),
      });

      return { success: true };
    }),

  /**
   * Resend invite to a user who hasn't activated yet
   */
  resendInvite: cpAdminProcedure
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const cpId = ctx.cpUser.channelPartnerId;
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify the contact belongs to this CP and hasn't activated yet
      const contacts = await db
        .select()
        .from(channelPartnerContacts)
        .where(
          and(
            eq(channelPartnerContacts.id, input.contactId),
            eq(channelPartnerContacts.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (contacts.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const contact = contacts[0];
      if (contact.isPortalActive && contact.passwordHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User has already activated their account" });
      }

      const inviteToken = generateCpInviteToken();
      const inviteExpiresAt = getCpInviteExpiryDate();

      await updateChannelPartnerContact(input.contactId, {
        inviteToken,
        inviteExpiresAt,
      });

      // TODO: Send white-labeled invite email
      console.log(`[CP Portal] Resend invite token for ${contact.email}: ${inviteToken}`);

      await logAuditAction({
        action: "cp_portal_user_resend_invite",
        entityType: "channel_partner_contact",
        entityId: input.contactId,
        channelPartnerId: cpId,
        portalSource: "cp_portal",
        userName: ctx.cpUser.contactName,
      });

      return { success: true };
    }),
});
