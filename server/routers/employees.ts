import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import { customerManagerProcedure, userProcedure } from "../procedures";
import {
  createEmployee,
  getEmployeeById,
  listEmployees,
  updateEmployee,
  getEmployeeCountByStatus,
  getEmployeeCountByCountry,
  logAuditAction,
  listEmployeeDocuments,
  createEmployeeDocument,
  deleteEmployeeDocument,
  getEmployeeDocumentById,
  listEmployeeContracts,
  createEmployeeContractRecord,
  updateEmployeeContract,
  deleteEmployeeContract,
  listPayrollItemsByEmployee,
  listLeaveBalances,
  createLeaveBalance,
  updateLeaveBalance,
  deleteLeaveBalance,
  initializeLeaveBalancesForEmployee,
  listLeaveTypesByCountry,
  listAdjustments,
  getCountryConfig,
  hasDepositBeenProcessed,
  getDb,
} from "../db";
import { storagePut, storageGet, storageDownload } from "../storage";
import { generateDepositInvoice } from "../services/depositInvoiceService";
import { generateDepositRefund } from "../services/depositRefundService";
import { generateVisaServiceInvoice } from "../services/visaServiceInvoiceService";
import { autoInitializeLeavePolicyForCountry } from "../services/leaveAutoInitService";
import { onboardingInvites, customers, workerUsers } from "../../drizzle/schema";
import { provisionWorkerUser, resendWorkerInvite } from "../services/workerProvisioningService";
import { eq, desc, and, sql } from "drizzle-orm";


