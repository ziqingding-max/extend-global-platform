CREATE TABLE `adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employeeId` integer NOT NULL,
	`customerId` integer NOT NULL,
	`payrollRunId` integer,
	`adjustmentType` text NOT NULL,
	`category` text,
	`description` text,
	`amount` text NOT NULL,
	`currency` text(3) DEFAULT 'USD' NOT NULL,
	`receiptFileUrl` text,
	`receiptFileKey` text(500),
	`status` text DEFAULT 'submitted' NOT NULL,
	`submittedBy` integer,
	`clientApprovedBy` integer,
	`clientApprovedAt` integer,
	`clientRejectionReason` text,
	`adminApprovedBy` integer,
	`adminApprovedAt` integer,
	`adminRejectionReason` text,
	`effectiveMonth` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `adj_employee_id_idx` ON `adjustments` (`employeeId`);--> statement-breakpoint
CREATE INDEX `adj_customer_id_idx` ON `adjustments` (`customerId`);--> statement-breakpoint
CREATE INDEX `adj_status_idx` ON `adjustments` (`status`);--> statement-breakpoint
CREATE INDEX `adj_payroll_run_id_idx` ON `adjustments` (`payrollRunId`);--> statement-breakpoint
CREATE INDEX `adj_effective_month_idx` ON `adjustments` (`effectiveMonth`);--> statement-breakpoint
CREATE TABLE `ai_provider_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`displayName` text(100) NOT NULL,
	`baseUrl` text,
	`model` text(100) NOT NULL,
	`apiKeyEnv` text(100) NOT NULL,
	`isEnabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_provider_idx` ON `ai_provider_configs` (`provider`);--> statement-breakpoint
CREATE INDEX `ai_provider_enabled_idx` ON `ai_provider_configs` (`isEnabled`);--> statement-breakpoint
CREATE TABLE `ai_task_executions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskType` text NOT NULL,
	`providerPrimary` text NOT NULL,
	`providerActual` text NOT NULL,
	`fallbackTriggered` integer DEFAULT false NOT NULL,
	`latencyMs` integer DEFAULT 0 NOT NULL,
	`tokenUsageIn` integer DEFAULT 0 NOT NULL,
	`tokenUsageOut` integer DEFAULT 0 NOT NULL,
	`costEstimate` text DEFAULT '0.0000' NOT NULL,
	`success` integer DEFAULT true NOT NULL,
	`errorClass` text(120),
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_exec_task_idx` ON `ai_task_executions` (`taskType`);--> statement-breakpoint
CREATE INDEX `ai_exec_created_idx` ON `ai_task_executions` (`createdAt`);--> statement-breakpoint
CREATE INDEX `ai_exec_success_idx` ON `ai_task_executions` (`success`);--> statement-breakpoint
CREATE TABLE `ai_task_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task` text NOT NULL,
	`primaryProvider` text DEFAULT 'manus_forge' NOT NULL,
	`fallbackProvider` text,
	`modelOverride` text(100),
	`temperature` text DEFAULT '0.30',
	`maxTokens` integer DEFAULT 4096,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_task_idx` ON `ai_task_policies` (`task`);--> statement-breakpoint
CREATE INDEX `ai_task_active_idx` ON `ai_task_policies` (`isActive`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer,
	`userName` text(255),
	`action` text(100) NOT NULL,
	`entityType` text(100) NOT NULL,
	`entityId` integer,
	`changes` text,
	`ipAddress` text(50),
	`userAgent` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `al_user_id_idx` ON `audit_logs` (`userId`);--> statement-breakpoint
CREATE INDEX `al_entity_type_idx` ON `audit_logs` (`entityType`);--> statement-breakpoint
CREATE INDEX `al_created_at_idx` ON `audit_logs` (`createdAt`);--> statement-breakpoint
CREATE TABLE `bill_invoice_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendorBillId` integer NOT NULL,
	`vendorBillItemId` integer,
	`invoiceId` integer NOT NULL,
	`employeeId` integer NOT NULL,
	`allocatedAmount` text NOT NULL,
	`description` text,
	`allocatedBy` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bia_vendor_bill_id_idx` ON `bill_invoice_allocations` (`vendorBillId`);--> statement-breakpoint
