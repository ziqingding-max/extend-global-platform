CREATE TABLE `lead_change_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`leadId` integer NOT NULL,
	`userId` integer,
	`userName` text(255),
	`changeType` text(50) NOT NULL,
	`fieldName` text(100),
	`oldValue` text,
	`newValue` text,
	`description` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lcl_lead_id_idx` ON `lead_change_logs` (`leadId`);--> statement-breakpoint
CREATE INDEX `lcl_created_at_idx` ON `lead_change_logs` (`createdAt`);
