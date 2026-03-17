/**
 * Admin Authentication Service
 *
 * Independent email/password authentication for admin panel.
 * Replaces Manus OAuth with local JWT-based auth.
 *
 * Security:
 * 1. Passwords hashed with bcrypt (12 rounds)
 * 2. JWT tokens signed with HS256 using JWT_SECRET
 * 3. Session stored in httpOnly cookie (COOKIE_NAME)
 * 4. Invite system for adding new admin users
 */

import bcrypt from "bcryptjs";
import * as jose from "jose";
import crypto from "crypto";
import type { Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import * as db from "../db";
import type { User } from "../../drizzle/schema";
import { ForbiddenError } from "@shared/_core/errors";

// ============================================================================
// JWT Helpers
// ============================================================================

const JWT_ISSUER = "gea-admin";
const JWT_AUDIENCE = "gea-admin-client";

function getJwtSecret(): Uint8Array {
  const secret = ENV.cookieSecret;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

export interface AdminJwtPayload {
  sub: string; // user id as string
  email: string;
  name: string;
  role: string;
  iss: string;
}

export async function signAdminToken(payload: AdminJwtPayload): Promise<string> {
  const secret = getJwtSecret();
  return new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime("365d")
    .sign(secret);
}

export async function verifyAdminToken(token: string): Promise<AdminJwtPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jose.jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (!payload.sub || !payload.email) {
      return null;
    }
    return payload as unknown as AdminJwtPayload;
  } catch {
    return null;
  }
}

// ============================================================================
// Password Helpers
// ============================================================================

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============================================================================
// Invite & Reset Token Helpers
// ============================================================================

const INVITE_EXPIRY_HOURS = 72;
const RESET_EXPIRY_HOURS = 1;

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getInviteExpiryDate(): Date {
  return new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getResetExpiryDate(): Date {
  return new Date(Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000);
}

// ============================================================================
// Cookie Helpers
// ============================================================================

export function setAdminCookie(req: Request, res: Response, token: string): void {
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

export function clearAdminCookie(req: Request, res: Response): void {
  const cookieOptions = getSessionCookieOptions(req);
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
}

function getAdminTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = parseCookieHeader(cookieHeader);
  return cookies[COOKIE_NAME] || null;
}

// ============================================================================
// Authentication: Resolve admin user from request
// ============================================================================

export async function authenticateAdminRequest(req: Request): Promise<User> {
  const token = getAdminTokenFromRequest(req);
  if (!token) {
    throw ForbiddenError("Missing session cookie");
  }

  const payload = await verifyAdminToken(token);
  if (!payload) {
    throw ForbiddenError("Invalid session token");
  }

  const userId = parseInt(payload.sub, 10);
  if (isNaN(userId)) {
    throw ForbiddenError("Invalid session payload");
  }

  const user = await db.getUserById(userId);
  if (!user) {
    throw ForbiddenError("User not found");
  }

  if (!user.isActive) {
    throw ForbiddenError("Account is deactivated");
  }

  // Update last signed in
  await db.upsertUser({
    openId: user.openId,
    lastSignedIn: new Date(),
  });

  return user;
}
