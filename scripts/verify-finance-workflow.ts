
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { ContractorInvoiceGenerationService } from '../server/services/contractorInvoiceGenerationService';
import { generateInvoicesFromPayroll } from '../server/services/invoiceGenerationService';
import { walletService } from '../server/services/walletService';
import { approveCreditNote } from '../server/services/creditNoteService';

// Initialize DB
const DATABASE_URL = process.env.DATABASE_URL || 'file:local.db';
const client = createClient({ url: DATABASE_URL.includes("://") ? DATABASE_URL : `file:${DATABASE_URL}` });
const db = drizzle(client, { schema });

// Ensure getDb works by setting env if not set (though it should be passed to script)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:local.db';
}

async function main() {
  console.log('🚀 Starting Finance Workflow Verification...');
  
  try {
    // 1. Setup Test Data
    console.log('\n--- Step 1: Setup Test Data ---');
    // Create Customer
    const customerCode = `TEST-${Date.now()}`;
    const custResult = await db.insert(schema.customers).values({
      clientCode: customerCode,
      companyName: `Test Company ${customerCode}`,
      country: 'US',
      settlementCurrency: 'USD',
      status: 'active',
      paymentTermDays: 30,
    }).returning();
    const customerId = custResult[0].id;
    console.log(`✅ Created Customer: ${custResult[0].companyName} (ID: ${customerId})`);

    // Create Contractor
    const contractorResult = await db.insert(schema.contractors).values({
      contractorCode: `CTR-${Date.now()}`,
      customerId,
      firstName: 'John',
      lastName: 'Doe',
      email: `john.${Date.now()}@example.com`,
      country: 'US',
      jobTitle: 'Software Engineer',
      paymentFrequency: 'monthly',
      rateType: 'fixed_monthly',
      rateAmount: '5000',
      currency: 'USD',
      startDate: '2024-01-01', // String for text column
      status: 'active',
    }).returning();
    const contractorId = contractorResult[0].id;
    console.log(`✅ Created Contractor: ${contractorResult[0].firstName} (ID: ${contractorId})`);

    // 2. Generate Contractor Invoice
    console.log('\n--- Step 2: Generate Contractor Invoice ---');
    const targetDate = new Date(); // Current month
    const genResult = await ContractorInvoiceGenerationService.processAll(targetDate);
    console.log(`ℹ️ Generation Result:`, genResult);
    
    // Find the invoice we just created
    const contractorInvoices = await db.select().from(schema.contractorInvoices)
      .where(eq(schema.contractorInvoices.contractorId, contractorId));
    
    if (contractorInvoices.length === 0) throw new Error("No contractor invoice generated");
    const cInvoice = contractorInvoices[0];
    console.log(`✅ Generated Contractor Invoice: ${cInvoice.invoiceNumber} (Status: ${cInvoice.status})`);

    // 3. Approve Contractor Invoice
    console.log('\n--- Step 3: Approve Contractor Invoice ---');
    await db.update(schema.contractorInvoices)
      .set({ status: 'approved', approvedAt: new Date() })
      .where(eq(schema.contractorInvoices.id, cInvoice.id));
    console.log(`✅ Approved Contractor Invoice #${cInvoice.id}`);

    // 4. Generate Client Invoice (Aggregation)
    console.log('\n--- Step 4: Aggregate to Client Invoice ---');
    const aggResult = await generateInvoicesFromPayroll(targetDate, "Test Month");
    console.log(`ℹ️ Aggregation Result:`, aggResult);
    
    if (!aggResult.invoiceIds || aggResult.invoiceIds.length === 0) {
       // Check if it was already generated?
       console.warn("No new invoices generated. Checking existing...");
    }

    // Verify Client Invoice
    const clientInvoices = await db.select().from(schema.invoices)
      .where(and(
        eq(schema.invoices.customerId, customerId),
        eq(schema.invoices.invoiceType, 'monthly_aor')
      ));
    
    if (clientInvoices.length === 0) throw new Error("Client Invoice not found");
    const clientInvoice = clientInvoices[0];
    console.log(`✅ Created Client Invoice: ${clientInvoice.invoiceNumber} (Total: ${clientInvoice.total})`);

    // Verify Linkage
    const updatedCInvoice = await db.query.contractorInvoices.findFirst({
      where: eq(schema.contractorInvoices.id, cInvoice.id)
    });
    if (updatedCInvoice?.clientInvoiceId !== clientInvoice.id) {
      throw new Error(`Linkage failed: Contractor Invoice ${cInvoice.id} not linked to Client Invoice ${clientInvoice.id}`);
    }
    console.log(`✅ Linkage Verified: Contractor Invoice -> Client Invoice`);

    // 5. Partial Payment
    console.log('\n--- Step 5: Partial Payment ---');
    // Top up wallet first to simulate balance
    const wallet = await walletService.getWallet(customerId, 'USD');
    // Use transact for top-up
    await walletService.transact({
      walletId: wallet.id,
      type: 'top_up',
      amount: '1000',
      direction: 'credit',
      referenceId: 0,
      referenceType: 'manual',
      description: 'Test Topup',
      createdBy: 1
    });
    
    console.log(`ℹ️ Wallet Balance: 1000 USD`);
    console.log(`ℹ️ Invoice Total: ${clientInvoice.total}`);
    
    // Pay 500 from Wallet, Rest from External
    // 1. Deduct 500 from wallet
    await walletService.transact({
      walletId: wallet.id,
      type: 'invoice_deduction',
      amount: '500',
      direction: 'debit',
      referenceId: clientInvoice.id,
      referenceType: 'invoice',
      description: 'Partial Payment',
      createdBy: 1
    });
    
    // 2. Update Invoice
    const remaining = parseFloat(clientInvoice.total) - 500;
    
    await db.update(schema.invoices).set({
      status: 'partially_paid',
      walletAppliedAmount: '500',
      paidAmount: '0', // external
      amountDue: remaining.toFixed(2)
    }).where(eq(schema.invoices.id, clientInvoice.id));
    
    const updatedInv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, clientInvoice.id) });
    console.log(`✅ Invoice Status: ${updatedInv?.status}, Due: ${updatedInv?.amountDue}, Wallet Applied: ${updatedInv?.walletAppliedAmount}`);

    // 6. Deposit Release Flow
    console.log('\n--- Step 6: Deposit Release Flow ---');
    // Create Deposit Invoice
    const depositInvResult = await db.insert(schema.invoices).values({
      customerId,
      invoiceNumber: `DEP-${Date.now()}`,
      invoiceType: 'deposit',
      total: '2000',
      subtotal: '2000',
      currency: 'USD',
      status: 'sent',
      amountDue: '2000'
    }).returning();
    const depositInv = depositInvResult[0];
    console.log(`✅ Created Deposit Invoice: ${depositInv.invoiceNumber}`);

    // Pay Deposit (Full)
    await db.update(schema.invoices).set({
      status: 'paid',
      paidAmount: '2000',
      amountDue: '0',
      paidDate: new Date()
    }).where(eq(schema.invoices.id, depositInv.id));
    
    // Credit Frozen Wallet
    await walletService.depositToFrozen(customerId, 'USD', '2000', depositInv.id, 1);
    const frozenWallet = await walletService.getFrozenWallet(customerId, 'USD');
    console.log(`✅ Deposit Paid. Frozen Balance: ${frozenWallet.balance}`);

    // Release to Credit Note
    // Create Draft CN
    const cnResult = await db.insert(schema.invoices).values({
      customerId,
      invoiceNumber: `CN-${Date.now()}`,
      invoiceType: 'credit_note',
      total: '-2000', 
      subtotal: '-2000',
      currency: 'USD',
      status: 'draft',
      relatedInvoiceId: depositInv.id, // Linked to deposit
      creditNoteDisposition: 'to_wallet'
    }).returning();
    const cn = cnResult[0];
    console.log(`✅ Created Draft Credit Note: ${cn.invoiceNumber}`);

    // Approve CN
    const approval = await approveCreditNote(cn.id, 1, 'to_wallet');
    console.log(`ℹ️ Approval Result:`, approval);

    // Verify Main Wallet Credit
    const finalMainWallet = await walletService.getWallet(customerId, 'USD');
    const finalFrozenWallet = await walletService.getFrozenWallet(customerId, 'USD');
    
    // Expected Main: 500 (from step 5 after paying 500) + 2000 (release) = 2500.
    console.log(`✅ Final Main Wallet Balance: ${finalMainWallet.balance} (Expected 2500)`);
    console.log(`✅ Final Frozen Wallet Balance: ${finalFrozenWallet.balance} (Expected 0)`);

    if (parseFloat(finalFrozenWallet.balance) !== 0) throw new Error("Frozen wallet not cleared");
    if (parseFloat(finalMainWallet.balance) !== 2500) throw new Error(`Main wallet balance mismatch. Got ${finalMainWallet.balance}, expected 2500`);

    console.log('\n🎉 Verification Successful!');

  } catch (err) {
    console.error('\n❌ Verification Failed:', err);
    process.exit(1);
  }
}

main();
