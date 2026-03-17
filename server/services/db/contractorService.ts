
import { eq, like, count, desc, and, or, getTableColumns, sql, isNull, inArray } from "drizzle-orm";
import { 
  contractors, InsertContractor,
  customers,
  users,
  contractorMilestones, InsertContractorMilestone,
  contractorAdjustments, InsertContractorAdjustment,
  contractorInvoices, InsertContractorInvoice,
  contractorInvoiceItems
} from "../../../drizzle/schema";
import { getDb } from "./connection";

// Helper for payment date
function calculateNextPaymentDate(contractor: any): string | null {
  if (contractor.status !== "active") return null;
  if (contractor.paymentFrequency === "fixed") return null; // Milestones driven

  const today = new Date();
  if (contractor.paymentFrequency === "monthly") {
    // Return last day of current month
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return lastDay.toISOString().split("T")[0];
  }
  // Add other frequencies as needed
  return null;
}

// CONTRACTORS
export async function createContractor(data: InsertContractor) {
  const db = await getDb();
  if (!db) return [];
  return await db.insert(contractors).values(data).returning();
}

export async function getContractorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select({
    ...getTableColumns(contractors),
    defaultApproverName: users.name,
    customerName: customers.companyName,
  })
  .from(contractors)
  .leftJoin(users, eq(contractors.defaultApproverId, users.id))
  .leftJoin(customers, eq(contractors.customerId, customers.id))
  .where(eq(contractors.id, id))
  .limit(1);

  if (result.length === 0) return undefined;
  
  const contractor = result[0];
  const nextPaymentDate = calculateNextPaymentDate(contractor);
  
  return { ...contractor, nextPaymentDate };
}

export async function listContractors(
  filters: {
    customerId?: number;
    status?: string;
    search?: string;
    channelPartnerId?: number | null; // Filter by CP via customer's channelPartnerId
  },
  limit: number = 50,
  offset: number = 0
) {
  const db = await getDb();
  if (!db) return { data: [], total: 0 };

  const conditions = [];
  if (filters.customerId) conditions.push(eq(contractors.customerId, filters.customerId));
  if (filters.status) conditions.push(eq(contractors.status, filters.status as any));
  
  if (filters.search) {
    conditions.push(or(
      like(contractors.firstName, `%${filters.search}%`),
      like(contractors.lastName, `%${filters.search}%`),
      like(contractors.email, `%${filters.search}%`),
      like(contractors.contractorCode, `%${filters.search}%`)
    ));
  }
  // Filter by CP via the customer's channelPartnerId
  if (filters.channelPartnerId !== undefined) {
    if (filters.channelPartnerId === null) {
      conditions.push(isNull(customers.channelPartnerId));
    } else {
      conditions.push(eq(customers.channelPartnerId, filters.channelPartnerId));
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, totalResult] = await Promise.all([
    db.select({
      id: contractors.id,
      contractorCode: contractors.contractorCode,
      firstName: contractors.firstName,
      lastName: contractors.lastName,
      email: contractors.email,
      country: contractors.country,
      status: contractors.status,
      jobTitle: contractors.jobTitle,
      startDate: contractors.startDate,
      customerId: contractors.customerId,
      customerName: customers.companyName,
      paymentFrequency: contractors.paymentFrequency,
    })
    .from(contractors)
    .leftJoin(customers, eq(contractors.customerId, customers.id))
    .where(where)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(contractors.createdAt)),
    
    db.select({ count: count() }).from(contractors).where(where)
  ]);

  return { data, total: totalResult[0]?.count || 0 };
}

export async function updateContractor(id: number, data: Partial<InsertContractor>) {
  const db = await getDb();
  if (!db) return;
  await db.update(contractors).set(data).where(eq(contractors.id, id));
}

// MILESTONES
export async function listContractorMilestones(contractorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({
    ...getTableColumns(contractorMilestones),
    approverName: users.name
  })
  .from(contractorMilestones)
  .leftJoin(users, eq(contractorMilestones.adminApprovedBy, users.id))
  .where(eq(contractorMilestones.contractorId, contractorId))
  .orderBy(desc(contractorMilestones.createdAt));
}

