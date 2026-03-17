import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { adminProcedure, userProcedure } from "../procedures";
import { listUsers, getUserById, getUserByEmail, getUserByInviteToken, getUserByResetToken, updateUser, logAuditAction, getDb } from "../db";
import { ALL_ROLES, validateRoles, serializeRoles, type RoleValue } from "../../shared/roles";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { sendAdminInviteEmail, sendAdminPasswordResetEmail } from "../services/authEmailService";
import {
  hashPassword,
  verifyPassword,
  generateInviteToken,
  getInviteExpiryDate,
  generateResetToken,
  getResetExpiryDate,
  signAdminToken,
  setAdminCookie,
  type AdminJwtPayload,
} from "../_core/adminAuth";

export const userManagementRouter = router({
  list: adminProcedure
    .input(
      z.object({
        limit: z.number().default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const page = Math.floor(input.offset / input.limit) + 1;
      return await listUsers({
        page,
        pageSize: input.limit,
      });
    }),

  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getUserById(input.id);
    }),

  /**
   * Update user roles.
   */
  updateRole: adminProcedure
    .input(
      z.object({
        id: z.number(),
        roles: z.array(z.enum(ALL_ROLES as unknown as [string, ...string[]])).min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const roles = input.roles as RoleValue[];
      const validation = validateRoles(roles);
      if (!validation.valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: validation.error });
      }

      const roleStr = serializeRoles(roles);
      await updateUser(input.id, { role: roleStr });
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update_role",
        entityType: "user",
        entityId: input.id,
        changes: JSON.stringify({ roles }),
      });
      return { success: true };
    }),

  toggleActive: adminProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await updateUser(input.id, { isActive: input.isActive });
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: input.isActive ? "activate" : "deactivate",
        entityType: "user",
        entityId: input.id,
      });
      return { success: true };
    }),

  /**
   * Invite a new admin user.
   * Creates a user record with an invite token.
   */
  invite: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(1),
        roles: z.array(z.enum(ALL_ROLES as unknown as [string, ...string[]])).min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if user already exists
      const existing = await getUserByEmail(input.email);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists" });
      }

      const roles = input.roles as RoleValue[];
      const validation = validateRoles(roles);
      if (!validation.valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: validation.error });
      }

      const inviteToken = generateInviteToken();
      const inviteExpiresAt = getInviteExpiryDate();
      const roleStr = serializeRoles(roles);
      const openId = `invite_${crypto.randomBytes(16).toString("hex")}`;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.insert(users).values({
        openId,
        name: input.name,
        email: input.email.toLowerCase().trim(),
        loginMethod: "password",
        role: roleStr,
        isActive: false, // Not active until they set a password
        inviteToken,
        inviteExpiresAt,
        language: "en",
        lastSignedIn: new Date(),
      });

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "invite_user",
        entityType: "user",
        entityId: 0,
        changes: JSON.stringify({ email: input.email, name: input.name, roles }),
      });

      // Build invite URL
      const origin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const inviteUrl = `${origin}/invite?token=${inviteToken}`;

      // Send invite email
      try {
        await sendAdminInviteEmail({
          to: input.email.toLowerCase().trim(),
          name: input.name,
          inviteUrl,
          roles: roles.join(", "),
        });
      } catch (err) {
        console.error("[UserMgmt] Failed to send invite email:", err);
        // Don't fail the invite if email fails — the URL is still returned
      }

      return {
        success: true,
        inviteUrl,
        inviteToken,
      };
    }),

  /**
   * Verify invite token (public — no auth required)
   */
  verifyInvite: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const user = await getUserByInviteToken(input.token);
      if (!user) {
        return { valid: false as const, reason: "Invalid invite link" };
      }
      if (user.isActive) {
        return { valid: false as const, reason: "Account already activated" };
      }
      if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
        return { valid: false as const, reason: "Invite link has expired" };
      }
      return {
        valid: true as const,
        email: user.email,
        name: user.name,
      };
    }),

  /**
   * Accept invite — set password and activate account (public — no auth required)
   */
  acceptInvite: publicProcedure
    .input(
      z.object({
        token: z.string(),
        password: z.string().min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await getUserByInviteToken(input.token);
      if (!user) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid invite link" });
      }
      if (user.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Account already activated" });
      }
      if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite link has expired" });
      }

      const passwordHash = await hashPassword(input.password);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.update(users).set({
        passwordHash,
        isActive: true,
        inviteToken: null,
        inviteExpiresAt: null,
        lastSignedIn: new Date(),
      }).where(eq(users.id, user.id));

      // Auto-login after accepting invite
      const payload: AdminJwtPayload = {
        sub: String(user.id),
        email: user.email || "",
        name: user.name || "",
        role: user.role,
        iss: "gea-admin",
      };

      const token = await signAdminToken(payload);
      setAdminCookie(ctx.req, ctx.res, token);

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    }),

  /**
   * Change own password (authenticated)
   */
  changePassword: userProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account error" });
      }

      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect" });
      }

      const newHash = await hashPassword(input.newPassword);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  /**
   * Admin reset password — generate a temporary password for a user.
   * The user will be required to change it on next login.
   */
  resetPassword: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserById(input.id);
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Cannot reset your own password via this endpoint
      if (user.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reset your own password here. Use Change Password instead." });
      }

      // Generate a temporary password (12 chars, alphanumeric)
      const tempPassword = crypto.randomBytes(6).toString("base64url").slice(0, 12);
      const passwordHash = await hashPassword(tempPassword);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.update(users).set({
        passwordHash,
        mustChangePassword: true,
      }).where(eq(users.id, input.id));

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "reset_password",
        entityType: "user",
        entityId: input.id,
        changes: JSON.stringify({ targetUser: user.email }),
      });

      // Send password reset email
      try {
        const origin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
        await sendAdminPasswordResetEmail({
          to: user.email || "",
          name: user.name || "Admin",
          tempPassword,
          loginUrl: `${origin}/login`,
        });
      } catch (err) {
        console.error("[UserMgmt] Failed to send password reset email:", err);
      }

      return {
        success: true,
        temporaryPassword: tempPassword,
        userName: user.name,
        userEmail: user.email,
      };
    }),

  /**
   * Resend invite — regenerate invite token for a pending user
   */
  resendInvite: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserById(input.id);
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      if (user.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is already active" });
      }

      const inviteToken = generateInviteToken();
      const inviteExpiresAt = getInviteExpiryDate();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.update(users).set({ inviteToken, inviteExpiresAt }).where(eq(users.id, input.id));

      const origin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const inviteUrl = `${origin}/invite?token=${inviteToken}`;

      // Resend invite email
      try {
        await sendAdminInviteEmail({
          to: user.email || "",
          name: user.name || "User",
          inviteUrl,
          roles: user.role || "",
        });
      } catch (err) {
        console.error("[UserMgmt] Failed to resend invite email:", err);
      }

      return { success: true, inviteUrl, inviteToken };
    }),
});
