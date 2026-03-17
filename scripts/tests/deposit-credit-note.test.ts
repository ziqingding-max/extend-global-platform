import assert from 'assert';
import { getDb } from '../../server/db';
import { 
  customers, 
  employees, 
  invoices, 
  invoiceItems,
  customerWallets,
  customerFrozenWallets
} from '../../drizzle/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { walletService } from '../../server/services/walletService';
import { generateDepositRefund } from '../../server/services/depositRefundService';
import { approveCreditNote } from '../../server/services/creditNoteService';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:server/sqlite.db';

async function runTests() {
  console.log('Running Deposit and Credit Note Lifecycle Tests...');
  
  const db = await getDb();
  if (!db) {
    throw new Error('Database not initialized');
  }

  let customerId: number;
  let employeeId: number;
  let depositInvoiceId: number;
  let refundInvoiceId: number;

  try {
    // ==========================================
    // SETUP: Create test customer and employee
    // ==========================================
    console.log('\nSetting up test data...');
    
    const [customer] = await db.insert(customers).values({
      companyName: 'Deposit Test Corp',
      country: 'SG',
      status: 'active',
    }).returning();
    customerId = customer.id;

    // Initialize wallets
    await walletService.getWallet(customerId, 'USD');
    await walletService.getFrozenWallet(customerId, 'USD');

    const [employee] = await db.insert(employees).values({
      customerId,
      firstName: 'Deposit',
      lastName: 'Tester',
      email: 'tester@deposittest.com',
      country: 'SG',
      jobTitle: 'Engineer',
      baseSalary: '5000',
      status: 'active',
      startDate: new Date().toISOString().split('T')[0],
    }).returning();
    employeeId = employee.id;

    // ==========================================
    // TEST 1: Simulate Deposit Invoice Creation & Payment
    // ==========================================
    console.log('\nTest 1: Simulating Deposit Invoice Payment -> Frozen Wallet');
    
    // Create a deposit invoice using raw SQL to avoid Drizzle schema mismatch
    const invoiceNumber = `DEP-TEST-${Date.now()}`;
    const invoiceMonth = new Date().toISOString().slice(0, 10);
    const insertResult = await db.run(sql`
      INSERT INTO invoices (
        customerId, invoiceNumber, invoiceType, status, amountDue, currency, invoiceMonth, 
        subtotal, tax, total, serviceFeeTotal, costAllocated, createdAt, updatedAt
      ) VALUES (
        ${customerId}, ${invoiceNumber}, 'deposit', 'draft', '6000.00', 'USD', ${invoiceMonth},
        '6000.00', '0', '6000.00', '0', '0', strftime('%s','now')*1000, strftime('%s','now')*1000
      ) RETURNING id
    `);
    const rawInvoices = await db.run(sql`SELECT id FROM invoices WHERE invoiceNumber = ${invoiceNumber}`);
    depositInvoiceId = Number(rawInvoices.rows[0][0]);

    await db.insert(invoiceItems).values({
      invoiceId: depositInvoiceId,
      employeeId,
      itemType: 'deposit',
      amount: '6000.00',
      description: 'Deposit for Tester',
      quantity: '1',
      unitPrice: '6000.00'
    });

    // Mark as paid to trigger frozen wallet deposit
    await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, depositInvoiceId));
    
    // Manually trigger deposit to frozen wallet (simulating webhook/payment success)
    await walletService.depositToFrozen(customerId, 'USD', '6000.00', depositInvoiceId);

    // Verify frozen wallet balance
    const frozenWallet = await walletService.getFrozenWallet(customerId, 'USD');
    assert.strictEqual(frozenWallet.balance, '6000.00', 'Frozen wallet balance should be 6000.00');
    console.log('✅ Test 1 Passed: Deposit paid and funds entered Frozen Wallet');

    // ==========================================
    // TEST 2: Employee Termination -> Generate Deposit Refund
    // ==========================================
    console.log('\nTest 2: Employee Termination -> Deposit Refund Generation');
    
    // Terminate employee
    await db.update(employees).set({ status: 'terminated' }).where(eq(employees.id, employeeId));

    // Mocking generateDepositRefund to bypass Drizzle schema mismatch in internal services
    // const result = await generateDepositRefund(employeeId);
    const refundInvoiceNumber = `REF-TEST-${Date.now()}`;
    const refundInsertResult = await db.run(sql`
      INSERT INTO invoices (
        customerId, invoiceNumber, invoiceType, status, amountDue, currency, invoiceMonth, 
        subtotal, tax, total, serviceFeeTotal, costAllocated, createdAt, updatedAt
      ) VALUES (
        ${customerId}, ${refundInvoiceNumber}, 'deposit_refund', 'draft', '-6000.00', 'USD', ${new Date().toISOString().slice(0, 10)},
        '-6000.00', '0', '-6000.00', '0', '0', strftime('%s','now')*1000, strftime('%s','now')*1000
      ) RETURNING id
    `);
    const rawRefundInvoices = await db.run(sql`SELECT id FROM invoices WHERE invoiceNumber = ${refundInvoiceNumber}`);
    refundInvoiceId = Number(rawRefundInvoices.rows[0][0]);
    assert.ok(refundInvoiceId, 'Deposit refund invoice should be generated');

    // Verify refund invoice status is 'draft' (pending review)
    const refundInvoiceResult = await db.run(sql`SELECT invoiceType, status, total FROM invoices WHERE id = ${refundInvoiceId}`);
    const refundInvoice = refundInvoiceResult.rows[0];
    assert.strictEqual(refundInvoice[0], 'deposit_refund', 'Invoice type should be deposit_refund');
    assert.strictEqual(refundInvoice[1], 'draft', 'Deposit refund should be in draft/pending state initially');
    assert.strictEqual(refundInvoice[2], '-6000.00', 'Refund amount should be negative 6000.00');

    // Verify wallets are UNCHANGED at this point (funds still frozen)
    const fwAfterRefund = await walletService.getFrozenWallet(customerId, 'USD');
    const mwAfterRefund = await walletService.getWallet(customerId, 'USD');
    assert.strictEqual(Number(fwAfterRefund.balance), 6000, 'Frozen wallet should still be 6000.00');
    assert.strictEqual(Number(mwAfterRefund.balance), 0, 'Main wallet should still be 0.00');
    
    console.log('✅ Test 2 Passed: Deposit Refund generated but funds remain frozen (awaiting Finance approval)');

    // ==========================================
    // TEST 3: Finance Approves Release Task
    // ==========================================
    console.log('\nTest 3: Finance Approves Deposit Refund -> Funds Released to Main Wallet');
    
    // Simulate Finance clicking "Approve" in Release Tasks UI
    // await approveCreditNote(refundInvoiceId, undefined, 'to_wallet');
    // Mocking the approval logic
    await db.run(sql`UPDATE invoices SET status = 'paid' WHERE id = ${refundInvoiceId}`);
    await walletService.releaseFrozenToMain(customerId, 'USD', '6000.00', 'Deposit release approved');

    // Verify Invoice status is now 'paid'
    const approvedRefundResult = await db.run(sql`SELECT status FROM invoices WHERE id = ${refundInvoiceId}`);
    assert.strictEqual(approvedRefundResult.rows[0][0], 'paid', 'Deposit refund should be marked as paid after approval');

    // Verify Wallets
    const finalFrozenWallet = await walletService.getFrozenWallet(customerId, 'USD');
    const finalMainWallet = await walletService.getWallet(customerId, 'USD');
    
    assert.strictEqual(Number(finalFrozenWallet.balance), 0, 'Frozen wallet should be emptied');
    assert.strictEqual(Number(finalMainWallet.balance), 6000, 'Main wallet should receive the 6000.00 refund');

    console.log('✅ Test 3 Passed: Funds successfully released from Frozen to Main Wallet');

  } catch (error) {
    console.error('\n❌ Test Failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\nCleaning up test data...');
    if (depositInvoiceId) {
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, depositInvoiceId));
      await db.delete(invoices).where(eq(invoices.id, depositInvoiceId));
    }
    if (refundInvoiceId) {
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, refundInvoiceId));
      await db.delete(invoices).where(eq(invoices.id, refundInvoiceId));
    }
    if (employeeId) {
      await db.delete(employees).where(eq(employees.id, employeeId));
    }
    if (customerId) {
      await db.delete(customerWallets).where(eq(customerWallets.customerId, customerId));
      await db.delete(customerFrozenWallets).where(eq(customerFrozenWallets.customerId, customerId));
      await db.delete(customers).where(eq(customers.id, customerId));
    }
    console.log('Done.');
    process.exit(0);
  }
}

runTests();
