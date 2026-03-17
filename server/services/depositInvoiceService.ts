/**
 * Deposit Invoice Service
 * Auto-generates a deposit invoice when an employee transitions to "onboarding" status.
 * Deposit = (baseSalary + estimatedEmployerCost) × customer.depositMultiplier
 */
import { eq, and } from "drizzle-orm";
import { getDb, getEmployeeById, getCustomerById, getBillingEntityById } from "../db";
import { invoices, invoiceItems, InsertInvoice, InsertInvoiceItem } from "../../drizzle/schema";
import { generateDepositInvoiceNumber } from "./invoiceNumberService";
import { getExchangeRate } from "./exchangeRateService";

/**
 * Check if a deposit invoice already exists for an employee.
 * Prevents duplicate deposit invoices.
 */
export async function hasDepositInvoice(employeeId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Find all deposit invoices for this employee
  const existing = await db
    .select({ id: invoiceItems.id, invoiceId: invoiceItems.invoiceId, status: invoices.status })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .where(
      and(
        eq(invoiceItems.employeeId, employeeId),
        eq(invoiceItems.itemType, "deposit"),
        eq(invoices.invoiceType, "deposit")
      )
    )
    .limit(10);

  // Filter out cancelled deposits
  const activeDeposits = existing.filter(
    (row) => row.status !== "cancelled"
  );

  if (activeDeposits.length === 0) return false;

  // For each active deposit, check if it has been processed (refund or credit note)
  // If ALL active deposits have been processed, return false (allow new deposit)
  for (const deposit of activeDeposits) {
    // Check for deposit_refund linked to this deposit
    const refunds = await db
      .select({ id: invoices.id, status: invoices.status })
      .from(invoices)
      .where(
        and(
          eq(invoices.relatedInvoiceId, deposit.invoiceId),
          eq(invoices.invoiceType, "deposit_refund")
        )
      );
    const hasActiveRefund = refunds.some(
      (r) => r.status !== "cancelled"
    );
    if (hasActiveRefund) continue; // This deposit was refunded, check next

    // Check for credit_note linked to this deposit
    const creditNotes = await db
      .select({ id: invoices.id, status: invoices.status })
      .from(invoices)
      .where(
        and(
          eq(invoices.relatedInvoiceId, deposit.invoiceId),
          eq(invoices.invoiceType, "credit_note")
        )
      );
    const hasActiveCreditNote = creditNotes.some(
      (cn) => cn.status !== "cancelled"
    );
    if (hasActiveCreditNote) continue; // This deposit was credited, check next

    // This deposit has NOT been processed — it's still active
    return true;
  }

  // All deposits have been processed (refunded or credited)
  return false;
}

/**
 * Generate a deposit invoice for an employee.
 * Called when employee status transitions to "onboarding".
 *
 * @returns The created invoice ID, or null if skipped (already exists or error)
 */
