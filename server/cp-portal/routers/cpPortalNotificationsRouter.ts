/**
 * CP Portal Notifications Router
 *
 * Handles in-app notifications for CP portal users.
 * Notifications are scoped to the CP's channelPartnerId.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  cpPortalRouter,
  protectedCpProcedure,
} from "../cpPortalTrpc";
import { getDb } from "../../db";
import { notifications } from "../../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const cpPortalNotificationsRouter = cpPortalRouter({
  /**
   * Get unread notifications for the current CP user.
   * Scoped to: targetPortal = "cp" AND targetChannelPartnerId = ctx.cpUser.channelPartnerId
   */
  getUnread: protectedCpProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return [];

      return await db.select()
        .from(notifications)
        .where(
          and(
            eq(notifications.targetPortal, "cp"),
            eq(notifications.targetChannelPartnerId, ctx.cpUser.channelPartnerId),
            eq(notifications.isRead, false)
          )
        )
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit);
    }),

  /**
   * Get all notifications (read + unread) with pagination.
   */
  getAll: protectedCpProcedure
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
            eq(notifications.targetPortal, "cp"),
            eq(notifications.targetChannelPartnerId, ctx.cpUser.channelPartnerId)
          )
        )
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /**
   * Mark a single notification as read.
   */
  markAsRead: protectedCpProcedure
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
            eq(notifications.targetPortal, "cp"),
            eq(notifications.targetChannelPartnerId, ctx.cpUser.channelPartnerId)
          )
        );

      return { success: true };
    }),

  /**
   * Mark all notifications as read.
   */
  markAllAsRead: protectedCpProcedure
    .mutation(async ({ ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(
            eq(notifications.targetPortal, "cp"),
            eq(notifications.targetChannelPartnerId, ctx.cpUser.channelPartnerId),
            eq(notifications.isRead, false)
          )
        );

      return { success: true };
    }),
});