CREATE INDEX `bia_vendor_bill_item_id_idx` ON `bill_invoice_allocations` (`vendorBillItemId`);--> statement-breakpoint
CREATE INDEX `bia_invoice_id_idx` ON `bill_invoice_allocations` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `bia_employee_id_idx` ON `bill_invoice_allocations` (`employeeId`);--> statement-breakpoint
CREATE TABLE `billing_entities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entityName` text(255) NOT NULL,
	`legalName` text(255) NOT NULL,
	`registrationNumber` text(100),
	`taxId` text(100),
	`country` text(100) NOT NULL,
	`address` text,
	`city` text(100),
	`state` text(100),
	`postalCode` text(20),
	`bankDetails` text,
	`currency` text(3) DEFAULT 'USD' NOT NULL,
	`contactEmail` text(320),
	`contactPhone` text(20),
	`isDefault` integer DEFAULT false NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`logoUrl` text,
	`logoFileKey` text(500),
	`invoicePrefix` text(20),
	`paymentTermDays` integer DEFAULT 30 NOT NULL,
	`invoiceSequence` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `be_country_idx` ON `billing_entities` (`country`);--> statement-breakpoint
CREATE INDEX `be_active_idx` ON `billing_entities` (`isActive`);--> statement-breakpoint
CREATE UNIQUE INDEX `be_invoice_prefix_idx` ON `billing_entities` (`invoicePrefix`);--> statement-breakpoint
CREATE TABLE `countries_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`countryCode` text(3) NOT NULL,
	`countryName` text(100) NOT NULL,
	`localCurrency` text(3) NOT NULL,
	`payrollCycle` text DEFAULT 'monthly' NOT NULL,
	`probationPeriodDays` integer DEFAULT 90,
	`noticePeriodDays` integer DEFAULT 30,
	`workingDaysPerWeek` integer DEFAULT 5,
	`statutoryAnnualLeave` integer DEFAULT 14,
	`standardEorRate` text,
	`standardVisaEorRate` text,
	`standardAorRate` text,
	`visaEorSetupFee` text,
	`standardRateCurrency` text(3) DEFAULT 'USD',
	`vatApplicable` integer DEFAULT false NOT NULL,
	`vatRate` text DEFAULT '0',
	`isActive` integer DEFAULT false NOT NULL,
	`notes` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `countries_config_countryCode_unique` ON `countries_config` (`countryCode`);--> statement-breakpoint
CREATE UNIQUE INDEX `country_code_idx` ON `countries_config` (`countryCode`);--> statement-breakpoint
CREATE TABLE `credit_note_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creditNoteId` integer NOT NULL,
	`appliedToInvoiceId` integer NOT NULL,
	`appliedAmount` text NOT NULL,
	`notes` text,
	`appliedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`appliedBy` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cna_credit_note_idx` ON `credit_note_applications` (`creditNoteId`);--> statement-breakpoint
CREATE INDEX `cna_applied_to_idx` ON `credit_note_applications` (`appliedToInvoiceId`);--> statement-breakpoint
CREATE TABLE `customer_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer NOT NULL,
	`contactName` text(255) NOT NULL,
	`email` text(320) NOT NULL,
	`phone` text(20),
	`role` text(100),
	`isPrimary` integer DEFAULT false NOT NULL,
	`hasPortalAccess` integer DEFAULT false NOT NULL,
	`passwordHash` text(255),
	`portalRole` text DEFAULT 'viewer',
	`inviteToken` text(255),
	`inviteExpiresAt` integer,
	`resetToken` text(255),
	`resetExpiresAt` integer,
	`isPortalActive` integer DEFAULT false NOT NULL,
	`lastLoginAt` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cc_customer_id_idx` ON `customer_contacts` (`customerId`);--> statement-breakpoint
CREATE UNIQUE INDEX `cc_email_idx` ON `customer_contacts` (`email`);--> statement-breakpoint
CREATE INDEX `cc_invite_token_idx` ON `customer_contacts` (`inviteToken`);--> statement-breakpoint
CREATE TABLE `customer_contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer NOT NULL,
	`contractName` text(255) NOT NULL,
	`contractType` text(100),
	`fileUrl` text,
	`fileKey` text(500),
	`signedDate` text,
	`effectiveDate` text,
	`expiryDate` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cctr_customer_id_idx` ON `customer_contracts` (`customerId`);--> statement-breakpoint
CREATE TABLE `customer_leave_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer NOT NULL,
	`countryCode` text(3) NOT NULL,
	`leaveTypeId` integer NOT NULL,
	`annualEntitlement` integer NOT NULL,
	`expiryRule` text DEFAULT 'year_end' NOT NULL,
	`carryOverDays` integer DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clp_customer_id_idx` ON `customer_leave_policies` (`customerId`);--> statement-breakpoint
CREATE INDEX `clp_country_idx` ON `customer_leave_policies` (`countryCode`);--> statement-breakpoint
CREATE UNIQUE INDEX `clp_unique_idx` ON `customer_leave_policies` (`customerId`,`countryCode`,`leaveTypeId`);--> statement-breakpoint
CREATE TABLE `customer_pricing` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer NOT NULL,
	`pricingType` text NOT NULL,
	`globalDiscountPercent` text,
	`countryCode` text(3),
	`serviceType` text,
	`fixedPrice` text,
	`currency` text(3) DEFAULT 'USD',
	`effectiveFrom` text NOT NULL,
	`effectiveTo` text,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cp_customer_id_idx` ON `customer_pricing` (`customerId`);--> statement-breakpoint
