import {
  integer,
  text,
  sqliteTable,
  uniqueIndex,
  index,
  real,
} from "drizzle-orm/sqlite-core";

// ============================================================================
// 1. AUTHENTICATION & AUTHORIZATION
// ============================================================================

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    openId: text("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: text("email", { length: 320 }).unique(),
    passwordHash: text("passwordHash", { length: 255 }),
    loginMethod: text("loginMethod", { length: 64 }),
    role: text("role", { length: 200 })
      .default("user")
      .notNull(),
    language: text("language", { length: 10 }).default("en").notNull(),
    isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
    inviteToken: text("inviteToken", { length: 255 }),
    inviteExpiresAt: integer("inviteExpiresAt", { mode: "timestamp_ms" }),
    resetToken: text("resetToken", { length: 255 }),
    resetExpiresAt: integer("resetExpiresAt", { mode: "timestamp_ms" }),
    mustChangePassword: integer("mustChangePassword", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
    lastSignedIn: integer("lastSignedIn", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("email_idx").on(table.email),
    roleIdx: index("role_idx").on(table.role),
    inviteTokenIdx: index("invite_token_idx").on(table.inviteToken),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================================
// 2. COUNTRY CONFIGURATION
// ============================================================================

export const countriesConfig = sqliteTable(
  "countries_config",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    countryCode: text("countryCode", { length: 3 }).notNull().unique(), // ISO 3166-1 alpha-2
    countryName: text("countryName", { length: 100 }).notNull(),
    localCurrency: text("localCurrency", { length: 3 }).notNull(), // ISO 4217
    payrollCycle: text("payrollCycle", { enum: ["monthly", "semi_monthly"] }).default("monthly").notNull(),
    // payrollCutoffDay and payDayOfMonth moved to system_config (global settings)
    // Tax rates removed - not fixed values, handled per payroll run
    probationPeriodDays: integer("probationPeriodDays").default(90),
    noticePeriodDays: integer("noticePeriodDays").default(30),
    workingDaysPerWeek: integer("workingDaysPerWeek").default(5),
    statutoryAnnualLeave: integer("statutoryAnnualLeave").default(14),
    // Standard service rates per employee per month (base price before discounts)
    standardEorRate: text("standardEorRate"),
    standardVisaEorRate: text("standardVisaEorRate"),
    standardAorRate: text("standardAorRate"),
    // Visa EOR one-time setup fee (charged once per employee visa application)
    visaEorSetupFee: text("visaEorSetupFee"),
    standardRateCurrency: text("standardRateCurrency", { length: 3 }).default("USD"),
    // VAT configuration — some countries require VAT on employment cost remittances
    vatApplicable: integer("vatApplicable", { mode: "boolean" }).default(false).notNull(),
    vatRate: text("vatRate").default("0"), // e.g. 6.00 = 6%
    // isActive is determined by whether service fees are configured
    // A country with any non-null service rate (EOR/AOR/Visa) is considered active
    isActive: integer("isActive", { mode: "boolean" }).default(false).notNull(),
    notes: text("notes"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    countryCodeIdx: uniqueIndex("country_code_idx").on(table.countryCode),
  })
);

export type CountryConfig = typeof countriesConfig.$inferSelect;
export type InsertCountryConfig = typeof countriesConfig.$inferInsert;

// ============================================================================
// SYSTEM CONFIGURATION (Global Settings)
// ============================================================================

export const systemConfig = sqliteTable(
  "system_config",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    configKey: text("configKey", { length: 100 }).notNull().unique(),
    configValue: text("configValue").notNull(),
    description: text("description"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    configKeyIdx: uniqueIndex("config_key_idx").on(table.configKey),
  })
);

export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = typeof systemConfig.$inferInsert;

// Leave types per country
export const leaveTypes = sqliteTable(
  "leave_types",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    countryCode: text("countryCode", { length: 3 }).notNull(),
    leaveTypeName: text("leaveTypeName", { length: 100 }).notNull(), // Annual, Sick, Unpaid, Maternity, Paternity, Bereavement, Marriage
    annualEntitlement: integer("annualEntitlement").default(0), // Days per year
    isPaid: integer("isPaid", { mode: "boolean" }).default(true).notNull(),
    requiresApproval: integer("requiresApproval", { mode: "boolean" }).default(true).notNull(),
    applicableGender: text("applicableGender", { enum: ["male", "female", "all"] }).default("all").notNull(), // Which gender this leave type applies to
    description: text("description"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    countryCodeIdx: index("lt_country_code_idx").on(table.countryCode),
  })
);

export type LeaveType = typeof leaveTypes.$inferSelect;
export type InsertLeaveType = typeof leaveTypes.$inferInsert;

// Public Holidays per country per year (separate from leave types)
export const publicHolidays = sqliteTable(
  "public_holidays",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    countryCode: text("countryCode", { length: 3 }).notNull(),
    year: integer("year").notNull(), // e.g. 2026
    holidayDate: text("holidayDate").notNull(),
    holidayName: text("holidayName", { length: 255 }).notNull(),
    localName: text("localName", { length: 255 }), // Name in local language
    isGlobal: integer("isGlobal", { mode: "boolean" }).default(true).notNull(), // true = nationwide
    source: text("source", { length: 50 }).default("nager_api"), // nager_api | manual
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    phCountryCodeIdx: index("ph_country_code_idx").on(table.countryCode),
    phYearIdx: index("ph_year_idx").on(table.year),
    phCountryYearIdx: index("ph_country_year_idx").on(table.countryCode, table.year),
  })
);

export type PublicHoliday = typeof publicHolidays.$inferSelect;
export type InsertPublicHoliday = typeof publicHolidays.$inferInsert;

// ============================================================================
// 3. CUSTOMER MANAGEMENT
// ============================================================================

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientCode: text("clientCode", { length: 20 }).unique(), // Auto-generated: CUS-0001
    companyName: text("companyName", { length: 255 }).notNull(),
    legalEntityName: text("legalEntityName", { length: 255 }),
    registrationNumber: text("registrationNumber", { length: 100 }),
    industry: text("industry", { length: 100 }),
    address: text("address"),
    city: text("city", { length: 100 }),
    state: text("state", { length: 100 }),
    country: text("country", { length: 100 }).notNull(),
    postalCode: text("postalCode", { length: 20 }),
    primaryContactName: text("primaryContactName", { length: 255 }),
    primaryContactEmail: text("primaryContactEmail", { length: 320 }),
    primaryContactPhone: text("primaryContactPhone", { length: 20 }),
    paymentTermDays: integer("paymentTermDays").default(30).notNull(), // Payment terms in days (Net 7/15/30 etc.)
    settlementCurrency: text("settlementCurrency", { length: 3 }).default("USD").notNull(),
    language: text("language", { enum: ["en", "zh"] }).default("en").notNull(), // Invoice language preference
    billingEntityId: integer("billingEntityId"), // Associated billing entity (1:1)
    depositMultiplier: integer("depositMultiplier").default(2).notNull(), // Deposit = (baseSalary + estEmployerCost) × multiplier
    status: text("status", { enum: ["active", "suspended", "terminated"] }).default("active").notNull(),
    notes: text("notes"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    companyNameIdx: index("company_name_idx").on(table.companyName),
    countryIdx: index("country_idx").on(table.country),
    statusIdx: index("status_idx").on(table.status),
  })
);

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// Customer Contacts
export const customerContacts = sqliteTable(
  "customer_contacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customerId").notNull(),
    contactName: text("contactName", { length: 255 }).notNull(),
    email: text("email", { length: 320 }).notNull(),
    phone: text("phone", { length: 20 }),
    role: text("role", { length: 100 }), // Business role (e.g. "HR Director")
    isPrimary: integer("isPrimary", { mode: "boolean" }).default(false).notNull(),
    hasPortalAccess: integer("hasPortalAccess", { mode: "boolean" }).default(false).notNull(),
    // ── Portal Authentication Fields ──
    passwordHash: text("passwordHash", { length: 255 }), // bcrypt hash
    portalRole: text("portalRole", { enum: ["admin", "hr_manager", "finance", "viewer"] }).default("viewer"),
    inviteToken: text("inviteToken", { length: 255 }),
    inviteExpiresAt: integer("inviteExpiresAt", { mode: "timestamp_ms" }),
    resetToken: text("resetToken", { length: 255 }),
    resetExpiresAt: integer("resetExpiresAt", { mode: "timestamp_ms" }),
    isPortalActive: integer("isPortalActive", { mode: "boolean" }).default(false).notNull(), // true after invite accepted
    lastLoginAt: integer("lastLoginAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    customerIdIdx: index("cc_customer_id_idx").on(table.customerId),
    emailIdx: uniqueIndex("cc_email_idx").on(table.email),
    inviteTokenIdx: index("cc_invite_token_idx").on(table.inviteToken),
  })
);

export type CustomerContact = typeof customerContacts.$inferSelect;
export type InsertCustomerContact = typeof customerContacts.$inferInsert;

// Customer Pricing — global discount OR country-specific fixed prices
export const customerPricing = sqliteTable(
  "customer_pricing",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customerId").notNull(),
    pricingType: text("pricingType", { enum: ["global_discount", "country_specific", "client_aor_fixed"] }).notNull(),
    // For global_discount: discount percentage (e.g. 10 = 10% off standard price)
    globalDiscountPercent: text("globalDiscountPercent"),
    // For country_specific: fixed price per employee per month
    // For client_aor_fixed: fixed price for AOR globally (ignores countryCode)
    countryCode: text("countryCode", { length: 3 }),
    serviceType: text("serviceType", { enum: ["eor", "visa_eor"] }),
    fixedPrice: text("fixedPrice"),
    visaOneTimeFee: text("visaOneTimeFee"),
    currency: text("currency", { length: 3 }).default("USD"),
    effectiveFrom: text("effectiveFrom").notNull(),
    effectiveTo: text("effectiveTo"),
    // Traceability to source quotation
    sourceQuotationId: integer("sourceQuotationId"), 
    isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    customerIdIdx: index("cp_customer_id_idx").on(table.customerId),
    countryCodeIdx: index("cp_country_code_idx").on(table.countryCode),
  })
);

