/**
 * Seed Country Guide Chapters
 *
 * Reads the generated JSON data and inserts it into the country_guide_chapters table.
 * Usage: npx tsx server/scripts/seedCountryGuides.ts [path-to-json]
 *
 * The JSON file should be an array of objects with:
 * - countryCode, part, chapterKey, titleEn, titleZh, contentEn, contentZh, sortOrder, version, status
 */

import { getDb } from "../db";
import { countryGuideChapters } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function seedCountryGuides() {
  const jsonPath = process.argv[2] || path.resolve(__dirname, "../../data/country_guide_data.json");

  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`Loaded ${rawData.length} chapters from ${jsonPath}`);

  const db = getDb();
  if (!db) {
    console.error("Database connection failed");
    process.exit(1);
  }

  let imported = 0;
  let skipped = 0;

  for (const chapter of rawData) {
    // Check if chapter already exists
    const existing = await db.query.countryGuideChapters.findFirst({
      where: and(
        eq(countryGuideChapters.countryCode, chapter.countryCode),
        eq(countryGuideChapters.chapterKey, chapter.chapterKey)
      ),
    });

    if (existing) {
      // Update existing
      await db
        .update(countryGuideChapters)
        .set({
          part: chapter.part,
          titleEn: chapter.titleEn,
          titleZh: chapter.titleZh,
          contentEn: chapter.contentEn,
          contentZh: chapter.contentZh,
          sortOrder: chapter.sortOrder,
          version: chapter.version || "2026-Q1",
          status: chapter.status || "published",
          updatedAt: new Date(),
        })
        .where(eq(countryGuideChapters.id, existing.id));
      imported++;
    } else {
      // Insert new
      await db.insert(countryGuideChapters).values({
        countryCode: chapter.countryCode,
        part: chapter.part,
        chapterKey: chapter.chapterKey,
        titleEn: chapter.titleEn,
        titleZh: chapter.titleZh,
        contentEn: chapter.contentEn,
        contentZh: chapter.contentZh,
        sortOrder: chapter.sortOrder,
        version: chapter.version || "2026-Q1",
        status: chapter.status || "published",
      });
      imported++;
    }
  }

  console.log(`Done! Imported/Updated: ${imported}, Skipped: ${skipped}`);
}

seedCountryGuides().catch(console.error);
