/**
 * Client Portal Notifications Router
 *
 * Handles in-app notifications for Client portal users.
 * Notifications are scoped to the client's customerId.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  portalRouter,
  protectedPortalProcedure,
} from "../portalTrpc";
import { getDb } from "../../db";
import { notifications } from "../../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const portalNotificationsRouter = portalRouter({
  /**
   * Get unread notifications for the current client user.
   * Scoped to: targetPortal = "client" AND targetCustomerId = ctx.portalUser.customerId
   */
  getUnread: protectedPortalProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      return await db.select()
        .from(notifications)
        .where(
          and(
            eq(notifications.targetPortal, "client"),
            eq(notifications.targetCustomerId, ctx.portalUser.customerId),
            eq(notifications.isRead, false)
          )
        )
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit);
    }),

  /**
   * Get all notifications (read + unread) with pagination.
   */
  getAll: protectedPortalProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      return await db.select()
        .from(notifications)
        .where(
          and(
            eq(notifications.targetPortal, "client"),
            eq(notifications.targetCustomerId, ctx.portalUser.customerId)
          )
        )
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /**
   * Mark a single notification as read.
   */
  markAsRead: protectedPortalProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.targetPortal, "client"),
            eq(notifications.targetCustomerId, ctx.portalUser.customerId)
          )
        );

      return { success: true };
    }),

  /**
   * Mark all notifications as read.
   */
  markAllAsRead: protectedPortalProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(
            eq(notifications.targetPortal, "client"),
            eq(notifications.targetCustomerId, ctx.portalUser.customerId),
            eq(notifications.isRead, false)
          )
        );

      return { success: true };
    }),
});
