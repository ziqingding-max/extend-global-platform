/**
 * Auth Email Service — Branded transactional emails for authentication flows.
 *
 * Unlike notification emails (managed via notificationService.ts with configurable rules),
 * auth emails are ALWAYS sent and cannot be disabled — they are essential for user access.
 *
 * Covers:
 * 1. Admin user invite
 * 2. Admin password reset (temp password)
 * 3. Client portal invite
 * 4. Client portal password reset
 * 5. Employee onboarding invite (self-service form)
 * 6. Worker portal password reset
 *
 * All emails use the branded EG layout from emailLayout.ts.
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

async function sendEmail(payload: { to: string; subject: string; html: string }) {
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

  await transporter.sendMail({
    from: `Extend Global <${ENV.emailFrom}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });

  console.log(`[Auth Email] Sent "${payload.subject}" to ${payload.to}`);
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
// 3. Client Portal Invite
// ============================================================================

export async function sendPortalInviteEmail(params: {
  to: string;
  contactName: string;
  companyName: string;
  portalRole: string;
  inviteUrl: string;
}) {
  const roleDisplay = params.portalRole === "admin" ? "Administrator" :
                       params.portalRole === "hr" ? "HR Manager" :
                       params.portalRole === "finance" ? "Finance Manager" :
                       params.portalRole === "viewer" ? "Viewer" : params.portalRole;

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
// 4. Client Portal Password Reset
// ============================================================================

export async function sendPortalPasswordResetEmail(params: {
  to: string;
  contactName: string;
  resetUrl: string;
}) {
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
// 5. Employee Onboarding Invite (Self-Service)
// ============================================================================

export async function sendOnboardingInviteEmail(params: {
  to: string;
  employeeName: string;
  companyName: string;
  inviteUrl: string;
}) {
  const body = `
<p>Dear ${params.employeeName},</p>
<p>Welcome! <strong>${params.companyName}</strong> has invited you to complete your onboarding with <strong>Extend Global (EG)</strong>.</p>
<p>As your Employer of Record (EOR), EG will handle your employment administration, payroll, and compliance. To get started, we need you to fill in some personal and employment information.</p>
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
// 8. Portal Password Changed by Admin (Notification)
// ============================================================================

export async function sendPortalPasswordChangedEmail(params: {
  to: string;
  contactName: string;
  newPassword: string;
  loginUrl: string;
}) {
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
// 9. Worker Portal Invite (Invite worker to set up Worker Portal account)
// ============================================================================

export async function sendWorkerPortalInviteEmail(params: {
  to: string;
  workerName: string;
  companyName: string;
  workerType: "employee" | "contractor";
  inviteUrl: string;
}) {
  const typeLabel = params.workerType === "employee" ? "employee" : "contractor";
  const body = `
<p>Dear ${params.workerName},</p>
<p>You have been invited to join the <strong>EG Worker Portal</strong> as a ${typeLabel} of <strong>${params.companyName}</strong>.</p>
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
