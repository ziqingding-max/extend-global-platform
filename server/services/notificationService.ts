
import { getDb } from "../db";
import { notifications, systemSettings, users, customerContacts, workerUsers } from "../../drizzle/schema";
import { eq, and, like, inArray, or } from "drizzle-orm";
import { generateInvoicePdf } from "./invoicePdfService";
import { TRPCError } from "@trpc/server";
import { DEFAULT_RULES, NotificationConfig } from "./notificationConstants";
import {
  renderEmailLayout,
  emailButton,
  emailInfoCard,
  emailBanner,
  emailAmountDisplay,
  type EmailAudience,
} from "./emailLayout";

export type NotificationEvent = {
  type: string;
  customerId?: number; // Required for client-side notifications
  data: Record<string, any>;
};

export const notificationService = {
  /**
   * Main entry point to send notifications.
   * Handles configuration lookup, recipient resolution, template rendering, and multi-channel delivery.
   */
  async send(event: NotificationEvent) {
    const db = getDb();
    if (!db) {
        console.error("[Notification] DB connection failed");
        return;
    }

    try {
      // 1. Get configuration
      const config = await this.getConfig(event.type);
      if (!config || !config.enabled) {
        console.log(`[Notification] Skipped ${event.type} (disabled or config missing)`);
        return;
      }

      console.log(`[Notification] Processing ${event.type} for customer ${event.customerId || 'N/A'}`);

      // 2. Resolve recipients
      const recipients = await this.resolveRecipients(config.recipients, event.customerId, event.data.workerId);
      if (recipients.length === 0) {
        console.warn(`[Notification] No recipients found for ${event.type}`);
        return;
      }

      // 3. Prepare attachments (if any)
      const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
      
      // Special handling for invoice PDFs
      if ((event.type === "invoice_sent" || event.type === "invoice_overdue") && event.data.invoiceId) {
        try {
          const pdfBuffer = await generateInvoicePdf({ invoiceId: event.data.invoiceId });
          attachments.push({
            filename: `Invoice_${event.data.invoiceNumber || event.data.invoiceId}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf"
          });
        } catch (err) {
          console.error(`[Notification] Failed to generate PDF for invoice ${event.data.invoiceId}`, err);
        }
      }

      // 4. Send to each recipient
      for (const recipient of recipients) {
        const lang = (recipient.language as "en" | "zh") || "en";
        const template = config.templates[lang] || config.templates.en;

        // Render content — substitute variables, expand custom tags, wrap in branded layout
        const emailSubject = this.renderTemplate(template.emailSubject, event.data);
        const rawBody = this.renderTemplate(template.emailBody, { ...event.data, contactName: recipient.name, workerName: recipient.name });
        const processedBody = this.processCustomTags(rawBody);
        const emailBody = renderEmailLayout(processedBody, {
          audience: (config.audience || "admin") as EmailAudience,
          preheader: emailSubject,
        });
        const inAppMessage = this.renderTemplate(template.inAppMessage, event.data);

        // Channel: In-App
        if (config.channels.includes("in_app")) {
          await db.insert(notifications).values({
            targetPortal: recipient.portal,
            targetUserId: recipient.id,
            targetRole: recipient.role,
            targetCustomerId: recipient.portal === "client" ? event.customerId : undefined,
            type: event.type,
            title: inAppMessage, // Using the short message as title for now
            data: JSON.stringify(event.data), // Fix: data should be stringified JSON
            isRead: false,
          });
        }

        // Channel: Email
        if (config.channels.includes("email") && recipient.email) {
          // Use internal sendRawEmail instead of imported sendEmail
          await this.sendRawEmail({
            to: recipient.email,
            subject: emailSubject,
            html: emailBody,
            attachments
          });
        }
      }
    } catch (err) {
      console.error(`[Notification] Error processing ${event.type}:`, err);
    }
  },

  // --- Helper Methods ---

  async getConfig(type: string): Promise<NotificationConfig | null> {
    const db = getDb();
    if (!db) return null;

    // Try to get from DB first
    const setting = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.key, "notification_rules")
    });

    if (setting && setting.value) {
      try {
        const rules = JSON.parse(setting.value);
        if (rules[type]) {
          // Merge with default to ensure structure integrity
          return { ...DEFAULT_RULES[type], ...rules[type] };
        }
      } catch (e) {
        console.error("[Notification] Failed to parse notification rules JSON", e);
      }
    }

    // Fallback to defaults
    return DEFAULT_RULES[type] || null;
  },

  async resolveRecipients(recipientRules: string[], customerId?: number, workerId?: number) {
    const db = getDb();
    if (!db) return [];

    const targets: Array<{
      id: number;
      email: string;
      name: string;
      role: string;
      portal: "admin" | "client" | "worker";
      language: string;
    }> = [];

    for (const rule of recipientRules) {
      const [portal, role] = rule.split(":"); // e.g. "client:finance"

      if (portal === "worker" && workerId) {
        // Find worker user
        const worker = await db.query.workerUsers.findFirst({
          where: eq(workerUsers.id, workerId)
        });

        if (worker) {
          targets.push({
            id: worker.id,
            email: worker.email,
            name: worker.email, // TODO: Join with contractors table to get name
            role: "user",
            portal: "worker",
            language: "en"
          });
        }
      } else if (portal === "admin") {
        // Find admin users with this role
        const adminUsers = await db.query.users.findMany({
          where: and(
            eq(users.isActive, true),
            like(users.role, `%${role}%`) // Role is comma-separated string
          )
        });
        targets.push(...adminUsers.map((u: typeof users.$inferSelect) => ({
          id: u.id,
          email: u.email || "",
          name: u.name || "Admin",
          role: role,
          portal: "admin" as const,
          language: u.language || "en"
        })));
      } else if (portal === "client" && customerId) {
        // Find client contacts
        const contacts = await db.query.customerContacts.findMany({
          where: and(
            eq(customerContacts.customerId, customerId),
            eq(customerContacts.portalRole, role as any), // portalRole is enum
            eq(customerContacts.hasPortalAccess, true)
          )
        });
        
        // Fallback: If no 'finance' role found, try 'admin'
        if (role === "finance" && contacts.length === 0) {
           const adminContacts = await db.query.customerContacts.findMany({
            where: and(
              eq(customerContacts.customerId, customerId),
              eq(customerContacts.portalRole, "admin"),
              eq(customerContacts.hasPortalAccess, true)
            )
          });
          targets.push(...adminContacts.map((c: typeof customerContacts.$inferSelect) => ({
            id: c.id,
            email: c.email,
            name: c.contactName,
            role: "admin", // Fallback role
            portal: "client" as const,
            language: "en" // Contacts don't have language field yet, default to en
          })));
        } else {
          targets.push(...contacts.map((c: typeof customerContacts.$inferSelect) => ({
            id: c.id,
            email: c.email,
            name: c.contactName,
            role: role,
            portal: "client" as const,
            language: "en"
          })));
        }
      }
    }

    // Dedup by email
    const uniqueTargets = new Map();
    for (const t of targets) {
      if (t.email) uniqueTargets.set(t.email, t);
    }
    return Array.from(uniqueTargets.values());
  },

  renderTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return data[key] !== undefined ? String(data[key]) : "";
    });
  },

  /**
   * Process custom GEA email tags into actual HTML.
   * Supported tags:
   *   <GEA_INFO_CARD> ... <GEA_ROW label="..." value="..." /> ... </GEA_INFO_CARD>
   *   <GEA_BUTTON text="..." href="..." [color="..."] />
   *   <GEA_BANNER type="warning|danger|success|info" text="..." />
   *   <GEA_AMOUNT currency="..." amount="..." />
   */
  processCustomTags(html: string): string {
    // 1. Process <GEA_INFO_CARD>...</GEA_INFO_CARD>
    html = html.replace(/<GEA_INFO_CARD>([\s\S]*?)<\/GEA_INFO_CARD>/g, (_match: string, inner: string) => {
      const rows: Array<{ label: string; value: string }> = [];
      const rowRegex = /<GEA_ROW\s+label="([^"]*?)"\s+value="([^"]*?)"\s*\/>/g;
      let m;
      while ((m = rowRegex.exec(inner)) !== null) {
        rows.push({ label: m[1], value: m[2] });
      }
      return emailInfoCard(rows);
    });

    // 2. Process <GEA_BUTTON text="..." href="..." [color="..."] />
    html = html.replace(/<GEA_BUTTON\s+text="([^"]*?)"\s+href="([^"]*?)"(?:\s+color="([^"]*?)")?\s*\/>/g, (_match: string, text: string, href: string, color: string) => {
      return emailButton(text, href, color || undefined);
    });

    // 3. Process <GEA_BANNER type="..." text="..." />
    html = html.replace(/<GEA_BANNER\s+type="([^"]*?)"\s+text="([^"]*?)"\s*\/>/g, (_match: string, type: string, text: string) => {
      return emailBanner(text, type as any);
    });

    // 4. Process <GEA_AMOUNT currency="..." amount="..." />
    html = html.replace(/<GEA_AMOUNT\s+currency="([^"]*?)"\s+amount="([^"]*?)"\s*\/>/g, (_match: string, currency: string, amount: string) => {
      return emailAmountDisplay(currency, amount);
    });

    return html;
  },

  // Internal mailer using nodemailer + Alibaba Cloud DirectMail SMTP
  async sendRawEmail(payload: { to: string; subject: string; html: string; attachments?: any[] }) {
    // Dynamic import to avoid circular dependency issues if any, though nodemailer is external
    const nodemailer = (await import("nodemailer")).default;
    const { ENV } = await import("../_core/env");

    if (!ENV.emailSmtpHost || !ENV.emailSmtpUser) {
      console.log(`[Dev Email] To: ${payload.to} | Subject: ${payload.subject}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: ENV.emailSmtpHost,
      port: Number(ENV.emailSmtpPort) || 587,
      secure: Number(ENV.emailSmtpPort) === 465,
      auth: {
        user: ENV.emailSmtpUser,
        pass: ENV.emailSmtpPass,
      },
    });

    await transporter.sendMail({
      from: `GEA Notification <${ENV.emailFrom}>`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      attachments: payload.attachments
    });
  }
};
