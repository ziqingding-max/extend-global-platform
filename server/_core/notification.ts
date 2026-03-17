import nodemailer from "nodemailer";
import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { renderEmailLayout, emailBanner, emailInfoCard } from "../services/emailLayout";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Dispatches a project-owner notification via Email (SMTP / Alibaba DirectMail).
 * Returns `true` if the email was sent successfully, `false` otherwise.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!ENV.emailSmtpHost || !ENV.emailSmtpUser || !ENV.emailSmtpPass) {
    console.warn("[Notification] SMTP credentials missing. Email notification skipped.");
    // In dev mode, just log it
    if (!ENV.isProduction) {
      console.log(`[DEV Notification] Title: ${title}`);
      console.log(`[DEV Notification] Content: ${content}`);
      return true;
    }
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: ENV.emailSmtpHost,
      port: ENV.emailSmtpPort,
      secure: ENV.emailSmtpPort === 465, // true for 465, false for other ports
      auth: {
        user: ENV.emailSmtpUser,
        pass: ENV.emailSmtpPass,
      },
    });

    // Build branded HTML for admin system alerts
    const bodyHtml = `
${emailBanner(title, "warning")}
<p style="font-size:15px;color:#1a1a1a;line-height:1.65;">${content.replace(/\n/g, "<br/>")}</p>
<p style="margin-top:20px;font-size:13px;color:#888;">This is an automated system alert from the Extend Global platform.<br/>Timestamp: ${new Date().toISOString()}</p>
`;
    const html = renderEmailLayout(bodyHtml, { audience: "admin", preheader: title });

    await transporter.sendMail({
      from: `EG Admin <${ENV.emailFrom}>`,
      to: ENV.emailAdmin,
      subject: `[EG System Alert] ${title}`,
      html,
    });

    return true;
  } catch (error) {
    console.warn("[Notification] Error sending email:", error);
    return false;
  }
}
