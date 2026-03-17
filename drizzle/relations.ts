/**
 * Drizzle ORM Relations
 *
 * Defines relationships between tables for use with Drizzle's relational query API.
 * These relations are purely for query convenience (the `with` syntax) and do NOT
 * create database-level foreign keys.
 *
 * Note: The existing codebase uses manual JOINs for all queries. These relations
 * are provided for future refactoring and new feature development.
 */
import { relations } from "drizzle-orm";
import {
  users,
  countriesConfig,
  leaveTypes,
  publicHolidays,
  customers,
  customerContacts,
  customerPricing,
  customerContracts,
  customerLeavePolicies,
  employees,
  employeeContracts,
  employeeDocuments,
  leaveBalances,
  leaveRecords,
  adjustments,
  payrollRuns,
  payrollItems,
  invoices,
  invoiceItems,
  creditNoteApplications,
  reimbursements,
  vendors,
  vendorBills,
  vendorBillItems,
  billInvoiceAllocations,
  salesLeads,
  salesActivities,
  onboardingInvites,
  countrySocialInsuranceItems,
  countryGuideChapters,
  salaryBenchmarks,
  quotations,
  salesDocuments,
  contractors,
  contractorInvoices,
  contractorInvoiceItems,
  contractorMilestones,
  contractorAdjustments,
  contractorDocuments,
  contractorContracts,
  employeePayslips,
  workerUsers,
  customerWallets,
  walletTransactions,
  leadChangeLogs,
} from "./schema";

// ============================================================================
// 1. COUNTRY CONFIGURATION
// ============================================================================

export const countriesConfigRelations = relations(countriesConfig, ({ many }) => ({
  leaveTypes: many(leaveTypes),
  publicHolidays: many(publicHolidays),
  employees: many(employees),
  payrollRuns: many(payrollRuns),
  socialInsuranceItems: many(countrySocialInsuranceItems),
  guideChapters: many(countryGuideChapters),
  salaryBenchmarks: many(salaryBenchmarks),
}));

export const leaveTypesRelations = relations(leaveTypes, ({ one, many }) => ({
  country: one(countriesConfig, {
    fields: [leaveTypes.countryCode],
    references: [countriesConfig.countryCode],
  }),
  leaveBalances: many(leaveBalances),
  leaveRecords: many(leaveRecords),
  customerLeavePolicies: many(customerLeavePolicies),
}));

export const publicHolidaysRelations = relations(publicHolidays, ({ one }) => ({
  country: one(countriesConfig, {
    fields: [publicHolidays.countryCode],
    references: [countriesConfig.countryCode],
  }),
}));

// ============================================================================
// 2. CUSTOMER DOMAIN
// ============================================================================

export const customersRelations = relations(customers, ({ many }) => ({
  contacts: many(customerContacts),
  pricing: many(customerPricing),
  contracts: many(customerContracts),
  leavePolicies: many(customerLeavePolicies),
  employees: many(employees),
  invoices: many(invoices),
  wallet: many(customerWallets),
  adjustments: many(adjustments),
  // payrollRuns: many(payrollRuns), // Removed: payroll runs are per country, not per customer
  salesLeads: many(salesLeads),
  quotations: many(quotations),
  salesDocuments: many(salesDocuments),
}));

export const customerContactsRelations = relations(customerContacts, ({ one }) => ({
  customer: one(customers, {
    fields: [customerContacts.customerId],
    references: [customers.id],
  }),
}));

export const customerPricingRelations = relations(customerPricing, ({ one }) => ({
  customer: one(customers, {
    fields: [customerPricing.customerId],
    references: [customers.id],
  }),
}));

export const customerContractsRelations = relations(customerContracts, ({ one }) => ({
  customer: one(customers, {
    fields: [customerContracts.customerId],
    references: [customers.id],
  }),
}));

export const customerLeavePoliciesRelations = relations(customerLeavePolicies, ({ one }) => ({
  customer: one(customers, {
    fields: [customerLeavePolicies.customerId],
    references: [customers.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [customerLeavePolicies.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));

// ============================================================================
// 3. EMPLOYEE DOMAIN
// ============================================================================

export const employeesRelations = relations(employees, ({ one, many }) => ({
  customer: one(customers, {
    fields: [employees.customerId],
    references: [customers.id],
  }),
  contracts: many(employeeContracts),
  documents: many(employeeDocuments),
  leaveBalances: many(leaveBalances),
  leaveRecords: many(leaveRecords),
  adjustments: many(adjustments),
  payrollItems: many(payrollItems),
  invoiceItems: many(invoiceItems),
  reimbursements: many(reimbursements),
}));

export const employeeContractsRelations = relations(employeeContracts, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeContracts.employeeId],
    references: [employees.id],
  }),
}));

