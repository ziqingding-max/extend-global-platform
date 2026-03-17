/**
 * Contractor Invoice Generation Service
 * 
 * Aligned with EOR payroll generation pattern:
 * - Generates contractor invoices from LOCKED milestones and adjustments
 * - Called by runAutoCreateContractorInvoices (5th 00:01 Beijing time)
 * - Uses scan condition: status = 'locked' AND invoiceId IS NULL
 * - Writes back invoiceId after creation (like EOR payrollRunId linkage)
 * 
 * Payment Types:
 * 1. Monthly: 1 invoice per month (base rate + locked adjustments)
 * 2. Semi-monthly: 2 invoices per month (1st-15th base, 16th-end base + adjustments)
 * 3. Milestone: 1 invoice per locked milestone (+ locked adjustments)
 */

import { getDb } from "./db/connection";
import {
  contractors,
  contractorInvoices,
  contractorInvoiceItems,
  contractorMilestones,
  contractorAdjustments,
  InsertContractorInvoice,
  InsertContractorInvoiceItem,
} from "../../drizzle/schema";
import { eq, and, sql, isNull, or, inArray } from "drizzle-orm";

export const ContractorInvoiceGenerationService = {

  /**
   * Generate contractor invoices from locked data for a specific month.
   * This is the primary entry point called by the cron job (5th 00:01).
   * 
   * @param effectiveMonth - The month to process in YYYY-MM-01 format
   * @param year - Year number
   * @param month - Month number (1-indexed)
   * @returns { created: number, errors: string[] }
   */
  async generateFromLockedData(
    effectiveMonth: string,
    year: number,
    month: number
  ): Promise<{ created: number; errors: string[] }> {
    const db = await getDb();
    if (!db) return { created: 0, errors: ["DB Connection Failed"] };

    let totalCreated = 0;
    const errors: string[] = [];

    // 1. Process Monthly Contractors
    try {
      const monthlyCount = await this.processMonthlyFromLocked(effectiveMonth, year, month);
      totalCreated += monthlyCount;
    } catch (e) {
      errors.push(`Monthly Invoice Error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 2. Process Semi-Monthly Contractors
    try {
      const semiMonthlyCount = await this.processSemiMonthlyFromLocked(effectiveMonth, year, month);
      totalCreated += semiMonthlyCount;
    } catch (e) {
      errors.push(`Semi-Monthly Invoice Error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 3. Process Milestone Contractors
    try {
      const milestoneCount = await this.processMilestoneFromLocked(effectiveMonth, year, month);
      totalCreated += milestoneCount;
    } catch (e) {
      errors.push(`Milestone Invoice Error: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { created: totalCreated, errors };
  },

  /**
   * Generate invoices for monthly contractors from locked data.
   * Creates 1 invoice per contractor per month:
   * - Base monthly rate as service_fee line item
   * - All locked adjustments for the month as separate line items
   *
   * DATA-DRIVEN: Also includes terminated contractors who have orphaned locked adjustments.
   */
  async processMonthlyFromLocked(
    effectiveMonth: string,
    year: number,
    month: number
  ): Promise<number> {
    const db = await getDb();
    if (!db) return 0;

    // Period: full month
    const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const invoiceDate = new Date().toISOString().split("T")[0];

    // Find active monthly contractors
    const activeContractors = await db
      .select()
      .from(contractors)
      .where(
        and(
          eq(contractors.status, "active"),
          eq(contractors.paymentFrequency, "monthly")
        )
      );

    // DATA-DRIVEN RESCUE: Find terminated monthly contractors with orphaned locked adjustments
    const activeIds = new Set(activeContractors.map(c => c.id));
    const orphanedAdj = await db
      .select({ contractorId: contractorAdjustments.contractorId })
      .from(contractorAdjustments)
      .where(
        and(
          eq(contractorAdjustments.effectiveMonth, effectiveMonth),
          eq(contractorAdjustments.status, "locked" as any),
          isNull(contractorAdjustments.invoiceId)
        )
      )
      .groupBy(contractorAdjustments.contractorId);

    const orphanedContractors = [];
    for (const row of orphanedAdj) {
      if (activeIds.has(row.contractorId)) continue;
      const [ctr] = await db.select().from(contractors)
        .where(and(eq(contractors.id, row.contractorId), eq(contractors.paymentFrequency, "monthly")))
        .limit(1);
      if (ctr) {
        orphanedContractors.push(ctr);
        console.log(`[ContractorInvoice] RESCUE: Including terminated monthly contractor #${ctr.id} - has orphaned locked adjustments`);
      }
    }

    const eligibleContractors = [...activeContractors, ...orphanedContractors];

    let count = 0;

    for (const contractor of eligibleContractors) {
      // Check for existing invoice for this period (prevent duplicates)
      const existing = await db
        .select()
        .from(contractorInvoices)
        .where(
          and(
            eq(contractorInvoices.contractorId, contractor.id),
            eq(contractorInvoices.periodStart, periodStart),
            eq(contractorInvoices.periodEnd, periodEnd)
          )
        )
        .limit(1);

      if (existing.length > 0) continue;

      // Get locked adjustments for this contractor and month
      const lockedAdjustments = await db
        .select()
        .from(contractorAdjustments)
        .where(
          and(
            eq(contractorAdjustments.contractorId, contractor.id),
            eq(contractorAdjustments.effectiveMonth, effectiveMonth),
            eq(contractorAdjustments.status, "locked" as any),
            isNull(contractorAdjustments.invoiceId)
          )
        );

      // Build line items
      const lineItems: InsertContractorInvoiceItem[] = [];
      let totalAmount = 0;
      const currency = contractor.currency;
      const adjustmentIdsToLink: number[] = [];

      // A. Base monthly rate
      if (contractor.rateAmount && contractor.rateType === "fixed_monthly") {
        const amount = parseFloat(contractor.rateAmount);
        totalAmount += amount;
        lineItems.push({
          invoiceId: 0,
          description: `Monthly Consulting Fee - ${periodStart} to ${periodEnd}`,
          quantity: "1",
          unitPrice: amount.toFixed(2),
          amount: amount.toFixed(2),
          itemType: "service_fee",
        });
      }

      // B. Locked adjustments
      for (const adj of lockedAdjustments) {
        if (adj.currency !== currency) continue;
        const amount = parseFloat(adj.amount);
        const isDeduction = adj.type === "deduction";
        const signedAmount = isDeduction ? -amount : amount;
        totalAmount += signedAmount;

        lineItems.push({
          invoiceId: 0,
          description: `${adj.type.toUpperCase()}: ${adj.description}`,
          quantity: "1",
          unitPrice: signedAmount.toFixed(2),
          amount: signedAmount.toFixed(2),
          itemType: isDeduction ? "adjustment" : (adj.type === "expense" ? "expense" : "adjustment"),
          adjustmentId: adj.id,
        });
        adjustmentIdsToLink.push(adj.id);
      }

      // Skip if no items
      if (lineItems.length === 0) continue;

      // Create invoice
      const invoiceNumber = generateContractorInvoiceNumber(contractor.id, year, month, "M");

      const invoiceData: InsertContractorInvoice = {
        invoiceNumber,
        contractorId: contractor.id,
        customerId: contractor.customerId,
        invoiceDate,
        periodStart,
        periodEnd,
        currency,
        totalAmount: totalAmount.toFixed(2),
        status: "draft",
      };

      const result = await db.insert(contractorInvoices).values(invoiceData).returning();
      const invoice = result[0];

      // Insert line items
      const itemsWithId = lineItems.map(item => ({ ...item, invoiceId: invoice.id }));
      await db.insert(contractorInvoiceItems).values(itemsWithId);

      // Link adjustments back (write invoiceId)
      for (const adjId of adjustmentIdsToLink) {
        await db.update(contractorAdjustments)
          .set({ invoiceId: invoice.id })
          .where(eq(contractorAdjustments.id, adjId));
      }

      count++;
      console.log(`[ContractorInvoice] Created monthly invoice ${invoiceNumber} for contractor #${contractor.id} (${totalAmount.toFixed(2)} ${currency})`);
    }

    return count;
  },

  /**
   * Generate invoices for semi-monthly contractors from locked data.
   * Creates 2 invoices per contractor per month:
   * - First half (1st-15th): base rate only
   * - Second half (16th-end): base rate + locked adjustments
   */
  async processSemiMonthlyFromLocked(
    effectiveMonth: string,
    year: number,
    month: number
  ): Promise<number> {
    const db = await getDb();
    if (!db) return 0;

    const lastDay = new Date(year, month, 0).getDate();
    const invoiceDate = new Date().toISOString().split("T")[0];

    // Two periods
    const periods = [
      {
        periodStart: `${year}-${String(month).padStart(2, "0")}-01`,
        periodEnd: `${year}-${String(month).padStart(2, "0")}-15`,
        suffix: "1H",
        includeAdjustments: false,
      },
      {
        periodStart: `${year}-${String(month).padStart(2, "0")}-16`,
        periodEnd: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
        suffix: "2H",
        includeAdjustments: true, // Adjustments only in second half
      },
    ];

    // Find active semi-monthly contractors
    const activeSemiMonthly = await db
      .select()
      .from(contractors)
      .where(
        and(
          eq(contractors.status, "active"),
          eq(contractors.paymentFrequency, "semi_monthly")
        )
      );

    // DATA-DRIVEN RESCUE: Find terminated semi-monthly contractors with orphaned locked adjustments
    const activeSemiIds = new Set(activeSemiMonthly.map(c => c.id));
    const orphanedSemiAdj = await db
      .select({ contractorId: contractorAdjustments.contractorId })
      .from(contractorAdjustments)
      .where(
        and(
          eq(contractorAdjustments.effectiveMonth, effectiveMonth),
          eq(contractorAdjustments.status, "locked" as any),
          isNull(contractorAdjustments.invoiceId)
        )
      )
      .groupBy(contractorAdjustments.contractorId);

    const orphanedSemiContractors = [];
    for (const row of orphanedSemiAdj) {
      if (activeSemiIds.has(row.contractorId)) continue;
      const [ctr] = await db.select().from(contractors)
        .where(and(eq(contractors.id, row.contractorId), eq(contractors.paymentFrequency, "semi_monthly")))
        .limit(1);
      if (ctr) {
        orphanedSemiContractors.push(ctr);
        console.log(`[ContractorInvoice] RESCUE: Including terminated semi-monthly contractor #${ctr.id} - has orphaned locked adjustments`);
      }
    }

    const eligibleContractors = [...activeSemiMonthly, ...orphanedSemiContractors];

    let count = 0;

    for (const contractor of eligibleContractors) {
      for (const period of periods) {
        // Check for existing invoice
        const existing = await db
          .select()
          .from(contractorInvoices)
          .where(
            and(
              eq(contractorInvoices.contractorId, contractor.id),
              eq(contractorInvoices.periodStart, period.periodStart),
              eq(contractorInvoices.periodEnd, period.periodEnd)
            )
          )
          .limit(1);

        if (existing.length > 0) continue;

        const lineItems: InsertContractorInvoiceItem[] = [];
        let totalAmount = 0;
        const currency = contractor.currency;
        const adjustmentIdsToLink: number[] = [];

        // A. Half monthly rate (rateAmount stores the semi-monthly amount)
        if (contractor.rateAmount && contractor.rateType === "fixed_monthly") {
          const amount = parseFloat(contractor.rateAmount);
          totalAmount += amount;
          lineItems.push({
            invoiceId: 0,
            description: `Semi-Monthly Consulting Fee - ${period.periodStart} to ${period.periodEnd}`,
            quantity: "1",
            unitPrice: amount.toFixed(2),
            amount: amount.toFixed(2),
            itemType: "service_fee",
          });
        }

        // B. Locked adjustments (only for second half)
        if (period.includeAdjustments) {
          const lockedAdjustments = await db
            .select()
            .from(contractorAdjustments)
            .where(
              and(
                eq(contractorAdjustments.contractorId, contractor.id),
                eq(contractorAdjustments.effectiveMonth, effectiveMonth),
                eq(contractorAdjustments.status, "locked" as any),
                isNull(contractorAdjustments.invoiceId)
              )
            );

          for (const adj of lockedAdjustments) {
            if (adj.currency !== currency) continue;
            const amount = parseFloat(adj.amount);
            const isDeduction = adj.type === "deduction";
            const signedAmount = isDeduction ? -amount : amount;
            totalAmount += signedAmount;

            lineItems.push({
              invoiceId: 0,
              description: `${adj.type.toUpperCase()}: ${adj.description}`,
              quantity: "1",
              unitPrice: signedAmount.toFixed(2),
              amount: signedAmount.toFixed(2),
              itemType: isDeduction ? "adjustment" : (adj.type === "expense" ? "expense" : "adjustment"),
              adjustmentId: adj.id,
            });
            adjustmentIdsToLink.push(adj.id);
          }
        }

        if (lineItems.length === 0) continue;

        // Create invoice
        const invoiceNumber = generateContractorInvoiceNumber(contractor.id, year, month, period.suffix);

        const invoiceData: InsertContractorInvoice = {
          invoiceNumber,
          contractorId: contractor.id,
          customerId: contractor.customerId,
          invoiceDate,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          currency,
          totalAmount: totalAmount.toFixed(2),
          status: "draft",
        };

        const result = await db.insert(contractorInvoices).values(invoiceData).returning();
        const invoice = result[0];

        const itemsWithId = lineItems.map(item => ({ ...item, invoiceId: invoice.id }));
        await db.insert(contractorInvoiceItems).values(itemsWithId);

        for (const adjId of adjustmentIdsToLink) {
          await db.update(contractorAdjustments)
            .set({ invoiceId: invoice.id })
            .where(eq(contractorAdjustments.id, adjId));
        }

        count++;
        console.log(`[ContractorInvoice] Created semi-monthly invoice ${invoiceNumber} for contractor #${contractor.id} (${totalAmount.toFixed(2)} ${currency})`);
      }
    }

    return count;
  },

  /**
   * Generate invoices for milestone contractors from locked data.
   * Creates 1 invoice per locked milestone:
   * - Milestone amount as the primary line item
   * - Locked adjustments are attached to the first milestone invoice
   */
  async processMilestoneFromLocked(
    effectiveMonth: string,
    year: number,
    month: number
  ): Promise<number> {
    const db = await getDb();
    if (!db) return 0;

    const invoiceDate = new Date().toISOString().split("T")[0];

    // Find locked milestones without invoiceId
    const lockedMilestones = await db
      .select()
      .from(contractorMilestones)
      .where(
        and(
          eq(contractorMilestones.effectiveMonth, effectiveMonth),
          eq(contractorMilestones.status, "locked" as any),
          isNull(contractorMilestones.invoiceId)
        )
      );

    let count = 0;

    // Track which contractors have already had adjustments attached
    const contractorsWithAdjAttached = new Set<number>();

    for (const milestone of lockedMilestones) {
      // Get contractor info
      const contractorResult = await db
        .select()
        .from(contractors)
        .where(eq(contractors.id, milestone.contractorId))
        .limit(1);

      if (contractorResult.length === 0) continue;
      const contractor = contractorResult[0];

      const lineItems: InsertContractorInvoiceItem[] = [];
      let totalAmount = parseFloat(milestone.amount);
      const currency = milestone.currency;
      const adjustmentIdsToLink: number[] = [];

      // A. Milestone line item
      lineItems.push({
        invoiceId: 0,
        description: `Milestone: ${milestone.title}`,
        quantity: "1",
        unitPrice: milestone.amount,
        amount: milestone.amount,
        itemType: "milestone",
        milestoneId: milestone.id,
      });

      // B. Attach locked adjustments (only once per contractor per month)
      if (!contractorsWithAdjAttached.has(contractor.id)) {
        const lockedAdjustments = await db
          .select()
          .from(contractorAdjustments)
          .where(
            and(
              eq(contractorAdjustments.contractorId, contractor.id),
              eq(contractorAdjustments.effectiveMonth, effectiveMonth),
              eq(contractorAdjustments.status, "locked" as any),
              isNull(contractorAdjustments.invoiceId)
            )
          );

        for (const adj of lockedAdjustments) {
          if (adj.currency !== currency) continue;
          const amount = parseFloat(adj.amount);
          const isDeduction = adj.type === "deduction";
          const signedAmount = isDeduction ? -amount : amount;
          totalAmount += signedAmount;

          lineItems.push({
            invoiceId: 0,
            description: `${adj.type.toUpperCase()}: ${adj.description}`,
            quantity: "1",
            unitPrice: signedAmount.toFixed(2),
            amount: signedAmount.toFixed(2),
            itemType: isDeduction ? "adjustment" : (adj.type === "expense" ? "expense" : "adjustment"),
            adjustmentId: adj.id,
          });
          adjustmentIdsToLink.push(adj.id);
        }

        contractorsWithAdjAttached.add(contractor.id);
      }

      // Create invoice
      const invoiceNumber = generateContractorInvoiceNumber(
        contractor.id, year, month, `MIL-${milestone.id}`
      );

      const invoiceData: InsertContractorInvoice = {
        invoiceNumber,
        contractorId: contractor.id,
        customerId: contractor.customerId,
        invoiceDate,
        currency,
        totalAmount: totalAmount.toFixed(2),
        status: "draft",
      };

      const result = await db.insert(contractorInvoices).values(invoiceData).returning();
      const invoice = result[0];

      const itemsWithId = lineItems.map(item => ({ ...item, invoiceId: invoice.id }));
      await db.insert(contractorInvoiceItems).values(itemsWithId);

      // Link milestone back
      await db.update(contractorMilestones)
        .set({ invoiceId: invoice.id })
        .where(eq(contractorMilestones.id, milestone.id));

      // Link adjustments back
      for (const adjId of adjustmentIdsToLink) {
        await db.update(contractorAdjustments)
          .set({ invoiceId: invoice.id })
          .where(eq(contractorAdjustments.id, adjId));
      }

      count++;
      console.log(`[ContractorInvoice] Created milestone invoice ${invoiceNumber} for contractor #${contractor.id} milestone #${milestone.id} (${totalAmount.toFixed(2)} ${currency})`);
    }

    return count;
  },

  /**
   * Legacy entry point - kept for backward compatibility but now delegates to generateFromLockedData.
   * Previously ran daily to sweep "approved" items; now only processes locked data.
   * @deprecated Use generateFromLockedData instead
   */
  async processAll(targetDate: Date = new Date()): Promise<{ generated: number; errors: string[] }> {
    const y = targetDate.getFullYear();
    const m = targetDate.getMonth() + 1;
    const effectiveMonth = `${y}-${String(m).padStart(2, "0")}-01`;
    
    const result = await this.generateFromLockedData(effectiveMonth, y, m);
    return { generated: result.created, errors: result.errors };
  },
};

/**
 * Generate a deterministic, unique invoice number for contractor invoices.
 * Format: CTR-INV-{YYYYMM}-{ContractorID}-{Suffix}
 * 
 * @param contractorId - The contractor's ID
 * @param year - Invoice year
 * @param month - Invoice month (1-indexed)
 * @param suffix - Type suffix: "M" (monthly), "1H"/"2H" (semi-monthly), "MIL-{id}" (milestone)
 */
function generateContractorInvoiceNumber(
  contractorId: number,
  year: number,
  month: number,
  suffix: string
): string {
  return `CTR-INV-${year}${String(month).padStart(2, "0")}-${contractorId}-${suffix}`;
}
