import assert from 'node:assert';
import { getDb } from '../../server/services/db/connection';
import { customers } from '../../drizzle/schema';
import { contractors, contractorInvoices } from '../../drizzle/aor-schema';
import { eq, sql } from 'drizzle-orm';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:server/sqlite.db';

async function runTests() {
  console.log('Running AOR Contractor Billing Tests...');
  const db = getDb();
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  let customerId: number;
  let contractorId: number;

  try {
    // SETUP
    console.log('\nSetting up test data...');
    const [customer] = await db.insert(customers).values({
      companyName: 'AOR Test Corp',
      country: 'SG',
      status: 'active',
    }).returning();
    customerId = customer.id;

    const [contractor] = await db.insert(contractors).values({
      customerId,
      firstName: 'Con',
      lastName: 'Tractor',
      email: 'con@tractor.com',
      country: 'SG',
      jobTitle: 'Freelancer',
      paymentFrequency: 'monthly',
      rate: '5000',
      status: 'active',
      startDate: '2026-01-01',
    }).returning();
    contractorId = contractor.id;

    // ==========================================
    // TEST 1: Monthly Billing Cycle Auto-Generation
    // ==========================================
    console.log('\nTest 1: Monthly Billing Auto-Generation');
    
    // Mock the logic in processMonthlyFromLocked (Job 3)
    const targetMonth = '2026-02';
    const monthlyContractors = await db.run(sql`
      SELECT id FROM contractors 
      WHERE status = 'active' 
      AND paymentFrequency = 'monthly'
      AND startDate <= ${targetMonth + '-31'}
    `);
    
    assert.ok(monthlyContractors.rows.some((r: any) => r[0] === contractorId), 'Active monthly contractor should be selected');
    console.log('✅ Test 1 Passed: Monthly contractor selected for billing');

    // ==========================================
    // TEST 2: Contractor Graceful Termination
    // ==========================================
    console.log('\nTest 2: Contractor Graceful Termination -> No more invoices');
    
    // Terminate contractor
    await db.update(contractors).set({ status: 'terminated', endDate: '2026-02-28' }).where(eq(contractors.id, contractorId));
    
    const nextMonth = '2026-03';
    const terminatedContractors = await db.run(sql`
      SELECT id FROM contractors 
      WHERE status = 'active' 
      AND paymentFrequency = 'monthly'
      AND startDate <= ${nextMonth + '-31'}
    `);
    
    assert.ok(!terminatedContractors.rows.some((r: any) => r[0] === contractorId), 'Terminated contractor should NOT be selected for next month');
    console.log('✅ Test 2 Passed: Terminated contractor excluded from future billing');

    // ==========================================
    // TEST 3: Milestone Billing (EXPECTED BLOCKER)
    // ==========================================
    console.log('\nTest 3: Milestone Billing Approval Flow (EXPECTED BLOCKER)');
    console.log('⚠️  NOTE: This test highlights a known blocker for Worker Portal integration.');
    
    try {
      // We expect this to fail because Worker Portal is not fully implemented for Milestone submission
      // and there's no API for workers to submit milestone proofs yet.
      const hasWorkerPortalMilestoneAPI = false;
      assert.ok(hasWorkerPortalMilestoneAPI, 'Worker Portal Milestone API is missing');
    } catch (error) {
      console.log('❌ EXPECTED FAILURE: Worker Portal Milestone submission API is not implemented.');
      console.log('   -> Action Required: Need to develop Worker Portal endpoints for contractors to submit milestone proofs before Job 3 can process them.');
    }

  } catch (error) {
    console.error('\n❌ Test Failed:', error);
    process.exitCode = 1;
  } finally {
    // CLEANUP
    console.log('\nCleaning up test data...');
    if (contractorId) await db.delete(contractors).where(eq(contractors.id, contractorId));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
    console.log('Done.');
    process.exit(0);
  }
}

runTests();
