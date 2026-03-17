/**
 * Portal Employees Router
 *
 * All queries are SCOPED to ctx.portalUser.customerId.
 * Portal users can view employees and submit onboarding requests.
 * They CANNOT see admin-only fields (internalNotes, cost data, markup).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, like, count, inArray, notInArray, desc } from "drizzle-orm";
import crypto from "crypto";
import {
  protectedPortalProcedure,
  portalHrProcedure,
  portalRouter,
  portalPublicProcedure,
} from "../portalTrpc";
import { getDb, createEmployee, createEmployeeDocument, createContractor } from "../../db";
import { autoInitializeLeavePolicyForCountry } from "../../services/leaveAutoInitService";
import { storagePut } from "../../storage";
import { notificationService } from "../../services/notificationService";
import { sendOnboardingInviteEmail } from "../../services/authEmailService";
import {
  employees,
  employeeContracts,
  employeeDocuments,
  leaveBalances,
  leaveTypes,
  countriesConfig,
  onboardingInvites,
  customers,
} from "../../../drizzle/schema";
import { contractors } from "../../../drizzle/aor-schema";

// Fields visible to portal users — explicitly listed to prevent data leaks
const PORTAL_EMPLOYEE_FIELDS = {
  id: employees.id,
  employeeCode: employees.employeeCode,
  firstName: employees.firstName,
  lastName: employees.lastName,
  email: employees.email,
  phone: employees.phone,
  dateOfBirth: employees.dateOfBirth,
  gender: employees.gender,
  nationality: employees.nationality,
  idType: employees.idType,
  idNumber: employees.idNumber,
  address: employees.address,
  country: employees.country,
  city: employees.city,
  state: employees.state,
  postalCode: employees.postalCode,
  department: employees.department,
  jobTitle: employees.jobTitle,
  serviceType: employees.serviceType,
  employmentType: employees.employmentType,
  startDate: employees.startDate,
  endDate: employees.endDate,
  status: employees.status,
  baseSalary: employees.baseSalary,
  salaryCurrency: employees.salaryCurrency,
  requiresVisa: employees.requiresVisa,
  visaStatus: employees.visaStatus,
  visaExpiryDate: employees.visaExpiryDate,
  visaNotes: employees.visaNotes,
  bankDetails: employees.bankDetails,
  createdAt: employees.createdAt,
  updatedAt: employees.updatedAt,
  // NOTE: estimatedEmployerCost and other internal cost fields are NOT included
} as const;

export const portalEmployeesRouter = portalRouter({
  /**
   * List employees — scoped to customerId
   */
  list: protectedPortalProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        status: z.string().optional(),
        country: z.string().optional(),
        serviceType: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const cid = ctx.portalUser.customerId;

      const conditions = [eq(employees.customerId, cid)];

      if (input.status) {
        conditions.push(eq(employees.status, input.status as any));
      }
      if (input.country) {
        conditions.push(eq(employees.country, input.country));
      }
      if (input.serviceType) {
        conditions.push(eq(employees.serviceType, input.serviceType as any));
      }
      if (input.search) {
        conditions.push(
          sql`(${employees.firstName} LIKE ${`%${input.search}%`} OR ${employees.lastName} LIKE ${`%${input.search}%`} OR ${employees.email} LIKE ${`%${input.search}%`})`
        );
      }

      const where = and(...conditions);

      const [totalResult] = await db
        .select({ count: count() })
        .from(employees)
        .where(where);

      const items = await db
        .select(PORTAL_EMPLOYEE_FIELDS)
        .from(employees)
        .where(where)
        .orderBy(sql`${employees.updatedAt} DESC`)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return {
        items,
        total: totalResult?.count ?? 0,
      };
    }),

  /**
   * Get employee detail — scoped to customerId
   */
  detail: protectedPortalProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      const [emp] = await db
        .select(PORTAL_EMPLOYEE_FIELDS)
        .from(employees)
        .where(and(eq(employees.id, input.id), eq(employees.customerId, cid)));

      if (!emp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      // Get contracts — merge employee_documents (documentType=contract) + employee_contracts
      const contractDocs = await db
        .select({
          id: employeeDocuments.id,
          documentName: employeeDocuments.documentName,
          fileUrl: employeeDocuments.fileUrl,
          mimeType: employeeDocuments.mimeType,
          notes: employeeDocuments.notes,
          uploadedAt: employeeDocuments.uploadedAt,
        })
        .from(employeeDocuments)
        .where(
          and(
            eq(employeeDocuments.employeeId, input.id),
            eq(employeeDocuments.documentType, "contract")
          )
        )
        .orderBy(desc(employeeDocuments.uploadedAt));

      const structuredContracts = await db
        .select({
          id: employeeContracts.id,
          contractType: employeeContracts.contractType,
          fileUrl: employeeContracts.fileUrl,
          signedDate: employeeContracts.signedDate,
          effectiveDate: employeeContracts.effectiveDate,
          expiryDate: employeeContracts.expiryDate,
          status: employeeContracts.status,
        })
        .from(employeeContracts)
        .where(eq(employeeContracts.employeeId, input.id));

      // Merge into unified contracts list
      const contracts: any[] = [];
      for (const doc of contractDocs) {
        contracts.push({
          id: doc.id,
          source: "document",
          contractType: doc.documentName || "Contract",
          fileUrl: doc.fileUrl,
          signedDate: null,
          effectiveDate: null,
          expiryDate: null,
          status: null,
          notes: doc.notes,
          uploadedAt: doc.uploadedAt,
        });
      }
      for (const c of structuredContracts) {
        contracts.push({
          id: c.id,
          source: "contract",
          contractType: c.contractType || "Employment Contract",
          fileUrl: c.fileUrl,
          signedDate: c.signedDate,
          effectiveDate: c.effectiveDate,
          expiryDate: c.expiryDate,
          status: c.status,
          notes: null,
          uploadedAt: null,
        });
      }

      // Get documents — exclude payslip and contract (shown in dedicated tabs)
      const documents = await db
        .select({
          id: employeeDocuments.id,
          documentType: employeeDocuments.documentType,
          documentName: employeeDocuments.documentName,
          fileUrl: employeeDocuments.fileUrl,
          mimeType: employeeDocuments.mimeType,
          uploadedAt: employeeDocuments.uploadedAt,
        })
        .from(employeeDocuments)
        .where(
          and(
            eq(employeeDocuments.employeeId, input.id),
            notInArray(employeeDocuments.documentType, ["payslip", "contract"])
          )
        );

      // Get leave balances with leave type names and gender applicability
      const balances = await db
        .select({
          id: leaveBalances.id,
          leaveTypeId: leaveBalances.leaveTypeId,
          leaveTypeName: leaveTypes.leaveTypeName,
          applicableGender: leaveTypes.applicableGender,
          year: leaveBalances.year,
          totalEntitlement: leaveBalances.totalEntitlement,
          used: leaveBalances.used,
          remaining: leaveBalances.remaining,
        })
        .from(leaveBalances)
        .leftJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
        .where(eq(leaveBalances.employeeId, input.id));

      return {
        ...emp,
        contracts,
        documents,
        leaveBalances: balances,
      };
    }),

  /**
   * Submit new employee onboarding request
   * Only HR managers and admins can do this
   */
  submitOnboarding: portalHrProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        dateOfBirth: z.string().optional(),
        gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
        nationality: z.string().optional(),
        idType: z.string().optional(),
        idNumber: z.string().optional(),
        address: z.string().optional(),
        country: z.string().min(1),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        department: z.string().optional(),
        jobTitle: z.string().min(1),
        serviceType: z.enum(["eor", "visa_eor"]).default("eor"),
        employmentType: z.enum(["fixed_term", "long_term"]).default("long_term"),
        startDate: z.string().min(1),
        endDate: z.string().optional(),
        baseSalary: z.string().min(1),
        salaryCurrency: z.string().default("USD"),
        requiresVisa: z.boolean().default(false),
        bankDetails: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Email uniqueness check: no active employee with same email under this customer
      const normalizedEmail = input.email.toLowerCase().trim();
      const [existingEmployee] = await db
        .select({ id: employees.id, status: employees.status })
        .from(employees)
        .where(
          and(
            eq(employees.customerId, cid),
            eq(employees.email, normalizedEmail)
          )
        );
      if (existingEmployee && existingEmployee.status !== "terminated") {
        throw new TRPCError({ code: "CONFLICT", message: `An active employee with email "${normalizedEmail}" already exists.` });
      }

      // Auto-detect Visa EOR: if nationality differs from employment country, upgrade to visa_eor
      let serviceType = input.serviceType;
      let requiresVisa = input.requiresVisa;
      if (input.nationality && input.country) {
        const natUpper = input.nationality.toUpperCase();
        const countryUpper = input.country.toUpperCase();
        if (natUpper !== countryUpper) {
          requiresVisa = true;
          if (serviceType === "eor") {
            serviceType = "visa_eor";
          }
        }
      }
      if (serviceType === "visa_eor") {
        requiresVisa = true;
      }

      const result = await createEmployee({
        customerId: cid,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone || null,
        dateOfBirth: (input.dateOfBirth || null) as any,
        gender: input.gender || null,
        nationality: input.nationality || null,
        idType: input.idType || null,
        idNumber: input.idNumber || null,
        address: input.address || null,
        country: input.country,
        city: input.city || null,
        state: input.state || null,
        postalCode: input.postalCode || null,
        department: input.department || null,
        jobTitle: input.jobTitle,
        serviceType: serviceType,
        employmentType: input.employmentType,
        startDate: input.startDate as any,
        endDate: (input.endDate || null) as any,
        baseSalary: input.baseSalary,
        salaryCurrency: input.salaryCurrency,
        requiresVisa: requiresVisa,
        bankDetails: input.bankDetails || null,
        status: "pending_review",
      });

      // Auto-initialize leave policies for the employee's country (if not already configured)
      try {
        await autoInitializeLeavePolicyForCountry(cid, input.country);
      } catch (e) {
        console.error("Failed to auto-initialize leave policy:", e);
      }

      // Submit notification for new employee request
      const [customer] = await db.select({ companyName: customers.companyName }).from(customers).where(eq(customers.id, cid));
      
      notificationService.send({
        type: "new_employee_request",
        data: {
          customerName: customer?.companyName || "Unknown Customer",
          employeeName: `${input.firstName} ${input.lastName}`,
          serviceType: input.serviceType,
          startDate: input.startDate
        }
      }).catch(err => console.error("Failed to send new employee notification:", err));

      return { success: true, employeeId: result[0]?.id };
    }),

  /**
   * Upload document for an employee
   * Only HR managers and admins can do this
   */
  uploadDocument: portalHrProcedure
    .input(
      z.object({
        employeeId: z.number(),
        documentType: z.enum(["resume", "passport", "national_id", "work_permit", "visa", "contract", "education", "payslip", "reimbursement_receipt", "other"]),
        documentName: z.string().min(1),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("application/pdf"),
        fileSize: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Verify the employee belongs to this customer
      const [emp] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.customerId, cid)));

      if (!emp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `employee-docs/${input.employeeId}/${input.documentType}/${randomSuffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

      await createEmployeeDocument({
        employeeId: input.employeeId,
        documentType: input.documentType,
        documentName: input.documentName,
        fileUrl: url,
        fileKey: fileKey,
        mimeType: input.mimeType,
        fileSize: input.fileSize || fileBuffer.length,
      });

      return { success: true, url };
    }),

  /**
   * Get available countries for onboarding
   */
  availableCountries: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const countries = await db
      .select({
        countryCode: countriesConfig.countryCode,
        countryName: countriesConfig.countryName,
        currency: countriesConfig.localCurrency,
      })
      .from(countriesConfig)
      .where(eq(countriesConfig.isActive, true))
      .orderBy(countriesConfig.countryName);

    return countries;
  }),

  /**
   * Get leave types for a specific country
   */
  leaveTypesByCountry: protectedPortalProcedure
    .input(z.object({ countryCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const types = await db
        .select({
          id: leaveTypes.id,
          leaveTypeName: leaveTypes.leaveTypeName,
          annualEntitlement: leaveTypes.annualEntitlement,
          isPaid: leaveTypes.isPaid,
          requiresApproval: leaveTypes.requiresApproval,
          applicableGender: leaveTypes.applicableGender,
        })
        .from(leaveTypes)
        .where(eq(leaveTypes.countryCode, input.countryCode));

      return types;
    }),

  /**
   * Send self-service onboarding invite to an employee
   * The employee will receive a link to fill in their own information
   */
  sendOnboardingInvite: portalHrProcedure
    .input(
      z.object({
        employeeName: z.string().min(1),
        employeeEmail: z.string().email(),
        // Employer-provided fields from invite flow step 2
        serviceType: z.enum(["eor", "visa_eor", "aor"]).default("eor"),
        country: z.string().optional(),
        jobTitle: z.string().optional(),
        department: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        employmentType: z.string().optional(),
        baseSalary: z.string().optional(),
        salaryCurrency: z.string().optional(),
        paymentFrequency: z.string().optional(),
        rateAmount: z.string().optional(),
        contractorCurrency: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Email uniqueness check: no pending invite with same email under this customer
      const normalizedEmail = input.employeeEmail.toLowerCase().trim();
      const [existingPendingInvite] = await db
        .select({ id: onboardingInvites.id })
        .from(onboardingInvites)
        .where(
          and(
            eq(onboardingInvites.customerId, cid),
            eq(onboardingInvites.employeeEmail, normalizedEmail),
            eq(onboardingInvites.status, "pending")
          )
        );
      if (existingPendingInvite) {
        throw new TRPCError({ code: "CONFLICT", message: "An invitation is already pending for this email address." });
      }

      // Email uniqueness check: for AOR, check contractors table; for EOR, check employees table
      if (input.serviceType === "aor") {
        const [existingContractor] = await db
          .select({ id: contractors.id, status: contractors.status })
          .from(contractors)
          .where(
            and(
              eq(contractors.customerId, cid),
              eq(contractors.email, normalizedEmail)
            )
          );
        if (existingContractor && existingContractor.status !== "terminated") {
          throw new TRPCError({ code: "CONFLICT", message: "An active contractor with this email already exists." });
        }
      } else {
        const [existingEmployee] = await db
          .select({ id: employees.id, status: employees.status })
          .from(employees)
          .where(
            and(
              eq(employees.customerId, cid),
              eq(employees.email, normalizedEmail)
            )
          );
        if (existingEmployee && existingEmployee.status !== "terminated") {
          throw new TRPCError({ code: "CONFLICT", message: "An active employee with this email already exists." });
        }
      }

      // Generate a unique token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

      await db.insert(onboardingInvites).values({
        customerId: cid,
        employeeName: input.employeeName,
        employeeEmail: input.employeeEmail,
        token,
        status: "pending",
        expiresAt,
        createdBy: ctx.portalUser.contactId,
        // Employer-provided fields
        serviceType: input.serviceType,
        country: input.country || null,
        jobTitle: input.jobTitle || null,
        department: input.department || null,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        employmentType: input.employmentType || null,
        baseSalary: input.baseSalary || null,
        salaryCurrency: input.salaryCurrency || null,
        paymentFrequency: input.paymentFrequency || null,
        rateAmount: input.rateAmount || null,
        contractorCurrency: input.contractorCurrency || null,
      });

      // Send onboarding invite email
      try {
        const custRows = await db
          .select({ companyName: customers.companyName })
          .from(customers)
          .where(eq(customers.id, cid))
          .limit(1);
        const companyName = custRows[0]?.companyName || "Your Company";

        const portalOrigin = process.env.PORTAL_APP_URL || "https://app.extendglobal.ai";
        const inviteUrl = `${portalOrigin}/self-onboarding?token=${token}`;

        await sendOnboardingInviteEmail({
          to: input.employeeEmail,
          employeeName: input.employeeName,
          companyName,
          inviteUrl,
        });
      } catch (err) {
        console.error("[PortalEmployees] Failed to send onboarding invite email:", err);
      }

      return { success: true, token };
    }),

  /**
   * List onboarding invites for this customer
   */
  listOnboardingInvites: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const cid = ctx.portalUser.customerId;

    const invites = await db
      .select({
        id: onboardingInvites.id,
        employeeName: onboardingInvites.employeeName,
        employeeEmail: onboardingInvites.employeeEmail,
        token: onboardingInvites.token,
        status: onboardingInvites.status,
        serviceType: onboardingInvites.serviceType,
        employeeId: onboardingInvites.employeeId,
        contractorId: onboardingInvites.contractorId,
        expiresAt: onboardingInvites.expiresAt,
        completedAt: onboardingInvites.completedAt,
        createdAt: onboardingInvites.createdAt,
      })
      .from(onboardingInvites)
      .where(eq(onboardingInvites.customerId, cid))
      .orderBy(sql`${onboardingInvites.createdAt} DESC`);

    return invites;
  }),

  /**
   * Resend an onboarding invite (regenerate token + extend expiry)
   */
  resendOnboardingInvite: portalHrProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Verify invite belongs to this customer and is pending
      const [invite] = await db
        .select()
        .from(onboardingInvites)
        .where(
          and(
            eq(onboardingInvites.id, input.id),
            eq(onboardingInvites.customerId, cid),
            eq(onboardingInvites.status, "pending")
          )
        );

      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found or not pending" });
      }

      // Generate new token and extend expiry by 72 hours
      const newToken = crypto.randomBytes(32).toString("hex");
      const newExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

      await db
        .update(onboardingInvites)
        .set({ token: newToken, expiresAt: newExpiresAt })
        .where(eq(onboardingInvites.id, input.id));

      // Resend onboarding invite email
      try {
        const custRows = await db
          .select({ companyName: customers.companyName })
          .from(customers)
          .where(eq(customers.id, cid))
          .limit(1);
        const companyName = custRows[0]?.companyName || "Your Company";

        const portalOrigin = process.env.PORTAL_APP_URL || "https://app.extendglobal.ai";
        const inviteUrl = `${portalOrigin}/self-onboarding?token=${newToken}`;

        await sendOnboardingInviteEmail({
          to: invite.employeeEmail,
          employeeName: invite.employeeName,
          companyName,
          inviteUrl,
        });
      } catch (err) {
        console.error("[PortalEmployees] Failed to resend onboarding invite email:", err);
      }

      return { success: true, token: newToken };
    }),

  /**
   * Cancel an onboarding invite
   */
  cancelOnboardingInvite: portalHrProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      await db
        .update(onboardingInvites)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(onboardingInvites.id, input.id),
            eq(onboardingInvites.customerId, cid),
            eq(onboardingInvites.status, "pending")
          )
        );

      return { success: true };
    }),

  /**
   * Validate self-service onboarding token (public — no auth required)
   */
  validateOnboardingToken: portalPublicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [invite] = await db
        .select({
          id: onboardingInvites.id,
          employeeName: onboardingInvites.employeeName,
          employeeEmail: onboardingInvites.employeeEmail,
          status: onboardingInvites.status,
          expiresAt: onboardingInvites.expiresAt,
          customerId: onboardingInvites.customerId,
          serviceType: onboardingInvites.serviceType,
          country: onboardingInvites.country,
          jobTitle: onboardingInvites.jobTitle,
          department: onboardingInvites.department,
          startDate: onboardingInvites.startDate,
          endDate: onboardingInvites.endDate,
          employmentType: onboardingInvites.employmentType,
          baseSalary: onboardingInvites.baseSalary,
          salaryCurrency: onboardingInvites.salaryCurrency,
          paymentFrequency: onboardingInvites.paymentFrequency,
          rateAmount: onboardingInvites.rateAmount,
          contractorCurrency: onboardingInvites.contractorCurrency,
        })
        .from(onboardingInvites)
        .where(eq(onboardingInvites.token, input.token));

      if (!invite) {
        return { valid: false, reason: "Invalid invite link" };
      }
      if (invite.status !== "pending") {
        return { valid: false, reason: invite.status === "completed" ? "This form has already been submitted" : "This invite has been cancelled or expired" };
      }
      if (new Date(invite.expiresAt) < new Date()) {
        // Auto-expire
        await db
          .update(onboardingInvites)
          .set({ status: "expired" })
          .where(eq(onboardingInvites.id, invite.id));
        return { valid: false, reason: "This invite link has expired" };
      }

      return {
        valid: true,
        employeeName: invite.employeeName,
        employeeEmail: invite.employeeEmail,
        serviceType: invite.serviceType,
        country: invite.country,
        jobTitle: invite.jobTitle,
        department: invite.department,
        startDate: invite.startDate,
        endDate: invite.endDate,
        employmentType: invite.employmentType,
        baseSalary: invite.baseSalary,
        salaryCurrency: invite.salaryCurrency,
        paymentFrequency: invite.paymentFrequency,
        rateAmount: invite.rateAmount,
        contractorCurrency: invite.contractorCurrency,
      };
    }),

  /**
   * Submit self-service onboarding form (public — no auth required)
   * Employee fills in their own information
   */
  submitSelfServiceOnboarding: portalPublicProcedure
    .input(
      z.object({
        token: z.string(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        dateOfBirth: z.string().optional(),
        gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
        nationality: z.string().optional(),
        idType: z.string().optional(),
        idNumber: z.string().optional(),
        address: z.string().optional(),
        country: z.string().min(1),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        jobTitle: z.string().min(1),
        department: z.string().optional(),
        startDate: z.string().min(1),
        bankDetails: z.any().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Validate the token
      const [invite] = await db
        .select()
        .from(onboardingInvites)
        .where(
          and(
            eq(onboardingInvites.token, input.token),
            eq(onboardingInvites.status, "pending")
          )
        );

      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired invite" });
      }

      if (new Date(invite.expiresAt) < new Date()) {
        await db
          .update(onboardingInvites)
          .set({ status: "expired" })
          .where(eq(onboardingInvites.id, invite.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invite has expired" });
      }

      // Email uniqueness check: no active employee/contractor with same email under this customer
      const normalizedEmail = input.email.toLowerCase().trim();
      const [existingEmployee] = await db
        .select({ id: employees.id, status: employees.status })
        .from(employees)
        .where(
          and(
            eq(employees.customerId, invite.customerId),
            eq(employees.email, normalizedEmail)
          )
        );
      if (existingEmployee && existingEmployee.status !== "terminated") {
        throw new TRPCError({ code: "CONFLICT", message: "An employee with this email already exists in the system." });
      }

      // Use employer-provided data from invite, with worker input as fallback
      let serviceType = invite.serviceType || "eor";
      const country = invite.country || input.country;
      const jobTitle = invite.jobTitle || input.jobTitle;
      const department = invite.department || input.department;
      const startDate = invite.startDate || input.startDate;

      // Auto-detect Visa EOR: if nationality differs from employment country, upgrade to visa_eor
      let requiresVisa = false;
      if (input.nationality && country && input.nationality !== country && serviceType === "eor") {
        serviceType = "visa_eor";
        requiresVisa = true;
      }

      if (serviceType === "aor") {
        // Bug 11: Generate contractorCode for AOR self-onboarding
        const existingContractors = await db
          .select({ id: contractors.id })
          .from(contractors);
        const nextNum = existingContractors.length + 1;
        const contractorCode = `CTR-${String(nextNum).padStart(4, "0")}`;

        // AOR: Create contractor record
        const result = await createContractor({
          contractorCode,
          customerId: invite.customerId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone || null,
          dateOfBirth: (input.dateOfBirth || null) as any,
          nationality: input.nationality || null,
          idType: input.idType || null,
          idNumber: input.idNumber || null,
          address: input.address || null,
          country,
          city: input.city || null,
          state: input.state || null,
          postalCode: input.postalCode || null,
          department: department || null,
          jobTitle,
          startDate: startDate as any,
          endDate: invite.endDate || null,
          currency: invite.contractorCurrency || "USD",
          paymentFrequency: (invite.paymentFrequency as any) || "monthly",
          rateType: invite.paymentFrequency === "milestone" ? "milestone_only" : "fixed_monthly",
          rateAmount: invite.rateAmount || null,
          bankDetails: input.bankDetails ? input.bankDetails : null,
          status: "pending_review",
        });

        const contractorId = (result as any)[0]?.id;

        // Update the invite
        await db
          .update(onboardingInvites)
          .set({
            status: "completed",
            contractorId,
            completedAt: new Date(),
          })
          .where(eq(onboardingInvites.id, invite.id));

        // Send onboarding completed notification for contractor
        notificationService.send({
          type: "employee_onboarding_completed",
          customerId: invite.customerId,
          data: {
            employeeName: `${input.firstName} ${input.lastName}`,
            position: jobTitle,
            country: country,
            startDate: startDate,
          }
        }).catch(err => console.error("Failed to send onboarding completed notification:", err));

        return { success: true, contractorId };
      } else {
        // EOR / Visa EOR: Create employee record
        const result = await createEmployee({
          customerId: invite.customerId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone || null,
          dateOfBirth: (input.dateOfBirth || null) as any,
          gender: input.gender || null,
          nationality: input.nationality || null,
          idType: input.idType || null,
          idNumber: input.idNumber || null,
          address: input.address || null,
          country,
          city: input.city || null,
          state: input.state || null,
          postalCode: input.postalCode || null,
          department: department || null,
          jobTitle,
          serviceType: serviceType as any,
          employmentType: (invite.employmentType as any) || "long_term",
          startDate: startDate as any,
          endDate: invite.endDate || null,
          baseSalary: invite.baseSalary || "0",
          salaryCurrency: invite.salaryCurrency || "USD",
          requiresVisa,
          bankDetails: input.bankDetails || null,
          status: "pending_review",
        });

        const employeeId = (result as any)[0]?.id;

        // Auto-initialize leave policies for the employee's country (if not already configured)
        try {
          await autoInitializeLeavePolicyForCountry(invite.customerId, country);
        } catch (e) {
          console.error("Failed to auto-initialize leave policy:", e);
        }

        // Update the invite
        await db
          .update(onboardingInvites)
          .set({
            status: "completed",
            employeeId,
            completedAt: new Date(),
          })
          .where(eq(onboardingInvites.id, invite.id));

        // Send onboarding completed notification to client HR + EG admin
        notificationService.send({
          type: "employee_onboarding_completed",
          customerId: invite.customerId,
          data: {
            employeeName: `${input.firstName} ${input.lastName}`,
            position: jobTitle,
            country: country,
            startDate: startDate,
          }
        }).catch(err => console.error("Failed to send onboarding completed notification:", err));

        return { success: true, employeeId };
      }
    }),

  /**
   * Upload document for self-service onboarding (public — uses token)
   */
  uploadSelfServiceDocument: portalPublicProcedure
    .input(
      z.object({
        token: z.string(),
        employeeId: z.number(),
        documentType: z.enum(["resume", "passport", "national_id", "work_permit", "visa", "contract", "education", "payslip", "reimbursement_receipt", "other"]),
        documentName: z.string().min(1),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("application/pdf"),
        fileSize: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Validate the token and that it was completed with this employeeId
      const [invite] = await db
        .select()
        .from(onboardingInvites)
        .where(
          and(
            eq(onboardingInvites.token, input.token),
            eq(onboardingInvites.employeeId, input.employeeId)
          )
        );

      if (!invite) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Invalid token or employee" });
      }

      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `employee-docs/${input.employeeId}/${input.documentType}/${randomSuffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

      await createEmployeeDocument({
        employeeId: input.employeeId,
        documentType: input.documentType,
        documentName: input.documentName,
        fileUrl: url,
        fileKey: fileKey,
        mimeType: input.mimeType,
        fileSize: input.fileSize || fileBuffer.length,
      });

      return { success: true, url };
    }),

  /**
   * Delete an employee — only allowed for pending_review status
   * Only HR managers and admins can do this
   */
  delete: portalHrProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Verify the employee belongs to this customer and is in pending_review
      const [emp] = await db
        .select({ id: employees.id, status: employees.status })
        .from(employees)
        .where(and(eq(employees.id, input.id), eq(employees.customerId, cid)));

      if (!emp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      if (emp.status !== "pending_review") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only employees in pending review status can be deleted",
        });
      }

      // Delete related records first
      await db.delete(employeeDocuments).where(eq(employeeDocuments.employeeId, input.id));
      await db.delete(employeeContracts).where(eq(employeeContracts.employeeId, input.id));
      await db.delete(leaveBalances).where(eq(leaveBalances.employeeId, input.id));
      await db.delete(employees).where(eq(employees.id, input.id));

      return { success: true };
    }),

  /**
   * Request termination for an active employee.
   * Portal clients can request termination; admin receives notification to process.
   * Only available for employees in 'active' status.
   */
  requestTermination: portalHrProcedure
    .input(
      z.object({
        employeeId: z.number(),
        endDate: z.string().min(1, "End date is required"),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const cid = ctx.portalUser.customerId;

      // Verify the employee belongs to this customer and is active
      const [emp] = await db
        .select({
          id: employees.id,
          status: employees.status,
          firstName: employees.firstName,
          lastName: employees.lastName,
          employeeCode: employees.employeeCode,
          country: employees.country,
        })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.customerId, cid)));

      if (!emp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      if (emp.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only active employees can be submitted for termination request",
        });
      }

      // Get customer name for notification
      const [customer] = await db
        .select({ companyName: customers.companyName })
        .from(customers)
        .where(eq(customers.id, cid));

      // Send notification to admin
      notificationService.send({
        type: "employee_termination_request",
        customerId: cid,
        data: {
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          employeeCode: emp.employeeCode,
          country: emp.country,
          requestedEndDate: input.endDate,
          reason: input.reason || "No reason provided",
          requestedBy: ctx.portalUser.contactName || ctx.portalUser.email,
          customerName: customer?.companyName || "Unknown",
        },
      }).catch(err => console.error("Failed to send termination request notification:", err));

      return { success: true, message: "Termination request submitted. Admin will review and process." };
    }),
});