export const employeesRouter = router({
  list: userProcedure
    .input(
      z.object({
        customerId: z.number().optional(),
        status: z.string().optional(),
        country: z.string().optional(),
        serviceType: z.string().optional(),
        search: z.string().optional(),
        channelPartnerId: z.number().nullable().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const page = Math.floor(input.offset / input.limit) + 1;
      return await listEmployees({
        page,
        pageSize: input.limit,
        customerId: input.customerId,
        status: input.status,
        country: input.country,
        serviceType: input.serviceType,
        search: input.search,
        channelPartnerId: input.channelPartnerId,
      });
    }),

  get: userProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getEmployeeById(input.id);
    }),

  create: customerManagerProcedure
    .input(
      z.object({
        customerId: z.number(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        dateOfBirth: z.string().optional(),
        gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
        nationality: z.string().optional(),
        idNumber: z.string().optional(),
        idType: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string(),
        postalCode: z.string().optional(),
        department: z.string().optional(),
        jobTitle: z.string(),
        serviceType: z.enum(["eor", "visa_eor"]).default("eor"),
        employmentType: z.enum(["fixed_term", "long_term"]).default("long_term"),
        startDate: z.string(),
        endDate: z.string().optional(),
        baseSalary: z.string(),
        salaryCurrency: z.string().default("USD"),
        estimatedEmployerCost: z.string().optional(),
        requiresVisa: z.boolean().default(false),
        bankDetails: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // === Email uniqueness check (same customer) ===
      const normalizedEmail = input.email.toLowerCase().trim();
      const existingByEmail = await listEmployees({
        customerId: input.customerId,
        search: normalizedEmail,
        pageSize: 100
      });
      const emailDuplicate = existingByEmail.data.find(
        (e: any) => e.email?.toLowerCase() === normalizedEmail && e.status !== 'terminated'
      );
      if (emailDuplicate) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `An active employee with email "${normalizedEmail}" already exists under this customer (${emailDuplicate.employeeCode}).`,
        });
      }

      // === Date Validation ===
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(input.startDate);
      if (startDate < today) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Start date cannot be earlier than today." });
      }
      if (input.endDate) {
        const endDate = new Date(input.endDate);
        if (endDate <= startDate) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: "Contract end date must be after the start date." });
        }
      }

      // Auto-detect visa requirement and service type: if nationality differs from work country
      let requiresVisa = input.requiresVisa;
      let serviceType = input.serviceType;
      if (input.nationality && input.country) {
        const natUpper = input.nationality.toUpperCase();
        const countryUpper = input.country.toUpperCase();
        if (natUpper !== countryUpper) {
          requiresVisa = true;
          // Auto-switch to visa_eor when nationality != employment country (unless AOR)
          if (serviceType === "eor") {
            serviceType = "visa_eor";
          }
        }
      }

      // If service type is visa_eor, always requires visa
      if (serviceType === "visa_eor") {
        requiresVisa = true;
      }

      // Auto-lock salary currency to country's legal currency
      let salaryCurrency = input.salaryCurrency;
      const countryConfig = await getCountryConfig(input.country);
      if (countryConfig) {
        salaryCurrency = countryConfig.localCurrency;
      }

      const result = await createEmployee({
        ...input,
        email: normalizedEmail,
        serviceType,
        salaryCurrency,
        requiresVisa,
        startDate: input.startDate,
        endDate: input.endDate,
        dateOfBirth: input.dateOfBirth,
        status: "pending_review",
        visaStatus: requiresVisa ? "pending_application" : "not_required",
      });

      // Auto-initialize leave policies for the employee's country (if not already configured)
      const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
      if (insertId && input.country) {
        try {
          await autoInitializeLeavePolicyForCountry(input.customerId, input.country);
        } catch (e) {
          console.error("Failed to auto-initialize leave policy:", e);
        }
      }
      // NOTE: Leave balances are NOT created here.
      // They will be initialized when the employee transitions to 'active' status.

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "create",
        entityType: "employee",
        changes: JSON.stringify(input),
      });

      return result;
    }),

  update: customerManagerProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          dateOfBirth: z.string().optional(),
          gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
          nationality: z.string().optional(),
          idNumber: z.string().optional(),
          idType: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          postalCode: z.string().optional(),
          department: z.string().optional(),
          jobTitle: z.string().optional(),
          serviceType: z.enum(["eor", "visa_eor"]).optional(),
          employmentType: z.enum(["fixed_term", "long_term"]).optional(),
          baseSalary: z.string().optional(),
          salaryCurrency: z.string().optional(),
          estimatedEmployerCost: z.string().optional(),
          // Allow any status transition (rollback capability)
          status: z.enum(["pending_review", "documents_incomplete", "onboarding", "contract_signed", "active", "on_leave", "offboarding", "terminated"]).optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          requiresVisa: z.boolean().optional(),
          visaStatus: z.enum(["not_required", "pending_application", "application_submitted", "approved", "rejected", "expired"]).optional(),
          visaExpiryDate: z.string().optional(),
          visaNotes: z.string().optional(),
          bankDetails: z.any().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // === Date Validation on update ===
      if (input.data.endDate && input.data.startDate) {
        if (new Date(input.data.endDate) <= new Date(input.data.startDate)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: "Contract end date must be after the start date." });
        }
      } else if (input.data.endDate) {
        // If only endDate is being updated, compare against existing startDate
        const existing = await getEmployeeById(input.id);
        if (existing?.startDate && new Date(input.data.endDate) <= new Date(existing.startDate)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: "Contract end date must be after the start date." });
        }
      }
      if (input.data.visaExpiryDate) {
        const visaDate = new Date(input.data.visaExpiryDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (visaDate < today) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: "Visa expiry date cannot be in the past." });
        }
      }

      const updateData: any = { ...input.data };
      // Handle date fields: keep as strings (YYYY-MM-DD), remove empty strings to avoid SQL errors
      if (input.data.startDate === "") {
        delete updateData.startDate;
      }
      if (input.data.endDate === "") {
        delete updateData.endDate;
      }
      if (input.data.dateOfBirth === "") {
        delete updateData.dateOfBirth;
      }
      if (input.data.visaExpiryDate === "") {
        delete updateData.visaExpiryDate;
      }

      // Prevent manual currency override (currency is always derived from country)
      delete updateData.salaryCurrency;

      // Handle estimatedEmployerCost: remove empty string to avoid SQL errors
      if (updateData.estimatedEmployerCost === "") {
        delete updateData.estimatedEmployerCost;
      }

      // If country changes, auto-update salary currency to new country's legal currency
      if (input.data.country) {
        const countryConfig = await getCountryConfig(input.data.country);
        if (countryConfig) {
          updateData.salaryCurrency = countryConfig.localCurrency;
        }
      }

      // Check if status is changing — fetch previous status for transition logic
      const isTransitioningToOnboarding = input.data.status === "onboarding";
      const isTransitioningToOffboarding = input.data.status === "offboarding";
      const isTransitioningToTerminated = input.data.status === "terminated";
      const isReactivating = input.data.status && ["active", "onboarding", "contract_signed"].includes(input.data.status);
      let previousStatus: string | undefined;
      if (input.data.status) {
        const currentEmp = await getEmployeeById(input.id);
        previousStatus = currentEmp?.status;

        // Validation: transitioning to offboarding requires endDate
        if (isTransitioningToOffboarding) {
          const effectiveEndDate = input.data.endDate || currentEmp?.endDate;
          if (!effectiveEndDate) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'End date (last working day) is required when starting offboarding.',
            });
          }
        }

        // Validation: transitioning to terminated sets endDate to today if not provided
        if (isTransitioningToTerminated && previousStatus !== "terminated") {
          const effectiveEndDate = input.data.endDate || currentEmp?.endDate;
          if (!effectiveEndDate) {
            // Auto-set endDate to today for immediate termination
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            updateData.endDate = todayStr;
          }
        }
      }

      await updateEmployee(input.id, updateData);

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update",
        entityType: "employee",
        entityId: input.id,
        changes: JSON.stringify(input.data),
      });

      // Auto-generate deposit invoice when employee transitions to onboarding
      let depositInvoiceResult: { invoiceId: number | null; message: string } | undefined;
      if (isTransitioningToOnboarding && previousStatus !== "onboarding") {
        depositInvoiceResult = await generateDepositInvoice(input.id);
        if (depositInvoiceResult.invoiceId) {
          await logAuditAction({
            userId: ctx.user.id, userName: ctx.user.name || null,
            action: "generate",
            entityType: "invoice",
            entityId: depositInvoiceResult.invoiceId,
            changes: JSON.stringify({ type: "deposit", employeeId: input.id, trigger: "onboarding_transition" }),
          });
        }
      }

      // Auto-generate deposit refund when employee transitions to terminated
      let depositRefundResult: { invoiceId: number | null; message: string } | undefined;
      if (isTransitioningToTerminated && previousStatus !== "terminated") {
        depositRefundResult = await generateDepositRefund(input.id);
        if (depositRefundResult.invoiceId) {
          await logAuditAction({
            userId: ctx.user.id, userName: ctx.user.name || null,
            action: "generate",
            entityType: "invoice",
            entityId: depositRefundResult.invoiceId,
            changes: JSON.stringify({ type: "deposit_refund", employeeId: input.id, trigger: "termination" }),
          });
        }
      }

      // Auto-generate new deposit invoice when employee reactivates from terminated
      // and their previous deposit was refunded or credited
      let reactivationDepositResult: { invoiceId: number | null; message: string } | undefined;
      if (
        previousStatus === "terminated" &&
        input.data.status &&
        ["active", "onboarding", "contract_signed"].includes(input.data.status)
      ) {
        const depositStatus = await hasDepositBeenProcessed(input.id);
        if (depositStatus.processed) {
          reactivationDepositResult = await generateDepositInvoice(input.id);
          if (reactivationDepositResult.invoiceId) {
            await logAuditAction({
              userId: ctx.user.id, userName: ctx.user.name || null,
              action: "generate",
              entityType: "invoice",
              entityId: reactivationDepositResult.invoiceId,
              changes: JSON.stringify({
                type: "deposit",
                employeeId: input.id,
                trigger: "reactivation_from_terminated",
                previousDepositProcessed: depositStatus.processed,
              }),
            });
          }
        }
      }

      // Auto-generate visa service invoice when visa status changes to application_submitted
      // This now properly handles:
      // - First time reaching application_submitted → create invoice
      // - Status rolled back then re-submitted → check if invoice already exists
      //   - If existing invoice is draft/cancelled → delete and recreate
      //   - If existing invoice is sent/paid → skip (already billed)
      let visaServiceResult: { invoiceId: number | null; message: string } | undefined;
      if (input.data.visaStatus === "application_submitted") {
        const currentEmpForVisa = await getEmployeeById(input.id);
        if (currentEmpForVisa?.serviceType === "visa_eor") {
          // Check if a visa service invoice already exists for this employee
          const { getDb } = await import("../db");
          const db = await getDb();
          if (db) {
            const { invoices: invoicesTable, invoiceItems: invoiceItemsTable } = await import("../../drizzle/schema");
            const { eq, and } = await import("drizzle-orm");
            const existingVisaInvoices = await db
              .select()
              .from(invoicesTable)
              .where(
                and(
                  eq(invoicesTable.invoiceType, "visa_service"),
                  eq(invoicesTable.customerId, currentEmpForVisa.customerId)
                )
              );

            // Find visa invoices linked to this employee via invoice items
            let hasActiveBilledInvoice = false;
            for (const inv of existingVisaInvoices) {
              const items = await db
                .select()
                .from(invoiceItemsTable)
                .where(
                  and(
                    eq(invoiceItemsTable.invoiceId, inv.id),
                    eq(invoiceItemsTable.employeeId, input.id)
                  )
                );
              if (items.length > 0) {
                // Found a visa invoice for this employee
                if (inv.status === "sent" || inv.status === "paid" || inv.status === "pending_review") {
                  // Already billed, don't recreate
                  hasActiveBilledInvoice = true;
                  visaServiceResult = { invoiceId: null, message: "Visa service invoice already exists and is billed" };
                  break;
                } else if (inv.status === "draft" || inv.status === "cancelled") {
                  // Delete the old draft/cancelled invoice so we can recreate
                  await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, inv.id));
                  await db.delete(invoicesTable).where(eq(invoicesTable.id, inv.id));
                }
              }
            }

            if (!hasActiveBilledInvoice) {
              visaServiceResult = await generateVisaServiceInvoice(input.id);
              if (visaServiceResult.invoiceId) {
                await logAuditAction({
                  userId: ctx.user.id, userName: ctx.user.name || null,
                  action: "generate",
                  entityType: "invoice",
                  entityId: visaServiceResult.invoiceId,
                  changes: JSON.stringify({ type: "visa_service", employeeId: input.id, trigger: "visa_application_submitted" }),
                });
              }
            }
          }
        }
      }

      // Auto-initialize leave balances when employee transitions to active
      // Annual leave starts at 0 and accrues monthly via cron job
      let leaveBalancesInitialized = false;
      if (
        input.data.status === "active" &&
        previousStatus !== "active"
      ) {
        try {
          const emp = await getEmployeeById(input.id);
          if (emp) {
            // Auto-initialize leave policies for the country if not yet configured
            await autoInitializeLeavePolicyForCountry(emp.customerId, emp.country);
            // Initialize leave balances with annual leave starting at 0
            await initializeLeaveBalancesForEmployee(input.id, { annualLeaveStartsAtZero: true });
            leaveBalancesInitialized = true;
          }
        } catch (err) {
          // Non-critical: log but don't fail the status transition
          console.error("Failed to initialize leave balances for employee", input.id, err);
        }
      }

      return {
        success: true,
        depositInvoice: depositInvoiceResult,
        depositRefund: depositRefundResult,
        visaServiceInvoice: visaServiceResult,
        reactivationDeposit: reactivationDepositResult,
        leaveBalancesInitialized,
      };
    }),

  // Auto-detect visa requirement based on nationality vs work country
  checkVisaRequired: userProcedure
    .input(z.object({ nationality: z.string(), workCountry: z.string() }))
    .query(async ({ input }) => {
      const natUpper = input.nationality.toUpperCase();
      const countryUpper = input.workCountry.toUpperCase();
      return { requiresVisa: natUpper !== countryUpper };
    }),

  // Get salary info (base salary, social security cost, total employment cost)
  salaryInfo: userProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const emp = await getEmployeeById(input.id);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      const baseSalary = parseFloat(emp.baseSalary?.toString() ?? "0");
      const estimatedEmployerCost = parseFloat(emp.estimatedEmployerCost?.toString() ?? "0");

      const totalEmploymentCost = baseSalary + estimatedEmployerCost;

      return {
        baseSalary,
        salaryCurrency: emp.salaryCurrency,
        estimatedEmployerCost,
        totalEmploymentCost,
      };
    }),

  // Payroll history for a specific employee
  payrollHistory: userProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      return await listPayrollItemsByEmployee(input.employeeId);
    }),

  // Leave balances for a specific employee
  leaveBalances: userProcedure
    .input(z.object({ employeeId: z.number(), year: z.number().optional() }))
    .query(async ({ input }) => {
      return await listLeaveBalances(input.employeeId, input.year);
    }),

  // Adjustments (reimbursements, bonuses, etc.) for a specific employee
  adjustmentHistory: userProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      // Note: listAdjustments needs refactoring in financeService too
      // Assuming we will fix financeService next, we'll update this call
      // But for now, let's wait until we fix financeService.
      // Wait, I should update it now assuming I will fix financeService.
      // The current code is: return await listAdjustments({ employeeId: input.employeeId }, 100, 0);
      // I'll change it to object params.
      return await listAdjustments({ employeeId: input.employeeId, pageSize: 100 });
    }),

  // Initialize leave balances for employee based on country leave types
  initializeLeaveBalances: customerManagerProcedure
    .input(z.object({ employeeId: z.number(), countryCode: z.string(), year: z.number() }))
    .mutation(async ({ input }) => {
      return await initializeLeaveBalancesForEmployee(input.employeeId);
    }),

  // Create a leave balance entry
  createLeaveBalance: customerManagerProcedure
    .input(z.object({
      employeeId: z.number(),
      leaveTypeId: z.number(),
      year: z.number(),
      totalEntitlement: z.number(),
      used: z.number().default(0),
      remaining: z.number(),
    }))
    .query(async ({ input }) => {
      return await createLeaveBalance(input);
    }),

  // Update a leave balance entry — only entitlement and expiry are editable, used/remaining are auto-calculated from leave records
  updateLeaveBalance: customerManagerProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        totalEntitlement: z.number(),
        expiryDate: z.string().nullable().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const updateData: any = { totalEntitlement: input.data.totalEntitlement };
      if (input.data.expiryDate !== undefined) {
        updateData.expiryDate = input.data.expiryDate;
      }
      return await updateLeaveBalance(input.id, updateData);
    }),

  // Delete a leave balance entry
  deleteLeaveBalance: customerManagerProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await deleteLeaveBalance(input.id);
    }),

  // Get leave types for a country (for leave balance initialization)
  leaveTypes: userProcedure
    .input(z.object({ countryCode: z.string() }))
    .query(async ({ input }) => {
      return await listLeaveTypesByCountry(input.countryCode);
    }),

  countByStatus: userProcedure.query(async () => {
    return await getEmployeeCountByStatus();
  }),

  countByCountry: userProcedure.query(async () => {
    return await getEmployeeCountByCountry();
  }),

  // ── Contracts sub-router ──────────────────────────────────────────
  contracts: router({
    list: userProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ input }) => {
        const contracts = await listEmployeeContracts(input.employeeId);
        // Map to signed URLs for viewing
        return await Promise.all(contracts.map(async (c) => {
          if (c.fileKey) {
            try {
              const { url } = await storageGet(c.fileKey);
              return { ...c, fileUrl: url };
            } catch (e) {
              return c;
            }
          }
          return c;
        }));
      }),

    download: userProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // We don't have getEmployeeContractById exposed directly, let's find it via list or add a get function
        // For now, let's use list and filter since contracts per employee are few
        // Wait, we need to know the employeeId to use listEmployeeContracts, but input only has id.
        // We should probably add getEmployeeContractById to db imports.
        // It is not imported but available in db/index.ts? 
        // Checking imports... listEmployeeContracts is imported. getEmployeeContractById is NOT imported.
        // But the router below has `delete` which doesn't check existence first? No, it just calls deleteEmployeeContract.
        
        // Let's rely on a direct DB call here for simplicity if the helper isn't available, 
        // OR better, import the helper if it exists. 
        // Looking at previous Read output, `getEmployeeDocumentById` is imported, but `getEmployeeContractById` is NOT.
        // However, I can see `updateEmployeeContract` uses `id`.
        
        // I will use `getDb` to fetch the contract directly to be safe.
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { employeeContracts } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        
        const contracts = await db.select().from(employeeContracts).where(eq(employeeContracts.id, input.id));
        const contract = contracts[0];
        
        if (!contract || !contract.fileKey) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contract file not found" });
        }

        try {
          const { content, contentType } = await storageDownload(contract.fileKey);
          return {
            content: content.toString("base64"),
            filename: contract.fileKey.split("/").pop() || "contract.pdf",
            contentType: contentType || "application/pdf"
          };
        } catch (error) {
          console.error("Failed to download contract:", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download contract" });
        }
      }),

    upload: customerManagerProcedure
      .input(
        z.object({
          employeeId: z.number(),
          contractType: z.string().optional(),
          signedDate: z.string().optional(),
          effectiveDate: z.string().optional(),
          expiryDate: z.string().optional(),
          fileBase64: z.string(),
          fileName: z.string(),
          mimeType: z.string().default("application/pdf"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Validate contract dates
        if (input.effectiveDate && input.expiryDate) {
          if (new Date(input.expiryDate) <= new Date(input.effectiveDate)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: "Contract expiry date must be after the effective date." });
          }
        }

        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `employee-contracts/${input.employeeId}/${randomSuffix}-${input.fileName}`;
        const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

        const result = await createEmployeeContractRecord({
          employeeId: input.employeeId,
          contractType: input.contractType,
          fileUrl: url,
          fileKey: fileKey,
          signedDate: input.signedDate,
          effectiveDate: input.effectiveDate,
          expiryDate: input.expiryDate,
          status: input.signedDate ? "signed" : "draft",
        });

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "create",
          entityType: "employee_contract",
          changes: JSON.stringify({ employeeId: input.employeeId, contractType: input.contractType }),
        });

        return { success: true, url };
      }),

    update: customerManagerProcedure
      .input(
        z.object({
          id: z.number(),
          data: z.object({
            contractType: z.string().optional(),
            signedDate: z.string().optional(),
            effectiveDate: z.string().optional(),
            expiryDate: z.string().optional(),
            status: z.enum(["draft", "signed", "expired", "terminated"]).optional(),
          }),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const updateData: any = { ...input.data };
        // Dates are already validated strings (YYYY-MM-DD), pass directly
        await updateEmployeeContract(input.id, updateData);
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "update",
          entityType: "employee_contract",
          entityId: input.id,
          changes: JSON.stringify(input.data),
        });
        return { success: true };
      }),

    delete: customerManagerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteEmployeeContract(input.id);
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "delete",
          entityType: "employee_contract",
          entityId: input.id,
        });
        return { success: true };
      }),
  }),

  // ── Documents sub-router ──────────────────────────────────────────
  documents: router({
    list: userProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ input }) => {
        const docs = await listEmployeeDocuments(input.employeeId);
        // Map to signed URLs for viewing
        return await Promise.all(docs.map(async (d) => {
          if (d.fileKey) {
            try {
              const { url } = await storageGet(d.fileKey);
              return { ...d, fileUrl: url };
            } catch (e) {
              return d;
            }
          }
          return d;
        }));
      }),

    download: userProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const doc = await getEmployeeDocumentById(input.id);
        if (!doc || !doc.fileKey) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
        }

        try {
          const { content, contentType } = await storageDownload(doc.fileKey);
          return {
            content: content.toString("base64"),
            filename: doc.fileKey.split("/").pop() || "document.pdf",
            contentType: contentType || doc.mimeType || "application/pdf"
          };
        } catch (error) {
          console.error("Failed to download document:", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download document" });
        }
      }),

    upload: customerManagerProcedure
      .input(
        z.object({
          employeeId: z.number(),
          documentType: z.enum(["resume", "passport", "national_id", "work_permit", "visa", "contract", "education", "payslip", "reimbursement_receipt", "other"]),
          documentName: z.string().min(1),
          fileBase64: z.string(),
          fileName: z.string(),
          mimeType: z.string().default("application/pdf"),
          fileSize: z.number().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `employee-docs/${input.employeeId}/${input.documentType}/${randomSuffix}-${input.fileName}`;
        const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

        const result = await createEmployeeDocument({
          employeeId: input.employeeId,
          documentType: input.documentType,
          documentName: input.documentName,
          fileUrl: url,
          fileKey: fileKey,
          mimeType: input.mimeType,
          fileSize: input.fileSize || fileBuffer.length,
          notes: input.notes,
        });

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "create",
          entityType: "employee_document",
          changes: JSON.stringify({ employeeId: input.employeeId, documentType: input.documentType, documentName: input.documentName }),
        });

        return { success: true, url };
      }),

    delete: customerManagerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteEmployeeDocument(input.id);
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "delete",
          entityType: "employee_document",
          entityId: input.id,
        });
        return { success: true };
      }),
  }),
  // ── Worker Portal Invite ──────────────────────────────────────────────────
  workerPortalStatus: userProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { hasAccount: false, workerUserId: null, email: null, passwordSet: false };
      const [wu] = await db.select().from(workerUsers).where(eq(workerUsers.employeeId, input.employeeId)).limit(1);
      if (!wu) return { hasAccount: false, workerUserId: null, email: null, passwordSet: false };
      return {
        hasAccount: true,
        workerUserId: wu.id,
        email: wu.email,
        passwordSet: !!wu.passwordHash && wu.passwordHash.length > 0,
      };
    }),

  inviteToWorkerPortal: customerManagerProcedure
    .input(z.object({
      employeeId: z.number(),
      email: z.string().email().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await provisionWorkerUser({
        employeeId: input.employeeId,
        email: input.email,
      });

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: result.alreadyExists ? "resend_worker_invite" : "invite_to_worker_portal",
        entityType: "employee",
        entityId: input.employeeId,
        changes: JSON.stringify({ workerUserId: result.workerUserId, email: result.email }),
      });

      if (result.alreadyExists) {
        await resendWorkerInvite(result.workerUserId);
        return { success: true, alreadyExists: true, email: result.email };
      }

      return { success: true, alreadyExists: false, email: result.email };
    }),

  // ── Onboarding Invites (Admin view) ──────────────────────────────────────────
  onboardingInvites: router({
    list: userProcedure
      .input(z.object({
        customerId: z.number().optional(),
        status: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const conditions = [];
        if (input.customerId) conditions.push(eq(onboardingInvites.customerId, input.customerId));
        if (input.status) conditions.push(eq(onboardingInvites.status, input.status as any));

        const invites = await db
          .select({
            id: onboardingInvites.id,
            customerId: onboardingInvites.customerId,
            customerName: customers.companyName,
            employeeName: onboardingInvites.employeeName,
            employeeEmail: onboardingInvites.employeeEmail,
            status: onboardingInvites.status,
            employeeId: onboardingInvites.employeeId,
            expiresAt: onboardingInvites.expiresAt,
            completedAt: onboardingInvites.completedAt,
            createdAt: onboardingInvites.createdAt,
          })
          .from(onboardingInvites)
          .leftJoin(customers, eq(onboardingInvites.customerId, customers.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(onboardingInvites.createdAt));

        return invites;
      }),

    delete: customerManagerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db.delete(onboardingInvites).where(eq(onboardingInvites.id, input.id));

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "delete",
          entityType: "onboarding_invite",
          entityId: input.id,
        });

        return { success: true };
      }),
  }),
});
