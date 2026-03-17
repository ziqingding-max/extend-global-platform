# Testing Strategy & Data Management

> **Purpose**: Mandatory testing rules for all AI Agents and developers. Every code change must include tests that create no persistent test data in the database.

---

## 1. Test Framework & Commands

| Item | Value |
|:---|:---|
| Framework | Vitest |
| Config | `vitest.config.ts` |
| Run all tests | `pnpm test` |
| Run specific file | `npx vitest run server/my-feature.test.ts` |
| Run with verbose | `npx vitest run --reporter=verbose` |
| Type check | `npx tsc --noEmit` |

---

## 2. Test File Organization

| Test Type | Location | Naming |
|:---|:---|:---|
| Backend unit/integration | `server/<feature>.test.ts` | Feature-based naming |
| Portal security | `server/portal/portal.security.test.ts` | Portal-specific |
| Portal invite | `server/portal/portalInvite.test.ts` | Portal-specific |
| Worker security | `server/worker/worker.security.test.ts` | Worker-specific |
| Reference example | `server/auth.logout.test.ts` | Template test |

There are currently 50 test files covering all major features (31 Admin, 12 Portal, 7 Worker). When adding a new feature, create a new test file rather than appending to an existing one (unless the test is a direct extension of an existing feature).

---

## 3. Test Data Cleanup — The Cardinal Rule

> **Every test file MUST clean up ALL data it creates. No exceptions.**

The project provides a `TestCleanup` utility class in `server/test-cleanup.ts` that handles cascading deletes in the correct order (respecting foreign key constraints). Every test file must use it.

### Required Pattern

```typescript
import { describe, it, expect, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { TestCleanup } from "./test-cleanup";

const cleanup = new TestCleanup();

afterAll(async () => {
  await cleanup.run();
});

describe("My Feature", () => {
  it("should create and verify something", async () => {
    const caller = createAdminCaller();
    
    // Create test data
    const customer = await caller.customers.create({ ... });
    cleanup.trackCustomer(customer.id);  // ← MUST track immediately after creation
    
    const employee = await caller.employees.create({ ... });
    cleanup.trackEmployee(employee.id);  // ← MUST track immediately
    
    // ... assertions ...
  });
});
```

### TestCleanup Tracking Methods

The `TestCleanup` class provides these tracking methods. Call the appropriate method immediately after creating each entity:

| Method | Tracks | Cascading Deletes |
|:---|:---|:---|
| `trackCustomer(id)` | Customer | Contacts, contracts, pricing, leave policies, invoices |
| `trackEmployee(id)` | Employee | Leave records, balances, adjustments, documents, contracts, payroll items |
| `trackInvoice(id)` | Invoice | Invoice items |
| `trackBillingEntity(id)` | Billing entity | — |
| `trackCountry(code)` | Country config | Leave types |
| `trackPayrollRun(id)` | Payroll run | — |
| `trackUser(id)` | Admin user | — |
| `trackVendor(id)` | Vendor | Vendor bills, bill items |
| `trackVendorBill(id)` | Vendor bill | Bill items |

### Deletion Order
The cleanup utility deletes in this order to respect foreign key constraints:

```
1. Invoice items → 2. Invoices
3. Employee-related (leave, adjustments, documents, contracts, payroll items)
4. Payroll runs
5. Employees
6. Customer-related (contacts, contracts, pricing, leave policies, invoices)
7. Customers
8. Billing entities
9. Country configs + leave types
10. Vendor bill items → Vendor bills → Vendors
11. Users
```

---

## 4. Test Context Helpers

### Admin Context (JWT)

```typescript
function createAdminCaller() {
  const ctx: TrpcContext = {
    user: {
      id: 1,
      email: "admin@test.com",
      name: "Test Admin",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}
```

### Role-Specific Context

To test role-based access, change the `role` field:

```typescript
function createManagerCaller(role: string) {
  const ctx: TrpcContext = {
    user: {
      ...baseUser, // Assumes a base user object is defined
      role: role, // e.g., "operations_manager", "finance_manager,customer_manager"
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}
```

### Portal Context

Portal tests use a separate tRPC instance for client-facing features:

```typescript
import { portalAppRouter } from "./portal/portalRouter";
import type { PortalContext } from "./portal/portalTrpc";

function createPortalCaller(customerId: number, contactId: number) {
  const ctx: PortalContext = {
    portalUser: {
      contactId,
      customerId,
      email: "test@portal.com",
      role: "admin",
    },
    req: { ... } as any,
    res: { ... } as any,
  };
  return portalAppRouter.createCaller(ctx);
}
```

### Worker Context

Worker tests use their own tRPC instance for employee/contractor-facing features:

```typescript
import { workerAppRouter } from "./worker/workerRouter";
import type { WorkerContext } from "./worker/workerTrpc";

function createWorkerCaller(employeeId: number) {
  const ctx: WorkerContext = {
    workerUser: {
      employeeId,
      email: "test@worker.com",
    },
    req: { ... } as any,
    res: { ... } as any,
  };
  return workerAppRouter.createCaller(ctx);
}
```

---

## 5. What to Test for Each Feature Type
### New CRUD Feature

| Test Case | Priority |
|:---|:---:|
| Create with valid data | High |
| Create with missing required fields (expect error) | High |
| List with pagination (page 1, page 2) | Medium |
| List with filters | Medium |
| Get by ID (exists) | High |
| Get by ID (not found, expect error) | High |
| Update with valid data | High |
| Delete (and verify cascade) | Medium |
| Permission check (wrong role, expect FORBIDDEN) | High |

### New Business Logic

| Test Case | Priority |
|:---|:---:|
| Happy path (normal flow) | High |
| Edge case: boundary values | High |
| Edge case: zero/null/empty inputs | High |
| State transition: valid transition | High |
| State transition: invalid transition (expect error) | High |
| Calculation accuracy (compare with manual calculation) | High |
| Concurrent operations (if applicable) | Medium |

