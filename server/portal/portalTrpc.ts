/**
 * Portal tRPC Setup
 *
 * COMPLETELY SEPARATE tRPC instance from admin.
 * Every procedure that accesses data MUST go through protectedPortalProcedure,
 * which injects ctx.portalUser (including customerId) into the context.
 *
 * SECURITY: There is NO publicProcedure that can access customer data.
 * The only "public" procedures are login/register which don't return customer data.
 */

import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import {
  authenticatePortalRequest,
  type PortalUser,
} from "./portalAuth";
import {
  PORTAL_UNAUTHED_ERR_MSG,
  PORTAL_FORBIDDEN_ERR_MSG,
} from "../../shared/const";

// ============================================================================
// Context
// ============================================================================

export type PortalContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  portalUser: PortalUser | null;
};

export async function createPortalContext(
  opts: CreateExpressContextOptions
): Promise<PortalContext> {
  let portalUser: PortalUser | null = null;

  try {
    portalUser = await authenticatePortalRequest(opts.req);
  } catch {
    portalUser = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    portalUser,
  };
}

// ============================================================================
// tRPC Instance (separate from admin)
// ============================================================================

const t = initTRPC.context<PortalContext>().create({
  transformer: superjson,
});

export const portalRouter = t.router;

/**
 * Public portal procedure — ONLY for auth endpoints (login, register, verify invite).
 * MUST NOT be used for any data-access endpoints.
 */
export const portalPublicProcedure = t.procedure;

/**
 * Protected portal procedure — EVERY data-access endpoint MUST use this.
 * Guarantees:
 * 1. User is authenticated via portal JWT (not admin OAuth)
 * 2. ctx.portalUser is always populated with contactId, customerId, portalRole
 * 3. All downstream queries MUST use ctx.portalUser.customerId for filtering
 */
const requirePortalUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.portalUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: PORTAL_UNAUTHED_ERR_MSG,
    });
  }

  return next({
    ctx: {
      ...ctx,
      portalUser: ctx.portalUser, // guaranteed non-null
    },
  });
});

export const protectedPortalProcedure = t.procedure.use(requirePortalUser);

/**
 * Portal Admin procedure — only contacts with portalRole === 'admin' can use.
 * Used for: inviting users, managing settings, etc.
 */
export const portalAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.portalUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: PORTAL_UNAUTHED_ERR_MSG,
      });
    }

    if (ctx.portalUser.portalRole !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: PORTAL_FORBIDDEN_ERR_MSG,
      });
    }

    return next({
      ctx: {
        ...ctx,
        portalUser: ctx.portalUser,
      },
    });
  })
);

/**
 * Portal HR Manager procedure — admin + hr_manager can use.
 * Used for: onboarding, leave, adjustments, employee management.
 */
export const portalHrProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.portalUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: PORTAL_UNAUTHED_ERR_MSG,
      });
    }

    if (!["admin", "hr_manager"].includes(ctx.portalUser.portalRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: PORTAL_FORBIDDEN_ERR_MSG,
      });
    }

    return next({
      ctx: {
        ...ctx,
        portalUser: ctx.portalUser,
      },
    });
  })
);

/**
 * Portal Finance procedure — admin + finance can use.
 * Used for: viewing invoices, financial data.
 */
export const portalFinanceProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.portalUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: PORTAL_UNAUTHED_ERR_MSG,
      });
    }

    if (!["admin", "finance"].includes(ctx.portalUser.portalRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: PORTAL_FORBIDDEN_ERR_MSG,
      });
    }

    return next({
      ctx: {
        ...ctx,
        portalUser: ctx.portalUser,
      },
    });
  })
);
