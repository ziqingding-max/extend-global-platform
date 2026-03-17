CREATE TABLE `customer_frozen_wallets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer NOT NULL,
	`currency` text(3) NOT NULL,
	`balance` text DEFAULT '0' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cfw_customer_currency_idx` ON `customer_frozen_wallets` (`customerId`,`currency`);--> statement-breakpoint
CREATE TABLE `customer_wallets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer NOT NULL,
	`currency` text(3) NOT NULL,
	`balance` text DEFAULT '0' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cw_customer_currency_idx` ON `customer_wallets` (`customerId`,`currency`);--> statement-breakpoint
CREATE TABLE `frozen_wallet_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`walletId` integer NOT NULL,
	`type` text NOT NULL,
	`amount` text NOT NULL,
	`direction` text NOT NULL,
	`balanceBefore` text NOT NULL,
	`balanceAfter` text NOT NULL,
	`referenceId` integer NOT NULL,
	`referenceType` text NOT NULL,
	`description` text,
	`internalNote` text,
	`createdBy` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fwt_wallet_id_idx` ON `frozen_wallet_transactions` (`walletId`);--> statement-breakpoint
CREATE INDEX `fwt_reference_idx` ON `frozen_wallet_transactions` (`referenceId`,`referenceType`);--> statement-breakpoint
CREATE INDEX `fwt_created_idx` ON `frozen_wallet_transactions` (`createdAt`);--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`walletId` integer NOT NULL,
	`type` text NOT NULL,
	`amount` text NOT NULL,
	`direction` text NOT NULL,
	`balanceBefore` text NOT NULL,
	`balanceAfter` text NOT NULL,
	`referenceId` integer NOT NULL,
	`referenceType` text NOT NULL,
	`description` text,
	`internalNote` text,
	`createdBy` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wt_wallet_id_idx` ON `wallet_transactions` (`walletId`);--> statement-breakpoint
CREATE INDEX `wt_reference_idx` ON `wallet_transactions` (`referenceId`,`referenceType`);--> statement-breakpoint
CREATE INDEX `wt_created_idx` ON `wallet_transactions` (`createdAt`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_task_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task` text NOT NULL,
	`primaryProvider` text DEFAULT 'volcengine' NOT NULL,
	`fallbackProvider` text,
	`modelOverride` text(100),
	`temperature` text DEFAULT '0.30',
	`maxTokens` integer DEFAULT 4096,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_ai_task_policies`("id", "task", "primaryProvider", "fallbackProvider", "modelOverride", "temperature", "maxTokens", "isActive", "createdAt", "updatedAt") SELECT "id", "task", "primaryProvider", "fallbackProvider", "modelOverride", "temperature", "maxTokens", "isActive", "createdAt", "updatedAt" FROM `ai_task_policies`;--> statement-breakpoint
DROP TABLE `ai_task_policies`;--> statement-breakpoint
ALTER TABLE `__new_ai_task_policies` RENAME TO `ai_task_policies`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `ai_task_idx` ON `ai_task_policies` (`task`);--> statement-breakpoint
CREATE INDEX `ai_task_active_idx` ON `ai_task_policies` (`isActive`);--> statement-breakpoint
ALTER TABLE `customer_pricing` ADD `visaOneTimeFee` text;--> statement-breakpoint
ALTER TABLE `customer_pricing` ADD `sourceQuotationId` integer;--> statement-breakpoint
ALTER TABLE `employees` ADD `bankDetails` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `walletAppliedAmount` text DEFAULT '0';