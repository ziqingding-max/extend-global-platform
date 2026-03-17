CREATE TABLE `migration_id_map` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entityType` text NOT NULL,
	`oldId` integer NOT NULL,
	`newId` integer NOT NULL,
	`migratedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mim_old_id_idx` ON `migration_id_map` (`oldId`);--> statement-breakpoint
CREATE INDEX `mim_new_id_idx` ON `migration_id_map` (`newId`);--> statement-breakpoint
CREATE UNIQUE INDEX `mim_unique_idx` ON `migration_id_map` (`entityType`,`oldId`);--> statement-breakpoint
DROP INDEX `cm_user_id_idx`;--> statement-breakpoint
DROP INDEX `cm_date_idx`;--> statement-breakpoint
DROP INDEX `cm_created_idx`;--> statement-breakpoint
CREATE INDEX `cmet_user_id_idx` ON `copilot_metrics` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `cmet_date_idx` ON `copilot_metrics` (`userId`,`date`);--> statement-breakpoint
CREATE INDEX `cmet_created_idx` ON `copilot_metrics` (`createdAt`);