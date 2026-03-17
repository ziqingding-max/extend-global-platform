-- =============================================================================
-- Migration 0011: Worker Portal Refactor
-- Date: 2026-03-16
-- Description: Add Employee support to worker_users, create contractor
--              documents/contracts tables, create employee payslips table,
--              and add milestone deliverable fields.
-- =============================================================================

-- PART 1: Add employeeId column to worker_users table
ALTER TABLE `worker_users` ADD COLUMN `employeeId` integer REFERENCES `employees`(`id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `wu_employee_id_idx` ON `worker_users`(`employeeId`);--> statement-breakpoint

-- PART 2: Create contractor_documents table
CREATE TABLE IF NOT EXISTS `contractor_documents` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `contractorId` integer NOT NULL REFERENCES `contractors`(`id`),
  `customerId` integer REFERENCES `customers`(`id`),
  `documentType` text DEFAULT 'general' NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `fileUrl` text NOT NULL,
  `fileName` text,
  `fileSize` integer,
  `mimeType` text,
  `uploadedBy` text,
  `isVisibleToWorker` integer DEFAULT 1 NOT NULL,
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cd_contractor_id_idx` ON `contractor_documents`(`contractorId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cd_customer_id_idx` ON `contractor_documents`(`customerId`);--> statement-breakpoint

-- PART 3: Create contractor_contracts table
CREATE TABLE IF NOT EXISTS `contractor_contracts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `contractorId` integer NOT NULL REFERENCES `contractors`(`id`),
  `customerId` integer REFERENCES `customers`(`id`),
  `title` text NOT NULL,
  `contractType` text DEFAULT 'service_agreement' NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `startDate` text,
  `endDate` text,
  `fileUrl` text,
  `fileName` text,
  `signedAt` integer,
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cc_contractor_id_idx` ON `contractor_contracts`(`contractorId`);--> statement-breakpoint

-- PART 4: Create employee_payslips table
CREATE TABLE IF NOT EXISTS `employee_payslips` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `employeeId` integer NOT NULL REFERENCES `employees`(`id`),
  `customerId` integer REFERENCES `customers`(`id`),
  `payPeriod` text NOT NULL,
  `payDate` text,
  `grossAmount` text,
  `netAmount` text,
  `currency` text DEFAULT 'USD',
  `fileUrl` text,
  `fileName` text,
  `status` text DEFAULT 'draft' NOT NULL,
  `notes` text,
  `publishedAt` integer,
  `createdAt` integer DEFAULT (unixepoch()) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ep_employee_id_idx` ON `employee_payslips`(`employeeId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ep_customer_id_idx` ON `employee_payslips`(`customerId`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `ep_employee_period_idx` ON `employee_payslips`(`employeeId`, `payPeriod`);--> statement-breakpoint

-- PART 5: Add deliverable fields to contractor_milestones table
ALTER TABLE `contractor_milestones` ADD COLUMN `deliverableFileUrl` text;--> statement-breakpoint
ALTER TABLE `contractor_milestones` ADD COLUMN `deliverableFileName` text;--> statement-breakpoint
ALTER TABLE `contractor_milestones` ADD COLUMN `deliverableNotes` text;--> statement-breakpoint
ALTER TABLE `contractor_milestones` ADD COLUMN `deliverableSubmittedAt` integer;
