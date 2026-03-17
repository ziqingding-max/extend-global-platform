import { z } from "zod";
import { router } from "../_core/trpc";
import { customerManagerProcedure, adminProcedure, userProcedure } from "../procedures";
import {
  createCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
  listCustomerPricing,
  createCustomerPricing,
  updateCustomerPricing,
  deleteCustomerPricing,
  batchCreateCustomerPricing,
  listCustomerContacts,
  createCustomerContact,
  updateCustomerContact,
  deleteCustomerContact,
  listCustomerContracts,
  createCustomerContract,
  updateCustomerContract,
  deleteCustomerContract,
  logAuditAction,
  getCustomerByEmail,
  listCustomerPricing as listPricingForDedup,
} from "../db";
import { storagePut, storageGet, storageDownload } from "../storage";
import { TRPCError } from "@trpc/server";
import { generateInviteToken, getInviteExpiryDate, hashPassword, signPortalToken } from "../portal/portalAuth";
import type { PortalJwtPayload } from "../portal/portalAuth";
import { sendPortalInviteEmail, sendPortalPasswordChangedEmail } from "../services/authEmailService";

export const customersRouter = router({
  list: userProcedure
    .input(
      z.object({
        status: z.string().optional(),
        search: z.string().optional(),
        channelPartnerId: z.number().nullable().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const page = Math.floor(input.offset / input.limit) + 1;
      return await listCustomers({
        page,
        pageSize: input.limit,
        search: input.search,
        status: input.status,
        channelPartnerId: input.channelPartnerId,
      });
    }),

  get: userProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getCustomerById(input.id);
    }),

  create: customerManagerProcedure
    .input(
      z.object({
        companyName: z.string().min(1),
        legalEntityName: z.string().optional(),
        registrationNumber: z.string().optional(),
        industry: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string(),
        postalCode: z.string().optional(),
        primaryContactEmail: z.string().email().optional(),
        primaryContactName: z.string().optional(),
        primaryContactPhone: z.string().optional(),
        paymentTermDays: z.number().min(0).max(365).default(30),
        settlementCurrency: z.string().default("USD"),
        language: z.enum(["en", "zh"]).default("en"),
        billingEntityId: z.number().optional(),
        depositMultiplier: z.number().min(1).max(3).default(2),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check email uniqueness
      if (input.primaryContactEmail) {
        const existing = await getCustomerByEmail(input.primaryContactEmail);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: `Email "${input.primaryContactEmail}" is already used by customer "${existing.companyName}"` });
        }
      }

      // Check registrationNumber uniqueness
      if (input.registrationNumber) {
        const allCustomers = await listCustomers({ search: input.registrationNumber, pageSize: 100 });
        const regDuplicate = allCustomers.data.find(
          (c: any) => c.registrationNumber === input.registrationNumber
        );
        if (regDuplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Registration number "${input.registrationNumber}" is already used by customer "${regDuplicate.companyName}" (${regDuplicate.clientCode}).`,
          });
        }
      }

      const result = await createCustomer({ ...input, status: "active" });

      // Auto-create first contact from primaryContact info
      const customerId = (result as any)[0]?.id;
      if (customerId && input.primaryContactName) {
        await createCustomerContact({
          customerId,
          contactName: input.primaryContactName,
          email: input.primaryContactEmail || "",
          phone: input.primaryContactPhone || undefined,
          role: "Primary Contact",
          isPrimary: true,
          hasPortalAccess: false,
        });
      }

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "create",
        entityType: "customer",
        changes: JSON.stringify(input),
      });
      return result;
    }),

  update: customerManagerProcedure
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
          primaryContactEmail: z.string().optional(),
          primaryContactName: z.string().optional(),
          primaryContactPhone: z.string().optional(),
          paymentTermDays: z.number().min(0).max(365).optional(),
          settlementCurrency: z.string().optional(),
          language: z.enum(["en", "zh"]).optional(),
          billingEntityId: z.number().nullable().optional(),
          depositMultiplier: z.number().min(1).max(3).optional(),
          status: z.enum(["active", "suspended", "terminated"]).optional(),
          notes: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await updateCustomer(input.id, input.data);

      // If primaryContact fields changed, sync to the isPrimary contact record
      const primaryChanged = input.data.primaryContactName !== undefined
        || input.data.primaryContactEmail !== undefined
        || input.data.primaryContactPhone !== undefined;
      if (primaryChanged) {
        const contacts = await listCustomerContacts(input.id);
        const primaryContact = contacts.find((c: any) => c.isPrimary);
        if (primaryContact) {
          const syncData: any = {};
          if (input.data.primaryContactName !== undefined) syncData.contactName = input.data.primaryContactName;
          if (input.data.primaryContactEmail !== undefined) syncData.email = input.data.primaryContactEmail;
          if (input.data.primaryContactPhone !== undefined) syncData.phone = input.data.primaryContactPhone;
          await updateCustomerContact(primaryContact.id, syncData);
        }
      }

      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update",
        entityType: "customer",
        entityId: input.id,
        changes: JSON.stringify(input.data),
      });
      return { success: true };
    }),

  // ── Pricing sub-router ──────────────────────────────────────────────
  pricing: router({
    list: userProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input }) => {
        return await listCustomerPricing(input.customerId);
      }),

    // Single country pricing create - auto-deactivates old same-type pricing
    create: customerManagerProcedure
      .input(
        z.object({
          customerId: z.number(),
          pricingType: z.enum(["global_discount", "country_specific", "client_aor_fixed"]),
          globalDiscountPercent: z.string().optional(),
          countryCode: z.string().optional(),
          serviceType: z.enum(["eor", "visa_eor", "aor"]).optional(),
          fixedPrice: z.string().optional(),
          visaOneTimeFee: z.string().optional(),
          currency: z.string().default("USD"),
          effectiveFrom: z.string(), // YYYY-MM-DD
          effectiveTo: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Auto-deactivate old pricing with same country+serviceType or same global_discount type
        const existingPricing = await listPricingForDedup(input.customerId);
        for (const p of existingPricing) {
          if (!p.isActive) continue;
          if (input.pricingType === "global_discount" && p.pricingType === "global_discount") {
            await updateCustomerPricing(p.id, { isActive: false });
          } else if (input.pricingType === "client_aor_fixed" && p.pricingType === "client_aor_fixed") {
            // Only one active AOR global price per customer
            await updateCustomerPricing(p.id, { isActive: false });
          } else if (input.pricingType === "country_specific" && p.pricingType === "country_specific"
            && p.countryCode === input.countryCode && p.serviceType === input.serviceType) {
            await updateCustomerPricing(p.id, { isActive: false });
          }
        }
        const result = await createCustomerPricing({
          customerId: input.customerId,
          pricingType: input.pricingType,
          globalDiscountPercent: input.globalDiscountPercent || undefined,
          countryCode: input.countryCode || undefined,
          serviceType: input.serviceType || undefined,
          fixedPrice: input.fixedPrice || undefined,
          visaOneTimeFee: input.visaOneTimeFee || undefined,
          currency: input.currency,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo,
          isActive: true,
        });
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "create",
          entityType: "customer_pricing",
          changes: JSON.stringify(input),
        });
        return result;
      }),

    // Batch create for multiple countries at once - auto-deactivates old same-type pricing
    batchCreate: customerManagerProcedure
      .input(
        z.object({
          customerId: z.number(),
          countryCodes: z.array(z.string()).min(1),
          serviceType: z.enum(["eor", "visa_eor", "aor"]),
          fixedPrice: z.string(),
          visaOneTimeFee: z.string().optional(),
          currency: z.string().default("USD"),
          effectiveFrom: z.string(),
          effectiveTo: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Auto-deactivate old pricing for same country+serviceType
        const existingPricing = await listPricingForDedup(input.customerId);
        for (const p of existingPricing) {
          if (!p.isActive) continue;
          if (p.pricingType === "country_specific" && p.serviceType === input.serviceType
            && input.countryCodes.includes(p.countryCode || "")) {
            await updateCustomerPricing(p.id, { isActive: false });
          }
        }
        const items = input.countryCodes.map((cc) => ({
          customerId: input.customerId,
          pricingType: "country_specific" as const,
          countryCode: cc,
          serviceType: input.serviceType,
          fixedPrice: input.fixedPrice,
          visaOneTimeFee: input.visaOneTimeFee,
          currency: input.currency,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo,
          isActive: true,
        }));
        await batchCreateCustomerPricing(items);
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "create",
          entityType: "customer_pricing",
          changes: JSON.stringify({ batch: true, count: items.length, ...input }),
        });
        return { success: true, count: items.length };
      }),

    update: customerManagerProcedure
      .input(
        z.object({
          id: z.number(),
          data: z.object({
            globalDiscountPercent: z.string().optional(),
            fixedPrice: z.string().optional(),
            visaOneTimeFee: z.string().optional(),
            currency: z.string().optional(),
            effectiveTo: z.string().optional(),
            isActive: z.boolean().optional(),
          }),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const updateData: any = { ...input.data };
        // effectiveTo is already a string YYYY-MM-DD, pass directly
        await updateCustomerPricing(input.id, updateData);
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "update",
          entityType: "customer_pricing",
          entityId: input.id,
          changes: JSON.stringify(input.data),
        });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteCustomerPricing(input.id);
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "delete",
          entityType: "customer_pricing",
          entityId: input.id,
        });
        return { success: true };
      }),
  }),

  // ── Contacts sub-router ─────────────────────────────────────────────
  contacts: router({
    list: userProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input }) => {
        return await listCustomerContacts(input.customerId);
      }),

    create: customerManagerProcedure
      .input(
        z.object({
          customerId: z.number(),
          contactName: z.string().min(1),
          email: z.string().email(),
          phone: z.string().optional(),
          role: z.string().optional(),
          isPrimary: z.boolean().default(false),
          hasPortalAccess: z.boolean().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await createCustomerContact(input);
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "create",
          entityType: "customer_contact",
          changes: JSON.stringify(input),
        });
        return result;
      }),

    update: customerManagerProcedure
      .input(
        z.object({
          id: z.number(),
          customerId: z.number(), // needed for primary contact sync
          data: z.object({
            contactName: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            role: z.string().optional(),
            isPrimary: z.boolean().optional(),
            hasPortalAccess: z.boolean().optional(),
            portalRole: z.enum(["admin", "hr_manager", "finance", "viewer"]).optional(),
          }),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // If setting this contact as primary, unset the old primary first
        if (input.data.isPrimary === true) {
          const contacts = await listCustomerContacts(input.customerId);
          for (const c of contacts) {
            if ((c as any).isPrimary && c.id !== input.id) {
              await updateCustomerContact(c.id, { isPrimary: false });
            }
          }
        }

        await updateCustomerContact(input.id, input.data);

        // If this contact is (now) primary, sync its info back to the customer's billing/contact fields
        if (input.data.isPrimary === true) {
          // Get the updated contact data
          const contacts = await listCustomerContacts(input.customerId);
          const updatedContact = contacts.find((c: any) => c.id === input.id);
          if (updatedContact) {
            await updateCustomer(input.customerId, {
              primaryContactName: (updatedContact as any).contactName,
              primaryContactEmail: (updatedContact as any).email,
              primaryContactPhone: (updatedContact as any).phone || undefined,
            });
          }
        } else if (input.data.isPrimary === undefined) {
          // If updating an existing primary contact's info (name/email/phone), also sync to customer
          const contacts = await listCustomerContacts(input.customerId);
          const thisContact = contacts.find((c: any) => c.id === input.id);
          if (thisContact && (thisContact as any).isPrimary) {
            const syncData: any = {};
            if (input.data.contactName) syncData.primaryContactName = input.data.contactName;
            if (input.data.email) syncData.primaryContactEmail = input.data.email;
            if (input.data.phone !== undefined) syncData.primaryContactPhone = input.data.phone;
            if (Object.keys(syncData).length > 0) {
              await updateCustomer(input.customerId, syncData);
            }
          }
        }

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "update",
          entityType: "customer_contact",
          entityId: input.id,
          changes: JSON.stringify(input.data),
        });
        return { success: true };
      }),

    delete: customerManagerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteCustomerContact(input.id);
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "delete",
          entityType: "customer_contact",
          entityId: input.id,
        });
        return { success: true };
      }),

    /**
     * Generate a portal invite for a contact.
     * Sets inviteToken, inviteExpiresAt, hasPortalAccess, portalRole.
     * Returns the invite token so the admin can share the link.
     */
    generatePortalInvite: customerManagerProcedure
      .input(
        z.object({
          contactId: z.number(),
          portalRole: z.enum(["admin", "hr_manager", "finance", "viewer"]).default("viewer"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Verify the contact exists by listing contacts for the customer
        const { getDb } = await import("../db");
        const { customerContacts: ccTable } = await import("../../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const existing = await db
          .select()
          .from(ccTable)
          .where(eqOp(ccTable.id, input.contactId))
          .limit(1);

        if (existing.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        }

        const contact = existing[0];

        // If already active, don't re-invite
        if (contact.isPortalActive && contact.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This contact already has an active portal account" });
        }

        // Generate invite token
        const inviteToken = generateInviteToken();
        const inviteExpiresAt = getInviteExpiryDate();

        await updateCustomerContact(input.contactId, {
          inviteToken,
          inviteExpiresAt,
          hasPortalAccess: true,
          portalRole: input.portalRole,
          isPortalActive: false, // Will become true after registration
        });

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "update",
          entityType: "customer_contact",
          entityId: input.contactId,
          changes: JSON.stringify({ action: "portal_invite", portalRole: input.portalRole }),
        });

        // Send portal invite email
        try {
          const { customers: custTable } = await import("../../drizzle/schema");
          const custRows = await db
            .select({ companyName: custTable.companyName })
            .from(custTable)
            .where(eqOp(custTable.id, contact.customerId))
            .limit(1);
          const companyName = custRows[0]?.companyName || "Your Company";

          const portalOrigin = process.env.PORTAL_APP_URL || `${ctx.req.protocol}://${ctx.req.get("host")}`;
          const inviteUrl = `${portalOrigin}/register?token=${inviteToken}`;

          await sendPortalInviteEmail({
            to: contact.email,
            contactName: contact.contactName,
            companyName,
            portalRole: input.portalRole,
            inviteUrl,
          });
        } catch (err) {
          console.error("[Customers] Failed to send portal invite email:", err);
        }

        return {
          success: true,
          inviteToken,
          contactName: contact.contactName,
          email: contact.email,
        };
      }),

    /**
     * Revoke portal access for a contact.
     */
    revokePortalAccess: customerManagerProcedure
      .input(z.object({ contactId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await updateCustomerContact(input.contactId, {
          hasPortalAccess: false,
          isPortalActive: false,
          inviteToken: null,
          inviteExpiresAt: null,
        });

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "update",
          entityType: "customer_contact",
          entityId: input.contactId,
          changes: JSON.stringify({ action: "portal_revoke" }),
        });

        return { success: true };
      }),

    /**
     * Admin reset password for a portal contact.
     * Sets a new password directly without requiring the old one.
     */
    resetPassword: adminProcedure
      .input(
        z.object({
          contactId: z.number(),
          newPassword: z.string().min(8, "Password must be at least 8 characters"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("../db");
        const { customerContacts: ccTable } = await import("../../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const existing = await db
          .select()
          .from(ccTable)
          .where(eqOp(ccTable.id, input.contactId))
          .limit(1);

        if (existing.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        }

        const contact = existing[0];
        if (!contact.hasPortalAccess) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This contact does not have portal access" });
        }

        const passwordHash = await hashPassword(input.newPassword);
        await db
          .update(ccTable)
          .set({
            passwordHash,
            resetToken: null,
            resetExpiresAt: null,
          })
          .where(eqOp(ccTable.id, input.contactId));

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "update",
          entityType: "customer_contact",
          entityId: input.contactId,
          changes: JSON.stringify({ action: "admin_reset_password" }),
        });

        // Send email notification to the portal user
        try {
          const loginUrl = process.env.PORTAL_APP_URL ? `${process.env.PORTAL_APP_URL}/login` : "https://app.extendglobal.ai/login";
          await sendPortalPasswordChangedEmail({
            to: contact.email,
            contactName: contact.contactName || "User",
            newPassword: input.newPassword,
            loginUrl,
          });
        } catch (err) {
          console.error("[Customers] Failed to send portal password reset email:", err);
        }

        return { success: true, contactName: contact.contactName, email: contact.email };
      }),
  }),

  // ── Contracts sub-router ────────────────────────────────────────────
  contracts: router({
    list: userProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input }) => {
        const contracts = await listCustomerContracts(input.customerId);
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
        const { getDb } = await import("../db");
        const { customerContracts } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const contract = await db.query.customerContracts.findFirst({
            where: eq(customerContracts.id, input.id)
        });

        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });

        if (contract.fileKey) {
            try {
                const { content, contentType } = await storageDownload(contract.fileKey);
                return {
                    content: content.toString('base64'),
                    filename: contract.contractName || `Contract-${contract.id}.pdf`,
                    contentType: contentType || "application/pdf"
                };
            } catch (e) {
                console.error("Failed to download contract:", e);
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download file" });
            }
        }
        throw new TRPCError({ code: "NOT_FOUND", message: "File key missing" });
      }),

    upload: customerManagerProcedure
      .input(
        z.object({
          customerId: z.number(),
          contractName: z.string().min(1),
          contractType: z.string().optional(),
          signedDate: z.string().optional(),
          effectiveDate: z.string().optional(),
          expiryDate: z.string().optional(),
          fileBase64: z.string(), // base64-encoded file content
          fileName: z.string(),
          mimeType: z.string().default("application/pdf"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Upload file to S3
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `contracts/${input.customerId}/${randomSuffix}-${input.fileName}`;
        const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

        // Create contract record
        const result = await createCustomerContract({
          customerId: input.customerId,
          contractName: input.contractName,
          contractType: input.contractType || undefined,
          fileUrl: url,
          fileKey: fileKey,
          signedDate: input.signedDate,
          effectiveDate: input.effectiveDate,
          expiryDate: input.expiryDate,
          status: "signed",
        });

        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "create",
          entityType: "customer_contract",
          changes: JSON.stringify({ contractName: input.contractName, fileName: input.fileName }),
        });

        return { success: true, url };
      }),

    update: customerManagerProcedure
      .input(
        z.object({
          id: z.number(),
          data: z.object({
            contractName: z.string().optional(),
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
        // Dates are already YYYY-MM-DD strings, pass directly
        await updateCustomerContract(input.id, updateData);
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "update",
          entityType: "customer_contract",
          entityId: input.id,
          changes: JSON.stringify(input.data),
        });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteCustomerContract(input.id);
        await logAuditAction({
          userId: ctx.user.id, userName: ctx.user.name || null,
          action: "delete",
          entityType: "customer_contract",
          entityId: input.id,
        });
        return { success: true };
      }),
  }),

  // Admin impersonation: generate a short-lived portal token for a specific contact or the primary contact
  generatePortalToken: adminProcedure
    .input(z.object({ customerId: z.number(), contactId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const contacts = await listCustomerContacts(input.customerId);
      let portalContact;
      if (input.contactId) {
        // Specific contact requested (from "Login As" button)
        portalContact = contacts.find(c => c.id === input.contactId && (c as any).isPortalActive && c.hasPortalAccess);
        if (!portalContact) {
          throw new TRPCError({ code: "NOT_FOUND", message: "This contact does not have active portal access." });
        }
      } else {
        // Global button: enforce primary contact with portal access
        const primaryContact = contacts.find(c => (c as any).isPrimary && (c as any).isPortalActive && c.hasPortalAccess);
        if (primaryContact) {
          portalContact = primaryContact;
        } else {
          // Fallback: any active portal contact, but prefer primary
          const anyActive = contacts.find(c => (c as any).isPortalActive && c.hasPortalAccess);
          if (!anyActive) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No portal-enabled contact found for this customer. Please invite a contact first." });
          }
          portalContact = anyActive;
        }
      }
      // Get customer name
      const customer = await getCustomerById(input.customerId);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      }
      // Generate a short-lived portal JWT (15 minutes)
      const payload: PortalJwtPayload = {
        sub: String(portalContact.id),
        customerId: input.customerId,
        email: portalContact.email,
        portalRole: portalContact.portalRole || "admin",
        iss: "gea-portal",
      };
      const token = await signPortalToken(payload);
      // Audit log
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "portal_impersonate",
        entityType: "customer",
        entityId: input.customerId,
        changes: JSON.stringify({ contactId: portalContact.id, contactEmail: portalContact.email }),
      });
      return { token, contactEmail: portalContact.email, contactName: portalContact.contactName };
    }),
});
