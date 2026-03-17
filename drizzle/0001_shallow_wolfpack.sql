CREATE TABLE `copilot_predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`predictionType` text(50) NOT NULL,
	`title` text(255) NOT NULL,
	`description` text NOT NULL,
	`confidence` integer NOT NULL,
	`severity` text(20) NOT NULL,
	`predictionData` text,
	`expiresAt` integer,
	`isDismissed` integer DEFAULT false NOT NULL,
	`dismissedAt` integer,
	`suggestedAction` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cp_user_id_idx` ON `copilot_predictions` (`userId`);--> statement-breakpoint
CREATE INDEX `cp_type_idx` ON `copilot_predictions` (`predictionType`);--> statement-breakpoint
CREATE INDEX `cp_severity_idx` ON `copilot_predictions` (`severity`);--> statement-breakpoint
CREATE INDEX `cp_dismissed_idx` ON `copilot_predictions` (`isDismissed`);--> statement-breakpoint
CREATE INDEX `cp_expires_idx` ON `copilot_predictions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `cp_created_idx` ON `copilot_predictions` (`createdAt`);--> statement-breakpoint
CREATE TABLE `copilot_shortcuts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`title` text(100) NOT NULL,
	`description` text(500),
	`action` text(100) NOT NULL,
	`params` text,
	`icon` text(50),
	`badge` text(20),
	`hotkey` text(50),
	`usageCount` integer DEFAULT 0 NOT NULL,
	`lastUsedAt` integer,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cs_user_id_idx` ON `copilot_shortcuts` (`userId`);--> statement-breakpoint
CREATE INDEX `cs_action_idx` ON `copilot_shortcuts` (`action`);--> statement-breakpoint
CREATE INDEX `cs_active_idx` ON `copilot_shortcuts` (`isActive`);--> statement-breakpoint
CREATE INDEX `cs_usage_idx` ON `copilot_shortcuts` (`usageCount`);--> statement-breakpoint
CREATE INDEX `cs_last_used_idx` ON `copilot_shortcuts` (`lastUsedAt`);--> statement-breakpoint
CREATE TABLE `copilot_user_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`preferences` text,
	`hotkeys` text,
	`enabledFeatures` text,
	`disabledPredictions` text,
	`theme` text(20) DEFAULT 'auto' NOT NULL,
	`language` text(10) DEFAULT 'zh' NOT NULL,
	`position` text(20) DEFAULT 'bottom-right' NOT NULL,
	`isEnabled` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cuc_user_id_idx` ON `copilot_user_configs` (`userId`);--> statement-breakpoint
CREATE INDEX `cuc_enabled_idx` ON `copilot_user_configs` (`isEnabled`);--> statement-breakpoint
CREATE TABLE `country_guide_chapters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`countryCode` text(3) NOT NULL,
	`part` integer NOT NULL,
	`chapterKey` text(50) NOT NULL,
	`titleEn` text(300) NOT NULL,
	`titleZh` text(300) NOT NULL,
	`contentEn` text NOT NULL,
	`contentZh` text NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`version` text(20) NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`metadata` text,
	`effectiveFrom` text,
	`effectiveTo` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cgc_country_idx` ON `country_guide_chapters` (`countryCode`);--> statement-breakpoint
CREATE INDEX `cgc_status_idx` ON `country_guide_chapters` (`status`);--> statement-breakpoint
CREATE TABLE `country_social_insurance_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`countryCode` text(3) NOT NULL,
	`itemKey` text(50) NOT NULL,
	`itemNameEn` text(200) NOT NULL,
	`itemNameZh` text(200) NOT NULL,
	`category` text NOT NULL,
	`rateEmployer` text DEFAULT '0' NOT NULL,
	`rateEmployee` text DEFAULT '0' NOT NULL,
	`capType` text DEFAULT 'none' NOT NULL,
	`capBase` text,
	`capMultiplier` text,
	`capReferenceBase` text,
	`regionCode` text,
	`regionName` text,
	`ageBracketMin` integer,
	`ageBracketMax` integer,
	`salaryBracketMin` text,
	`salaryBracketMax` text,
	`effectiveYear` integer NOT NULL,
	`effectiveFrom` text,
	`effectiveTo` text,
	`legalReference` text,
	`notes` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `csi_country_year_idx` ON `country_social_insurance_items` (`countryCode`,`effectiveYear`);--> statement-breakpoint
CREATE INDEX `csi_country_item_idx` ON `country_social_insurance_items` (`countryCode`,`itemKey`);--> statement-breakpoint
CREATE INDEX `csi_region_idx` ON `country_social_insurance_items` (`regionCode`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`targetPortal` text NOT NULL,
	`targetUserId` integer,
	`targetRole` text,
	`targetCustomerId` integer,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`data` text,
	`isRead` integer DEFAULT false NOT NULL,
	`readAt` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notif_target_idx` ON `notifications` (`targetPortal`,`targetUserId`,`targetRole`);--> statement-breakpoint
CREATE INDEX `notif_customer_idx` ON `notifications` (`targetCustomerId`);--> statement-breakpoint
CREATE INDEX `notif_read_idx` ON `notifications` (`isRead`);--> statement-breakpoint
CREATE INDEX `notif_type_idx` ON `notifications` (`type`);--> statement-breakpoint
CREATE INDEX `notif_created_idx` ON `notifications` (`createdAt`);--> statement-breakpoint
CREATE TABLE `quotations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quotationNumber` text(50) NOT NULL,
	`leadId` integer,
	`customerId` integer,
	`countries` text,
	`totalMonthly` text NOT NULL,
	`currency` text(3) DEFAULT 'USD' NOT NULL,
	`snapshotData` text,
	`validUntil` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`pdfUrl` text,
	`pdfKey` text,
	`sentAt` integer,
	`sentTo` text,
	`sentBy` integer,
	`createdBy` integer NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotations_quotationNumber_unique` ON `quotations` (`quotationNumber`);--> statement-breakpoint
CREATE UNIQUE INDEX `qt_number_idx` ON `quotations` (`quotationNumber`);--> statement-breakpoint
CREATE INDEX `qt_lead_idx` ON `quotations` (`leadId`);--> statement-breakpoint
CREATE INDEX `qt_customer_idx` ON `quotations` (`customerId`);--> statement-breakpoint
CREATE INDEX `qt_status_idx` ON `quotations` (`status`);--> statement-breakpoint
CREATE TABLE `salary_benchmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`countryCode` text(3) NOT NULL,
	`jobCategory` text(100) NOT NULL,
	`jobTitle` text(200) NOT NULL,
	`seniorityLevel` text NOT NULL,
	`salaryP25` text NOT NULL,
	`salaryP50` text NOT NULL,
	`salaryP75` text NOT NULL,
	`currency` text(3) NOT NULL,
	`dataYear` integer NOT NULL,
	`source` text,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sb_country_idx` ON `salary_benchmarks` (`countryCode`);--> statement-breakpoint
CREATE INDEX `sb_job_title_idx` ON `salary_benchmarks` (`jobTitle`);--> statement-breakpoint
CREATE TABLE `sales_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`leadId` integer,
	`customerId` integer,
	`quotationId` integer,
	`docType` text NOT NULL,
	`title` text(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` text(500) NOT NULL,
	`generatedBy` integer NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sd_lead_idx` ON `sales_documents` (`leadId`);--> statement-breakpoint
CREATE INDEX `sd_customer_idx` ON `sales_documents` (`customerId`);--> statement-breakpoint
CREATE INDEX `sd_quotation_idx` ON `sales_documents` (`quotationId`);
