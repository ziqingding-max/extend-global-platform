/**
 * CP Email Service — White-label email rendering for Channel Partner communications.
 *
 * Generates branded HTML emails using the CP's own logo, colors, and company name.
 * Used for:
 * 1. CP Portal invite emails (sent to CP contacts)
 * 2. CP Portal password reset emails
 * 3. CP→Client invoice sent emails (white-labeled)
 * 4. CP→Client invoice overdue reminders (white-labeled)
 *
 * Falls back to EG default branding if CP branding is incomplete.
 */

import { getDb } from "../db";
import { channelPartners, channelPartnerContacts, customers, customerContacts } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { generateInvoicePdf } from "./invoicePdfService";
import { storageGet } from "../storage";

// ============================================================================
// Types
// ============================================================================

interface CpBranding {
  companyName: string;
  logoUrl: string | null;
  logoFileKey: string | null;
  primaryColor: string;
  secondaryColor: string | null;
}

interface CpEmailPayload {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  /** Optional: override the "from" display name */
  fromName?: string;
}

// ============================================================================
// Branding Resolution
// ============================================================================

/**
 * Resolve CP branding from the database.
 * Returns null if the CP doesn't exist or has no branding configured.
 */
async function getCpBranding(channelPartnerId: number): Promise<CpBranding | null> {
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
  };
}

// ============================================================================
// White-Label Email Layout
// ============================================================================

/**
 * Build a white-label logo <img> tag for the CP.
 * If the CP has a logo, generates a signed URL; otherwise returns the company name as text.
 */
async function getCpLogoHtml(branding: CpBranding): Promise<string> {
  let logoSrc: string | null = null;

  if (branding.logoFileKey) {
    try {
      const { url } = await storageGet(branding.logoFileKey);
      logoSrc = url;
    } catch (err) {
      console.warn("[CpEmail] Failed to get signed logo URL:", err);
    }
  } else if (branding.logoUrl) {
    logoSrc = branding.logoUrl;
  }

  if (logoSrc) {
    return `<img src="${logoSrc}" alt="${branding.companyName}" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;" />`;
  }

  return `<span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:1px;">${branding.companyName}</span>`;
}

/**
 * Render a white-label email layout using the CP's branding.
 * Structure mirrors the GEA emailLayout.ts but with dynamic colors and logo.
 */
async function renderCpEmailLayout(
  bodyHtml: string,
  branding: CpBranding,
  options: { preheader?: string } = {}
): Promise<string> {
  const primaryColor = branding.primaryColor;
  const logoHtml = await getCpLogoHtml(branding);
  const preheaderHtml = options.preheader
    ? `<div style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${options.preheader}</div>`
    : "";

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
<tr><td style="background-color:#ffffff;padding:32px;border-radius:0 0 8px 8px;">
${bodyHtml}
</td></tr>
<!-- Footer -->
<tr><td style="padding:20px 32px;text-align:center;">
<p style="margin:0;font-size:12px;color:#888888;line-height:1.5;">
This email was sent by ${branding.companyName}.<br/>
If you have questions, please contact your account manager.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Generate a styled button for CP emails.
 */
function cpEmailButton(text: string, url: string, color: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
<tr><td style="background-color:${color};border-radius:6px;padding:12px 28px;">
<a href="${url}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;display:inline-block;">${text}</a>
</td></tr>
</table>`;
}

// ============================================================================
// Email Sending
// ============================================================================

/**
 * Send an email with optional CP branding in the "from" name.
 */
async function sendCpEmail(payload: CpEmailPayload): Promise<void> {
  const nodemailer = (await import("nodemailer")).default;
  const { ENV } = await import("../_core/env");

  if (!ENV.emailSmtpHost || !ENV.emailSmtpUser) {
    console.log(`[CP Email - Dev] To: ${payload.to} | Subject: ${payload.subject}`);
    console.log(`[CP Email - Dev] (SMTP not configured, email not sent)`);
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

  const fromName = payload.fromName || "Notification";
  await transporter.sendMail({
    from: `${fromName} <${ENV.emailFrom}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    attachments: payload.attachments,
  });

  console.log(`[CP Email] Sent "${payload.subject}" to ${payload.to}`);
}

