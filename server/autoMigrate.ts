/**
 * Auto-Migration: Ensures the SQLite database schema matches the Drizzle schema.
 *
 * This script runs at server startup and adds any columns that exist in the
 * Drizzle schema but are missing from the actual SQLite tables.
 *
 * Handles:
 * - invoices.creditNoteDisposition
 * - Phase 1 AOR alignment: new columns on contractor_adjustments & contractor_milestones
 *
 * This is a lightweight alternative to full Drizzle Kit migrations,
 * suitable for adding columns that don't require complex data backfill.
 *
 * For NOT NULL columns that are new, we ADD COLUMN with a DEFAULT,
 * then run backfill queries to populate existing rows.
 */

import { createClient } from "@libsql/client";

interface ColumnMigration {
  table: string;
  column: string;
  type: string;
  defaultValue?: string;
}

/**
 * List of columns that should exist but may be missing from the database.
 * Add new entries here when the Drizzle schema gains new columns
 * that haven't been applied via drizzle-kit migrate.
 *
 * For NOT NULL columns, provide a defaultValue so ALTER TABLE ADD COLUMN succeeds
 * on existing rows. SQLite requires a default for NOT NULL columns added via ALTER TABLE.
 */
const REQUIRED_COLUMNS: ColumnMigration[] = [
  // ── invoices ──
  {
    table: "invoices",
    column: "creditNoteDisposition",
    type: "TEXT",
  },

  // ── contractor_adjustments (Phase 1 AOR alignment) ──
  {
    table: "contractor_adjustments",
    column: "customerId",
    type: "INTEGER NOT NULL",
    defaultValue: "0",
  },
  {
    table: "contractor_adjustments",
    column: "attachmentFileKey",
    type: "TEXT",
  },
  {
    table: "contractor_adjustments",
    column: "submittedBy",
    type: "INTEGER",
  },
  {
    table: "contractor_adjustments",
    column: "clientApprovedBy",
    type: "INTEGER",
  },
  {
    table: "contractor_adjustments",
    column: "clientApprovedAt",
    type: "INTEGER",
  },
  {
    table: "contractor_adjustments",
    column: "clientRejectionReason",
    type: "TEXT",
  },
  {
    table: "contractor_adjustments",
    column: "adminApprovedBy",
    type: "INTEGER",
  },
  {
    table: "contractor_adjustments",
    column: "adminApprovedAt",
    type: "INTEGER",
  },
  {
    table: "contractor_adjustments",
    column: "adminRejectionReason",
    type: "TEXT",
  },
  {
    table: "contractor_adjustments",
    column: "effectiveMonth",
    type: "TEXT NOT NULL",
    defaultValue: "'2025-01-01'",
  },

  // ── contractor_milestones (Phase 1 AOR alignment) ──
  {
    table: "contractor_milestones",
    column: "customerId",
    type: "INTEGER NOT NULL",
    defaultValue: "0",
  },
  {
    table: "contractor_milestones",
    column: "submittedBy",
    type: "INTEGER",
  },
  {
    table: "contractor_milestones",
    column: "clientApprovedBy",
    type: "INTEGER",
  },
  {
    table: "contractor_milestones",
    column: "clientApprovedAt",
    type: "INTEGER",
  },
  {
    table: "contractor_milestones",
    column: "clientRejectionReason",
    type: "TEXT",
  },
  {
    table: "contractor_milestones",
    column: "adminApprovedBy",
    type: "INTEGER",
  },
  {
    table: "contractor_milestones",
    column: "adminApprovedAt",
    type: "INTEGER",
  },
  {
    table: "contractor_milestones",
    column: "adminRejectionReason",
    type: "TEXT",
  },
  {
    table: "contractor_milestones",
    column: "effectiveMonth",
    type: "TEXT",
  },
  // ── leave_records (payroll lifecycle fix) ──
  {
    table: "leave_records",
    column: "payrollRunId",
    type: "INTEGER",
  },
  // ── leave_types (gender-based filtering) ──
  {
    table: "leave_types",
    column: "applicableGender",
    type: "TEXT NOT NULL",
    defaultValue: "'all'",
  },
  // ── customer_leave_policies (client confirmation tracking) ──
  {
    table: "customer_leave_policies",
    column: "clientConfirmed",
    type: "INTEGER NOT NULL",
    defaultValue: "1",  // Existing records default to confirmed (1=true)
  },
];

