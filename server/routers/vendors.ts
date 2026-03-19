import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure, userProcedure } from "../procedures";
import {
  createVendor,
  getVendorById,
  listVendors,
  updateVendor,
  deleteVendor,
  logAuditAction,
} from "../db";
import { TRPCError } from "@trpc/server";

export const vendorsRouter = router({
  list: userProcedure
    .input(
      z.object({
        status: z.string().optional(),
        country: z.string().optional(),
        vendorType: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const page = Math.floor(input.offset / input.limit) + 1;
      return await listVendors({
        page,
        pageSize: input.limit,
        status: input.status,
        country: input.country,
        vendorType: input.vendorType,
        search: input.search,
      });
    }),

  get: userProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const vendor = await getVendorById(input.id);
      if (!vendor) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
      }
      return vendor;
    }),

  create: financeManagerProcedure
    .input(
      z.object({
        name: z.string().min(1, "Vendor name is required"),
        legalName: z.string().optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().email().optional().or(z.literal("")),
        contactPhone: z.string().optional(),
        country: z.string().min(1, "Country is required"),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        serviceType: z.string().optional(),
        currency: z.string().default("USD"),
        bankDetails: z.string().optional(),
        taxId: z.string().optional(),
        paymentTermDays: z.number().default(30),
        vendorType: z.enum(["government", "financial", "professional_service", "equipment_provider", "hr_recruitment", "operational"]).default("operational"),
        status: z.enum(["active", "inactive"]).default("active"),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createVendor(input);
      const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "create",
        entityType: "vendor",
        entityId: insertId,
        changes: { created: input },
      });

      return { id: insertId, message: "Vendor created successfully" };
    }),

  update: financeManagerProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        legalName: z.string().optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().email().optional().or(z.literal("")),
        contactPhone: z.string().optional(),
        country: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        serviceType: z.string().optional(),
        currency: z.string().optional(),
        bankDetails: z.string().optional(),
        taxId: z.string().optional(),
        paymentTermDays: z.number().optional(),
        vendorType: z.enum(["government", "financial", "professional_service", "equipment_provider", "hr_recruitment", "operational"]).optional(),
        status: z.enum(["active", "inactive"]).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const existing = await getVendorById(id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
      }

      await updateVendor(id, data);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "update",
        entityType: "vendor",
        entityId: id,
        changes: { before: existing, after: data },
      });

      return { success: true, message: "Vendor updated successfully" };
    }),

  delete: financeManagerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getVendorById(input.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
      }

      await deleteVendor(input.id);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "delete",
        entityType: "vendor",
        entityId: input.id,
        changes: { deleted: existing },
      });

      return { success: true, message: "Vendor deleted successfully" };
    }),
});
