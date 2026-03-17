
import { eq, like, count, desc, and, inArray, sum, sql } from "drizzle-orm";
import { 
  invoices, InsertInvoice,
  invoiceItems, InsertInvoiceItem,
  payrollRuns, InsertPayrollRun,
  payrollItems, InsertPayrollItem,
  adjustments, InsertAdjustment,
  reimbursements, InsertReimbursement,
  vendors, InsertVendor,
  vendorBills, InsertVendorBill,
  vendorBillItems, InsertVendorBillItem,
  billInvoiceAllocations, InsertBillInvoiceAllocation,
  customers
} from "../../../drizzle/schema";
import { getDb } from "./connection";

// INVOICES
export async function createInvoice(data: InsertInvoice) {
  const db = await getDb();
  if (!db) return [];
  return await db.insert(invoices).values(data).returning({ id: invoices.id });
}

export async function getInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return result[0];
}

export async function getInvoiceByNumber(invoiceNumber: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1);
  return result[0];
}

export async function listInvoices(
  filters: { customerId?: number; status?: string; invoiceType?: string; invoiceMonth?: string; excludeCreditNotes?: boolean } = {},
  limit: number = 50,
  offset: number = 0
) {
  const db = await getDb();
  if (!db) return { data: [], total: 0 };

  // Build WHERE conditions from filters
  const conditions = [];
  if (filters.customerId) conditions.push(eq(invoices.customerId, filters.customerId));
  if (filters.status) conditions.push(eq(invoices.status, filters.status as any));
  if (filters.invoiceType) conditions.push(eq(invoices.invoiceType, filters.invoiceType as any));
  if (filters.invoiceMonth) conditions.push(eq(invoices.invoiceMonth, filters.invoiceMonth));
  
  // Exclude negative invoice types (Credit Notes & Deposit Refunds) if requested
  if (filters.excludeCreditNotes) {
    const { ne, and } = await import("drizzle-orm");
    // We want to exclude 'credit_note' and 'deposit_refund'
    // Drizzle ORM doesn't have a simple 'notInArray' helper in all versions, 
    // so we use multiple NE conditions combined with AND
    conditions.push(ne(invoices.invoiceType, "credit_note"));
    conditions.push(ne(invoices.invoiceType, "deposit_refund"));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, totalResult] = await Promise.all([
    db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      customerId: invoices.customerId,
      customerName: customers.companyName,
      billingEntityId: invoices.billingEntityId,
      invoiceType: invoices.invoiceType,
      invoiceMonth: invoices.invoiceMonth,
      status: invoices.status,
      dueDate: invoices.dueDate,
      total: invoices.total,
      amountDue: invoices.amountDue,
      currency: invoices.currency,
      createdAt: invoices.createdAt,
      creditNoteDisposition: invoices.creditNoteDisposition,
      relatedInvoiceId: invoices.relatedInvoiceId,
    })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(where)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(invoices.createdAt)),
    db.select({ count: count() }).from(invoices).where(where)
  ]);

  return { data, total: totalResult[0]?.count || 0 };
}

export async function getRelatedInvoices(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];

  // 1. Find invoices that reference this invoice (children: credit notes, follow-ups, deposit refunds)
  const children = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      invoiceType: invoices.invoiceType,
      total: invoices.total,
      status: invoices.status,
      currency: invoices.currency,
      createdAt: invoices.createdAt,
      relatedInvoiceId: invoices.relatedInvoiceId,
    })
    .from(invoices)
    .where(eq(invoices.relatedInvoiceId, invoiceId));

  // 2. Find the parent invoice (if this invoice references another)
  const currentInvoice = await db
    .select({ relatedInvoiceId: invoices.relatedInvoiceId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  let parent: typeof children = [];
  if (currentInvoice[0]?.relatedInvoiceId) {
    parent = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        invoiceType: invoices.invoiceType,
        total: invoices.total,
        status: invoices.status,
        currency: invoices.currency,
        createdAt: invoices.createdAt,
        relatedInvoiceId: invoices.relatedInvoiceId,
      })
      .from(invoices)
      .where(eq(invoices.id, currentInvoice[0].relatedInvoiceId));
  }

  return [...parent, ...children];
}

export async function updateInvoice(id: number, data: Partial<InsertInvoice>) {
  const db = await getDb();
  if (!db) return;
  await db.update(invoices).set(data).where(eq(invoices.id, id));
}