export type CustomerPricing = typeof customerPricing.$inferSelect;
export type InsertCustomerPricing = typeof customerPricing.$inferInsert;

// Customer Contracts
export const customerContracts = sqliteTable(
  "customer_contracts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customerId").notNull(),
    contractName: text("contractName", { length: 255 }).notNull(),
    contractType: text("contractType", { length: 100 }),
    fileUrl: text("fileUrl"),
    fileKey: text("fileKey", { length: 500 }),
    signedDate: text("signedDate"),
    effectiveDate: text("effectiveDate"),
    expiryDate: text("expiryDate"),
    status: text("status", { enum: ["draft", "signed", "expired", "terminated"] }).default("draft").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    cctrCustomerIdIdx: index("cctr_customer_id_idx").on(table.customerId),
  })
);

export type CustomerContract = typeof customerContracts.$inferSelect;
export type InsertCustomerContract = typeof customerContracts.$inferInsert;

// Customer Leave Policies — company-level leave configuration per country
export const customerLeavePolicies = sqliteTable(
  "customer_leave_policies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customerId").notNull(),
    countryCode: text("countryCode", { length: 3 }).notNull(),
    leaveTypeId: integer("leaveTypeId").notNull(),
    annualEntitlement: integer("annualEntitlement").notNull(), // Days per year (must be >= statutory minimum)
    expiryRule: text("expiryRule", { enum: ["year_end", "anniversary", "no_expiry"] }).default("year_end").notNull(),
    carryOverDays: integer("carryOverDays").default(0).notNull(), // Max days that can carry over to next year (0 = no carry over)
    clientConfirmed: integer("clientConfirmed", { mode: "boolean" }).default(false).notNull(), // Whether client has reviewed and confirmed this policy
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    clpCustomerIdIdx: index("clp_customer_id_idx").on(table.customerId),
    clpCountryIdx: index("clp_country_idx").on(table.countryCode),
    clpUniqueIdx: uniqueIndex("clp_unique_idx").on(table.customerId, table.countryCode, table.leaveTypeId),
  })
);

export type CustomerLeavePolicy = typeof customerLeavePolicies.$inferSelect;
export type InsertCustomerLeavePolicy = typeof customerLeavePolicies.$inferInsert;

// ============================================================================
// 4. EMPLOYEE MANAGEMENT
// ============================================================================

export const employees = sqliteTable(
  "employees",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeCode: text("employeeCode", { length: 20 }).unique(), // Auto-generated: EMP-0001
    customerId: integer("customerId").notNull(),
    // Personal info
    firstName: text("firstName", { length: 100 }).notNull(),
    lastName: text("lastName", { length: 100 }).notNull(),
    email: text("email", { length: 320 }).notNull(),
    phone: text("phone", { length: 20 }),
    dateOfBirth: text("dateOfBirth"),
    gender: text("gender", { enum: ["male", "female", "other", "prefer_not_to_say"] }),
    nationality: text("nationality", { length: 100 }),
    idNumber: text("idNumber", { length: 100 }),
    idType: text("idType", { length: 50 }),
    // Address
    address: text("address"),
    city: text("city", { length: 100 }),
    state: text("state", { length: 100 }),
    country: text("country", { length: 100 }).notNull(), // Employment country
    postalCode: text("postalCode", { length: 20 }),
    // Employment details
    department: text("department", { length: 100 }),
    jobTitle: text("jobTitle", { length: 255 }).notNull(),
    serviceType: text("serviceType", { enum: ["eor", "visa_eor"] }).default("eor").notNull(),
    employmentType: text("employmentType", { enum: ["fixed_term", "long_term"] }).default("long_term").notNull(),
    startDate: text("startDate").notNull(),
    endDate: text("endDate"),
    // Status: full lifecycle
    status: text("status", { enum: [
      "pending_review",
      "documents_incomplete",
      "onboarding",
      "contract_signed",
      "active",
      "on_leave",
      "offboarding",
      "terminated",
    ] }).default("pending_review").notNull(),
    // Compensation
    baseSalary: text("baseSalary").notNull(),
    salaryCurrency: text("salaryCurrency", { length: 3 }).default("USD").notNull(),
    estimatedEmployerCost: text("estimatedEmployerCost").default("0"), // Pre-employment estimate for deposit calculation
    // Visa tracking
    requiresVisa: integer("requiresVisa", { mode: "boolean" }).default(false).notNull(),
    visaStatus: text("visaStatus", { enum: [
      "not_required",
      "pending_application",
      "application_submitted",
      "approved",
      "rejected",
      "expired",
    ] }).default("not_required"),
    visaExpiryDate: text("visaExpiryDate"),
    visaNotes: text("visaNotes"),
    // Bank Details (Dynamic JSON based on country requirements)
    bankDetails: text("bankDetails", { mode: "json" }),
    // Metadata
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    empCustomerIdIdx: index("emp_customer_id_idx").on(table.customerId),
    empEmailIdx: index("emp_email_idx").on(table.email),
    empStatusIdx: index("emp_status_idx").on(table.status),
    empCountryIdx: index("emp_country_idx").on(table.country),
    empServiceTypeIdx: index("emp_service_type_idx").on(table.serviceType),
  })
);

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

// Employee Contracts
export const employeeContracts = sqliteTable(
  "employee_contracts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employeeId").notNull(),
    contractType: text("contractType", { length: 100 }),
    fileUrl: text("fileUrl"),
    fileKey: text("fileKey", { length: 500 }),
    signedDate: text("signedDate"),
    effectiveDate: text("effectiveDate"),
    expiryDate: text("expiryDate"),
    status: text("status", { enum: ["draft", "signed", "expired", "terminated"] }).default("draft").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    ecEmployeeIdIdx: index("ec_employee_id_idx").on(table.employeeId),
  })
);

export type EmployeeContract = typeof employeeContracts.$inferSelect;
export type InsertEmployeeContract = typeof employeeContracts.$inferInsert;

// ============================================================================
// 5. LEAVE MANAGEMENT
// ============================================================================

export const leaveBalances = sqliteTable(
  "leave_balances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employeeId").notNull(),
    leaveTypeId: integer("leaveTypeId").notNull(),
    year: integer("year").notNull(),
    totalEntitlement: integer("totalEntitlement").notNull(),
    used: integer("used").default(0).notNull(),
    remaining: integer("remaining").notNull(),
    expiryDate: text("expiryDate"), // When this leave balance expires (null = no expiry, carries over)
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    lbEmployeeIdIdx: index("lb_employee_id_idx").on(table.employeeId),
    lbLeaveTypeIdIdx: index("lb_leave_type_id_idx").on(table.leaveTypeId),
    lbEmployeeLeaveYearIdx: uniqueIndex("lb_employee_leave_year_idx").on(table.employeeId, table.leaveTypeId, table.year),
  })
);

export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type InsertLeaveBalance = typeof leaveBalances.$inferInsert;

export const leaveRecords = sqliteTable(
  "leave_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employeeId").notNull(),
    leaveTypeId: integer("leaveTypeId").notNull(),
    startDate: text("startDate").notNull(),
    endDate: text("endDate").notNull(),
    days: text("days").notNull(), // Support half days
    // Status workflow: submitted → client_approved/client_rejected → admin_approved/admin_rejected → locked
    status: text("status", { enum: [
      "submitted",
      "client_approved",
      "client_rejected",
      "admin_approved",
      "admin_rejected",
      "locked",
    ] }).default("submitted").notNull(),
    reason: text("reason"),
    submittedBy: integer("submittedBy"), // User ID who created this
    // Approval tracking
    clientApprovedBy: integer("clientApprovedBy"), // Portal contact ID who approved/rejected
    clientApprovedAt: integer("clientApprovedAt", { mode: "timestamp_ms" }),
    clientRejectionReason: text("clientRejectionReason"),
    adminApprovedBy: integer("adminApprovedBy"), // Admin user ID who confirmed
    adminApprovedAt: integer("adminApprovedAt", { mode: "timestamp_ms" }),
    adminRejectionReason: text("adminRejectionReason"),
    payrollRunId: integer("payrollRunId"), // Linked to payroll when locked
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    lrEmployeeIdIdx: index("lr_employee_id_idx").on(table.employeeId),
    lrStatusIdx: index("lr_status_idx").on(table.status),
    lrStartDateIdx: index("lr_start_date_idx").on(table.startDate),
    lrPayrollRunIdIdx: index("lr_payroll_run_id_idx").on(table.payrollRunId),
  })
);

export type LeaveRecord = typeof leaveRecords.$inferSelect;
export type InsertLeaveRecord = typeof leaveRecords.$inferInsert;

// ============================================================================
// 6. ADJUSTMENTS (异动薪酬) — Bonuses, Allowances, Reimbursements
// ============================================================================

