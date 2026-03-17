/**
 * Admin Forgot Password Express Routes
 *
 * POST /api/auth/forgot-password  — Request a password reset email
 * POST /api/auth/verify-reset     — Verify a reset token is valid
 * POST /api/auth/reset-password   — Set new password using a valid reset token
 *
 * These are public endpoints (no auth required) with rate limiting.
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import {
  getUserByEmail,
  getUserByResetToken,
  updateUser,
} from "../db";
import {
  generateResetToken,
  getResetExpiryDate,
  hashPassword,
} from "./adminAuth";
import { sendAdminForgotPasswordEmail } from "../services/authEmailService";

export function registerAdminForgotPasswordRoutes(app: Express) {
  // Strict rate limit for forgot password to prevent abuse
  const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many password reset requests. Please try again later." },
  });

  // ── Forgot Password ─────────────────────────────────────────────────
  app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }

      // Always return success to prevent email enumeration
      const user = await getUserByEmail(email.toLowerCase().trim());

      if (user && user.isActive && user.passwordHash) {
        const resetToken = generateResetToken();
        const resetExpiresAt = getResetExpiryDate();

        await updateUser(user.id, {
          resetToken,
          resetExpiresAt,
        } as any);

        // Build reset URL
        const adminOrigin = process.env.ADMIN_APP_URL || `${req.protocol}://${req.get("host")}`;
        const resetUrl = `${adminOrigin}/reset-password?token=${resetToken}`;

        try {
          await sendAdminForgotPasswordEmail({
            to: user.email || email,
            name: user.name || "Admin User",
            resetUrl,
          });
        } catch (emailErr) {
          console.error("[AdminAuth] Failed to send forgot password email:", emailErr);
        }
      }

      // Always return success (security: don't reveal if email exists)
      res.json({
        success: true,
        message: "If an account exists with this email, a password reset link has been sent.",
      });
    } catch (error) {
      console.error("[AdminAuth] Forgot password failed:", error);
      res.status(500).json({ error: "Failed to process request" });
    }
  });

  // ── Verify Reset Token ──────────────────────────────────────────────
  app.post("/api/auth/verify-reset", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        res.json({ valid: false, reason: "Missing token" });
        return;
      }

      const user = await getUserByResetToken(token);

      if (!user) {
        res.json({ valid: false, reason: "Invalid reset link" });
        return;
      }

      if (user.resetExpiresAt && new Date() > new Date(user.resetExpiresAt)) {
        res.json({ valid: false, reason: "Reset link has expired" });
        return;
      }

      res.json({
        valid: true,
        email: user.email,
        name: user.name,
      });
    } catch (error) {
      console.error("[AdminAuth] Verify reset token failed:", error);
      res.status(500).json({ valid: false, reason: "Server error" });
    }
  });

  // ── Reset Password ──────────────────────────────────────────────────
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        res.status(400).json({ error: "Token and new password are required" });
        return;
      }

      if (newPassword.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }

      const user = await getUserByResetToken(token);

      if (!user) {
        res.status(400).json({ error: "Invalid or expired reset link" });
        return;
      }

      if (user.resetExpiresAt && new Date() > new Date(user.resetExpiresAt)) {
        res.status(400).json({ error: "Reset link has expired. Please request a new one." });
        return;
      }

      const passwordHash = await hashPassword(newPassword);

      await updateUser(user.id, {
        passwordHash,
        resetToken: null,
        resetExpiresAt: null,
      } as any);

      res.json({
        success: true,
        message: "Password has been reset successfully. You can now log in with your new password.",
      });
    } catch (error) {
      console.error("[AdminAuth] Reset password failed:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
}
