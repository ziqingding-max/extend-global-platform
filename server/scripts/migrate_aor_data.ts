
import { getDb } from "../services/db/connection";
import { employees, contractors, migrationIdMap, contractorAdjustments, adjustments } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Migration Script: Move AOR Employees to Contractors Table
 * 
 * Usage: npx tsx server/scripts/migrate_aor_data.ts
 */
async function migrateAorData() {
  console.log("🚀 Starting AOR Data Migration...");
  
  const db = await getDb();
  if (!db) {
    console.error("❌ Failed to connect to database");
    process.exit(1);
  }

  // 1. Fetch all employees with serviceType = 'aor'
  const aorEmployees = await db.select().from(employees).where(eq(employees.serviceType, "aor"));
  console.log(`found ${aorEmployees.length} AOR employees to migrate.`);

  let successCount = 0;
  let errorCount = 0;

  for (const emp of aorEmployees) {
    try {
      // Check if already migrated
      const existingMap = await db.select().from(migrationIdMap).where(
        and(
          eq(migrationIdMap.entityType, "employee_to_contractor"),
          eq(migrationIdMap.oldId, emp.id)
        )
      );

      if (existingMap.length > 0) {
        console.log(`⚠️ Employee ${emp.id} (${emp.firstName} ${emp.lastName}) already migrated. Skipping.`);
        continue;
      }

      console.log(`Processing Employee ${emp.id}: ${emp.firstName} ${emp.lastName}...`);

      // 2. Map Employee to Contractor
      // Generate a Contractor Code (Simple auto-increment logic or similar format)
      // For simplicity in migration, we can generate a temporary code or use existing logic if available
      // Here we just use a placeholder timestamp based code to avoid collision
      const contractorCode = `CTR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const newContractor = await db.insert(contractors).values({
        contractorCode: contractorCode,
        customerId: emp.customerId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        phone: emp.phone,
        dateOfBirth: emp.dateOfBirth,
        nationality: emp.nationality,
        idNumber: emp.idNumber,
        idType: emp.idType,
        address: emp.address,
        city: emp.city,
        state: emp.state,
        country: emp.country,
        postalCode: emp.postalCode,
        jobTitle: emp.jobTitle,
        department: emp.department,
        startDate: emp.startDate,
        endDate: emp.endDate,
        status: mapStatus(emp.status),
        currency: emp.salaryCurrency,
        // Defaulting AOR specific fields based on existing EOR data
        paymentFrequency: "monthly", 
        rateType: "fixed_monthly",
        rateAmount: emp.baseSalary, // Assuming baseSalary maps to monthly rate
        notes: `Migrated from Employee ID: ${emp.id}`,
      }).returning({ id: contractors.id });

      const newContractorId = newContractor[0].id;

      // 3. Record Migration Mapping
      await db.insert(migrationIdMap).values({
        entityType: "employee_to_contractor",
        oldId: emp.id,
        newId: newContractorId,
      });

      // 4. Migrate Adjustments (Optional but recommended)
      // Find adjustments for this employee
      const empAdjustments = await db.select().from(adjustments).where(eq(adjustments.employeeId, emp.id));
      
      for (const adj of empAdjustments) {
        // Only migrate if not locked/processed to avoid messing up history? 
        // Or migrate all for record? Let's migrate 'submitted' ones as active items.
        // History adjustments might be tricky if they link to payroll runs.
        // For Phase 0, we migrate OPEN adjustments.
        if (["submitted", "client_approved", "admin_approved"].includes(adj.status)) {
             await db.insert(contractorAdjustments).values({
                contractorId: newContractorId,
                type: mapAdjustmentType(adj.adjustmentType),
                description: adj.description || "Migrated Adjustment",
                amount: adj.amount,
                currency: adj.currency,
                date: adj.effectiveMonth || new Date().toISOString(), // Fallback date
                status: "pending", // Reset status or map? Let's default to pending for review
                invoiceId: undefined, // Not invoiced yet
             });
        }
      }

      successCount++;
      console.log(`✅ Successfully migrated Employee ${emp.id} -> Contractor ${newContractorId}`);

    } catch (err) {
      console.error(`❌ Failed to migrate Employee ${emp.id}:`, err);
      errorCount++;
    }
  }

  console.log("\n==========================================");
  console.log(`Migration Completed.`);
  console.log(`Total AOR Employees: ${aorEmployees.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Skipped/Already Done: ${aorEmployees.length - successCount - errorCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log("==========================================");
  process.exit(0);
}

// Helper to map Employee Status to Contractor Status
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

// Helper to map Adjustment Type
function mapAdjustmentType(adjType: string): "bonus" | "expense" | "deduction" {
    switch (adjType) {
        case "bonus":
        case "allowance":
            return "bonus";
        case "reimbursement":
            return "expense";
        case "deduction":
            return "deduction";
        default:
            return "bonus";
    }
}

migrateAorData();
