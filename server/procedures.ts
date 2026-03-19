import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./_core/trpc";
import { hasAnyRole, isAdmin } from "../shared/roles";

// Re-export protectedProcedure so routers can import from procedures.ts
export { protectedProcedure };

/**
 * CP Context type injected by the Context Switcher.
 *
 * The Admin frontend sends two headers on every tRPC request:
 *   - x-cp-context-id:    "direct" | "<cpId>" | absent
 *   - x-cp-context-cp-id: "<cpId>" (only when mode is "direct")
 *
 * The middleware parses these into a structured object so that
 * downstream routers can scope queries without re-parsing headers.
 */
export type CpContext = {
  /** Current context mode */
  mode: "all" | "specific" | "direct";
  /** The selected CP's database ID (null when mode is "all") */
  cpId: number | null;
  /** Whether the context is EG-DIRECT (isInternal CP) */
  isDirectMode: boolean;
};

/**
 * Parse CP Context from request headers.
 * Pure function, no side effects.
 */
function parseCpContext(req: { headers?: Record<string, string | string[] | undefined> }): CpContext {
  const contextHeader = req.headers?.["x-cp-context-id"];
  const rawValue = Array.isArray(contextHeader) ? contextHeader[0] : contextHeader;

  if (!rawValue) {
    return { mode: "all", cpId: null, isDirectMode: false };
  }

  if (rawValue === "direct") {
    const cpIdHeader = req.headers?.["x-cp-context-cp-id"];
    const cpIdRaw = Array.isArray(cpIdHeader) ? cpIdHeader[0] : cpIdHeader;
    const cpId = cpIdRaw ? parseInt(cpIdRaw, 10) : null;
    return {
      mode: "direct",
      cpId: Number.isNaN(cpId) ? null : cpId,
      isDirectMode: true,
    };
  }

  const cpId = parseInt(rawValue, 10);
  if (Number.isNaN(cpId)) {
    return { mode: "all", cpId: null, isDirectMode: false };
  }

  return { mode: "specific", cpId, isDirectMode: false };
}

/**
 * Role-based procedure wrappers
 * Now supports multi-role: a user's role field can be "operations_manager,finance_manager"
 *
 * adminProcedure, customerManagerProcedure, operationsManagerProcedure, and
 * financeManagerProcedure now inject `ctx.cpContext` parsed from request headers,
 * enabling downstream routers to scope data by the selected CP context.
 */

// Admin can do everything — now with CP Context injection
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdmin(ctx.user.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  const cpContext = parseCpContext(ctx.req);
  return next({ ctx: { ...ctx, cpContext } });
});

// Customer Manager: Create/manage customers and employees — with CP Context
export const customerManagerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasAnyRole(ctx.user.role, ["admin", "customer_manager"])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Customer Manager access required",
    });
  }
  const cpContext = parseCpContext(ctx.req);
  return next({ ctx: { ...ctx, cpContext } });
});

// Operations Manager: Manage payroll, leave, reimbursement — with CP Context
export const operationsManagerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasAnyRole(ctx.user.role, ["admin", "operations_manager"])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Operations Manager access required",
    });
  }
  const cpContext = parseCpContext(ctx.req);
  return next({ ctx: { ...ctx, cpContext } });
});

// Finance Manager: Manage invoices and billing — with CP Context
export const financeManagerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasAnyRole(ctx.user.role, ["admin", "finance_manager"])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Finance Manager access required",
    });
  }
  const cpContext = parseCpContext(ctx.req);
  return next({ ctx: { ...ctx, cpContext } });
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
