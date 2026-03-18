/**
 * Dual-Layer Invoice Service
 *
 * Orchestrates the generation of dual-layer invoices for the B2B2B model:
 *   Layer 1 (eg_to_cp): EG charges CP at the agreed bottom price
 *   Layer 2 (cp_to_client): CP charges End Client at the marked-up price
 *   EG-DIRECT (eg_to_client): EG charges End Client directly (no CP intermediary)
 *
 * This service is called from the main invoiceGenerationService.ts after
 * payroll items have been grouped by customer. It determines whether the
 * customer belongs to an external CP or the internal EG-DIRECT virtual CP,
 * and generates the appropriate invoices.
 *
 * For external CPs: generates both Layer 1 and Layer 2 invoices.
 * For EG-DIRECT (isInternal=true): generates a single eg_to_client invoice, no Layer 2.
 *
 * All invoices are generated as DRAFT and require manual review before sending.
 */

import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  invoices,
  invoiceItems,
  customers,
  channelPartners,
  employees,
  InsertInvoice,
  InsertInvoiceItem,
} from "../../drizzle/schema";
import { generateInvoiceNumber } from "./invoiceNumberService";
import {
  getLayer1ServiceFee,
  getLayer2ServiceFee,
  resolveActualFee,
  getCpActiveHeadcount,
  generateCpInvoiceNumber,
  CpFeeResult,
} from "./cpPricingEngine";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface EmployeeInvoiceData {
  employeeId: number;
  employeeName: string;
  countryCode: string;
  serviceType: "eor" | "visa_eor";
  /** Total employment cost in local (payroll) currency */
  totalEmploymentCostLocal: number;
  /** Total employment cost converted to settlement currency (with FX markup) */
  totalEmploymentCostSettlement: number;
  /** Local (payroll) currency code */
  localCurrency: string;
  /** Exchange rate (raw) */
  exchangeRate: number;
  /** Exchange rate with markup */
  exchangeRateWithMarkup: number;
}

export interface DualLayerResult {
  /** Layer 1 invoice ID (EG → CP) — always created */
  layer1InvoiceId: number;
  /** Layer 2 invoice ID (CP → Client) — null for internal CP (EG-DIRECT) */
  layer2InvoiceId: number | null;
}

// ────────────────────────────────────────────────────────────────
// Main Entry Point
// ────────────────────────────────────────────────────────────────

/**
 * Generate dual-layer invoices for a single customer group.
 *
 * @param customerId - The end client customer ID
 * @param employeeData - Array of employee cost data for this invoice
 * @param payrollMonthStr - YYYY-MM-DD string of the payroll month
 * @param monthLabel - Human-readable month label (e.g. "Jan 2026")
 * @param settlementCurrency - The customer's settlement currency
 * @param invoiceType - "monthly_eor" or "monthly_visa_eor"
 * @param billingEntityId - EG billing entity ID for Layer 1
 * @param warnings - Mutable array to collect warnings
 */
