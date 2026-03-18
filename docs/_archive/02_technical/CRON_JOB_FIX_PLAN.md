# Cron Job Lifecycle Refactoring Plan

## 1. Overview
This document outlines the comprehensive implementation plan for fixing and enhancing the 7 background cron jobs in the GEA Platform. The plan addresses issues ranging from configuration mismatches and data flow gaps to UI visibility and timezone alignment.

## 2. Implementation Plan by Role Perspective

### 2.1 Product Manager Perspective
From a product standpoint, the goal is to ensure the automated background processes exactly match the business rules, leave no edge cases unhandled, and provide full visibility and control to administrators.

**Key Value Deliverables:**
- **Fair Compensation:** Employees joining after the mid-month cutoff will automatically receive a "Sign-on Bonus" in their next month's payroll, ensuring their pro-rata work days are compensated accurately without manual intervention.
- **Data Integrity:** All approved reimbursements will now correctly flow into the automated payroll generation, preventing missed payments.
- **Auditability:** Automated payroll runs will now strictly link back to the exact adjustments and reimbursements they consumed, closing a major compliance and traceability gap.
- **Admin Control:** The Settings dashboard will expose all 7 background jobs, allowing admins to toggle them on/off, adjust their schedules, and manually trigger them without developer assistance.

### 2.2 Developer Perspective
From a technical standpoint, the fixes involve addressing configuration key mismatches, adding missing data aggregations, ensuring referential integrity during data consumption, and building a dynamic React UI driven by the existing tRPC backend.

**Technical Tasks:**

| Component | Task Description | Complexity |
|-----------|------------------|------------|
| **Job 1 (Activation)** | Fix `getSystemConfig` key from `mid_month_cutoff_day` to `mid_month_activation_cutoff` to match DB/UI. | Low |
| **Job 1 (Activation)** | Add logic to create a `submitted` adjustment (`type="bonus"`, `category="other"`) for pro-rata days when `dayOfMonth > midMonthCutoff`. Set `effectiveMonth` to next month. | Medium |
| **Job 3 (Payroll)** | Add `getSubmittedReimbursementsForPayroll` to `runAutoCreatePayrollRuns` and aggregate amounts into the `reimbursements` field of `createPayrollItem`. | Medium |
| **Job 3 (Payroll)** | Implement a post-creation update step: fetch all `locked` adjustments/leave/reimbursements for the `prevMonthPayroll` that have `payrollRunId IS NULL`, and update them with the newly created `runId`. | High |
| **Job 5 (Overdue)** | Update `todayStr` calculation to use Beijing time (`Asia/Shanghai`) instead of UTC to align with other cron jobs. | Low |
| **Job 6 (Exchange)** | Update the description string in `CRON_JOB_DEFS` to reflect the actual primary data source (ExchangeRate-API with Frankfurter fallback) instead of just "ECB". | Low |
| **Settings UI** | Create a new "Scheduled Jobs" `<Card>` in `PayrollConfigSection`. Iterate over `configs` to display the 7 jobs with toggle switches (enabled), day inputs, and time inputs. Wire up the existing `updateMutation` and `trigger` endpoints. | High |

### 2.3 QA / Test Engineer Perspective
From a quality assurance standpoint, testing must verify both the automated state transitions and the data boundaries.

**Test Scenarios:**

1. **Job 1 - Sign-on Bonus Generation:**
   - *Given* an employee with `startDate` = 2026-01-20 and `mid_month_activation_cutoff` = 15.
   - *When* Job 1 runs on 2026-01-20.
   - *Then* the employee becomes `active`, is NOT added to January payroll, AND a new adjustment is created with `status="submitted"`, `adjustmentType="bonus"`, and `effectiveMonth="2026-02-01"`. The amount must exactly match the pro-rata calculation for the remaining working days in January.

2. **Job 3 - Reimbursement Aggregation:**
   - *Given* a locked reimbursement of $100 for an employee in the previous month.
   - *When* Job 3 creates the payroll run.
   - *Then* the employee's payroll item must have `reimbursements="100"` and the gross/net totals must reflect this addition.

3. **Job 3 - Referential Integrity (payrollRunId):**
   - *Given* locked adjustments and reimbursements consumed by Job 3.
   - *When* Job 3 completes.
   - *Then* the `adjustments` and `reimbursements` tables must have their `payrollRunId` column updated to the newly created payroll run's ID.

4. **Settings UI - Dynamic Scheduling:**
   - *Given* the Admin Settings page.
   - *When* the admin changes the time of "Overdue Invoice Detection" from 00:03 to 08:00 and saves.
   - *Then* the backend must successfully stop the old cron task and start a new one with the updated cron expression, without requiring a server restart.

## 3. Execution Sequence
1. Implement backend logic fixes in `server/cronJobs.ts` (Jobs 1, 3, 5, 6).
2. Implement referential integrity updates in `server/cronJobs.ts` (Job 3 payrollRunId write-back).
3. Build the "Scheduled Jobs" configuration panel in `client/src/pages/Settings.tsx`.
4. Compile, run manual triggers via UI to verify behavior, and review database state.
5. Commit changes and push Pull Request.