export async function deleteInvoice(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(invoices).where(eq(invoices.id, id));
}

export async function createInvoiceItem(data: InsertInvoiceItem) {
  const db = await getDb();
  if (!db) return;
  await db.insert(invoiceItems).values(data);
}

export async function listInvoiceItemsByInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
}

export async function updateInvoiceItem(id: number, data: Partial<InsertInvoiceItem>) {
  const db = await getDb();
  if (!db) return;
  await db.update(invoiceItems).set(data).where(eq(invoiceItems.id, id));
}

export async function deleteInvoiceItem(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(invoiceItems).where(eq(invoiceItems.id, id));
}

export async function getInvoiceProfitAnalysis(invoiceId: number) {
  const db = await getDb();
  if (!db) return null;
  const inv = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv[0]) return null;
  const revenue = parseFloat(String(inv[0].total || "0"));
  const costAllocated = parseFloat(String(inv[0].costAllocated || "0"));
  const profit = revenue - costAllocated;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const allocations = await listDetailedAllocationsByInvoice(invoiceId);
  return {
    invoiceId,
    invoiceNumber: inv[0].invoiceNumber,
    revenue,
    costAllocated,
    profit: Math.round(profit * 100) / 100,
    profitMargin: Math.round(margin * 100) / 100,
    isLoss: profit < 0,
    allocations,
  };
}

// PAYROLL
export async function createPayrollRun(data: InsertPayrollRun) {
  const db = await getDb();
  if (!db) return [];
  return await db.insert(payrollRuns).values(data);
}

export async function getPayrollRunById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1);
  return result[0];
}

export async function listPayrollRuns(
  filters: { status?: string; countryCode?: string; payrollMonth?: string } = {},
  limit: number = 50,
  offset: number = 0
) {
  const db = await getDb();
  if (!db) return { data: [], total: 0 };

  const conditions = [];
  if (filters.status) conditions.push(eq(payrollRuns.status, filters.status as any));
  if (filters.countryCode) conditions.push(eq(payrollRuns.countryCode, filters.countryCode));
  if (filters.payrollMonth) conditions.push(eq(payrollRuns.payrollMonth, filters.payrollMonth));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, totalResult] = await Promise.all([
    whereClause
      ? db.select().from(payrollRuns).where(whereClause).limit(limit).offset(offset).orderBy(desc(payrollRuns.createdAt))
      : db.select().from(payrollRuns).limit(limit).offset(offset).orderBy(desc(payrollRuns.createdAt)),
    whereClause
      ? db.select({ count: count() }).from(payrollRuns).where(whereClause)
      : db.select({ count: count() }).from(payrollRuns)
  ]);

  return { data, total: totalResult[0]?.count || 0 };
}

export async function updatePayrollRun(id: number, data: Partial<InsertPayrollRun>) {
  const db = await getDb();
  if (!db) return;
  await db.update(payrollRuns).set(data).where(eq(payrollRuns.id, id));
}

export async function findPayrollRunByCountryMonth(country: string, month: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(payrollRuns).where(and(eq(payrollRuns.countryCode, country), eq(payrollRuns.payrollMonth, month))).limit(1);
  return result[0];
}

export async function createPayrollItem(data: InsertPayrollItem) {
  const db = await getDb();
  if (!db) return;
  await db.insert(payrollItems).values(data);
}

export async function listPayrollItemsByRun(runId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(payrollItems).where(eq(payrollItems.payrollRunId, runId));
}

export async function getPayrollItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(payrollItems).where(eq(payrollItems.id, id)).limit(1);
  return result[0];
}

export async function updatePayrollItem(id: number, data: Partial<InsertPayrollItem>) {
  const db = await getDb();
  if (!db) return;
  await db.update(payrollItems).set(data).where(eq(payrollItems.id, id));
}

export async function deletePayrollItem(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(payrollItems).where(eq(payrollItems.id, id));
}

export async function listPayrollItemsByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  const items = await db
    .select({
      item: payrollItems,
      run: {
        id: payrollRuns.id,
        payrollMonth: payrollRuns.payrollMonth,
        countryCode: payrollRuns.countryCode,
        currency: payrollRuns.currency,
        status: payrollRuns.status,
        approvedAt: payrollRuns.approvedAt,
      },
    })
    .from(payrollItems)
    .innerJoin(payrollRuns, eq(payrollItems.payrollRunId, payrollRuns.id))
    .where(eq(payrollItems.employeeId, employeeId))
    .orderBy(desc(payrollRuns.payrollMonth));
  return items;
}