export const adjustments = sqliteTable(
  "adjustments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employeeId").notNull(),
    customerId: integer("customerId").notNull(), // Auto-filled from employee
    payrollRunId: integer("payrollRunId"), // Linked to payroll when locked
    adjustmentType: text("adjustmentType", { enum: [
      "bonus",
      "allowance",
      "reimbursement",
      "deduction",
      "other",
    ] }).notNull(),
    category: text("category", { enum: [
      "housing",
      "transport",
      "meals",
      "performance_bonus",
      "year_end_bonus",
      "overtime",
      "travel_reimbursement",
      "equipment_reimbursement",
      "absence_deduction",
      "other",
    ] }),
    description: text("description"),
    amount: text("amount").notNull(),
    currency: text("currency", { length: 3 }).default("USD").notNull(), // Auto-filled from employee's country
    // For reimbursements: receipt
    receiptFileUrl: text("receiptFileUrl"),
    receiptFileKey: text("receiptFileKey", { length: 500 }),
    // Status workflow: submitted → client_approved/client_rejected → admin_approved/admin_rejected → locked
    status: text("status", { enum: [
      "submitted",
      "client_approved",
      "client_rejected",
      "admin_approved",
      "admin_rejected",
      "locked",
    ] }).default("submitted").notNull(),
    submittedBy: integer("submittedBy"), // User ID who created this
    // Approval tracking
    clientApprovedBy: integer("clientApprovedBy"),
    clientApprovedAt: integer("clientApprovedAt", { mode: "timestamp_ms" }),
    clientRejectionReason: text("clientRejectionReason"),
    adminApprovedBy: integer("adminApprovedBy"),
    adminApprovedAt: integer("adminApprovedAt", { mode: "timestamp_ms" }),
    adminRejectionReason: text("adminRejectionReason"),
    // Target month
    effectiveMonth: text("effectiveMonth").notNull(), // Which payroll month this applies to (YYYY-MM-01)
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    adjEmployeeIdIdx: index("adj_employee_id_idx").on(table.employeeId),
    adjCustomerIdIdx: index("adj_customer_id_idx").on(table.customerId),
    adjStatusIdx: index("adj_status_idx").on(table.status),
    adjPayrollRunIdIdx: index("adj_payroll_run_id_idx").on(table.payrollRunId),
    adjEffectiveMonthIdx: index("adj_effective_month_idx").on(table.effectiveMonth),
  })
);

export type Adjustment = typeof adjustments.$inferSelect;
export type InsertAdjustment = typeof adjustments.$inferInsert;

// ============================================================================
// 7. PAYROLL MANAGEMENT
// ============================================================================

export const payrollRuns = sqliteTable(
  "payroll_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Payroll runs are organized by country + period (not by customer)
    // All active employees in this country are included regardless of customer
    countryCode: text("countryCode", { length: 3 }).notNull(),
    payrollMonth: text("payrollMonth").notNull(), // First day of the month
    currency: text("currency", { length: 3 }).notNull(), // = country's legal currency
    status: text("status", { enum: [
      "draft",
      "pending_approval",
      "approved",
      "rejected",
    ] }).default("draft").notNull(),
    totalGross: text("totalGross").default("0"),
    totalDeductions: text("totalDeductions").default("0"),
    totalNet: text("totalNet").default("0"),
    totalEmployerCost: text("totalEmployerCost").default("0"),
    // Cross-approval: operations manager submits, another ops manager approves
    submittedBy: integer("submittedBy"),
    submittedAt: integer("submittedAt", { mode: "timestamp_ms" }),
    approvedBy: integer("approvedBy"),
    approvedAt: integer("approvedAt", { mode: "timestamp_ms" }),
    rejectedBy: integer("rejectedBy"),
    rejectedAt: integer("rejectedAt", { mode: "timestamp_ms" }),
    rejectionReason: text("rejectionReason"),
    notes: text("notes"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    prPayrollMonthIdx: index("pr_payroll_month_idx").on(table.payrollMonth),
    prStatusIdx: index("pr_status_idx").on(table.status),
    prCountryCodeIdx: index("pr_country_code_idx").on(table.countryCode),
    prCountryMonthIdx: uniqueIndex("pr_country_month_idx").on(table.countryCode, table.payrollMonth),
  })
);

export type PayrollRun = typeof payrollRuns.$inferSelect;
export type InsertPayrollRun = typeof payrollRuns.$inferInsert;

export const payrollItems = sqliteTable(
  "payroll_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    payrollRunId: integer("payrollRunId").notNull(),
    employeeId: integer("employeeId").notNull(),
    baseSalary: text("baseSalary").notNull(),
    bonus: text("bonus").default("0"),
    allowances: text("allowances").default("0"),
    reimbursements: text("reimbursements").default("0"),
    deductions: text("deductions").default("0"),
    taxDeduction: text("taxDeduction").default("0"),
    socialSecurityDeduction: text("socialSecurityDeduction").default("0"),
    unpaidLeaveDeduction: text("unpaidLeaveDeduction").default("0"),
    unpaidLeaveDays: text("unpaidLeaveDays").default("0"),
    gross: text("gross").notNull(),
    net: text("net").notNull(),
    employerSocialContribution: text("employerSocialContribution").default("0"),
    totalEmploymentCost: text("totalEmploymentCost").notNull(), // gross + employer contributions
    currency: text("currency", { length: 3 }).default("USD").notNull(),
    notes: text("notes"),
    // JSON breakdown of adjustments included
    adjustmentsBreakdown: text("adjustmentsBreakdown", { mode: "json" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    piPayrollRunIdIdx: index("pi_payroll_run_id_idx").on(table.payrollRunId),
    piEmployeeIdIdx: index("pi_employee_id_idx").on(table.employeeId),
    piRunEmployeeIdx: uniqueIndex("pi_run_employee_idx").on(table.payrollRunId, table.employeeId),
  })
);

export type PayrollItem = typeof payrollItems.$inferSelect;
export type InsertPayrollItem = typeof payrollItems.$inferInsert;

// ============================================================================
// 8. INVOICE MANAGEMENT
// ============================================================================

export const invoices = sqliteTable(
  "invoices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customerId").notNull(),
    billingEntityId: integer("billingEntityId"), // Which billing entity issues this invoice
    invoiceNumber: text("invoiceNumber", { length: 100 }).notNull().unique(),
    invoiceType: text("invoiceType", { enum: [
      "deposit",
      "monthly_eor",
      "monthly_visa_eor",
      "monthly_aor",
      "visa_service",
      "deposit_refund",
      "credit_note",
      "manual",
    ] }).notNull(),
    // Credit Note Disposition (for invoiceType = 'credit_note')
    creditNoteDisposition: text("creditNoteDisposition", { enum: ["to_wallet", "to_bank"] }),
    invoiceMonth: text("invoiceMonth"), // For monthly invoices
    // Invoice aggregates from multiple country-based payroll runs for this customer
    // The link is: invoice -> invoiceItems -> employeeId -> payrollItems
    // No single payrollRunId since invoice spans multiple countries
    currency: text("currency", { length: 3 }).notNull(),
    exchangeRate: text("exchangeRate").default("1"),
    exchangeRateWithMarkup: text("exchangeRateWithMarkup").default("1"),
    subtotal: text("subtotal").notNull(),
    serviceFeeTotal: text("serviceFeeTotal").default("0"),
    tax: text("tax").default("0"), // Total VAT across all countries
    total: text("total").notNull(), // subtotal + serviceFeeTotal + tax
    status: text("status", { enum: [
      "draft",
      "pending_review",
      "sent",
      "paid",
      "partially_paid",
      "overdue",
      "cancelled",
      "void",
      "applied",
    ] }).default("draft").notNull(),
    dueDate: text("dueDate"),
    sentDate: integer("sentDate", { mode: "timestamp_ms" }),
    paidDate: integer("paidDate", { mode: "timestamp_ms" }),
    paidAmount: text("paidAmount"),
    // Credit note application tracking
    creditApplied: text("creditApplied").default("0"), // Total credit applied to this invoice
    walletAppliedAmount: text("walletAppliedAmount").default("0"), // Total wallet balance applied to this invoice
    amountDue: text("amountDue"), // Adjusted amount due after credit (total - creditApplied - walletAppliedAmount)
    // Cost allocation tracking (denormalized for query performance)
    costAllocated: text("costAllocated").default("0"), // Total vendor bill cost allocated to this invoice
    // Related credit note / refund
    relatedInvoiceId: integer("relatedInvoiceId"),
    notes: text("notes"),
    internalNotes: text("internalNotes"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    invCustomerIdIdx: index("inv_customer_id_idx").on(table.customerId),
    invInvoiceNumberIdx: uniqueIndex("inv_invoice_number_idx").on(table.invoiceNumber),
    invStatusIdx: index("inv_status_idx").on(table.status),
    invInvoiceMonthIdx: index("inv_invoice_month_idx").on(table.invoiceMonth),
  })
);

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

export const invoiceItems = sqliteTable(
  "invoice_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    invoiceId: integer("invoiceId").notNull(),
    employeeId: integer("employeeId"),
    description: text("description", { length: 500 }).notNull(),
    quantity: text("quantity").default("1").notNull(),
    unitPrice: text("unitPrice").notNull(),
    amount: text("amount").notNull(),
    itemType: text("itemType", { enum: [
      "eor_service_fee",
      "visa_eor_service_fee",
      "aor_service_fee",
      "employment_cost",
      "deposit",
      "equipment_procurement_fee",
      "onboarding_fee",
      "offboarding_fee",
      "admin_setup_fee",
      "contract_termination_fee",
      "payroll_processing_fee",
      "tax_filing_fee",
      "hr_advisory_fee",
      "legal_compliance_fee",
      "visa_immigration_fee",
      "relocation_fee",
      "benefits_admin_fee",
      "bank_transfer_fee",
      "consulting_fee",
      "management_consulting_fee",
    ] }).notNull(),
    vatRate: text("vatRate").default("0"), // Tax rate percentage (e.g. 10.00 = 10%)
    countryCode: text("countryCode", { length: 3 }), // Which country this line item relates to
    localCurrency: text("localCurrency", { length: 3 }), // Original currency before conversion
    localAmount: text("localAmount"), // Amount in local currency
    exchangeRate: text("exchangeRate"), // Rate used for conversion
    exchangeRateWithMarkup: text("exchangeRateWithMarkup"), // Rate with markup
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    iiInvoiceIdIdx: index("ii_invoice_id_idx").on(table.invoiceId),
    iiEmployeeIdIdx: index("ii_employee_id_idx").on(table.employeeId),
  })
);

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = typeof invoiceItems.$inferInsert;

