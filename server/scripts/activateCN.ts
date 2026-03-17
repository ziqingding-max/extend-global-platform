import { getDb } from "../services/db/connection";
import { countriesConfig } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

async function activateCountries() {
  const db = getDb();
  if (!db) {
    console.error("Failed to connect to DB");
    return;
  }

  const targets = ["CN", "HK"];
  console.log(`Activating countries: ${targets.join(", ")}...`);

  await db.update(countriesConfig)
    .set({ isActive: true })
    .where(inArray(countriesConfig.countryCode, targets));

  console.log("Countries activated.");
  
  // Verify
  const active = await db.select().from(countriesConfig).where(inArray(countriesConfig.countryCode, targets));
  active.forEach(c => {
      console.log(`${c.countryCode}: isActive=${c.isActive}`);
  });
}

activateCountries().catch(console.error);
