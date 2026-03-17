/**
 * CP Portal Authentication Service
 *
 * COMPLETELY INDEPENDENT from Admin OAuth and Client Portal auth.
 * Uses email/password + JWT stored in a separate cookie (CP_PORTAL_COOKIE_NAME).
 *
 * Security guarantees:
 * 1. CP Portal JWT tokens use a unique issuer ("eg-cp-portal") to prevent cross-use
 * 2. CP Portal cookie name is different from admin and client portal cookies
 * 3. CP Portal context always injects channelPartnerId — no query can bypass this
 * 4. CP contacts table is separate from customer contacts table
 */

import bcrypt from "bcryptjs";
import * as jose from "jose";
import type { Request, Response } from "express";
import { ENV } from "../_core/env";
import {
  CP_PORTAL_COOKIE_NAME,
  CP_PORTAL_JWT_EXPIRY,
  CP_PORTAL_INVITE_EXPIRY_HOURS,
} from "../../shared/const";
import { getDb } from "../db";
import { channelPartnerContacts, channelPartners } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

// ============================================================================
// Types
// ============================================================================

export interface CpPortalUser {
  contactId: number;
  channelPartnerId: number;
  email: string;
  contactName: string;
  cpRole: "cp_admin" | "cp_finance" | "cp_hr" | "cp_viewer";
  companyName: string;
  /** Subdomain for this CP (e.g. "fa" -> fa.extendglobal.com) */
  subdomain: string | null;
  /** Whether this CP is the internal EG-DIRECT CP */
  isInternal: boolean;
}

export interface CpPortalJwtPayload {
  sub: string; // contactId as string
  channelPartnerId: number;
  email: string;
  cpRole: string;
  iss: string; // "eg-cp-portal" — distinguishes from admin and client portal tokens
}

// ============================================================================
// JWT Helpers (using jose library, with unique issuer for CP Portal)
// ============================================================================

const JWT_ISSUER = "eg-cp-portal"; // MUST differ from admin ("gea") and portal ("gea-portal")
const JWT_AUDIENCE = "eg-cp-portal-client";

function getJwtSecret(): Uint8Array {
  // Use a derived key so even if JWT_SECRET is the same env var,
  // CP portal tokens cannot be used as admin or client portal tokens
  const cpPortalKey = `cp-portal:${ENV.cookieSecret}`;
  return new TextEncoder().encode(cpPortalKey);
}

export async function signCpPortalToken(payload: CpPortalJwtPayload): Promise<string> {
  const secret = getJwtSecret();
  return new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(CP_PORTAL_JWT_EXPIRY)
    .sign(secret);
}

export async function verifyCpPortalToken(token: string): Promise<CpPortalJwtPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jose.jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    // Validate required fields
    if (!payload.sub || !payload.channelPartnerId || !payload.email || !payload.cpRole) {
      return null;
    }
    return payload as unknown as CpPortalJwtPayload;
  } catch {
    return null;
  }
}

// ============================================================================
// Password Helpers
// ============================================================================

const BCRYPT_ROUNDS = 12;

export async function hashCpPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyCpPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============================================================================
// Invite & Reset Token Helpers
// ============================================================================

export function generateCpInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getCpInviteExpiryDate(): Date {
  return new Date(Date.now() + CP_PORTAL_INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
}

export function generateCpResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const RESET_TOKEN_EXPIRY_HOURS = 1; // Reset link valid for 1 hour

export function getCpResetExpiryDate(): Date {
  return new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
}

// ============================================================================
// Cookie Helpers
// ============================================================================

export function setCpPortalCookie(res: Response, token: string): void {
  res.cookie(CP_PORTAL_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

export function clearCpPortalCookie(res: Response): void {
  res.clearCookie(CP_PORTAL_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
}

export function getCpPortalTokenFromRequest(req: Request): string | null {
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

  return cookies[CP_PORTAL_COOKIE_NAME] || null;
}

// ============================================================================
// Authentication: Resolve CP portal user from request
// ============================================================================

export async function authenticateCpPortalRequest(req: Request): Promise<CpPortalUser | null> {
  const token = getCpPortalTokenFromRequest(req);
  if (!token) return null;

  const payload = await verifyCpPortalToken(token);
  if (!payload) return null;

  // Verify the contact still exists and is active
  const db = getDb();
  if (!db) return null;

  const contacts = await db
    .select({
      id: channelPartnerContacts.id,
      channelPartnerId: channelPartnerContacts.channelPartnerId,
      email: channelPartnerContacts.email,
      contactName: channelPartnerContacts.contactName,
      portalRole: channelPartnerContacts.portalRole,
      isPortalActive: channelPartnerContacts.isPortalActive,
    })
    .from(channelPartnerContacts)
    .where(
      and(
        eq(channelPartnerContacts.id, parseInt(payload.sub)),
        eq(channelPartnerContacts.isPortalActive, true)
      )
    )
    .limit(1);

  if (contacts.length === 0) return null;
  const contact = contacts[0];

  // Also verify the channel partner is still active
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

  if (cpRows.length === 0 || cpRows[0].status !== "active") return null;

  return {
    contactId: contact.id,
    channelPartnerId: contact.channelPartnerId,
    email: contact.email,
    contactName: contact.contactName || contact.email,
    cpRole: (contact.portalRole as CpPortalUser["cpRole"]) || "cp_viewer",
    companyName: cpRows[0].companyName,
    subdomain: cpRows[0].subdomain,
    isInternal: cpRows[0].isInternal,
  };
}
