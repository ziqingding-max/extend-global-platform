/**
 * Worker Provisioning Service
 *
 * Handles the creation of Worker Portal accounts (worker_users) for both
 * employees and contractors. This is a standalone service that can be called
 * from Admin, Client Portal, or automated workflows.
 *
 * Business Rules:
 * - Each employee/contractor can have at most one worker_users record.
 * - A single worker_users record CAN link to BOTH a contractorId AND an employeeId
 *   (dual-identity: same person is both an Employee and a Contractor).
 * - When inviting, if the email already has a worker_users record with the OTHER identity,
 *   we APPEND the new identity to the existing record instead of creating a new one.
 * - The invite flow: create/update worker_users record -> send invite email -> worker sets password -> account activated.
 */

import { getDb } from "./db/connection";
import { workerUsers, contractors, employees, customers } from "../../drizzle/schema";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";
import { sendWorkerPortalInviteEmail } from "./authEmailService";

interface ProvisionWorkerInput {
  /** Exactly one of these must be provided per call */
  contractorId?: number;
  employeeId?: number;
  /** If not provided, will be looked up from the contractor/employee record */
  email?: string;
  /** Base URL for the invite link */
  baseUrl?: string;
  /** Whether to send the invite email. Defaults to true. */
  sendEmail?: boolean;
}

interface ProvisionResult {
  workerUserId: number;
  email: string;
  inviteToken: string;
  alreadyExists: boolean;
  /** True if we appended a new identity to an existing record */
  identityAppended: boolean;
}

/**
 * Create a Worker Portal account for an employee or contractor.
 * If the email already has a worker_users record (possibly for the other identity),
 * we append the new identity to the existing record.
 */
export async function provisionWorkerUser(input: ProvisionWorkerInput): Promise<ProvisionResult> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const { contractorId, employeeId, sendEmail: shouldSendEmail = true } = input;

  if (!contractorId && !employeeId) {
    throw new Error("Either contractorId or employeeId must be provided");
  }
  if (contractorId && employeeId) {
    throw new Error("Cannot provide both contractorId and employeeId in a single call");
  }

  // ── Step 1: Check if this specific contractor/employee already has a worker_users record ──
  const specificCondition = contractorId
    ? eq(workerUsers.contractorId, contractorId)
    : eq(workerUsers.employeeId, employeeId!);

  const [existingByIdentity] = await db.select().from(workerUsers).where(specificCondition).limit(1);

  if (existingByIdentity) {
    // This contractor/employee already has an account — return existing
    return {
      workerUserId: existingByIdentity.id,
      email: existingByIdentity.email,
      inviteToken: existingByIdentity.inviteToken || existingByIdentity.resetToken || "",
      alreadyExists: true,
      identityAppended: false,
    };
  }

  // ── Step 2: Look up the employee/contractor to get email ──
  let email = input.email || "";
  let workerName = "";
  let workerType: "employee" | "contractor" = contractorId ? "contractor" : "employee";
  let companyName = "";
  let customerId: number | null = null;

  if (contractorId) {
    const [contractor] = await db.select().from(contractors).where(eq(contractors.id, contractorId)).limit(1);
    if (!contractor) throw new Error(`Contractor ${contractorId} not found`);
    email = email || contractor.email || "";
    workerName = `${contractor.firstName || ""} ${contractor.lastName || ""}`.trim();
    customerId = contractor.customerId;
  } else if (employeeId) {
    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId!)).limit(1);
    if (!employee) throw new Error(`Employee ${employeeId} not found`);
    email = email || employee.email || "";
    workerName = `${employee.firstName || ""} ${employee.lastName || ""}`.trim();
    customerId = employee.customerId;
  }

  if (!email) {
    throw new Error("Cannot create worker account: no email address found");
  }

  // ── Step 3: Check if the same EMAIL already has a worker_users record (other identity) ──
  const [existingByEmail] = await db.select().from(workerUsers).where(eq(workerUsers.email, email)).limit(1);

  if (existingByEmail) {
    // Same email already has an account — APPEND the new identity
    const updateData: Record<string, any> = {};
    if (contractorId && !existingByEmail.contractorId) {
      updateData.contractorId = contractorId;
    } else if (employeeId && !existingByEmail.employeeId) {
      updateData.employeeId = employeeId;
    }

    if (Object.keys(updateData).length > 0) {
      await db.update(workerUsers).set(updateData).where(eq(workerUsers.id, existingByEmail.id));
    }

    return {
      workerUserId: existingByEmail.id,
      email: existingByEmail.email,
      inviteToken: existingByEmail.inviteToken || existingByEmail.resetToken || "",
      alreadyExists: true,
      identityAppended: Object.keys(updateData).length > 0,
    };
  }

  // ── Step 4: No existing record at all — create a new one ──
  // Look up company name for email
  if (customerId) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    companyName = customer?.companyName || "your company";
  }

  // Generate invite token
  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Create worker_users record
  const [newWorkerUser] = await db.insert(workerUsers).values({
    email,
    passwordHash: "",
    contractorId: contractorId || null,
    employeeId: employeeId || null,
    inviteToken: inviteToken,
    inviteExpiresAt: inviteTokenExpiry,
  }).returning();

  // Send invite email
  if (shouldSendEmail) {
    const baseUrl = input.baseUrl || process.env.WORKER_PORTAL_URL || "https://worker.extendglobal.ai";
    const inviteUrl = `${baseUrl}/invite/${inviteToken}`;

    try {
      await sendWorkerPortalInviteEmail({
        to: email,
        workerName: workerName || email,
        companyName,
        workerType,
        inviteUrl,
      });
    } catch (err) {
      console.error("[WorkerProvisioning] Failed to send invite email:", err);
    }
  }

  return {
    workerUserId: newWorkerUser.id,
    email,
    inviteToken,
    alreadyExists: false,
    identityAppended: false,
  };
}

