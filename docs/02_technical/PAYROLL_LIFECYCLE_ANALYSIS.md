# Payroll Lifecycle System Analysis & Refactoring Proposal

**Author:** Manus AI (Product Manager, R&D Engineer, QA Engineer)
**Date:** March 13, 2026

This document provides a comprehensive system-level analysis of the payroll lifecycle in the GEA Platform. It identifies critical design flaws, logical inconsistencies, and data flow breaks in the current implementation, and proposes a holistic refactoring plan.

## 1. Current Architecture & Logic Flaws

The payroll lifecycle currently operates through two parallel tracks that are conceptually misaligned: the automated Cron Job track and the manual Admin Action track.

### 1.1 The Month-Attribution Misalignment

The most fundamental flaw is how different parts of the system interpret "which month's data belongs to which payroll run."

| Process | Data Source Month | Rationale / Implication |
|---------|-------------------|-------------------------|
| **Cron Job (`runAutoCreatePayrollRuns`)** | `prevMonth` (e.g., March run uses Feb data) | Designed with a 1-month delay. Assumes Feb data is locked on Mar 5, then immediately consumed to create the Mar payroll run. |
| **Manual `autoFill` (Admin UI)** | `currentMonth` (e.g., March run uses Mar data) | Assumes N-month payroll should reflect N-month data. |
| **Manual `addItem` (Admin UI)** | `currentMonth` | Same as `autoFill`. |

**Impact:** If the Cron Job runs, the March payroll contains February's adjustments. If an admin clicks "Auto Fill" on the exact same March payroll run, the system attempts to pull March's adjustments. This leads to severe data inconsistency and financial errors.

### 1.2 The Status State Machine & "Locked" Trap

Data entities (Adjustments, Reimbursements, Leave Records) follow this state machine:
`submitted` → `client_approved` → `admin_approved` → `locked`

The transition to `locked` is intended to be a terminal state indicating the data has been consumed by a payroll run. However, the implementation is broken:

1. **The "Auto-Lock" Blind Spot:** The `runAutoLock` cron job locks all `admin_approved` data on the 5th of the month. However, it does not assign a `payrollRunId`.
2. **The Manual "Auto Fill" Blind Spot:** The manual `autoFill` mutation only queries for `admin_approved` status.
3. **The Resulting Deadlock:** If `runAutoLock` executes (changing data to `locked`), but `runAutoCreatePayrollRuns` fails or is skipped, the admin must use manual "Auto Fill". But manual "Auto Fill" cannot find the data because it is now `locked`, not `admin_approved`. The data becomes permanently orphaned.

### 1.3 The Deletion & Rollback Failure

When an admin deletes a payroll item via `deleteItem`, the system recalculates the payroll run totals but **fails to unlock the associated data**.

**Impact:** If an admin deletes a payroll item to fix a mistake, the associated adjustments, reimbursements, and leave records remain in the `locked` state. When the admin re-adds the employee or re-runs "Auto Fill", those items are ignored. The financial data disappears from the payroll entirely.

### 1.4 The Configuration vs. Hardcoding Disconnect

The Admin Settings UI allows configuration of the Payroll Lifecycle:
- `payroll_cutoff_day` (Default: 4)
- `payroll_auto_create_day` (Default: 5)

While `cutoff.ts` dynamically reads `payroll_cutoff_day` to enforce UI restrictions, `cronJobs.ts` has the execution schedule **hardcoded** to the 5th of the month (`"0 0 0 5 * *"`).

**Impact:** If an admin changes the auto-create day to the 10th in the UI, the cron job will still execute on the 5th. It will prematurely lock data before the actual cutoff day is reached.

### 1.5 Schema Inconsistencies

- `adjustments` table: Has `payrollRunId`
- `reimbursements` table: Has `payrollRunId`
- `leave_records` table: **Missing `payrollRunId`**

**Impact:** It is impossible to definitively trace which payroll run consumed a specific leave record once it is locked, making automated rollbacks or audits impossible.

---

## 2. Proposed Holistic Refactoring Plan

