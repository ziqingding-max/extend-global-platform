import { getDb } from "../db";
import { countryGuideChapters, countriesConfig, billingEntities } from "../../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";
import { generateCountryGuidePdf, BrandingInfo } from "./htmlPdfService";
import { storageGet } from "../storage";

/**
 * Fetch the default (or first active) billing entity and convert it to BrandingInfo.
 * Falls back to EG defaults if no billing entity is configured.
 */
async function getDefaultBranding(db: ReturnType<typeof getDb>): Promise<BrandingInfo> {
  if (!db) return { shortName: "EG", fullName: "Extend Global", contactEmail: "support@extendglobal.ai" };

  // Try isDefault=true first, then fall back to first active entity
  let entity = await db.query.billingEntities.findFirst({
    where: and(eq(billingEntities.isDefault, true), eq(billingEntities.isActive, true)),
  });
  if (!entity) {
    entity = await db.query.billingEntities.findFirst({
      where: eq(billingEntities.isActive, true),
    });
  }
  if (!entity) {
    return { shortName: "EG", fullName: "Extend Global", contactEmail: "support@extendglobal.ai" };
  }

  // Build a one-line address
  const addressParts = [entity.address, entity.city, entity.country].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(", ") : undefined;

  // Resolve logo URL: prefer signed S3 URL from logoFileKey, fall back to logoUrl
  let resolvedLogoUrl = entity.logoUrl ?? null;
  if (entity.logoFileKey) {
    try {
      const { url: signedUrl } = await storageGet(entity.logoFileKey);
      resolvedLogoUrl = signedUrl;
    } catch (err) {
      console.warn("[CountryGuidePdf] Failed to sign logo URL:", err);
    }
  }

  return {
    shortName: entity.entityName,
    fullName: entity.legalName,
    logoUrl: resolvedLogoUrl,
    contactEmail: entity.contactEmail ?? null,
    address: address ?? null,
    legalName: entity.legalName,
  };
}

export const countryGuidePdfService = {
  generatePdf: async (countryCode: string, locale: "en" | "zh" = "en"): Promise<Buffer | null> => {
    const db = getDb();
    if (!db) throw new Error("Database connection failed");

    // 1. Fetch Country Info
    const country = await db.query.countriesConfig.findFirst({
      where: eq(countriesConfig.countryCode, countryCode),
    });
    if (!country) return null;

    // 2. Fetch Chapters
    const chapters = await db.query.countryGuideChapters.findMany({
      where: and(
        eq(countryGuideChapters.countryCode, countryCode),
        eq(countryGuideChapters.status, "published")
      ),
      orderBy: [asc(countryGuideChapters.sortOrder)],
    });
    if (chapters.length === 0) return null;

    // 3. Fetch default billing entity branding
    const branding = await getDefaultBranding(db);

    // 4. Generate PDF using HTML engine (supports tables, bold, headings)
    return generateCountryGuidePdf(
      { countryCode: country.countryCode, countryName: country.countryName },
      chapters.map((ch) => ({
        id: ch.id,
        titleEn: ch.titleEn,
        titleZh: ch.titleZh ?? undefined,
        contentEn: ch.contentEn ?? "",
        contentZh: ch.contentZh ?? undefined,
        chapterKey: ch.chapterKey,
        sortOrder: ch.sortOrder ?? 0,
      })),
      locale,
      branding
    );
  },
};
