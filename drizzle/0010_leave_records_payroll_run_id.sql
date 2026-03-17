-- =============================================================================
-- Migration 0010: Add payrollRunId column to leave_records table
--
-- This column links leave records to the payroll run that consumed them,
-- enabling safe rollback when a payroll item is deleted.
-- Consistent with adjustments and reimbursements tables which already have
-- this column.
-- =============================================================================

-- Add payrollRunId column (nullable integer)
ALTER TABLE `leave_records` ADD COLUMN `payrollRunId` integer;--> statement-breakpoint

-- Add index for efficient lookups by payrollRunId
CREATE INDEX IF NOT EXISTS `lr_payroll_run_id_idx` ON `leave_records` (`payrollRunId`);
