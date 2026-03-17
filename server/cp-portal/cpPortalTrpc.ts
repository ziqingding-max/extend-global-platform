/**
 * CP Portal tRPC Setup
 *
 * COMPLETELY SEPARATE tRPC instance from admin and client portal.
 * Every procedure that accesses data MUST go through protectedCpProcedure,
 * which injects ctx.cpUser (including channelPartnerId) into the context.
 *
 * SECURITY:
 * - Uses its own JWT issuer ("eg-cp-portal"), cookie ("cp_portal_session"), and context
 * - There is NO public procedure that can access CP data
 * - The only "public" procedures are login/register/branding which don't return sensitive data
 * - All downstream queries MUST use ctx.cpUser.channelPartnerId for data isolation
 */

import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import {
  authenticateCpPortalRequest,
  type CpPortalUser,
} from "./cpPortalAuth";
import {
  CP_PORTAL_UNAUTHED_ERR_MSG,
  CP_PORTAL_FORBIDDEN_ERR_MSG,
} from "../../shared/const";

// ============================================================================
// Context
// ============================================================================

export type CpPortalContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  cpUser: CpPortalUser | null;
};

export async function createCpPortalContext(
  opts: CreateExpressContextOptions
): Promise<CpPortalContext> {
  let cpUser: CpPortalUser | null = null;

  try {
    cpUser = await authenticateCpPortalRequest(opts.req);
  } catch {
    cpUser = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    cpUser,
  };
}

// ============================================================================
// tRPC Instance (separate from admin and client portal)
// ============================================================================

const t = initTRPC.context<CpPortalContext>().create({
  transformer: superjson,
});

export const cpPortalRouter = t.router;

/**
 * Public CP portal procedure — ONLY for auth endpoints (login, register, verify invite, branding).
 * MUST NOT be used for any data-access endpoints.
 */
export const cpPublicProcedure = t.procedure;

/**
 * Protected CP portal procedure — EVERY data-access endpoint MUST use this.
 * Guarantees:
 * 1. User is authenticated via CP Portal JWT (not admin OAuth or client portal JWT)
 * 2. ctx.cpUser is always populated with contactId, channelPartnerId, cpRole
 * 3. All downstream queries MUST use ctx.cpUser.channelPartnerId for data isolation
 */
const requireCpUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.cpUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: CP_PORTAL_UNAUTHED_ERR_MSG,
    });
  }

  return next({
    ctx: {
      ...ctx,
      cpUser: ctx.cpUser, // guaranteed non-null
    },
  });
});

export const protectedCpProcedure = t.procedure.use(requireCpUser);

/**
 * CP Admin procedure — only contacts with cpRole === 'cp_admin' can use.
 * Used for: managing settings, inviting users, branding config, etc.
 */
export const cpAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.cpUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: CP_PORTAL_UNAUTHED_ERR_MSG,
      });
    }

    if (ctx.cpUser.cpRole !== "cp_admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: CP_PORTAL_FORBIDDEN_ERR_MSG,
      });
    }

    return next({
      ctx: {
        ...ctx,
        cpUser: ctx.cpUser,
      },
    });
  })
);

/**
 * CP Finance procedure — cp_admin + cp_finance can use.
 * Used for: viewing invoices, wallet, financial data.
 */
export const cpFinanceProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.cpUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: CP_PORTAL_UNAUTHED_ERR_MSG,
      });
    }

    if (!["cp_admin", "cp_finance"].includes(ctx.cpUser.cpRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: CP_PORTAL_FORBIDDEN_ERR_MSG,
      });
    }

    return next({
      ctx: {
        ...ctx,
        cpUser: ctx.cpUser,
      },
    });
  })
);

/**
 * CP HR procedure — cp_admin + cp_hr can use.
 * Used for: managing end clients, employees, onboarding.
 */
export const cpHrProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.cpUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: CP_PORTAL_UNAUTHED_ERR_MSG,
      });
    }

    if (!["cp_admin", "cp_hr"].includes(ctx.cpUser.cpRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: CP_PORTAL_FORBIDDEN_ERR_MSG,
      });
    }

    return next({
      ctx: {
        ...ctx,
        cpUser: ctx.cpUser,
      },
    });
  })
);
