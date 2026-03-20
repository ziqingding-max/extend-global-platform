
import { eq, desc, count, like, sql, and, inArray, isNotNull, gte, lt } from "drizzle-orm";
import { 
  countriesConfig, InsertCountryConfig,
  systemConfig, InsertSystemConfig,
  auditLogs, InsertAuditLog,
  exchangeRates,
  leaveTypes, InsertLeaveType,
  salesLeads, InsertSalesLead,
  salesActivities, InsertSalesActivity,
  billingEntities, InsertBillingEntity,
  leadChangeLogs, InsertLeadChangeLog
} from "../../../drizzle/schema";
import { getDb } from "./connection";
import {
  customers,
  employees,
  channelPartners,
  payrollRuns,
  invoices,
  adjustments,
  leaveRecords,
  employeeContracts,
} from "../../../drizzle/schema";

// COUNTRIES CONFIG
export async function listCountriesConfig() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(countriesConfig);
}

export async function getCountryConfig(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(countriesConfig).where(eq(countriesConfig.countryCode, code)).limit(1);
  return result[0];
}

export async function createCountryConfig(data: InsertCountryConfig) {
  const db = await getDb();
  if (!db) return;
  await db.insert(countriesConfig).values(data);
}

export async function updateCountryConfig(id: number, data: Partial<InsertCountryConfig>) {
  const db = await getDb();
  if (!db) return;
  await db.update(countriesConfig).set(data).where(eq(countriesConfig.id, id));
}

export async function deleteCountryConfig(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(countriesConfig).where(eq(countriesConfig.id, id));
}

// SYSTEM CONFIG
export async function getSystemConfig(key: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(systemConfig).where(eq(systemConfig.configKey, key)).limit(1);
  return result.length > 0 ? result[0].configValue : null;
}

export async function setSystemConfig(key: string, value: string) {
  const db = await getDb();
  if (!db) return;
  // Upsert logic
  await db.insert(systemConfig).values({ configKey: key, configValue: value })
    .onConflictDoUpdate({ target: systemConfig.configKey, set: { configValue: value } });
}

export async function listSystemConfigs() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(systemConfig);
}

// AUDIT LOGS
export async function logAuditAction(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(data);
}

export interface ListAuditLogsParams {
  page?: number;
  pageSize?: number;
  entityType?: string;
  userId?: number;
}

export async function listAuditLogs(params: ListAuditLogsParams = {}) {
  const { page = 1, pageSize = 50, entityType, userId } = params;
  const db = await getDb();
  if (!db) return { data: [], total: 0 };
  const offset = (page - 1) * pageSize;
  
  const conditions = [];
  if (entityType) conditions.push(eq(auditLogs.entityType, entityType));
  if (userId) conditions.push(eq(auditLogs.userId, userId));
  
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [data, totalResult] = await Promise.all([
    db.select().from(auditLogs).where(where).limit(pageSize).offset(offset).orderBy(desc(auditLogs.createdAt)),
    db.select({ count: count() }).from(auditLogs).where(where)
  ]);
  
  return { data, total: totalResult[0]?.count || 0 };
}

// LEAVE TYPES
export async function listLeaveTypesByCountry(countryCode: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(leaveTypes).where(eq(leaveTypes.countryCode, countryCode));
}

export async function createLeaveType(data: InsertLeaveType) {
  const db = await getDb();
  if (!db) return;
  await db.insert(leaveTypes).values(data);
}

export async function updateLeaveType(id: number, data: Partial<InsertLeaveType>) {
  const db = await getDb();
  if (!db) return;
  await db.update(leaveTypes).set(data).where(eq(leaveTypes.id, id));
}

export async function deleteLeaveType(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(leaveTypes).where(eq(leaveTypes.id, id));
}

export async function getLeaveTypeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(leaveTypes).where(eq(leaveTypes.id, id)).limit(1);
  return result[0];
}

// EXCHANGE RATES
export interface ListExchangeRatesParams {
  page?: number;
  pageSize?: number;
}

export async function listAllExchangeRates(params: ListExchangeRatesParams = {}) {
  const { page = 1, pageSize = 50 } = params;
  const db = await getDb();
  if (!db) return { data: [], total: 0 };
  const offset = (page - 1) * pageSize;
  
  const [data, totalResult] = await Promise.all([
    db.select().from(exchangeRates).limit(pageSize).offset(offset).orderBy(desc(exchangeRates.updatedAt)),
    db.select({ count: count() }).from(exchangeRates)
  ]);
  return { data, total: totalResult[0]?.count || 0 };
}

export async function deleteExchangeRate(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(exchangeRates).where(eq(exchangeRates.id, id));
}

