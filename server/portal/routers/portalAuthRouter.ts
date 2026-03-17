/**
 * Portal Auth Router
 *
 * Handles: login, register (via invite), change password, logout, me
 * Uses portal-specific JWT and cookies — completely independent from admin auth.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import {
  portalPublicProcedure,
  protectedPortalProcedure,
  portalRouter,
} from "../portalTrpc";
import {
  hashPassword,
  verifyPassword,
  signPortalToken,
  setPortalCookie,
  clearPortalCookie,
  verifyPortalToken,
  getPortalTokenFromRequest,
  generateResetToken,
  getResetExpiryDate,
  type PortalJwtPayload,
} from "../portalAuth";
import { getDb } from "../../db";
import { customerContacts, customers } from "../../../drizzle/schema";
import { sendPortalPasswordResetEmail } from "../../services/authEmailService";

const loginAttemptTracker = new Map<string, { count: number; firstAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 20;

function cleanupLoginAttemptTracker(now: number) {
  loginAttemptTracker.forEach((value, key) => {
    if (now - value.firstAt > LOGIN_WINDOW_MS) {
      loginAttemptTracker.delete(key);
    }
  });
}

function assertPortalLoginRateLimit(identifier: string) {
  const now = Date.now();
  cleanupLoginAttemptTracker(now);
  const record = loginAttemptTracker.get(identifier);
  if (!record || now - record.firstAt > LOGIN_WINDOW_MS) {
    loginAttemptTracker.set(identifier, { count: 1, firstAt: now });
    return;
  }

  if (record.count >= LOGIN_ATTEMPT_LIMIT) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many login attempts. Please try again later." });
  }

  record.count += 1;
  loginAttemptTracker.set(identifier, record);
}

export const portalAuthRouter = portalRouter({
  /**
   * Login with email + password
   */
  login: portalPublicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertPortalLoginRateLimit(input.email.toLowerCase().trim());
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Find contact by email
      const contacts = await db
        .select()
        .from(customerContacts)
        .where(eq(customerContacts.email, input.email.toLowerCase().trim()))
        .limit(1);

      if (contacts.length === 0) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      const contact = contacts[0];

      // Check portal access
      if (!contact.hasPortalAccess || !contact.isPortalActive) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Portal access not enabled" });
      }

      // Verify password
      if (!contact.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Account not activated. Please use your invite link." });
      }

      const passwordValid = await verifyPassword(input.password, contact.passwordHash);
      if (!passwordValid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      // Get company name
      const customerRows = await db
        .select({ companyName: customers.companyName, status: customers.status })
        .from(customers)
        .where(eq(customers.id, contact.customerId))
        .limit(1);

      if (customerRows.length === 0 || customerRows[0].status !== "active") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Company account is not active" });
      }

      // Sign JWT and set cookie
      const payload: PortalJwtPayload = {
        sub: String(contact.id),
        customerId: contact.customerId,
        email: contact.email,
        portalRole: contact.portalRole || "viewer",
        iss: "gea-portal",
      };

      const token = await signPortalToken(payload);
      setPortalCookie(ctx.res, token);

      // Update last login
      await db
        .update(customerContacts)
        .set({ lastLoginAt: new Date() })
        .where(eq(customerContacts.id, contact.id));

      return {
        success: true,
        user: {
          contactId: contact.id,
          customerId: contact.customerId,
          email: contact.email,
          contactName: contact.contactName,
          portalRole: contact.portalRole || "viewer",
          companyName: customerRows[0].companyName,
        },
      };
    }),

  /**
   * Verify invite token (check if valid before showing register form)
   */
  verifyInvite: portalPublicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const contacts = await db
        .select({
          id: customerContacts.id,
          email: customerContacts.email,
          contactName: customerContacts.contactName,
          inviteExpiresAt: customerContacts.inviteExpiresAt,
          isPortalActive: customerContacts.isPortalActive,
          customerId: customerContacts.customerId,
        })
        .from(customerContacts)
        .where(eq(customerContacts.inviteToken, input.token))
        .limit(1);

      if (contacts.length === 0) {
        return { valid: false, reason: "Invalid invite link" as const };
      }

      const contact = contacts[0];

      if (contact.isPortalActive) {
        return { valid: false, reason: "Account already activated" as const };
      }

      if (contact.inviteExpiresAt && contact.inviteExpiresAt < new Date()) {
        return { valid: false, reason: "Invite link has expired" as const };
      }

      // Get company name
      const customerRows = await db
        .select({ companyName: customers.companyName })
        .from(customers)
        .where(eq(customers.id, contact.customerId))
        .limit(1);

      return {
        valid: true,
        email: contact.email,
        contactName: contact.contactName,
        companyName: customerRows[0]?.companyName || "",
      };
    }),

  /**
   * Register (accept invite and set password)
   */
  register: portalPublicProcedure
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

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Find contact by invite token
      const contacts = await db
        .select()
        .from(customerContacts)
        .where(eq(customerContacts.inviteToken, input.token))
        .limit(1);

      if (contacts.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid invite link" });
      }

      const contact = contacts[0];

      if (contact.isPortalActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Account already activated" });
      }

      if (contact.inviteExpiresAt && contact.inviteExpiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite link has expired" });
      }

      // Hash password and activate account
      const passwordHash = await hashPassword(input.password);

      await db
        .update(customerContacts)
        .set({
          passwordHash,
          isPortalActive: true,
          hasPortalAccess: true,
          inviteToken: null, // Clear invite token after use
          inviteExpiresAt: null,
          lastLoginAt: new Date(),
        })
        .where(eq(customerContacts.id, contact.id));

      // Get company name
      const customerRows = await db
        .select({ companyName: customers.companyName })
        .from(customers)
        .where(eq(customers.id, contact.customerId))
        .limit(1);

      // Auto-login after registration
      const payload: PortalJwtPayload = {
        sub: String(contact.id),
        customerId: contact.customerId,
        email: contact.email,
        portalRole: contact.portalRole || "viewer",
        iss: "gea-portal",
      };

      const token = await signPortalToken(payload);
      setPortalCookie(ctx.res, token);

      return {
        success: true,
        user: {
          contactId: contact.id,
          customerId: contact.customerId,
          email: contact.email,
          contactName: contact.contactName,
          portalRole: contact.portalRole || "viewer",
          companyName: customerRows[0]?.companyName || "",
        },
      };
    }),

  /**
   * Get current portal user
   */
  me: portalPublicProcedure.query(async ({ ctx }) => {
    return ctx.portalUser;
  }),

  /**
   * Logout
   */
  logout: protectedPortalProcedure.mutation(async ({ ctx }) => {
    clearPortalCookie(ctx.res);
    return { success: true };
  }),

  /**
   * Forgot password — generates a reset token
   * Returns the reset link (in production, this would be emailed)
   */
  forgotPassword: portalPublicProcedure
    .input(
      z.object({
        email: z.string().email(),
        origin: z.string().url(), // Frontend origin for building reset URL
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Find contact by email
      const contacts = await db
        .select({
          id: customerContacts.id,
          email: customerContacts.email,
          isPortalActive: customerContacts.isPortalActive,
          hasPortalAccess: customerContacts.hasPortalAccess,
        })
        .from(customerContacts)
        .where(eq(customerContacts.email, input.email.toLowerCase().trim()))
        .limit(1);

      // Always return success to prevent email enumeration
      if (contacts.length === 0 || !contacts[0].isPortalActive || !contacts[0].hasPortalAccess) {
        return {
          success: true,
          message: "If an account exists with this email, a reset link has been generated.",
        };
      }

      const contact = contacts[0];
      const resetToken = generateResetToken();
      const resetExpiresAt = getResetExpiryDate();

      // Store reset token
      await db
        .update(customerContacts)
        .set({ resetToken, resetExpiresAt })
        .where(eq(customerContacts.id, contact.id));

      // Build reset URL — detect if origin is on extendglobal.ai subdomain
      const origin = input.origin;
      const isPortalDomain = origin.includes('app.extendglobal.ai');
      const resetUrl = isPortalDomain
        ? `${origin}/reset-password?token=${resetToken}`
        : `${origin}/portal/reset-password?token=${resetToken}`;

      // Send password reset email
      try {
        // Get contact name for the email
        const contactDetails = await db
          .select({ contactName: customerContacts.contactName })
          .from(customerContacts)
          .where(eq(customerContacts.id, contact.id))
          .limit(1);
        const contactName = contactDetails[0]?.contactName || "User";

        await sendPortalPasswordResetEmail({
          to: contact.email,
          contactName,
          resetUrl,
        });
      } catch (err) {
        console.error("[PortalAuth] Failed to send password reset email:", err);
      }

      return {
        success: true,
        message: "If an account exists with this email, a password reset link has been sent.",
      };
    }),

  /**
   * Verify reset token (check if valid before showing reset form)
   */
  verifyResetToken: portalPublicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const contacts = await db
        .select({
          id: customerContacts.id,
          email: customerContacts.email,
          contactName: customerContacts.contactName,
          resetExpiresAt: customerContacts.resetExpiresAt,
        })
        .from(customerContacts)
        .where(eq(customerContacts.resetToken, input.token))
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
  resetPassword: portalPublicProcedure
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

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Find contact by reset token
      const contacts = await db
        .select()
        .from(customerContacts)
        .where(eq(customerContacts.resetToken, input.token))
        .limit(1);

      if (contacts.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid reset link" });
      }

      const contact = contacts[0];

      if (contact.resetExpiresAt && contact.resetExpiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reset link has expired" });
      }

      // Hash new password and clear reset token
      const passwordHash = await hashPassword(input.password);

      await db
        .update(customerContacts)
        .set({
          passwordHash,
          resetToken: null,
          resetExpiresAt: null,
        })
        .where(eq(customerContacts.id, contact.id));

      // Get company name for auto-login
      const customerRows = await db
        .select({ companyName: customers.companyName })
        .from(customers)
        .where(eq(customers.id, contact.customerId))
        .limit(1);

      // Auto-login after password reset
      const payload: PortalJwtPayload = {
        sub: String(contact.id),
        customerId: contact.customerId,
        email: contact.email,
        portalRole: contact.portalRole || "viewer",
        iss: "gea-portal",
      };

      const token = await signPortalToken(payload);
      setPortalCookie(ctx.res, token);

      return {
        success: true,
        user: {
          contactId: contact.id,
          customerId: contact.customerId,
          email: contact.email,
          contactName: contact.contactName,
          portalRole: contact.portalRole || "viewer",
          companyName: customerRows[0]?.companyName || "",
        },
      };
    }),

  /**
   * Change password
   */
  changePassword: protectedPortalProcedure
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

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Get current password hash
      const contacts = await db
        .select({ passwordHash: customerContacts.passwordHash })
        .from(customerContacts)
        .where(eq(customerContacts.id, ctx.portalUser.contactId))
        .limit(1);

      if (contacts.length === 0 || !contacts[0].passwordHash) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account error" });
      }

      const valid = await verifyPassword(input.currentPassword, contacts[0].passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect" });
      }

      const newHash = await hashPassword(input.newPassword);
      await db
        .update(customerContacts)
        .set({ passwordHash: newHash })
        .where(eq(customerContacts.id, ctx.portalUser.contactId));

      return { success: true };
    }),
});
