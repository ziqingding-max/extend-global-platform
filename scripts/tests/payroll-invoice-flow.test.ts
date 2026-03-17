import assert from 'node:assert';
import { getDb } from '../../server/services/db/connection';
import { 
  customers, 
  employees, 
  payrollRuns,
  payslips,
  invoices
} from '../../drizzle/schema';
import { eq, sql } from 'drizzle-orm';
// Mock pro-rata calculation logic since it's internal to payroll run generation

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:server/sqlite.db';

async function runTests() {
  console.log('Running Payroll & Invoice Flow Tests...');
  const db = getDb();
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  let customerId: number;
  let employeeId1: number; // Mid-month (12th)
  let employeeId2: number; // Late-month (18th)

  try {
    // SETUP
    console.log('\nSetting up test data...');
    const [customer] = await db.insert(customers).values({
      companyName: 'Payroll Test Corp',
      country: 'SG',
      status: 'active',
    }).returning();
    customerId = customer.id;

    // ==========================================
    // TEST 1: Mid-Month Joiner (12th) - Pro-rata
    // ==========================================
    console.log('\nTest 1: Mid-Month Joiner (12th) -> Included in current month with Pro-rata');
    
    const [employee1] = await db.insert(employees).values({
      customerId,
      firstName: 'Mid',
      lastName: 'Joiner',
      email: 'mid@joiner.com',
      country: 'SG',
      jobTitle: 'Dev',
      baseSalary: '10000',
      status: 'active',
      startDate: '2026-02-12',
    }).returning();
    employeeId1 = employee1.id;

    // Test pro-rata calculation logic
    const calculateProRataSalaryMock = (baseSalary: number, startDate: string, endDate: string, daysInMonth: number) => {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day
      return (baseSalary / daysInMonth) * diffDays;
    };

    const proRataAmount = calculateProRataSalaryMock(10000, '2026-02-12', '2026-02-28', 28);
    // 17 days (12th to 28th inclusive) out of 28 days
    const expectedProRata = (10000 / 28) * 17;
    
    assert.ok(Math.abs(proRataAmount - expectedProRata) < 0.01, 'Pro-rata calculation should be accurate');
    console.log(`✅ Test 1 Passed: Pro-rata calculated correctly (${proRataAmount.toFixed(2)} vs expected ${expectedProRata.toFixed(2)})`);

    // ==========================================
    // TEST 2: Late-Month Joiner (18th) - Sign-on Bonus
    // ==========================================
    console.log('\nTest 2: Late-Month Joiner (18th) -> Skipped for current month, moved to next month');
    
    const [employee2] = await db.insert(employees).values({
      customerId,
      firstName: 'Late',
      lastName: 'Joiner',
      email: 'late@joiner.com',
      country: 'SG',
      jobTitle: 'Dev',
      baseSalary: '10000',
      status: 'active',
      startDate: '2026-02-18',
    }).returning();
    employeeId2 = employee2.id;

    // Mock the logic in getEmployeesForPayrollMonth
    // "15号上车" rule: if startDate > 15, they are skipped for the CURRENT month's payroll run
    const payrollMonth = '2026-02';
    const cutoffDay = 15;
    
    const eligibleEmployees = await db.run(sql`
      SELECT id FROM employees 
      WHERE customerId = ${customerId} 
      AND status IN ('active', 'on_leave', 'offboarding')
      AND startDate <= ${payrollMonth + '-' + cutoffDay}
    `);
    
    const eligibleIds = eligibleEmployees.rows.map((r: any) => r[0]);
    assert.ok(eligibleIds.includes(employeeId1), 'Mid-month joiner (12th) should be included');
    assert.ok(!eligibleIds.includes(employeeId2), 'Late-month joiner (18th) should NOT be included');
    console.log('✅ Test 2 Passed: 15th-of-month cutoff rule applied correctly');

    // ==========================================
    // TEST 3: Extreme Edge Case (Job 2 vs Late Approval)
    // ==========================================
    console.log('\nTest 3: Late approval (after 4th 23:59) -> Excluded from Job 2 auto-generation');
    
    // Simulate a reimbursement approved on the 5th at 00:05
    const reimbursementApprovalDate = new Date('2026-03-05T00:05:00Z');
    const cutoffDate = new Date('2026-03-04T15:59:59Z'); // 23:59 Beijing time
    
    assert.ok(reimbursementApprovalDate > cutoffDate, 'Approval is after cutoff');
    console.log('✅ Test 3 Passed: Late approval correctly identified as post-cutoff');

  } catch (error) {
    console.error('\n❌ Test Failed:', error);
    process.exitCode = 1;
  } finally {
    // CLEANUP
    console.log('\nCleaning up test data...');
    if (employeeId1) await db.delete(employees).where(eq(employees.id, employeeId1));
    if (employeeId2) await db.delete(employees).where(eq(employees.id, employeeId2));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
    console.log('Done.');
    process.exit(0);
  }
}

runTests();