### Bug Fix

| Test Case | Priority |
|:---|:---:|
| Reproduce the exact bug scenario | High |
| Verify the fix resolves the issue | High |
| Verify no regression on related features | Medium |

---

## 6. Test Data Naming Convention

Use distinctive prefixes to make test data easily identifiable and avoid collisions with production data:

```typescript
// ✅ Good: clearly identifiable test data
const customer = await caller.customers.create({
  companyName: "TEST-MyFeature Corp",
  // ...
});

// ✅ Good: unique identifiers
const employee = await caller.employees.create({
  firstName: "TestEmp",
  lastName: `Feature-${Date.now()}`,
  email: `test-${Date.now()}@example.com`,
  // ...
});

// ❌ Bad: looks like real data
const customer = await caller.customers.create({
  companyName: "Acme Corporation",
  // ...
});
```

---

## 7. Production Data Protection

These rules protect production data during testing:

1. **Never run tests against production database.** Tests connect to the same database as the dev server. The dev and production databases are separate environments (dev uses local SQLite, prod uses a file-based SQLite DB).

2. **Never use `DELETE FROM table` without a WHERE clause** in test cleanup. Always delete by specific tracked IDs.

3. **Never modify system settings in tests** unless you restore them in `afterAll`.

4. **Never create test data with IDs that could conflict** with production auto-increment sequences. Let the database assign IDs automatically.

5. **Always verify cleanup succeeded** by checking that tracked entities no longer exist after `cleanup.run()`.

---

## 8. Running Tests Before Delivery
Before saving a checkpoint or delivering work, run this verification sequence:

```bash
# 1. Type check (zero errors required)
npx tsc --noEmit

# 2. Run all tests (all must pass)
pnpm test

# 3. If specific tests fail, run them individually for detailed output
npx vitest run server/my-feature.test.ts --reporter=verbose
```

If pre-existing tests fail (not related to your changes), document the failures but do not modify those tests unless you understand the root cause.

---

## 9. Zero-Tolerance Test Data Policy (CRITICAL)

> **This system shares a single SQLite database between the dev server and Vitest. Test data that leaks into the database will appear in the development UI, corrupt dashboards, pollute reports, and degrade user experience. This has happened before and must never happen again.**

The following rules are **non-negotiable** and apply to every AI Agent and developer:

### 9.1 The Three Guarantees

Every test file must guarantee all three of the following:

| Guarantee | How to Verify |
|:---|:---|
| **G1: Track everything** | Every `create` call is immediately followed by a `cleanup.track*()` call |
| **G2: Clean up always** | `afterAll(async () => { await cleanup.run(); })` is present at the top level |
| **G3: Clean up even on failure** | `afterAll` runs even when tests fail — this is Vitest's default behavior |

### 9.2 Forbidden Patterns

```typescript
// ❌ FORBIDDEN: Creating data without tracking
const customer = await caller.customers.create({ companyName: "Test" });
// Missing: cleanup.trackCustomer(customer.id)

// ❌ FORBIDDEN: Using try/catch that swallows cleanup
try {
  const customer = await caller.customers.create({ ... });
  // If assertion fails here, customer is never tracked
  expect(customer.id).toBe(999);
  cleanup.trackCustomer(customer.id); // Too late if expect throws
} catch (e) { /* swallowed */ }

// ❌ FORBIDDEN: Manual browser/UI testing that creates data
// Never create customers, employees, or invoices via the browser during testing
// Use tRPC callers in test files instead

// ❌ FORBIDDEN: Test files without afterAll cleanup
describe("My Feature", () => {
  it("creates data", async () => { ... });
  // Missing afterAll!
});
```

### 9.3 Correct Pattern — Track Before Assert

```typescript
it("should create a customer", async () => {
  const customer = await caller.customers.create({ companyName: "TEST-Feature" });
  cleanup.trackCustomer(customer.id);  // ← Track IMMEDIATELY, before any assertions
  
  expect(customer.companyName).toBe("TEST-Feature");  // Assert after tracking
});
```

### 9.4 Browser/UI Testing Rules

When testing via the browser (manual or automated):

1. **Never create real-looking data** through the UI. If you must test form submission, use obviously fake names like `UITEST-DELETE-ME`.
2. **Always delete UI-created data** immediately after verifying the test. Use the admin UI delete function or a cleanup SQL query.
3. **Prefer tRPC caller tests** over browser tests for data creation/mutation scenarios.
4. **Document any data created via browser** in the task notes so it can be tracked and cleaned.

---

## 10. Post-Test Audit Checklist


Before delivering any work, run this audit to ensure zero test data leakage. These queries are for SQLite.

```sql
-- 1. Run all tests
-- pnpm test

-- 2. Check for test data in customers table
-- Should return 0 rows
SELECT id, companyName FROM customers 
WHERE companyName LIKE '%TEST%' OR companyName LIKE '%test%' 
   OR companyName LIKE '%script%' OR companyName LIKE '%demo%';

-- 3. Check for test data in employees table  
-- Should return 0 rows
SELECT id, firstName, lastName FROM employees
WHERE firstName LIKE '%Test%' OR lastName LIKE '%Test%'
   OR email LIKE '%test%' OR email LIKE '%example.com%';

-- 4. Check for orphaned records
-- Employees with non-existent customers
SELECT e.id, e.firstName, e.customerId FROM employees e
LEFT JOIN customers c ON e.customerId = c.id
WHERE c.id IS NULL;
```

If any of these queries return rows, the test data must be cleaned before the checkpoint is saved. This is a **blocking requirement** — do not proceed to checkpoint until the database is clean.
