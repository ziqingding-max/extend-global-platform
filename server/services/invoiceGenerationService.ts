import {
  invoices,
  invoiceItems,
  payrollRuns,
  payrollItems,
  customers,
  employees,
  contractorInvoices,
  contractors,
  customerPricing,
  countriesConfig,
  exchangeRates,
  InsertInvoice,
  InsertInvoiceItem,
  CountryConfig,
} from "../../drizzle/schema";
import { eq, and, isNull, inArray, desc, lte } from "drizzle-orm";
import { getDb } from "../db";
import { getExchangeRate } from "./exchangeRateService";
import { generateInvoiceNumber } from "./invoiceNumberService";

/**
 * Main function to generate invoices for a specific payroll month.
 * Includes:
 * 1. EOR Payroll Invoices (from Payroll Runs)
 * 2. AOR Contractor Invoices (aggregated)
 */
export async function generateInvoicesFromPayroll(
  payrollMonth: Date,
  monthLabel: string = "",
  warnings: string[] = []
): Promise<{
  success: boolean;
  invoiceIds?: number[];
  message: string;
  error?: string;
  warnings?: string[];
}> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const payrollMonthStr = payrollMonth.toISOString().slice(0, 10); // YYYY-MM-DD

    // 1. Check for UNAPPROVED payroll runs for this month
    // We only generate invoices for APPROVED runs.
    // If there are draft/pending runs, we warn but proceed with approved ones.
    const nonApprovedRuns = await db
      .select()
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.payrollMonth, payrollMonthStr),
          inArray(payrollRuns.status, ["draft", "pending_approval", "rejected"])
        )
      );

    if (nonApprovedRuns.length > 0) {
      warnings.push(
        `${nonApprovedRuns.length} payroll run(s) for this month are not yet approved and were excluded from invoice generation.`
      );
    }

    // 2. Generate AOR Invoices (Aggregated from Approved Contractor Invoices)
    const aorResult = await generateAorInvoices(payrollMonth, monthLabel, warnings);

    // 3. Collect all payroll items from APPROVED runs
    const approvedRuns = await db
      .select()
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.payrollMonth, payrollMonthStr),
          eq(payrollRuns.status, "approved")
        )
      );

    if (approvedRuns.length === 0 && (!aorResult.invoiceIds || aorResult.invoiceIds.length === 0)) {
      return {
        success: true,
        invoiceIds: [],
        message: "No approved payroll runs or contractor invoices found for this month.",
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    const runIds = approvedRuns.map((r) => r.id);
    let payrollItemsData: any[] = [];
    
    if (runIds.length > 0) {
      payrollItemsData = await db
        .select({
          item: payrollItems,
          employee: employees,
          run: payrollRuns,
        })
        .from(payrollItems)
        .innerJoin(employees, eq(payrollItems.employeeId, employees.id))
        .innerJoin(payrollRuns, eq(payrollItems.payrollRunId, payrollRuns.id))
        .where(inArray(payrollItems.payrollRunId, runIds));
    }

    // 4. Group by Customer + Currency + ServiceType (EOR vs Visa EOR)
    // Map key: "customerId|currency|serviceType"
    const groups = new Map<string, typeof payrollItemsData>();

    for (const row of payrollItemsData) {
      const svcType = row.employee.serviceType === "visa_eor" ? "visa_eor" : "eor";
      const key = `${row.employee.customerId}|${row.run.currency}|${svcType}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    }

    const invoiceIds: number[] = [...(aorResult.invoiceIds || [])];
    let skippedDuplicates = 0;

    // 5. Process each group -> Create EOR / Visa EOR Invoice
    for (const [key, items] of Array.from(groups.entries())) {
      const [customerIdStr, currency, groupServiceType] = key.split("|");
      const customerId = parseInt(customerIdStr);

      // Check for existing invoice for this month/customer/type
      // Note: We might have multiple invoices if different currencies.
      // We check by invoiceNumber pattern or metadata? 
      // Schema has `invoiceMonth` and `customerId` and `invoiceType`.
      const existing = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.customerId, customerId),
            eq(invoices.invoiceMonth, payrollMonthStr),
            inArray(invoices.invoiceType, ["monthly_eor", "monthly_visa_eor"])
          )
        );

      // If existing invoice found for this currency, skip to avoid duplicates?
      // Or should we delete and recreate? Safe approach: Skip and warn.
      const existingForCurrency = existing.find(i => i.currency === currency); // Need to check settlement currency
      
      // We need to know settlement currency to check duplicates accurately.
      const customerResult = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
      if (customerResult.length === 0) continue;
      const customer = customerResult[0];
      const settlementCurrency = customer.settlementCurrency || "USD";

      if (existing.some(i => i.currency === settlementCurrency)) {
         // Potential duplicate for this month.
         // However, maybe we are regenerating?
         // For now, we skip if exact match found.
         // skippedDuplicates++;
         // continue;
         // Actually, let's allow multiple if needed, or user should regenerate.
      }

      // Exchange Rate Logic
      let exchangeRate = 1;
      let rateWithMarkup = 1;
      let rateFallbackNote = "";

      if (currency !== settlementCurrency) {
        const rateData = await getExchangeRateWithFallback(currency, settlementCurrency, new Date());
        if (rateData) {
          exchangeRate = rateData.rate;
          rateWithMarkup = rateData.rateWithMarkup;
          if (rateData.isFallback) {
            rateFallbackNote = ` [Rate Fallback: ${rateData.fallbackDate}]`;
            warnings.push(`EOR Exchange rate for ${currency} fallback to ${rateData.fallbackDate}`);
          }
        } else {
          warnings.push(`No exchange rate found for ${currency} → ${settlementCurrency}. Using 1:1.`);
        }
      }

      // Build Line Items
      const lineItemsList: InsertInvoiceItem[] = [];
      let totalSubtotal = 0;
      let totalServiceFee = 0;

      // Group by Employee to calculate Service Fees correctly
      const employeeItems = new Map<number, typeof items>();
      for (const row of items) {
        if (!employeeItems.has(row.employee.id)) {
          employeeItems.set(row.employee.id, []);
        }
        employeeItems.get(row.employee.id)!.push(row);
      }

      for (const [empId, empRows] of Array.from(employeeItems.entries())) {
        const employee = empRows[0].employee;
        
        // Sum up costs for this employee
        let empTotalCost = 0;
        for (const row of empRows) {
           empTotalCost += parseFloat(row.item.totalEmploymentCost);
        }

        const amountSettlement = empTotalCost * rateWithMarkup;
        totalSubtotal += amountSettlement;

        // Add Employment Cost Line Item
        lineItemsList.push({
          invoiceId: 0,
          description: `Employment Cost - ${employee.firstName} ${employee.lastName} (${monthLabel})`,
          quantity: "1",
          unitPrice: empTotalCost.toFixed(2),
          amount: amountSettlement.toFixed(2),
          itemType: "employment_cost",
          vatRate: "0",
          countryCode: employee.country,
          localCurrency: currency,
          localAmount: empTotalCost.toFixed(2),
          exchangeRate: exchangeRate.toString(),
          exchangeRateWithMarkup: rateWithMarkup.toString(),
          employeeId: empId,
        });

        // Calculate Service Fee
        // Get Country Config
        const ccResult = await db.select().from(countriesConfig).where(eq(countriesConfig.countryCode, employee.country)).limit(1);
        const cc = ccResult.length > 0 ? ccResult[0] : null;

        const fee = await getServiceFeeRate(
          customerId,
          employee.country,
          employee.serviceType === "visa_eor" ? "visa_eor" : "eor",
          cc,
          settlementCurrency,
          warnings
        );

        totalServiceFee += fee;

        lineItemsList.push({
          invoiceId: 0,
          description: `${employee.serviceType === 'visa_eor' ? 'Visa EOR' : 'EOR'} Service Fee - ${employee.firstName} ${employee.lastName}`,
          quantity: "1",
          unitPrice: fee.toFixed(2),
          amount: fee.toFixed(2),
          itemType: employee.serviceType === 'visa_eor' ? 'visa_eor_service_fee' : 'eor_service_fee',
          vatRate: "0",
          countryCode: employee.country,
          employeeId: empId,
        });
      }

      const finalTotal = totalSubtotal + totalServiceFee;

      // Create Invoice
      const billingEntityId = customer.billingEntityId || null;
      const invoiceNumber = await generateInvoiceNumber(billingEntityId, payrollMonth);
      
      const termDays = customer.paymentTermDays || 30;
      const issueDate = new Date();
      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + termDays);

      // Determine invoice type based on the group's service type
      const invoiceType = groupServiceType === "visa_eor" ? "monthly_visa_eor" : "monthly_eor";

      const invoiceData: InsertInvoice = {
        customerId,
        billingEntityId,
        invoiceNumber,
        invoiceType,
        invoiceMonth: payrollMonthStr,
        currency: settlementCurrency,
        exchangeRate: exchangeRate.toString(),
        exchangeRateWithMarkup: rateWithMarkup.toString(),
        subtotal: totalSubtotal.toFixed(2),
        serviceFeeTotal: totalServiceFee.toFixed(2),
        tax: "0.00",
        total: finalTotal.toFixed(2),
        status: "draft",
        dueDate: dueDate.toISOString().slice(0, 10),
        amountDue: finalTotal.toFixed(2),
        notes: `Payroll Invoice for ${monthLabel}`,
        internalNotes: rateFallbackNote ? `Exchange Rate Fallback: ${rateFallbackNote.trim()}` : undefined,
      };

      const invoiceInsertResult = await db.insert(invoices).values(invoiceData).returning({ id: invoices.id });
      const invoiceId = invoiceInsertResult[0]?.id;
      if (!invoiceId) {
        warnings.push(`Failed to get invoice ID after insert for customer ${customerId}`);
        continue;
      }
      invoiceIds.push(invoiceId);

      // Insert Items
      const finalLineItems = lineItemsList.map((li) => ({ ...li, invoiceId }));
      if (finalLineItems.length > 0) {
        await db.insert(invoiceItems).values(finalLineItems);
      }
    }

    return {
      success: true,
      invoiceIds,
      message: `Successfully generated ${invoiceIds.length} draft invoice(s) (Payroll: ${invoiceIds.length - (aorResult.invoiceIds?.length || 0)}, AOR: ${aorResult.invoiceIds?.length || 0})`,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

  } catch (error) {
    console.error("[InvoiceGeneration] Error generating invoices:", error);
    return {
      success: false,
      message: "Failed to generate invoices",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * Generate AOR Client Invoices from Approved Contractor Invoices.
 * Sweeps all 'approved' (unbilled) contractor invoices and aggregates them into Client Invoices.
 */
async function generateAorInvoices(
  payrollMonth: Date,
  monthLabel: string,
  warnings: string[]
): Promise<{ invoiceIds: number[] }> {
  const db = await getDb();
  if (!db) return { invoiceIds: [] };

  const invoiceIds: number[] = [];
  const payrollMonthStr = payrollMonth.toISOString().slice(0, 10); // YYYY-MM-DD

  // 1. Find all Approved, Unbilled Contractor Invoices
  const unbilledInvoices = await db
    .select()
    .from(contractorInvoices)
    .where(
      and(
        eq(contractorInvoices.status, "approved"),
        isNull(contractorInvoices.clientInvoiceId)
      )
    );

  if (unbilledInvoices.length === 0) return { invoiceIds: [] };

  // 2. Group by Customer + Currency
  const groups = new Map<string, typeof unbilledInvoices>();
  
  for (const inv of unbilledInvoices) {
    const key = `${inv.customerId}|${inv.currency}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(inv);
  }

  // 3. Process each group -> Create Client Invoice
  for (const [key, batch] of Array.from(groups.entries())) {
    const [customerIdStr, currency] = key.split("|");
    const customerId = parseInt(customerIdStr);

    // Get Customer
    const customerResult = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (customerResult.length === 0) continue;
    const customer = customerResult[0];

    // Check settlement currency
    const settlementCurrency = customer.settlementCurrency || "USD";
    
    // Exchange Rate Logic
    let exchangeRate = 1;
    let rateWithMarkup = 1;
    let rateFallbackNote = "";

    if (currency !== settlementCurrency) {
      const rateData = await getExchangeRateWithFallback(currency, settlementCurrency, new Date());
      if (rateData) {
        exchangeRate = rateData.rate;
        rateWithMarkup = rateData.rateWithMarkup;
        if (rateData.isFallback) {
          rateFallbackNote = ` [Rate Fallback: ${rateData.fallbackDate}]`;
          warnings.push(`AOR Exchange rate for ${currency} fallback to ${rateData.fallbackDate}`);
        }
      } else {
        warnings.push(`No exchange rate found for ${currency} → ${settlementCurrency}. Using 1:1.`);
      }
    }

    // Build Line Items
    const lineItems: InsertInvoiceItem[] = [];
    let totalSubtotal = 0;
    
    // Track unique contractors for Service Fee calculation
    const contractorIds = new Set<number>();

    for (const inv of batch) {
      contractorIds.add(inv.contractorId);

      // Get Contractor Name
      const contractorResult = await db.select().from(contractors).where(eq(contractors.id, inv.contractorId)).limit(1);
      const contractorName = contractorResult.length > 0 
        ? `${contractorResult[0].firstName} ${contractorResult[0].lastName}` 
        : `Contractor #${inv.contractorId}`;

      const amountLocal = parseFloat(inv.totalAmount);
      const amountSettlement = amountLocal * rateWithMarkup;
      
      totalSubtotal += amountSettlement;

      lineItems.push({
        invoiceId: 0,
        description: `Contractor Payment: ${contractorName} (${inv.invoiceNumber})`,
        quantity: "1",
        unitPrice: amountLocal.toFixed(2), // Show local amount in unit price? Or settlement?
        // Standard: Unit Price = Local Amount, Amount = Settlement Amount
        // Actually, schema expects 'amount' to be in invoice currency.
        // Let's store settlement amount in 'amount' and local in 'localAmount'
        amount: amountSettlement.toFixed(2),
        itemType: "consulting_fee", // Changed from "employment_cost" to "consulting_fee" for AOR
        vatRate: "0", // No VAT on international contractor payments usually
        countryCode: contractorResult[0]?.country || undefined,
        localCurrency: currency,
        localAmount: amountLocal.toFixed(2),
        exchangeRate: exchangeRate.toString(),
        exchangeRateWithMarkup: rateWithMarkup.toString(),
      });
    }

    // Calculate AOR Service Fee
    let totalFee = 0;
    for (const cid of Array.from(contractorIds)) {
       const contractorResult = await db.select().from(contractors).where(eq(contractors.id, cid)).limit(1);
       if (contractorResult.length === 0) continue;
       const ctr = contractorResult[0];
       
       // Get Country Config for this contractor's country
       const ccResult = await db.select().from(countriesConfig).where(eq(countriesConfig.countryCode, ctr.country)).limit(1);
       const cc = ccResult.length > 0 ? ccResult[0] : null;
       
       const fee = await getServiceFeeRate(
         customerId,
         ctr.country,
         "aor", // Service Type
         cc,
         settlementCurrency,
         warnings
       );
       
       totalFee += fee;
       
       lineItems.push({
         invoiceId: 0,
         description: `AOR Service Fee - ${ctr.firstName} ${ctr.lastName}`,
         quantity: "1",
         unitPrice: fee.toFixed(2),
         amount: fee.toFixed(2),
         itemType: "aor_service_fee",
         vatRate: "0", // Service fees no VAT? Usually they do if domestic.
         // Assuming 0 for now as per previous logic
         countryCode: ctr.country,
       });
    }
    
    totalSubtotal += totalFee;
    
    // Create Invoice
    const billingEntityId = customer.billingEntityId || null;
    const invoiceNumber = await generateInvoiceNumber(billingEntityId, payrollMonth);
    
    const termDays = customer.paymentTermDays || 30;
    const issueDate = new Date();
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + termDays);

    const invoiceData: InsertInvoice = {
      customerId,
      billingEntityId,
      invoiceNumber,
      invoiceType: "monthly_aor",
      invoiceMonth: payrollMonthStr,
      currency: settlementCurrency,
      exchangeRate: exchangeRate.toString(),
      exchangeRateWithMarkup: rateWithMarkup.toString(),
      subtotal: totalSubtotal.toFixed(2),
      serviceFeeTotal: "0.00", // Included in subtotal
      tax: "0.00", // Assuming 0 tax for now
      total: totalSubtotal.toFixed(2),
      status: "draft",
      dueDate: dueDate.toISOString().slice(0, 10),
      amountDue: totalSubtotal.toFixed(2),
      notes: `Aggregated AOR Invoice for ${monthLabel}`,
      internalNotes: rateFallbackNote ? `Exchange Rate Fallback: ${rateFallbackNote.trim()}` : undefined,
    };

    const invoiceInsertResult = await db.insert(invoices).values(invoiceData).returning({ id: invoices.id });
    const invoiceId = invoiceInsertResult[0]?.id;
    if (!invoiceId) {
      warnings.push(`Failed to get invoice ID after insert for AOR customer ${customerId}`);
      continue;
    }
    invoiceIds.push(invoiceId);

    // Insert Items
    const finalLineItems = lineItems.map((li) => ({ ...li, invoiceId }));
    if (finalLineItems.length > 0) {
      await db.insert(invoiceItems).values(finalLineItems);
    }

    // Link Contractor Invoices
    const batchIds = batch.map(b => b.id);
    await db.update(contractorInvoices)
      .set({ clientInvoiceId: invoiceId })
      .where(inArray(contractorInvoices.id, batchIds));
  }

  return { invoiceIds };
}