// ============================================================================
// Public API: CP Portal Invite
// ============================================================================

/**
 * Send a CP Portal invite email to a new CP contact.
 * Uses the CP's own branding (logo, colors, company name).
 */
export async function sendCpPortalInvite(params: {
  channelPartnerId: number;
  contactName: string;
  email: string;
  inviteToken: string;
  subdomain: string;
}): Promise<void> {
  const branding = await getCpBranding(params.channelPartnerId);
  if (!branding) {
    console.error(`[CP Email] Cannot send invite: CP #${params.channelPartnerId} not found`);
    return;
  }

  const portalUrl = `https://${params.subdomain}.extendglobal.ai/cp/register?token=${params.inviteToken}`;
  const bodyHtml = `
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">Welcome to ${branding.companyName}</h2>
    <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.6;">
      Hi ${params.contactName},
    </p>
    <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.6;">
      You've been invited to join the ${branding.companyName} partner portal. Click the button below to set up your account.
    </p>
    ${cpEmailButton("Set Up Your Account", portalUrl, branding.primaryColor)}
    <p style="margin:0;font-size:12px;color:#888888;line-height:1.5;">
      This invitation link will expire in 7 days. If you didn't expect this email, you can safely ignore it.
    </p>
  `;

  const html = await renderCpEmailLayout(bodyHtml, branding, {
    preheader: `You've been invited to ${branding.companyName} portal`,
  });

  await sendCpEmail({
    to: params.email,
    subject: `You're invited to ${branding.companyName} Portal`,
    html,
    fromName: branding.companyName,
  });
}

// ============================================================================
// Public API: CP Portal Password Reset
// ============================================================================

/**
 * Send a password reset email to a CP contact.
 * Uses the CP's own branding.
 */
export async function sendCpPasswordReset(params: {
  channelPartnerId: number;
  contactName: string;
  email: string;
  resetToken: string;
  subdomain: string;
}): Promise<void> {
  const branding = await getCpBranding(params.channelPartnerId);
  if (!branding) {
    console.error(`[CP Email] Cannot send reset: CP #${params.channelPartnerId} not found`);
    return;
  }

  const resetUrl = `https://${params.subdomain}.extendglobal.ai/cp/reset-password?token=${params.resetToken}`;
  const bodyHtml = `
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">Password Reset</h2>
    <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.6;">
      Hi ${params.contactName},
    </p>
    <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.6;">
      We received a request to reset your password for the ${branding.companyName} portal. Click the button below to set a new password.
    </p>
    ${cpEmailButton("Reset Password", resetUrl, branding.primaryColor)}
    <p style="margin:0;font-size:12px;color:#888888;line-height:1.5;">
      This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
    </p>
  `;

  const html = await renderCpEmailLayout(bodyHtml, branding, {
    preheader: "Password reset request",
  });

  await sendCpEmail({
    to: params.email,
    subject: `Password Reset — ${branding.companyName} Portal`,
    html,
    fromName: branding.companyName,
  });
}

// ============================================================================
// Public API: CP→Client Invoice Sent
// ============================================================================

/**
 * Send a white-labeled invoice email from CP to End Client.
 * The email uses the CP's branding and attaches the white-labeled PDF.
 *
 * Called when a CP admin clicks "Send" on a Layer 2 (cp_to_client) invoice.
 */