// ============================================================================
// 9. SYSTEM MANAGEMENT
// ============================================================================

export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fromCurrency: text("fromCurrency", { length: 3 }).notNull(),
    toCurrency: text("toCurrency", { length: 3 }).notNull(),
    rate: text("rate").notNull(),
    rateWithMarkup: text("rateWithMarkup").notNull(), // rate * (1 + markupPercentage)
    markupPercentage: text("markupPercentage").default("5.00").notNull(), // e.g. 5.00 = 5%
    source: text("source", { length: 100 }),
    effectiveDate: text("effectiveDate").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    erCurrencyPairIdx: uniqueIndex("er_currency_pair_idx").on(
      table.fromCurrency,
      table.toCurrency,
      table.effectiveDate
    ),
  })
);

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type InsertExchangeRate = typeof exchangeRates.$inferInsert;

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId"),
    userName: text("userName", { length: 255 }),
    action: text("action", { length: 100 }).notNull(),
    entityType: text("entityType", { length: 100 }).notNull(),
    entityId: integer("entityId"),
    changes: text("changes", { mode: "json" }),
    ipAddress: text("ipAddress", { length: 50 }),
    userAgent: text("userAgent"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    alUserIdIdx: index("al_user_id_idx").on(table.userId),
    alEntityTypeIdx: index("al_entity_type_idx").on(table.entityType),
    alCreatedAtIdx: index("al_created_at_idx").on(table.createdAt),
  })
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

export const systemSettings = sqliteTable(
  "system_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key", { length: 100 }).notNull().unique(),
    value: text("value").notNull(),
    description: text("description"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    ssKeyIdx: uniqueIndex("ss_key_idx").on(table.key),
  })
);

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

// ── Employee Documents ──────────────────────────────────────────────
export const employeeDocuments = sqliteTable(
  "employee_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employeeId").notNull(),
    documentType: text("documentType", { enum: [
      "resume",
      "passport",
      "national_id",
      "work_permit",
      "visa",
      "contract",
      "education",
      "payslip",
      "reimbursement_receipt",
      "other",
    ] }).notNull(),
    documentName: text("documentName", { length: 255 }).notNull(),
    fileUrl: text("fileUrl").notNull(),
    fileKey: text("fileKey", { length: 500 }).notNull(),
    mimeType: text("mimeType", { length: 100 }),
    fileSize: integer("fileSize"),
    notes: text("notes"),
    uploadedAt: integer("uploadedAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    edEmployeeIdIdx: index("ed_employee_id_idx").on(table.employeeId),
    edDocTypeIdx: index("ed_doc_type_idx").on(table.documentType),
  })
);
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
export type InsertEmployeeDocument = typeof employeeDocuments.$inferInsert;

// ============================================================================
// 10. BILLING ENTITIES
// ============================================================================

export const billingEntities = sqliteTable(
  "billing_entities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityName: text("entityName", { length: 255 }).notNull(),
    legalName: text("legalName", { length: 255 }).notNull(),
    registrationNumber: text("registrationNumber", { length: 100 }),
    taxId: text("taxId", { length: 100 }),
    country: text("country", { length: 100 }).notNull(),
    address: text("address"),
    city: text("city", { length: 100 }),
    state: text("state", { length: 100 }),
    postalCode: text("postalCode", { length: 20 }),
    bankDetails: text("bankDetails"), // Free-text bank info (multiline, admin-configured per country)
    currency: text("currency", { length: 3 }).default("USD").notNull(),
    contactEmail: text("contactEmail", { length: 320 }),
    contactPhone: text("contactPhone", { length: 20 }),
    isDefault: integer("isDefault", { mode: "boolean" }).default(false).notNull(),
    isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
    // Finance Phase 2 fields
    logoUrl: text("logoUrl"), // S3 URL for entity logo
    logoFileKey: text("logoFileKey", { length: 500 }), // S3 key for logo file
    invoicePrefix: text("invoicePrefix", { length: 20 }), // e.g. "APAC-" for invoice numbering
    paymentTermDays: integer("paymentTermDays").default(30).notNull(), // Payment terms in days
    invoiceSequence: integer("invoiceSequence").default(0).notNull(), // Last used invoice sequence number
    notes: text("notes"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    beCountryIdx: index("be_country_idx").on(table.country),
    beActiveIdx: index("be_active_idx").on(table.isActive),
    beInvoicePrefixIdx: uniqueIndex("be_invoice_prefix_idx").on(table.invoicePrefix),
  })
);

export type BillingEntity = typeof billingEntities.$inferSelect;
export type InsertBillingEntity = typeof billingEntities.$inferInsert;

// ============================================================================
// 11. CREDIT NOTE APPLICATIONS
// ============================================================================

/**
 * Tracks how credit notes are applied (offset) against regular invoices.
 * A single credit note can be applied across multiple invoices until its balance is zero.
 */
export const creditNoteApplications = sqliteTable(
  "credit_note_applications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    creditNoteId: integer("creditNoteId").notNull(), // The credit_note invoice being applied
    appliedToInvoiceId: integer("appliedToInvoiceId").notNull(), // The regular invoice receiving the credit
    appliedAmount: text("appliedAmount").notNull(), // Positive value representing the credit applied
    notes: text("notes"),
    appliedAt: integer("appliedAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    appliedBy: integer("appliedBy"), // User who applied the credit
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    cnaCreditNoteIdx: index("cna_credit_note_idx").on(table.creditNoteId),
    cnaAppliedToIdx: index("cna_applied_to_idx").on(table.appliedToInvoiceId),
  })
);

export type CreditNoteApplication = typeof creditNoteApplications.$inferSelect;
export type InsertCreditNoteApplication = typeof creditNoteApplications.$inferInsert;

// ============================================================================
// 11. EMPLOYEE SELF-SERVICE ONBOARDING INVITES
// ============================================================================
export const onboardingInvites = sqliteTable(
  "onboarding_invites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customerId").notNull(),
    employeeName: text("employeeName", { length: 200 }).notNull(),
    employeeEmail: text("employeeEmail", { length: 320 }).notNull(),
    token: text("token", { length: 64 }).notNull().unique(),
    status: text("status", { enum: [
      "pending",
      "completed",
      "expired",
      "cancelled",
    ] }).default("pending").notNull(),
    // Employer-provided fields (filled during invite flow step 2)
    serviceType: text("serviceType", { enum: ["eor", "visa_eor", "aor"] }).default("eor"),
    country: text("country", { length: 100 }),
    jobTitle: text("jobTitle", { length: 255 }),
    department: text("department", { length: 100 }),
    startDate: text("startDate"),
    endDate: text("endDate"),
    employmentType: text("employmentType", { length: 50 }),
    // EOR compensation
    baseSalary: text("baseSalary"),
    salaryCurrency: text("salaryCurrency", { length: 3 }),
    // AOR compensation
    paymentFrequency: text("paymentFrequency", { length: 50 }),
    rateAmount: text("rateAmount"),
    contractorCurrency: text("contractorCurrency", { length: 3 }),
    // Completion links
    employeeId: integer("employeeId"),
    contractorId: integer("contractorId"),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completedAt", { mode: "timestamp_ms" }),
    createdBy: integer("createdBy"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    oiTokenIdx: uniqueIndex("oi_token_idx").on(table.token),
    oiCustomerIdIdx: index("oi_customer_id_idx").on(table.customerId),
    oiStatusIdx: index("oi_status_idx").on(table.status),
    oiEmailIdx: index("oi_email_idx").on(table.employeeEmail),
  })
);
export type OnboardingInvite = typeof onboardingInvites.$inferSelect;
export type InsertOnboardingInvite = typeof onboardingInvites.$inferInsert;

// ============================================================================
// 12. REIMBURSEMENTS (报销) — Split from Adjustments
// ============================================================================

export const reimbursements = sqliteTable(
  "reimbursements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employeeId").notNull(),
    customerId: integer("customerId").notNull(), // Auto-filled from employee
    payrollRunId: integer("payrollRunId"), // Linked to payroll when locked
    category: text("category", { enum: [
      "travel",
      "equipment",
      "meals",
      "transportation",
      "medical",
      "education",
      "office_supplies",
      "communication",
      "other",
    ] }).notNull(),
    description: text("description"),
    amount: text("amount").notNull(),
    currency: text("currency", { length: 3 }).default("USD").notNull(),
    // Receipt / supporting document
    receiptFileUrl: text("receiptFileUrl"),
    receiptFileKey: text("receiptFileKey", { length: 500 }),
    // Status workflow: submitted → client_approved/client_rejected → admin_approved/admin_rejected → locked
    status: text("status", { enum: [
      "submitted",
      "client_approved",
      "client_rejected",
      "admin_approved",
      "admin_rejected",
      "locked",
    ] }).default("submitted").notNull(),
    submittedBy: integer("submittedBy"), // User/contact ID who created this
    // Approval tracking
    clientApprovedBy: integer("clientApprovedBy"),
    clientApprovedAt: integer("clientApprovedAt", { mode: "timestamp_ms" }),
    clientRejectionReason: text("clientRejectionReason"),
    adminApprovedBy: integer("adminApprovedBy"),
    adminApprovedAt: integer("adminApprovedAt", { mode: "timestamp_ms" }),
    adminRejectionReason: text("adminRejectionReason"),
    // Target month
    effectiveMonth: text("effectiveMonth").notNull(), // Which payroll month this applies to (YYYY-MM-01)
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    reimbEmployeeIdIdx: index("reimb_employee_id_idx").on(table.employeeId),
    reimbCustomerIdIdx: index("reimb_customer_id_idx").on(table.customerId),
    reimbStatusIdx: index("reimb_status_idx").on(table.status),
    reimbPayrollRunIdIdx: index("reimb_payroll_run_id_idx").on(table.payrollRunId),
    reimbEffectiveMonthIdx: index("reimb_effective_month_idx").on(table.effectiveMonth),
  })
);

