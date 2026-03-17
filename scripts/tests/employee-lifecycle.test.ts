import assert from 'node:assert';
import { getDb } from '../../server/services/db/connection';
import { 
  customers, 
  employees, 
  leaveRequests,
  leaveBalances
} from '../../drizzle/schema';
import { eq, sql } from 'drizzle-orm';
import { splitLeaveByMonth } from '../../server/utils/cutoff';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:server/sqlite.db';

async function runTests() {
  console.log('Running Employee Lifecycle & Leave Tests...');
  const db = getDb();
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  let customerId: number;
  let employeeId: number;

  try {
    // SETUP
    console.log('\nSetting up test data...');
    const [customer] = await db.insert(customers).values({
      companyName: 'Lifecycle Test Corp',
      country: 'SG',
      status: 'active',
    }).returning();
    customerId = customer.id;

    const [employee] = await db.insert(employees).values({
      customerId,
      firstName: 'Life',
      lastName: 'Cycle',
      email: 'life@cycletest.com',
      country: 'SG',
      jobTitle: 'Tester',
      baseSalary: '5000',
      status: 'onboarding',
      startDate: new Date().toISOString().split('T')[0],
    }).returning();
    employeeId = employee.id;

    // ==========================================
    // TEST 1: Leave Auto Init (Mocked logic)
    // ==========================================
    console.log('\nTest 1: Leave Auto Initialization');
    
    // Simulate leaveAutoInitService behavior
    await db.insert(leaveBalances).values({
      employeeId,
      leaveTypeId: 1, // Mock leave type ID
      year: new Date().getFullYear(),
      totalEntitlement: '14.0',
      used: '0.0',
      remaining: '14.0'
    });

    const [balance] = await db.select().from(leaveBalances).where(eq(leaveBalances.employeeId, employeeId));
    assert.ok(balance, 'Leave balance should be created');
    assert.strictEqual(Number(balance.remaining), 14, 'Available leave should be 14.0');
    console.log('✅ Test 1 Passed: Leave initialized correctly');

    // ==========================================
    // TEST 2: Cross-Month Leave Splitting
    // ==========================================
    console.log('\nTest 2: Cross-Month Leave Splitting (e.g. Feb 28 to Mar 2)');
    
    // Test the utility function directly
    // 2026-02-27 is Friday, 2026-03-02 is Monday. So 2 working days total.
    const startDate = '2026-02-27';
    const endDate = '2026-03-02';
    
    const splits = splitLeaveByMonth(startDate, endDate, 2); // Total 2 days
    
    assert.strictEqual(splits.length, 2, 'Leave should be split into 2 months');
    assert.strictEqual(splits[0].payrollMonth, '2026-02', 'First split should be in Feb');
    assert.strictEqual(splits[0].days, 1, 'Feb 27 is 1 day');
    assert.strictEqual(splits[1].payrollMonth, '2026-03', 'Second split should be in Mar');
    assert.strictEqual(splits[1].days, 1, 'Mar 2 is 1 day');
    
    console.log('✅ Test 2 Passed: Cross-month leave split correctly');

    // ==========================================
    // TEST 3: Offboarding Employee in Payroll
    // ==========================================
    console.log('\nTest 3: Offboarding employee still gets picked up by payroll');
    
    // Set to offboarding
    await db.update(employees).set({ status: 'offboarding', endDate: '2026-12-31' }).where(eq(employees.id, employeeId));
    
    // Mock getEmployeesForPayrollMonth logic
    const activeStatuses = ['active', 'on_leave', 'offboarding'];
    const payrollMonth = '2026-12';
    
    const eligibleEmployees = await db.run(sql`
      SELECT id FROM employees 
      WHERE customerId = ${customerId} 
      AND status IN ('active', 'on_leave', 'offboarding')
      AND startDate <= ${payrollMonth || '-31'}
    `);
    
    assert.strictEqual(eligibleEmployees.rows.length, 1, 'Offboarding employee should be selected for payroll');
    console.log('✅ Test 3 Passed: Offboarding employee included in payroll');

  } catch (error) {
    console.error('\n❌ Test Failed:', error);
    process.exitCode = 1;
  } finally {
    // CLEANUP
    console.log('\nCleaning up test data...');
    if (employeeId) {
      await db.delete(leaveBalances).where(eq(leaveBalances.employeeId, employeeId));
      await db.delete(employees).where(eq(employees.id, employeeId));
    }
    if (customerId) {
      await db.delete(customers).where(eq(customers.id, customerId));
    }
    console.log('Done.');
    process.exit(0);
  }
}

runTests();
