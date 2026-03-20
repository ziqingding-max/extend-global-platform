
import { getDb } from "../db";
import { notifications, systemSettings, users, customerContacts, workerUsers, channelPartnerContacts, channelPartners, customers } from "../../drizzle/schema";
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

// ============================================================================
// Types
// ============================================================================

export type NotificationEvent = {
  type: string;
  customerId?: number;       // Required for client-side notifications
  channelPartnerId?: number; // Required for CP-side notifications
  data: Record<string, any>;
};

type ResolvedRecipient = {
  id: number;
  email: string;
  name: string;
  role: string;
  portal: "admin" | "client" | "worker" | "cp";
  language: string;
};

// ============================================================================
// CP Branding Resolution (for white-label email layout)
// ============================================================================

interface CpBrandingInfo {
  companyName: string;
  logoUrl: string | null;
  logoFileKey: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  subdomain: string | null;
}

async function resolveCpBranding(channelPartnerId: number): Promise<CpBrandingInfo | null> {
  const db = getDb();
  if (!db) return null;

  const cp = await db.query.channelPartners.findFirst({
    where: eq(channelPartners.id, channelPartnerId),
  });

  if (!cp) return null;

  return {
    companyName: cp.cpBillingEntityName || cp.companyName,
    logoUrl: cp.logoUrl,
    logoFileKey: cp.logoFileKey,
    primaryColor: cp.brandPrimaryColor || "#1a73e8",
    secondaryColor: cp.brandSecondaryColor,
    subdomain: cp.subdomain,
  };
}

// ============================================================================
// CP White-Label Email Layout Renderer
// ============================================================================

async function getCpLogoHtml(branding: CpBrandingInfo): Promise<string> {
  let logoSrc: string | null = null;

  if (branding.logoFileKey) {
    try {
      const { storageGet } = await import("../storage");
      const { url } = await storageGet(branding.logoFileKey);
      logoSrc = url;
    } catch (err) {
      console.warn("[Notification] Failed to get signed CP logo URL:", err);
    }
  } else if (branding.logoUrl) {
    logoSrc = branding.logoUrl;
  }

  if (logoSrc) {
    return `<img src="${logoSrc}" alt="${branding.companyName}" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;" />`;
  }

  return `<span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:1px;">${branding.companyName}</span>`;
}

