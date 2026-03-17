-- =============================================================================
-- Migration 0012: Add applicableGender column to leave_types table
--
-- This column specifies which gender a leave type applies to:
--   "male"   - Only for male employees (e.g., Paternity Leave)
--   "female" - Only for female employees (e.g., Maternity Leave)
--   "all"    - For all employees (default, e.g., Annual Leave, Sick Leave)
--
-- Employees with gender "other", "prefer_not_to_say", or NULL will see
-- all leave types regardless of this field.
-- =============================================================================

-- Add applicableGender column with default 'all'
ALTER TABLE `leave_types` ADD COLUMN `applicableGender` text DEFAULT 'all' NOT NULL;--> statement-breakpoint

-- Auto-set applicableGender based on leave type name keywords
-- Maternity-related leave types -> female only
UPDATE `leave_types` SET `applicableGender` = 'female' WHERE LOWER(`leaveTypeName`) LIKE '%maternity%';--> statement-breakpoint

-- Paternity-related leave types -> male only
UPDATE `leave_types` SET `applicableGender` = 'male' WHERE LOWER(`leaveTypeName`) LIKE '%paternity%';