export type Reimbursement = typeof reimbursements.$inferSelect;
export type InsertReimbursement = typeof reimbursements.$inferInsert;
// ============================================================================
// 13. VENDOR MANAGEMENT
// ============================================================================

/**
 * Vendors — external service providers used globally.
 * Tracks company info, contacts, bank details, and service type.
 */
export const vendors = sqliteTable(
  "vendors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vendorCode: text("vendorCode", { length: 20 }).unique(), // Auto-generated: VND-0001
    name: text("name", { length: 255 }).notNull(),
    legalName: text("legalName", { length: 255 }),
    contactName: text("contactName", { length: 255 }),
    contactEmail: text("contactEmail", { length: 320 }),
    contactPhone: text("contactPhone", { length: 50 }),
    country: text("country", { length: 100 }).notNull(),
    address: text("address"),
    city: text("city", { length: 100 }),
    state: text("state", { length: 100 }),
    postalCode: text("postalCode", { length: 20 }),
    serviceType: text("serviceType", { length: 100 }), // e.g. "Payroll Processing", "Legal", "IT"
    currency: text("currency", { length: 3 }).default("USD").notNull(), // Default payment currency
    bankDetails: text("bankDetails"), // Free-text bank info (multiline)
    taxId: text("taxId", { length: 100 }),
    paymentTermDays: integer("paymentTermDays").default(30).notNull(),
    vendorType: text("vendorType", { enum: ["client_related", "operational"] }).default("client_related").notNull(),
    status: text("status", { enum: ["active", "inactive"] }).default("active").notNull(),
    notes: text("notes"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    vdrNameIdx: index("vdr_name_idx").on(table.name),
    vdrCountryIdx: index("vdr_country_idx").on(table.country),
    vdrStatusIdx: index("vdr_status_idx").on(table.status),
  })
);

export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = typeof vendors.$inferInsert;

// ============================================================================
// 14. VENDOR BILLS (Accounts Payable)
// ============================================================================

/**
 * Vendor Bills — tracks payments owed/made to vendors.
 * This is the "expense" counterpart to the "revenue" invoices table.
 */
export const vendorBills = sqliteTable(
  "vendor_bills",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vendorId: integer("vendorId").notNull(),
    billNumber: text("billNumber", { length: 100 }).notNull(), // Vendor's invoice/bill number
    billDate: text("billDate").notNull(),
    dueDate: text("dueDate"),
    paidDate: text("paidDate"),
    billMonth: text("billMonth"), // Which service month this bill covers (YYYY-MM-01)
    currency: text("currency", { length: 3 }).default("USD").notNull(),
    subtotal: text("subtotal").notNull(),
    tax: text("tax").default("0"),
    totalAmount: text("totalAmount").notNull(),
    paidAmount: text("paidAmount").default("0"),
    status: text("status", { enum: [
      "draft",
      "pending_approval",
      "approved",
      "paid",
      "partially_paid",
      "overdue",
      "cancelled",
      "void",
      "applied", // For deposit bills that are applied
    ] }).default("draft").notNull(),
    category: text("category", { enum: [
      "payroll_processing",
      "social_contributions",
      "tax_filing",
      "legal_compliance",
      "visa_immigration",
      "hr_advisory",
      "it_services",
      "office_rent",
      "insurance",
      "bank_charges",
      "consulting",
      "equipment",
      "travel",
      "marketing",
      "other",
    ] }).default("other").notNull(),
    // Bill type: operational (regular service costs), deposit (vendor deposit/guarantee), deposit_refund
    billType: text("billType", { enum: [
      "operational",
      "deposit",
      "deposit_refund",
    ] }).default("operational").notNull(),
    description: text("description"),
    internalNotes: text("internalNotes"),
    // File attachment (vendor's original invoice/receipt)
    receiptFileUrl: text("receiptFileUrl"),
    receiptFileKey: text("receiptFileKey", { length: 500 }),
    // Bank settlement fields (from POP - Proof of Payment)
    bankReference: text("bankReference", { length: 200 }), // Bank transaction reference number
    bankName: text("bankName", { length: 255 }),
    bankFee: text("bankFee").default("0"), // Bank wire fee (USD)
    // Allocation tracking (denormalized for query performance)
    allocatedAmount: text("allocatedAmount").default("0"), // Total USD allocated to invoices
    unallocatedAmount: text("unallocatedAmount").default("0"), // totalAmount - allocatedAmount (operational cost)
    // Approval workflow
    submittedBy: integer("submittedBy"),
    submittedAt: integer("submittedAt", { mode: "timestamp_ms" }),
    approvedBy: integer("approvedBy"),
    approvedAt: integer("approvedAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    vbVendorIdIdx: index("vb_vendor_id_idx").on(table.vendorId),
    vbStatusIdx: index("vb_status_idx").on(table.status),
    vbBillDateIdx: index("vb_bill_date_idx").on(table.billDate),
    vbBillMonthIdx: index("vb_bill_month_idx").on(table.billMonth),
    vbCategoryIdx: index("vb_category_idx").on(table.category),
    vbBillNumberIdx: index("vb_bill_number_idx").on(table.billNumber),
  })
);

export type VendorBill = typeof vendorBills.$inferSelect;
export type InsertVendorBill = typeof vendorBills.$inferInsert;

// ============================================================================
// 15. VENDOR BILL ITEMS (Line Items for Vendor Bills)
// ============================================================================

/**
 * Vendor Bill Items — detailed line items within a vendor bill.
 * Allows cost allocation to specific customers, employees, or countries.
 */
export const vendorBillItems = sqliteTable(
  "vendor_bill_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vendorBillId: integer("vendorBillId").notNull(),
    description: text("description", { length: 500 }).notNull(),
    quantity: text("quantity").default("1").notNull(),
    unitPrice: text("unitPrice").notNull(),
    amount: text("amount").notNull(),
    // Cost type classification (for matching against invoice revenue items)
    itemType: text("itemType", { enum: [
      "employment_cost",     // Payroll, salary, social contributions paid to vendor
      "service_fee",         // Vendor's own service/processing fee
      "visa_fee",            // Visa/immigration related costs
      "equipment_purchase",  // Equipment procurement costs
      "deposit",             // Security deposit / guarantee
      "deposit_refund",      // Deposit returned by vendor
      "other",               // Miscellaneous / unclassified
    ] }).default("other").notNull(),
    // Cost allocation fields (optional — for linking expenses to revenue)
    relatedCustomerId: integer("relatedCustomerId"),
    relatedEmployeeId: integer("relatedEmployeeId"),
    relatedCountryCode: text("relatedCountryCode", { length: 3 }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    vbiVendorBillIdIdx: index("vbi_vendor_bill_id_idx").on(table.vendorBillId),
    vbiCustomerIdIdx: index("vbi_customer_id_idx").on(table.relatedCustomerId),
    vbiEmployeeIdIdx: index("vbi_employee_id_idx").on(table.relatedEmployeeId),
    vbiCountryCodeIdx: index("vbi_country_code_idx").on(table.relatedCountryCode),
  })
);

export type VendorBillItem = typeof vendorBillItems.$inferSelect;
export type InsertVendorBillItem = typeof vendorBillItems.$inferInsert;

// ============================================================================
// 16. BILL-INVOICE ALLOCATIONS (Cost Allocation)
// ============================================================================

/**
 * Bill-Invoice Allocations — links vendor bill items to customer invoices via employees.
 * This is the core table for cost allocation and profit analysis.
 *
 * Business rules:
 * - Employee is the bridge: Bill Item → Employee → Invoice (via employee.customerId)
 * - Double-sided validation:
 *   1. Sum of allocations per Bill ≤ Bill totalAmount (soft: warn if exceeded)
 *   2. Sum of allocations per Invoice ≤ Invoice total (soft: warn, allow with confirmation for loss)
 * - Loss scenario: If allocations exceed Invoice total, system warns but allows (records loss)
 * - Unallocated Bill amounts are treated as operational costs in P&L
 */
export const billInvoiceAllocations = sqliteTable(
  "bill_invoice_allocations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vendorBillId: integer("vendorBillId").notNull(), // FK → vendor_bills.id
    vendorBillItemId: integer("vendorBillItemId"), // FK → vendor_bill_items.id (optional, for item-level allocation)
    invoiceId: integer("invoiceId").notNull(), // FK → invoices.id
    employeeId: integer("employeeId").notNull(), // FK → employees.id (the bridge between bill and invoice)
    allocatedAmount: text("allocatedAmount").notNull(), // USD amount allocated
    description: text("description"), // Optional note about this allocation
    allocatedBy: integer("allocatedBy"), // User who created this allocation
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    biaVendorBillIdIdx: index("bia_vendor_bill_id_idx").on(table.vendorBillId),
    biaVendorBillItemIdIdx: index("bia_vendor_bill_item_id_idx").on(table.vendorBillItemId),
    biaInvoiceIdIdx: index("bia_invoice_id_idx").on(table.invoiceId),
    biaEmployeeIdIdx: index("bia_employee_id_idx").on(table.employeeId),
  })
);

