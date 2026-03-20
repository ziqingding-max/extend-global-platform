/**
 * Auth Email Service — Branded transactional emails for authentication flows.
 *
 * Unlike notification emails (managed via notificationService.ts with configurable rules),
 * auth emails are ALWAYS sent and cannot be disabled — they are essential for user access.
 *
 * Covers:
 * 1. Admin user invite                     (EG brand, admin audience)
 * 2. Admin password reset (temp password)   (EG brand, admin audience)
 * 3. Client portal invite                   (EG brand OR CP white-label)
 * 4. Client portal password reset           (EG brand OR CP white-label)
 * 5. Employee onboarding invite             (EG brand, worker audience, delegation tone)
 * 6. Worker portal password reset           (EG brand, worker audience)
 * 7. Admin forgot password                  (EG brand, admin audience)
 * 8. Portal password changed by admin       (EG brand OR CP white-label)
 * 9. Worker portal invite                   (EG brand, worker audience, delegation tone)
 *
 * White-label logic:
 * - Functions 3, 4, 8 accept an optional `channelPartnerId`.
 *   When provided, the email uses the CP's branding (logo, colors, company name)
 *   instead of the default EG layout. This ensures brand isolation for CP-channel clients.
 * - Functions 5, 9 accept optional `clientName` and `channelPartnerName` to build
 *   the delegation statement ("We have been engaged by [Client] and [CP]...").
 */

import {
  renderEmailLayout,
  emailButton,
  emailInfoCard,
  emailBanner,
  type EmailAudience,
} from "./emailLayout";

// ============================================================================
// Internal mailer (same as notificationService.sendRawEmail)
// ============================================================================