CREATE INDEX `cp_country_code_idx` ON `customer_pricing` (`countryCode`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clientCode` text(20),
	`companyName` text(255) NOT NULL,
	`legalEntityName` text(255),
	`registrationNumber` text(100),
	`industry` text(100),
	`address` text,
	`city` text(100),
	`state` text(100),
	`country` text(100) NOT NULL,
	`postalCode` text(20),
	`primaryContactName` text(255),
	`primaryContactEmail` text(320),
	`primaryContactPhone` text(20),
	`paymentTermDays` integer DEFAULT 30 NOT NULL,
	`settlementCurrency` text(3) DEFAULT 'USD' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`billingEntityId` integer,
	`depositMultiplier` integer DEFAULT 2 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_clientCode_unique` ON `customers` (`clientCode`);--> statement-breakpoint
CREATE INDEX `company_name_idx` ON `customers` (`companyName`);--> statement-breakpoint
CREATE INDEX `country_idx` ON `customers` (`country`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `customers` (`status`);--> statement-breakpoint
CREATE TABLE `employee_contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employeeId` integer NOT NULL,
	`contractType` text(100),
	`fileUrl` text,
	`fileKey` text(500),
	`signedDate` text,
	`effectiveDate` text,
	`expiryDate` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ec_employee_id_idx` ON `employee_contracts` (`employeeId`);--> statement-breakpoint
CREATE TABLE `employee_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employeeId` integer NOT NULL,
	`documentType` text NOT NULL,
	`documentName` text(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` text(500) NOT NULL,
	`mimeType` text(100),
	`fileSize` integer,
	`notes` text,
	`uploadedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ed_employee_id_idx` ON `employee_documents` (`employeeId`);--> statement-breakpoint
CREATE INDEX `ed_doc_type_idx` ON `employee_documents` (`documentType`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employeeCode` text(20),
	`customerId` integer NOT NULL,
	`firstName` text(100) NOT NULL,
	`lastName` text(100) NOT NULL,
	`email` text(320) NOT NULL,
	`phone` text(20),
	`dateOfBirth` text,
	`gender` text,
	`nationality` text(100),
	`idNumber` text(100),
	`idType` text(50),
	`address` text,
	`city` text(100),
	`state` text(100),
	`country` text(100) NOT NULL,
	`postalCode` text(20),
	`department` text(100),
	`jobTitle` text(255) NOT NULL,
	`serviceType` text DEFAULT 'eor' NOT NULL,
	`employmentType` text DEFAULT 'long_term' NOT NULL,
	`startDate` text NOT NULL,
	`endDate` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`baseSalary` text NOT NULL,
	`salaryCurrency` text(3) DEFAULT 'USD' NOT NULL,
	`estimatedEmployerCost` text DEFAULT '0',
	`requiresVisa` integer DEFAULT false NOT NULL,
	`visaStatus` text DEFAULT 'not_required',
	`visaExpiryDate` text,
	`visaNotes` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employeeCode_unique` ON `employees` (`employeeCode`);--> statement-breakpoint
CREATE INDEX `emp_customer_id_idx` ON `employees` (`customerId`);--> statement-breakpoint
CREATE INDEX `emp_email_idx` ON `employees` (`email`);--> statement-breakpoint
CREATE INDEX `emp_status_idx` ON `employees` (`status`);--> statement-breakpoint
CREATE INDEX `emp_country_idx` ON `employees` (`country`);--> statement-breakpoint
CREATE INDEX `emp_service_type_idx` ON `employees` (`serviceType`);--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fromCurrency` text(3) NOT NULL,
	`toCurrency` text(3) NOT NULL,
	`rate` text NOT NULL,
	`rateWithMarkup` text NOT NULL,
	`markupPercentage` text DEFAULT '5.00' NOT NULL,
	`source` text(100),
	`effectiveDate` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `er_currency_pair_idx` ON `exchange_rates` (`fromCurrency`,`toCurrency`,`effectiveDate`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoiceId` integer NOT NULL,
	`employeeId` integer,
	`description` text(500) NOT NULL,
	`quantity` text DEFAULT '1' NOT NULL,
	`unitPrice` text NOT NULL,
	`amount` text NOT NULL,
	`itemType` text NOT NULL,
	`vatRate` text DEFAULT '0',
	`countryCode` text(3),
	`localCurrency` text(3),
	`localAmount` text,
	`exchangeRate` text,
	`exchangeRateWithMarkup` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ii_invoice_id_idx` ON `invoice_items` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `ii_employee_id_idx` ON `invoice_items` (`employeeId`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer NOT NULL,
	`billingEntityId` integer,
	`invoiceNumber` text(100) NOT NULL,
	`invoiceType` text NOT NULL,
	`invoiceMonth` text,
	`currency` text(3) NOT NULL,
	`exchangeRate` text DEFAULT '1',
	`exchangeRateWithMarkup` text DEFAULT '1',
	`subtotal` text NOT NULL,
	`serviceFeeTotal` text DEFAULT '0',
	`tax` text DEFAULT '0',
	`total` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`dueDate` text,
	`sentDate` integer,
	`paidDate` integer,
	`paidAmount` text,
	`creditApplied` text DEFAULT '0',
	`amountDue` text,
	`costAllocated` text DEFAULT '0',
	`relatedInvoiceId` integer,
	`notes` text,
	`internalNotes` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoiceNumber_unique` ON `invoices` (`invoiceNumber`);--> statement-breakpoint
CREATE INDEX `inv_customer_id_idx` ON `invoices` (`customerId`);--> statement-breakpoint
CREATE UNIQUE INDEX `inv_invoice_number_idx` ON `invoices` (`invoiceNumber`);--> statement-breakpoint
CREATE INDEX `inv_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `inv_invoice_month_idx` ON `invoices` (`invoiceMonth`);--> statement-breakpoint
CREATE TABLE `knowledge_feedback_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer NOT NULL,
	`contactId` integer,
	`locale` text DEFAULT 'en' NOT NULL,
	`query` text(500),
	`topics` text NOT NULL,
	`feedbackType` text DEFAULT 'not_helpful' NOT NULL,
	`note` text,
	`metadata` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kb_feedback_customer_idx` ON `knowledge_feedback_events` (`customerId`);--> statement-breakpoint
CREATE INDEX `kb_feedback_type_idx` ON `knowledge_feedback_events` (`feedbackType`);--> statement-breakpoint
CREATE INDEX `kb_feedback_created_idx` ON `knowledge_feedback_events` (`createdAt`);--> statement-breakpoint
CREATE TABLE `knowledge_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer,
	`sourceId` integer,
	`title` text(500) NOT NULL,
	`summary` text,
	`content` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`category` text DEFAULT 'article' NOT NULL,
	`topic` text DEFAULT 'general' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`metadata` text,
	`aiConfidence` integer DEFAULT 0 NOT NULL,
	`aiSummary` text,
	`publishedAt` integer,
	`reviewedBy` integer,
	`reviewedAt` integer,
	`reviewNote` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kb_item_customer_idx` ON `knowledge_items` (`customerId`);--> statement-breakpoint
CREATE INDEX `kb_item_status_idx` ON `knowledge_items` (`status`);--> statement-breakpoint
CREATE INDEX `kb_item_topic_idx` ON `knowledge_items` (`topic`);--> statement-breakpoint
CREATE INDEX `kb_item_published_idx` ON `knowledge_items` (`publishedAt`);--> statement-breakpoint
CREATE TABLE `knowledge_marketing_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer NOT NULL,
	`contactId` integer,
	`channel` text DEFAULT 'email' NOT NULL,
	`cadence` text DEFAULT 'weekly' NOT NULL,
	`topics` text NOT NULL,
	`payload` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kb_event_customer_idx` ON `knowledge_marketing_events` (`customerId`);--> statement-breakpoint
CREATE TABLE `knowledge_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(255) NOT NULL,
	`url` text NOT NULL,
	`sourceType` text DEFAULT 'web' NOT NULL,
	`language` text DEFAULT 'multi' NOT NULL,
	`topic` text DEFAULT 'general' NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`authorityScore` integer DEFAULT 0 NOT NULL,
	`authorityLevel` text DEFAULT 'low' NOT NULL,
	`authorityReason` text,
	`aiReviewedAt` integer,
	`lastFetchedAt` integer,
	`updatedBy` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kb_source_active_idx` ON `knowledge_sources` (`isActive`);--> statement-breakpoint
CREATE INDEX `kb_source_topic_idx` ON `knowledge_sources` (`topic`);--> statement-breakpoint
CREATE TABLE `leave_balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employeeId` integer NOT NULL,
	`leaveTypeId` integer NOT NULL,
	`year` integer NOT NULL,
	`totalEntitlement` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`remaining` integer NOT NULL,
	`expiryDate` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lb_employee_id_idx` ON `leave_balances` (`employeeId`);--> statement-breakpoint
CREATE INDEX `lb_leave_type_id_idx` ON `leave_balances` (`leaveTypeId`);--> statement-breakpoint
CREATE UNIQUE INDEX `lb_employee_leave_year_idx` ON `leave_balances` (`employeeId`,`leaveTypeId`,`year`);--> statement-breakpoint
CREATE TABLE `leave_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employeeId` integer NOT NULL,
	`leaveTypeId` integer NOT NULL,
	`startDate` text NOT NULL,
	`endDate` text NOT NULL,
	`days` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`reason` text,
	`submittedBy` integer,
	`clientApprovedBy` integer,
	`clientApprovedAt` integer,
	`clientRejectionReason` text,
	`adminApprovedBy` integer,
	`adminApprovedAt` integer,
	`adminRejectionReason` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lr_employee_id_idx` ON `leave_records` (`employeeId`);--> statement-breakpoint
CREATE INDEX `lr_status_idx` ON `leave_records` (`status`);--> statement-breakpoint
CREATE INDEX `lr_start_date_idx` ON `leave_records` (`startDate`);--> statement-breakpoint
CREATE TABLE `leave_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`countryCode` text(3) NOT NULL,
	`leaveTypeName` text(100) NOT NULL,
	`annualEntitlement` integer DEFAULT 0,
	`isPaid` integer DEFAULT true NOT NULL,
	`requiresApproval` integer DEFAULT true NOT NULL,
	`description` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lt_country_code_idx` ON `leave_types` (`countryCode`);--> statement-breakpoint
CREATE TABLE `onboarding_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer NOT NULL,
	`employeeName` text(200) NOT NULL,
	`employeeEmail` text(320) NOT NULL,
	`token` text(64) NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`employeeId` integer,
	`expiresAt` integer NOT NULL,
	`completedAt` integer,
	`createdBy` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_invites_token_unique` ON `onboarding_invites` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `oi_token_idx` ON `onboarding_invites` (`token`);--> statement-breakpoint
CREATE INDEX `oi_customer_id_idx` ON `onboarding_invites` (`customerId`);--> statement-breakpoint
CREATE INDEX `oi_status_idx` ON `onboarding_invites` (`status`);--> statement-breakpoint
CREATE INDEX `oi_email_idx` ON `onboarding_invites` (`employeeEmail`);--> statement-breakpoint
CREATE TABLE `payroll_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payrollRunId` integer NOT NULL,
	`employeeId` integer NOT NULL,
	`baseSalary` text NOT NULL,
	`bonus` text DEFAULT '0',
	`allowances` text DEFAULT '0',
	`reimbursements` text DEFAULT '0',
	`deductions` text DEFAULT '0',
	`taxDeduction` text DEFAULT '0',
	`socialSecurityDeduction` text DEFAULT '0',
	`unpaidLeaveDeduction` text DEFAULT '0',
	`unpaidLeaveDays` text DEFAULT '0',
	`gross` text NOT NULL,
	`net` text NOT NULL,
	`employerSocialContribution` text DEFAULT '0',
	`totalEmploymentCost` text NOT NULL,
	`currency` text(3) DEFAULT 'USD' NOT NULL,
	`notes` text,
	`adjustmentsBreakdown` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pi_payroll_run_id_idx` ON `payroll_items` (`payrollRunId`);--> statement-breakpoint
CREATE INDEX `pi_employee_id_idx` ON `payroll_items` (`employeeId`);--> statement-breakpoint
CREATE UNIQUE INDEX `pi_run_employee_idx` ON `payroll_items` (`payrollRunId`,`employeeId`);--> statement-breakpoint
CREATE TABLE `payroll_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`countryCode` text(3) NOT NULL,
	`payrollMonth` text NOT NULL,
	`currency` text(3) NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`totalGross` text DEFAULT '0',
	`totalDeductions` text DEFAULT '0',
	`totalNet` text DEFAULT '0',
	`totalEmployerCost` text DEFAULT '0',
	`submittedBy` integer,
	`submittedAt` integer,
	`approvedBy` integer,
	`approvedAt` integer,
	`rejectedBy` integer,
	`rejectedAt` integer,
	`rejectionReason` text,
	`notes` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pr_payroll_month_idx` ON `payroll_runs` (`payrollMonth`);--> statement-breakpoint
CREATE INDEX `pr_status_idx` ON `payroll_runs` (`status`);--> statement-breakpoint
CREATE INDEX `pr_country_code_idx` ON `payroll_runs` (`countryCode`);--> statement-breakpoint
CREATE UNIQUE INDEX `pr_country_month_idx` ON `payroll_runs` (`countryCode`,`payrollMonth`);--> statement-breakpoint
CREATE TABLE `public_holidays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`countryCode` text(3) NOT NULL,
	`year` integer NOT NULL,
	`holidayDate` text NOT NULL,
	`holidayName` text(255) NOT NULL,
	`localName` text(255),
	`isGlobal` integer DEFAULT true NOT NULL,
	`source` text(50) DEFAULT 'nager_api',
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ph_country_code_idx` ON `public_holidays` (`countryCode`);--> statement-breakpoint
CREATE INDEX `ph_year_idx` ON `public_holidays` (`year`);--> statement-breakpoint
CREATE INDEX `ph_country_year_idx` ON `public_holidays` (`countryCode`,`year`);--> statement-breakpoint
CREATE TABLE `reimbursements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employeeId` integer NOT NULL,
	`customerId` integer NOT NULL,
	`payrollRunId` integer,
	`category` text NOT NULL,
	`description` text,
	`amount` text NOT NULL,
	`currency` text(3) DEFAULT 'USD' NOT NULL,
	`receiptFileUrl` text,
	`receiptFileKey` text(500),
	`status` text DEFAULT 'submitted' NOT NULL,
	`submittedBy` integer,
	`clientApprovedBy` integer,
	`clientApprovedAt` integer,
	`clientRejectionReason` text,
	`adminApprovedBy` integer,
	`adminApprovedAt` integer,
	`adminRejectionReason` text,
	`effectiveMonth` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reimb_employee_id_idx` ON `reimbursements` (`employeeId`);--> statement-breakpoint
CREATE INDEX `reimb_customer_id_idx` ON `reimbursements` (`customerId`);--> statement-breakpoint
CREATE INDEX `reimb_status_idx` ON `reimbursements` (`status`);--> statement-breakpoint
CREATE INDEX `reimb_payroll_run_id_idx` ON `reimbursements` (`payrollRunId`);--> statement-breakpoint
CREATE INDEX `reimb_effective_month_idx` ON `reimbursements` (`effectiveMonth`);--> statement-breakpoint
CREATE TABLE `sales_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`leadId` integer NOT NULL,
	`activityType` text NOT NULL,
	`description` text NOT NULL,
	`activityDate` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`createdBy` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sa_lead_id_idx` ON `sales_activities` (`leadId`);--> statement-breakpoint
CREATE INDEX `sa_activity_date_idx` ON `sales_activities` (`activityDate`);--> statement-breakpoint
CREATE TABLE `sales_leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`companyName` text(255) NOT NULL,
	`contactName` text(255),
	`contactEmail` text(320),
	`contactPhone` text(20),
	`country` text(100),
	`industry` text(100),
	`estimatedEmployees` integer,
	`estimatedRevenue` text,
	`currency` text(3) DEFAULT 'USD',
	`source` text(100),
	`intendedServices` text,
	`targetCountries` text,
	`status` text DEFAULT 'discovery' NOT NULL,
	`lostReason` text,
	`createdBy` integer,
	`assignedTo` integer,
	`convertedCustomerId` integer,
	`notes` text,
	`expectedCloseDate` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sl_status_idx` ON `sales_leads` (`status`);--> statement-breakpoint
CREATE INDEX `sl_assigned_to_idx` ON `sales_leads` (`assignedTo`);--> statement-breakpoint
CREATE INDEX `sl_company_name_idx` ON `sales_leads` (`companyName`);--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`configKey` text(100) NOT NULL,
	`configValue` text NOT NULL,
	`description` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_config_configKey_unique` ON `system_config` (`configKey`);--> statement-breakpoint
CREATE UNIQUE INDEX `config_key_idx` ON `system_config` (`configKey`);--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text(100) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_settings_key_unique` ON `system_settings` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ss_key_idx` ON `system_settings` (`key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text(64) NOT NULL,
	`name` text,
	`email` text(320),
	`passwordHash` text(255),
	`loginMethod` text(64),
	`role` text(200) DEFAULT 'user' NOT NULL,
	`language` text(10) DEFAULT 'en' NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`inviteToken` text(255),
	`inviteExpiresAt` integer,
	`resetToken` text(255),
	`resetExpiresAt` integer,
	`mustChangePassword` integer DEFAULT false NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`lastSignedIn` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `invite_token_idx` ON `users` (`inviteToken`);--> statement-breakpoint
CREATE TABLE `vendor_bill_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendorBillId` integer NOT NULL,
	`description` text(500) NOT NULL,
	`quantity` text DEFAULT '1' NOT NULL,
	`unitPrice` text NOT NULL,
	`amount` text NOT NULL,
	`relatedCustomerId` integer,
	`relatedEmployeeId` integer,
	`relatedCountryCode` text(3),
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vbi_vendor_bill_id_idx` ON `vendor_bill_items` (`vendorBillId`);--> statement-breakpoint
CREATE INDEX `vbi_customer_id_idx` ON `vendor_bill_items` (`relatedCustomerId`);--> statement-breakpoint
CREATE INDEX `vbi_employee_id_idx` ON `vendor_bill_items` (`relatedEmployeeId`);--> statement-breakpoint
CREATE INDEX `vbi_country_code_idx` ON `vendor_bill_items` (`relatedCountryCode`);--> statement-breakpoint
CREATE TABLE `vendor_bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendorId` integer NOT NULL,
	`billNumber` text(100) NOT NULL,
	`billDate` text NOT NULL,
	`dueDate` text,
	`paidDate` text,
	`billMonth` text,
	`currency` text(3) DEFAULT 'USD' NOT NULL,
	`subtotal` text NOT NULL,
	`tax` text DEFAULT '0',
	`totalAmount` text NOT NULL,
	`paidAmount` text DEFAULT '0',
	`status` text DEFAULT 'draft' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`billType` text DEFAULT 'operational' NOT NULL,
	`description` text,
	`internalNotes` text,
	`receiptFileUrl` text,
	`receiptFileKey` text(500),
	`bankReference` text(200),
	`bankName` text(255),
	`bankFee` text DEFAULT '0',
	`allocatedAmount` text DEFAULT '0',
	`unallocatedAmount` text DEFAULT '0',
	`submittedBy` integer,
	`submittedAt` integer,
	`approvedBy` integer,
	`approvedAt` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vb_vendor_id_idx` ON `vendor_bills` (`vendorId`);--> statement-breakpoint
CREATE INDEX `vb_status_idx` ON `vendor_bills` (`status`);--> statement-breakpoint
CREATE INDEX `vb_bill_date_idx` ON `vendor_bills` (`billDate`);--> statement-breakpoint
CREATE INDEX `vb_bill_month_idx` ON `vendor_bills` (`billMonth`);--> statement-breakpoint
CREATE INDEX `vb_category_idx` ON `vendor_bills` (`category`);--> statement-breakpoint
CREATE INDEX `vb_bill_number_idx` ON `vendor_bills` (`billNumber`);--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendorCode` text(20),
	`name` text(255) NOT NULL,
	`legalName` text(255),
	`contactName` text(255),
	`contactEmail` text(320),
	`contactPhone` text(50),
	`country` text(100) NOT NULL,
	`address` text,
	`city` text(100),
	`state` text(100),
	`postalCode` text(20),
	`serviceType` text(100),
	`currency` text(3) DEFAULT 'USD' NOT NULL,
	`bankDetails` text,
	`taxId` text(100),
	`paymentTermDays` integer DEFAULT 30 NOT NULL,
	`vendorType` text DEFAULT 'client_related' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendors_vendorCode_unique` ON `vendors` (`vendorCode`);--> statement-breakpoint
CREATE INDEX `vdr_name_idx` ON `vendors` (`name`);--> statement-breakpoint
CREATE INDEX `vdr_country_idx` ON `vendors` (`country`);--> statement-breakpoint
CREATE INDEX `vdr_status_idx` ON `vendors` (`status`);