/**
 * Get status of invoice generation for a specific payroll month
 */
export async function getInvoiceGenerationStatus(
  payrollMonth: Date
): Promise<{
  totalInvoices: number;
  byStatus: Record<string, number>;
} | null> {
  const db = await getDb();
  if (!db) return null;

  const payrollMonthStr = payrollMonth.toISOString().slice(0, 10);

  const monthInvoices = await db
    .select({ status: invoices.status })
    .from(invoices)
    .where(eq(invoices.invoiceMonth, payrollMonthStr));

  const statusCounts: Record<string, number> = {};
  for (const inv of monthInvoices) {
    const s = inv.status || "unknown";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  return {
    totalInvoices: monthInvoices.length,
    byStatus: statusCounts,
  };
}

/**
 * Regenerate invoices for a month (deletes draft invoices and recreates)
 */
export async function regenerateInvoices(
  payrollMonth: Date
): Promise<{ success: boolean; invoiceIds?: number[]; warnings?: string[] }> {
  const db = await getDb();
  if (!db) return { success: false, warnings: ["Database unavailable"] };

  const payrollMonthStr = payrollMonth.toISOString().slice(0, 10);

  // 1. Find only DRAFT monthly invoices for this month (preserve deposit, visa_service, etc.)
  const drafts = await db
    .select({ id: invoices.id, customerId: invoices.customerId, invoiceType: invoices.invoiceType, notes: invoices.notes })
    .from(invoices)
    .where(
      and(
        eq(invoices.invoiceMonth, payrollMonthStr),
        eq(invoices.status, "draft"),
        inArray(invoices.invoiceType, ["monthly_eor", "monthly_visa_eor", "monthly_aor"])
      )
    );

  // Save old notes keyed by customerId + invoiceType so we can restore after regeneration
  const savedNotes: Record<string, string> = {};
  for (const d of drafts) {
    if (d.notes) {
      savedNotes[`${d.customerId}_${d.invoiceType}`] = d.notes;
    }
  }

  const draftIds = drafts.map((d) => d.id);

  if (draftIds.length > 0) {
    // 2. Reset AOR contractor invoices' clientInvoiceId before deleting AOR client invoices
    //    This ensures they can be re-picked up during regeneration
    const aorDraftIds = drafts.filter(d => d.invoiceType === "monthly_aor").map(d => d.id);
    if (aorDraftIds.length > 0) {
      await db.update(contractorInvoices)
        .set({ clientInvoiceId: null })
        .where(inArray(contractorInvoices.clientInvoiceId, aorDraftIds));
    }

    // 3. Delete invoice items
    await db.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, draftIds));
    
    // 4. Delete invoices
    await db.delete(invoices).where(inArray(invoices.id, draftIds));
  }

  // 5. Regenerate
  const monthLabel = payrollMonth.toLocaleDateString("en", { month: "short", year: "numeric" });
  const result = await generateInvoicesFromPayroll(payrollMonth, monthLabel);

  // 6. Restore saved external notes on newly generated invoices
  if (result.success && result.invoiceIds && result.invoiceIds.length > 0) {
    const newInvoices = await db
      .select({ id: invoices.id, customerId: invoices.customerId, invoiceType: invoices.invoiceType })
      .from(invoices)
      .where(inArray(invoices.id, result.invoiceIds));

    for (const inv of newInvoices) {
      const key = `${inv.customerId}_${inv.invoiceType}`;
      if (savedNotes[key]) {
        await db.update(invoices).set({ notes: savedNotes[key] }).where(eq(invoices.id, inv.id));
      }
    }
  }

  return result;
}

