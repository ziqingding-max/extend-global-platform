import { z } from "zod";
import { router } from "../_core/trpc";
import { adminProcedure, financeManagerProcedure, userProcedure } from "../procedures";
import {
  listBillingEntities,
  getBillingEntityById,
  createBillingEntity,
  updateBillingEntity,
  deleteBillingEntity,
  logAuditAction,
} from "../db";
import { storagePut, storageGet } from "../storage";
import { TRPCError } from "@trpc/server";

/**
 * Helper: resolve logoUrl to a signed URL if logoFileKey exists.
 * OSS private buckets require signed URLs for access.
 */
async function resolveLogoUrl<T extends { logoUrl?: string | null; logoFileKey?: string | null }>(
  entity: T
): Promise<T> {
  if (entity.logoFileKey) {
    try {
      const { url } = await storageGet(entity.logoFileKey);
      return { ...entity, logoUrl: url };
    } catch (err) {
      console.warn(`[BillingEntities] Failed to sign logo URL for key ${entity.logoFileKey}:`, err);
    }
  }
  return entity;
}

export const billingEntitiesRouter = router({
  list: userProcedure.query(async () => {
    const entities = await listBillingEntities();
    // Resolve logo URLs to signed URLs for private OSS buckets
    return await Promise.all(entities.map((e: any) => resolveLogoUrl(e)));
  }),

  get: userProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const entity = await getBillingEntityById(input.id);
      if (!entity) return entity;
      return await resolveLogoUrl(entity);
    }),

  create: financeManagerProcedure
    .input(
      z.object({
        entityName: z.string().min(1),
        legalName: z.string().min(1),
        registrationNumber: z.string().optional(),
        taxId: z.string().optional(),
        country: z.string(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        bankDetails: z.string().optional(),
        currency: z.string().default("USD"),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        isDefault: z.boolean().default(false),
        invoicePrefix: z.string().max(20).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check invoicePrefix uniqueness
      if (input.invoicePrefix) {
        const allEntities = await listBillingEntities();
        const prefixDup = allEntities.find(
          (e: any) => e.invoicePrefix === input.invoicePrefix
        );
        if (prefixDup) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Invoice prefix "${input.invoicePrefix}" is already used by billing entity "${prefixDup.entityName}".`,
          });
        }
        // Warn if entityName already exists
        const nameDup = allEntities.find(
          (e: any) => e.entityName.toLowerCase() === input.entityName.toLowerCase()
        );
        if (nameDup) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A billing entity with name "${input.entityName}" already exists. Please use a different name or confirm this is intentional.`,
          });
        }
      }
      const result = await createBillingEntity({ ...input, isActive: true });
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "create",
        entityType: "billing_entity",
        changes: JSON.stringify(input),
      });
      return result;
    }),

  update: financeManagerProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          entityName: z.string().optional(),
          legalName: z.string().optional(),
          registrationNumber: z.string().optional(),
          taxId: z.string().optional(),
          country: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          postalCode: z.string().optional(),
          bankDetails: z.string().optional(),
          currency: z.string().optional(),
          contactEmail: z.string().optional(),
          contactPhone: z.string().optional(),
          isDefault: z.boolean().optional(),
          isActive: z.boolean().optional(),
          invoicePrefix: z.string().max(20).optional(),
          logoUrl: z.string().optional(),
          logoFileKey: z.string().optional(),
          notes: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check invoicePrefix uniqueness on update
      if (input.data.invoicePrefix) {
        const allEntities = await listBillingEntities();
        const prefixDup = allEntities.find(
          (e: any) => e.invoicePrefix === input.data.invoicePrefix && e.id !== input.id
        );
        if (prefixDup) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Invoice prefix "${input.data.invoicePrefix}" is already used by billing entity "${prefixDup.entityName}".`,
          });
        }
      }
      await updateBillingEntity(input.id, input.data);
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update",
        entityType: "billing_entity",
        entityId: input.id,
        changes: JSON.stringify(input.data),
      });
      return { success: true };
    }),

  /** Upload logo image to S3 and update billing entity */
  uploadLogo: financeManagerProcedure
    .input(
      z.object({
        id: z.number(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("image/png"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `billing-entity-logos/${input.id}/${randomSuffix}-${input.fileName}`;
      const { url: rawUrl } = await storagePut(fileKey, fileBuffer, input.mimeType);
      await updateBillingEntity(input.id, { logoUrl: rawUrl, logoFileKey: fileKey });
      // Return a signed URL so the frontend can display it immediately
      let signedUrl = rawUrl;
      try {
        const { url } = await storageGet(fileKey);
        signedUrl = url;
      } catch (err) {
        console.warn("[BillingEntities] Failed to sign logo URL after upload:", err);
      }
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "update",
        entityType: "billing_entity",
        entityId: input.id,
        changes: JSON.stringify({ logoUrl: rawUrl, logoFileKey: fileKey }),
      });
      return { success: true, logoUrl: signedUrl };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteBillingEntity(input.id);
      await logAuditAction({
        userId: ctx.user.id, userName: ctx.user.name || null,
        action: "delete",
        entityType: "billing_entity",
        entityId: input.id,
      });
      return { success: true };
    }),
});