/**
 * Data backfill queries to run after columns are added.
 * These populate NOT NULL columns that were added with placeholder defaults.
 */
const BACKFILL_QUERIES: string[] = [
  // Backfill contractor_adjustments.customerId from contractors table
  `UPDATE "contractor_adjustments" SET "customerId" = (
    SELECT "customerId" FROM "contractors" WHERE "contractors"."id" = "contractor_adjustments"."contractorId"
  ) WHERE "customerId" = 0`,

  // Backfill contractor_adjustments.effectiveMonth from date column (if date column exists)
  `UPDATE "contractor_adjustments" SET "effectiveMonth" = substr("date", 1, 7) || '-01'
   WHERE "effectiveMonth" = '2025-01-01' AND "date" IS NOT NULL`,

  // Backfill contractor_milestones.customerId from contractors table
  `UPDATE "contractor_milestones" SET "customerId" = (
    SELECT "customerId" FROM "contractors" WHERE "contractors"."id" = "contractor_milestones"."contractorId"
  ) WHERE "customerId" = 0`,

  // Backfill leave_types.applicableGender based on leave type name keywords
  `UPDATE "leave_types" SET "applicableGender" = 'female' WHERE LOWER("leaveTypeName") LIKE '%maternity%'`,
  `UPDATE "leave_types" SET "applicableGender" = 'male' WHERE LOWER("leaveTypeName") LIKE '%paternity%'`,
];

export async function runAutoMigrations(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[AutoMigrate] DATABASE_URL not set, skipping migrations");
    return;
  }

  const url = dbUrl.includes("://") ? dbUrl : `file:${dbUrl}`;

  let client: ReturnType<typeof createClient>;
  try {
    client = createClient({ url });
  } catch (err) {
    console.warn("[AutoMigrate] Failed to connect to database:", err);
    return;
  }

  let columnsAdded = 0;

  for (const migration of REQUIRED_COLUMNS) {
    try {
      // Check if column already exists
      const tableInfo = await client.execute(`PRAGMA table_info("${migration.table}")`);
      const columnExists = tableInfo.rows.some(
        (row: any) => row.name === migration.column || row[1] === migration.column
      );

      if (!columnExists) {
        const defaultClause = migration.defaultValue != null
          ? ` DEFAULT ${migration.defaultValue}`
          : "";
        const sql = `ALTER TABLE "${migration.table}" ADD COLUMN "${migration.column}" ${migration.type}${defaultClause}`;
        await client.execute(sql);
        console.log(`[AutoMigrate] Added column: ${migration.table}.${migration.column}`);
        columnsAdded++;
      }
    } catch (err: any) {
      // "duplicate column name" means it already exists — safe to ignore
      if (err?.message?.includes("duplicate column")) {
        // Column already exists, no action needed
      } else {
        console.error(
          `[AutoMigrate] Failed to add ${migration.table}.${migration.column}:`,
          err?.message || err
        );
      }
    }
  }

  // Run backfill queries if any columns were added
  if (columnsAdded > 0) {
    console.log(`[AutoMigrate] ${columnsAdded} columns added, running backfill queries...`);
    for (const query of BACKFILL_QUERIES) {
      try {
        await client.execute(query);
        console.log(`[AutoMigrate] Backfill executed successfully`);
      } catch (err: any) {
        // Backfill failures are non-fatal (e.g., "date" column may not exist in new installs)
        console.warn(`[AutoMigrate] Backfill query skipped or failed:`, err?.message || err);
      }
    }
  }

  console.log("[AutoMigrate] Schema check complete");
}
