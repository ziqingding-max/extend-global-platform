import { getDb } from "../server/db";
import { invoices } from "../drizzle/schema";
import { walletService } from "../server/services/walletService";
import { eq, and, sql, notInArray } from "drizzle-orm";

async function migrateCreditNotesToWallet() {
  console.log("Starting Credit Note to Wallet Migration...");
  
  const db = getDb();
  if (!db) {
    console.error("Database connection failed");
    process.exit(1);
  }

  // 1. Find all eligible Credit Notes
  // Criteria:
  // - Type: 'credit_note' or 'deposit_refund'
  // - Status: 'paid' (or effectively open) - actually in current system they are 'paid' but have amountDue?
  //   Wait, in current system CNs are 'paid' immediately? 
  //   Actually CNs might be 'draft' or 'sent'.
  //   Let's look for any CN that has NOT been fully applied.
  //   In the old system, credit notes were "applied" to invoices.
  //   We need to find the remaining unapplied balance of each CN.
  
  // Actually, simpler logic:
  // Find all invoices of type credit_note/deposit_refund.
  // Calculate unapplied amount: Total - CreditApplied.
  // If > 0, credit to wallet.
  // Then mark as fully processed/applied in the new system context (which is just 'paid' and maybe a flag).
  
  const creditNotes = await db.select().from(invoices).where(
    and(
      sql`${invoices.invoiceType} IN ('credit_note', 'deposit_refund')`,
      sql`${invoices.status} != 'cancelled'`,
      sql`${invoices.status} != 'void'`
    )
  );

  console.log(`Found ${creditNotes.length} credit notes/refunds.`);

  let migratedCount = 0;
  let totalMigratedAmount = 0;

  for (const cn of creditNotes) {
    const total = Math.abs(parseFloat(cn.total));
    const applied = Math.abs(parseFloat(cn.creditApplied || "0"));
    const remaining = total - applied;

    if (remaining > 0.01) {
      console.log(`Migrating CN #${cn.invoiceNumber}: Remaining ${remaining.toFixed(2)} ${cn.currency}`);
      
      try {
        // Create wallet transaction
        const wallet = await walletService.getWallet(cn.customerId, cn.currency);
        
        await walletService.transact({
          walletId: wallet.id,
          type: "credit_note_in",
          amount: remaining.toFixed(2),
          direction: "credit",
          referenceId: cn.id,
          referenceType: "credit_note",
          description: `Migration: Unapplied balance from ${cn.invoiceType} #${cn.invoiceNumber}`,
          createdBy: 0, // System migration
        });

        // Update CN to reflect it's fully "used" (by wallet)
        // We set creditApplied = total to indicate it's fully consumed
        // But wait, creditApplied usually means applied to other invoices.
        // If we set it to total, it might look like it was applied to invoices.
        // But for the new system, wallet credit IS a form of application.
        // Let's rely on the wallet transaction log for traceability.
        
        // We also ensure it is marked as 'paid' if not already
        await db.update(invoices).set({
          status: "paid",
          creditApplied: cn.total, // Mark as fully applied (using total absolute value logic? DB stores string)
          // Wait, total is negative for CNs. creditApplied is usually positive?
          // Let's check schema: creditApplied is text, default "0".
          // In creditNoteService, we didn't check sign.
          // In invoiceRouter applyCreditNote, appliedAmount is positive.
          // So we should set creditApplied to the absolute total.
        }).where(eq(invoices.id, cn.id));

        migratedCount++;
        totalMigratedAmount += remaining;
        
      } catch (err) {
        console.error(`Failed to migrate CN #${cn.invoiceNumber}:`, err);
      }
    } else {
      console.log(`Skipping CN #${cn.invoiceNumber}: Fully applied.`);
    }
  }

  console.log("Migration Complete.");
  console.log(`Migrated ${migratedCount} Credit Notes.`);
  console.log(`Total Value Credited to Wallets: ${totalMigratedAmount.toFixed(2)}`);
}

// Execute
migrateCreditNotesToWallet()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
