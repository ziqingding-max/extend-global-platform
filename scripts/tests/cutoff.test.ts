import assert from 'node:assert';
import { checkCutoffPassed } from '../../server/utils/cutoff';

// Helper to mock current system time
let originalDate = global.Date;
const mockSystemTime = (isoString: string) => {
  const mockDate = new Date(isoString);
  // @ts-ignore
  global.Date = class extends originalDate {
    constructor(...args: any[]) {
      super(...args);
      if (args.length === 0) return mockDate;
      return new originalDate(...args);
    }
    static now() {
      return mockDate.getTime();
    }
  };
};

const restoreTime = () => {
  global.Date = originalDate;
};

// Mock dependencies directly if possible, but since we are running without Jest, 
// we rely on the actual DB connection if we don't mock the module loader.
// The best way for a standalone script is to just let it connect to the dev DB
// or mock the require cache if needed. For cutoff.ts, it imports getSystemConfig from db.
// We can intercept the call or just let it use the real db with default values.

async function runTests() {
  console.log('Running Cutoff Utility Tests...');
  let passed = 0;
  let failed = 0;

  const testCases = [
    {
      name: 'should return cutoff NOT passed when current time is BEFORE the 4th of next month (Beijing Time)',
      fn: async () => {
        // Payroll Month: 2026-02
        // Cutoff: 2026-03-04 23:59:00 (UTC+8) -> 2026-03-04 15:59:00 (UTC)
        mockSystemTime('2026-03-04T10:00:00.000Z');
        const result = await checkCutoffPassed('2026-02-01');
        assert.strictEqual(result.passed, false);
      }
    },
    {
      name: 'should return cutoff PASSED when current time is AFTER the 4th of next month (Beijing Time)',
      fn: async () => {
        // Current time: March 4, 2026, 16:05:00 UTC (00:05 March 5 Beijing time) - AFTER cutoff
        mockSystemTime('2026-03-04T16:05:00.000Z');
        const result = await checkCutoffPassed('2026-02-01');
        assert.strictEqual(result.passed, true);
      }
    },
    {
      name: 'should handle cross-year cutoff correctly (December payroll)',
      fn: async () => {
        // Current time: Jan 4, 2027, 10:00:00 UTC - BEFORE cutoff
        mockSystemTime('2027-01-04T10:00:00.000Z');
        let result = await checkCutoffPassed('2026-12-01');
        assert.strictEqual(result.passed, false);

        // Current time: Jan 4, 2027, 16:05:00 UTC - AFTER cutoff
        mockSystemTime('2027-01-04T16:05:00.000Z');
        result = await checkCutoffPassed('2026-12-01');
        assert.strictEqual(result.passed, true);
      }
    },
    {
      name: 'should handle leap year correctly',
      fn: async () => {
        // Current time: Feb 29, 2024, 10:00:00 UTC - BEFORE cutoff
        mockSystemTime('2024-02-29T10:00:00.000Z');
        const result = await checkCutoffPassed('2024-02-01');
        assert.strictEqual(result.passed, false);
      }
    }
  ];

  for (const test of testCases) {
    try {
      await test.fn();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ ${test.name}`);
      console.error(`   Error: ${err.message}`);
      failed++;
    } finally {
      restoreTime();
    }
  }

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(console.error);