export async function listAllContractorMilestones(filters: { customerId?: number, status?: string, search?: string } = {}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (filters.customerId) {
    conditions.push(eq(contractors.customerId, filters.customerId));
  }
  if (filters.status) {
    conditions.push(eq(contractorMilestones.status, filters.status as any));
  }
  if (filters.search) {
     conditions.push(or(
      like(contractorMilestones.title, `%${filters.search}%`),
      like(contractors.firstName, `%${filters.search}%`),
      like(contractors.lastName, `%${filters.search}%`)
    ));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return await db.select({
      ...getTableColumns(contractorMilestones),
      contractorFirstName: contractors.firstName,
      contractorLastName: contractors.lastName,
      customerId: contractors.customerId,
      customerName: customers.companyName,
      currency: contractors.currency
    })
    .from(contractorMilestones)
    .leftJoin(contractors, eq(contractorMilestones.contractorId, contractors.id))
    .leftJoin(customers, eq(contractors.customerId, customers.id))
    .where(where)
    .orderBy(desc(contractorMilestones.createdAt));
}

export async function createContractorMilestone(data: InsertContractorMilestone) {
  const db = await getDb();
  if (!db) return;
  return await db.insert(contractorMilestones).values(data).returning();
}

export async function updateContractorMilestone(id: number, data: Partial<InsertContractorMilestone>) {
  const db = await getDb();
  if (!db) return;
  await db.update(contractorMilestones).set(data).where(eq(contractorMilestones.id, id));
}

export async function deleteContractorMilestone(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(contractorMilestones).where(eq(contractorMilestones.id, id));
}

// ADJUSTMENTS
export async function listContractorAdjustments(contractorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(contractorAdjustments)
    .where(eq(contractorAdjustments.contractorId, contractorId))
    .orderBy(desc(contractorAdjustments.createdAt));
}

export async function listAllContractorAdjustments(filters: { customerId?: number, status?: string, search?: string } = {}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (filters.customerId) {
    conditions.push(eq(contractors.customerId, filters.customerId));
  }
  if (filters.status) {
    conditions.push(eq(contractorAdjustments.status, filters.status as any));
  }
  if (filters.search) {
     conditions.push(or(
      like(contractorAdjustments.description, `%${filters.search}%`),
      like(contractors.firstName, `%${filters.search}%`),
      like(contractors.lastName, `%${filters.search}%`)
    ));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return await db.select({
      ...getTableColumns(contractorAdjustments),
      contractorFirstName: contractors.firstName,
      contractorLastName: contractors.lastName,
      customerId: contractors.customerId,
      customerName: customers.companyName
    })
    .from(contractorAdjustments)
    .leftJoin(contractors, eq(contractorAdjustments.contractorId, contractors.id))
    .leftJoin(customers, eq(contractors.customerId, customers.id))
    .where(where)
    .orderBy(desc(contractorAdjustments.createdAt));
}

export async function createContractorAdjustment(data: InsertContractorAdjustment) {
  const db = await getDb();
  if (!db) return;
  return await db.insert(contractorAdjustments).values(data).returning();
}

export async function updateContractorAdjustment(id: number, data: Partial<InsertContractorAdjustment>) {
  const db = await getDb();
  if (!db) return;
  await db.update(contractorAdjustments).set(data).where(eq(contractorAdjustments.id, id));
}

export async function deleteContractorAdjustment(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(contractorAdjustments).where(eq(contractorAdjustments.id, id));
}

// INVOICES
export async function listContractorInvoices(contractorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(contractorInvoices)
    .where(eq(contractorInvoices.contractorId, contractorId))
    .orderBy(desc(contractorInvoices.createdAt));
}

export async function listAllContractorInvoices(
  filters: { customerId?: number; status?: string; search?: string } = {},
  limit: number = 50,
  offset: number = 0
) {
  const db = await getDb();
  if (!db) return { data: [], total: 0 };

  const conditions = [];
  if (filters.customerId) conditions.push(eq(contractorInvoices.customerId, filters.customerId));
  if (filters.status) conditions.push(eq(contractorInvoices.status, filters.status as any));
  if (filters.search) {
     conditions.push(or(
      like(contractorInvoices.invoiceNumber, `%${filters.search}%`),
      like(contractors.firstName, `%${filters.search}%`),
      like(contractors.lastName, `%${filters.search}%`)
    ));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, totalResult] = await Promise.all([
    db.select({
      id: contractorInvoices.id,
      invoiceNumber: contractorInvoices.invoiceNumber,
      contractorId: contractorInvoices.contractorId,
      customerId: contractorInvoices.customerId,
      customerName: customers.companyName,
      contractorName: sql<string>`${contractors.firstName} || ' ' || ${contractors.lastName}`,
      status: contractorInvoices.status,
      periodStart: contractorInvoices.periodStart,
      periodEnd: contractorInvoices.periodEnd,
      totalAmount: contractorInvoices.totalAmount,
      currency: contractorInvoices.currency,
      createdAt: contractorInvoices.createdAt,
    })
    .from(contractorInvoices)
    .leftJoin(contractors, eq(contractorInvoices.contractorId, contractors.id))
    .leftJoin(customers, eq(contractorInvoices.customerId, customers.id))
    .where(where)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(contractorInvoices.createdAt)),

    db.select({ count: count() })
      .from(contractorInvoices)
      .leftJoin(contractors, eq(contractorInvoices.contractorId, contractors.id))
      .where(where)
  ]);

  return { data, total: totalResult[0]?.count || 0 };
}

export async function getContractorInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select({
    ...getTableColumns(contractorInvoices),
    customerName: customers.companyName,
    contractorName: contractors.firstName, // Just for display
  })
  .from(contractorInvoices)
  .leftJoin(customers, eq(contractorInvoices.customerId, customers.id))
  .leftJoin(contractors, eq(contractorInvoices.contractorId, contractors.id))
  .where(eq(contractorInvoices.id, id))
  .limit(1);

  if (result.length === 0) return undefined;
  
  // Fetch line items
  const items = await db.select().from(contractorInvoiceItems)
    .where(eq(contractorInvoiceItems.invoiceId, id));
    
  return { ...result[0], items };
}