export async function generateDepositInvoice(
  employeeId: number
): Promise<{ invoiceId: number | null; message: string }> {
  const db = await getDb();
  if (!db) return { invoiceId: null, message: "Database not available" };

  try {
    // 1. Check for duplicate
    const exists = await hasDepositInvoice(employeeId);
    if (exists) {
      return { invoiceId: null, message: "Deposit invoice already exists for this employee" };
    }

    // 2. Get employee data
    const employee = await getEmployeeById(employeeId);
    if (!employee) {
      return { invoiceId: null, message: "Employee not found" };
    }

    // 3. Get customer data
    const customer = await getCustomerById(employee.customerId);
    if (!customer) {
      return { invoiceId: null, message: "Customer not found" };
    }

    // 4. Calculate deposit amount
    const baseSalary = parseFloat(employee.baseSalary?.toString() ?? "0");
    const estimatedEmployerCost = parseFloat(employee.estimatedEmployerCost?.toString() ?? "0");
    const monthlyTotal = baseSalary + estimatedEmployerCost;
    const depositMultiplier = customer.depositMultiplier || 2;
    let depositAmount = monthlyTotal * depositMultiplier;

    // 5. Handle currency conversion if needed
    const employeeCurrency = employee.salaryCurrency || "USD";
    const settlementCurrency = customer.settlementCurrency || "USD";
    let exchangeRate = 1;
    let exchangeRateWithMarkup = 1;
    let localAmount = depositAmount;

    if (employeeCurrency !== settlementCurrency) {
      const rateData = await getExchangeRate(employeeCurrency, settlementCurrency);
      if (rateData) {
        exchangeRate = rateData.rate;
        exchangeRateWithMarkup = rateData.rateWithMarkup;
        localAmount = depositAmount; // Amount in employee's currency
        depositAmount = depositAmount * exchangeRateWithMarkup; // Convert to settlement currency
      }
    }

    // 6. Generate invoice number
    const billingEntityId = customer.billingEntityId || null;
    const invoiceNumber = await generateDepositInvoiceNumber(billingEntityId);

    // 7. Deposit invoice: Due Date = Employee Start Date - 1 day
    let dueDate: Date;
    let invoiceMonthStr: string;
    
    if (employee.startDate) {
      dueDate = new Date(employee.startDate);
      dueDate.setDate(dueDate.getDate() - 1);
      // Invoice month = Month of Start Date (YYYY-MM-01)
      invoiceMonthStr = employee.startDate.substring(0, 7) + "-01";
    } else {
      // Fallback: 30 days from now if no start date
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      // Fallback month: Current month
      invoiceMonthStr = new Date().toISOString().substring(0, 7) + "-01";
    }

    // 8. Create invoice
    const invoiceData: InsertInvoice = {
      customerId: employee.customerId,
      billingEntityId,
      invoiceNumber,
      invoiceType: "deposit",
      invoiceMonth: invoiceMonthStr,
      currency: settlementCurrency,
      exchangeRate: exchangeRate.toFixed(6),
      exchangeRateWithMarkup: exchangeRateWithMarkup.toFixed(6),
      subtotal: depositAmount.toFixed(2),
      serviceFeeTotal: "0",
      tax: "0",
      total: depositAmount.toFixed(2),
      status: "draft",
      dueDate: dueDate.toISOString().slice(0, 10), // text column: use YYYY-MM-DD string
      amountDue: depositAmount.toFixed(2),
      notes: `Deposit invoice for employee ${employee.firstName} ${employee.lastName} (${employee.employeeCode}). Deposit = (${baseSalary} + ${estimatedEmployerCost}) × ${depositMultiplier} = ${localAmount.toFixed(2)} ${employeeCurrency}${employeeCurrency !== settlementCurrency ? ` → ${depositAmount.toFixed(2)} ${settlementCurrency}` : ""}`,
    };

    const invoiceResult = await db.insert(invoices).values(invoiceData).returning({ id: invoices.id });
    const invoiceId = invoiceResult[0]?.id;
    if (!invoiceId) throw new Error("Failed to get deposit invoice ID after insert");

    // 9. Create invoice line item
    // Logic update: Quantity = depositMultiplier, UnitPrice = monthlyTotal
    // This correctly reflects "2.0 months x $5000/month" structure
    
    // Calculate unit price in settlement currency
    // depositAmount (Total) = monthlyTotal * depositMultiplier * exchangeRateWithMarkup
    // unitPrice (Settlement) = (monthlyTotal * exchangeRateWithMarkup)
    
    const monthlyTotalSettlement = monthlyTotal * exchangeRateWithMarkup;
    
    const lineItem: InsertInvoiceItem = {
      invoiceId,
      employeeId,
      description: `Deposit - ${employee.employeeCode || ''} ${employee.firstName} ${employee.lastName}`,
      quantity: depositMultiplier.toString(),
      // Use localCurrency unit price if available (for PDF display), otherwise settlement currency unit price
      unitPrice: employeeCurrency !== settlementCurrency ? monthlyTotal.toFixed(2) : monthlyTotalSettlement.toFixed(2),
      amount: depositAmount.toFixed(2),
      itemType: "deposit",
      countryCode: employee.country,
      localCurrency: employeeCurrency !== settlementCurrency ? employeeCurrency : undefined,
      localAmount: employeeCurrency !== settlementCurrency ? localAmount.toFixed(2) : undefined,
      exchangeRate: employeeCurrency !== settlementCurrency ? exchangeRate.toFixed(6) : undefined,
      exchangeRateWithMarkup: employeeCurrency !== settlementCurrency ? exchangeRateWithMarkup.toFixed(6) : undefined,
    };

    await db.insert(invoiceItems).values(lineItem);

    return {
      invoiceId,
      message: `Deposit invoice ${invoiceNumber} created for ${employee.firstName} ${employee.lastName} (${depositAmount.toFixed(2)} ${settlementCurrency})`,
    };
  } catch (error) {
    console.error("[DepositInvoice] Error generating deposit invoice:", error);
    return {
      invoiceId: null,
      message: `Failed to generate deposit invoice: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