// ADJUSTMENTS
export async function createAdjustment(data: InsertAdjustment) {
  const db = await getDb();
  if (!db) return;
  return await db.insert(adjustments).values(data);
}

export interface ListAdjustmentsParams {
  page?: number;
  pageSize?: number;
  customerId?: number;
  employeeId?: number;
  status?: string;
  adjustmentType?: string;
  effectiveMonth?: string;
}

export async function listAdjustments(params: ListAdjustmentsParams = {}) {
  const { page = 1, pageSize = 50, customerId, employeeId, status, adjustmentType, effectiveMonth } = params;
  const db = await getDb();
  if (!db) return { data: [], total: 0 };
  const offset = (page - 1) * pageSize;
  
  const conditions = [];
  if (customerId) conditions.push(eq(adjustments.customerId, customerId));
  if (employeeId) conditions.push(eq(adjustments.employeeId, employeeId));
  if (status) conditions.push(eq(adjustments.status, status as any));
  if (adjustmentType) conditions.push(eq(adjustments.adjustmentType, adjustmentType as any));
  if (effectiveMonth) conditions.push(eq(adjustments.effectiveMonth, effectiveMonth));
  
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [data, totalResult] = await Promise.all([
    db.select().from(adjustments).where(where).limit(pageSize).offset(offset).orderBy(desc(adjustments.createdAt)),
    db.select({ count: count() }).from(adjustments).where(where)
  ]);
  
  return { data, total: totalResult[0]?.count || 0 };
}

export async function getAdjustmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(adjustments).where(eq(adjustments.id, id)).limit(1);
  return result[0];
}

export async function updateAdjustment(id: number, data: Partial<InsertAdjustment>) {
  const db = await getDb();
  if (!db) return;
  await db.update(adjustments).set(data).where(eq(adjustments.id, id));
}

export async function deleteAdjustment(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(adjustments).where(eq(adjustments.id, id));
}

export async function getSubmittedAdjustmentsForPayroll(countryCodeOrEmployeeId: string | number, monthStr: string, statuses: string[] = ['admin_approved']) {
  const db = await getDb();
  if (!db) return [];
  // When called with a country code (string), fetch all approved adjustments for that country+month
  // When called with an employee ID (number), fetch for that specific employee
  if (typeof countryCodeOrEmployeeId === 'string') {
    // Join with employees to filter by country
    const { employees } = await import('../../../drizzle/schema');
    const results = await db.select({
      id: adjustments.id,
      employeeId: adjustments.employeeId,
      customerId: adjustments.customerId,
      adjustmentType: adjustments.adjustmentType,
      category: adjustments.category,
      description: adjustments.description,
      amount: adjustments.amount,
      currency: adjustments.currency,
      status: adjustments.status,
      effectiveMonth: adjustments.effectiveMonth,
      payrollRunId: adjustments.payrollRunId,
      createdAt: adjustments.createdAt,
    }).from(adjustments)
      .innerJoin(employees, eq(adjustments.employeeId, employees.id))
      .where(and(
        eq(employees.country, countryCodeOrEmployeeId),
        eq(adjustments.effectiveMonth, monthStr),
        inArray(adjustments.status, statuses as any[])
      ));
    return results;
  } else {
    return await db.select().from(adjustments)
      .where(and(
        eq(adjustments.employeeId, countryCodeOrEmployeeId),
        eq(adjustments.effectiveMonth, monthStr),
        inArray(adjustments.status, statuses as any[])
      ));
  }
}

export async function lockSubmittedAdjustments(monthStr: string, countryCode?: string, payrollRunId?: number) {
  const db = await getDb();
  if (!db) return 0;
  // Lock admin_approved adjustments for the given country+month by setting status to 'locked'
  // Optionally link them to a payroll run for rollback tracking
  const conditions = [
    eq(adjustments.effectiveMonth, monthStr),
    eq(adjustments.status, 'admin_approved')
  ];

  if (countryCode) {
    const { employees } = await import('../../../drizzle/schema');
    const empRows = await db.select({ id: employees.id }).from(employees).where(eq(employees.country, countryCode));
    const empIds = empRows.map(e => e.id);
    if (empIds.length === 0) return 0;
    conditions.push(inArray(adjustments.employeeId, empIds));
  }

  const setData: any = { status: 'locked' };
  if (payrollRunId !== undefined) {
    setData.payrollRunId = payrollRunId;
  }

  const result = await db.update(adjustments).set(setData).where(and(...conditions));
  return (result as any).changes || 0;
}

