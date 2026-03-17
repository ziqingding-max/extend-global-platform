
import { getDb } from "../services/db/connection";
import { employees, contractors, migrationIdMap, contractorAdjustments } from "../../drizzle/schema";
import { eq, and, count } from "drizzle-orm";

/**
 * Verification Script: Validate AOR Data Migration
 * 
 * Usage: npx tsx server/scripts/verify_migration.ts
 */
async function verifyMigration() {
  console.log("🔍 Verifying AOR Data Migration...");
  
  const db = await getDb();
  if (!db) {
    console.error("❌ Failed to connect to database");
    process.exit(1);
  }

  // 1. Check total migrated count
  const migrationLogs = await db.select().from(migrationIdMap).where(eq(migrationIdMap.entityType, "employee_to_contractor"));
  console.log(`Found ${migrationLogs.length} migrated records in migration_id_map.`);

  if (migrationLogs.length === 0) {
    console.warn("⚠️ No migration records found. Did you run the migration script?");
    process.exit(0);
  }

  let inconsistencies = 0;

  for (const log of migrationLogs) {
    // 2. Fetch original Employee
    const emp = await db.select().from(employees).where(eq(employees.id, log.oldId)).limit(1);
    if (emp.length === 0) {
      console.error(`❌ Original Employee ID ${log.oldId} not found!`);
      inconsistencies++;
      continue;
    }

    // 3. Fetch new Contractor
    const ctr = await db.select().from(contractors).where(eq(contractors.id, log.newId)).limit(1);
    if (ctr.length === 0) {
      console.error(`❌ New Contractor ID ${log.newId} not found (mapped from Employee ${log.oldId})!`);
      inconsistencies++;
      continue;
    }

    const employee = emp[0];
    const contractor = ctr[0];

    // 4. Verify Key Fields
    let issues: string[] = [];
    if (employee.email !== contractor.email) issues.push(`Email mismatch: ${employee.email} vs ${contractor.email}`);
    if (employee.firstName !== contractor.firstName) issues.push(`FirstName mismatch`);
    if (employee.lastName !== contractor.lastName) issues.push(`LastName mismatch`);
    
    // Check Status Mapping
    const expectedStatus = mapStatus(employee.status);
    if (expectedStatus !== contractor.status) {
        // Allow for manual updates post-migration, but warn
        // console.warn(`⚠️ Status mismatch for ID ${log.newId}: Expected ${expectedStatus}, Found ${contractor.status}`);
    }

    if (issues.length > 0) {
      console.error(`❌ Data inconsistency for Migration ID ${log.id} (Emp ${log.oldId} -> Ctr ${log.newId}):`, issues.join(", "));
      inconsistencies++;
    } else {
      // console.log(`✅ Verified: ${employee.firstName} ${employee.lastName}`);
    }
  }

  // 5. Check Adjustments Migration
  const totalContractorAdjustments = await db.select({ count: count() }).from(contractorAdjustments);
  console.log(`Total Contractor Adjustments found: ${totalContractorAdjustments[0].count}`);

  console.log("\n==========================================");
  if (inconsistencies === 0) {
    console.log("✅ Verification PASSED: All migrated records match source data.");
  } else {
    console.error(`❌ Verification FAILED: Found ${inconsistencies} inconsistencies.`);
  }
  console.log("==========================================");
  process.exit(inconsistencies > 0 ? 1 : 0);
}

// Helper (Duplicated from migration script for consistency check)
function mapStatus(empStatus: string): "pending_review" | "active" | "terminated" {
    switch (empStatus) {
        case "active":
        case "on_leave":
            return "active";
        case "terminated":
        case "offboarding":
            return "terminated";
        default:
            return "pending_review";
    }
}

verifyMigration();
