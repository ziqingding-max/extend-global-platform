/**
 * Portal Authentication Service
 *
 * COMPLETELY INDEPENDENT from Admin Manus OAuth.
 * Uses email/password + JWT stored in a separate cookie (PORTAL_COOKIE_NAME).
 *
 * Security guarantees:
 * 1. Portal JWT tokens are signed with a different prefix to prevent cross-use
 * 2. Portal cookie name is different from admin cookie name
 * 3. Portal context always injects customerId — no query can bypass this
 */

import bcrypt from "bcryptjs";
import * as jose from "jose";
import type { Request, Response } from "express";
import { ENV } from "../_core/env";
import {
  PORTAL_COOKIE_NAME,
  PORTAL_JWT_EXPIRY,
  PORTAL_INVITE_EXPIRY_HOURS,
} from "../../shared/const";
import { getDb } from "../db";
import { customerContacts, customers } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

// ============================================================================
// Types
// ============================================================================

export interface PortalUser {
  contactId: number;
  customerId: number;
  email: string;
  contactName: string;
  portalRole: "admin" | "hr_manager" | "finance" | "viewer";
  companyName: string;
}

export interface PortalJwtPayload {
  sub: string; // contactId as string
  customerId: number;
  email: string;
  portalRole: string;
  iss: string; // "gea-portal" — distinguishes from admin tokens
}

// ============================================================================
// JWT Helpers (using jose library, same as admin but with different issuer)
// ============================================================================

const JWT_ISSUER = "gea-portal"; // MUST differ from admin issuer
const JWT_AUDIENCE = "gea-portal-client";

function getJwtSecret(): Uint8Array {
  // Use a derived key so even if JWT_SECRET is the same env var,
  // portal tokens cannot be used as admin tokens and vice versa
  const portalKey = `portal:${ENV.cookieSecret}`;
  return new TextEncoder().encode(portalKey);
}

export async function signPortalToken(payload: PortalJwtPayload): Promise<string> {
  const secret = getJwtSecret();
  return new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(PORTAL_JWT_EXPIRY)
    .sign(secret);
}

export async function verifyPortalToken(token: string): Promise<PortalJwtPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jose.jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    // Validate required fields
    if (!payload.sub || !payload.customerId || !payload.email || !payload.portalRole) {
      return null;
    }
    return payload as unknown as PortalJwtPayload;
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
// Invite Token Helpers
// ============================================================================

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getInviteExpiryDate(): Date {
  return new Date(Date.now() + PORTAL_INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const RESET_TOKEN_EXPIRY_HOURS = 1; // Reset link valid for 1 hour

export function getResetExpiryDate(): Date {
  return new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
}

// ============================================================================
// Cookie Helpers
// ============================================================================

export function setPortalCookie(res: Response, token: string): void {
  res.cookie(PORTAL_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

export function clearPortalCookie(res: Response): void {
  res.clearCookie(PORTAL_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
}

export function getPortalTokenFromRequest(req: Request): string | null {
  // Read from cookie
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").reduce(
    (acc, cookie) => {
      const [key, ...vals] = cookie.trim().split("=");
      acc[key] = vals.join("=");
      return acc;
    },
    {} as Record<string, string>
  );

  return cookies[PORTAL_COOKIE_NAME] || null;
}

// ============================================================================
// Authentication: Resolve portal user from request
// ============================================================================

export async function authenticatePortalRequest(req: Request): Promise<PortalUser | null> {
  const token = getPortalTokenFromRequest(req);
  if (!token) return null;

  const payload = await verifyPortalToken(token);
  if (!payload) return null;

  // Verify the contact still exists and is active
  const db = await getDb();
  if (!db) return null;

  const contacts = await db
    .select({
      id: customerContacts.id,
      customerId: customerContacts.customerId,
      email: customerContacts.email,
      contactName: customerContacts.contactName,
      portalRole: customerContacts.portalRole,
      isPortalActive: customerContacts.isPortalActive,
      hasPortalAccess: customerContacts.hasPortalAccess,
    })
    .from(customerContacts)
    .where(
      and(
        eq(customerContacts.id, parseInt(payload.sub)),
        eq(customerContacts.isPortalActive, true),
        eq(customerContacts.hasPortalAccess, true)
      )
    )
    .limit(1);

  if (contacts.length === 0) return null;
  const contact = contacts[0];

  // Also verify the customer is still active
  const customerRows = await db
    .select({ companyName: customers.companyName, status: customers.status })
    .from(customers)
    .where(eq(customers.id, contact.customerId))
    .limit(1);

  if (customerRows.length === 0 || customerRows[0].status !== "active") return null;

  return {
    contactId: contact.id,
    customerId: contact.customerId,
    email: contact.email,
    contactName: contact.contactName,
    portalRole: (contact.portalRole as PortalUser["portalRole"]) || "viewer",
    companyName: customerRows[0].companyName,
  };
}