export const employeeDocumentsRelations = relations(employeeDocuments, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeDocuments.employeeId],
    references: [employees.id],
  }),
}));

// ============================================================================
// 4. LEAVE MANAGEMENT
// ============================================================================

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveBalances.employeeId],
    references: [employees.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveBalances.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));

export const leaveRecordsRelations = relations(leaveRecords, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveRecords.employeeId],
    references: [employees.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveRecords.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));

// ============================================================================
// 5. ADJUSTMENTS & REIMBURSEMENTS
// ============================================================================

export const adjustmentsRelations = relations(adjustments, ({ one }) => ({
  employee: one(employees, {
    fields: [adjustments.employeeId],
    references: [employees.id],
  }),
}));

export const reimbursementsRelations = relations(reimbursements, ({ one }) => ({
  employee: one(employees, {
    fields: [reimbursements.employeeId],
    references: [employees.id],
  }),
}));

// ============================================================================
// 6. PAYROLL
// ============================================================================

export const payrollRunsRelations = relations(payrollRuns, ({ one, many }) => ({
  // customer: one(customers, { // Removed: payroll runs are per country
  //   fields: [payrollRuns.customerId],
  //   references: [customers.id],
  // }),
  country: one(countriesConfig, {
    fields: [payrollRuns.countryCode],
    references: [countriesConfig.countryCode],
  }),
  items: many(payrollItems),
}));

export const payrollItemsRelations = relations(payrollItems, ({ one }) => ({
  payrollRun: one(payrollRuns, {
    fields: [payrollItems.payrollRunId],
    references: [payrollRuns.id],
  }),
  employee: one(employees, {
    fields: [payrollItems.employeeId],
    references: [employees.id],
  }),
}));

// ============================================================================
// 7. INVOICING
// ============================================================================

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  items: many(invoiceItems),
  creditNoteApplications: many(creditNoteApplications),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
  employee: one(employees, {
    fields: [invoiceItems.employeeId],
    references: [employees.id],
  }),
}));

export const creditNoteApplicationsRelations = relations(creditNoteApplications, ({ one }) => ({
  creditNote: one(invoices, {
    fields: [creditNoteApplications.creditNoteId],
    references: [invoices.id],
    relationName: "creditNote",
  }),
  targetInvoice: one(invoices, {
    fields: [creditNoteApplications.appliedToInvoiceId], // Fixed: targetInvoiceId -> appliedToInvoiceId
    references: [invoices.id],
    relationName: "targetInvoice",
  }),
}));

// ============================================================================
// 8. VENDOR & BILL MANAGEMENT
// ============================================================================

export const vendorsRelations = relations(vendors, ({ many }) => ({
  bills: many(vendorBills),
}));

export const vendorBillsRelations = relations(vendorBills, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [vendorBills.vendorId],
    references: [vendors.id],
  }),
  items: many(vendorBillItems),
  allocations: many(billInvoiceAllocations),
}));

export const vendorBillItemsRelations = relations(vendorBillItems, ({ one }) => ({
  vendorBill: one(vendorBills, {
    fields: [vendorBillItems.vendorBillId],
    references: [vendorBills.id],
  }),
}));

export const billInvoiceAllocationsRelations = relations(billInvoiceAllocations, ({ one }) => ({
  vendorBill: one(vendorBills, {
    fields: [billInvoiceAllocations.vendorBillId],
    references: [vendorBills.id],
  }),
  invoice: one(invoices, {
    fields: [billInvoiceAllocations.invoiceId],
    references: [invoices.id],
  }),
}));

// ============================================================================
// 9. SALES / CRM
// ============================================================================

export const salesLeadsRelations = relations(salesLeads, ({ one, many }) => ({
  customer: one(customers, {
    fields: [salesLeads.convertedCustomerId], // Fixed: customerId -> convertedCustomerId
    references: [customers.id],
  }),
  activities: many(salesActivities),
  quotations: many(quotations),
  documents: many(salesDocuments),
  changeLogs: many(leadChangeLogs),
}));

export const salesActivitiesRelations = relations(salesActivities, ({ one }) => ({
  lead: one(salesLeads, {
    fields: [salesActivities.leadId],
    references: [salesLeads.id],
  }),
}));

export const leadChangeLogsRelations = relations(leadChangeLogs, ({ one }) => ({
  lead: one(salesLeads, {
    fields: [leadChangeLogs.leadId],
    references: [salesLeads.id],
  }),
}));

// ============================================================================
// 10. ONBOARDING
// ============================================================================

export const onboardingInvitesRelations = relations(onboardingInvites, ({ one }) => ({
  employee: one(employees, {
    fields: [onboardingInvites.employeeId],
    references: [employees.id],
  }),
}));

