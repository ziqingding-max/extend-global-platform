/**
 * Invoice Number Service
 * Generates sequential invoice numbers per billing entity per month.
 * Format: {invoicePrefix}{YYYYMM}-{sequence} or INV-{YYYYMM}-{sequence}
 */
import { eq, and, like, sql } from "drizzle-orm";
import { getDb, getBillingEntityById } from "../db";
import { billingEntities, invoices } from "../../drizzle/schema";

/**
 * Generate the next invoice number for a given billing entity and month.
 * Uses the billing entity's invoicePrefix if available, otherwise "INV-".
 * Sequence is auto-incremented per billing entity per month.
 */
export async function generateInvoiceNumber(
  billingEntityId: number | null | undefined,
  invoiceMonth: Date | string
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Determine the YYYYMM portion
  let yearMonth: string;
  if (typeof invoiceMonth === "string") {
    yearMonth = invoiceMonth.slice(0, 7).replace("-", "");
  } else {
    yearMonth = invoiceMonth.toISOString().slice(0, 7).replace("-", "");
  }

  // Get billing entity prefix
  let prefix = "INV-";
  if (billingEntityId) {
    const be = await getBillingEntityById(billingEntityId);
    if (be?.invoicePrefix) {
      prefix = be.invoicePrefix;
      // Ensure prefix ends with a separator if it doesn't already
      if (!prefix.endsWith("-") && !prefix.endsWith("_")) {
        prefix += "-";
      }
    }
  }

  // Find the highest existing sequence number for this prefix+month pattern
  const pattern = `${prefix}${yearMonth}-%`;
  const existing = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(like(invoices.invoiceNumber, pattern));

  let maxSeq = 0;
  for (const row of existing) {
    // Extract sequence from the end: PREFIX-YYYYMM-NNN
    const parts = row.invoiceNumber.split("-");
    const lastPart = parts[parts.length - 1];
    const seq = parseInt(lastPart, 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  const nextSeq = maxSeq + 1;
  const seqStr = nextSeq.toString().padStart(3, "0");
  return `${prefix}${yearMonth}-${seqStr}`;
}

/**
 * Generate invoice number for deposit invoices.
 * Uses the same sequential system but with a DEP- prefix variant.
 */
export async function generateDepositInvoiceNumber(
  billingEntityId: number | null | undefined,
  date?: Date
): Promise<string> {
  const d = date || new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get billing entity prefix
  let prefix = "DEP-";
  if (billingEntityId) {
    const be = await getBillingEntityById(billingEntityId);
    if (be?.invoicePrefix) {
      prefix = be.invoicePrefix.replace(/-$/, "") + "-DEP-";
    }
  }

  // Find the highest existing sequence number for this prefix+month pattern
  const pattern = `${prefix}${yearMonth}-%`;
  const existing = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(like(invoices.invoiceNumber, pattern));

  let maxSeq = 0;
  for (const row of existing) {
    const parts = row.invoiceNumber.split("-");
    const lastPart = parts[parts.length - 1];
    const seq = parseInt(lastPart, 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  const nextSeq = maxSeq + 1;
  const seqStr = nextSeq.toString().padStart(3, "0");
  return `${prefix}${yearMonth}-${seqStr}`;
}
