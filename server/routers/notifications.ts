
import { z } from "zod";
import { router } from "../_core/trpc";
import { userProcedure, adminProcedure } from "../procedures";
import { getDb } from "../db";
import { notifications, systemSettings } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { DEFAULT_RULES } from "../services/notificationConstants";

// Schema for updating notification rules
const NotificationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  channels: z.array(z.enum(["email", "in_app"])).default([]),
  recipients: z.array(z.string()).default([]),
  audience: z.enum(["admin", "client", "worker", "cp"]).default("admin"),
  emailLayout: z.enum(["eg", "cp_whitelabel"]).default("eg"),
  templates: z.object({
    en: z.object({
      emailSubject: z.string().default(""),
      emailBody: z.string().default(""),
      inAppMessage: z.string().default(""),
    }).default({}),
    zh: z.object({
      emailSubject: z.string().default(""),
      emailBody: z.string().default(""),
      inAppMessage: z.string().default(""),
    }).default({}),
  }).default({}),
});

export const notificationsRouter = router({
  // --- Admin: Settings Management ---

  /**
   * Get all notification rules configuration
   */
  getSettings: adminProcedure.query(async () => {
    const db = getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const setting = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.key, "notification_rules"),
    });

    const config = JSON.parse(JSON.stringify(DEFAULT_RULES)); // Deep clone defaults

    if (setting && setting.value) {
      try {
        const dbRules = JSON.parse(setting.value);
        // Merge DB rules over defaults
        for (const [key, value] of Object.entries(dbRules)) {
          if (config[key]) {
            // Ensure we don't lose structure if DB has partial update (though UI sends full object)
            // Use Zod to parse and validate the DB value safely
            const result = NotificationConfigSchema.safeParse(value);
            if (result.success) {
              config[key] = { ...config[key], ...result.data };
            } else {
              console.warn(`[Notification] Invalid rule config for ${key}, using defaults`, result.error);
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse notification rules", e);
      }
    }

    return config;
  }),

  /**
   * Update a specific notification rule
   */
  updateRule: adminProcedure
    .input(
      z.object({
        type: z.string(), // e.g. "invoice_sent"
        config: NotificationConfigSchema,
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Fetch existing settings
      const setting = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.key, "notification_rules"),
      });

      let rules: Record<string, any> = {};
      if (setting && setting.value) {
        try {
          rules = JSON.parse(setting.value);
        } catch (e) {
          // ignore error, start fresh
        }
      }

      // Update the specific rule
      rules[input.type] = input.config;

      // Save back to DB
      await db
        .insert(systemSettings)
        .values({
          key: "notification_rules",
          value: JSON.stringify(rules),
          description: "Configuration for system notifications",
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: {
            value: JSON.stringify(rules),
            updatedAt: new Date(),
          },
        });

      return { success: true };
    }),

  // --- User: Notification Center ---

  /**
   * Get unread notifications for the current user
   */
  getUnread: userProcedure
    .input(
      z.object({
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const userId = ctx.user.id;
      const userRoles = (ctx.user.role || "").split(",");

      const roleConditions = userRoles.map(role => eq(notifications.targetRole, role.trim()));
      
      return await db.query.notifications.findMany({
        where: (t, { and, or, eq }) => and(
          eq(t.targetPortal, "admin"),
          eq(t.isRead, false),
          or(
            eq(t.targetUserId, userId),
            ...roleConditions
          )
        ),
        orderBy: [desc(notifications.createdAt)],
        limit: input.limit,
      });
    }),

  /**
   * Mark a notification as read
   */
  markAsRead: userProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const userId = ctx.user.id;
      const userRoles = (ctx.user.role || "").split(",").map((r: string) => r.trim()).filter(Boolean);
      const roleConditions = userRoles.map((role: string) => eq(notifications.targetRole, role));

      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.targetPortal, "admin"),
            sql`(${eq(notifications.targetUserId, userId)}${roleConditions.length > 0 ? sql` OR ${sql.join(roleConditions.map((c: any) => c), sql` OR `)}` : sql``})`
          )
        );
        
      return { success: true };
    }),

  /**
   * Mark all visible notifications as read
   */
  markAllAsRead: userProcedure.mutation(async ({ ctx }) => {
    const db = getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const userId = ctx.user.id;
    const userRoles = (ctx.user.role || "").split(",").map((r: string) => r.trim()).filter(Boolean);
    const roleConditions = userRoles.map((role: string) => eq(notifications.targetRole, role));

    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notifications.targetPortal, "admin"),
          eq(notifications.isRead, false),
          sql`(${eq(notifications.targetUserId, userId)}${roleConditions.length > 0 ? sql` OR ${sql.join(roleConditions.map((c: any) => c), sql` OR `)}` : sql``})`
        )
      );
      
    return { success: true };
  }),
});