export type BillInvoiceAllocation = typeof billInvoiceAllocations.$inferSelect;
export type InsertBillInvoiceAllocation = typeof billInvoiceAllocations.$inferInsert;

// ============================================================================
// 13. SALES CRM — Lightweight Sales Pipeline
// ============================================================================

export const salesLeads = sqliteTable(
  "sales_leads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyName: text("companyName", { length: 255 }).notNull(),
    contactName: text("contactName", { length: 255 }),
    contactEmail: text("contactEmail", { length: 320 }),
    contactPhone: text("contactPhone", { length: 20 }),
    country: text("country", { length: 100 }),
    industry: text("industry", { length: 100 }),
    estimatedEmployees: integer("estimatedEmployees"), // Expected number of employees to onboard
    estimatedRevenue: text("estimatedRevenue"), // Expected monthly revenue
    currency: text("currency", { length: 3 }).default("USD"),
    source: text("source", { length: 100 }), // Website, Referral, Cold Call, LinkedIn, Conference, etc.
    // Services the client intends to use (e.g. EOR, PEO, Payroll, etc.)
    intendedServices: text("intendedServices"),
    // Countries where employees are expected to onboard
    targetCountries: text("targetCountries"),
    status: text("status", { enum: [
      "discovery",
      "leads",
      "quotation_sent",
      "msa_sent",
      "msa_signed",
      "closed_won",
      "closed_lost",
    ] }).default("discovery").notNull(),
    lostReason: text("lostReason"), // Reason if status = closed_lost
    createdBy: integer("createdBy"), // User ID who created this lead (owner)
    assignedTo: integer("assignedTo"), // User ID of the assigned salesperson
    convertedCustomerId: integer("convertedCustomerId"), // Link to customers table after MSA signed
    notes: text("notes"), // General notes / follow-up log
    expectedCloseDate: text("expectedCloseDate"), // When the deal is expected to close
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    slStatusIdx: index("sl_status_idx").on(table.status),
    slAssignedToIdx: index("sl_assigned_to_idx").on(table.assignedTo),
    slCompanyNameIdx: index("sl_company_name_idx").on(table.companyName),
  })
);

export type SalesLead = typeof salesLeads.$inferSelect;
export type InsertSalesLead = typeof salesLeads.$inferInsert;

// Sales Activities — lightweight follow-up log per lead
export const salesActivities = sqliteTable(
  "sales_activities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("leadId").notNull(),
    activityType: text("activityType", { enum: [
      "call",
      "email",
      "meeting",
      "note",
      "proposal",
      "follow_up",
      "other",
    ] }).notNull(),
    description: text("description").notNull(),
    activityDate: integer("activityDate", { mode: "timestamp_ms" }).defaultNow().notNull(),
    createdBy: integer("createdBy"), // User ID who logged this activity
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    saLeadIdIdx: index("sa_lead_id_idx").on(table.leadId),
    saActivityDateIdx: index("sa_activity_date_idx").on(table.activityDate),
  })
);

export type SalesActivity = typeof salesActivities.$inferSelect;
export type InsertSalesActivity = typeof salesActivities.$inferInsert;

// ============================================================================
// 14. KNOWLEDGE BASE
// ============================================================================

export const knowledgeSources = sqliteTable(
  "knowledge_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name", { length: 255 }).notNull(),
    url: text("url").notNull(),
    sourceType: text("sourceType", { enum: ["rss", "api", "web"] }).default("web").notNull(),
    language: text("language", { enum: ["en", "zh", "multi"] }).default("multi").notNull(),
    topic: text("topic", { enum: ["payroll", "compliance", "leave", "invoice", "onboarding", "general"] })
      .default("general")
      .notNull(),
    isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
    authorityScore: integer("authorityScore").default(0).notNull(),
    authorityLevel: text("authorityLevel", { enum: ["high", "medium", "low"] }).default("low").notNull(),
    authorityReason: text("authorityReason"),
    aiReviewedAt: integer("aiReviewedAt", { mode: "timestamp_ms" }),
    lastFetchedAt: integer("lastFetchedAt", { mode: "timestamp_ms" }),
    updatedBy: integer("updatedBy"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    kbSourceActiveIdx: index("kb_source_active_idx").on(table.isActive),
    kbSourceTopicIdx: index("kb_source_topic_idx").on(table.topic),
  })
);

export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type InsertKnowledgeSource = typeof knowledgeSources.$inferInsert;

export const knowledgeItems = sqliteTable(
  "knowledge_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customerId"), // null = global item, otherwise customer-specific
    sourceId: integer("sourceId"),
    title: text("title", { length: 500 }).notNull(),
    summary: text("summary"),
    content: text("content"),
    status: text("status", { enum: ["draft", "pending_review", "published", "rejected"] }).default("pending_review").notNull(),
    category: text("category", { enum: ["article", "alert", "guide"] }).default("article").notNull(),
    topic: text("topic", { enum: ["payroll", "compliance", "leave", "invoice", "onboarding", "general"] })
      .default("general")
      .notNull(),
    language: text("language", { enum: ["en", "zh"] }).default("en").notNull(),
    metadata: text("metadata", { mode: "json" }),
    aiConfidence: integer("aiConfidence").default(0).notNull(),
    aiSummary: text("aiSummary"),
    publishedAt: integer("publishedAt", { mode: "timestamp_ms" }),
    reviewedBy: integer("reviewedBy"),
    reviewedAt: integer("reviewedAt", { mode: "timestamp_ms" }),
    reviewNote: text("reviewNote"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    kbItemCustomerIdx: index("kb_item_customer_idx").on(table.customerId),
    kbItemStatusIdx: index("kb_item_status_idx").on(table.status),
    kbItemTopicIdx: index("kb_item_topic_idx").on(table.topic),
    kbItemPublishedIdx: index("kb_item_published_idx").on(table.publishedAt),
  })
);

export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type InsertKnowledgeItem = typeof knowledgeItems.$inferInsert;

export const knowledgeMarketingEvents = sqliteTable(
  "knowledge_marketing_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customerId").notNull(),
    contactId: integer("contactId"),
    channel: text("channel", { enum: ["email"] }).default("email").notNull(),
    cadence: text("cadence", { enum: ["daily", "weekly", "monthly"] }).default("weekly").notNull(),
    topics: text("topics", { mode: "json" }).notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    kbEventCustomerIdx: index("kb_event_customer_idx").on(table.customerId),
  })
);

export type KnowledgeMarketingEvent = typeof knowledgeMarketingEvents.$inferSelect;
export type InsertKnowledgeMarketingEvent = typeof knowledgeMarketingEvents.$inferInsert;

export const knowledgeFeedbackEvents = sqliteTable(
  "knowledge_feedback_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customerId").notNull(),
    contactId: integer("contactId"),
    locale: text("locale", { enum: ["en", "zh"] }).default("en").notNull(),
    query: text("query", { length: 500 }),
    topics: text("topics", { mode: "json" }).notNull(),
    feedbackType: text("feedbackType", { enum: ["no_results", "not_helpful"] }).default("not_helpful").notNull(),
    note: text("note"),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    kbFeedbackCustomerIdx: index("kb_feedback_customer_idx").on(table.customerId),
    kbFeedbackTypeIdx: index("kb_feedback_type_idx").on(table.feedbackType),
    kbFeedbackCreatedIdx: index("kb_feedback_created_idx").on(table.createdAt),
  })
);

export type KnowledgeFeedbackEvent = typeof knowledgeFeedbackEvents.$inferSelect;
export type InsertKnowledgeFeedbackEvent = typeof knowledgeFeedbackEvents.$inferInsert;


// ============================================================================
// 15. AI PROVIDER CONFIG
// ============================================================================

export const aiProviderConfigs = sqliteTable(
  "ai_provider_configs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider", { enum: ["manus_forge", "openai", "qwen", "google", "volcengine"] }).notNull(),
    displayName: text("displayName", { length: 100 }).notNull(),
    baseUrl: text("baseUrl"),
    model: text("model", { length: 100 }).notNull(),
    apiKeyEnv: text("apiKeyEnv", { length: 100 }).notNull(),
    isEnabled: integer("isEnabled", { mode: "boolean" }).default(true).notNull(),
    priority: integer("priority").default(100).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    aiProviderIdx: uniqueIndex("ai_provider_idx").on(table.provider),
    aiProviderEnabledIdx: index("ai_provider_enabled_idx").on(table.isEnabled),
  })
);

export type AIProviderConfig = typeof aiProviderConfigs.$inferSelect;
export type InsertAIProviderConfig = typeof aiProviderConfigs.$inferInsert;

export const aiTaskPolicies = sqliteTable(
  "ai_task_policies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    task: text("task", { enum: ["knowledge_summarize", "source_authority_review", "vendor_bill_parse", "invoice_audit"] })
      .notNull(),
    primaryProvider: text("primaryProvider", { enum: ["manus_forge", "openai", "qwen", "google", "volcengine"] }).default("volcengine").notNull(),
    fallbackProvider: text("fallbackProvider", { enum: ["manus_forge", "openai", "qwen", "google", "volcengine"] }),
    modelOverride: text("modelOverride", { length: 100 }),
    temperature: text("temperature").default("0.30"),
    maxTokens: integer("maxTokens").default(4096),
    isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    aiTaskIdx: uniqueIndex("ai_task_idx").on(table.task),
    aiTaskActiveIdx: index("ai_task_active_idx").on(table.isActive),
  })
);