export async function sendCpInvoiceToClient(params: {
  invoiceId: number;
  channelPartnerId: number;
  customerId: number;
  invoiceNumber: string;
  invoiceMonth?: string;
  currency: string;
  totalAmount: string;
}): Promise<{ success: boolean; recipientCount: number; error?: string }> {
  const db = getDb();
  if (!db) return { success: false, recipientCount: 0, error: "Database unavailable" };

  const branding = await getCpBranding(params.channelPartnerId);
  if (!branding) {
    return { success: false, recipientCount: 0, error: "CP branding not found" };
  }

  // Get customer info
  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, params.customerId),
  });
  if (!customer) {
    return { success: false, recipientCount: 0, error: "Customer not found" };
  }

  // Get customer contacts with portal access (finance and admin roles)
  const contacts = await db
    .select()
    .from(customerContacts)
    .where(
      and(
        eq(customerContacts.customerId, params.customerId),
        eq(customerContacts.isPortalActive, true)
      )
    );

  // Filter to finance and admin contacts, or fall back to primary contact email
  const recipients = contacts
    .filter((c) => c.email && (c.portalRole === "admin" || c.portalRole === "finance" || c.isPrimary))
    .map((c) => ({ email: c.email!, name: c.contactName }));

  // Fallback: use customer's primary contact email
  if (recipients.length === 0 && customer.primaryContactEmail) {
    recipients.push({
      email: customer.primaryContactEmail,
      name: customer.primaryContactName || customer.companyName,
    });
  }

  if (recipients.length === 0) {
    return { success: false, recipientCount: 0, error: "No recipient email addresses found for this customer" };
  }

  // Generate the white-labeled PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateInvoicePdf({ invoiceId: params.invoiceId });
  } catch (err) {
    console.error(`[CP Email] Failed to generate PDF for invoice #${params.invoiceId}:`, err);
    return { success: false, recipientCount: 0, error: "Failed to generate invoice PDF" };
  }

  // Format period label
  let periodLabel = "";
  if (params.invoiceMonth) {
    const monthVal = String(params.invoiceMonth);
    if (/^\d{4}-\d{2}/.test(monthVal)) {
      const [yearStr, monthNumStr] = monthVal.split("-");
      const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      periodLabel = `${monthNames[parseInt(monthNumStr, 10) - 1]} ${yearStr}`;
    }
  }

  // Build email body
  const bodyHtml = `
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">Invoice ${params.invoiceNumber}</h2>
    <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.6;">
      Dear {{contactName}},
    </p>
    <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.6;">
      Please find attached your invoice from ${branding.companyName}${periodLabel ? ` for the period of ${periodLabel}` : ""}.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;border:1px solid #e5e7eb;border-radius:8px;">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:12px;color:#888888;">Invoice Number</span><br/>
          <span style="font-size:14px;font-weight:bold;color:#1a1a1a;">${params.invoiceNumber}</span>
        </td>
        <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;text-align:right;">
          <span style="font-size:12px;color:#888888;">Amount Due</span><br/>
          <span style="font-size:14px;font-weight:bold;color:#1a1a1a;">${params.currency} ${params.totalAmount}</span>
        </td>
      </tr>
      ${periodLabel ? `<tr>
        <td colspan="2" style="padding:12px 20px;">
          <span style="font-size:12px;color:#888888;">Period</span><br/>
          <span style="font-size:14px;color:#1a1a1a;">${periodLabel}</span>
        </td>
      </tr>` : ""}
    </table>
    <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.6;">
      The invoice PDF is attached to this email for your records. If you have any questions regarding this invoice, please don't hesitate to reach out to your account manager.
    </p>
  `;

  // Send to each recipient
  let sentCount = 0;
  for (const recipient of recipients) {
    try {
      const personalizedBody = bodyHtml.replace("{{contactName}}", recipient.name);
      const html = await renderCpEmailLayout(personalizedBody, branding, {
        preheader: `Invoice ${params.invoiceNumber} — ${params.currency} ${params.totalAmount}`,
      });

      await sendCpEmail({
        to: recipient.email,
        subject: `Invoice ${params.invoiceNumber} from ${branding.companyName}`,
        html,
        fromName: branding.companyName,
        attachments: [{
          filename: `Invoice_${params.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        }],
      });
      sentCount++;
    } catch (err) {
      console.error(`[CP Email] Failed to send invoice email to ${recipient.email}:`, err);
    }
  }

  return { success: sentCount > 0, recipientCount: sentCount };
}

// ============================================================================
// Public API: CP→Client Invoice Overdue Reminder
// ============================================================================

/**
 * Send a white-labeled overdue reminder email from CP to End Client.
 */
export async function sendCpInvoiceOverdueReminder(params: {
  invoiceId: number;
  channelPartnerId: number;
  customerId: number;
  invoiceNumber: string;
  currency: string;
  totalAmount: string;
  dueDate: string;
  daysOverdue: number;
}): Promise<{ success: boolean; recipientCount: number }> {
  const db = getDb();
  if (!db) return { success: false, recipientCount: 0 };

  const branding = await getCpBranding(params.channelPartnerId);
  if (!branding) return { success: false, recipientCount: 0 };

  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, params.customerId),
  });
  if (!customer) return { success: false, recipientCount: 0 };

  // Get contacts
  const contacts = await db
    .select()
    .from(customerContacts)
    .where(
      and(
        eq(customerContacts.customerId, params.customerId),
        eq(customerContacts.isPortalActive, true)
      )
    );

  const recipients = contacts
    .filter((c) => c.email && (c.portalRole === "admin" || c.portalRole === "finance" || c.isPrimary))
    .map((c) => ({ email: c.email!, name: c.contactName }));

  if (recipients.length === 0 && customer.primaryContactEmail) {
    recipients.push({
      email: customer.primaryContactEmail,
      name: customer.primaryContactName || customer.companyName,
    });
  }

  if (recipients.length === 0) return { success: false, recipientCount: 0 };

  // Generate PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateInvoicePdf({ invoiceId: params.invoiceId });
  } catch (err) {
    console.error(`[CP Email] Failed to generate PDF for overdue invoice #${params.invoiceId}:`, err);
    return { success: false, recipientCount: 0 };
  }

  const bodyHtml = `
    <div style="background-color:#FFF3CD;border:1px solid #FFEEBA;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#856404;font-weight:bold;">
        This invoice is past due. Please arrange payment at your earliest convenience.
      </p>
    </div>
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">Payment Overdue: Invoice ${params.invoiceNumber}</h2>
    <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.6;">
      Dear {{contactName}},
    </p>
    <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.6;">
      This is a reminder that invoice <strong>${params.invoiceNumber}</strong> for <strong>${params.currency} ${params.totalAmount}</strong> was due on <strong>${params.dueDate}</strong> and is now <strong>${params.daysOverdue} day(s) overdue</strong>.
    </p>
    <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.6;">
      Please arrange payment at your earliest convenience. The invoice PDF is attached for your reference.
    </p>
    <p style="margin:0;font-size:14px;color:#555555;line-height:1.6;">
      If you have already made this payment, please disregard this notice and accept our thanks.
    </p>
  `;

  let sentCount = 0;
  for (const recipient of recipients) {
    try {
      const personalizedBody = bodyHtml.replace("{{contactName}}", recipient.name);
      const html = await renderCpEmailLayout(personalizedBody, branding, {
        preheader: `Payment overdue: Invoice ${params.invoiceNumber}`,
      });

      await sendCpEmail({
        to: recipient.email,
        subject: `Payment Overdue: Invoice ${params.invoiceNumber} — ${branding.companyName}`,
        html,
        fromName: branding.companyName,
        attachments: [{
          filename: `Invoice_${params.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        }],
      });
      sentCount++;
    } catch (err) {
      console.error(`[CP Email] Failed to send overdue email to ${recipient.email}:`, err);
    }
  }

  return { success: sentCount > 0, recipientCount: sentCount };
}
