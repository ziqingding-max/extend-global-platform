ALTER TABLE `invoices` ADD `creditNoteDisposition` text;--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `serviceType` text DEFAULT 'eor';--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `country` text(100);--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `jobTitle` text(255);--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `department` text(100);--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `startDate` text;--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `endDate` text;--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `employmentType` text(50);--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `baseSalary` text;--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `salaryCurrency` text(3);--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `paymentFrequency` text(50);--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `rateAmount` text;--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `contractorCurrency` text(3);--> statement-breakpoint
ALTER TABLE `onboarding_invites` ADD `contractorId` integer;