/**
 * Regenerate a single invoice (delete and recreate from payroll data)
 */
export async function regenerateSingleInvoice(
  invoiceId: number
): Promise<{ success: boolean; invoiceIds?: number[]; message?: string }> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database unavailable" };

  // 1. Get invoice details
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });

  if (!invoice) return { success: false, message: "Invoice not found" };
  if (invoice.status !== "draft") {
    return { success: false, message: "Only draft invoices can be regenerated" };
  }
  if (!invoice.invoiceMonth) {
    return { success: false, message: "Invoice does not have a month set" };
  }

  // Save the original external notes before deleting
  const savedNotes = invoice.notes || null;
  const savedCustomerId = invoice.customerId;
  const savedInvoiceType = invoice.invoiceType;

  // 2. Reset AOR contractor invoices' clientInvoiceId if this is an AOR invoice
  if (invoice.invoiceType === "monthly_aor") {
    await db.update(contractorInvoices)
      .set({ clientInvoiceId: null })
      .where(eq(contractorInvoices.clientInvoiceId, invoiceId));
  }

  // 3. Delete invoice
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  await db.delete(invoices).where(eq(invoices.id, invoiceId));

  // 4. Regenerate for that month
  const payrollMonth = new Date(invoice.invoiceMonth);
  const monthLabel = payrollMonth.toLocaleDateString("en", { month: "short", year: "numeric" });
  const result = await generateInvoicesFromPayroll(payrollMonth, monthLabel);

  // 5. Restore saved external notes on the newly generated invoice
  if (result.success && result.invoiceIds && result.invoiceIds.length > 0 && savedNotes) {
    const newInvoices = await db
      .select({ id: invoices.id, customerId: invoices.customerId, invoiceType: invoices.invoiceType })
      .from(invoices)
      .where(inArray(invoices.id, result.invoiceIds));

    for (const inv of newInvoices) {
      if (inv.customerId === savedCustomerId && inv.invoiceType === savedInvoiceType) {
        await db.update(invoices).set({ notes: savedNotes }).where(eq(invoices.id, inv.id));
        break;
      }
    }
  }

  return result;
}