// REIMBURSEMENTS
export async function createReimbursement(data: InsertReimbursement) {
  const db = await getDb();
  if (!db) return;
  return await db.insert(reimbursements).values(data);
}

export interface ListReimbursementsParams {
  page?: number;
  pageSize?: number;
  customerId?: number;
  employeeId?: number;
  status?: string;
  category?: string;
  effectiveMonth?: string;
}

export async function listReimbursements(params: ListReimbursementsParams = {}) {
  const { page = 1, pageSize = 50, customerId, employeeId, status, category, effectiveMonth } = params;
  const db = await getDb();
  if (!db) return { data: [], total: 0 };
  const offset = (page - 1) * pageSize;
  
  const conditions = [];
  if (customerId) conditions.push(eq(reimbursements.customerId, customerId));
  if (employeeId) conditions.push(eq(reimbursements.employeeId, employeeId));
  if (status) conditions.push(eq(reimbursements.status, status as any));
  if (category) conditions.push(eq(reimbursements.category, category as any));
  if (effectiveMonth) conditions.push(eq(reimbursements.effectiveMonth, effectiveMonth));
  
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [data, totalResult] = await Promise.all([
    db.select().from(reimbursements).where(where).limit(pageSize).offset(offset).orderBy(desc(reimbursements.createdAt)),
    db.select({ count: count() }).from(reimbursements).where(where)
  ]);
  
  return { data, total: totalResult[0]?.count || 0 };
}

export async function getReimbursementById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reimbursements).where(eq(reimbursements.id, id)).limit(1);
  return result[0];
}

export async function updateReimbursement(id: number, data: Partial<InsertReimbursement>) {
  const db = await getDb();
  if (!db) return;
  await db.update(reimbursements).set(data).where(eq(reimbursements.id, id));
}

export async function deleteReimbursement(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(reimbursements).where(eq(reimbursements.id, id));
}

// [REMOVED] Credit Note Apply functions — replaced by Wallet-based flow.
// Credit notes are now approved via Release Tasks → Wallet. No direct CN→Invoice apply.

export async function hasDepositBeenProcessed(depositInvoiceId: number) {
  return { processed: false };
}

// VENDORS
export async function createVendor(data: InsertVendor): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(vendors).values(data).returning({ id: vendors.id });
  return result[0]?.id;
}

export async function getVendorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  return result[0];
}

export interface ListVendorsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  country?: string;
  vendorType?: string;
  search?: string;
}

export async function listVendors(params: ListVendorsParams = {}) {
  const { page = 1, pageSize = 50, status, country, vendorType, search } = params;
  const db = await getDb();
  if (!db) return { data: [], total: 0 };
  const offset = (page - 1) * pageSize;
  
  const conditions = [];
  if (status) conditions.push(eq(vendors.status, status as any));
  if (country) conditions.push(eq(vendors.country, country));
  if (vendorType) conditions.push(eq(vendors.vendorType, vendorType as any));
  if (search) conditions.push(like(vendors.name, `%${search}%`));
  
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [data, totalResult] = await Promise.all([
    db.select().from(vendors).where(where).limit(pageSize).offset(offset).orderBy(desc(vendors.createdAt)),
    db.select({ count: count() }).from(vendors).where(where)
  ]);
  
  return { data, total: totalResult[0]?.count || 0 };
}

export async function updateVendor(id: number, data: Partial<InsertVendor>) {
  const db = await getDb();
  if (!db) return;
  await db.update(vendors).set(data).where(eq(vendors.id, id));
}

export async function deleteVendor(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(vendors).where(eq(vendors.id, id));
}

