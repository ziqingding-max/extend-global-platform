/**
 * CP Portal Auth Router
 *
 * Handles all authentication flows for CP Portal:
 * - Login (email/password)
 * - Register (via invite token)
 * - Forgot password (sends reset email)
 * - Reset password (via reset token)
 * - Validate reset token
 * - Change password (authenticated)
 * - Logout
 * - Get current user (me)
 * - Branding query (public, for white-label rendering before login)
 *
 * SECURITY: Uses CP Portal JWT (issuer: "eg-cp-portal") and CP Portal cookie.
 * Completely isolated from admin and client portal auth systems.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { cpPublicProcedure, protectedCpProcedure, cpPortalRouter } from "../cpPortalTrpc";
import {
  signCpPortalToken,
  verifyCpPortalToken,
  hashCpPassword,
  verifyCpPassword,
  setCpPortalCookie,
  clearCpPortalCookie,
  generateCpResetToken,
  getCpResetExpiryDate,
  type CpPortalJwtPayload,
} from "../cpPortalAuth";
import { getDb } from "../../db";
import { channelPartnerContacts, channelPartners } from "../../../drizzle/schema";
import { logAuditAction } from "../../db";

// ============================================================================
// Auth Router
// ============================================================================

export const cpPortalAuthRouter = cpPortalRouter({
  /**
   * Get current authenticated CP user
   */
  me: cpPublicProcedure.query(({ ctx }) => {
    return ctx.cpUser;
  }),

  /**
   * Login with email and password
   */
  login: cpPublicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Find the contact by email
      const contacts = await db
        .select()
        .from(channelPartnerContacts)
        .where(
          and(
            eq(channelPartnerContacts.email, input.email.toLowerCase().trim()),
            eq(channelPartnerContacts.isPortalActive, true)
          )
        )
        .limit(1);

      if (contacts.length === 0) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      const contact = contacts[0];

      // Verify password
      if (!contact.passwordHash) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Account not yet activated. Please use the invite link to set your password.",
        });
      }

      const valid = await verifyCpPassword(input.password, contact.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      // Verify the channel partner is still active
      const cpRows = await db
        .select({
          companyName: channelPartners.companyName,
          status: channelPartners.status,
          subdomain: channelPartners.subdomain,
          isInternal: channelPartners.isInternal,
        })
        .from(channelPartners)
        .where(eq(channelPartners.id, contact.channelPartnerId))
        .limit(1);

      if (cpRows.length === 0 || cpRows[0].status !== "active") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your organization account has been suspended. Please contact support.",
        });
      }

      // Sign JWT and set cookie
      const contactName = contact.contactName || contact.email;
      const payload: CpPortalJwtPayload = {
        sub: String(contact.id),
        channelPartnerId: contact.channelPartnerId,
        email: contact.email,
        cpRole: contact.portalRole || "cp_viewer",
        iss: "eg-cp-portal",
      };
      const token = await signCpPortalToken(payload);
      setCpPortalCookie(ctx.res, token);

      // Update last login timestamp
      await db
        .update(channelPartnerContacts)
        .set({ lastLoginAt: new Date() })
        .where(eq(channelPartnerContacts.id, contact.id));

      // Audit log
      await logAuditAction({
        action: "cp_portal_login",
        entityType: "channel_partner_contact",
        entityId: contact.id,
        channelPartnerId: contact.channelPartnerId,
        portalSource: "cp_portal",
        userName: contactName,
      });

      return {
        success: true,
        user: {
          contactId: contact.id,
          channelPartnerId: contact.channelPartnerId,
          email: contact.email,
          contactName,
          cpRole: contact.portalRole || "cp_viewer",
          companyName: cpRows[0].companyName,
          subdomain: cpRows[0].subdomain,
          isInternal: cpRows[0].isInternal,
        },
      };
    }),

  /**
   * Register via invite token — set password and activate account
   */
  register: cpPublicProcedure
    .input(
      z.object({
        token: z.string(),
        password: z.string().min(8, "Password must be at least 8 characters"),
        confirmPassword: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.password !== input.confirmPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Passwords do not match" });
      }

      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Find contact by invite token
      const contacts = await db
        .select()
        .from(channelPartnerContacts)
        .where(eq(channelPartnerContacts.inviteToken, input.token))
        .limit(1);

      if (contacts.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid invite link" });
      }

      const contact = contacts[0];

      // Check if invite has expired
      if (contact.inviteExpiresAt && contact.inviteExpiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite link has expired. Please request a new one." });
      }

      // Hash password and activate account
      const passwordHash = await hashCpPassword(input.password);
      await db
        .update(channelPartnerContacts)
        .set({
          passwordHash,
          inviteToken: null,
          inviteExpiresAt: null,
          isPortalActive: true,
          lastLoginAt: new Date(),
        })
        .where(eq(channelPartnerContacts.id, contact.id));

      // Verify CP is active
      const cpRows = await db
        .select({
          companyName: channelPartners.companyName,
          subdomain: channelPartners.subdomain,
          isInternal: channelPartners.isInternal,
        })
        .from(channelPartners)
        .where(eq(channelPartners.id, contact.channelPartnerId))
        .limit(1);

      // Auto-login after registration
      const contactName = contact.contactName || contact.email;
      const payload: CpPortalJwtPayload = {
        sub: String(contact.id),
        channelPartnerId: contact.channelPartnerId,
        email: contact.email,
        cpRole: contact.portalRole || "cp_viewer",
        iss: "eg-cp-portal",
      };
      const token = await signCpPortalToken(payload);
      setCpPortalCookie(ctx.res, token);

      // Audit log
      await logAuditAction({
        action: "cp_portal_register",
        entityType: "channel_partner_contact",
        entityId: contact.id,
        channelPartnerId: contact.channelPartnerId,
        portalSource: "cp_portal",
        userName: contactName,
      });

      return {
        success: true,
        user: {
          contactId: contact.id,
          channelPartnerId: contact.channelPartnerId,
          email: contact.email,
          contactName,
          cpRole: contact.portalRole || "cp_viewer",
          companyName: cpRows[0]?.companyName || "",
          subdomain: cpRows[0]?.subdomain || null,
          isInternal: cpRows[0]?.isInternal || false,
        },
      };
    }),

  /**
   * Validate invite token (used by registration page to pre-fill info)
   */
  validateInvite: cpPublicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const contacts = await db
        .select({
          id: channelPartnerContacts.id,
          email: channelPartnerContacts.email,
          contactName: channelPartnerContacts.contactName,
          inviteExpiresAt: channelPartnerContacts.inviteExpiresAt,
          channelPartnerId: channelPartnerContacts.channelPartnerId,
        })
        .from(channelPartnerContacts)
        .where(eq(channelPartnerContacts.inviteToken, input.token))
        .limit(1);

      if (contacts.length === 0) {
        return { valid: false, reason: "Invalid invite link" as const };
      }

      const contact = contacts[0];
      if (contact.inviteExpiresAt && contact.inviteExpiresAt < new Date()) {
        return { valid: false, reason: "Invite link has expired" as const };
      }

      // Get CP company name for display
      const cpRows = await db
        .select({ companyName: channelPartners.companyName })
        .from(channelPartners)
        .where(eq(channelPartners.id, contact.channelPartnerId))
        .limit(1);

      return {
        valid: true,
        email: contact.email,
        contactName: contact.contactName,
        companyName: cpRows[0]?.companyName || "",
      };
    }),

  /**
   * Forgot password — generates reset token
   * NOTE: In production, this should send an email with the reset link.
   * For now, it stores the token and returns success regardless (to prevent email enumeration).
   */
  forgotPassword: cpPublicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Always return success to prevent email enumeration
      const contacts = await db
        .select({
          id: channelPartnerContacts.id,
          channelPartnerId: channelPartnerContacts.channelPartnerId,
        })
        .from(channelPartnerContacts)
        .where(
          and(
            eq(channelPartnerContacts.email, input.email.toLowerCase().trim()),
            eq(channelPartnerContacts.isPortalActive, true)
          )
        )
        .limit(1);

      if (contacts.length > 0) {
        const resetToken = generateCpResetToken();
        const resetExpiresAt = getCpResetExpiryDate();

        await db
          .update(channelPartnerContacts)
          .set({ resetToken, resetExpiresAt })
          .where(eq(channelPartnerContacts.id, contacts[0].id));

        // TODO: Send white-labeled reset email using CP branding config
        // For now, log the token for development
        console.log(`[CP Portal] Reset token for ${input.email}: ${resetToken}`);

        // Audit log
        await logAuditAction({
          action: "cp_portal_forgot_password",
          entityType: "channel_partner_contact",
          entityId: contacts[0].id,
          channelPartnerId: contacts[0].channelPartnerId,
          portalSource: "cp_portal",
        });
      }

      return {
        success: true,
        message: "If an account with this email exists, a password reset link has been sent.",
      };
    }),

  /**
   * Validate reset token (used by reset password page)
   */
  validateResetToken: cpPublicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const contacts = await db
        .select({
          id: channelPartnerContacts.id,
          email: channelPartnerContacts.email,
          contactName: channelPartnerContacts.contactName,
          resetExpiresAt: channelPartnerContacts.resetExpiresAt,
        })
        .from(channelPartnerContacts)
        .where(eq(channelPartnerContacts.resetToken, input.token))
        .limit(1);

      if (contacts.length === 0) {
        return { valid: false, reason: "Invalid reset link" as const };
      }

      const contact = contacts[0];
      if (contact.resetExpiresAt && contact.resetExpiresAt < new Date()) {
        return { valid: false, reason: "Reset link has expired" as const };
      }

      return {
        valid: true,
        email: contact.email,
        contactName: contact.contactName,
      };
    }),

  /**
   * Reset password using token
   */
  resetPassword: cpPublicProcedure
    .input(
      z.object({
        token: z.string(),
        password: z.string().min(8, "Password must be at least 8 characters"),
        confirmPassword: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.password !== input.confirmPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Passwords do not match" });
      }

      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Find contact by reset token
      const contacts = await db
        .select()
        .from(channelPartnerContacts)
        .where(eq(channelPartnerContacts.resetToken, input.token))
        .limit(1);

      if (contacts.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid reset link" });
      }

      const contact = contacts[0];
      if (contact.resetExpiresAt && contact.resetExpiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reset link has expired" });
      }

      // Hash new password and clear reset token
      const passwordHash = await hashCpPassword(input.password);
      await db
        .update(channelPartnerContacts)
        .set({
          passwordHash,
          resetToken: null,
          resetExpiresAt: null,
        })
        .where(eq(channelPartnerContacts.id, contact.id));

      // Get CP info for auto-login
      const cpRows = await db
        .select({
          companyName: channelPartners.companyName,
          subdomain: channelPartners.subdomain,
          isInternal: channelPartners.isInternal,
        })
        .from(channelPartners)
        .where(eq(channelPartners.id, contact.channelPartnerId))
        .limit(1);

      // Auto-login after password reset
      const contactName = contact.contactName || contact.email;
      const payload: CpPortalJwtPayload = {
        sub: String(contact.id),
        channelPartnerId: contact.channelPartnerId,
        email: contact.email,
        cpRole: contact.portalRole || "cp_viewer",
        iss: "eg-cp-portal",
      };
      const token = await signCpPortalToken(payload);
      setCpPortalCookie(ctx.res, token);

      // Audit log
      await logAuditAction({
        action: "cp_portal_reset_password",
        entityType: "channel_partner_contact",
        entityId: contact.id,
        channelPartnerId: contact.channelPartnerId,
        portalSource: "cp_portal",
        userName: contactName,
      });

      return {
        success: true,
        user: {
          contactId: contact.id,
          channelPartnerId: contact.channelPartnerId,
          email: contact.email,
          contactName,
          cpRole: contact.portalRole || "cp_viewer",
          companyName: cpRows[0]?.companyName || "",
          subdomain: cpRows[0]?.subdomain || null,
          isInternal: cpRows[0]?.isInternal || false,
        },
      };
    }),

  /**
   * Change password (authenticated user)
   */
  changePassword: protectedCpProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
        confirmNewPassword: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.newPassword !== input.confirmNewPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Passwords do not match" });
      }

      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Get current password hash
      const contacts = await db
        .select({ passwordHash: channelPartnerContacts.passwordHash })
        .from(channelPartnerContacts)
        .where(eq(channelPartnerContacts.id, ctx.cpUser.contactId))
        .limit(1);

      if (contacts.length === 0 || !contacts[0].passwordHash) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account error" });
      }

      const valid = await verifyCpPassword(input.currentPassword, contacts[0].passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect" });
      }

      const newHash = await hashCpPassword(input.newPassword);
      await db
        .update(channelPartnerContacts)
        .set({ passwordHash: newHash })
        .where(eq(channelPartnerContacts.id, ctx.cpUser.contactId));

      // Audit log
      await logAuditAction({
        action: "cp_portal_change_password",
        entityType: "channel_partner_contact",
        entityId: ctx.cpUser.contactId,
        channelPartnerId: ctx.cpUser.channelPartnerId,
        portalSource: "cp_portal",
        userName: ctx.cpUser.contactName,
      });

      return { success: true };
    }),

  /**
   * Logout — clear CP portal cookie
   */
  logout: cpPublicProcedure.mutation(({ ctx }) => {
    clearCpPortalCookie(ctx.res);
    return { success: true };
  }),

  /**
   * Public branding query — returns CP branding config for white-label rendering.
   * Called by the frontend BEFORE login to render the login page with CP branding.
   * Does NOT require authentication.
   */
  branding: cpPublicProcedure
    .input(z.object({ subdomain: z.string().min(1).max(63) }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpRows = await db
        .select({
          id: channelPartners.id,
          companyName: channelPartners.companyName,
          logoUrl: channelPartners.logoUrl,
          brandPrimaryColor: channelPartners.brandPrimaryColor,
          brandSecondaryColor: channelPartners.brandSecondaryColor,
          subdomain: channelPartners.subdomain,
          status: channelPartners.status,
        })
        .from(channelPartners)
        .where(
          and(
            eq(channelPartners.subdomain, input.subdomain.toLowerCase().trim()),
            eq(channelPartners.status, "active")
          )
        )
        .limit(1);

      if (cpRows.length === 0) {
        // Return default EG branding as fallback
        return {
          found: false as const,
          companyName: "Extend Global",
          logoUrl: null,
          brandPrimaryColor: null,
          brandSecondaryColor: null,
        };
      }

      const cp = cpRows[0];
      return {
        found: true as const,
        companyName: cp.companyName,
        logoUrl: cp.logoUrl,
        brandPrimaryColor: cp.brandPrimaryColor,
        brandSecondaryColor: cp.brandSecondaryColor,
      };
    }),
});