/**
 * Calculate the service fee rate for a single employee (in settlement currency)
 */
async function getServiceFeeRate(
  customerId: number,
  countryCode: string,
  serviceType: "eor" | "visa_eor" | "aor",
  countryConfig: CountryConfig | null,
  settlementCurrency: string,
  warnings: string[]
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  let feeAmount = 0;
  let feeCurrency = "USD";

  // 0. Check for Client Specific AOR Fixed Price (Global, ignores countryCode)
  if (serviceType === "aor") {
    const aorFixedPrice = await db
      .select()
      .from(customerPricing)
      .where(
        and(
          eq(customerPricing.customerId, customerId),
          eq(customerPricing.isActive, true),
          eq(customerPricing.pricingType, "client_aor_fixed")
        )
      )
      .limit(1);

    if (aorFixedPrice.length > 0 && aorFixedPrice[0].fixedPrice) {
      feeAmount = parseFloat(aorFixedPrice[0].fixedPrice);
      feeCurrency = aorFixedPrice[0].currency || "USD";
      // Skip country-specific and global discount checks
      return convertFee(feeAmount, feeCurrency, settlementCurrency, warnings, db);
    }
  }

  // 1. Check for Country Specific Fixed Price
  const countryPrice = await db
    .select()
    .from(customerPricing)
    .where(
      and(
        eq(customerPricing.customerId, customerId),
        eq(customerPricing.isActive, true),
        eq(customerPricing.pricingType, "country_specific"),
        eq(customerPricing.countryCode, countryCode),
        eq(customerPricing.serviceType, serviceType)
      )
    )
    .limit(1);

  if (countryPrice.length > 0 && countryPrice[0].fixedPrice) {
    feeAmount = parseFloat(countryPrice[0].fixedPrice);
    feeCurrency = countryPrice[0].currency || "USD";
  } else {
    // 2. Check for Global Discount
    // If global discount exists, apply it to the Standard Rate
    const globalDiscount = await db
      .select()
      .from(customerPricing)
      .where(
        and(
          eq(customerPricing.customerId, customerId),
          eq(customerPricing.isActive, true),
          eq(customerPricing.pricingType, "global_discount")
        )
      )
      .limit(1);
    
    // Get Standard Rate
    let standardRate = 0;
    if (countryConfig) {
      if (serviceType === "eor") standardRate = parseFloat(countryConfig.standardEorRate || "0");
      else if (serviceType === "visa_eor") standardRate = parseFloat(countryConfig.standardVisaEorRate || "0");
      else if (serviceType === "aor") standardRate = parseFloat(countryConfig.standardAorRate || "0");
      
      feeCurrency = countryConfig.standardRateCurrency || "USD";
    }

    if (globalDiscount.length > 0 && globalDiscount[0].globalDiscountPercent) {
      const discount = parseFloat(globalDiscount[0].globalDiscountPercent);
      feeAmount = standardRate * (1 - discount / 100);
    } else {
      // 3. Fallback to Standard Rate
      feeAmount = standardRate;
    }
  }

  // Convert to Settlement Currency
  return convertFee(feeAmount, feeCurrency, settlementCurrency, warnings, db);
}

