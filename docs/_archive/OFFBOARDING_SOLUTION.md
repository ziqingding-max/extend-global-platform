# Technical Solution: Symmetric Offboarding & Termination Lifecycle

## 1. Overview
This document outlines the technical solution for refactoring the employee and contractor offboarding/termination workflow. The goal is to implement a symmetric lifecycle model where state transitions are driven by `startDate` (for activation) and `endDate` (for termination), with auto-transition cron jobs handling the normal flow, and manual "Now" buttons reserved for emergency situations.

## 2. Identified Bugs to Fix

### 2.1 Payroll Exclusion Bug (HIGH)
- **Issue**: `getActiveEmployeesForPayroll` in `server/services/db/employeeService.ts` currently excludes `offboarding` employees. This means employees in their notice period won't be added to the draft payroll runs.
- **Fix**: Modify the query to include both `active` and `offboarding` employees.
- **Impact**: Ensures offboarding employees get paid during their notice period.

### 2.2 Leave Accrual Exclusion Bug (HIGH)
- **Issue**: `runMonthlyLeaveAccrual` in `server/cronJobs.ts` currently only processes `active` and `on_leave` employees, excluding `offboarding` employees.
- **Fix**: Add `offboarding` status to the query fetching eligible employees for leave accrual.
- **Impact**: Ensures employees continue to accrue annual leave during their notice period.

## 3. Database Schema Changes

No database schema migrations are required for this phase. The existing `employees` and `contractors` tables already have `endDate` and `status` fields. 

*Note: For the Portal termination request feature, we will use a notification-based approach (sending an email/in-app notification to the Admin/Operations Manager) rather than creating a new `terminationRequests` table, keeping the implementation lightweight and consistent with how new employee requests are handled.*

## 4. Backend Implementation

### 4.1 Cron Job: Auto-Termination
- **File**: `server/cronJobs.ts`
- **Implementation**: Create `runEmployeeAutoTermination()` mirroring `runEmployeeAutoActivation()`.
- **Logic**:
  - Find all employees with `status = 'offboarding'` where `endDate <= today`.
  - Update their status to `terminated`.
  - Log an audit action: `System auto-terminated employee (endDate: X)`.
  - Schedule it to run daily at 00:01 Beijing time.

### 4.2 Admin Employee Update Endpoint
- **File**: `server/routers/employees.ts`
- **Validation**: Ensure `endDate` is provided when transitioning to `offboarding` or `terminated`.
- **Audit Logging**: Add reason recording for manual status transitions.

### 4.3 Contractor Terminate Endpoint
- **File**: `server/routers/contractors.ts`
- **Implementation**: Update the `terminate` mutation to accept an optional `endDate` and `reason` instead of hardcoding `endDate = today`.

### 4.4 Notification Service
- **File**: `server/services/notificationConstants.ts`
- **Implementation**: Add a new notification type `termination_request` (similar to `new_employee_request`).

## 5. Frontend Implementation

### 5.1 Admin Employee Detail Page (`client/src/pages/Employees.tsx`)
- **Dialog 1: Start Offboarding**
  - Triggered by "Start Offboarding" button.
  - Requires mandatory `endDate` (Last Working Day).
  - Optional `reason` field.
  - Action: Updates status to `offboarding` and sets `endDate`.
- **Dialog 2: Terminate Now (Emergency)**
  - Triggered by "Terminate" button (when in `offboarding` or `active`).
  - Requires mandatory `reason` field.
  - Action: Updates status to `terminated` and sets `endDate` to today.
- **Dialog 3: Activate Now (Emergency)**
  - Triggered by "Activate Now" button (when in `contract_signed`).
  - Requires mandatory `reason` field.
  - Action: Updates status to `active` and sets `startDate` to today.

### 5.2 Portal Employee Detail Page (`client/src/pages/portal/PortalEmployeeDetail.tsx`)
- **Feature**: Add "Request Termination" button for active employees.
- **Implementation**:
  - Open a dialog asking for requested `endDate` and `reason`.
  - Call a new TRPC endpoint `portalTrpc.employees.requestTermination`.
  - Endpoint will trigger the `termination_request` notification to admins.

### 5.3 Admin Contractor Detail Page (`client/src/pages/ContractorDetail.tsx`)
- **Feature**: Update the Terminate action to use a dialog instead of a one-click confirmation.
- **Implementation**:
  - Dialog requires `endDate` (defaults to today) and optional `reason`.
  - Calls updated `contractors.terminate` endpoint.

## 6. Testing Strategy (QA Perspective)

1. **Payroll**: Verify an employee in `offboarding` status appears in the newly generated monthly draft payroll run.
2. **Leave Accrual**: Verify an employee in `offboarding` status receives their monthly leave accrual on the 1st of the month.
3. **Auto-Termination**: Manually set an offboarding employee's `endDate` to yesterday, run the cron job, and verify they transition to `terminated`.
4. **Validation**: Attempt to "Start Offboarding" without providing an `endDate` and ensure the UI blocks it.
5. **Emergency Actions**: Use "Terminate Now" and verify the `endDate` is updated to today in the database.

## 7. Next Steps

1. Await user confirmation on this technical solution.
2. Proceed with backend changes (Fixing the HIGH bugs first).
3. Implement frontend dialogs and state management.
4. Update `BUSINESS-RULES.md` to reflect the new symmetric lifecycle.
lifecycle.
