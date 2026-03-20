/**
 * Worker Notifications Router
 *
 * Handles fetching notifications for workers.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  workerRouter,
  protectedWorkerProcedure,
} from "../workerTrpc";
import { getDb } from "../../services/db/connection";
import { notifications } from "../../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const workerNotificationsRouter = workerRouter({
  /**
   * Get unread notifications
   */
  getUnread: protectedWorkerProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return [];

      return await db.select()
        .from(notifications)
        .where(
          and(
            eq(notifications.targetPortal, "worker"),
            eq(notifications.targetUserId, ctx.workerUser.id),
            eq(notifications.isRead, false)
          )
        )
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit);
    }),

  /**
   * Get all notifications (read + unread) with pagination.
   */
  getAll: protectedWorkerProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return [];

      return await db.select()
        .from(notifications)
        .where(
          and(
            eq(notifications.targetPortal, "worker"),
            eq(notifications.targetUserId, ctx.workerUser.id)
          )
        )
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /**
   * Mark as read
   */
  markAsRead: protectedWorkerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.targetPortal, "worker"),
            eq(notifications.targetUserId, ctx.workerUser.id)
          )
        );

      return { success: true };
    }),

  /**
   * Mark all as read
   */
  markAllAsRead: protectedWorkerProcedure
    .mutation(async ({ ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(
            eq(notifications.targetPortal, "worker"),
            eq(notifications.targetUserId, ctx.workerUser.id),
            eq(notifications.isRead, false)
          )
        );

      return { success: true };
    }),
});