// ============================================================================
// AOR AUTO-LOCK FUNCTIONS (Called by cronJobs.ts runAutoLock)
// ============================================================================

/**
 * Lock all admin_approved contractor adjustments for a given effective month.
 * Mirrors the EOR lockSubmittedAdjustments pattern.
 * Only locks items where invoiceId IS NULL (not yet included in a contractor invoice).
 * @param monthStr - Effective month in YYYY-MM-01 format
 * @returns Number of adjustments locked
 */
export async function lockContractorAdjustments(monthStr: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const conditions = [
    eq(contractorAdjustments.effectiveMonth, monthStr),
    eq(contractorAdjustments.status, 'admin_approved' as any),
    isNull(contractorAdjustments.invoiceId),
  ];

  const result = await db.update(contractorAdjustments)
    .set({ status: 'locked' as any })
    .where(and(...conditions));

  return (result as any).changes || 0;
}

/**
 * Lock all admin_approved contractor milestones for a given effective month.
 * Mirrors the EOR lockSubmittedAdjustments pattern with AOR-specific milestone workflow.
 * Only locks items where invoiceId IS NULL (not yet included in a contractor invoice).
 * @param monthStr - Effective month in YYYY-MM-01 format
 * @returns Number of milestones locked
 */
export async function lockContractorMilestones(monthStr: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const conditions = [
    eq(contractorMilestones.effectiveMonth, monthStr),
    eq(contractorMilestones.status, 'admin_approved' as any),
    isNull(contractorMilestones.invoiceId),
  ];

  const result = await db.update(contractorMilestones)
    .set({ status: 'locked' as any })
    .where(and(...conditions));

  return (result as any).changes || 0;
}

/**
 * Get all locked contractor adjustments for a given month that haven't been invoiced yet.
 * Used by the contractor invoice generation process.
 * @param monthStr - Effective month in YYYY-MM-01 format
 * @returns Array of locked, uninvoiced contractor adjustments
 */
export async function getLockedContractorAdjustments(monthStr: string) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    ...getTableColumns(contractorAdjustments),
    contractorFirstName: contractors.firstName,
    contractorLastName: contractors.lastName,
    contractorCurrency: contractors.currency,
    contractorPaymentFrequency: contractors.paymentFrequency,
    customerId: contractors.customerId,
  })
  .from(contractorAdjustments)
  .innerJoin(contractors, eq(contractorAdjustments.contractorId, contractors.id))
  .where(
    and(
      eq(contractorAdjustments.effectiveMonth, monthStr),
      eq(contractorAdjustments.status, 'locked' as any),
      isNull(contractorAdjustments.invoiceId)
    )
  );
}

/**
 * Get all locked contractor milestones for a given month that haven't been invoiced yet.
 * Used by the contractor invoice generation process.
 * @param monthStr - Effective month in YYYY-MM-01 format
 * @returns Array of locked, uninvoiced contractor milestones
 */
export async function getLockedContractorMilestones(monthStr: string) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    ...getTableColumns(contractorMilestones),
    contractorFirstName: contractors.firstName,
    contractorLastName: contractors.lastName,
    contractorCurrency: contractors.currency,
    contractorPaymentFrequency: contractors.paymentFrequency,
    customerId: contractors.customerId,
  })
  .from(contractorMilestones)
  .innerJoin(contractors, eq(contractorMilestones.contractorId, contractors.id))
  .where(
    and(
      eq(contractorMilestones.effectiveMonth, monthStr),
      eq(contractorMilestones.status, 'locked' as any),
      isNull(contractorMilestones.invoiceId)
    )
  );
}

/**
 * Get all active contractors for a given payment frequency.
 * Used by the contractor invoice auto-creation process.
 * @param paymentFrequency - 'monthly' | 'semi_monthly' | 'milestone'
 * @returns Array of active contractors with the specified payment frequency
 */
export async function getActiveContractorsByFrequency(paymentFrequency: string) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    ...getTableColumns(contractors),
    customerName: customers.companyName,
  })
  .from(contractors)
  .leftJoin(customers, eq(contractors.customerId, customers.id))
  .where(
    and(
      eq(contractors.status, 'active'),
      eq(contractors.paymentFrequency, paymentFrequency as any)
    )
  );
}

/**
 * Update contractor invoices' status to 'paid' when the associated client invoice is paid.
 * This is the AOR "collect first, pay later" business closure.
 * @param clientInvoiceId - The client invoice ID that was just paid
 * @returns Number of contractor invoices updated to 'paid'
 */
export async function markContractorInvoicesPaidByClientInvoice(clientInvoiceId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.update(contractorInvoices)
    .set({ status: 'paid' as any })
    .where(
      and(
        eq(contractorInvoices.clientInvoiceId, clientInvoiceId),
        eq(contractorInvoices.status, 'approved' as any)
      )
    );

  return (result as any).changes || 0;
}
