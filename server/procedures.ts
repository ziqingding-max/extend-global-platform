import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./_core/trpc";
import { hasAnyRole, isAdmin } from "../shared/roles";

// Re-export protectedProcedure so routers can import from procedures.ts
export { protectedProcedure };

/**
 * Role-based procedure wrappers
 * Now supports multi-role: a user's role field can be "operations_manager,finance_manager"
 */

// Admin can do everything
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdmin(ctx.user.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx });
});

// Customer Manager: Create/manage customers and employees
export const customerManagerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasAnyRole(ctx.user.role, ["admin", "customer_manager"])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Customer Manager access required",
    });
  }
  return next({ ctx });
});

// Operations Manager: Manage payroll, leave, reimbursement
export const operationsManagerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasAnyRole(ctx.user.role, ["admin", "operations_manager"])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Operations Manager access required",
    });
  }
  return next({ ctx });
});

// Finance Manager: Manage invoices and billing
export const financeManagerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasAnyRole(ctx.user.role, ["admin", "finance_manager"])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Finance Manager access required",
    });
  }
  return next({ ctx });
});

// Sales: CRM and Quotations
export const salesProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasAnyRole(ctx.user.role, ["admin", "sales"])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sales access required",
    });
  }
  return next({ ctx });
});

// CRM Access: Sales + Customer Manager
export const crmProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasAnyRole(ctx.user.role, ["admin", "sales", "customer_manager"])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "CRM access required",
    });
  }
  return next({ ctx });
});

// Any authenticated user
export const userProcedure = protectedProcedure;