export type AITaskPolicy = typeof aiTaskPolicies.$inferSelect;
export type InsertAITaskPolicy = typeof aiTaskPolicies.$inferInsert;

export const aiTaskExecutions = sqliteTable(
  "ai_task_executions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskType: text("taskType", { enum: ["knowledge_summarize", "source_authority_review", "vendor_bill_parse", "invoice_audit", "knowledge_generate_guide", "copilot_chat"] }).notNull(),
    providerPrimary: text("providerPrimary", { enum: ["manus_forge", "openai", "qwen", "google", "volcengine"] }).notNull(),
    providerActual: text("providerActual", { enum: ["manus_forge", "openai", "qwen", "google", "volcengine"] }).notNull(),
    fallbackTriggered: integer("fallbackTriggered", { mode: "boolean" }).default(false).notNull(),
    latencyMs: integer("latencyMs").default(0).notNull(),
    tokenUsageIn: integer("tokenUsageIn").default(0).notNull(),
    tokenUsageOut: integer("tokenUsageOut").default(0).notNull(),
    costEstimate: text("costEstimate").default("0.0000").notNull(),
    success: integer("success", { mode: "boolean" }).default(true).notNull(),
    errorClass: text("errorClass", { length: 120 }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    aiExecTaskIdx: index("ai_exec_task_idx").on(table.taskType),
    aiExecCreatedIdx: index("ai_exec_created_idx").on(table.createdAt),
    aiExecSuccessIdx: index("ai_exec_success_idx").on(table.success),
  })
);

export type AITaskExecution = typeof aiTaskExecutions.$inferSelect;
export type InsertAITaskExecution = typeof aiTaskExecutions.$inferInsert;

// ============================================================================
// 16. NOTIFICATIONS
// ============================================================================

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    
    // Target definition
    targetPortal: text("targetPortal", { enum: ["admin", "client", "worker"] }).notNull(),
    targetUserId: integer("targetUserId"), // Specific user ID (optional)
    targetRole: text("targetRole"), // e.g. 'finance_manager', 'hr_manager' (optional)
    targetCustomerId: integer("targetCustomerId"), // For client portal notifications (optional)
    
    // Content definition
    type: text("type").notNull(), // e.g. 'invoice_sent', 'invoice_overdue'
    title: text("title").notNull(), // Pre-rendered title for quick display
    data: text("data", { mode: "json" }), // Dynamic data for template rendering
    
    // Status
    isRead: integer("isRead", { mode: "boolean" }).default(false).notNull(),
    readAt: integer("readAt", { mode: "timestamp_ms" }),
    
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    notifTargetIdx: index("notif_target_idx").on(table.targetPortal, table.targetUserId, table.targetRole),
    notifCustomerIdx: index("notif_customer_idx").on(table.targetCustomerId),
    notifReadIdx: index("notif_read_idx").on(table.isRead),
    notifTypeIdx: index("notif_type_idx").on(table.type),
    notifCreatedIdx: index("notif_created_idx").on(table.createdAt),
  })
);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ============================================================================
// 17. TOOLKIT & SALES ENGINE
// ============================================================================

export const countrySocialInsuranceItems = sqliteTable(
  "country_social_insurance_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    countryCode: text("countryCode", { length: 3 }).notNull(),
    
    // Item details
    itemKey: text("itemKey", { length: 50 }).notNull(),     // e.g. "bhxh", "bhyt", "cpf_ordinary"
    itemNameEn: text("itemNameEn", { length: 200 }).notNull(),
    itemNameZh: text("itemNameZh", { length: 200 }).notNull(),
    category: text("category", { enum: [
      "social_insurance",    // Social Insurance
      "health_insurance",    // Health Insurance
      "unemployment",        // Unemployment
      "pension",             // Pension
      "work_injury",         // Work Injury
      "housing_fund",        // Housing Fund
      "trade_union",         // Trade Union
      "other_mandatory",     // Other Mandatory
    ] }).notNull(),
    
    // Rates
    rateEmployer: text("rateEmployer").default("0").notNull(),   // Employer Rate (e.g. 0.175 = 17.5%)
    rateEmployee: text("rateEmployee").default("0").notNull(),   // Employee Rate
    
    // Cap Rules
    capType: text("capType", { enum: [
      "none",                // No Cap
      "fixed_amount",        // Fixed Amount Cap (e.g. 46,800,000 VND)
      "salary_multiple",     // Multiple of Base (e.g. 20x Regional Minimum Wage)
      "bracket",             // Bracketed Rate (e.g. Singapore CPF by age)
    ] }).default("none").notNull(),
    capBase: text("capBase"),          // Cap Base Amount (used with fixed_amount)
    capMultiplier: text("capMultiplier"), // Multiplier (used with salary_multiple)
    capReferenceBase: text("capReferenceBase"), // Reference Base (e.g. "regional_minimum_wage")
    
    // Conditions
    regionCode: text("regionCode"),    // Region Code (e.g. VN-Zone1, CN-BJ, CN-SH)
    regionName: text("regionName"),    // Region Name
    ageBracketMin: integer("ageBracketMin"), // Min Age (inclusive)
    ageBracketMax: integer("ageBracketMax"), // Max Age (inclusive)
    salaryBracketMin: text("salaryBracketMin"), // Min Salary (inclusive)
    salaryBracketMax: text("salaryBracketMax"), // Max Salary (inclusive)
    
    // Versioning
    effectiveYear: integer("effectiveYear").notNull(),  // Effective Year
    effectiveFrom: text("effectiveFrom"),               // Effective Date (ISO)
    effectiveTo: text("effectiveTo"),                   // Expiry Date (ISO)
    
    // Meta
    legalReference: text("legalReference"),  // Legal Reference (e.g. "Decree No 38/2022/ND-CP")
    notes: text("notes"),                    // Notes
    
    sortOrder: integer("sortOrder").default(0).notNull(),
    isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    csiCountryYearIdx: index("csi_country_year_idx").on(table.countryCode, table.effectiveYear),
    csiCountryItemIdx: index("csi_country_item_idx").on(table.countryCode, table.itemKey),
    csiRegionIdx: index("csi_region_idx").on(table.regionCode),
  })
);

export type CountrySocialInsuranceItem = typeof countrySocialInsuranceItems.$inferSelect;
export type InsertCountrySocialInsuranceItem = typeof countrySocialInsuranceItems.$inferInsert;

export const countryGuideChapters = sqliteTable(
  "country_guide_chapters",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    countryCode: text("countryCode", { length: 3 }).notNull(),
    part: integer("part").notNull(),           // 1=Employment Guide, 2=Business Guide
    chapterKey: text("chapterKey", { length: 50 }).notNull(),
    titleEn: text("titleEn", { length: 300 }).notNull(),
    titleZh: text("titleZh", { length: 300 }).notNull(),
    contentEn: text("contentEn").notNull(),    // Markdown content
    contentZh: text("contentZh").notNull(),
    sortOrder: integer("sortOrder").default(0).notNull(),
    version: text("version", { length: 20 }).notNull(),  // e.g. "2026-Q1"
    status: text("status", { enum: ["draft", "review", "published", "archived"] })
      .default("draft").notNull(),
    metadata: text("metadata", { mode: "json" }),  // Extra structured data
    effectiveFrom: text("effectiveFrom"),
    effectiveTo: text("effectiveTo"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    cgcCountryIdx: index("cgc_country_idx").on(table.countryCode),
    cgcStatusIdx: index("cgc_status_idx").on(table.status),
  })
);

export type CountryGuideChapter = typeof countryGuideChapters.$inferSelect;
export type InsertCountryGuideChapter = typeof countryGuideChapters.$inferInsert;

export const salaryBenchmarks = sqliteTable(
  "salary_benchmarks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    countryCode: text("countryCode", { length: 3 }).notNull(),
    jobCategory: text("jobCategory", { length: 100 }).notNull(),
    jobTitle: text("jobTitle", { length: 200 }).notNull(),
    seniorityLevel: text("seniorityLevel", { enum: ["junior", "mid", "senior", "lead", "director"] }).notNull(),
    salaryP25: text("salaryP25").notNull(),   // 25th percentile
    salaryP50: text("salaryP50").notNull(),   // Median
    salaryP75: text("salaryP75").notNull(),   // 75th percentile
    currency: text("currency", { length: 3 }).notNull(),
    dataYear: integer("dataYear").notNull(),
    source: text("source"),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    sbCountryIdx: index("sb_country_idx").on(table.countryCode),
    sbJobTitleIdx: index("sb_job_title_idx").on(table.jobTitle),
  })
);

export type SalaryBenchmark = typeof salaryBenchmarks.$inferSelect;
export type InsertSalaryBenchmark = typeof salaryBenchmarks.$inferInsert;

export const quotations = sqliteTable(
  "quotations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    quotationNumber: text("quotationNumber", { length: 50 }).notNull().unique(),
    leadId: integer("leadId"),
    customerId: integer("customerId"),
    
    // Quotation content (JSON snapshot of inputs)
    countries: text("countries", { mode: "json" }),  // [{countryCode, tier, headcount, unitPrice, serviceType}]
    
    // Financials
    totalMonthly: text("totalMonthly").notNull(),
    currency: text("currency", { length: 3 }).default("USD").notNull(),
    
    // Snapshot Data (Critical for audit)
    snapshotData: text("snapshotData", { mode: "json" }), // Stores exchange rates, fee versions, salary inputs at time of creation
    
    validUntil: text("validUntil"),
    
    // Status
    status: text("status", { enum: ["draft", "sent", "accepted", "expired", "rejected"] })
      .default("draft").notNull(),
    
    // PDF
    pdfUrl: text("pdfUrl"),
    pdfKey: text("pdfKey"),
    
    // Tracking
    sentAt: integer("sentAt", { mode: "timestamp_ms" }),
    sentTo: text("sentTo"),
    sentBy: integer("sentBy"),
    
    createdBy: integer("createdBy").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    qtNumberIdx: uniqueIndex("qt_number_idx").on(table.quotationNumber),
    qtLeadIdx: index("qt_lead_idx").on(table.leadId),
    qtCustomerIdx: index("qt_customer_idx").on(table.customerId),
    qtStatusIdx: index("qt_status_idx").on(table.status),
  })
);

