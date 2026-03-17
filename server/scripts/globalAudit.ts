
import "dotenv/config";
import { count, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  countriesConfig,
  employees,
  quotations,
  invoices,
  invoiceItems,
} from "../../drizzle/schema";

async function runAudit() {
  const db = await getDb();
  if (!db) {
    console.error("Failed to connect to database");
    process.exit(1);
  }

  console.log("Starting Global Audit...");
  console.log("--------------------------------------------------");

  // 1. Count Active Countries
  const activeCountriesResult = await db
    .select({ count: count() })
    .from(countriesConfig)
    .where(eq(countriesConfig.isActive, true));
  const activeCountries = activeCountriesResult[0]?.count || 0;
  console.log(`Active Countries: ${activeCountries}`);

  // 2. Count Total Employees
  const employeesResult = await db.select({ count: count() }).from(employees);
  const totalEmployees = employeesResult[0]?.count || 0;
  console.log(`Total Employees: ${totalEmployees}`);

  // 3. Count Total Quotations
  const quotationsResult = await db.select({ count: count() }).from(quotations);
  const totalQuotations = quotationsResult[0]?.count || 0;
  console.log(`Total Quotations: ${totalQuotations}`);

  // 4. Count Total Invoices
  const invoicesResult = await db.select({ count: count() }).from(invoices);
  const totalInvoices = invoicesResult[0]?.count || 0;
  console.log(`Total Invoices: ${totalInvoices}`);

  // 5. Check for Orphaned Invoice Items
  // Find invoice items where invoiceId does not exist in invoices table
  const orphanedInvoiceItems = await db
    .select({
      itemId: invoiceItems.id,
      invoiceId: invoiceItems.invoiceId,
      description: invoiceItems.description,
    })
    .from(invoiceItems)
    .leftJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .where(isNull(invoices.id));

  console.log(`Orphaned Invoice Items: ${orphanedInvoiceItems.length}`);
  if (orphanedInvoiceItems.length > 0) {
    console.log("Details of orphaned items (first 5):");
    orphanedInvoiceItems.slice(0, 5).forEach((item) => {
      console.log(`  - ID: ${item.itemId}, InvoiceID: ${item.invoiceId}, Desc: ${item.description}`);
    });
  }

  console.log("--------------------------------------------------");
  console.log("Audit Completed.");
}

runAudit().catch((err) => {
  console.error("Error running audit:", err);
  process.exit(1);
});
