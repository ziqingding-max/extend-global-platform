CREATE TABLE `contractor_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contractorId` integer NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text(3) NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attachmentUrl` text,
	`invoiceId` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ca_contractor_id_idx` ON `contractor_adjustments` (`contractorId`);--> statement-breakpoint
CREATE INDEX `ca_status_idx` ON `contractor_adjustments` (`status`);--> statement-breakpoint
CREATE TABLE `contractor_invoice_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoiceId` integer NOT NULL,
	`description` text NOT NULL,
	`quantity` text DEFAULT '1' NOT NULL,
	`unitPrice` text NOT NULL,
	`amount` text NOT NULL,
	`itemType` text NOT NULL,
	`milestoneId` integer,
	`adjustmentId` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cii_invoice_id_idx` ON `contractor_invoice_items` (`invoiceId`);--> statement-breakpoint
CREATE TABLE `contractor_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoiceNumber` text(100),
	`contractorId` integer NOT NULL,
	`customerId` integer NOT NULL,
	`invoiceDate` text NOT NULL,
	`dueDate` text,
	`periodStart` text,
	`periodEnd` text,
	`currency` text(3) NOT NULL,
	`totalAmount` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`clientInvoiceId` integer,
	`approvedBy` integer,
	`approvedAt` integer,
	`rejectedReason` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contractor_invoices_invoiceNumber_unique` ON `contractor_invoices` (`invoiceNumber`);--> statement-breakpoint
CREATE INDEX `ci_contractor_id_idx` ON `contractor_invoices` (`contractorId`);--> statement-breakpoint
CREATE INDEX `ci_customer_id_idx` ON `contractor_invoices` (`customerId`);--> statement-breakpoint
CREATE INDEX `ci_status_idx` ON `contractor_invoices` (`status`);--> statement-breakpoint
CREATE TABLE `contractor_milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contractorId` integer NOT NULL,
	`title` text(255) NOT NULL,
	`description` text,
	`amount` text NOT NULL,
	`currency` text(3) NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`dueDate` text,
	`completedAt` integer,
	`approvedAt` integer,
	`invoiceId` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cm_contractor_id_idx` ON `contractor_milestones` (`contractorId`);--> statement-breakpoint
CREATE INDEX `cm_status_idx` ON `contractor_milestones` (`status`);--> statement-breakpoint
CREATE TABLE `contractors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contractorCode` text(20),
	`customerId` integer NOT NULL,
	`firstName` text(100) NOT NULL,
	`lastName` text(100) NOT NULL,
	`email` text(320) NOT NULL,
	`phone` text(20),
	`dateOfBirth` text,
	`nationality` text(100),
	`idNumber` text(100),
	`idType` text(50),
	`address` text,
	`city` text(100),
	`state` text(100),
	`country` text(100) NOT NULL,
	`postalCode` text(20),
	`jobTitle` text(255) NOT NULL,
	`department` text(100),
	`startDate` text NOT NULL,
	`endDate` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`currency` text(3) DEFAULT 'USD' NOT NULL,
	`paymentFrequency` text DEFAULT 'monthly' NOT NULL,
	`rateType` text DEFAULT 'fixed_monthly' NOT NULL,
	`rateAmount` text,
	`bankDetails` text,
	`notes` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contractors_contractorCode_unique` ON `contractors` (`contractorCode`);--> statement-breakpoint
CREATE INDEX `ctr_customer_id_idx` ON `contractors` (`customerId`);--> statement-breakpoint
CREATE INDEX `ctr_email_idx` ON `contractors` (`email`);--> statement-breakpoint
CREATE INDEX `ctr_status_idx` ON `contractors` (`status`);--> statement-breakpoint
CREATE INDEX `ctr_country_idx` ON `contractors` (`country`);--> statement-breakpoint
CREATE TABLE `worker_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text(320) NOT NULL,
	`passwordHash` text(255),
	`contractorId` integer,
	`isActive` integer DEFAULT true NOT NULL,
	`isEmailVerified` integer DEFAULT false NOT NULL,
	`inviteToken` text(255),
	`inviteExpiresAt` integer,
	`resetToken` text(255),
	`resetExpiresAt` integer,
	`lastLoginAt` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `worker_users_email_unique` ON `worker_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `worker_users_contractorId_unique` ON `worker_users` (`contractorId`);--> statement-breakpoint
CREATE UNIQUE INDEX `wu_email_idx` ON `worker_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `wu_contractor_id_idx` ON `worker_users` (`contractorId`);