// ============================================================================
// 11. TOOLKIT & SALES ENGINE
// ============================================================================

export const countrySocialInsuranceItemsRelations = relations(countrySocialInsuranceItems, ({ one }) => ({
  country: one(countriesConfig, {
    fields: [countrySocialInsuranceItems.countryCode],
    references: [countriesConfig.countryCode],
  }),
}));

export const countryGuideChaptersRelations = relations(countryGuideChapters, ({ one }) => ({
  country: one(countriesConfig, {
    fields: [countryGuideChapters.countryCode],
    references: [countriesConfig.countryCode],
  }),
}));

export const salaryBenchmarksRelations = relations(salaryBenchmarks, ({ one }) => ({
  country: one(countriesConfig, {
    fields: [salaryBenchmarks.countryCode],
    references: [countriesConfig.countryCode],
  }),
}));

export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  salesLead: one(salesLeads, {
    fields: [quotations.leadId],
    references: [salesLeads.id],
  }),
  customer: one(customers, {
    fields: [quotations.customerId],
    references: [customers.id],
  }),
  salesDocuments: many(salesDocuments),
}));

export const salesDocumentsRelations = relations(salesDocuments, ({ one }) => ({
  lead: one(salesLeads, {
    fields: [salesDocuments.leadId],
    references: [salesLeads.id],
  }),
  customer: one(customers, {
    fields: [salesDocuments.customerId],
    references: [customers.id],
  }),
  quotation: one(quotations, {
    fields: [salesDocuments.quotationId],
    references: [quotations.id],
  }),
}));

// ============================================================================
// 12. AOR SERVICES & WORKER PORTAL
// ============================================================================

export const contractorsRelations = relations(contractors, ({ one, many }) => ({
  customer: one(customers, {
    fields: [contractors.customerId],
    references: [customers.id],
  }),
  invoices: many(contractorInvoices),
  milestones: many(contractorMilestones),
  adjustments: many(contractorAdjustments),
  documents: many(contractorDocuments),
  contracts: many(contractorContracts),
  workerUser: one(workerUsers),
}));

export const contractorInvoicesRelations = relations(contractorInvoices, ({ one, many }) => ({
  contractor: one(contractors, {
    fields: [contractorInvoices.contractorId],
    references: [contractors.id],
  }),
  customer: one(customers, {
    fields: [contractorInvoices.customerId],
    references: [customers.id],
  }),
  items: many(contractorInvoiceItems),
}));

export const contractorInvoiceItemsRelations = relations(contractorInvoiceItems, ({ one }) => ({
  invoice: one(contractorInvoices, {
    fields: [contractorInvoiceItems.invoiceId],
    references: [contractorInvoices.id],
  }),
}));

export const contractorMilestonesRelations = relations(contractorMilestones, ({ one }) => ({
  contractor: one(contractors, {
    fields: [contractorMilestones.contractorId],
    references: [contractors.id],
  }),
}));

export const contractorAdjustmentsRelations = relations(contractorAdjustments, ({ one }) => ({
  contractor: one(contractors, {
    fields: [contractorAdjustments.contractorId],
    references: [contractors.id],
  }),
}));

export const workerUsersRelations = relations(workerUsers, ({ one }) => ({
  contractor: one(contractors, {
    fields: [workerUsers.contractorId],
    references: [contractors.id],
  }),
  employee: one(employees, {
    fields: [workerUsers.employeeId],
    references: [employees.id],
  }),
}));

export const contractorDocumentsRelations = relations(contractorDocuments, ({ one }) => ({
  contractor: one(contractors, {
    fields: [contractorDocuments.contractorId],
    references: [contractors.id],
  }),
}));

export const contractorContractsRelations = relations(contractorContracts, ({ one }) => ({
  contractor: one(contractors, {
    fields: [contractorContracts.contractorId],
    references: [contractors.id],
  }),
}));

export const employeePayslipsRelations = relations(employeePayslips, ({ one }) => ({
  employee: one(employees, {
    fields: [employeePayslips.employeeId],
    references: [employees.id],
  }),
  customer: one(customers, {
    fields: [employeePayslips.customerId],
    references: [customers.id],
  }),
}));

// ============================================================================
// 13. CUSTOMER WALLET
// ============================================================================

export const customerWalletsRelations = relations(customerWallets, ({ one, many }) => ({
  customer: one(customers, {
    fields: [customerWallets.customerId],
    references: [customers.id],
  }),
  transactions: many(walletTransactions),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  wallet: one(customerWallets, {
    fields: [walletTransactions.walletId],
    references: [customerWallets.id],
  }),
}));
