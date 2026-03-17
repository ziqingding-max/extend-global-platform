import { z } from "zod";

/**
 * Environment variable schema definition.
 * Validates existence and format of required environment variables.
 */
const envSchema = z.object({
  // Core
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  // cookieSecret / JWT_SECRET is critical for auth security
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Storage (OSS) - Optional in dev, but likely needed for file features
  OSS_ACCESS_KEY_ID: z.string().optional(),
  OSS_ACCESS_KEY_SECRET: z.string().optional(),
  OSS_REGION: z.string().optional(),
  OSS_BUCKET: z.string().optional(),
  OSS_ENDPOINT: z.string().optional(),

  // Email - Optional
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.coerce.number().default(465),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("no-reply@geahr.com"),
  EMAIL_ADMIN: z.string().default("admin@geahr.com"),

  // AI - Optional
  DASHSCOPE_API_KEY: z.string().optional(),
  
  // Legacy / Manus (To be removed)
  BUILT_IN_FORGE_API_URL: z.string().optional(),
  BUILT_IN_FORGE_API_KEY: z.string().optional(),
  VITE_APP_ID: z.string().optional(),
  OAUTH_SERVER_URL: z.string().optional(),
});

// Parse process.env
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  // In production, we want to fail fast. In dev, we might tolerate some missing vars if they are not used immediately,
  // but for core vars like DATABASE_URL, we must fail.
  // Given the schema above only marks truly critical ones as required, we should throw.
  throw new Error("Invalid environment variables");
}

const env = parsed.data;

export const ENV = {
  cookieSecret: env.JWT_SECRET,
  databaseUrl: env.DATABASE_URL,
  isProduction: env.NODE_ENV === "production",
  
  // Alibaba Cloud / AWS S3 Compatible Storage
  ossAccessKeyId: env.OSS_ACCESS_KEY_ID ?? "",
  ossAccessKeySecret: env.OSS_ACCESS_KEY_SECRET ?? "",
  ossRegion: env.OSS_REGION ?? "",
  ossBucket: env.OSS_BUCKET ?? "",
  ossEndpoint: env.OSS_ENDPOINT ?? "",

  // Alibaba Cloud DirectMail / SMTP
  emailSmtpHost: env.EMAIL_SMTP_HOST ?? "",
  emailSmtpPort: env.EMAIL_SMTP_PORT,
  emailSmtpUser: env.EMAIL_SMTP_USER ?? "",
  emailSmtpPass: env.EMAIL_SMTP_PASS ?? "",
  emailFrom: env.EMAIL_FROM,
  emailAdmin: env.EMAIL_ADMIN,

  // Alibaba Cloud DashScope (Qwen)
  dashscopeApiKey: env.DASHSCOPE_API_KEY ?? "",
  
  // Legacy / Manus (To be removed)
  forgeApiUrl: env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: env.BUILT_IN_FORGE_API_KEY ?? "",
  appId: env.VITE_APP_ID ?? "",
  oAuthServerUrl: env.OAUTH_SERVER_URL ?? "",
};
