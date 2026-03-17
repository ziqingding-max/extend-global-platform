-- =============================================================================
-- Migration 0009: Align contractor_adjustments & contractor_milestones tables
-- with the ORM schema defined in aor-schema.ts
--
-- contractor_adjustments: The original table has a `date` column with NOT NULL
-- constraint but no default. The ORM schema replaced `date` with `effectiveMonth`
-- and doesn't include `date` in INSERT statements. SQLite doesn't support
-- ALTER COLUMN to remove NOT NULL, so we must recreate the table.
--
-- contractor_milestones: Only needs new columns added (no NOT NULL conflicts).
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 1: Recreate contractor_adjustments with correct schema
-- ══════════════════════════════════════════════════════════════════════════════

-- Step 1: Drop indexes on old table (ignore if not exist)
DROP INDEX IF EXISTS `ca_contractor_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `ca_status_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `ca_customer_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `ca_effective_month_idx`;--> statement-breakpoint

-- Step 2: Rename old table
ALTER TABLE `contractor_adjustments` RENAME TO `_contractor_adjustments_old`;--> statement-breakpoint

-- Step 3: Create new table with full ORM schema + legacy `date` column (now nullable)
CREATE TABLE `contractor_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contractorId` integer NOT NULL,
	`customerId` integer,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text(3) NOT NULL,
	`date` text,
	`attachmentUrl` text,
	`attachmentFileKey` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`submittedBy` integer,
	`clientApprovedBy` integer,
	`clientApprovedAt` integer,
	`clientRejectionReason` text,
	`adminApprovedBy` integer,
	`adminApprovedAt` integer,
	`adminRejectionReason` text,
	`effectiveMonth` text,
	`invoiceId` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);--> statement-breakpoint

-- Step 4: Copy data from old table to new table
INSERT INTO `contractor_adjustments` (`id`, `contractorId`, `type`, `description`, `amount`, `currency`, `date`, `attachmentUrl`, `status`, `invoiceId`, `createdAt`, `updatedAt`)
SELECT `id`, `contractorId`, `type`, `description`, `amount`, `currency`, `date`, `attachmentUrl`, `status`, `invoiceId`, `createdAt`, `updatedAt`
FROM `_contractor_adjustments_old`;--> statement-breakpoint

-- Step 5: Backfill customerId from contractors table
UPDATE `contractor_adjustments` SET `customerId` = (
  SELECT `customerId` FROM `contractors` WHERE `contractors`.`id` = `contractor_adjustments`.`contractorId`
) WHERE `customerId` IS NULL;--> statement-breakpoint

-- Step 6: Backfill effectiveMonth from existing date column
UPDATE `contractor_adjustments` SET `effectiveMonth` = `date` WHERE `effectiveMonth` IS NULL AND `date` IS NOT NULL;--> statement-breakpoint

-- Step 7: Drop old table
DROP TABLE `_contractor_adjustments_old`;--> statement-breakpoint

-- Step 8: Recreate indexes
CREATE INDEX `ca_contractor_id_idx` ON `contractor_adjustments` (`contractorId`);--> statement-breakpoint
CREATE INDEX `ca_status_idx` ON `contractor_adjustments` (`status`);--> statement-breakpoint
CREATE INDEX `ca_customer_id_idx` ON `contractor_adjustments` (`customerId`);--> statement-breakpoint
CREATE INDEX `ca_effective_month_idx` ON `contractor_adjustments` (`effectiveMonth`);--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 2: Add missing columns to contractor_milestones
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE `contractor_milestones` ADD `customerId` integer;--> statement-breakpoint
ALTER TABLE `contractor_milestones` ADD `submittedBy` integer;--> statement-breakpoint
ALTER TABLE `contractor_milestones` ADD `clientApprovedBy` integer;--> statement-breakpoint
ALTER TABLE `contractor_milestones` ADD `clientApprovedAt` integer;--> statement-breakpoint
ALTER TABLE `contractor_milestones` ADD `clientRejectionReason` text;--> statement-breakpoint
ALTER TABLE `contractor_milestones` ADD `adminApprovedBy` integer;--> statement-breakpoint
ALTER TABLE `contractor_milestones` ADD `adminApprovedAt` integer;--> statement-breakpoint
ALTER TABLE `contractor_milestones` ADD `adminRejectionReason` text;--> statement-breakpoint
ALTER TABLE `contractor_milestones` ADD `effectiveMonth` text;--> statement-breakpoint

-- Backfill customerId from contractors table
UPDATE `contractor_milestones` SET `customerId` = (
  SELECT `customerId` FROM `contractors` WHERE `contractors`.`id` = `contractor_milestones`.`contractorId`
) WHERE `customerId` IS NULL;--> statement-breakpoint

-- Add indexes for new columns
CREATE INDEX `cm_customer_id_idx` ON `contractor_milestones` (`customerId`);--> statement-breakpoint
CREATE INDEX `cm_effective_month_idx` ON `contractor_milestones` (`effectiveMonth`);