export async function generateDualLayerInvoices(
  customerId: number,
  employeeData: EmployeeInvoiceData[],
  payrollMonthStr: string,
  monthLabel: string,
  settlementCurrency: string,
  invoiceType: "monthly_eor" | "monthly_visa_eor",
  billingEntityId: number | null,
  exchangeRate: number,
  exchangeRateWithMarkup: number,
  warnings: string[]
): Promise<DualLayerResult | null> {
  const db = await getDb();
  if (!db) return null;

  // ── Step 1: Resolve the customer's Channel Partner ──
  const customerResult = await db
    .select({
      id: customers.id,
      channelPartnerId: customers.channelPartnerId,
      paymentTermDays: customers.paymentTermDays,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (customerResult.length === 0) {
    warnings.push(`Customer #${customerId} not found. Skipping dual-layer.`);
    return null;
  }

  const customer = customerResult[0];
  const cpId = customer.channelPartnerId;

  // If no CP assigned, this shouldn't have been called
  if (!cpId) {
    warnings.push(
      `Customer #${customerId} has no channelPartnerId. Cannot generate dual-layer invoices.`
    );
    return null;
  }

  // ── Step 2: Get Channel Partner details ──
  const cpResult = await db
    .select()
    .from(channelPartners)
    .where(eq(channelPartners.id, cpId))
    .limit(1);

  if (cpResult.length === 0) {
    warnings.push(`Channel Partner #${cpId} not found. Skipping dual-layer.`);
    return null;
  }

  const cp = cpResult[0];
  const isInternal = cp.isInternal;
  const effectiveDate = payrollMonthStr;

  // ── Step 3: Get CP headcount for tiered pricing ──
  const headcount = await getCpActiveHeadcount(cpId);

  // ── Step 4: Build Layer 1 line items (EG → CP) ──
  const layer1Items: InsertInvoiceItem[] = [];
  let layer1Subtotal = 0;
  let layer1ServiceFeeTotal = 0;

  for (const emp of employeeData) {
    // Employment cost line item (same for both layers)
    layer1Items.push({
      invoiceId: 0, // Will be set after invoice creation
      description: `Employment Cost - ${emp.employeeName} (${monthLabel})`,
      quantity: "1",
      unitPrice: emp.totalEmploymentCostLocal.toFixed(2),
      amount: emp.totalEmploymentCostSettlement.toFixed(2),
      itemType: "employment_cost",
      isImmutableCost: true, // Employment costs cannot be edited
      vatRate: "0",
      countryCode: emp.countryCode,
      localCurrency: emp.localCurrency,
      localAmount: emp.totalEmploymentCostLocal.toFixed(2),
      exchangeRate: emp.exchangeRate.toString(),
      exchangeRateWithMarkup: emp.exchangeRateWithMarkup.toString(),
      employeeId: emp.employeeId,
    });

    layer1Subtotal += emp.totalEmploymentCostSettlement;

    // Layer 1 service fee
    const l1Fee = await getLayer1ServiceFee(
      cpId,
      emp.countryCode,
      emp.serviceType,
      headcount,
      effectiveDate,
      warnings
    );

    let l1FeeAmount = 0;
    if (l1Fee) {
      l1FeeAmount = resolveActualFee(l1Fee, emp.totalEmploymentCostSettlement);
    }

    layer1ServiceFeeTotal += l1FeeAmount;

    if (l1FeeAmount > 0) {
      const feeLabel =
        emp.serviceType === "visa_eor"
          ? "Visa EOR Service Fee"
          : "EOR Service Fee";
      layer1Items.push({
        invoiceId: 0,
        description: `${feeLabel} - ${emp.employeeName}`,
        quantity: "1",
        unitPrice: l1FeeAmount.toFixed(2),
        amount: l1FeeAmount.toFixed(2),
        itemType:
          emp.serviceType === "visa_eor"
            ? "visa_eor_service_fee"
            : "eor_service_fee",
        isImmutableCost: false,
        vatRate: "0",
        countryCode: emp.countryCode,
        employeeId: emp.employeeId,
      });
    }
  }

  const layer1Total = layer1Subtotal + layer1ServiceFeeTotal;

  // ── Step 5: Create Layer 1 Invoice (EG → CP) ──
  const layer1InvoiceNumber = await generateInvoiceNumber(
    billingEntityId,
    new Date(payrollMonthStr)
  );

  const cpTermDays = cp.paymentTermDays || 30;
  const issueDate = new Date();
  const layer1DueDate = new Date(issueDate);
  layer1DueDate.setDate(layer1DueDate.getDate() + cpTermDays);

  const layer1Data: InsertInvoice = {
    customerId,
    channelPartnerId: cpId,
    billingEntityId,
    invoiceNumber: layer1InvoiceNumber,
    invoiceType,
    invoiceLayer: isInternal ? "eg_to_client" : "eg_to_cp",
    invoiceMonth: payrollMonthStr,
    currency: settlementCurrency,
    exchangeRate: exchangeRate.toString(),
    exchangeRateWithMarkup: exchangeRateWithMarkup.toString(),
    subtotal: layer1Subtotal.toFixed(2),
    serviceFeeTotal: layer1ServiceFeeTotal.toFixed(2),
    tax: "0.00",
    total: layer1Total.toFixed(2),
    status: "draft", // All invoices start as draft
    dueDate: layer1DueDate.toISOString().slice(0, 10),
    amountDue: layer1Total.toFixed(2),
    notes: `Payroll Invoice for ${monthLabel}`,
    internalNotes: isInternal
      ? `EG-DIRECT (EG→Client) | Customer: #${customerId} | Headcount: ${headcount}`
      : `Layer 1 (EG→CP) | CP: ${cp.companyName} | Headcount: ${headcount}`,
  };

  const layer1Insert = await db
    .insert(invoices)
    .values(layer1Data)
    .returning({ id: invoices.id });
  const layer1InvoiceId = layer1Insert[0]?.id;

  if (!layer1InvoiceId) {
    warnings.push(
      `Failed to create Layer 1 invoice for customer #${customerId}`
    );
    return null;
  }

  // Insert Layer 1 line items
  const finalL1Items = layer1Items.map((li) => ({
    ...li,
    invoiceId: layer1InvoiceId,
  }));
  if (finalL1Items.length > 0) {
    await db.insert(invoiceItems).values(finalL1Items);
  }

  // ── Step 6: For internal CP (EG-DIRECT), skip Layer 2 ──
  if (isInternal) {
    return {
      layer1InvoiceId,
      layer2InvoiceId: null,
    };
  }

  // ── Step 7: Build Layer 2 line items (CP → Client) ──
  const layer2Items: InsertInvoiceItem[] = [];
  let layer2Subtotal = 0;
  let layer2ServiceFeeTotal = 0;

  for (const emp of employeeData) {
    // Employment cost line item (same base cost, marked as immutable)
    layer2Items.push({
      invoiceId: 0,
      description: `Employment Cost - ${emp.employeeName} (${monthLabel})`,
      quantity: "1",
      unitPrice: emp.totalEmploymentCostLocal.toFixed(2),
      amount: emp.totalEmploymentCostSettlement.toFixed(2),
      itemType: "employment_cost",
      isImmutableCost: true, // CP cannot modify employment costs
      vatRate: "0",
      countryCode: emp.countryCode,
      localCurrency: emp.localCurrency,
      localAmount: emp.totalEmploymentCostLocal.toFixed(2),
      exchangeRate: emp.exchangeRate.toString(),
      exchangeRateWithMarkup: emp.exchangeRateWithMarkup.toString(),
      employeeId: emp.employeeId,
    });

    layer2Subtotal += emp.totalEmploymentCostSettlement;

    // Layer 2 service fee (CP → Client pricing)
    const l2Fee = await getLayer2ServiceFee(
      cpId,
      customerId,
      emp.countryCode,
      emp.serviceType,
      effectiveDate,
      warnings
    );

    let l2FeeAmount = 0;
    if (l2Fee) {
      l2FeeAmount = resolveActualFee(l2Fee, emp.totalEmploymentCostSettlement);
    }

    layer2ServiceFeeTotal += l2FeeAmount;

    if (l2FeeAmount > 0) {
      const feeLabel =
        emp.serviceType === "visa_eor"
          ? "Visa EOR Service Fee"
          : "EOR Service Fee";
      layer2Items.push({
        invoiceId: 0,
        description: `${feeLabel} - ${emp.employeeName}`,
        quantity: "1",
        unitPrice: l2FeeAmount.toFixed(2),
        amount: l2FeeAmount.toFixed(2),
        itemType:
          emp.serviceType === "visa_eor"
            ? "visa_eor_service_fee"
            : "eor_service_fee",
        isImmutableCost: false, // CP can adjust service fees before sending
        vatRate: "0",
        countryCode: emp.countryCode,
        employeeId: emp.employeeId,
      });
    }
  }

  const layer2Total = layer2Subtotal + layer2ServiceFeeTotal;

  // ── Step 8: Create Layer 2 Invoice (CP → Client) ──
  const layer2InvoiceNumber = await generateCpInvoiceNumber(cpId);

  const clientTermDays = customer.paymentTermDays || 30;
  const layer2DueDate = new Date(issueDate);
  layer2DueDate.setDate(layer2DueDate.getDate() + clientTermDays);

  const layer2Data: InsertInvoice = {
    customerId,
    channelPartnerId: cpId,
    billingEntityId: null, // Layer 2 uses CP's own billing info, not EG's billing entity
    invoiceNumber: layer2InvoiceNumber,
    invoiceType,
    invoiceLayer: "cp_to_client",
    parentInvoiceId: layer1InvoiceId,
    invoiceMonth: payrollMonthStr,
    currency: settlementCurrency,
    exchangeRate: exchangeRate.toString(),
    exchangeRateWithMarkup: exchangeRateWithMarkup.toString(),
    subtotal: layer2Subtotal.toFixed(2),
    serviceFeeTotal: layer2ServiceFeeTotal.toFixed(2),
    tax: "0.00",
    total: layer2Total.toFixed(2),
    status: "draft", // CP must review and send manually
    dueDate: layer2DueDate.toISOString().slice(0, 10),
    amountDue: layer2Total.toFixed(2),
    notes: `Invoice for ${monthLabel}`,
    // Internal notes visible only to EG admin, not to CP
    internalNotes: `Layer 2 (CP→Client) | Parent L1: #${layer1InvoiceId} | CP: ${cp.companyName}`,
  };

  const layer2Insert = await db
    .insert(invoices)
    .values(layer2Data)
    .returning({ id: invoices.id });
  const layer2InvoiceId = layer2Insert[0]?.id;

  if (!layer2InvoiceId) {
    warnings.push(
      `Failed to create Layer 2 invoice for customer #${customerId}. Layer 1 was created (#${layer1InvoiceId}).`
    );
    return {
      layer1InvoiceId,
      layer2InvoiceId: null,
    };
  }

  // Insert Layer 2 line items
  const finalL2Items = layer2Items.map((li) => ({
    ...li,
    invoiceId: layer2InvoiceId,
  }));
  if (finalL2Items.length > 0) {
    await db.insert(invoiceItems).values(finalL2Items);
  }

  return {
    layer1InvoiceId,
    layer2InvoiceId,
  };
}

/**
 * When regenerating invoices, also delete associated Layer 2 invoices.
 * This ensures that both layers are regenerated together.
 */
export async function deleteLayer2ForLayer1(
  layer1InvoiceIds: number[]
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  if (layer1InvoiceIds.length === 0) return [];

  // Find all Layer 2 invoices that reference these Layer 1 invoices
  const layer2Invoices = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        inArray(invoices.parentInvoiceId, layer1InvoiceIds),
        eq(invoices.invoiceLayer, "cp_to_client"),
        eq(invoices.status, "draft") // Only delete drafts; sent/paid L2 invoices should not be auto-deleted
      )
    );

  const layer2Ids = layer2Invoices.map((i) => i.id);

  if (layer2Ids.length > 0) {
    // Delete Layer 2 items first
    await db
      .delete(invoiceItems)
      .where(inArray(invoiceItems.invoiceId, layer2Ids));
    // Delete Layer 2 invoices
    await db.delete(invoices).where(inArray(invoices.id, layer2Ids));
  }

  return layer2Ids;
}
