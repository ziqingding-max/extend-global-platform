/**
 * Worker Auth Router
 *
 * Handles login, registration, password reset, and forgot password for workers.
 * Supports both Contractor (AOR) and Employee (EOR) worker types.
 * Supports dual-identity: a single user can be both a Contractor and an Employee.
 *
 * Dual-identity flow:
 * 1. login returns hasDualIdentity + availableRoles
 * 2. If dual, frontend shows role selection page
 * 3. User calls switchRole -> new JWT with activeRole
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  workerRouter,
  workerPublicProcedure,
  protectedWorkerProcedure,
} from "../workerTrpc";
import {
  hashPassword,
  verifyPassword,
  signWorkerToken,
  setWorkerCookie,
  clearWorkerCookie,
  generateResetToken,
  getResetExpiryDate,
  resolveWorkerType,
  hasDualIdentity,
} from "../workerAuth";
import { getDb } from "../../services/db/connection";
import { workerUsers, contractors, employees } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { sendWorkerPasswordResetEmail } from "../../services/authEmailService";

export const workerAuthRouter = workerRouter({
  /**
   * Login with email and password.
   * Returns hasDualIdentity flag so frontend knows whether to show role selection.
   */
  login: workerPublicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [user] = await db
        .select()
        .from(workerUsers)
        .where(eq(workerUsers.email, input.email.toLowerCase().trim()));

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      if (!user.isActive) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Account is inactive",
        });
      }

      if (!user.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Please complete registration first",
        });
      }

      const isValid = await verifyPassword(input.password, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      const isDual = hasDualIdentity(user);
      const defaultRole = resolveWorkerType(user);

      // Build available roles list
      const availableRoles: Array<{ role: "contractor" | "employee"; label: string }> = [];
      if (user.contractorId) {
        // Look up contractor name for display
        let label = "Contractor";
        try {
          const [c] = await db.select({ firstName: contractors.firstName, lastName: contractors.lastName })
            .from(contractors).where(eq(contractors.id, user.contractorId));
          if (c) label = `Contractor - ${c.firstName} ${c.lastName}`;
        } catch {}
        availableRoles.push({ role: "contractor", label });
      }
      if (user.employeeId) {
        let label = "Employee";
        try {
          const [e] = await db.select({ firstName: employees.firstName, lastName: employees.lastName })
            .from(employees).where(eq(employees.id, user.employeeId));
          if (e) label = `Employee - ${e.firstName} ${e.lastName}`;
        } catch {}
        availableRoles.push({ role: "employee", label });
      }

      // Sign JWT with default role (will be overridden by switchRole if dual)
      const activeRole = isDual ? defaultRole : defaultRole;
      const token = await signWorkerToken({
        sub: user.id.toString(),
        email: user.email,
        contractorId: user.contractorId,
        employeeId: user.employeeId,
        activeRole,
        workerType: activeRole,
        iss: "gea-worker",
      });

      setWorkerCookie(ctx.res, token);

      // Update last login
      await db
        .update(workerUsers)
        .set({ lastLoginAt: new Date() })
        .where(eq(workerUsers.id, user.id));

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          contractorId: user.contractorId,
          employeeId: user.employeeId,
          activeRole,
          workerType: activeRole,
        },
        /** If true, frontend MUST show role selection page before proceeding */
        hasDualIdentity: isDual,
        /** Available roles for the selection page */
        availableRoles,
      };
    }),

  /**
   * Switch active role (for dual-identity users).
   * Re-signs the JWT with the new activeRole and sets a new cookie.
   */
  switchRole: protectedWorkerProcedure
    .input(
      z.object({
        role: z.enum(["contractor", "employee"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = ctx.workerUser;

      // Validate the user actually has the requested identity
      if (input.role === "contractor" && !user.contractorId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You do not have a contractor identity",
        });
      }
      if (input.role === "employee" && !user.employeeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You do not have an employee identity",
        });
      }

      // Re-sign JWT with new activeRole
      const token = await signWorkerToken({
        sub: user.id.toString(),
        email: user.email,
        contractorId: user.contractorId,
        employeeId: user.employeeId,
        activeRole: input.role,
        workerType: input.role,
        iss: "gea-worker",
      });

      setWorkerCookie(ctx.res, token);

      return {
        success: true,
        activeRole: input.role,
      };
    }),

  /**
   * Logout
   */
  logout: workerPublicProcedure.mutation(({ ctx }) => {
    clearWorkerCookie(ctx.res);
    return { success: true };
  }),

  /**
   * Get current user — returns full context including activeRole, dual identity info, and profile
   */
  me: protectedWorkerProcedure.query(async ({ ctx }) => {
    const user = ctx.workerUser;
    const db = getDb();

    // Build available roles for the UI switch button
    const availableRoles: Array<{ role: "contractor" | "employee"; label: string }> = [];
    if (db) {
      if (user.contractorId) {
        let label = "Contractor";
        try {
          const [c] = await db.select({ firstName: contractors.firstName, lastName: contractors.lastName })
            .from(contractors).where(eq(contractors.id, user.contractorId));
          if (c) label = `Contractor - ${c.firstName} ${c.lastName}`;
        } catch {}
        availableRoles.push({ role: "contractor", label });
      }
      if (user.employeeId) {
        let label = "Employee";
        try {
          const [e] = await db.select({ firstName: employees.firstName, lastName: employees.lastName })
            .from(employees).where(eq(employees.id, user.employeeId));
          if (e) label = `Employee - ${e.firstName} ${e.lastName}`;
        } catch {}
        availableRoles.push({ role: "employee", label });
      }
    }

    return {
      ...user,
      availableRoles,
    };
  }),

  /**
   * Register with invite token
   */
  register: workerPublicProcedure
    .input(
      z.object({
        token: z.string(),
        password: z.string().min(8),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [user] = await db
        .select()
        .from(workerUsers)
        .where(eq(workerUsers.inviteToken, input.token));

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid or expired invite token",
        });
      }

      if (user.inviteExpiresAt && new Date(user.inviteExpiresAt) < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite token has expired",
        });
      }

      // Hash password
      const passwordHash = await hashPassword(input.password);

      // Update user
      await db
        .update(workerUsers)
        .set({
          passwordHash,
          inviteToken: null,
          inviteExpiresAt: null,
          isEmailVerified: true,
          isActive: true,
          lastLoginAt: new Date(),
        })
        .where(eq(workerUsers.id, user.id));

      const activeRole = resolveWorkerType(user);
      const isDual = hasDualIdentity(user);

      // Generate token for auto-login
      const token = await signWorkerToken({
        sub: user.id.toString(),
        email: user.email,
        contractorId: user.contractorId,
        employeeId: user.employeeId,
        activeRole,
        workerType: activeRole,
        iss: "gea-worker",
      });

      setWorkerCookie(ctx.res, token);

      return { success: true, hasDualIdentity: isDual };
    }),

  /**
   * Forgot password — generates a reset token and sends email
   */
  forgotPassword: workerPublicProcedure
    .input(
      z.object({
        email: z.string().email(),
        origin: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [user] = await db
        .select({
          id: workerUsers.id,
          email: workerUsers.email,
          isActive: workerUsers.isActive,
          contractorId: workerUsers.contractorId,
          employeeId: workerUsers.employeeId,
        })
        .from(workerUsers)
        .where(eq(workerUsers.email, input.email.toLowerCase().trim()));

      // Always return success to prevent email enumeration
      if (!user || !user.isActive) {
        return {
          success: true,
          message: "If an account exists with this email, a reset link has been sent.",
        };
      }

      const resetToken = generateResetToken();
      const resetExpiresAt = getResetExpiryDate();

      await db
        .update(workerUsers)
        .set({ resetToken, resetExpiresAt })
        .where(eq(workerUsers.id, user.id));

      const origin = input.origin;
      const resetUrl = `${origin}/reset-password?token=${resetToken}`;

      // Get worker name from the appropriate profile table
      let workerName = user.email;
      try {
        if (user.contractorId) {
          const [contractor] = await db
            .select({ firstName: contractors.firstName, lastName: contractors.lastName })
            .from(contractors)
            .where(eq(contractors.id, user.contractorId));
          if (contractor) {
            workerName = `${contractor.firstName || ""} ${contractor.lastName || ""}`.trim() || user.email;
          }
        } else if (user.employeeId) {
          const [employee] = await db
            .select({ firstName: employees.firstName, lastName: employees.lastName })
            .from(employees)
            .where(eq(employees.id, user.employeeId));
          if (employee) {
            workerName = `${employee.firstName || ""} ${employee.lastName || ""}`.trim() || user.email;
          }
        }
      } catch {
        // Fallback to email
      }

      try {
        await sendWorkerPasswordResetEmail({
          to: user.email,
          workerName,
          resetUrl,
        });
      } catch (err) {
        console.error("[WorkerAuth] Failed to send password reset email:", err);
      }

      return {
        success: true,
        message: "If an account exists with this email, a reset link has been sent.",
      };
    }),

  /**
   * Verify reset token
   */
  verifyResetToken: workerPublicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [user] = await db
        .select({
          id: workerUsers.id,
          email: workerUsers.email,
          resetExpiresAt: workerUsers.resetExpiresAt,
        })
        .from(workerUsers)
        .where(eq(workerUsers.resetToken, input.token));

      if (!user) {
        return { valid: false, reason: "Invalid reset link" as const };
      }

      if (user.resetExpiresAt && new Date(user.resetExpiresAt) < new Date()) {
        return { valid: false, reason: "Reset link has expired" as const };
      }

      return {
        valid: true,
        email: user.email,
      };
    }),

  /**
   * Reset password using token
   */
  resetPassword: workerPublicProcedure
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

      const [user] = await db
        .select()
        .from(workerUsers)
        .where(eq(workerUsers.resetToken, input.token));

      if (!user) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid reset link" });
      }

      if (user.resetExpiresAt && new Date(user.resetExpiresAt) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reset link has expired" });
      }

      const passwordHash = await hashPassword(input.password);

      await db
        .update(workerUsers)
        .set({
          passwordHash,
          resetToken: null,
          resetExpiresAt: null,
        })
        .where(eq(workerUsers.id, user.id));

      const activeRole = resolveWorkerType(user);

      // Auto-login after password reset
      const token = await signWorkerToken({
        sub: user.id.toString(),
        email: user.email,
        contractorId: user.contractorId,
        employeeId: user.employeeId,
        activeRole,
        workerType: activeRole,
        iss: "gea-worker",
      });

      setWorkerCookie(ctx.res, token);

      return { success: true };
    }),

  /**
   * Change password (authenticated)
   */
  changePassword: protectedWorkerProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [user] = await db
        .select({ passwordHash: workerUsers.passwordHash })
        .from(workerUsers)
        .where(eq(workerUsers.id, ctx.workerUser.id));

      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account error" });
      }

      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect" });
      }

      const newHash = await hashPassword(input.newPassword);
      await db
        .update(workerUsers)
        .set({ passwordHash: newHash })
        .where(eq(workerUsers.id, ctx.workerUser.id));

      return { success: true };
    }),
});
