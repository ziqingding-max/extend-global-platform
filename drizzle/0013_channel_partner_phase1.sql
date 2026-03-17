-- =============================================================================
-- Migration 0013: Channel Partner Phase 1 — B2B2B Schema Foundation
-- Date: 2026-03-17
-- Description:
--   1. New tables: channel_partners, channel_partner_contacts,
--      cp_pricing_rules, cp_client_pricing, channel_partner_contracts,
--      channel_partner_wallets, cp_wallet_transactions,
--      channel_partner_frozen_wallets, cp_frozen_wallet_transactions
--   2. Add channelPartnerId FK to: users, customers, customer_contacts,
--      employees, invoices, sales_leads, onboarding_invites, audit_logs,
--      notifications
--   3. Add dual-layer invoice fields: invoiceLayer, parentInvoiceId
--   4. Add dual-currency fields to invoices and vendor_bills
--   5. Enhance vendor_bills with reconciliation and new billType values
--   6. Enhance audit_logs with before/after state and portal source
--   7. Add isImmutableCost to invoice_items
--   8. Extend notifications for CP portal
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1: Create channel_partners table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `channel_partners` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `partnerCode` text(20) NOT NULL,
  `companyName` text(255) NOT NULL,
  `legalEntityName` text(255),
  `registrationNumber` text(100),
  `country` text(100) NOT NULL,
  `address` text,
  `city` text(100),
  `state` text(100),
  `postalCode` text(20),
  `primaryContactName` text(255),
  `primaryContactEmail` text(320),
  `primaryContactPhone` text(20),
  `settlementCurrency` text(3) NOT NULL DEFAULT 'USD',
  `paymentTermDays` integer NOT NULL DEFAULT 30,
  `creditLimit` text,
  `depositMultiplier` integer NOT NULL DEFAULT 2,
  `logoUrl` text,
  `logoFileKey` text(500),
  `brandPrimaryColor` text(7) DEFAULT '#1a73e8',
  `brandSecondaryColor` text(7),
  `brandAccentColor` text(7),
  `faviconUrl` text,
  `faviconFileKey` text(500),
  `cpBillingEntityName` text(255),
  `cpBillingAddress` text,
  `cpBillingTaxId` text(100),
  `cpBankDetails` text,
  `cpInvoicePrefix` text(20),
  `cpInvoiceSequence` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'active',
  `notes` text,
  `createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `cp_partner_code_idx` ON `channel_partners`(`partnerCode`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cp_company_name_idx` ON `channel_partners`(`companyName`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cp_status_idx` ON `channel_partners`(`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cp_country_idx` ON `channel_partners`(`country`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2: Create channel_partner_contacts table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `channel_partner_contacts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `channelPartnerId` integer NOT NULL REFERENCES `channel_partners`(`id`),
  `contactName` text(255) NOT NULL,
  `email` text(320) NOT NULL,
  `phone` text(20),
  `role` text(100),
  `isPrimary` integer NOT NULL DEFAULT 0,
  `hasPortalAccess` integer NOT NULL DEFAULT 0,
  `passwordHash` text(255),
  `portalRole` text DEFAULT 'viewer',
  `inviteToken` text(255),
  `inviteExpiresAt` integer,
  `resetToken` text(255),
  `resetExpiresAt` integer,
  `isPortalActive` integer NOT NULL DEFAULT 0,
  `lastLoginAt` integer,
  `createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpc_cp_id_idx` ON `channel_partner_contacts`(`channelPartnerId`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `cpc_email_idx` ON `channel_partner_contacts`(`email`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpc_invite_token_idx` ON `channel_partner_contacts`(`inviteToken`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3: Create cp_pricing_rules table (EG → CP settlement pricing)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `cp_pricing_rules` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `channelPartnerId` integer NOT NULL REFERENCES `channel_partners`(`id`),
  `pricingType` text NOT NULL,
  `fixedFeeAmount` text,
  `markupPercentage` text,
  `tierConfig` text,
  `countryCode` text(3),
  `serviceType` text,
  `currency` text(3) DEFAULT 'USD',
  `fxMarkupPercentage` text DEFAULT '3.00',
  `effectiveFrom` text NOT NULL,
  `effectiveTo` text,
  `isActive` integer NOT NULL DEFAULT 1,
  `sourceQuotationId` integer,
  `createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpr_cp_id_idx` ON `cp_pricing_rules`(`channelPartnerId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpr_country_idx` ON `cp_pricing_rules`(`countryCode`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpr_active_idx` ON `cp_pricing_rules`(`isActive`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 4: Create cp_client_pricing table (CP → End Client billing rules)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `cp_client_pricing` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `channelPartnerId` integer NOT NULL REFERENCES `channel_partners`(`id`),
  `customerId` integer NOT NULL REFERENCES `customers`(`id`),
  `pricingType` text NOT NULL,
  `fixedFeeAmount` text,
  `markupPercentage` text,
  `baseFeeAmount` text,
  `additionalMarkupPercentage` text,
  `countryCode` text(3),
  `serviceType` text,
  `currency` text(3) DEFAULT 'USD',
  `fxMarkupPercentage` text DEFAULT '5.00',
  `effectiveFrom` text NOT NULL,
  `effectiveTo` text,
  `isActive` integer NOT NULL DEFAULT 1,
  `createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ccp_cp_id_idx` ON `cp_client_pricing`(`channelPartnerId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ccp_customer_id_idx` ON `cp_client_pricing`(`customerId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ccp_country_idx` ON `cp_client_pricing`(`countryCode`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ccp_active_idx` ON `cp_client_pricing`(`isActive`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ccp_cp_customer_idx` ON `cp_client_pricing`(`channelPartnerId`, `customerId`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 5: Create channel_partner_contracts table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `channel_partner_contracts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `channelPartnerId` integer NOT NULL REFERENCES `channel_partners`(`id`),
  `contractName` text(255) NOT NULL,
  `contractType` text(100),
  `fileUrl` text,
  `fileKey` text(500),
  `signedDate` text,
  `effectiveDate` text,
  `expiryDate` text,
  `status` text NOT NULL DEFAULT 'draft',
  `createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpctr_cp_id_idx` ON `channel_partner_contracts`(`channelPartnerId`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 6: Create channel_partner_wallets table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `channel_partner_wallets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `channelPartnerId` integer NOT NULL REFERENCES `channel_partners`(`id`),
  `currency` text(3) NOT NULL,
  `balance` text NOT NULL DEFAULT '0',
  `version` integer NOT NULL DEFAULT 0,
  `updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `cpw_cp_currency_idx` ON `channel_partner_wallets`(`channelPartnerId`, `currency`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 7: Create cp_wallet_transactions table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `cp_wallet_transactions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `walletId` integer NOT NULL REFERENCES `channel_partner_wallets`(`id`),
  `channelPartnerId` integer NOT NULL,
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
  `createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpwt_wallet_id_idx` ON `cp_wallet_transactions`(`walletId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpwt_cp_id_idx` ON `cp_wallet_transactions`(`channelPartnerId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpwt_reference_idx` ON `cp_wallet_transactions`(`referenceId`, `referenceType`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpwt_created_idx` ON `cp_wallet_transactions`(`createdAt`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 8: Create channel_partner_frozen_wallets table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `channel_partner_frozen_wallets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `channelPartnerId` integer NOT NULL REFERENCES `channel_partners`(`id`),
  `currency` text(3) NOT NULL,
  `balance` text NOT NULL DEFAULT '0',
  `version` integer NOT NULL DEFAULT 0,
  `updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `cpfw_cp_currency_idx` ON `channel_partner_frozen_wallets`(`channelPartnerId`, `currency`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 9: Create cp_frozen_wallet_transactions table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `cp_frozen_wallet_transactions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `walletId` integer NOT NULL REFERENCES `channel_partner_frozen_wallets`(`id`),
  `channelPartnerId` integer NOT NULL,
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
  `createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpfwt_wallet_id_idx` ON `cp_frozen_wallet_transactions`(`walletId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpfwt_cp_id_idx` ON `cp_frozen_wallet_transactions`(`channelPartnerId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpfwt_reference_idx` ON `cp_frozen_wallet_transactions`(`referenceId`, `referenceType`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cpfwt_created_idx` ON `cp_frozen_wallet_transactions`(`createdAt`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 10: Add channelPartnerId to existing tables
-- ─────────────────────────────────────────────────────────────────────────────

-- 10a. users table
ALTER TABLE `users` ADD COLUMN `channelPartnerId` integer REFERENCES `channel_partners`(`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_cp_id_idx` ON `users`(`channelPartnerId`);--> statement-breakpoint

-- 10b. customers table
ALTER TABLE `customers` ADD COLUMN `channelPartnerId` integer REFERENCES `channel_partners`(`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cust_cp_id_idx` ON `customers`(`channelPartnerId`);--> statement-breakpoint

-- 10c. customer_contacts table
ALTER TABLE `customer_contacts` ADD COLUMN `channelPartnerId` integer REFERENCES `channel_partners`(`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cc_cp_id_idx` ON `customer_contacts`(`channelPartnerId`);--> statement-breakpoint

-- 10d. employees table
ALTER TABLE `employees` ADD COLUMN `channelPartnerId` integer REFERENCES `channel_partners`(`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `emp_cp_id_idx` ON `employees`(`channelPartnerId`);--> statement-breakpoint

-- 10e. invoices table — channelPartnerId
ALTER TABLE `invoices` ADD COLUMN `channelPartnerId` integer REFERENCES `channel_partners`(`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `inv_cp_id_idx` ON `invoices`(`channelPartnerId`);--> statement-breakpoint

-- 10f. sales_leads table
ALTER TABLE `sales_leads` ADD COLUMN `channelPartnerId` integer REFERENCES `channel_partners`(`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sl_cp_id_idx` ON `sales_leads`(`channelPartnerId`);--> statement-breakpoint

-- 10g. onboarding_invites table
ALTER TABLE `onboarding_invites` ADD COLUMN `channelPartnerId` integer REFERENCES `channel_partners`(`id`);--> statement-breakpoint

-- 10h. audit_logs table — channelPartnerId
ALTER TABLE `audit_logs` ADD COLUMN `channelPartnerId` integer REFERENCES `channel_partners`(`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `al_cp_id_idx` ON `audit_logs`(`channelPartnerId`);--> statement-breakpoint

-- 10i. notifications table — targetChannelPartnerId
ALTER TABLE `notifications` ADD COLUMN `targetChannelPartnerId` integer REFERENCES `channel_partners`(`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notif_cp_idx` ON `notifications`(`targetChannelPartnerId`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 11: Add dual-layer invoice fields
-- ─────────────────────────────────────────────────────────────────────────────

-- invoiceLayer: identifies which billing layer this invoice belongs to
ALTER TABLE `invoices` ADD COLUMN `invoiceLayer` text NOT NULL DEFAULT 'legacy';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `inv_layer_idx` ON `invoices`(`invoiceLayer`);--> statement-breakpoint

-- parentInvoiceId: for cp_to_client invoices, links back to the eg_to_cp invoice
ALTER TABLE `invoices` ADD COLUMN `parentInvoiceId` integer REFERENCES `invoices`(`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `inv_parent_id_idx` ON `invoices`(`parentInvoiceId`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 12: Add dual-currency fields to invoices
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `invoices` ADD COLUMN `localCurrencyTotal` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `localCurrency` text(3);--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `settlementAmountUsd` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `fxRateUsed` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `fxMarkupRate` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `fxGainLoss` text;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 13: Add isImmutableCost to invoice_items
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `invoice_items` ADD COLUMN `isImmutableCost` integer NOT NULL DEFAULT 0;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 14: Enhance vendor_bills with dual-currency and reconciliation fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `vendor_bills` ADD COLUMN `localAmount` text;--> statement-breakpoint
ALTER TABLE `vendor_bills` ADD COLUMN `localCurrency` text(3);--> statement-breakpoint
ALTER TABLE `vendor_bills` ADD COLUMN `settlementAmountUsd` text;--> statement-breakpoint
ALTER TABLE `vendor_bills` ADD COLUMN `fxRateActual` text;--> statement-breakpoint
ALTER TABLE `vendor_bills` ADD COLUMN `reconciliationStatus` text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `vendor_bills` ADD COLUMN `reconciliationNote` text;--> statement-breakpoint
ALTER TABLE `vendor_bills` ADD COLUMN `reconciliationVariance` text;--> statement-breakpoint
ALTER TABLE `vendor_bills` ADD COLUMN `countryCode` text(3);--> statement-breakpoint
ALTER TABLE `vendor_bills` ADD COLUMN `payrollMonth` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vb_bill_type_idx` ON `vendor_bills`(`billType`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vb_reconciliation_idx` ON `vendor_bills`(`reconciliationStatus`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vb_country_code_idx` ON `vendor_bills`(`countryCode`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `vb_payroll_month_idx` ON `vendor_bills`(`payrollMonth`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 15: Enhance audit_logs with before/after state and portal source
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `audit_logs` ADD COLUMN `beforeState` text;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD COLUMN `afterState` text;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD COLUMN `portalSource` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `al_portal_source_idx` ON `audit_logs`(`portalSource`);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 16: Data backfill — mark all existing invoices as 'legacy' layer
-- (Already handled by DEFAULT 'legacy', but explicit for clarity)
-- ─────────────────────────────────────────────────────────────────────────────
-- No additional backfill needed: DEFAULT 'legacy' covers all existing rows.

-- ─────────────────────────────────────────────────────────────────────────────
-- END OF MIGRATION 0013
-- ─────────────────────────────────────────────────────────────────────────────
