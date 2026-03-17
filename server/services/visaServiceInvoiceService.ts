import { getDb, getCountryConfig, getBillingEntityById } from "../db";
import {
  employees,
  customers,
  invoices,
  invoiceItems,
  InsertInvoice,
  InsertInvoiceItem,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getExchangeRate } from "./exchangeRateService";
import { generateInvoiceNumber } from "./invoiceNumberService";

/**
 * Visa Service Invoice Generation
 *
 * Triggered when a Visa EOR employee's visa status changes to "application_submitted"
 * Creates a single invoice per employee with one item: Visa & Immigration Service Fee
 * Amount comes from countries_config.visaEorSetupFee for the employee's country
 */

interface VisaServiceInvoiceResult {
  invoiceId: number | null;
  message: string;
}

export async function generateVisaServiceInvoice(
  employeeId: number
): Promise<VisaServiceInvoiceResult> {
  const db = await getDb();
  if (!db) {
    return { invoiceId: null, message: "Database not available" };
  }

  try {
    // Get employee data
    const empData = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (empData.length === 0) {
      return { invoiceId: null, message: "Employee not found" };
    }

    const emp = empData[0];

    // Verify employee is visa_eor type
    if (emp.serviceType !== "visa_eor") {
      return { invoiceId: null, message: "Employee is not a Visa EOR employee" };
    }

    // Get customer data
    const custData = await db
      .select()
      .from(customers)
      .where(eq(customers.id, emp.customerId))
      .limit(1);

    if (custData.length === 0) {
      return { invoiceId: null, message: "Customer not found" };
    }

    const customer = custData[0];
    const settlementCurrency = customer.settlementCurrency || "USD";

    // Get country config for visa setup fee
    const countryConfig = await getCountryConfig(emp.country);
    if (!countryConfig) {
      return { invoiceId: null, message: `Country config not found for ${emp.country}` };
    }

    const visaSetupFee = parseFloat(countryConfig.visaEorSetupFee?.toString() ?? "0");
    if (visaSetupFee <= 0) {
      return { invoiceId: null, message: `No Visa Setup Fee configured for ${emp.country}` };
    }

    const rateCurrency = countryConfig.standardRateCurrency || "USD";

    // Get exchange rate if needed
    let exchangeRate = 1;
    let rateWithMarkup = 1;
    let feeInSettlement = visaSetupFee;

    if (rateCurrency !== settlementCurrency) {
      const rateData = await getExchangeRate(rateCurrency, settlementCurrency);
      if (rateData) {
        exchangeRate = rateData.rate;
        rateWithMarkup = rateData.rateWithMarkup;
        feeInSettlement = visaSetupFee * rateWithMarkup;
      }
    }

    // Service fees (including visa service fees) are NOT subject to VAT
    const vatRate = 0;
    const taxAmount = 0;
    const totalAmount = feeInSettlement;

    // Generate invoice number
    const billingEntityId = customer.billingEntityId || null;
    const invoiceNumber = await generateInvoiceNumber(billingEntityId, new Date());

    // Due Date: use customer payment terms
    const issueDate = new Date();
    const termDays = customer.paymentTermDays || 30;
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + termDays);

    const empCode = emp.employeeCode || `EMP${emp.id}`;
    const empName = `${emp.firstName} ${emp.lastName}`;

    // Create invoice
    const invoiceData: InsertInvoice = {
      customerId: customer.id,
      billingEntityId,
      invoiceNumber,
      invoiceType: "visa_service",
      currency: settlementCurrency,
      exchangeRate: exchangeRate.toString(),
      exchangeRateWithMarkup: rateWithMarkup.toString(),
      subtotal: totalAmount.toFixed(2),
      serviceFeeTotal: "0.00",
      tax: taxAmount.toFixed(2),
      total: totalAmount.toFixed(2),
      status: "draft",
      dueDate: dueDate.toISOString().slice(0, 10), // text column: use YYYY-MM-DD string
      invoiceMonth: new Date().toISOString().slice(0, 7) + "-01", // Set current month
      amountDue: totalAmount.toFixed(2),
      notes: `Visa & Immigration Service Fee for ${empCode} ${empName}`,
    };

    const invoiceInsertResult = await db.insert(invoices).values(invoiceData).returning({ id: invoices.id });
    const invoiceId = invoiceInsertResult[0]?.id;
    if (!invoiceId) throw new Error("Failed to get visa service invoice ID after insert");

    // Create line item
    const lineItem: InsertInvoiceItem = {
      invoiceId,
      employeeId,
      description: `${empCode} ${empName}`,
      quantity: "1",
      unitPrice: feeInSettlement.toFixed(2),
      amount: totalAmount.toFixed(2),
      itemType: "visa_immigration_fee",
      vatRate: vatRate.toFixed(2),
      countryCode: emp.country,
      localCurrency: rateCurrency,
      localAmount: visaSetupFee.toFixed(2),
      exchangeRate: exchangeRate.toString(),
      exchangeRateWithMarkup: rateWithMarkup.toString(),
    };

    await db.insert(invoiceItems).values(lineItem);

    return {
      invoiceId,
      message: `Visa Service Invoice generated for ${empCode} ${empName}`,
    };
  } catch (error) {
    console.error("[VisaServiceInvoice] Error generating invoice:", error);
    return {
      invoiceId: null,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
