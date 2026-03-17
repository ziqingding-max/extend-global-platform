/**
 * GEA Email Layout — Unified HTML email template with brand identity.
 *
 * Features:
 * - Brand-colored header with GEA logo
 * - Structured content area
 * - Professional footer with "About GEA" for client-facing emails
 * - Table-based layout for maximum email client compatibility
 * - Inline CSS only (no external stylesheets)
 */

// Brand colors
const BRAND_GREEN = "#005430";
const BRAND_GREEN_LIGHT = "#006a3e";
const BRAND_GOLD = "#D4A843";
const TEXT_PRIMARY = "#1a1a1a";
const TEXT_SECONDARY = "#555555";
const TEXT_MUTED = "#888888";
const BG_BODY = "#f4f5f7";
const BG_CARD = "#ffffff";
const BORDER_LIGHT = "#e5e7eb";

/**
 * Build the logo <img> tag using an externally hosted URL.
 * The logo PNG is served from the app's static files at /brand/gea-logo-email.png.
 * The base URL comes from ADMIN_APP_URL in .env (e.g. https://app.geahr.com).
 * This avoids base64 embedding which triggers anti-spam filters on Aliyun DirectMail.
 */
function getLogoImg(): string {
  const appUrl = (process.env.ADMIN_APP_URL || "").replace(/\/+$/, "");
  if (appUrl) {
    return `<img src="${appUrl}/brand/gea-logo-email.png" alt="GEA - Global Employment Advisors" width="220" style="display:block;margin:0 auto;max-width:220px;height:auto;" />`;
  }
  return `<span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:1px;">GEA — Global Employment Advisors</span>`;
}

/**
 * Audience type determines footer content:
 * - "client": Shows full "About GEA" company introduction
 * - "worker": Shows simplified support info
 * - "admin": Shows minimal internal footer
 */
export type EmailAudience = "admin" | "client" | "worker";

/**
 * Wraps email body HTML in the branded GEA layout.
 */
export function renderEmailLayout(
  bodyHtml: string,
  options: {
    audience: EmailAudience;
    preheader?: string; // Hidden preview text for email clients
  }
): string {
  const logoImg = getLogoImg();

  const preheaderHtml = options.preheader
    ? `<div style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${options.preheader}</div>`
    : "";

  const footerContent = buildFooter(options.audience);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>GEA Notification</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BG_BODY};font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
${preheaderHtml}

<!-- Outer wrapper -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BG_BODY};">
<tr>
<td align="center" style="padding:24px 16px;">

<!-- Email container -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${BG_CARD};border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

<!-- ========== HEADER ========== -->
<tr>
<td style="background-color:${BRAND_GREEN};padding:28px 32px;text-align:center;">
${logoImg}
</td>
</tr>

<!-- Gold accent line -->
<tr>
<td style="background-color:${BRAND_GOLD};height:3px;font-size:0;line-height:0;">&nbsp;</td>
</tr>

<!-- ========== BODY ========== -->
<tr>
<td style="padding:32px 32px 24px 32px;color:${TEXT_PRIMARY};font-size:15px;line-height:1.65;">
${bodyHtml}
</td>
</tr>

<!-- ========== FOOTER ========== -->
${footerContent}

</table>
<!-- /Email container -->

</td>
</tr>
</table>
<!-- /Outer wrapper -->

</body>
</html>`;
}

function buildFooter(audience: EmailAudience): string {
  const year = new Date().getFullYear();

  // About GEA section — only for client-facing emails
  const aboutSection =
    audience === "client"
      ? `
<tr>
<td style="padding:0 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td style="border-top:1px solid ${BORDER_LIGHT};padding:20px 0 0 0;">
<p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;color:${BRAND_GREEN};">About GEA (Global Employment Advisors)</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:${TEXT_MUTED};">As CGL Group's overseas business sub-brand, GEA helps enterprises navigate emerging markets across the full lifecycle — from Access to Implementation, from Development to Reorganization — providing comprehensive, end-to-end human resources services and solutions.</p>
</td>
</tr>
</table>
</td>
</tr>`
      : "";

  // Support line
  const supportLine =
    audience === "admin"
      ? `This is an internal system notification.`
      : `Questions? Contact us at <a href="mailto:support@bestgea.com" style="color:${BRAND_GREEN};text-decoration:none;">support@bestgea.com</a>`;

  return `
${aboutSection}

<!-- Bottom footer -->
<tr>
<td style="padding:20px 32px 24px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td style="border-top:1px solid ${BORDER_LIGHT};padding:20px 0 0 0;text-align:center;">
<p style="margin:0 0 6px 0;font-size:12px;color:${TEXT_MUTED};">${supportLine}</p>
<p style="margin:0;font-size:11px;color:#aaaaaa;">&copy; ${year} Global Employment Advisors (GEA). All rights reserved.</p>
</td>
</tr>
</table>
</td>
</tr>`;
}

// ─── Reusable HTML snippet builders for email templates ───

/** CTA button */
export function emailButton(text: string, href: string, color: string = BRAND_GREEN): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
<tr>
<td align="center" style="background-color:${color};border-radius:6px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;border-radius:6px;">
${text}
</a>
</td>
</tr>
</table>`;
}

/** Info card with key-value rows */
export function emailInfoCard(rows: Array<{ label: string; value: string }>): string {
  const rowsHtml = rows
    .map(
      (r) =>
        `<tr>
<td style="padding:8px 12px;font-size:13px;color:${TEXT_SECONDARY};border-bottom:1px solid ${BORDER_LIGHT};width:40%;font-weight:600;">${r.label}</td>
<td style="padding:8px 12px;font-size:13px;color:${TEXT_PRIMARY};border-bottom:1px solid ${BORDER_LIGHT};">${r.value}</td>
</tr>`
    )
    .join("\n");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f9fafb;border:1px solid ${BORDER_LIGHT};border-radius:6px;margin:16px 0;overflow:hidden;">
${rowsHtml}
</table>`;
}

/** Colored alert banner */
export function emailBanner(text: string, type: "warning" | "danger" | "success" | "info" = "info"): string {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    warning: { bg: "#fffbeb", border: "#f59e0b", text: "#92400e" },
    danger: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" },
    success: { bg: "#f0fdf4", border: "#22c55e", text: "#166534" },
    info: { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
  };
  const c = colors[type];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0;">
<tr>
<td style="background-color:${c.bg};border-left:4px solid ${c.border};padding:12px 16px;border-radius:4px;">
<p style="margin:0;font-size:14px;font-weight:600;color:${c.text};">${text}</p>
</td>
</tr>
</table>`;
}

/** Large amount display */
export function emailAmountDisplay(currency: string, amount: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0;">
<tr>
<td align="center" style="padding:16px;background-color:#f9fafb;border-radius:6px;">
<p style="margin:0;font-size:28px;font-weight:bold;color:${BRAND_GREEN};">${currency} ${amount}</p>
</td>
</tr>
</table>`;
}
