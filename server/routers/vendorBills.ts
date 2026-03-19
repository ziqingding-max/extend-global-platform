import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure, userProcedure } from "../procedures";
import {
  createVendorBill,
  getVendorBillById,
  listVendorBills,
  updateVendorBill,
  deleteVendorBill,
  createVendorBillItem,
  listVendorBillItemsByBill,
  updateVendorBillItem,
  deleteVendorBillItem,
  getVendorById,
  logAuditAction,
} from "../db";
import { TRPCError } from "@trpc/server";

const billItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.string().default("1"),
  unitPrice: z.string(),
  amount: z.string(),
  itemType: z.enum(["employment_cost", "service_fee", "visa_fee", "equipment_purchase", "deposit", "deposit_refund", "other"]).default("other"),
  relatedCustomerId: z.number().optional(),
  relatedEmployeeId: z.number().optional(),
  relatedCountryCode: z.string().optional(),
});

export const vendorBillsRouter = router({
  list: userProcedure
    .input(
      z.object({
        vendorId: z.number().optional(),
        status: z.string().optional(),
        category: z.string().optional(),
        billMonth: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const page = Math.floor(input.offset / input.limit) + 1;
      return await listVendorBills({
        page,
        pageSize: input.limit,
        vendorId: input.vendorId,
        status: input.status,
        category: input.category,
        billMonth: input.billMonth,
        search: input.search,
      });
    }),

  get: userProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const bill = await getVendorBillById(input.id);
      if (!bill) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor bill not found" });
      }
      const items = await listVendorBillItemsByBill(input.id);
      const vendor = await getVendorById(bill.vendorId);
      return { ...bill, items, vendor };
    }),

  create: financeManagerProcedure
    .input(
      z.object({
        vendorId: z.number(),
        billNumber: z.string().min(1, "Bill number is required"),
        billDate: z.string(), // YYYY-MM-DD
        dueDate: z.string().optional(),
        paidDate: z.string().optional(),
        billMonth: z.string().optional(), // YYYY-MM
        currency: z.string().default("USD"),
        subtotal: z.string(),
        tax: z.string().default("0"),
        totalAmount: z.string(),
        status: z
          .enum(["draft", "pending_approval", "approved", "paid", "partially_paid", "overdue", "cancelled", "void"])
          .default("draft"),
        category: z
          .enum([
            "payroll_processing",
            "social_contributions",
            "tax_filing",
            "legal_compliance",
            "visa_immigration",
            "hr_advisory",
            "it_services",
            "office_rent",
            "insurance",
            "bank_charges",
            "consulting",
            "equipment",
            "travel",
            "marketing",
            "penalty",
            "late_payment_fee",
            "other",
          ])
          .default("other"),
        billType: z.enum(["operational", "deposit", "deposit_refund", "service_fee", "pass_through", "bank_charge"]).default("operational"),
        // Dual-currency tracking fields
        localAmount: z.string().optional(),
        localCurrency: z.string().optional(),
        settlementAmountUsd: z.string().optional(),
        fxRateActual: z.string().optional(),
        countryCode: z.string().optional(),
        payrollMonth: z.string().optional(),
        description: z.string().optional(),
        internalNotes: z.string().optional(),
        receiptFileUrl: z.string().optional(),
        receiptFileKey: z.string().optional(),
        items: z.array(billItemSchema).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { items, ...billData } = input;

      // Validate vendor exists
      const vendor = await getVendorById(billData.vendorId);
      if (!vendor) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
      }

      // Government vendor: enforce pass_through billType and require dual-currency fields
      if (vendor.vendorType === "government") {
        if (billData.billType !== "pass_through") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Government vendor bills must use 'pass_through' bill type" });
        }
        if (!billData.localAmount || !billData.localCurrency || !billData.settlementAmountUsd) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Government vendor bills require localAmount, localCurrency, and settlementAmountUsd" });
        }
        if (!billData.countryCode) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Government vendor bills require a countryCode" });
        }
      }

      // Convert date strings
      const billValues: any = {
        ...billData,
        billDate: new Date(billData.billDate),
        dueDate: billData.dueDate ? new Date(billData.dueDate) : undefined,
        paidDate: billData.paidDate ? new Date(billData.paidDate) : undefined,
        billMonth: billData.billMonth ? new Date(`${billData.billMonth}-01`) : undefined,
        submittedBy: ctx.user.id,
        submittedAt: new Date(),
      };

      const insertId = await createVendorBill(billValues);

      // Create line items if provided
      if (items && items.length > 0 && insertId) {
        for (const item of items) {
          await createVendorBillItem({
            vendorBillId: insertId,
            ...item,
          });
        }
      }

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "create",
        entityType: "vendor_bill",
        entityId: insertId,
        changes: { created: { ...billData, itemCount: items?.length || 0 } },
      });

      return { id: insertId, message: "Vendor bill created successfully" };
    }),

  update: financeManagerProcedure
    .input(
      z.object({
        id: z.number(),
        vendorId: z.number().optional(),
        billNumber: z.string().optional(),
        billDate: z.string().optional(),
        dueDate: z.string().optional().nullable(),
        paidDate: z.string().optional().nullable(),
        billMonth: z.string().optional().nullable(),
        currency: z.string().optional(),
        subtotal: z.string().optional(),
        tax: z.string().optional(),
        totalAmount: z.string().optional(),
        paidAmount: z.string().optional(),
        status: z
          .enum(["draft", "pending_approval", "approved", "paid", "partially_paid", "overdue", "cancelled", "void"])
          .optional(),
        category: z
          .enum([
            "payroll_processing",
            "social_contributions",
            "tax_filing",
            "legal_compliance",
            "visa_immigration",
            "hr_advisory",
            "it_services",
            "office_rent",
            "insurance",
            "bank_charges",
            "consulting",
            "equipment",
            "travel",
            "marketing",
            "penalty",
            "late_payment_fee",
            "other",
          ])
          .optional(),
        billType: z.enum(["operational", "deposit", "deposit_refund", "service_fee", "pass_through", "bank_charge"]).optional(),
        // Dual-currency tracking fields
        localAmount: z.string().optional().nullable(),
        localCurrency: z.string().optional().nullable(),
        settlementAmountUsd: z.string().optional().nullable(),
        fxRateActual: z.string().optional().nullable(),
        countryCode: z.string().optional().nullable(),
        payrollMonth: z.string().optional().nullable(),
        description: z.string().optional(),
        internalNotes: z.string().optional(),
        receiptFileUrl: z.string().optional().nullable(),
        receiptFileKey: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const existing = await getVendorBillById(id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor bill not found" });
      }

      // Convert date strings
      const updateValues: any = { ...data };
      if (data.billDate) updateValues.billDate = new Date(data.billDate);
      if (data.dueDate) updateValues.dueDate = new Date(data.dueDate);
      if (data.dueDate === null) updateValues.dueDate = null;
      if (data.paidDate) updateValues.paidDate = new Date(data.paidDate);
      if (data.paidDate === null) updateValues.paidDate = null;
      if (data.billMonth) updateValues.billMonth = new Date(`${data.billMonth}-01`);
      if (data.billMonth === null) updateValues.billMonth = null;

      // If marking as approved, record approver
      if (data.status === "approved") {
        updateValues.approvedBy = ctx.user.id;
        updateValues.approvedAt = new Date();
      }

      await updateVendorBill(id, updateValues);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "update",
        entityType: "vendor_bill",
        entityId: id,
        changes: { before: existing, after: data },
      });

      return { success: true, message: "Vendor bill updated successfully" };
    }),

  delete: financeManagerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getVendorBillById(input.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor bill not found" });
      }

      if (!["draft", "cancelled"].includes(existing.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft or cancelled bills can be deleted",
        });
      }

      // Delete items first
      const items = await listVendorBillItemsByBill(input.id);
      for (const item of items) {
        await deleteVendorBillItem(item.id);
      }

      await deleteVendorBill(input.id);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "delete",
        entityType: "vendor_bill",
        entityId: input.id,
        changes: { deleted: existing },
      });

      return { success: true, message: "Vendor bill deleted successfully" };
    }),

  // ── Bill Items CRUD ──

  addItem: financeManagerProcedure
    .input(
      z.object({
        vendorBillId: z.number(),
        description: z.string().min(1),
        quantity: z.string().default("1"),
        unitPrice: z.string(),
        amount: z.string(),
        relatedCustomerId: z.number().optional(),
        relatedEmployeeId: z.number().optional(),
        relatedCountryCode: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const bill = await getVendorBillById(input.vendorBillId);
      if (!bill) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor bill not found" });
      }
      const insertId = await createVendorBillItem(input);
      return { id: insertId, message: "Item added successfully" };
    }),

  updateItem: financeManagerProcedure
    .input(
      z.object({
        id: z.number(),
        description: z.string().optional(),
        quantity: z.string().optional(),
        unitPrice: z.string().optional(),
        amount: z.string().optional(),
        relatedCustomerId: z.number().optional().nullable(),
        relatedEmployeeId: z.number().optional().nullable(),
        relatedCountryCode: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateVendorBillItem(id, data as any);
      return { success: true, message: "Item updated successfully" };
    }),

  deleteItem: financeManagerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteVendorBillItem(input.id);
      return { success: true, message: "Item deleted successfully" };
    }),

  listItems: userProcedure
    .input(z.object({ vendorBillId: z.number() }))
    .query(async ({ input }) => {
      return await listVendorBillItemsByBill(input.vendorBillId);
    }),
});
