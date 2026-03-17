# Impact Analysis: Gender-Based Leave Type Filtering

## 1. Executive Summary

This document provides a comprehensive impact analysis for the proposed implementation of gender-based leave type filtering in the GEA Platform. The goal is to ensure that gender-specific leave types (e.g., Maternity, Paternity) are only visible and applicable to employees of the corresponding gender, while maintaining existing functionality for company-level leave policy management.

**Core Requirements:**
- Male employees should NOT see/have Maternity Leave.
- Female employees should NOT see/have Paternity Leave.
- Employees with gender "other", "prefer_not_to_say", or null should see ALL leave types.
- Leave Policy editing (company-level) should remain unchanged (show all types).
- Existing incorrect balances (e.g., male with maternity balance) should be hidden in UI if unused, but preserved if used > 0.

## 2. Proposed Schema Changes

**Table:** `leave_types` (in `drizzle/schema.ts`)
- **New Field:** `applicableGender: text("applicableGender", { enum: ["male", "female", "all"] }).default("all").notNull()`
- **Migration Strategy:** 
  - Update existing records based on keywords in `leaveTypeName`.
  - "Maternity" (case-insensitive) -> "female"
  - "Paternity" (case-insensitive) -> "male"
  - All others -> "all"

## 3. Impact Analysis by Component

### 3.1. Database Initialization & Accrual
- **`initializeLeaveBalancesForEmployee` (`server/services/db/employeeService.ts`):**
  - **Current State:** Fetches all leave types for the country and creates balances.
  - **Impact:** Needs to filter `countryLeaveTypes` based on the employee's `gender`. If the employee is male, skip "female" leave types. If female, skip "male" leave types. If other/null, include all.
  - **Risk:** Low. Adding a simple filter before the loop will prevent incorrect balances from being created for new employees.
- **`runMonthlyLeaveAccrual` (`server/cronJobs.ts`):**
  - **Current State:** Only accrues "Annual" leave types.
  - **Impact:** None. Annual leave is not gender-specific.
- **`autoInitializeLeavePolicyForCountry` (`server/services/leaveAutoInitService.ts`):**
  - **Current State:** Initializes customer leave policies based on statutory defaults.
  - **Impact:** None. Company-level policies should include all leave types regardless of gender.

### 3.2. Leave Application & Validation (Backend)
- **Admin Leave Creation (`server/routers/leave.ts`):**
  - **Current State:** Validates employee existence, dates, overlapping records, and balances. Does not validate gender.
  - **Impact:** Needs validation: If `leaveType.applicableGender` is "male", ensure `employee.gender` is not "female" (and vice versa).
  - **Risk:** Medium. Must ensure we don't block valid applications for "other" or null genders.
- **Portal Leave Creation (`server/portal/routers/portalLeaveRouter.ts`):**
  - **Current State:** Similar to admin creation.
  - **Impact:** Needs the same gender validation as admin creation.
  - **Risk:** Medium. Same as above.
- **Worker Leave Creation (`server/worker/routers/workerLeaveRouter.ts`):**
  - **Current State:** Assuming similar to portal/admin.
  - **Impact:** Needs the same gender validation.

### 3.3. Frontend Display (Leave Balances & Types)
- **Admin Leave Form (`client/src/pages/Leave.tsx`):**
  - **Current State:** Fetches `leaveTypes` via `trpc.countries.leaveTypes.list` and `leaveBalances` via `trpc.employees.leaveBalances`.
  - **Impact:** 
    - The dropdown should filter out leave types that don't match the selected employee's gender.
    - The `leaveBalances` query should filter out balances for leave types that don't match the employee's gender AND have `used === 0`. If `used > 0`, it should be displayed even if incorrect (per requirements).
- **Portal Leave Form (`client/src/pages/portal/PortalLeave.tsx`):**
  - **Current State:** Fetches `leaveTypesByCountry` and `balances`.
  - **Impact:** Similar to admin. The dropdown and balance display need filtering based on the selected employee's gender.
- **Admin Employee Detail (`client/src/pages/Employees.tsx`):**
  - **Current State:** Displays all `leaveBalances` for the employee.
  - **Impact:** Filter `leaveBalances` to hide mismatched gender leave types where `used === 0`.
- **Portal Employee Detail (`client/src/pages/portal/PortalEmployeeDetail.tsx`):**
  - **Current State:** Displays all `leaveBalances`.
  - **Impact:** Filter `leaveBalances` similarly.
- **Worker Portal (if applicable):**
  - **Impact:** Filter leave types and balances based on the logged-in worker's gender.

### 3.4. Company-Level Configuration (No Impact Expected)
- **Admin Customers/Leave Policies (`client/src/pages/Customers.tsx`):**
  - **Requirement:** Should show all types.
  - **Impact:** None.
- **Portal Settings (`client/src/pages/portal/PortalSettings.tsx`):**
  - **Requirement:** Should show all types.
  - **Impact:** None.
- **Admin Countries/Leave Types (`client/src/components/pages/CountriesContent.tsx`):**
  - **Impact:** May need to display the `applicableGender` field in the UI for clarity, and allow editing it when creating/updating leave types.

## 4. Potential Risks & Edge Cases

1.  **Existing Data Integrity:** There are likely existing leave balances where a male employee has a 0-day or full entitlement for Maternity leave. 
    - *Mitigation:* The frontend filtering logic MUST ensure that if `used > 0`, the balance is still shown. If `used === 0`, it is hidden. We will NOT delete existing balances to avoid cascading issues with audit logs or historical reporting.
2.  **Gender Field Nullability:** The `gender` field in the `employees` table might be null or "prefer_not_to_say".
    - *Mitigation:* The logic will explicitly treat null, "other", and "prefer_not_to_say" as matching ALL leave types.
3.  **Leave Type Name Variations:** The migration script relies on "maternity" and "paternity" keywords. There might be variations like "Maternal Leave", "Paternal", "Adoption Leave" (which could be gender-neutral or specific depending on local laws).
    - *Mitigation:* We will stick to strict "maternity" and "paternity" matching for the automated migration. Any edge cases can be manually updated by admins later if we expose the field in the UI.

## 5. Implementation Plan

1.  **Database:**
    - Update `drizzle/schema.ts` to add `applicableGender` to `leaveTypes`.
    - Generate and apply Drizzle migration.
    - Create a one-time script (`server/scripts/migrateLeaveTypeGenders.ts`) to update existing records based on names.
2.  **Backend Logic:**
    - Update `initializeLeaveBalancesForEmployee` to filter by gender.
    - Update `server/routers/leave.ts` and `server/portal/routers/portalLeaveRouter.ts` to validate gender on creation.
    - Update `listLeaveBalances` or the API endpoints to optionally filter out `used === 0` mismatched balances, OR handle this filtering entirely on the frontend. (Frontend filtering is safer to ensure we don't break administrative overrides or API expectations).
3.  **Frontend Logic:**
    - Update `Leave.tsx`, `PortalLeave.tsx`, `Employees.tsx`, and `PortalEmployeeDetail.tsx` to filter the displayed leave balances and the leave type selection dropdowns based on the employee's gender.
    - Update `CountriesContent.tsx` to allow setting `applicableGender` when managing statutory leave types.

## 6. Conclusion
The proposed solution is robust and addresses the requirements without introducing significant risks to existing functionality. The separation of company-level policy (unfiltered) and employee-level application/display (filtered) is the correct architectural approach. Handling existing incorrect balances by hiding them (if unused) prevents data loss while cleaning up the UI.
