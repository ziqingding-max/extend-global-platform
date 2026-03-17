import { getDb } from "../services/db/connection";
import { countriesConfig } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

async function checkCountries() {
  const db = getDb();
  if (!db) {
    console.error("Failed to connect to DB");
    return;
  }

  const allCountries = await db.select().from(countriesConfig);
  console.log(`Total countries found: ${allCountries.length}`);
  
  const activeCountries = await db.select().from(countriesConfig).where(eq(countriesConfig.isActive, true));
  console.log(`Active countries found: ${activeCountries.length}`);
  console.log("Active Country Codes:", activeCountries.map(c => c.countryCode).join(", "));
  
  const inactiveCountries = await db.select().from(countriesConfig).where(eq(countriesConfig.isActive, false));
  console.log(`Inactive countries found: ${inactiveCountries.length}`);
  console.log("Inactive Country Codes:", inactiveCountries.map(c => c.countryCode).join(", "));

}

checkCountries().catch(console.error);
