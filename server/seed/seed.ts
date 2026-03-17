import { getDb } from "../db";
import { countriesConfig, countrySocialInsuranceItems } from "../../drizzle/schema";
import { countriesData } from "./data/countries";
import { socialInsuranceRules } from "./data/socialInsuranceRules";
import { eq, and } from "drizzle-orm";

async function seed() {
  const db = getDb();
  if (!db) {
    console.error("Database connection failed");
    process.exit(1);
  }

  console.log("🌱 Starting seed...");

  // 1. Seed Countries
  console.log("🌍 Seeding countries...");
  for (const country of countriesData) {
    const existing = await db
      .select()
      .from(countriesConfig)
      .where(eq(countriesConfig.countryCode, country.countryCode))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(countriesConfig).values(country);
      console.log(`   + Added ${country.countryName}`);
    } else {
      // Update existing if needed (e.g. currency)
      // await db.update(countriesConfig).set(country).where(eq(countriesConfig.countryCode, country.countryCode));
    }
  }

  // 2. Seed Social Insurance Rules
  console.log("🛡️ Seeding social insurance rules (2025)...");
  
  // Clear existing 2025 rules to avoid duplicates during dev iterations
  await db
    .delete(countrySocialInsuranceItems)
    .where(eq(countrySocialInsuranceItems.effectiveYear, 2025));

  // Insert in batches
  const batchSize = 50;
  for (let i = 0; i < socialInsuranceRules.length; i += batchSize) {
    const batch = socialInsuranceRules.slice(i, i + batchSize);
    await db.insert(countrySocialInsuranceItems).values(batch);
    console.log(`   + Inserted batch ${i / batchSize + 1} (${batch.length} items)`);
  }

  console.log("✅ Seed completed successfully!");
}

seed().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
