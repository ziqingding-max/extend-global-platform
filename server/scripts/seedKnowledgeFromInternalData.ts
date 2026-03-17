/**
 * Seed Knowledge Base from Internal Data
 *
 * This script generates knowledge_items articles from existing internal data:
 * - Country Guide chapters (country_guide_chapters table)
 * - Social Insurance rules (country_social_insurance_items table)
 * - Public Holidays (public_holidays table)
 * - Leave Types (leave_types table)
 *
 * Prerequisites:
 * - country_guide_chapters should be seeded (run seedCountryGuides.ts) for DB-based guide data;
 *   if not seeded, the generator will fallback to data/country_guide_data.json automatically.
 * - social insurance data must be seeded (via seed-production.ts)
 * - public holidays and leave types must be seeded (via seed-production.ts)
 *
 * Usage:
 *   DATABASE_URL=file:server/sqlite.db npx tsx server/scripts/seedKnowledgeFromInternalData.ts
 *   DATABASE_URL=file:server/sqlite.db npx tsx server/scripts/seedKnowledgeFromInternalData.ts --dry-run
 *   DATABASE_URL=file:server/sqlite.db npx tsx server/scripts/seedKnowledgeFromInternalData.ts --countries=AU,SG,VN
 */

import "dotenv/config";
import { generateKnowledgeFromInternalData } from "../services/knowledgeInternalGeneratorService";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const countriesArg = args.find((a) => a.startsWith("--countries="));
  const countryCodes = countriesArg
    ? countriesArg.replace("--countries=", "").split(",").map((c) => c.trim().toUpperCase())
    : undefined;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Knowledge Base — Internal Data Generator                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  if (dryRun) {
    console.log("🔍 DRY RUN MODE — No data will be written to the database.");
  }

  if (countryCodes) {
    console.log(`🌍 Targeting countries: ${countryCodes.join(", ")}`);
  } else {
    console.log("🌍 Targeting ALL active countries");
  }

  console.log();

  try {
    const result = await generateKnowledgeFromInternalData({
      countryCodes,
      dryRun,
    });

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("                      GENERATION RESULTS                       ");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log();
    console.log(`  Total articles generated:  ${result.totalGenerated}`);
    console.log(`  Countries covered:         ${result.countries.length}`);
    console.log();
    console.log("  By article type:");
    console.log(`    Country Overview:         ${result.byType.countryOverview}`);
    console.log(`    Social Insurance:         ${result.byType.socialInsurance}`);
    console.log(`    Public Holidays:          ${result.byType.publicHolidays}`);
    console.log(`    Leave Entitlements:        ${result.byType.leaveEntitlements}`);
    console.log(`    Hiring Guide:             ${result.byType.hiringGuide}`);
    console.log(`    Compensation Guide:        ${result.byType.compensationGuide}`);
    console.log(`    Termination Guide:         ${result.byType.terminationGuide}`);
    console.log(`    Working Conditions:         ${result.byType.workingConditions}`);
    console.log();

    if (result.errors.length > 0) {
      console.log("  ⚠️  Errors:");
      for (const err of result.errors) {
        console.log(`    - ${err}`);
      }
      console.log();
    }

    if (dryRun) {
      console.log("  ℹ️  Dry run complete. No data was written.");
    } else {
      console.log("  ✅ All articles inserted into knowledge_items table.");
    }

    console.log();
    console.log("═══════════════════════════════════════════════════════════════");
  } catch (error) {
    console.error("❌ Generation failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);
