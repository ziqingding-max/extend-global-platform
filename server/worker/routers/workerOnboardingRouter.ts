/**
 * Worker Onboarding Router
 *
 * Handles public onboarding flow (validating invite token).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  workerRouter,
  workerPublicProcedure,
} from "../workerTrpc";
import { getDb } from "../../services/db/connection";
import { workerUsers, contractors } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

export const workerOnboardingRouter = workerRouter({
  /**
   * Validate invite token and get basic info
   */
  validateInvite: workerPublicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [user] = await db
        .select({
          email: workerUsers.email,
          inviteExpiresAt: workerUsers.inviteExpiresAt,
          isActive: workerUsers.isActive,
        })
        .from(workerUsers)
        .where(eq(workerUsers.inviteToken, input.token));

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid invite link",
        });
      }

      if (user.isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Account already active. Please login instead.",
        });
      }

      if (user.inviteExpiresAt && new Date(user.inviteExpiresAt) < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite link has expired",
        });
      }

      return {
        valid: true,
        email: user.email,
      };
    }),
});
