import { z } from "zod";
import { router } from "../_core/trpc";
import { customerManagerProcedure, userProcedure, crmProcedure } from "../procedures";
import {
  createSalesLead,
  getSalesLeadById,
  listSalesLeads,
  updateSalesLead,
  deleteSalesLead,
  createSalesActivity,
  listSalesActivities,
  deleteSalesActivity,
  createCustomer,
  createCustomerContact,
  logAuditAction,
  listUsers,
  listEmployees,
  getDb,
  createCustomerPricing,
  createLeadChangeLog,
  listLeadChangeLogs,
} from "../db";
import { storagePut, storageGet, storageDownload } from "../storage";
import { quotations, salesDocuments, customerContracts, leadChangeLogs } from "../../drizzle/schema";
import { desc, eq, and, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Pipeline stages (in order):
 *   discovery       – Only contact info, no clear demand yet
 *   leads           – Clear demand identified (intended services + target countries)
 *   quotation_sent  – Quotation has been sent to the prospect
 *   msa_sent        – MSA (Master Service Agreement) sent to the prospect
 *   msa_signed      – MSA signed by both parties → customer is created in Customers module
 *   closed_won      – First employee status becomes "onboarding" → deal is won
 *   closed_lost     – Deal lost at any stage
 */

const PIPELINE_STATUSES = [
  "discovery",
  "leads",
  "quotation_sent",
  "msa_sent",
  "msa_signed",
  "closed_won",
  "closed_lost",
] as const;

// Statuses that are still "active" in the pipeline (not terminal)
const ACTIVE_STATUSES = ["discovery", "leads", "quotation_sent", "msa_sent", "msa_signed"] as const;

export const salesRouter = router({
  // ── List all sales leads ──────────────────────────────────────────────
  list: userProcedure
    .input(
      z.object({
        status: z.string().optional(),
        assignedTo: z.number().optional(),
        search: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const page = Math.floor(input.offset / input.limit) + 1;
      return await listSalesLeads({
        page,
        pageSize: input.limit,
        status: input.status,
        assignedTo: input.assignedTo,
        search: input.search,
      });
    }),

  // ── Get single lead by ID ────────────────────────────────────────────
  get: userProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const lead = await getSalesLeadById(input.id);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Sales lead not found" });
      return lead;
    }),

  // ── Create a new sales lead ──────────────────────────────────────────
  create: crmProcedure
    .input(
      z.object({
        companyName: z.string().min(1, "Company name is required"),
        contactName: z.string().optional(),
        contactEmail: z.union([z.literal(""), z.string().email("Invalid email address")]).optional().transform(v => v || undefined),
        contactPhone: z.string().optional(),
        country: z.string().optional(),
        industry: z.string().optional(),
        estimatedEmployees: z.number().min(0).optional(),
        estimatedRevenue: z.string().optional(),
        currency: z.string().default("USD"),
        source: z.string().optional(),
        intendedServices: z.string().optional(),
        targetCountries: z.string().optional(),
        assignedTo: z.number().optional(),
        notes: z.string().optional(),
        expectedCloseDate: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createSalesLead({
        companyName: input.companyName,
        contactName: input.contactName || null,
        contactEmail: input.contactEmail || null,
        contactPhone: input.contactPhone || null,
        country: input.country || null,
        industry: input.industry || null,
        estimatedEmployees: input.estimatedEmployees ?? null,
        estimatedRevenue: input.estimatedRevenue || null,
        currency: input.currency,
        source: input.source || null,
        intendedServices: input.intendedServices || null,
        targetCountries: input.targetCountries || null,
        createdBy: ctx.user.id,
        assignedTo: input.assignedTo ?? null,
        notes: input.notes || null,
        expectedCloseDate: input.expectedCloseDate || null,
        status: "discovery",
      });

       // Record creation change log
      const leadId = Array.isArray(result) ? result[0]?.id : (result as any)?.id;
      if (leadId) {
        await createLeadChangeLog({
          leadId,
          userId: ctx.user.id,
          userName: ctx.user.name || null,
          changeType: "created",
          fieldName: null,
          oldValue: null,
          newValue: null,
          description: `Lead created for "${input.companyName}"`,
        });
      }
      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        action: "create",
        entityType: "sales_lead",
        changes: JSON.stringify(input),
      });
      return result;
    }),

  // ── Update a sales lead ──────────────────────────────────────────────
  update: crmProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          companyName: z.string().optional(),
          contactName: z.string().optional(),
          contactEmail: z.union([z.literal(""), z.string().email()]).optional().transform(v => v || undefined),
          contactPhone: z.string().optional(),
          country: z.string().optional(),
          industry: z.string().optional(),
          estimatedEmployees: z.number().optional(),
          estimatedRevenue: z.string().optional(),
          currency: z.string().optional(),
          source: z.string().optional(),
          intendedServices: z.string().optional(),
          targetCountries: z.string().optional(),
          status: z
            .enum([
              "discovery",
              "leads",
              "quotation_sent",
              "msa_sent",
              "msa_signed",
              "closed_won",
              "closed_lost",
            ])
            .optional(),
          lostReason: z.string().optional(),
          assignedTo: z.number().nullable().optional(),
          notes: z.string().optional(),
          expectedCloseDate: z.string().nullable().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await getSalesLeadById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Sales lead not found" });

      // Prevent editing closed_won leads
      if (existing.status === "closed_won") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot edit a closed-won deal.",
        });
      }

      // If advancing to "leads", intendedServices and targetCountries should be present
      // (soft validation — we log a warning but don't block)

      // CRM Restrictions:
      
      // 1. Pipeline Order
      // Must follow: discovery -> leads -> quotation_sent -> msa_sent -> msa_signed
      const pipelineOrder = ["discovery", "leads", "quotation_sent", "msa_sent", "msa_signed", "closed_won", "closed_lost"];
      if (input.data.status && input.data.status !== existing.status && input.data.status !== "closed_lost") {
          const currentIndex = pipelineOrder.indexOf(existing.status);
          const nextIndex = pipelineOrder.indexOf(input.data.status);
          
          if (nextIndex > -1 && currentIndex > -1 && nextIndex > currentIndex + 1) {
              // Only allow skipping if current status is closed_lost (reopening)
              if (existing.status !== "closed_lost") {
                  throw new TRPCError({
                      code: "BAD_REQUEST",
                      message: `Invalid status transition. You cannot skip stages. Next stage should be '${pipelineOrder[currentIndex + 1]}'.`
                  });
              }
          }
      }

      // 2. Quotation Sent Requirement
      if (input.data.status === "quotation_sent" && existing.status !== "quotation_sent") {
          const db = getDb();
          if (db) {
              const hasSentQuotation = await db.query.quotations.findFirst({
                  where: (q, { eq, or }) => 
                      and(
                          eq(q.leadId, input.id),
                          or(eq(q.status, "sent"), eq(q.status, "accepted"))
                      )
              });
              
              if (!hasSentQuotation) {
                  throw new TRPCError({
                      code: "PRECONDITION_FAILED",
                      message: "Cannot move to 'Quotation Sent': No sent or accepted quotation found for this lead."
                  });
              }
          }
      }

      // 3. MSA Signed Requirement
      if (input.data.status === "msa_signed" && existing.status !== "msa_signed") {
          const db = getDb();
          if (db) {
              // Check for accepted quotation
              const hasAcceptedQuotation = await db.query.quotations.findFirst({
                  where: and(
                      eq(quotations.leadId, input.id),
                      eq(quotations.status, "accepted")
                  )
              });

              if (!hasAcceptedQuotation) {
                  throw new TRPCError({
                      code: "PRECONDITION_FAILED",
                      message: "Cannot move to 'MSA Signed': No accepted quotation found."
                  });
              }

              // Check for MSA document
              // Since we don't have a direct 'sales_documents' query helper exposed in db/index yet,
              // we might need to check fileUrl/fileKey if we add them to salesLeads or use raw query.
              // For now, let's assume we add a flag or check sales_documents table.
              // We'll query sales_documents table directly.
              const msaDoc = await db.query.salesDocuments.findFirst({
                  where: and(
                      eq(salesDocuments.leadId, input.id),
                      eq(salesDocuments.docType, "contract") // Assuming 'contract' is used for MSA
                  )
              });

              if (!msaDoc) {
                   throw new TRPCError({
                      code: "PRECONDITION_FAILED",
                      message: "Cannot move to 'MSA Signed': No signed MSA document uploaded."
                  });
              }
          }
      }

      const updateData: any = { ...input.data };
      if (input.data.expectedCloseDate !== undefined) {
        updateData.expectedCloseDate = input.data.expectedCloseDate || null;
      }

      await updateSalesLead(input.id, updateData);

      // Record change logs for each changed field
      const fieldLabels: Record<string, string> = {
        companyName: "Company Name", contactName: "Contact Name", contactEmail: "Contact Email",
        contactPhone: "Contact Phone", country: "Country", industry: "Industry",
        estimatedEmployees: "Estimated Employees", estimatedRevenue: "Estimated Revenue",
        currency: "Currency", source: "Source", intendedServices: "Intended Services",
        targetCountries: "Target Countries", status: "Status", lostReason: "Lost Reason",
        assignedTo: "Assigned To", notes: "Notes", expectedCloseDate: "Expected Close Date",
      };
      for (const [key, newVal] of Object.entries(input.data)) {
        if (newVal === undefined) continue;
        const oldVal = (existing as any)[key];
        const newValStr = newVal === null ? "" : String(newVal);
        const oldValStr = oldVal === null || oldVal === undefined ? "" : String(oldVal);
        if (newValStr !== oldValStr) {
          const changeType = key === "status" ? "status_change" : "field_update";
          await createLeadChangeLog({
            leadId: input.id,
            userId: ctx.user.id,
            userName: ctx.user.name || null,
            changeType,
            fieldName: key,
            oldValue: oldValStr || null,
            newValue: newValStr || null,
            description: key === "status"
              ? `Status changed from "${oldValStr}" to "${newValStr}"`
              : `${fieldLabels[key] || key} changed from "${oldValStr || '(empty)'}" to "${newValStr || '(empty)'}"`,
          });
        }
      }

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        action: "update",
        entityType: "sales_lead",
        entityId: input.id,
        changes: JSON.stringify(input.data),
      });

      return { success: true };
    }),

  // ── Convert lead to customer (triggered at MSA Signed stage) ─────────
  convertToCustomer: crmProcedure
    .input(
      z.object({
        leadId: z.number(),
        paymentTermDays: z.number().min(0).max(365).default(30),
        settlementCurrency: z.string().default("USD"),
        language: z.enum(["en", "zh"]).default("en"),
        billingEntityId: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const lead = await getSalesLeadById(input.leadId);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Sales lead not found" });

      // Already converted
      if (lead.convertedCustomerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This lead has already been converted to a customer.",
        });
      }

      // Must be at msa_signed stage to convert
      if (lead.status !== "msa_signed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: 'Only leads at "MSA Signed" stage can be converted to customers.',
        });
      }

      // 1. Create customer from lead data
      const customerResult = await createCustomer({
        companyName: lead.companyName,
        industry: lead.industry || undefined,
        country: lead.country || "Unknown",
        primaryContactName: lead.contactName || undefined,
        primaryContactEmail: lead.contactEmail || undefined,
        primaryContactPhone: lead.contactPhone || undefined,
        paymentTermDays: input.paymentTermDays,
        settlementCurrency: input.settlementCurrency,
        language: input.language,
        billingEntityId: input.billingEntityId || undefined,
        notes: input.notes || lead.notes || undefined,
        status: "active",
      });

      const customerId = (customerResult as any)[0]?.id;

      if (!customerId) {
        console.error("Failed to get customer ID after creation", customerResult);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create customer: ID not returned",
        });
      }

      // 2. Auto-create primary contact if contact info exists
      if (customerId && lead.contactName) {
        await createCustomerContact({
          customerId,
          contactName: lead.contactName,
          email: lead.contactEmail || "",
          phone: lead.contactPhone || undefined,
          role: "Primary Contact",
          isPrimary: true,
          hasPortalAccess: false, // Explicitly false as per new requirement: AM grants access later
        });
      }

      // 3. Sync Pricing from Quotation
      const db = getDb();
      if (db) {
        // Find latest quotation (regardless of status, but ideally accepted)
        const latestQuotation = await db.query.quotations.findFirst({
          where: eq(quotations.leadId, input.leadId),
          orderBy: [desc(quotations.createdAt)],
        });

        if (latestQuotation && latestQuotation.snapshotData) {
          try {
            const items = JSON.parse(latestQuotation.snapshotData as string);
            // Group by country + serviceType to avoid duplicates
            const pricingMap = new Map<string, any>();
            
            for (const item of items) {
              const key = `${item.countryCode}-${item.serviceType}`;
              if (!pricingMap.has(key)) {
                pricingMap.set(key, item);
              }
            }

            for (const item of Array.from(pricingMap.values())) {
              if (item.serviceType === "aor") {
                // AOR Global Pricing — one price per customer, no country needed
                await createCustomerPricing({
                  customerId,
                  pricingType: "client_aor_fixed",
                  fixedPrice: String(item.serviceFee),
                  currency: item.currency || input.settlementCurrency,
                  effectiveFrom: new Date().toISOString().split("T")[0],
                  sourceQuotationId: latestQuotation.id,
                  isActive: true,
                });
              } else {
                // EOR / Visa EOR Pricing
                await createCustomerPricing({
                  customerId,
                  pricingType: "country_specific",
                  countryCode: item.countryCode,
                  serviceType: item.serviceType,
                  fixedPrice: String(item.serviceFee),
                  visaOneTimeFee: item.oneTimeFee ? String(item.oneTimeFee) : undefined,
                  currency: item.currency || input.settlementCurrency,
                  effectiveFrom: new Date().toISOString().split("T")[0],
                  sourceQuotationId: latestQuotation.id,
                  isActive: true,
                });
              }
            }
          } catch (e) {
            console.error("Failed to sync pricing from quotation", e);
            // Log but don't fail the conversion
          }
        }
      }

      // 4. Link lead to customer (status stays msa_signed — will become closed_won
      //    when first employee reaches onboarding status)
      await updateSalesLead(input.leadId, {
        convertedCustomerId: customerId,
      });

       // 5. Sync Sales Documents (e.g. MSA) to Customer Contracts/Documents
      if (db) {
        const salesDocs = await db.query.salesDocuments.findMany({
            where: eq(salesDocuments.leadId, input.leadId)
        });
        
        for (const doc of salesDocs) {
            // If docType is 'contract', convert to customer contract
            if (doc.docType === 'contract') {
                // Use raw SQL to avoid Drizzle passing null for autoIncrement id
                const contractName = doc.title || `MSA-${lead.companyName}`;
                const now = Date.now();
                await db.run(sql`INSERT INTO customer_contracts ("customerId", "contractName", "contractType", "fileUrl", "fileKey", "status", "createdAt", "updatedAt") VALUES (${customerId}, ${contractName}, ${'MSA'}, ${doc.fileUrl}, ${doc.fileKey}, ${'signed'}, ${now}, ${now})`);
            }
            // Also sync the document's customerId for future reference
            await db.update(salesDocuments)
              .set({ customerId })
              .where(eq(salesDocuments.id, doc.id));
        }

        // 5b. Sync Quotations — link to the new customer
        await db.update(quotations)
          .set({ customerId })
          .where(eq(quotations.leadId, input.leadId));
      }

      // 6. Log the conversion activity
      await createSalesActivity({
        leadId: input.leadId,
        activityType: "note",
        description: `Customer created (ID: ${customerId}). Sales to introduce customer manager and arrange kickoff meeting. Converted by ${ctx.user.name || "Unknown"}.`,
        createdBy: ctx.user.id,
      });

      // 7. Record change log
      await createLeadChangeLog({
        leadId: input.leadId,
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        changeType: "converted",
        fieldName: "convertedCustomerId",
        oldValue: null,
        newValue: String(customerId),
        description: `Lead converted to Customer (ID: ${customerId})`,
      });

      // 8. Audit log
      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        action: "convert_to_customer",
        entityType: "sales_lead",
        entityId: input.leadId,
        changes: JSON.stringify({ customerId, companyName: lead.companyName }),
      });
      return { success: true, customerId };
    }),

  // ── Check if customer has employees at onboarding or later stages ──────
  checkOnboardingStatus: userProcedure
    .input(z.object({ leadId: z.number() }))
    .query(async ({ input }) => {
      const lead = await getSalesLeadById(input.leadId);
      if (!lead || !lead.convertedCustomerId) return { hasOnboardingEmployee: false, employeeCount: 0 };

      // Statuses that are "onboarding" or later in the employee lifecycle
      const onboardingOrLaterStatuses = [
        "onboarding", "contract_signed", "active", "on_leave", "offboarding", "terminated",
      ];

      const result = await listEmployees({ customerId: lead.convertedCustomerId, pageSize: 1000 });
      const employees = result.data || [];
      const onboardingEmployees = employees.filter(
        (emp: any) => onboardingOrLaterStatuses.includes(emp.status)
      );

      return {
        hasOnboardingEmployee: onboardingEmployees.length > 0,
        employeeCount: employees.length,
        onboardingCount: onboardingEmployees.length,
      };
    }),

  // ── Mark as Closed Won (requires customer to have employee at onboarding+) ──
  closeWon: crmProcedure
    .input(z.object({ leadId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const lead = await getSalesLeadById(input.leadId);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Sales lead not found" });

      if (lead.status !== "msa_signed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: 'Only leads at "MSA Signed" stage can be marked as Closed Won.',
        });
      }

      if (!lead.convertedCustomerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Customer must be created before closing the deal.",
        });
      }

      // Check that the customer has at least one employee at onboarding or later stage
      const onboardingOrLaterStatuses = [
        "onboarding", "contract_signed", "active", "on_leave", "offboarding", "terminated",
      ];
      const empResult = await listEmployees({ customerId: lead.convertedCustomerId, pageSize: 1000 });
      const allEmployees = empResult.data || [];
      const onboardingEmployees = allEmployees.filter(
        (emp: any) => onboardingOrLaterStatuses.includes(emp.status)
      );

      if (onboardingEmployees.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot close as won: the customer must have at least one employee at Onboarding stage or later.",
        });
      }

       await updateSalesLead(input.leadId, { status: "closed_won" });
      await createLeadChangeLog({
        leadId: input.leadId,
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        changeType: "status_change",
        fieldName: "status",
        oldValue: lead.status,
        newValue: "closed_won",
        description: `Deal closed as won with ${onboardingEmployees.length} employee(s) at onboarding or later stage`,
      });
      await createSalesActivity({
        leadId: input.leadId,
        activityType: "note",
        description: `Deal closed as won. ${onboardingEmployees.length} employee(s) confirmed at onboarding or later stage. Closed by ${ctx.user.name || "Unknown"}.`,
        createdBy: ctx.user.id,
      });
      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        action: "update",
        entityType: "sales_lead",
        entityId: input.leadId,
        changes: JSON.stringify({ status: "closed_won", onboardingEmployees: onboardingEmployees.length }),
      });

      return { success: true };
    }),

  // ── Delete a sales lead ──────────────────────────────────────────────
  delete: crmProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getSalesLeadById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Sales lead not found" });

      if (existing.status === "closed_won" || existing.convertedCustomerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete a lead that has been converted to a customer.",
        });
      }

      await deleteSalesLead(input.id);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || null,
        action: "delete",
        entityType: "sales_lead",
        entityId: input.id,
        changes: JSON.stringify({ companyName: existing.companyName }),
      });

      return { success: true };
    }),

  // ── Activities sub-router ────────────────────────────────────────────
  activities: router({
    list: userProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        return await listSalesActivities(input.leadId);
      }),

    create: crmProcedure
      .input(
        z.object({
          leadId: z.number(),
          activityType: z.enum([
            "call",
            "email",
            "meeting",
            "note",
            "proposal",
            "follow_up",
            "other",
          ]),
          description: z.string().min(1, "Description is required"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const lead = await getSalesLeadById(input.leadId);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Sales lead not found" });

        return await createSalesActivity({
          leadId: input.leadId,
          activityType: input.activityType,
          description: input.description,
          createdBy: ctx.user.id,
        });
      }),

    delete: crmProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSalesActivity(input.id);
        return { success: true };
      }),
  }),

  // ── Documents sub-router ─────────────────────────────────────────────
  documents: router({
    list: userProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        const db = getDb();
        if (!db) return [];
        const docs = await db.query.salesDocuments.findMany({
            where: eq(salesDocuments.leadId, input.leadId),
            orderBy: [desc(salesDocuments.createdAt)]
        });
        
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

    upload: crmProcedure
      .input(
        z.object({
          leadId: z.number(),
          docType: z.enum(["contract", "proposal", "other"]).default("other"),
          fileName: z.string(),
          fileBase64: z.string(), // base64-encoded file content
          mimeType: z.string().default("application/pdf"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Upload file to S3
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `sales/${input.leadId}/${randomSuffix}-${input.fileName}`;
        const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        // Create document record — use raw SQL to avoid Drizzle passing null for autoIncrement id
        const docNow = Date.now();
        const insertResult = await db.run(sql`INSERT INTO sales_documents ("leadId", "docType", "title", "fileKey", "fileUrl", "generatedBy", "createdAt") VALUES (${input.leadId}, ${input.docType}, ${input.fileName}, ${fileKey}, ${url}, ${ctx.user.id}, ${docNow})`);
        const docId = Number(insertResult.lastInsertRowid);
        const doc = { id: docId, leadId: input.leadId, docType: input.docType, title: input.fileName, fileKey, fileUrl: url, generatedBy: ctx.user.id, createdAt: new Date(docNow) };

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "create",
          entityType: "sales_document",
          changes: JSON.stringify({ fileName: input.fileName, docType: input.docType }),
        });

        return { success: true, url, doc };
      }),

    download: userProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const doc = await db.query.salesDocuments.findFirst({
            where: eq(salesDocuments.id, input.id)
        });

        if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });

        if (doc.fileKey) {
            try {
                const { content, contentType } = await storageDownload(doc.fileKey);
                return {
                    content: content.toString('base64'),
                    filename: doc.title || `Document-${doc.id}`,
                    contentType: contentType || "application/octet-stream"
                };
            } catch (e) {
                console.error("Failed to download document:", e);
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download file" });
            }
        }
        throw new TRPCError({ code: "NOT_FOUND", message: "File key missing" });
      }),

    delete: crmProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        await db.delete(salesDocuments).where(eq(salesDocuments.id, input.id));

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "delete",
          entityType: "sales_document",
          entityId: input.id,
        });

        return { success: true };
      }),
  }),

  // ── List users for assignment dropdown ───────────────────────────────
  // ── Change Logs sub-router ────────────────────────────────────────────
  changeLogs: router({
    list: userProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        return await listLeadChangeLogs(input.leadId);
      }),
  }),
  assignableUsers: userProcedure.query(async () => {
    const result = await listUsers({ pageSize: 1000 });
    return result.data.map((u) => ({
      id: u.id,
      name: u.name || u.email || `User #${u.id}`,
      email: u.email,
    }));
  }),
});