export async function getVendorProfitAnalysis(vendorId: number) {
  const db = await getDb();
  if (!db) return { totalBilled: 0, totalAllocated: 0, totalUnallocated: 0, billCount: 0 };
  const bills = await db.select().from(vendorBills).where(eq(vendorBills.vendorId, vendorId));
  let totalBilled = 0;
  let totalAllocated = 0;
  for (const bill of bills) {
    totalBilled += parseFloat(String(bill.totalAmount || "0"));
    totalAllocated += parseFloat(String(bill.allocatedAmount || "0"));
  }
  return {
    totalBilled: Math.round(totalBilled * 100) / 100,
    totalAllocated: Math.round(totalAllocated * 100) / 100,
    totalUnallocated: Math.round((totalBilled - totalAllocated) * 100) / 100,
    billCount: bills.length,
  };
}

// VENDOR BILLS
export async function createVendorBill(data: InsertVendorBill): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(vendorBills).values(data).returning({ id: vendorBills.id });
  return result[0]?.id;
}

export async function getVendorBillById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(vendorBills).where(eq(vendorBills.id, id)).limit(1);
  return result[0];
}

export interface ListVendorBillsParams {
  page?: number;
  pageSize?: number;
  vendorId?: number;
  status?: string;
  category?: string;
  billMonth?: string;
  search?: string;
}

export async function listVendorBills(params: ListVendorBillsParams = {}) {
  const { page = 1, pageSize = 50, vendorId, status, category, billMonth, search } = params;
  const db = await getDb();
  if (!db) return { data: [], total: 0 };
  const offset = (page - 1) * pageSize;
  
  const conditions = [];
  if (vendorId) conditions.push(eq(vendorBills.vendorId, vendorId));
  if (status) conditions.push(eq(vendorBills.status, status as any));
  if (category) conditions.push(eq(vendorBills.category, category as any));
  if (billMonth) conditions.push(eq(vendorBills.billMonth, billMonth));
  if (search) conditions.push(like(vendorBills.billNumber, `%${search}%`));
  
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [data, totalResult] = await Promise.all([
    db.select().from(vendorBills).where(where).limit(pageSize).offset(offset).orderBy(desc(vendorBills.createdAt)),
    db.select({ count: count() }).from(vendorBills).where(where)
  ]);
  
  return { data, total: totalResult[0]?.count || 0 };
}

export async function updateVendorBill(id: number, data: Partial<InsertVendorBill>) {
  const db = await getDb();
  if (!db) return;
  await db.update(vendorBills).set(data).where(eq(vendorBills.id, id));
}

export async function deleteVendorBill(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(vendorBills).where(eq(vendorBills.id, id));
}

export async function createVendorBillItem(data: InsertVendorBillItem): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(vendorBillItems).values(data).returning({ id: vendorBillItems.id });
  return result[0]?.id;
}

export async function listVendorBillItems(billId?: number) {
  const db = await getDb();
  if (!db) return [];
  const where = billId ? eq(vendorBillItems.vendorBillId, billId) : undefined;
  return await db.select().from(vendorBillItems).where(where);
}

export async function updateVendorBillItem(id: number, data: Partial<InsertVendorBillItem>) {
  const db = await getDb();
  if (!db) return;
  await db.update(vendorBillItems).set(data).where(eq(vendorBillItems.id, id));
}

export async function deleteVendorBillItem(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(vendorBillItems).where(eq(vendorBillItems.id, id));
}

export async function listVendorBillItemsByBill(billId: number) {
  return listVendorBillItems(billId);
}

// BILL ALLOCATIONS
export async function createBillInvoiceAllocation(data: InsertBillInvoiceAllocation): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(billInvoiceAllocations).values(data).returning({ id: billInvoiceAllocations.id });
  return result[0]?.id;
}

export async function getBillInvoiceAllocationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(billInvoiceAllocations).where(eq(billInvoiceAllocations.id, id)).limit(1);
  return result[0];
}

export async function listAllocationsByBill(billId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(billInvoiceAllocations).where(eq(billInvoiceAllocations.vendorBillId, billId));
}

export async function listAllocationsByInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(billInvoiceAllocations).where(eq(billInvoiceAllocations.invoiceId, invoiceId));
}

export async function updateBillInvoiceAllocation(id: number, data: Partial<InsertBillInvoiceAllocation>) {
  const db = await getDb();
  if (!db) return;
  await db.update(billInvoiceAllocations).set(data).where(eq(billInvoiceAllocations.id, id));
}

