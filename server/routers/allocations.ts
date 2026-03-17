import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure, userProcedure } from "../procedures";
import {
  createBillInvoiceAllocation,
  getBillInvoiceAllocationById,
  listAllocationsByBill,
  listAllocationsByInvoice,
  listDetailedAllocationsByBill,
  listDetailedAllocationsByInvoice,
  updateBillInvoiceAllocation,
  deleteBillInvoiceAllocation,
  deleteAllocationsByBill,
  getBillAllocatedTotal,
  getInvoiceCostAllocatedTotal,
  recalcBillAllocation,
  recalcInvoiceCostAllocation,
  getVendorBillById,
  getInvoiceProfitAnalysis,
  getVendorProfitAnalysis,
  logAuditAction,
  listVendors,
  getDb,
  getEmployeeMonthlyRevenue,
  getAllEmployeesMonthlyRevenue,
} from "../db";
import { TRPCError } from "@trpc/server";
import { invoices, employees, vendors, billInvoiceAllocations, vendorBills } from "../../drizzle/schema";
import { eq, sql, and, desc } from "drizzle-orm";

export const allocationsRouter = router({
  // List allocations for a specific vendor bill (with employee + invoice details)
  listByBill: userProcedure
    .input(z.object({ vendorBillId: z.number() }))
    .query(async ({ input }) => {
      return await listDetailedAllocationsByBill(input.vendorBillId);
    }),

  // List allocations for a specific invoice (with employee + bill details)
  listByInvoice: userProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ input }) => {
      return await listDetailedAllocationsByInvoice(input.invoiceId);
    }),

  // Get allocation summary for a bill (totals + validation info)
  billSummary: userProcedure
    .input(z.object({ vendorBillId: z.number() }))
    .query(async ({ input }) => {
      const bill = await getVendorBillById(input.vendorBillId);
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
      const allocatedTotal = await getBillAllocatedTotal(input.vendorBillId);
      const totalAmount = parseFloat(String(bill.totalAmount));
      return {
        vendorBillId: input.vendorBillId,
        billNumber: bill.billNumber,
        totalAmount,
        allocatedTotal,
        unallocatedAmount: totalAmount - allocatedTotal,
        isFullyAllocated: allocatedTotal >= totalAmount,
        isOverAllocated: allocatedTotal > totalAmount,
      };
    }),

  // Get allocation summary for an invoice (totals + profit info)
  invoiceSummary: userProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ input }) => {
      return await getInvoiceProfitAnalysis(input.invoiceId);
    }),

  // Get vendor profit analysis
  vendorAnalysis: userProcedure
    .input(z.object({ vendorId: z.number() }))
    .query(async ({ input }) => {
      return await getVendorProfitAnalysis(input.vendorId);
    }),

  // Create a new allocation (link bill item to invoice via employee)
  create: financeManagerProcedure
    .input(
      z.object({
        vendorBillId: z.number(),
        vendorBillItemId: z.number().optional(),
        invoiceId: z.number(),
        employeeId: z.number(),
        allocatedAmount: z.string().refine((v) => parseFloat(v) > 0, "Amount must be positive"),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const amount = parseFloat(input.allocatedAmount);

      // Validate bill exists
      const bill = await getVendorBillById(input.vendorBillId);
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor bill not found" });

      // Validate invoice exists
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const invRows = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
      if (!invRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      // Validate billType vs invoiceType matching
      const inv = invRows[0];
      const billType = (bill as any).billType || 'operational';
      if (inv.invoiceType === 'credit_note' || inv.invoiceType === 'deposit_refund') {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot allocate costs to ${inv.invoiceType.replace('_', ' ')}` });
      }
      if (billType === 'deposit' && inv.invoiceType !== 'deposit') {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Deposit vendor bills can only be allocated to deposit invoices" });
      }
      if (billType === 'operational' && inv.invoiceType === 'deposit') {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Operational vendor bills should not be allocated to deposit invoices. Use a deposit-type vendor bill instead." });
      }

      // Validate employee exists
      const empRows = await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1);
      if (!empRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      // Check bill-side allocation cap (warn but allow)
      const billAllocated = await getBillAllocatedTotal(input.vendorBillId);
      const billTotal = parseFloat(String(bill.totalAmount));
      const newBillTotal = billAllocated + amount;

      // Check invoice-side allocation cap (warn but allow - loss scenario)
      const invoiceCostTotal = await getInvoiceCostAllocatedTotal(input.invoiceId);
      const invoiceTotal = parseFloat(String(invRows[0].total));
      const newInvoiceCostTotal = invoiceCostTotal + amount;

      // Check employee monthly revenue ceiling (warn but allow)
      const billMonth = (bill as any).billMonth;
      let employeeRevenueWarning = false;
      let employeeRevenue = 0;
      let employeeAllocatedTotal = 0;
      if (billMonth) {
        const monthStr = typeof billMonth === 'string' ? billMonth.substring(0, 7) : new Date(billMonth).toISOString().substring(0, 7);
        const revenueData = await getEmployeeMonthlyRevenue(input.employeeId, monthStr);
        employeeRevenue = revenueData.total;
        // Get existing allocations for this employee in this month
        const existingAllocations = await db
          .select({ allocatedAmount: billInvoiceAllocations.allocatedAmount })
          .from(billInvoiceAllocations)
          .innerJoin(vendorBills, eq(billInvoiceAllocations.vendorBillId, vendorBills.id))
          .where(
            and(
              eq(billInvoiceAllocations.employeeId, input.employeeId),
              sql`strftime('%Y-%m', ${vendorBills.billMonth}) = ${monthStr}`
            )
          );
        employeeAllocatedTotal = existingAllocations.reduce((sum, a) => sum + parseFloat(String(a.allocatedAmount || '0')), 0);
        if (employeeRevenue > 0 && (employeeAllocatedTotal + amount) > employeeRevenue) {
          employeeRevenueWarning = true;
        }
      }

      // Create the allocation
      const allocationId = await createBillInvoiceAllocation({
        vendorBillId: input.vendorBillId,
        vendorBillItemId: input.vendorBillItemId,
        invoiceId: input.invoiceId,
        employeeId: input.employeeId,
        allocatedAmount: input.allocatedAmount,
        description: input.description,
        allocatedBy: ctx.user.id,
      });

      // Recalculate denormalized fields
      await recalcBillAllocation(input.vendorBillId);
      await recalcInvoiceCostAllocation(input.invoiceId);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "create",
        entityType: "bill_invoice_allocation",
        entityId: allocationId,
        changes: { created: input },
      });

      return {
        id: allocationId,
        message: "Allocation created successfully",
        warnings: {
          billOverAllocated: newBillTotal > billTotal,
          billOverAmount: newBillTotal > billTotal ? newBillTotal - billTotal : 0,
          invoiceLoss: newInvoiceCostTotal > invoiceTotal,
          invoiceLossAmount: newInvoiceCostTotal > invoiceTotal ? newInvoiceCostTotal - invoiceTotal : 0,
          employeeRevenueExceeded: employeeRevenueWarning,
          employeeRevenue,
          employeeAllocatedTotal: employeeAllocatedTotal + amount,
        },
      };
    }),

  // Batch create allocations (for AI-parsed results)
  batchCreate: financeManagerProcedure
    .input(
      z.object({
        allocations: z.array(
          z.object({
            vendorBillId: z.number(),
            vendorBillItemId: z.number().optional(),
            invoiceId: z.number(),
            employeeId: z.number(),
            allocatedAmount: z.string(),
            description: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const results = [];
      const affectedBills: number[] = [];
      const affectedInvoices: number[] = [];

      for (const alloc of input.allocations) {
        const allocationId = await createBillInvoiceAllocation({
          ...alloc,
          allocatedBy: ctx.user.id,
        });
        results.push({ id: allocationId });
        if (!affectedBills.includes(alloc.vendorBillId)) affectedBills.push(alloc.vendorBillId);
        if (!affectedInvoices.includes(alloc.invoiceId)) affectedInvoices.push(alloc.invoiceId);
      }

      // Recalculate all affected denormalized fields
      for (const billId of affectedBills) {
        await recalcBillAllocation(billId);
      }
      for (const invoiceId of affectedInvoices) {
        await recalcInvoiceCostAllocation(invoiceId);
      }

      return { created: results.length, results };
    }),

  // Update an allocation
  update: financeManagerProcedure
    .input(
      z.object({
        id: z.number(),
        allocatedAmount: z.string().optional(),
        description: z.string().optional(),
        invoiceId: z.number().optional(),
        employeeId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await getBillInvoiceAllocationById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Allocation not found" });

      const { id, ...data } = input;
      await updateBillInvoiceAllocation(id, data as any);

      // Recalculate affected denormalized fields
      await recalcBillAllocation(existing.vendorBillId);
      await recalcInvoiceCostAllocation(existing.invoiceId);
      // If invoice changed, recalculate the new one too
      if (input.invoiceId && input.invoiceId !== existing.invoiceId) {
        await recalcInvoiceCostAllocation(input.invoiceId);
      }

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "update",
        entityType: "bill_invoice_allocation",
        entityId: id,
        changes: { before: existing, after: data },
      });

      return { success: true, message: "Allocation updated" };
    }),

  // Delete an allocation
  delete: financeManagerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getBillInvoiceAllocationById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Allocation not found" });

      await deleteBillInvoiceAllocation(input.id);

      // Recalculate denormalized fields
      await recalcBillAllocation(existing.vendorBillId);
      await recalcInvoiceCostAllocation(existing.invoiceId);

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "delete",
        entityType: "bill_invoice_allocation",
        entityId: input.id,
        changes: { deleted: existing },
      });

      return { success: true, message: "Allocation deleted" };
    }),

  // Delete all allocations for a bill
  deleteAllForBill: financeManagerProcedure
    .input(z.object({ vendorBillId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Get affected invoices before deletion
      const allocations = await listAllocationsByBill(input.vendorBillId);
      const affectedInvoiceIds = allocations.map((a) => a.invoiceId).filter((v, i, arr) => arr.indexOf(v) === i);

      await deleteAllocationsByBill(input.vendorBillId);

      // Recalculate
      await recalcBillAllocation(input.vendorBillId);
      for (const invoiceId of affectedInvoiceIds) {
        await recalcInvoiceCostAllocation(invoiceId);
      }

      return { success: true, deleted: allocations.length };
    }),

  // Get profit analysis across all invoices (for P&L enhancement)
  profitOverview: userProcedure
    .input(
      z.object({
        startMonth: z.string().optional(), // YYYY-MM
        endMonth: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get invoices with cost allocation data
      let conditions: any[] = [];
      if (input.startMonth) {
        conditions.push(sql`${invoices.invoiceMonth} >= ${input.startMonth + '-01'}`);
      }
      if (input.endMonth) {
        conditions.push(sql`${invoices.invoiceMonth} <= ${input.endMonth + '-01'}`);
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const invList = await db.select().from(invoices).where(where).orderBy(desc(invoices.invoiceMonth));

      const results = [];
      for (const inv of invList) {
        const costAllocated = parseFloat(String(inv.costAllocated || "0"));
        const revenue = parseFloat(String(inv.total));
        const profit = revenue - costAllocated;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

        // Get customer info
        const customerRows = await db.select().from(
          (await import("../../drizzle/schema")).customers
        ).where(eq((await import("../../drizzle/schema")).customers.id, inv.customerId)).limit(1);

        results.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceMonth: inv.invoiceMonth,
          customerId: inv.customerId,
          customerName: customerRows[0]?.companyName || "Unknown",
          revenue,
          costAllocated,
          profit,
          profitMargin: Math.round(margin * 100) / 100,
          isLoss: profit < 0,
        });
      }

      // Summary
      const totalRevenue = results.reduce((sum, r) => sum + r.revenue, 0);
      const totalCost = results.reduce((sum, r) => sum + r.costAllocated, 0);
      const totalProfit = totalRevenue - totalCost;
      const lossInvoices = results.filter((r) => r.isLoss);

      return {
        invoices: results,
        summary: {
          totalRevenue,
          totalCost,
          totalProfit,
          overallMargin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0,
          invoiceCount: results.length,
          lossCount: lossInvoices.length,
        },
      };
    }),

  // Vendor cost-effectiveness comparison
  vendorComparison: userProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const vendorList = await db.select().from(vendors).where(eq(vendors.status, "active"));
      const results = [];

      for (const vendor of vendorList) {
        const analysis = await getVendorProfitAnalysis(vendor.id);
        results.push({
          vendorName: vendor.name,
          vendorCode: vendor.vendorCode,
          country: vendor.country,
          serviceType: vendor.serviceType,
          ...analysis,
        });
      }

      return results.sort((a, b) => b.totalBilled - a.totalBilled);
    }),

  // Get monthly revenue for all employees (used by allocation UI for ceiling display)
  employeeMonthlyRevenue: userProcedure
    .input(z.object({ serviceMonth: z.string() })) // YYYY-MM
    .query(async ({ input }) => {
      return await getAllEmployeesMonthlyRevenue(input.serviceMonth);
    }),

  // Get monthly revenue for a single employee (used for inline validation)
  singleEmployeeRevenue: userProcedure
    .input(z.object({ employeeId: z.number(), serviceMonth: z.string() }))
    .query(async ({ input }) => {
      return await getEmployeeMonthlyRevenue(input.employeeId, input.serviceMonth);
    }),
});
