/**
 * Simple email test — sends 1 email to verify delivery.
 * Usage: node scripts/test_email_simple.cjs [recipient_email]
 */
const nodemailer = require("nodemailer");

const SMTP_HOST = "smtpdm.aliyun.com";
const SMTP_PORT = 465;
const SMTP_USER = "notifications@no-reply.geahr.com";
const SMTP_PASS = "NoTifications2026";
const TO = process.argv[2] || "simon.ding@bestgea.com";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,sans-serif;">
<table width="100%" style="background-color:#f4f5f7;"><tr><td align="center" style="padding:24px;">
<table width="600" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background-color:#005430;padding:28px 32px;text-align:center;">
<img src="https://app.geahr.com/brand/gea-logo-email.png" alt="GEA - Global Employment Advisors" width="220" style="display:block;margin:0 auto;max-width:220px;height:auto;" />
</td></tr>
<tr><td style="background-color:#D4A843;height:3px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:32px;font-size:15px;line-height:1.65;color:#1a1a1a;">
<p>Dear Team,</p>
<p>This is a test email to verify the GEA branded email template delivery.</p>
<p>If you receive this email, the template system is working correctly.</p>
<p>Best regards,<br><strong>GEA System</strong></p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
<p style="font-size:12px;color:#888;">&copy; 2026 Global Employment Advisors (GEA). All rights reserved.</p>
</td></tr>
</table></td></tr></table></body></html>`;

(async () => {
  console.log("Sending simple test email to:", TO);
  try {
    await transporter.sendMail({
      from: `GEA Notification <${SMTP_USER}>`,
      to: TO,
      subject: "GEA Email Template Test",
      html
    });
    console.log("✓ Sent successfully!");
  } catch (e) {
    console.error("✗ Failed:", e.message);
  }
})();
