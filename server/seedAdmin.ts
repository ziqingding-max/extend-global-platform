/**
 * Seed Default Admin
 *
 * Creates the default admin user on first startup if it doesn't exist.
 *
 * SECURITY POLICY:
 * - ADMIN_BOOTSTRAP_PASSWORD env var is ALWAYS required (no hardcoded fallback).
 * - ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_NAME are also required.
 */

import { hashPassword } from "./_core/adminAuth";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { ENV } from "./_core/env";

function resolveBootstrapPassword(): string {
  const fromEnv = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
  if (fromEnv && fromEnv.length >= 10) return fromEnv;

  if (fromEnv && fromEnv.length < 10) {
    throw new Error(
      "ADMIN_BOOTSTRAP_PASSWORD must be at least 10 characters long for security."
    );
  }

  throw new Error(
    "ADMIN_BOOTSTRAP_PASSWORD environment variable is required for initial admin seeding. " +
    "Please set a strong password (at least 10 characters) in your .env file."
  );
}

export async function seedDefaultAdmin(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Seed] Database not available, skipping admin seed");
      return;
    }

    const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim();
    const adminName = process.env.ADMIN_BOOTSTRAP_NAME?.trim();

    if (!adminEmail) {
      console.warn("[Seed] ADMIN_BOOTSTRAP_EMAIL not set, skipping admin seed");
      return;
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    if (existing.length > 0) {
      console.log("[Seed] Default admin already exists, skipping");
      return;
    }

    const bootstrapPassword = resolveBootstrapPassword();
    const passwordHash = await hashPassword(bootstrapPassword);
    const openId = `admin_${crypto.randomBytes(16).toString("hex")}`;

    await db.insert(users).values({
      openId,
      name: adminName || "Admin",
      email: adminEmail,
      passwordHash,
      loginMethod: "password",
      role: "admin",
      isActive: true,
      language: "en",
      lastSignedIn: new Date(),
    });

    console.warn(
      `[Seed] Bootstrap admin created: ${adminEmail}. ` +
      `Please change the password after first login and remove ADMIN_BOOTSTRAP_PASSWORD from env.`
    );
  } catch (error) {
    console.error("[Seed] Failed to seed default admin:", error);
  }
}