export type Quotation = typeof quotations.$inferSelect;
export type InsertQuotation = typeof quotations.$inferInsert;

export const salesDocuments = sqliteTable(
  "sales_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("leadId"),
    customerId: integer("customerId"),
    quotationId: integer("quotationId"), // Optional link to quotation
    
    docType: text("docType", { enum: ["quotation", "cost_simulation", "proposal", "contract", "other"] }).notNull(),
    title: text("title", { length: 255 }).notNull(),
    
    fileUrl: text("fileUrl").notNull(),
    fileKey: text("fileKey", { length: 500 }).notNull(),
    
    generatedBy: integer("generatedBy").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    sdLeadIdx: index("sd_lead_idx").on(table.leadId),
    sdCustomerIdx: index("sd_customer_idx").on(table.customerId),
    sdQuotationIdx: index("sd_quotation_idx").on(table.quotationId),
  })
);

export type SalesDocument = typeof salesDocuments.$inferSelect;
export type InsertSalesDocument = typeof salesDocuments.$inferInsert;

// ============================================================================
// 18. COPILOT ASSISTANT — AI-Powered Enterprise Assistant
// ============================================================================
// Re-export all Copilot-related tables and types from copilot-schema.ts
// This maintains consistency with the project's import patterns
// ============================================================================

export {
  // Tables
  copilotUserConfigs,
  copilotConversations,
  copilotMessages,
  copilotFileAnalyses,
  copilotPredictions,
  copilotShortcuts,
  copilotMetrics,
  
  // Types
  type CopilotUserConfig,
  type CopilotConversation,
  type CopilotMessage,
  type CopilotFileAnalysis,
  type CopilotPrediction,
  type CopilotShortcut,
  type CopilotMetric,
  type InsertCopilotUserConfig,
  type InsertCopilotConversation,
  type InsertCopilotMessage,
  type InsertCopilotFileAnalysis,
  type InsertCopilotPrediction,
  type InsertCopilotShortcut,
  type InsertCopilotMetric,
} from "./copilot-schema";

// ============================================================================
// 19. CUSTOMER WALLET (PREPAYMENT) SYSTEM
// ============================================================================

/**
 * Customer Wallets — stores current balance per currency.
 * Optimistic locking (version) is used to prevent concurrent balance updates.
 */
export const customerWallets = sqliteTable(
  "customer_wallets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customerId").notNull(),
    currency: text("currency", { length: 3 }).notNull(), // USD, EUR, CNY...
    balance: text("balance").default("0").notNull(), // Decimal string
    version: integer("version").default(0).notNull(), // Optimistic lock
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    cwCustomerCurrencyIdx: uniqueIndex("cw_customer_currency_idx").on(table.customerId, table.currency),
  })
);

export type CustomerWallet = typeof customerWallets.$inferSelect;
export type InsertCustomerWallet = typeof customerWallets.$inferInsert;

/**
 * Wallet Transactions — immutable ledger of all fund movements.
 * Source of truth for audit and accounting.
 */
export const walletTransactions = sqliteTable(
  "wallet_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    walletId: integer("walletId").notNull(),
    
    type: text("type", { enum: [
      "credit_note_in",       // Credit Note converted to balance (+)
      "overpayment_in",       // Invoice overpayment converted to balance (+)
      "top_up",               // Direct bank transfer top-up (+)
      "invoice_deduction",    // Balance used to pay invoice (-)
      "invoice_refund",       // Invoice rejected/voided, balance returned (+)
      "manual_adjustment",    // Admin manual adjustment (+/-)
      "payout",               // Withdrawal/Refund to bank (-)
      "refund_out",           // Alias for payout (Withdrawal)
    ] }).notNull(),

    amount: text("amount").notNull(), // Always positive
    direction: text("direction", { enum: ["credit", "debit"] }).notNull(), // credit = increase balance, debit = decrease balance
    
    balanceBefore: text("balanceBefore").notNull(),
    balanceAfter: text("balanceAfter").notNull(),
    
    // Audit Trail
    referenceId: integer("referenceId").notNull(), // InvoiceID, CreditNoteID, PaymentID
    referenceType: text("referenceType", { enum: ["invoice", "credit_note", "payment", "manual"] }).notNull(),
    
    description: text("description"),
    internalNote: text("internalNote"),
    createdBy: integer("createdBy"), // User ID
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    wtWalletIdIdx: index("wt_wallet_id_idx").on(table.walletId),
    wtReferenceIdx: index("wt_reference_idx").on(table.referenceId, table.referenceType),
    wtCreatedIdx: index("wt_created_idx").on(table.createdAt),
  })
);

export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = typeof walletTransactions.$inferInsert;

/**
 * Customer Frozen Wallets — stores deposit/security funds.
 * Physically isolated from main wallets to prevent accidental usage.
 */
export const customerFrozenWallets = sqliteTable(
  "customer_frozen_wallets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customerId").notNull(),
    currency: text("currency", { length: 3 }).notNull(), // USD, EUR, CNY...
    balance: text("balance").default("0").notNull(), // Decimal string
    version: integer("version").default(0).notNull(), // Optimistic lock
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    cfwCustomerCurrencyIdx: uniqueIndex("cfw_customer_currency_idx").on(table.customerId, table.currency),
  })
);

export type CustomerFrozenWallet = typeof customerFrozenWallets.$inferSelect;
export type InsertCustomerFrozenWallet = typeof customerFrozenWallets.$inferInsert;

/**
 * Frozen Wallet Transactions — immutable ledger of deposit funds.
 */
export const frozenWalletTransactions = sqliteTable(
  "frozen_wallet_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    walletId: integer("walletId").notNull(),
    
    type: text("type", { enum: [
      "deposit_in",           // Deposit payment received (+)
      "deposit_release",      // Deposit released to main wallet (-)
      "deposit_refund",       // Deposit refunded to bank (-)
      "deposit_deduction",    // Deposit used to cover unpaid bills (-)
      "manual_adjustment",    // Admin manual adjustment (+/-)
    ] }).notNull(),

    amount: text("amount").notNull(), // Always positive
    direction: text("direction", { enum: ["credit", "debit"] }).notNull(), // credit = increase balance, debit = decrease balance
    
    balanceBefore: text("balanceBefore").notNull(),
    balanceAfter: text("balanceAfter").notNull(),
    
    // Audit Trail
    referenceId: integer("referenceId").notNull(), // InvoiceID, PaymentID, CreditNoteID
    referenceType: text("referenceType", { enum: ["invoice", "payment", "credit_note", "manual"] }).notNull(),
    
    description: text("description"),
    internalNote: text("internalNote"),
    createdBy: integer("createdBy"), // User ID
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    fwtWalletIdIdx: index("fwt_wallet_id_idx").on(table.walletId),
    fwtReferenceIdx: index("fwt_reference_idx").on(table.referenceId, table.referenceType),
    fwtCreatedIdx: index("fwt_created_idx").on(table.createdAt),
  })
);

export type FrozenWalletTransaction = typeof frozenWalletTransactions.$inferSelect;
export type InsertFrozenWalletTransaction = typeof frozenWalletTransactions.$inferInsert;

// ============================================================================
// 20. LEAD CHANGE LOGS
// ============================================================================

export const leadChangeLogs = sqliteTable(
  "lead_change_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("leadId").notNull(),
    userId: integer("userId"),
    userName: text("userName", { length: 255 }),
    changeType: text("changeType", { length: 50 }).notNull(), // 'field_update' | 'status_change' | 'created' | 'converted' | 'deleted'
    fieldName: text("fieldName", { length: 100 }), // which field changed
    oldValue: text("oldValue"),
    newValue: text("newValue"),
    description: text("description"), // human-readable summary
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => ({
    lclLeadIdIdx: index("lcl_lead_id_idx").on(table.leadId),
    lclCreatedAtIdx: index("lcl_created_at_idx").on(table.createdAt),
  })
);

export type LeadChangeLog = typeof leadChangeLogs.$inferSelect;
export type InsertLeadChangeLog = typeof leadChangeLogs.$inferInsert;

// ============================================================================
// 21. AOR SERVICES & WORKER PORTAL
// ============================================================================

export {
  // Tables
  contractors,
  contractorInvoices,
  contractorInvoiceItems,
  contractorMilestones,
  contractorAdjustments,
  contractorDocuments,
  contractorContracts,
  employeePayslips,
  workerUsers,
  migrationIdMap,

  // Types
  type Contractor,
  type ContractorInvoice,
  type ContractorInvoiceItem,
  type ContractorMilestone,
  type ContractorAdjustment,
  type ContractorDocument,
  type ContractorContract,
  type EmployeePayslip,
  type WorkerUser,
  type MigrationIdMap,
  type InsertContractor,
  type InsertContractorInvoice,
  type InsertContractorInvoiceItem,
  type InsertContractorMilestone,
  type InsertContractorAdjustment,
  type InsertContractorDocument,
  type InsertContractorContract,
  type InsertEmployeePayslip,
  type InsertWorkerUser,
  type InsertMigrationIdMap,
} from "./aor-schema";