To resolve these systemic issues, we must establish a single source of truth for payroll attribution and enforce a rigorous, reversible state machine.

### Phase 1: Unify the Month-Attribution Logic (The "N-1" Rule)

We must standardize on the "N-1" rule across the entire platform: **The Payroll Run for Month N consumes the Adjustments, Reimbursements, and Leave Records from Month N-1.**

* **Action:** Refactor `autoFill`, `addItem`, and `previewItem` in `server/routers/payroll.ts` to query data using `prevMonth` instead of `payrollMonth`.
* **Action:** Ensure all queries target `effectiveMonth = prevMonth` (for Adjustments/Reimbursements) and `endDate` within `prevMonth` (for Leave Records).

### Phase 2: Fix the State Machine & Query Logic

We must allow manual processes to consume data that was automatically locked by the cron job, provided it hasn't been assigned to a specific payroll run yet.

* **Action:** Update the query logic in `getSubmittedAdjustmentsForPayroll`, `getSubmittedReimbursementsForPayroll`, and `getSubmittedUnpaidLeaveForPayroll`.
* **New Query Condition:**
  ```sql
  WHERE (status = 'admin_approved') 
     OR (status = 'locked' AND payrollRunId IS NULL)
  ```
* **Rationale:** This captures both fresh approvals and data that was bulk-locked by `runAutoLock` but never actually placed into a payroll run.

### Phase 3: Implement Safe Rollbacks (Unlock on Delete)

Deletion of a payroll item must be a fully reversible action that frees up the underlying data to be consumed again.

* **Action:** Modify the `deleteItem` mutation in `server/routers/payroll.ts`.
* **Logic:** Before deleting the `payroll_item`, query the database for all Adjustments and Reimbursements where `payrollRunId = existingItem.payrollRunId` AND `employeeId = existingItem.employeeId`. Update their status back to `admin_approved` and set `payrollRunId = NULL`.

### Phase 4: Schema Standardization

* **Action:** Create a Drizzle migration to add `payrollRunId: integer("payrollRunId")` to the `leave_records` table.
* **Action:** Update the `autoFill` and `addItem` mutations to write the `payrollRunId` to `leave_records` when locking them, mirroring the behavior of Adjustments.
* **Action:** Include `leave_records` in the Phase 3 rollback logic.

### Phase 5: Dynamic Cron Job Scheduling

Hardcoded cron schedules must be replaced with dynamic scheduling that respects the Admin Settings.

* **Action:** Refactor `server/cronJobs.ts`. Instead of hardcoding `"0 0 0 5 * *"`, the system should read `payroll_auto_create_day` from `system_settings` on startup.
* **Action:** Implement a mechanism to restart or reschedule the node-cron tasks whenever the Admin updates these settings via the `systemSettings.update` mutation.

---

## 3. QA & Testing Strategy

Once implemented, the following test cases must be executed to verify the integrity of the lifecycle:

1. **The Rollback Test:**
   - Create an adjustment (admin_approved).
   - Run manual Auto Fill (adjustment becomes locked, payrollRunId assigned).
   - Delete the employee's payroll item.
   - *Verify:* Adjustment returns to admin_approved and payrollRunId is NULL.
   - Run manual Auto Fill again.
   - *Verify:* Adjustment is successfully pulled back into the payroll run.

2. **The Cron-to-Manual Handoff Test:**
   - Create an adjustment (admin_approved).
   - Trigger `runAutoLock` manually (adjustment becomes locked, payrollRunId remains NULL).
   - Run manual Auto Fill on the UI.
   - *Verify:* The locked adjustment is successfully pulled into the payroll run and assigned the payrollRunId.

3. **The N-1 Month Test:**
   - Create a March payroll run.
   - Create one adjustment in Feb, one in Mar.
   - Run manual Auto Fill.
   - *Verify:* Only the Feb adjustment is pulled into the March payroll run.

## Conclusion

The current implementation treats automated and manual payroll generation as two separate, conflicting systems. By unifying the month-attribution logic, enforcing a strict `payrollRunId` association, and building proper rollback mechanisms, we can eliminate data loss and ensure financial accuracy across the platform.