// DASHBOARD
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return {
    totalCustomers: 0,
    totalEmployees: 0,
    activeEmployees: 0,
    pendingPayrolls: 0,
    pendingInvoices: 0,
    pendingAdjustments: 0,
    pendingLeaves: 0,
    newHiresThisMonth: 0,
    terminationsThisMonth: 0,
    newClientsThisMonth: 0,
    // New fields for simplified dashboard
    activePartners: 0,
    activeCountries: 0,
    onboardingEmployees: 0,
    offboardingEmployees: 0,
    overdueInvoiceAmount: "0",
    expiringContracts30: 0,
  };

  const now = new Date();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonthStart = now.getMonth() === 11
    ? `${now.getFullYear() + 1}-01-01`
    : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, "0")}-01`;
  const todayStr = now.toISOString().slice(0, 10);
  const futureDate30 = new Date(now);
  futureDate30.setDate(futureDate30.getDate() + 30);
  const futureDate30Str = futureDate30.toISOString().slice(0, 10);

  const [
    custCount, empCount, activeEmpCount,
    partnerCount, countryCount,
    pendingPayrollCount, draftInvoiceCount,
    pendingAdjCount, pendingLeaveCount,
    onboardingCount, offboardingCount,
    overdueResult,
    newHiresCount, terminationsCount, newClientsCount,
    expiringContractsCount,
  ] = await Promise.all([
    db.select({ count: count() }).from(customers),
    db.select({ count: count() }).from(employees),
    db.select({ count: count() }).from(employees).where(eq(employees.status, 'active')),
    // Active partners (excluding internal EG-DIRECT)
    db.select({ count: count() }).from(channelPartners).where(
      and(eq(channelPartners.status, 'active'), eq(channelPartners.isInternal, false))
    ),
    // Active countries (distinct countries with active employees)
    db.select({ count: sql<number>`COUNT(DISTINCT ${employees.country})` }).from(employees)
      .where(inArray(employees.status, ['active', 'on_leave'])),
    // Pending payrolls
    db.select({ count: count() }).from(payrollRuns)
      .where(eq(payrollRuns.status, 'pending_approval')),
    // Draft invoices
    db.select({ count: count() }).from(invoices)
      .where(eq(invoices.status, 'draft')),
    // Pending adjustments
    db.select({ count: count() }).from(adjustments)
      .where(eq(adjustments.status, 'submitted')),
    // Pending leave requests
    db.select({ count: count() }).from(leaveRecords)
      .where(eq(leaveRecords.status, 'submitted')),
    // Onboarding employees
    db.select({ count: count() }).from(employees)
      .where(inArray(employees.status, ['pending_review', 'documents_incomplete', 'onboarding', 'contract_signed'])),
    // Offboarding employees
    db.select({ count: count() }).from(employees)
      .where(eq(employees.status, 'offboarding')),
    // Overdue invoice amount
    db.select({ total: sql<string>`COALESCE(SUM(${invoices.total}), 0)` }).from(invoices)
      .where(eq(invoices.status, 'overdue')),
    // New hires this month
    db.select({ count: count() }).from(employees)
      .where(and(
        sql`${employees.startDate} >= ${currentMonthStart}`,
        sql`${employees.startDate} < ${nextMonthStart}`,
      )),
    // Terminations this month
    db.select({ count: count() }).from(employees)
      .where(and(
        eq(employees.status, 'terminated'),
        sql`${employees.updatedAt} >= ${currentMonthStart}`,
        sql`${employees.updatedAt} < ${nextMonthStart}`,
      )),
    // New clients this month
    db.select({ count: count() }).from(customers)
      .where(and(
        sql`${customers.createdAt} >= ${currentMonthStart}`,
        sql`${customers.createdAt} < ${nextMonthStart}`,
      )),
    // Expiring contracts within 30 days
    db.select({ count: count() }).from(employeeContracts)
      .innerJoin(employees, eq(employeeContracts.employeeId, employees.id))
      .where(and(
        isNotNull(employeeContracts.expiryDate),
        sql`${employeeContracts.expiryDate} >= ${todayStr}`,
        sql`${employeeContracts.expiryDate} <= ${futureDate30Str}`,
        eq(employeeContracts.status, 'signed'),
        inArray(employees.status, ['active', 'on_leave']),
      )),
  ]);

  return {
    totalCustomers: custCount[0]?.count || 0,
    totalEmployees: empCount[0]?.count || 0,
    activeEmployees: activeEmpCount[0]?.count || 0,
    pendingPayrolls: pendingPayrollCount[0]?.count || 0,
    pendingInvoices: draftInvoiceCount[0]?.count || 0,
    pendingAdjustments: pendingAdjCount[0]?.count || 0,
    pendingLeaves: pendingLeaveCount[0]?.count || 0,
    newHiresThisMonth: newHiresCount[0]?.count || 0,
    terminationsThisMonth: terminationsCount[0]?.count || 0,
    newClientsThisMonth: newClientsCount[0]?.count || 0,
    // New fields for simplified dashboard
    activePartners: partnerCount[0]?.count || 0,
    activeCountries: countryCount[0]?.count || 0,
    onboardingEmployees: onboardingCount[0]?.count || 0,
    offboardingEmployees: offboardingCount[0]?.count || 0,
    overdueInvoiceAmount: overdueResult[0]?.total ?? "0",
    expiringContracts30: expiringContractsCount[0]?.count || 0,
  };
}

// BILLING ENTITIES
export async function listBillingEntities() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(billingEntities);
}

export async function getBillingEntityById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(billingEntities).where(eq(billingEntities.id, id)).limit(1);
  return result[0];
}

export async function createBillingEntity(data: InsertBillingEntity) {
  const db = await getDb();
  if (!db) return;
  await db.insert(billingEntities).values(data);
}

export async function updateBillingEntity(id: number, data: Partial<InsertBillingEntity>) {
  const db = await getDb();
  if (!db) return;
  await db.update(billingEntities).set(data).where(eq(billingEntities.id, id));
}

export async function deleteBillingEntity(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(billingEntities).where(eq(billingEntities.id, id));
}

// SALES CRM (Leads)
export async function createSalesLead(data: InsertSalesLead) {
  const db = await getDb();
  if (!db) return;
  await db.insert(salesLeads).values(data);
}

export async function getSalesLeadById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(salesLeads).where(eq(salesLeads.id, id)).limit(1);
  return result[0];
}

export interface ListSalesLeadsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  assignedTo?: number;
}

export async function listSalesLeads(params: ListSalesLeadsParams = {}) {
  const { page = 1, pageSize = 50, search, status, assignedTo } = params;
  const db = await getDb();
  if (!db) return { data: [], total: 0 };
  const offset = (page - 1) * pageSize;
  
  const conditions = [];
  if (search) conditions.push(like(salesLeads.companyName, `%${search}%`));
  if (status) {
    // Robust status matching: trim and case-insensitive
    conditions.push(sql`trim(lower(${salesLeads.status})) = trim(lower(${status}))`);
  }
  if (assignedTo) conditions.push(eq(salesLeads.assignedTo, assignedTo));
  
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [data, totalResult] = await Promise.all([
    db.select().from(salesLeads).where(where).limit(pageSize).offset(offset).orderBy(desc(salesLeads.createdAt)),
    db.select({ count: count() }).from(salesLeads).where(where)
  ]);
  return { data, total: totalResult[0]?.count || 0 };
}

export async function updateSalesLead(id: number, data: Partial<InsertSalesLead>) {
  const db = await getDb();
  if (!db) return;
  await db.update(salesLeads).set(data).where(eq(salesLeads.id, id));
}

export async function deleteSalesLead(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(salesLeads).where(eq(salesLeads.id, id));
}

// SALES ACTIVITIES
export async function createSalesActivity(data: InsertSalesActivity) {
  const db = await getDb();
  if (!db) return;
  await db.insert(salesActivities).values(data);
}

export async function listSalesActivities(leadId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(salesActivities).where(eq(salesActivities.leadId, leadId)).orderBy(desc(salesActivities.activityDate));
}

// LEAD CHANGE LOGS
export async function createLeadChangeLog(data: InsertLeadChangeLog) {
  const db = await getDb();
  if (!db) return;
  // Use raw SQL to exclude 'id' column from INSERT statement.
  // Drizzle's db.insert() always includes all table columns and passes null for autoIncrement id,
  // which fails on Turso remote databases that enforce NOT NULL on PRIMARY KEY.
  const now = Date.now();
  await db.run(sql`INSERT INTO lead_change_logs ("leadId", "userId", "userName", "changeType", "fieldName", "oldValue", "newValue", "description", "createdAt") VALUES (${data.leadId}, ${data.userId ?? null}, ${data.userName ?? null}, ${data.changeType}, ${data.fieldName ?? null}, ${data.oldValue ?? null}, ${data.newValue ?? null}, ${data.description ?? null}, ${now})`);
}

export async function listLeadChangeLogs(leadId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(leadChangeLogs).where(eq(leadChangeLogs.leadId, leadId)).orderBy(desc(leadChangeLogs.createdAt));
}

export async function deleteSalesActivity(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(salesActivities).where(eq(salesActivities.id, id));
}