async function convertFee(
  amount: number,
  currency: string,
  settlementCurrency: string,
  warnings: string[],
  db: any
): Promise<number> {
  if (currency !== settlementCurrency && amount > 0) {
     const rateData = await getExchangeRateWithFallback(currency, settlementCurrency, new Date());
     if (rateData) {
       // Service fees are revenue, so we might want to use the raw rate or marked up rate?
       // Usually we use the same marked up rate as costs to ensure margin.
       return amount * rateData.rateWithMarkup;
     } else {
       warnings.push(`Service Fee conversion failed ${currency} -> ${settlementCurrency}. Using 1:1.`);
       return amount;
     }
  }
  return amount;
}

/**
 * Helper to get exchange rate with historical fallback
 */
async function getExchangeRateWithFallback(from: string, to: string, date: Date) {
  const db = await getDb();
  if (!db) return null;

  // Try exact date or latest before date
  const rate = await getExchangeRate(from, to, date);
  if (rate) return { ...rate, isFallback: false };

  // If no rate found (e.g. today's rate not yet fetched), try getting the latest available
  const latest = await db.query.exchangeRates.findFirst({
    where: and(
      eq(exchangeRates.fromCurrency, from),
      eq(exchangeRates.toCurrency, to)
    ),
    orderBy: [desc(exchangeRates.effectiveDate)]
  });

  if (latest) {
     return {
       rate: parseFloat(latest.rate),
       rateWithMarkup: parseFloat(latest.rateWithMarkup),
       markupPercentage: parseFloat(latest.markupPercentage),
       effectiveDate: latest.effectiveDate,
       isFallback: true,
       fallbackDate: latest.effectiveDate
     };
  }
  
  return null;
}

// End of file