export async function deleteBillInvoiceAllocation(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(billInvoiceAllocations).where(eq(billInvoiceAllocations.id, id));
}

export async function deleteAllocationsByBill(billId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(billInvoiceAllocations).where(eq(billInvoiceAllocations.vendorBillId, billId));
}

export async function getBillAllocatedTotal(billId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ total: sum(billInvoiceAllocations.allocatedAmount) })
    .from(billInvoiceAllocations)
    .where(eq(billInvoiceAllocations.vendorBillId, billId));
  return parseFloat(String(result[0]?.total || "0"));
}

export async function getInvoiceCostAllocatedTotal(invoiceId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ total: sum(billInvoiceAllocations.allocatedAmount) })
    .from(billInvoiceAllocations)
    .where(eq(billInvoiceAllocations.invoiceId, invoiceId));
  return parseFloat(String(result[0]?.total || "0"));
}

export async function recalcBillAllocation(billId: number) {
  const db = await getDb();
  if (!db) return;
  const allocated = await getBillAllocatedTotal(billId);
  const bill = await getVendorBillById(billId);
  if (!bill) return;
  const totalAmount = parseFloat(String(bill.totalAmount));
  const unallocated = Math.max(0, totalAmount - allocated);
  await db.update(vendorBills).set({
    allocatedAmount: String(allocated),
    unallocatedAmount: String(unallocated),
  }).where(eq(vendorBills.id, billId));
}
export async function recalcInvoiceCostAllocation(invoiceId: number) {
  const db = await getDb();
  if (!db) return;
  const costAllocated = await getInvoiceCostAllocatedTotal(invoiceId);
  await db.update(invoices).set({
    costAllocated: String(costAllocated),
  }).where(eq(invoices.id, invoiceId));
}
export async function listDetailedAllocationsByBill(billId: number) {
  const db = await getDb();
  if (!db) return [];
  const { employees, invoices: inv, vendorBillItems: vbi } = await import("../../../drizzle/schema");
  const rows = await db
    .select({
      id: billInvoiceAllocations.id,
      vendorBillId: billInvoiceAllocations.vendorBillId,
      vendorBillItemId: billInvoiceAllocations.vendorBillItemId,
      invoiceId: billInvoiceAllocations.invoiceId,
      employeeId: billInvoiceAllocations.employeeId,
      allocatedAmount: billInvoiceAllocations.allocatedAmount,
      description: billInvoiceAllocations.description,
      allocatedBy: billInvoiceAllocations.allocatedBy,
      createdAt: billInvoiceAllocations.createdAt,
      employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      employeeCode: employees.employeeCode,
      invoiceNumber: inv.invoiceNumber,
      invoiceTotal: inv.total,
      invoiceCurrency: inv.currency,
    })
    .from(billInvoiceAllocations)
    .leftJoin(employees, eq(billInvoiceAllocations.employeeId, employees.id))
    .leftJoin(inv, eq(billInvoiceAllocations.invoiceId, inv.id))
    .where(eq(billInvoiceAllocations.vendorBillId, billId))
    .orderBy(desc(billInvoiceAllocations.createdAt));
  return rows;
}
export async function listDetailedAllocationsByInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  const { employees, vendorBills: vb } = await import("../../../drizzle/schema");
  const rows = await db
    .select({
      id: billInvoiceAllocations.id,
      vendorBillId: billInvoiceAllocations.vendorBillId,
      vendorBillItemId: billInvoiceAllocations.vendorBillItemId,
      invoiceId: billInvoiceAllocations.invoiceId,
      employeeId: billInvoiceAllocations.employeeId,
      allocatedAmount: billInvoiceAllocations.allocatedAmount,
      description: billInvoiceAllocations.description,
      allocatedBy: billInvoiceAllocations.allocatedBy,
      createdAt: billInvoiceAllocations.createdAt,
      employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      employeeCode: employees.employeeCode,
      billNumber: vb.billNumber,
      billTotal: vb.totalAmount,
      billCurrency: vb.currency,
      vendorId: vb.vendorId,
    })
    .from(billInvoiceAllocations)
    .leftJoin(employees, eq(billInvoiceAllocations.employeeId, employees.id))
    .leftJoin(vb, eq(billInvoiceAllocations.vendorBillId, vb.id))
    .where(eq(billInvoiceAllocations.invoiceId, invoiceId))
    .orderBy(desc(billInvoiceAllocations.createdAt));
  return rows;
}

