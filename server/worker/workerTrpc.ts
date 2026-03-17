/**
 * Worker Portal tRPC Setup
 *
 * COMPLETELY SEPARATE tRPC instance from admin and customer portal.
 * Every procedure that accesses data MUST go through protectedWorkerProcedure,
 * which injects ctx.workerUser into the context.
 *
 * Identity-based middleware:
 * - contractorOnlyProcedure: Only accessible by contractor workers
 * - employeeOnlyProcedure: Only accessible by employee workers
 */

import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import {
  authenticateWorkerRequest,
  type WorkerUserContext,
} from "./workerAuth";

// ============================================================================
// Context
// ============================================================================

export type WorkerContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  workerUser: WorkerUserContext | null;
};

export async function createWorkerContext(
  opts: CreateExpressContextOptions
): Promise<WorkerContext> {
  let workerUser: WorkerUserContext | null = null;

  try {
    workerUser = await authenticateWorkerRequest(opts.req);
  } catch {
    workerUser = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    workerUser,
  };
}

// ============================================================================
// tRPC Instance
// ============================================================================

const t = initTRPC.context<WorkerContext>().create({
  transformer: superjson,
});

export const workerRouter = t.router;

/**
 * Public worker procedure — ONLY for auth endpoints (login, register, verify invite).
 * MUST NOT be used for any data-access endpoints.
 */
export const workerPublicProcedure = t.procedure;

/**
 * Protected worker procedure — EVERY data-access endpoint MUST use this.
 * Guarantees:
 * 1. User is authenticated via worker JWT
 * 2. ctx.workerUser is always populated
 */
const requireWorkerUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.workerUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource",
    });
  }

  return next({
    ctx: {
      ...ctx,
      workerUser: ctx.workerUser, // guaranteed non-null
    },
  });
});

export const protectedWorkerProcedure = t.procedure.use(requireWorkerUser);

/**
 * Contractor-only procedure — for routes that only contractors can access.
 * e.g., Invoices, Milestones
 */
const requireContractor = t.middleware(async ({ ctx, next }) => {
  if (!ctx.workerUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource",
    });
  }

  if (ctx.workerUser.activeRole !== "contractor" || !ctx.workerUser.contractorId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This feature is only available for contractors",
    });
  }

  return next({
    ctx: {
      ...ctx,
      workerUser: ctx.workerUser,
    },
  });
});

export const contractorOnlyProcedure = t.procedure.use(requireContractor);

/**
 * Employee-only procedure — for routes that only employees can access.
 * e.g., Leave, Reimbursements, Payslips
 */
const requireEmployee = t.middleware(async ({ ctx, next }) => {
  if (!ctx.workerUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource",
    });
  }

  if (ctx.workerUser.activeRole !== "employee" || !ctx.workerUser.employeeId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This feature is only available for employees",
    });
  }

  return next({
    ctx: {
      ...ctx,
      workerUser: ctx.workerUser,
    },
  });
});

export const employeeOnlyProcedure = t.procedure.use(requireEmployee);
