/**
 * CP Portal Clients Router
 *
 * Full CRUD management of End Clients from the Channel Partner's perspective.
 * All queries are SCOPED to ctx.cpUser.channelPartnerId — CP can only see/manage their own clients.
 *
 * Capabilities:
 * - List clients under this CP (with search, pagination)
 * - View client detail (company info, contacts, employees count)
 * - Create new client (CP has full authority, no EG approval needed)
 * - Update client info (company details, contacts, payment terms, etc.)
 * - View employees under a specific client
 * - Manage customer contacts (CRUD)
 * - Toggle Client Portal access for contacts
 *
 * B2B2B Architecture:
 * - CP is fully responsible for their client relationships
 * - Commercial contract is between CP and Client (not EG and Client)
 * - CP manages client Wallet, Deposit, Invoicing independently
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, like, sql, count, desc, SQL } from "drizzle-orm";
import {
  protectedCpProcedure,
  cpHrProcedure,
  cpAdminProcedure,
  cpPortalRouter,
} from "../cpPortalTrpc";
import { getDb } from "../../db";
import {
  customers,
  employees,
  customerContacts,
  customerContracts,
} from "../../../drizzle/schema";
import { storagePut, storageGet } from "../../storage";
import { generateInviteToken, getInviteExpiryDate } from "../../portal/portalAuth";
import { sendPortalInviteEmail } from "../../services/authEmailService";
import { logAuditAction } from "../../db";

// ── Helper: Generate client code ──────────────────────────────────────
async function generateClientCode(db: any): Promise<string> {
  const result = await db
    .select({ total: count() })
    .from(customers);
  const nextNum = (result[0]?.total ?? 0) + 1;
  return `CUS-${String(nextNum).padStart(4, "0")}`;
}

// ── Helper: Verify customer belongs to this CP ────────────────────────
async function verifyCpOwnership(db: any, customerId: number, cpId: number) {
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.channelPartnerId, cpId)
      )
    )
    .limit(1);
  if (rows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Client not found or does not belong to your organization" });
  }
}

export const cpPortalClientsRouter = cpPortalRouter({
  // ════════════════════════════════════════════════════════════════════
  // LIST — paginated client list scoped to this CP
  // ════════════════════════════════════════════════════════════════════
  list: protectedCpProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;
      const offset = (input.page - 1) * input.pageSize;

      // Build conditions — always scoped to this CP
      const conditions: SQL[] = [eq(customers.channelPartnerId, cpId)];

      if (input.search) {
        conditions.push(like(customers.companyName, `%${input.search}%`));
      }
      if (input.status) {
        conditions.push(sql`${customers.status} = ${input.status}`);
      }

      const whereClause = and(...conditions);

      const [items, totalResult] = await Promise.all([
        db
          .select({
            id: customers.id,
            clientCode: customers.clientCode,
            companyName: customers.companyName,
            legalEntityName: customers.legalEntityName,
            country: customers.country,
            status: customers.status,
            industry: customers.industry,
            primaryContactEmail: customers.primaryContactEmail,
            primaryContactName: customers.primaryContactName,
            paymentTermDays: customers.paymentTermDays,
            settlementCurrency: customers.settlementCurrency,
            createdAt: customers.createdAt,
          })
          .from(customers)
          .where(whereClause)
          .orderBy(desc(customers.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(customers)
          .where(whereClause),
      ]);

      // Get employee counts for each client
      const itemsWithCounts = await Promise.all(
        items.map(async (client) => {
          const empCount = await db
            .select({ total: count() })
            .from(employees)
            .where(eq(employees.customerId, client.id));
          return {
            ...client,
            employeeCount: empCount[0]?.total ?? 0,
          };
        })
      );

      return {
        items: itemsWithCounts,
        total: totalResult[0]?.total ?? 0,
      };
    }),

  // ════════════════════════════════════════════════════════════════════
  // GET — client detail with employee count
  // ════════════════════════════════════════════════════════════════════
  get: protectedCpProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Fetch customer — must belong to this CP
      const customerRows = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.id, input.id),
            eq(customers.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (customerRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      }

      // Get employee count for this client
      const empCountResult = await db
        .select({ total: count() })
        .from(employees)
        .where(
          and(
            eq(employees.customerId, input.id),
            eq(employees.channelPartnerId, cpId)
          )
        );

      return {
        ...customerRows[0],
        employeeCount: empCountResult[0]?.total ?? 0,
      };
    }),

  // ════════════════════════════════════════════════════════════════════
  // CREATE — CP creates a new client (no EG approval needed)
  // ════════════════════════════════════════════════════════════════════
  create: cpHrProcedure
    .input(
      z.object({
        companyName: z.string().min(1, "Company name is required"),
        legalEntityName: z.string().optional(),
        registrationNumber: z.string().optional(),
        industry: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().min(1, "Country is required"),
        postalCode: z.string().optional(),
        primaryContactName: z.string().optional(),
        primaryContactEmail: z.string().email().optional(),
        primaryContactPhone: z.string().optional(),
        paymentTermDays: z.number().min(0).max(365).default(30),
        settlementCurrency: z.string().default("USD"),
        language: z.enum(["en", "zh"]).default("en"),
        depositMultiplier: z.number().min(1).max(3).default(2),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Check email uniqueness within this CP's clients
      if (input.primaryContactEmail) {
        const existing = await db
          .select({ id: customers.id, companyName: customers.companyName })
          .from(customers)
          .where(
            and(
              eq(customers.primaryContactEmail, input.primaryContactEmail),
              eq(customers.channelPartnerId, cpId)
            )
          )
          .limit(1);
        if (existing.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Email "${input.primaryContactEmail}" is already used by client "${existing[0].companyName}"`,
          });
        }
      }

      // Generate client code
      const clientCode = await generateClientCode(db);

      // Insert customer — automatically scoped to this CP
      const result = await db.insert(customers).values({
        ...input,
        clientCode,
        channelPartnerId: cpId,
        status: "active",
      }).returning({ id: customers.id });

      const customerId = result[0]?.id;

      // Auto-create primary contact record
      if (customerId && input.primaryContactName) {
        await db.insert(customerContacts).values({
          customerId,
          channelPartnerId: cpId,
          contactName: input.primaryContactName,
          email: input.primaryContactEmail || "",
          phone: input.primaryContactPhone || undefined,
          role: "Primary Contact",
          isPrimary: true,
          hasPortalAccess: false,
        });
      }

      return { id: customerId, clientCode };
    }),

  // ════════════════════════════════════════════════════════════════════
  // UPDATE — CP updates client info
  // ════════════════════════════════════════════════════════════════════
  update: cpHrProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          companyName: z.string().optional(),
          legalEntityName: z.string().optional(),
          registrationNumber: z.string().optional(),
          industry: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          postalCode: z.string().optional(),
          primaryContactName: z.string().optional(),
          primaryContactEmail: z.string().optional(),
          primaryContactPhone: z.string().optional(),
          paymentTermDays: z.number().min(0).max(365).optional(),
          settlementCurrency: z.string().optional(),
          language: z.enum(["en", "zh"]).optional(),
          depositMultiplier: z.number().min(1).max(3).optional(),
          status: z.enum(["active", "suspended", "terminated"]).optional(),
          notes: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Verify ownership
      await verifyCpOwnership(db, input.id, cpId);

      // Update customer
      await db
        .update(customers)
        .set(input.data)
        .where(
          and(
            eq(customers.id, input.id),
            eq(customers.channelPartnerId, cpId)
          )
        );

      // Sync primary contact if contact fields changed
      const primaryChanged =
        input.data.primaryContactName !== undefined ||
        input.data.primaryContactEmail !== undefined ||
        input.data.primaryContactPhone !== undefined;

      if (primaryChanged) {
        const contacts = await db
          .select()
          .from(customerContacts)
          .where(
            and(
              eq(customerContacts.customerId, input.id),
              eq(customerContacts.isPrimary, true)
            )
          )
          .limit(1);

        if (contacts.length > 0) {
          const syncData: any = {};
          if (input.data.primaryContactName !== undefined) syncData.contactName = input.data.primaryContactName;
          if (input.data.primaryContactEmail !== undefined) syncData.email = input.data.primaryContactEmail;
          if (input.data.primaryContactPhone !== undefined) syncData.phone = input.data.primaryContactPhone;
          await db
            .update(customerContacts)
            .set(syncData)
            .where(eq(customerContacts.id, contacts[0].id));
        }
      }

      return { success: true };
    }),

  // ════════════════════════════════════════════════════════════════════
  // CONTACTS — CRUD for customer contacts
  // ════════════════════════════════════════════════════════════════════
  listContacts: protectedCpProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return [];

      const cpId = ctx.cpUser.channelPartnerId;
      await verifyCpOwnership(db, input.customerId, cpId);

      return db
        .select()
        .from(customerContacts)
        .where(eq(customerContacts.customerId, input.customerId));
    }),

  createContact: cpHrProcedure
    .input(
      z.object({
        customerId: z.number(),
        contactName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        role: z.string().optional(),
        isPrimary: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;
      await verifyCpOwnership(db, input.customerId, cpId);

      // If setting as primary, unset existing primary
      if (input.isPrimary) {
        await db
          .update(customerContacts)
          .set({ isPrimary: false })
          .where(
            and(
              eq(customerContacts.customerId, input.customerId),
              eq(customerContacts.isPrimary, true)
            )
          );
      }

      const result = await db.insert(customerContacts).values({
        ...input,
        channelPartnerId: cpId,
        hasPortalAccess: false,
      }).returning({ id: customerContacts.id });

      return { id: result[0]?.id };
    }),

  updateContact: cpHrProcedure
    .input(
      z.object({
        id: z.number(),
        customerId: z.number(),
        data: z.object({
          contactName: z.string().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          role: z.string().optional(),
          isPrimary: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;
      await verifyCpOwnership(db, input.customerId, cpId);

      // If setting as primary, unset existing primary
      if (input.data.isPrimary) {
        await db
          .update(customerContacts)
          .set({ isPrimary: false })
          .where(
            and(
              eq(customerContacts.customerId, input.customerId),
              eq(customerContacts.isPrimary, true)
            )
          );
      }

      await db
        .update(customerContacts)
        .set(input.data)
        .where(eq(customerContacts.id, input.id));

      return { success: true };
    }),

  deleteContact: cpHrProcedure
    .input(z.object({ id: z.number(), customerId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;
      await verifyCpOwnership(db, input.customerId, cpId);

      // Don't allow deleting the primary contact
      const contact = await db
        .select({ isPrimary: customerContacts.isPrimary })
        .from(customerContacts)
        .where(eq(customerContacts.id, input.id))
        .limit(1);

      if (contact[0]?.isPrimary) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete the primary contact. Set another contact as primary first." });
      }

      await db.delete(customerContacts).where(eq(customerContacts.id, input.id));
      return { success: true };
    }),

  // ════════════════════════════════════════════════════════════════════
  // TOGGLE PORTAL ACCESS — CP grants/revokes Client Portal login
  // ════════════════════════════════════════════════════════════════════
  togglePortalAccess: cpAdminProcedure
    .input(
      z.object({
        contactId: z.number(),
        customerId: z.number(),
        hasPortalAccess: z.boolean(),
        portalRole: z.enum(["admin", "hr_manager", "finance", "viewer"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;
      await verifyCpOwnership(db, input.customerId, cpId);

      const updateData: any = {
        hasPortalAccess: input.hasPortalAccess,
      };

      if (input.portalRole) {
        updateData.portalRole = input.portalRole;
      }

       // If revoking access, clear auth tokens
      if (!input.hasPortalAccess) {
        updateData.inviteToken = null;
        updateData.inviteExpiresAt = null;
        updateData.resetToken = null;
        updateData.resetExpiresAt = null;
      }

      // If granting access, generate invite token and send email
      if (input.hasPortalAccess) {
        // Check if the contact already has a password (already activated)
        const existingContact = await db
          .select({
            id: customerContacts.id,
            email: customerContacts.email,
            contactName: customerContacts.contactName,
            passwordHash: customerContacts.passwordHash,
            isPortalActive: customerContacts.isPortalActive,
          })
          .from(customerContacts)
          .where(eq(customerContacts.id, input.contactId))
          .limit(1);

        const contact = existingContact[0];
        if (contact && !contact.passwordHash) {
          // Contact hasn't set password yet — generate invite token
          const inviteToken = generateInviteToken();
          const inviteExpiresAt = getInviteExpiryDate();
          updateData.inviteToken = inviteToken;
          updateData.inviteExpiresAt = inviteExpiresAt;
          updateData.isPortalActive = false;

          // Send white-labeled invite email
          try {
            const custRows = await db
              .select({ companyName: customers.companyName })
              .from(customers)
              .where(eq(customers.id, input.customerId))
              .limit(1);
            const companyName = custRows[0]?.companyName || "Your Company";
            const portalOrigin = process.env.PORTAL_APP_URL || "https://app.extendglobal.ai";
            const inviteUrl = `${portalOrigin}/register?token=${inviteToken}`;

            await sendPortalInviteEmail({
              to: contact.email,
              contactName: contact.contactName,
              companyName,
              portalRole: input.portalRole || "viewer",
              inviteUrl,
              channelPartnerId: cpId, // Enables CP white-label branding
            });
          } catch (err) {
            console.error(`[CP Portal] Failed to send client portal invite email:`, err);
          }
        }
      }

      await db
        .update(customerContacts)
        .set(updateData)
        .where(eq(customerContacts.id, input.contactId));

      await logAuditAction({
        action: "cp_toggle_client_portal_access",
        entityType: "customer_contact",
        entityId: input.contactId,
        channelPartnerId: cpId,
        portalSource: "cp_portal",
        userName: ctx.cpUser.contactName,
        changes: JSON.stringify({ hasPortalAccess: input.hasPortalAccess, portalRole: input.portalRole }),
      });

      return { success: true };
    }),

  // ════════════════════════════════════════════════════════════════════
  // EMPLOYEES — list employees for a specific client
  // CP can see employee roster but NOT salary/compensation details
  // ════════════════════════════════════════════════════════════════════
  listEmployees: cpHrProcedure
    .input(
      z.object({
        customerId: z.number(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;
      const offset = (input.page - 1) * input.pageSize;

      // Verify client belongs to this CP
      await verifyCpOwnership(db, input.customerId, cpId);

      // Build conditions
      const conditions: SQL[] = [
        eq(employees.customerId, input.customerId),
        eq(employees.channelPartnerId, cpId),
      ];

      if (input.search) {
        conditions.push(
          sql`(${employees.firstName} LIKE ${"%" + input.search + "%"} OR ${employees.lastName} LIKE ${"%" + input.search + "%"} OR ${employees.email} LIKE ${"%" + input.search + "%"})`
        );
      }
      if (input.status) {
        conditions.push(sql`${employees.status} = ${input.status}`);
      }

      const whereClause = and(...conditions);

      // CP sees employee roster but NOT salary/compensation/bank details
      const [items, totalResult] = await Promise.all([
        db
          .select({
            id: employees.id,
            employeeCode: employees.employeeCode,
            firstName: employees.firstName,
            lastName: employees.lastName,
            email: employees.email,
            phone: employees.phone,
            dateOfBirth: employees.dateOfBirth,
            gender: employees.gender,
            nationality: employees.nationality,
            idNumber: employees.idNumber,
            idType: employees.idType,
            address: employees.address,
            city: employees.city,
            state: employees.state,
            country: employees.country,
            postalCode: employees.postalCode,
            jobTitle: employees.jobTitle,
            department: employees.department,
            serviceType: employees.serviceType,
            employmentType: employees.employmentType,
            startDate: employees.startDate,
            endDate: employees.endDate,
            status: employees.status,
            requiresVisa: employees.requiresVisa,
            visaStatus: employees.visaStatus,
            visaExpiryDate: employees.visaExpiryDate,
            visaNotes: employees.visaNotes,
            createdAt: employees.createdAt,
            // NOTE: baseSalary, salaryCurrency, estimatedEmployerCost, bankDetails
            // are NOT exposed to CP — these are EG-managed "hard data"
          })
          .from(employees)
          .where(whereClause)
          .orderBy(desc(employees.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(employees)
          .where(whereClause),
      ]);

      return {
        items,
        total: totalResult[0]?.total ?? 0,
      };
    }),

  // ════════════════════════════════════════════════════════════════════
  // GET EMPLOYEE — single employee detail (non-hard-data fields)
  // ════════════════════════════════════════════════════════════════════
  getEmployee: cpHrProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;

      const rows = await db
        .select({
          id: employees.id,
          employeeCode: employees.employeeCode,
          customerId: employees.customerId,
          firstName: employees.firstName,
          lastName: employees.lastName,
          email: employees.email,
          phone: employees.phone,
          dateOfBirth: employees.dateOfBirth,
          gender: employees.gender,
          nationality: employees.nationality,
          idNumber: employees.idNumber,
          idType: employees.idType,
          address: employees.address,
          city: employees.city,
          state: employees.state,
          country: employees.country,
          postalCode: employees.postalCode,
          jobTitle: employees.jobTitle,
          department: employees.department,
          serviceType: employees.serviceType,
          employmentType: employees.employmentType,
          startDate: employees.startDate,
          endDate: employees.endDate,
          status: employees.status,
          requiresVisa: employees.requiresVisa,
          visaStatus: employees.visaStatus,
          visaExpiryDate: employees.visaExpiryDate,
          visaNotes: employees.visaNotes,
          createdAt: employees.createdAt,
          updatedAt: employees.updatedAt,
          // NOTE: baseSalary, salaryCurrency, estimatedEmployerCost, bankDetails NOT exposed
        })
        .from(employees)
        .where(
          and(
            eq(employees.id, input.employeeId),
            eq(employees.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      return rows[0];
    }),

  // ════════════════════════════════════════════════════════════════════
  // UPDATE EMPLOYEE (non-hard-data only) — CP assists with profile data
  //
  // EDIT LOCK RULE:
  // - If employee status is NOT "pending_review" or "documents_incomplete",
  //   CP cannot edit (only EG Super Admin can).
  // - CP can only edit non-hard-data fields (personal info, address, visa notes).
  //   Salary, bank details, contracts are EG-managed.
  // ════════════════════════════════════════════════════════════════════
  updateEmployee: cpHrProcedure
    .input(
      z.object({
        employeeId: z.number(),
        data: z.object({
          // Personal info (non-hard-data, CP can assist)
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          dateOfBirth: z.string().optional(),
          gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
          nationality: z.string().optional(),
          idNumber: z.string().optional(),
          idType: z.string().optional(),
          // Address
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          postalCode: z.string().optional(),
          // Employment info (non-compensation)
          department: z.string().optional(),
          jobTitle: z.string().optional(),
          // Visa notes (CP can add context)
          visaNotes: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Fetch employee and verify ownership
      const empRows = await db
        .select({
          id: employees.id,
          status: employees.status,
        })
        .from(employees)
        .where(
          and(
            eq(employees.id, input.employeeId),
            eq(employees.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (empRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      const emp = empRows[0];

      // ── EDIT LOCK RULE ──
      // CP can only edit when status is "pending_review" or "documents_incomplete"
      // Once EG starts processing (onboarding, contract_signed, active, etc.), CP is locked out
      const editableStatuses = ["pending_review", "documents_incomplete"];
      if (!editableStatuses.includes(emp.status)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Employee profile is locked (status: ${emp.status}). Only EG Admin can edit after the review process begins.`,
        });
      }

      // Apply update — only non-hard-data fields
      await db
        .update(employees)
        .set(input.data)
        .where(
          and(
            eq(employees.id, input.employeeId),
            eq(employees.channelPartnerId, cpId)
          )
        );

      return { success: true };
    }),

  // ════════════════════════════════════════════════════════════════════
  // DASHBOARD SUMMARY — aggregate stats for CP's client portfolio
  // ════════════════════════════════════════════════════════════════════
  summary: protectedCpProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { totalClients: 0, activeClients: 0, totalEmployees: 0, activeEmployees: 0 };

    const cpId = ctx.cpUser.channelPartnerId;

    const [clientStats, empStats] = await Promise.all([
      db
        .select({
          total: count(),
          active: sql<number>`SUM(CASE WHEN ${customers.status} = 'active' THEN 1 ELSE 0 END)`,
        })
        .from(customers)
        .where(eq(customers.channelPartnerId, cpId)),
      db
        .select({
          total: count(),
          active: sql<number>`SUM(CASE WHEN ${employees.status} = 'active' THEN 1 ELSE 0 END)`,
        })
        .from(employees)
        .where(eq(employees.channelPartnerId, cpId)),
    ]);

    return {
      totalClients: clientStats[0]?.total ?? 0,
      activeClients: Number(clientStats[0]?.active ?? 0),
      totalEmployees: empStats[0]?.total ?? 0,
      activeEmployees: Number(empStats[0]?.active ?? 0),
    };
  }),

  // ════════════════════════════════════════════════════════════════════
  // CLIENT CONTRACTS — CP manages commercial contracts with their clients
  // ════════════════════════════════════════════════════════════════════

  /**
   * List all contracts for a specific client.
   * Scoped: only clients belonging to this CP.
   */
  listContracts: protectedCpProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return [];
      const cpId = ctx.cpUser.channelPartnerId;
      await verifyCpOwnership(db, input.customerId, cpId);
      return await db
        .select()
        .from(customerContracts)
        .where(eq(customerContracts.customerId, input.customerId))
        .orderBy(desc(customerContracts.createdAt));
    }),

  /**
   * Upload / create a contract record for a client.
   * Accepts base64-encoded file content, uploads to S3, and stores the record.
   */
  uploadContract: cpHrProcedure
    .input(
      z.object({
        customerId: z.number(),
        contractName: z.string().min(1),
        contractType: z.string().optional(),
        signedDate: z.string().optional(),
        effectiveDate: z.string().optional(),
        expiryDate: z.string().optional(),
        status: z.enum(["draft", "signed", "expired", "terminated"]).default("draft"),
        // File upload fields
        fileBase64: z.string().optional(),
        fileName: z.string().optional(),
        fileContentType: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const cpId = ctx.cpUser.channelPartnerId;
      await verifyCpOwnership(db, input.customerId, cpId);

      let fileUrl: string | undefined;
      let fileKey: string | undefined;

      // Upload file to S3 if provided
      if (input.fileBase64 && input.fileName) {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() || "pdf";
        const sanitizedName = input.contractName.replace(/[^a-zA-Z0-9]/g, "_");
        const key = `cp-portal/${cpId}/clients/${input.customerId}/contracts/${Date.now()}_${sanitizedName}.${ext}`;
        const result = await storagePut(key, buffer, input.fileContentType || "application/pdf");
        fileUrl = result.url;
        fileKey = result.key;
      }

      const result = await db
        .insert(customerContracts)
        .values({
          customerId: input.customerId,
          contractName: input.contractName,
          contractType: input.contractType,
          fileUrl,
          fileKey,
          signedDate: input.signedDate,
          effectiveDate: input.effectiveDate,
          expiryDate: input.expiryDate,
          status: input.status,
        })
        .returning();

      return result[0];
    }),

  /**
   * Get a signed download URL for a contract file.
   */
  getContractDownloadUrl: protectedCpProcedure
    .input(z.object({ contractId: z.number(), customerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const cpId = ctx.cpUser.channelPartnerId;
      await verifyCpOwnership(db, input.customerId, cpId);

      const contracts = await db
        .select()
        .from(customerContracts)
        .where(
          and(
            eq(customerContracts.id, input.contractId),
            eq(customerContracts.customerId, input.customerId)
          )
        )
        .limit(1);

      if (contracts.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
      }

      const contract = contracts[0];
      if (!contract.fileKey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No file attached to this contract" });
      }

      const signed = await storageGet(contract.fileKey);
      return { url: signed.url };
    }),

  /**
   * Delete a contract record.
   * Only contracts belonging to this CP's clients can be deleted.
   */
  deleteContract: cpHrProcedure
    .input(z.object({ contractId: z.number(), customerId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const cpId = ctx.cpUser.channelPartnerId;
      await verifyCpOwnership(db, input.customerId, cpId);

      // Verify contract belongs to this customer
      const contracts = await db
        .select()
        .from(customerContracts)
        .where(
          and(
            eq(customerContracts.id, input.contractId),
            eq(customerContracts.customerId, input.customerId)
          )
        )
        .limit(1);

      if (contracts.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
      }

      await db.delete(customerContracts).where(eq(customerContracts.id, input.contractId));

      return { success: true };
    }),
});