// ── REIMBURSEMENT PAYROLL INTEGRATION ──
// Added as part of unified approval flow: Reimbursement auto-lock and payroll integration

/**
 * Get admin_approved reimbursements for payroll calculation.
 * Mirrors getSubmittedAdjustmentsForPayroll pattern.
 *
 * @param countryCodeOrEmployeeId - Country code (string) for batch, or employee ID (number) for single
 * @param monthStr - Effective month in YYYY-MM-01 format
 * @param statuses - Statuses to include (default: ['admin_approved'])
 */
export async function getSubmittedReimbursementsForPayroll(
  countryCodeOrEmployeeId: string | number,
  monthStr: string,
  statuses: string[] = ['admin_approved']
) {
  const db = await getDb();
  if (!db) return [];

  if (typeof countryCodeOrEmployeeId === 'string') {
    const { employees } = await import('../../../drizzle/schema');
    const results = await db.select({
      id: reimbursements.id,
      employeeId: reimbursements.employeeId,
      customerId: reimbursements.customerId,
      category: reimbursements.category,
      description: reimbursements.description,
      amount: reimbursements.amount,
      currency: reimbursements.currency,
      status: reimbursements.status,
      effectiveMonth: reimbursements.effectiveMonth,
      payrollRunId: reimbursements.payrollRunId,
      createdAt: reimbursements.createdAt,
    }).from(reimbursements)
      .innerJoin(employees, eq(reimbursements.employeeId, employees.id))
      .where(and(
        eq(employees.country, countryCodeOrEmployeeId),
        eq(reimbursements.effectiveMonth, monthStr),
        inArray(reimbursements.status, statuses as any[])
      ));
    return results;
  } else {
    return await db.select().from(reimbursements)
      .where(and(
        eq(reimbursements.employeeId, countryCodeOrEmployeeId),
        eq(reimbursements.effectiveMonth, monthStr),
        inArray(reimbursements.status, statuses as any[])
      ));
  }
}

/**
 * Lock admin_approved reimbursements for a given month (and optionally country).
 * Mirrors lockSubmittedAdjustments pattern.
 * Called by the monthly auto-lock cron job on the 5th.
 *
 * @param monthStr - Effective month in YYYY-MM-01 format
 * @param countryCode - Optional country code to scope the lock
 * @returns Number of records locked
 */
export async function lockSubmittedReimbursements(monthStr: string, countryCode?: string, payrollRunId?: number) {
  const db = await getDb();
  if (!db) return 0;

  const conditions: any[] = [
    eq(reimbursements.effectiveMonth, monthStr),
    eq(reimbursements.status, 'admin_approved' as any)
  ];

  if (countryCode) {
    const { employees } = await import('../../../drizzle/schema');
    const empRows = await db.select({ id: employees.id }).from(employees).where(eq(employees.country, countryCode));
    const empIds = empRows.map(e => e.id);
    if (empIds.length === 0) return 0;
    conditions.push(inArray(reimbursements.employeeId, empIds));
  }

  const setData: any = { status: 'locked' };
  if (payrollRunId !== undefined) {
    setData.payrollRunId = payrollRunId;
  }

  const result = await db.update(reimbursements).set(setData).where(and(...conditions));
  return (result as any).changes || 0;
}

// ── EMPLOYEE MONTHLY REVENUE (for Vendor Bill allocation ceiling) ──

/**
 * Get the total revenue (income) for a specific employee in a given month.
 * This sums all invoiceItems linked to the employee for invoices in that month,
 * excluding deposit-type items (deposits are balance sheet items, not P&L).
 *
 * @param employeeId - The employee ID
 * @param serviceMonth - The month in YYYY-MM format
 * @returns Object with total revenue breakdown by itemType
 */