async function sendEmail(payload: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
}) {
  const nodemailer = (await import("nodemailer")).default;
  const { ENV } = await import("../_core/env");

  if (!ENV.emailSmtpHost || !ENV.emailSmtpUser) {
    console.log(`[Auth Email - Dev] To: ${payload.to} | Subject: ${payload.subject}`);
    console.log(`[Auth Email - Dev] (SMTP not configured, email not sent)`);
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

  const fromName = payload.fromName || "Extend Global";
  await transporter.sendMail({
    from: `${fromName} <${ENV.emailFrom}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });

  console.log(`[Auth Email] Sent "${payload.subject}" to ${payload.to}`);
}

// ============================================================================
// CP White-Label Support (shared with cpEmailService.ts pattern)
// ============================================================================

interface CpBrandingForAuth {
  companyName: string;
  logoUrl: string | null;
  logoFileKey: string | null;
  primaryColor: string;
  subdomain: string | null;
}

async function getCpBrandingForAuth(channelPartnerId: number): Promise<CpBrandingForAuth | null> {
  const { getDb } = await import("../db");
  const { channelPartners } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");

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
    subdomain: cp.subdomain,
  };
}

async function getCpLogoHtml(branding: CpBrandingForAuth): Promise<string> {
  let logoSrc: string | null = null;

  if (branding.logoFileKey) {
    try {
      const { storageGet } = await import("../storage");
      const { url } = await storageGet(branding.logoFileKey);
      logoSrc = url;
    } catch (err) {
      console.warn("[Auth Email] Failed to get signed CP logo URL:", err);
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
  branding: CpBrandingForAuth,
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

function cpEmailButton(text: string, url: string, color: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
<tr><td style="background-color:${color};border-radius:6px;padding:12px 28px;">
<a href="${url}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;display:inline-block;">${text}</a>
</td></tr>
</table>`;
}

// ============================================================================
// Delegation Statement Builder (for Worker emails)
// ============================================================================

function buildDelegationStatement(clientName?: string, channelPartnerName?: string): string {
  if (channelPartnerName && clientName) {
    return `We have been engaged by <strong>${clientName}</strong> and <strong>${channelPartnerName}</strong> as the local delivery partner and Employer of Record (EOR) to provide employment services on their behalf.`;
  } else if (clientName) {
    return `We have been engaged by <strong>${clientName}</strong> as the local delivery partner and Employer of Record (EOR) to provide employment services on their behalf.`;
  }
  return "As your Employer of Record (EOR), we handle your employment administration, payroll, and compliance.";
}

// ============================================================================
// 1. Admin User Invite
// ============================================================================

export async function sendAdminInviteEmail(params: {
  to: string;
  name: string;
  inviteUrl: string;
  roles: string;
}) {
  const body = `
<p>Dear ${params.name},</p>
<p>You have been invited to join the <strong>EG Admin Panel</strong> as a team member. Your account has been created with the following details:</p>
${emailInfoCard([
  { label: "Name", value: params.name },
  { label: "Email", value: params.to },
  { label: "Role(s)", value: params.roles },
])}
<p>To activate your account, please click the button below to set your password:</p>
${emailButton("Accept Invitation & Set Password", params.inviteUrl)}
${emailBanner("This invitation link will expire in 7 days. If you did not expect this invitation, please ignore this email.", "info")}
<p>Once activated, you can log in at the EG Admin Panel to begin managing operations.</p>
<p>Best regards,<br><strong>EG System</strong><br>Extend Global</p>`;

  const html = renderEmailLayout(body, {
    audience: "admin",
    preheader: "You've been invited to the EG Admin Panel",
  });

  await sendEmail({
    to: params.to,
    subject: "You're Invited to EG Admin Panel — Set Up Your Account",
    html,
  });
}

// ============================================================================
// 2. Admin Password Reset (Temp Password)
// ============================================================================

export async function sendAdminPasswordResetEmail(params: {
  to: string;
  name: string;
  tempPassword: string;
  loginUrl: string;
}) {
  const body = `
${emailBanner("Your password has been reset by an administrator.", "warning")}
<p>Dear ${params.name},</p>
<p>An administrator has reset your password for the EG Admin Panel. Please use the temporary password below to log in:</p>
${emailInfoCard([
  { label: "Email", value: params.to },
  { label: "Temporary Password", value: `<code style="font-size:16px;font-weight:bold;color:#005430;background:#f0fdf4;padding:2px 8px;border-radius:4px;">${params.tempPassword}</code>` },
])}
${emailBanner("We strongly recommend changing your password after logging in for security.", "info")}
${emailButton("Log In to Admin Panel", params.loginUrl)}
<p>If you did not request this password reset, please contact your system administrator immediately.</p>
<p>Best regards,<br><strong>EG System</strong><br>Extend Global</p>`;

  const html = renderEmailLayout(body, {
    audience: "admin",
    preheader: "Your EG Admin password has been reset",
  });

  await sendEmail({
    to: params.to,
    subject: "Your EG Admin Password Has Been Reset",
    html,
  });
}

// ============================================================================
// 3. Client Portal Invite (EG brand or CP white-label)
// ============================================================================

export async function sendPortalInviteEmail(params: {
  to: string;
  contactName: string;
  companyName: string;
  portalRole: string;
  inviteUrl: string;
  /** If provided, the email will use CP white-label branding instead of EG */
  channelPartnerId?: number;
}) {
  const roleDisplay = params.portalRole === "admin" ? "Administrator" :
                       params.portalRole === "hr" || params.portalRole === "hr_manager" ? "HR Manager" :
                       params.portalRole === "finance" ? "Finance Manager" :
                       params.portalRole === "viewer" ? "Viewer" : params.portalRole;

  // Check if we should use CP white-label
  if (params.channelPartnerId) {
    const branding = await getCpBrandingForAuth(params.channelPartnerId);
    if (branding) {
      const body = `
<p>Dear ${params.contactName},</p>
<p>You have been invited to join the <strong>${branding.companyName} Client Portal</strong> for <strong>${params.companyName}</strong>. The Client Portal gives you access to manage employees, view invoices, track onboarding progress, and more.</p>
${emailInfoCard([
  { label: "Company", value: params.companyName },
  { label: "Your Email", value: params.to },
  { label: "Portal Role", value: roleDisplay },
])}
<p>To get started, click the button below to set your password and activate your account:</p>
${cpEmailButton("Accept Invitation & Set Up Account", params.inviteUrl, branding.primaryColor)}
<p style="font-size:12px;color:#888888;">This invitation link will expire in 7 days. If you did not expect this invitation, please ignore this email.</p>
<p>If you have any questions, please contact your account manager at ${branding.companyName}.</p>
<p>Best regards,<br><strong>${branding.companyName} Team</strong></p>`;

      const html = await renderCpWhitelabelLayout(body, branding, {
        preheader: `You've been invited to the ${branding.companyName} Client Portal for ${params.companyName}`,
      });

      await sendEmail({
        to: params.to,
        subject: `You're Invited to the ${branding.companyName} Client Portal — ${params.companyName}`,
        html,
        fromName: branding.companyName,
      });
      return;
    }
  }

  // Default: EG brand
  const body = `
<p>Dear ${params.contactName},</p>
<p>You have been invited to join the <strong>EG Client Portal</strong> for <strong>${params.companyName}</strong>. The Client Portal gives you access to manage employees, view invoices, track onboarding progress, and more.</p>
${emailInfoCard([
  { label: "Company", value: params.companyName },
  { label: "Your Email", value: params.to },
  { label: "Portal Role", value: roleDisplay },
])}
<p>To get started, click the button below to set your password and activate your account:</p>
${emailButton("Accept Invitation & Set Up Account", params.inviteUrl)}
${emailBanner("This invitation link will expire in 7 days. If you did not expect this invitation, please ignore this email.", "info")}
<p>If you have any questions, please contact us at <a href="mailto:support@extendglobal.ai" style="color:#005430;">support@extendglobal.ai</a>.</p>
<p>Best regards,<br><strong>EG Operations Team</strong><br>Extend Global</p>`;

  const html = renderEmailLayout(body, {
    audience: "client",
    preheader: `You've been invited to the EG Client Portal for ${params.companyName}`,
  });

  await sendEmail({
    to: params.to,
    subject: `You're Invited to the EG Client Portal — ${params.companyName}`,
    html,
  });
}

// ============================================================================
// 4. Client Portal Password Reset (EG brand or CP white-label)
// ============================================================================

export async function sendPortalPasswordResetEmail(params: {
  to: string;
  contactName: string;
  resetUrl: string;
  /** If provided, the email will use CP white-label branding instead of EG */
  channelPartnerId?: number;
}) {
  // Check if we should use CP white-label
  if (params.channelPartnerId) {
    const branding = await getCpBrandingForAuth(params.channelPartnerId);
    if (branding) {
      const body = `
<p>Dear ${params.contactName},</p>
<p>We received a request to reset your password for the ${branding.companyName} Client Portal. If you made this request, please click the button below to set a new password:</p>
${cpEmailButton("Reset Your Password", params.resetUrl, branding.primaryColor)}
<p style="font-size:12px;color:#888888;">This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.</p>
<p>For security reasons, this link can only be used once. If you need to reset your password again, please visit the login page and request a new link.</p>
<p>Best regards,<br><strong>${branding.companyName} Team</strong></p>`;

      const html = await renderCpWhitelabelLayout(body, branding, {
        preheader: `Reset your ${branding.companyName} Client Portal password`,
      });

      await sendEmail({
        to: params.to,
        subject: `Password Reset — ${branding.companyName} Client Portal`,
        html,
        fromName: branding.companyName,
      });
      return;
    }
  }

  // Default: EG brand
  const body = `
<p>Dear ${params.contactName},</p>
<p>We received a request to reset your password for the EG Client Portal. If you made this request, please click the button below to set a new password:</p>
${emailButton("Reset Your Password", params.resetUrl)}
${emailBanner("This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.", "info")}
<p>For security reasons, this link can only be used once. If you need to reset your password again, please visit the login page and request a new link.</p>
<p>If you have any concerns about your account security, please contact us at <a href="mailto:support@extendglobal.ai" style="color:#005430;">support@extendglobal.ai</a>.</p>
<p>Best regards,<br><strong>EG Security Team</strong><br>Extend Global</p>`;

  const html = renderEmailLayout(body, {
    audience: "client",
    preheader: "Reset your EG Client Portal password",
  });

  await sendEmail({
    to: params.to,
    subject: "Reset Your EG Client Portal Password",
    html,
  });
}

// ============================================================================
// 5. Employee Onboarding Invite (Self-Service) — with delegation tone
// ============================================================================

export async function sendOnboardingInviteEmail(params: {
  to: string;
  employeeName: string;
  companyName: string;
  inviteUrl: string;
  /** Client company name — used in delegation statement */
  clientName?: string;
  /** CP company name — used in delegation statement for CP-channel workers */
  channelPartnerName?: string;
}) {
  const delegationText = buildDelegationStatement(
    params.clientName || params.companyName,
    params.channelPartnerName
  );

  const body = `
<p>Dear ${params.employeeName},</p>
<p>Welcome! You have been invited to complete your onboarding with <strong>Extend Global (EG)</strong>.</p>
<p>${delegationText}</p>
<p>To get started, we need you to fill in some personal and employment information.</p>
${emailInfoCard([
  { label: "Company", value: params.companyName },
  { label: "Your Email", value: params.to },
])}
<p>Please click the button below to complete your onboarding form:</p>
${emailButton("Complete Onboarding Form", params.inviteUrl)}
${emailBanner("This link will expire in 72 hours. Please complete the form before it expires.", "info")}
<p>If you have any questions about the onboarding process, please contact your HR representative at ${params.companyName} or reach out to us at <a href="mailto:support@extendglobal.ai" style="color:#005430;">support@extendglobal.ai</a>.</p>
<p>Best regards,<br><strong>EG Operations Team</strong><br>Extend Global</p>`;

  const html = renderEmailLayout(body, {
    audience: "worker",
    preheader: `Complete your onboarding with ${params.companyName} via EG`,
  });

  await sendEmail({
    to: params.to,
    subject: `Complete Your Onboarding — ${params.companyName} via EG`,
    html,
  });
}

// ============================================================================
// 6. Worker Portal Password Reset
// ============================================================================

export async function sendWorkerPasswordResetEmail(params: {
  to: string;
  workerName: string;
  resetUrl: string;
}) {
  const body = `
<p>Dear ${params.workerName},</p>
<p>We received a request to reset your password for the EG Worker Portal. If you made this request, please click the button below to set a new password:</p>
${emailButton("Reset Your Password", params.resetUrl)}
${emailBanner("This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.", "info")}
<p>For security reasons, this link can only be used once. If you need to reset your password again, please visit the login page and request a new link.</p>
<p>If you have any concerns about your account security, please contact us at <a href="mailto:support@extendglobal.ai" style="color:#005430;">support@extendglobal.ai</a>.</p>
<p>Best regards,<br><strong>EG Security Team</strong><br>Extend Global</p>`;

  const html = renderEmailLayout(body, {
    audience: "worker",
    preheader: "Reset your EG Worker Portal password",
  });

  await sendEmail({
    to: params.to,
    subject: "Reset Your EG Worker Portal Password",
    html,
  });
}

// ============================================================================
// 7. Admin Forgot Password (Reset Link)
// ============================================================================

export async function sendAdminForgotPasswordEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const body = `
<p>Dear ${params.name},</p>
<p>We received a request to reset your password for the EG Admin Panel. If you made this request, please click the button below to set a new password:</p>
${emailButton("Reset Your Password", params.resetUrl)}
${emailBanner("This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.", "info")}
<p>For security reasons, this link can only be used once. If you need to reset your password again, please visit the login page and request a new link.</p>
<p>If you have any concerns about your account security, please contact your system administrator immediately.</p>
<p>Best regards,<br><strong>EG Security Team</strong><br>Extend Global</p>`;

  const html = renderEmailLayout(body, {
    audience: "admin",
    preheader: "Reset your EG Admin Panel password",
  });

  await sendEmail({
    to: params.to,
    subject: "Reset Your EG Admin Panel Password",
    html,
  });
}

// ============================================================================
// 8. Portal Password Changed by Admin (EG brand or CP white-label)
// ============================================================================

export async function sendPortalPasswordChangedEmail(params: {
  to: string;
  contactName: string;
  newPassword: string;
  loginUrl: string;
  /** If provided, the email will use CP white-label branding instead of EG */
  channelPartnerId?: number;
}) {
  // Check if we should use CP white-label
  if (params.channelPartnerId) {
    const branding = await getCpBrandingForAuth(params.channelPartnerId);
    if (branding) {
      const body = `
<div style="background-color:#FFF3CD;border:1px solid #FFEEBA;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
  <p style="margin:0;font-size:13px;color:#856404;font-weight:bold;">Your Client Portal password has been reset by an administrator.</p>
</div>
<p>Dear ${params.contactName},</p>
<p>An administrator has reset your password for the ${branding.companyName} Client Portal. Please use the new credentials below to log in:</p>
${emailInfoCard([
  { label: "Email", value: params.to },
  { label: "New Password", value: `<code style="font-size:16px;font-weight:bold;color:#005430;background:#f0fdf4;padding:2px 8px;border-radius:4px;">${params.newPassword}</code>` },
])}
<p style="font-size:12px;color:#888888;">We strongly recommend changing your password after logging in for security.</p>
${cpEmailButton("Log In to Client Portal", params.loginUrl, branding.primaryColor)}
<p>If you did not expect this change, please contact your account manager at ${branding.companyName}.</p>
<p>Best regards,<br><strong>${branding.companyName} Team</strong></p>`;

      const html = await renderCpWhitelabelLayout(body, branding, {
        preheader: `Your ${branding.companyName} Client Portal password has been reset`,
      });

      await sendEmail({
        to: params.to,
        subject: `Your ${branding.companyName} Client Portal Password Has Been Reset`,
        html,
        fromName: branding.companyName,
      });
      return;
    }
  }

  // Default: EG brand
  const body = `
${emailBanner("Your Client Portal password has been reset by a EG administrator.", "warning")}
<p>Dear ${params.contactName},</p>
<p>A EG administrator has reset your password for the Client Portal. Please use the new credentials below to log in:</p>
${emailInfoCard([
  { label: "Email", value: params.to },
  { label: "New Password", value: `<code style="font-size:16px;font-weight:bold;color:#005430;background:#f0fdf4;padding:2px 8px;border-radius:4px;">${params.newPassword}</code>` },
])}
${emailBanner("We strongly recommend changing your password after logging in for security.", "info")}
${emailButton("Log In to Client Portal", params.loginUrl)}
<p>If you did not expect this change, please contact your EG account manager or email us at <a href="mailto:support@extendglobal.ai" style="color:#005430;">support@extendglobal.ai</a>.</p>
<p>Best regards,<br><strong>EG Security Team</strong><br>Extend Global</p>`;

  const html = renderEmailLayout(body, {
    audience: "client",
    preheader: "Your EG Client Portal password has been reset",
  });

  await sendEmail({
    to: params.to,
    subject: "Your EG Client Portal Password Has Been Reset",
    html,
  });
}

// ============================================================================
// 9. Worker Portal Invite — with delegation tone
// ============================================================================

export async function sendWorkerPortalInviteEmail(params: {
  to: string;
  workerName: string;
  companyName: string;
  workerType: "employee" | "contractor";
  inviteUrl: string;
  /** Client company name — used in delegation statement */
  clientName?: string;
  /** CP company name — used in delegation statement for CP-channel workers */
  channelPartnerName?: string;
}) {
  const typeLabel = params.workerType === "employee" ? "employee" : "contractor";
  const delegationText = buildDelegationStatement(
    params.clientName || params.companyName,
    params.channelPartnerName
  );

  const body = `
<p>Dear ${params.workerName},</p>
<p>You have been invited to join the <strong>EG Worker Portal</strong> as a ${typeLabel} of <strong>${params.companyName}</strong>.</p>
<p>${delegationText}</p>
<p>The Worker Portal gives you access to manage your work-related information, including:</p>
<ul>
  ${params.workerType === "employee" ? `
  <li>View and download your payslips</li>
  <li>Submit leave requests</li>
  <li>Submit expense reimbursements</li>
  ` : `
  <li>View your invoices</li>
  <li>Submit milestone deliverables</li>
  `}
  <li>View your documents and contracts</li>
  <li>Manage your profile information</li>
</ul>
<p>To get started, please click the button below to set your password and activate your account:</p>
${emailButton("Activate Your Account", params.inviteUrl)}
${emailBanner("This invitation link will expire in 7 days. If you did not expect this invitation, please ignore this email.", "info")}
<p>If you have any questions, please contact your HR representative at ${params.companyName} or reach out to us at <a href="mailto:support@extendglobal.ai" style="color:#005430;">support@extendglobal.ai</a>.</p>
<p>Best regards,<br><strong>EG Operations Team</strong><br>Extend Global</p>`;

  const html = renderEmailLayout(body, {
    audience: "worker",
    preheader: `You've been invited to the EG Worker Portal by ${params.companyName}`,
  });

  await sendEmail({
    to: params.to,
    subject: `Welcome to EG Worker Portal — ${params.companyName}`,
    html,
  });
}
