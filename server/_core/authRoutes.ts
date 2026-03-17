/**
 * Admin Auth Express Routes
 *
 * POST /api/auth/login    — Email/password login
 * POST /api/auth/logout   — Clear session cookie
 *
 * Replaces the old OAuth callback route.
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import * as db from "../db";
import {
  verifyPassword,
  signAdminToken,
  setAdminCookie,
  clearAdminCookie,
  type AdminJwtPayload,
} from "./adminAuth";

export function registerAuthRoutes(app: Express) {
  const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Please try again later." },
  });

  // Login endpoint
  app.post("/api/auth/login", adminLoginLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      // Find user by email
      const user = await db.getUserByEmail(email.toLowerCase().trim());
      if (!user) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Check if account is active
      if (!user.isActive) {
        res.status(401).json({ error: "Account is deactivated" });
        return;
      }

      // Verify password
      if (!user.passwordHash) {
        res.status(401).json({ error: "Account not activated. Please use your invite link to set a password." });
        return;
      }

      const passwordValid = await verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Sign JWT and set cookie
      const payload: AdminJwtPayload = {
        sub: String(user.id),
        email: user.email || "",
        name: user.name || "",
        role: user.role,
        iss: "gea-admin",
      };

      const token = await signAdminToken(payload);
      setAdminCookie(req, res, token);

      // Update last signed in
      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("[Auth] Login failed:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    clearAdminCookie(req, res);
    res.json({ success: true });
  });
}