export async function getEmployeeMonthlyRevenue(employeeId: number, serviceMonth: string) {
  const db = await getDb();
  if (!db) return { total: 0, breakdown: [] };

  // Find all invoices for this month (excluding credit_note and deposit_refund)
  const { ne } = await import("drizzle-orm");
  const monthInvoices = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        sql`strftime('%Y-%m', ${invoices.invoiceMonth}) = ${serviceMonth}`,
        ne(invoices.invoiceType, "credit_note"),
        ne(invoices.invoiceType, "deposit_refund"),
      )
    );

  if (monthInvoices.length === 0) return { total: 0, breakdown: [] };

  const invoiceIds = monthInvoices.map((i) => i.id);

  // Get all invoice items for this employee in these invoices, excluding deposit items
  const items = await db
    .select({
      itemType: invoiceItems.itemType,
      amount: invoiceItems.amount,
      invoiceId: invoiceItems.invoiceId,
    })
    .from(invoiceItems)
    .where(
      and(
        eq(invoiceItems.employeeId, employeeId),
        inArray(invoiceItems.invoiceId, invoiceIds),
        ne(invoiceItems.itemType, "deposit"),
      )
    );

  // Calculate breakdown by itemType
  const breakdownMap: Record<string, number> = {};
  let total = 0;
  for (const item of items) {
    const amount = parseFloat(String(item.amount || "0"));
    total += amount;
    const type = item.itemType || "other";
    breakdownMap[type] = (breakdownMap[type] || 0) + amount;
  }

  const breakdown = Object.entries(breakdownMap).map(([itemType, amount]) => ({
    itemType,
    amount: Math.round(amount * 100) / 100,
  }));

  return {
    total: Math.round(total * 100) / 100,
    breakdown,
  };
}

/**
 * Get monthly revenue for ALL employees in a given month.
 * Used by the allocation UI to show revenue ceilings for each employee.
 *
 * @param serviceMonth - The month in YYYY-MM format
 * @returns Array of { employeeId, employeeName, employeeCode, customerId, total, breakdown }
 */
export async function getAllEmployeesMonthlyRevenue(serviceMonth: string) {
  const db = await getDb();
  if (!db) return [];

  const { employees, customers } = await import("../../../drizzle/schema");
  const { ne } = await import("drizzle-orm");

  // Find all invoices for this month (excluding credit_note and deposit_refund)
  const monthInvoices = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        sql`strftime('%Y-%m', ${invoices.invoiceMonth}) = ${serviceMonth}`,
        ne(invoices.invoiceType, "credit_note"),
        ne(invoices.invoiceType, "deposit_refund"),
      )
    );

  if (monthInvoices.length === 0) return [];

  const invoiceIds = monthInvoices.map((i) => i.id);

  // Get all invoice items with employee info for these invoices, excluding deposits
  const items = await db
    .select({
      employeeId: invoiceItems.employeeId,
      itemType: invoiceItems.itemType,
      amount: invoiceItems.amount,
    })
    .from(invoiceItems)
    .where(
      and(
        inArray(invoiceItems.invoiceId, invoiceIds),
        ne(invoiceItems.itemType, "deposit"),
      )
    );

  // Group by employee
  const empMap: Record<number, { total: number; breakdown: Record<string, number> }> = {};
  for (const item of items) {
    if (!item.employeeId) continue;
    if (!empMap[item.employeeId]) {
      empMap[item.employeeId] = { total: 0, breakdown: {} };
    }
    const amount = parseFloat(String(item.amount || "0"));
    empMap[item.employeeId].total += amount;
    const type = item.itemType || "other";
    empMap[item.employeeId].breakdown[type] = (empMap[item.employeeId].breakdown[type] || 0) + amount;
  }

  // Enrich with employee info
  const empIds = Object.keys(empMap).map(Number);
  if (empIds.length === 0) return [];

  const empRows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      customerId: employees.customerId,
      country: employees.country,
    })
    .from(employees)
    .where(inArray(employees.id, empIds));

  // Get customer names
  const customerIds = Array.from(new Set(empRows.map((e) => e.customerId)));
  const custRows = customerIds.length > 0
    ? await db
        .select({ id: customers.id, companyName: customers.companyName })
        .from(customers)
        .where(inArray(customers.id, customerIds))
    : [];
  const custMap: Record<number, string> = {};
  for (const c of custRows) {
    custMap[c.id] = c.companyName;
  }

  return empRows.map((emp) => {
    const data = empMap[emp.id];
    return {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      customerId: emp.customerId,
      customerName: custMap[emp.customerId] || "Unknown",
      country: emp.country,
      total: Math.round(data.total * 100) / 100,
      breakdown: Object.entries(data.breakdown).map(([itemType, amount]) => ({
        itemType,
        amount: Math.round(amount * 100) / 100,
      })),
    };
  });
}