async function renderCpWhitelabelLayout(
  bodyHtml: string,
  branding: CpBrandingInfo,
  options: { preheader?: string } = {}
): Promise<string> {
  const primaryColor = branding.primaryColor;
  const logoHtml = await getCpLogoHtml(branding);
  const preheaderHtml = options.preheader
    ? `<div style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${options.preheader}</div>`
    : "";

  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>${branding.companyName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<!-- Header with CP branding -->
<tr><td style="background-color:${primaryColor};padding:24px 32px;border-radius:8px 8px 0 0;text-align:center;">
${logoHtml}
</td></tr>
<!-- Body -->
<tr><td style="background-color:#ffffff;padding:32px;border-radius:0 0 8px 8px;color:#1a1a1a;font-size:15px;line-height:1.65;">
${bodyHtml}
</td></tr>
<!-- Footer -->
<tr><td style="padding:20px 32px;text-align:center;">
<p style="margin:0 0 6px 0;font-size:12px;color:#888888;line-height:1.5;">
This email was sent by ${branding.companyName}.<br/>
If you have questions, please contact your account manager.
</p>
<p style="margin:0;font-size:11px;color:#aaaaaa;">&copy; ${year} ${branding.companyName}. All rights reserved.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ============================================================================
// Notification Service
// ============================================================================

export const notificationService = {
  /**
   * Main entry point to send notifications.
   * Handles configuration lookup, recipient resolution, template rendering, and multi-channel delivery.
   * 
   * Supports B2B2B routing:
   * - EG → Admin (Layer 0): EG brand, admin audience
   * - EG → CP (Layer 1): EG brand, cp audience
   * - CP → Client (Layer 2): CP white-label brand, client audience
   * - EG → Direct Client (Layer 3): EG brand, client audience
   * - EG → Worker (Layer 4): EG brand, worker audience (delegation tone)
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

      console.log(`[Notification] Processing ${event.type} | customer=${event.customerId || 'N/A'} | cp=${event.channelPartnerId || 'N/A'}`);

      // 2. Resolve recipients (now supports cp:* prefix)
      const recipients = await this.resolveRecipients(
        config.recipients,
        event.customerId,
        event.data.workerId,
        event.channelPartnerId
      );
      if (recipients.length === 0) {
        console.warn(`[Notification] No recipients found for ${event.type}`);
        return;
      }

      // 3. Resolve CP branding if needed for white-label layout
      let cpBranding: CpBrandingInfo | null = null;
      if (config.emailLayout === "cp_whitelabel" && event.channelPartnerId) {
        cpBranding = await resolveCpBranding(event.channelPartnerId);
        if (!cpBranding) {
          console.warn(`[Notification] CP branding not found for CP #${event.channelPartnerId}, falling back to EG layout`);
        }
      }

      // 4. Prepare attachments (if any)
      const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
      
      // Special handling for invoice PDFs
      const invoiceTypes = [
        "invoice_sent_to_cp", "invoice_overdue_to_cp",
        "invoice_sent_to_direct_client", "invoice_overdue_to_direct_client",
        // Legacy event names for backward compatibility
        "invoice_sent", "invoice_overdue"
      ];
      if (invoiceTypes.includes(event.type) && event.data.invoiceId) {
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

      // 5. Send to each recipient
      for (const recipient of recipients) {
        const lang = (recipient.language as "en" | "zh") || "en";
        const template = config.templates[lang] || config.templates.en;

        // Merge event data with recipient-specific data
        const mergedData = {
          ...event.data,
          contactName: recipient.name,
          workerName: recipient.name,
        };

        // Render content — substitute variables, expand custom tags
        const emailSubject = this.renderTemplate(template.emailSubject, mergedData);
        const rawBody = this.renderTemplate(template.emailBody, mergedData);
        const processedBody = this.processCustomTags(rawBody);

        // Choose layout renderer based on config
        let emailBody: string;
        if (config.emailLayout === "cp_whitelabel" && cpBranding) {
          emailBody = await renderCpWhitelabelLayout(processedBody, cpBranding, {
            preheader: emailSubject,
          });
        } else {
          emailBody = renderEmailLayout(processedBody, {
            audience: (config.audience === "cp" ? "client" : config.audience || "admin") as EmailAudience,
            preheader: emailSubject,
          });
        }

        const inAppMessage = this.renderTemplate(template.inAppMessage, mergedData);

        // Channel: In-App
        if (config.channels.includes("in_app")) {
          await db.insert(notifications).values({
            targetPortal: recipient.portal,
            targetUserId: recipient.id,
            targetRole: recipient.role,
            targetCustomerId: recipient.portal === "client" ? event.customerId : undefined,
            targetChannelPartnerId: recipient.portal === "cp" ? event.channelPartnerId : undefined,
            type: event.type,
            title: inAppMessage,
            data: JSON.stringify(event.data),
            isRead: false,
          });
        }

        // Channel: Email
        if (config.channels.includes("email") && recipient.email) {
          const fromName = (config.emailLayout === "cp_whitelabel" && cpBranding)
            ? cpBranding.companyName
            : "EG Notification";

          await this.sendRawEmail({
            to: recipient.email,
            subject: emailSubject,
            html: emailBody,
            attachments,
            fromName,
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

    // Try to get from DB first (admin-configurable overrides)
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

  /**
   * Resolve recipients from rule strings.
   * 
   * Supported prefixes:
   * - "admin:<role>"    → Admin panel users matching role
   * - "client:<role>"   → Customer contacts with portal role (requires customerId)
   * - "worker:user"     → Worker user (requires workerId in data)
   * - "cp:<role>"       → Channel Partner contacts with portal role (requires channelPartnerId)
   */
  async resolveRecipients(
    recipientRules: string[],
    customerId?: number,
    workerId?: number,
    channelPartnerId?: number
  ): Promise<ResolvedRecipient[]> {
    const db = getDb();
    if (!db) return [];

    const targets: ResolvedRecipient[] = [];

    for (const rule of recipientRules) {
      const [portal, role] = rule.split(":"); // e.g. "cp:finance"

      if (portal === "worker" && workerId) {
        // Find worker user
        const worker = await db.query.workerUsers.findFirst({
          where: eq(workerUsers.id, workerId)
        });

        if (worker) {
          targets.push({
            id: worker.id,
            email: worker.email,
            name: worker.email, // TODO: Join with contractors/employees table to get name
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
            eq(customerContacts.portalRole, role as any),
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
            role: "admin",
            portal: "client" as const,
            language: "en"
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
      } else if (portal === "cp" && channelPartnerId) {
        // Find CP contacts with matching portal role
        const cpContacts = await db.query.channelPartnerContacts.findMany({
          where: and(
            eq(channelPartnerContacts.channelPartnerId, channelPartnerId),
            eq(channelPartnerContacts.portalRole, role as any),
            eq(channelPartnerContacts.hasPortalAccess, true)
          )
        });

        // Fallback: If no matching role found, try 'admin'
        if (cpContacts.length === 0 && role !== "admin") {
          const cpAdminContacts = await db.query.channelPartnerContacts.findMany({
            where: and(
              eq(channelPartnerContacts.channelPartnerId, channelPartnerId),
              eq(channelPartnerContacts.portalRole, "admin"),
              eq(channelPartnerContacts.hasPortalAccess, true)
            )
          });
          targets.push(...cpAdminContacts.map((c: typeof channelPartnerContacts.$inferSelect) => ({
            id: c.id,
            email: c.email,
            name: c.contactName,
            role: "admin",
            portal: "cp" as const,
            language: "en"
          })));
        } else {
          targets.push(...cpContacts.map((c: typeof channelPartnerContacts.$inferSelect) => ({
            id: c.id,
            email: c.email,
            name: c.contactName,
            role: role,
            portal: "cp" as const,
            language: "en"
          })));
        }
      }
    }

    // Dedup by email
    const uniqueTargets = new Map<string, ResolvedRecipient>();
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
   * Process custom EG email tags into actual HTML.
   * Supported tags:
   *   <EG_INFO_CARD> ... <EG_ROW label="..." value="..." /> ... </EG_INFO_CARD>
   *   <EG_BUTTON text="..." href="..." [color="..."] />
   *   <EG_BANNER type="warning|danger|success|info" text="..." />
   *   <EG_AMOUNT currency="..." amount="..." />
   *   <GEA_AMOUNT currency="..." amount="..." />  (legacy alias, still supported)
   */
  processCustomTags(html: string): string {
    // 1. Process <EG_INFO_CARD>...</EG_INFO_CARD>
    html = html.replace(/<EG_INFO_CARD>([\s\S]*?)<\/EG_INFO_CARD>/g, (_match: string, inner: string) => {
      const rows: Array<{ label: string; value: string }> = [];
      const rowRegex = /<EG_ROW\s+label="([^"]*?)"\s+value="([^"]*?)"\s*\/>/g;
      let m;
      while ((m = rowRegex.exec(inner)) !== null) {
        rows.push({ label: m[1], value: m[2] });
      }
      return emailInfoCard(rows);
    });

    // 2. Process <EG_BUTTON text="..." href="..." [color="..."] />
    html = html.replace(/<EG_BUTTON\s+text="([^"]*?)"\s+href="([^"]*?)"(?:\s+color="([^"]*?)")?\s*\/>/g, (_match: string, text: string, href: string, color: string) => {
      return emailButton(text, href, color || undefined);
    });

    // 3. Process <EG_BANNER type="..." text="..." />
    html = html.replace(/<EG_BANNER\s+type="([^"]*?)"\s+text="([^"]*?)"\s*\/>/g, (_match: string, type: string, text: string) => {
      return emailBanner(text, type as any);
    });

    // 4. Process <EG_AMOUNT currency="..." amount="..." /> (and legacy <GEA_AMOUNT> alias)
    html = html.replace(/<(?:EG|GEA)_AMOUNT\s+currency="([^"]*?)"\s+amount="([^"]*?)"\s*\/>/g, (_match: string, currency: string, amount: string) => {
      return emailAmountDisplay(currency, amount);
    });

    return html;
  },

  /**
   * Build the delegation statement for Worker emails.
   * 
   * Direct client: "We have been engaged by [Client Name] as the local delivery partner and Employer of Record (EOR) to provide employment services on their behalf."
   * CP channel: "We have been engaged by [Client Name] and [CP Name] as the local delivery partner and Employer of Record (EOR) to provide employment services on their behalf."
   */
  buildDelegationStatement(clientName?: string, channelPartnerName?: string): string {
    if (channelPartnerName && clientName) {
      return `We have been engaged by <strong>${clientName}</strong> and <strong>${channelPartnerName}</strong> as the local delivery partner and Employer of Record (EOR) to provide employment services on their behalf.`;
    } else if (clientName) {
      return `We have been engaged by <strong>${clientName}</strong> as the local delivery partner and Employer of Record (EOR) to provide employment services on their behalf.`;
    }
    return "As your Employer of Record (EOR), we handle your employment administration, payroll, and compliance.";
  },

  buildDelegationStatementZh(clientName?: string, channelPartnerName?: string): string {
    if (channelPartnerName && clientName) {
      return `我们受 <strong>${clientName}</strong> 和 <strong>${channelPartnerName}</strong> 的委托，作为本地交付服务商和名义雇主（EOR），为您提供雇佣服务。`;
    } else if (clientName) {
      return `我们受 <strong>${clientName}</strong> 的委托，作为本地交付服务商和名义雇主（EOR），为您提供雇佣服务。`;
    }
    return "作为您的名义雇主（EOR），我们负责处理您的雇佣管理、薪资和合规事务。";
  },

  // Internal mailer using nodemailer + Alibaba Cloud DirectMail SMTP
  async sendRawEmail(payload: {
    to: string;
    subject: string;
    html: string;
    attachments?: any[];
    fromName?: string;
  }) {
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

    const fromName = payload.fromName || "EG Notification";
    await transporter.sendMail({
      from: `${fromName} <${ENV.emailFrom}>`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      attachments: payload.attachments
    });
  }
};
