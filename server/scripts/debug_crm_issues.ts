
import { getDb } from "../services/db/connection";
import { salesLeads } from "../../drizzle/schema";
import { count, eq, sql } from "drizzle-orm";

async function debugCrmIssues() {
  console.log("Starting CRM Debug...");
  const db = await getDb();
  if (!db) {
    console.error("Failed to connect to database");
    process.exit(1);
  }

  // 1. Fetch all leads with relevant fields
  const leads = await db.select({
    id: salesLeads.id,
    companyName: salesLeads.companyName,
    status: salesLeads.status,
    expectedCloseDate: salesLeads.expectedCloseDate,
  }).from(salesLeads);

  console.log("\n=== All Sales Leads ===");
  console.table(leads);

  // 2. Check for hidden characters in status
  console.log("\n=== Status Field Analysis ===");
  leads.forEach(lead => {
    console.log(`ID: ${lead.id}, Status: '${lead.status}' (Length: ${lead.status.length})`);
    if (lead.status !== lead.status.trim()) {
      console.warn(`⚠️  WARNING: Status for ID ${lead.id} has surrounding whitespace!`);
    }
    // Check if status is in the expected list
    const validStatuses = [
      "discovery", "leads", "quotation_sent", "msa_sent", "msa_signed", "closed_won", "closed_lost"
    ];
    if (!validStatuses.includes(lead.status)) {
      console.warn(`⚠️  WARNING: Status '${lead.status}' for ID ${lead.id} is NOT in valid list!`);
    }
  });

  // 3. Check Expected Close Date format
  console.log("\n=== Expected Close Date Analysis ===");
  leads.forEach(lead => {
    if (lead.expectedCloseDate) {
      console.log(`ID: ${lead.id}, Date: '${lead.expectedCloseDate}'`);
    } else {
      console.log(`ID: ${lead.id}, Date: NULL`);
    }
  });

  process.exit(0);
}

debugCrmIssues().catch(console.error);