/**
 * Resend the invite email for an existing worker_users record.
 * Generates a new token and sends a fresh invite email.
 */
export async function resendWorkerInvite(workerUserId: number, baseUrl?: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const [workerUser] = await db.select().from(workerUsers).where(eq(workerUsers.id, workerUserId)).limit(1);
  if (!workerUser) throw new Error(`Worker user ${workerUserId} not found`);

  // Generate new token
  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.update(workerUsers).set({
    inviteToken: inviteToken,
    inviteExpiresAt: inviteTokenExpiry,
  }).where(eq(workerUsers.id, workerUserId));

  // Determine worker info for email — prefer contractor identity for the email template
  let workerName = "";
  let workerType: "employee" | "contractor" = "contractor";
  let companyName = "";

  if (workerUser.contractorId) {
    const [contractor] = await db.select().from(contractors).where(eq(contractors.id, workerUser.contractorId)).limit(1);
    workerName = contractor ? `${contractor.firstName || ""} ${contractor.lastName || ""}`.trim() : "";
    if (contractor?.customerId) {
      const [customer] = await db.select().from(customers).where(eq(customers.id, contractor.customerId)).limit(1);
      companyName = customer?.companyName || "";
    }
  } else if (workerUser.employeeId) {
    workerType = "employee";
    const [employee] = await db.select().from(employees).where(eq(employees.id, workerUser.employeeId!)).limit(1);
    workerName = employee ? `${employee.firstName || ""} ${employee.lastName || ""}`.trim() : "";
    if (employee?.customerId) {
      const [customer] = await db.select().from(customers).where(eq(customers.id, employee.customerId)).limit(1);
      companyName = customer?.companyName || "";
    }
  }

  const url = baseUrl || process.env.WORKER_PORTAL_URL || "https://worker.extendglobal.ai";
  const inviteUrl = `${url}/invite/${inviteToken}`;

  await sendWorkerPortalInviteEmail({
    to: workerUser.email,
    workerName: workerName || workerUser.email,
    companyName: companyName || "your company",
    workerType,
    inviteUrl,
  });
}
