# Additional P0-Level Findings Discovered During Audit

## NEW P0: CronJob Signature Mismatches (should be elevated from P1 to P0)

The cronJobs issues are MORE severe than originally classified as P1, because they break critical automated business processes:

### 1. lockSubmittedAdjustments - missing countryCode param
CronJob calls with 1 param, function expects 2. No adjustments will ever be auto-locked.

### 2. lockSubmittedLeaveRecords - missing countryCode param
CronJob calls with 1 param, function expects 2. No leave records will ever be auto-locked.

### 3. getSubmittedAdjustmentsForPayroll - extra param + wrong status filter
CronJob passes 3 params (including ["locked"]), function accepts 2 and hardcodes 'admin_approved'. Payroll will never aggregate locked adjustments.

### 4. getSubmittedUnpaidLeaveForPayroll - extra param + wrong status filter
Same as above. Payroll will never aggregate locked unpaid leave.

### 5. getContractSignedEmployeesReadyForActivation - ignores todayStr param
Function accepts 0 params, cron passes 1. Function returns ALL onboarding employees, not just those with startDate <= today. Wrong employees may be activated.

### 6. getEmployeesForPayrollMonth - wrong param types
Function expects (country, year: number, month: number), cron passes (country, "2026-03-01", "2026-03-31"). Function ignores year/month in implementation so accidentally works.

### 7. listEmployees in cronJobs - same mismatch as P0 #1
CronJob line 649: `listEmployees({ status: "active" }, 10000, 0)` - passes filter object as page number. Same mismatch as P0 issue #1.

### 8. listLeaveBalances in cronJobs - extra param
Service: `listLeaveBalances(employeeId: number)` (1 param)
CronJob: `listLeaveBalances(emp.id, currentYear)` (2 params)
The `currentYear` param is ignored. Function returns ALL balances for employee, not filtered by year.

## NEW P0: Reimbursements Router expects array but gets {data, total}
Router line 44: `items.map(...)` - calls .map() on the result of listReimbursements.
But listReimbursements returns `{data, total}` not an array.
This will crash with "items.map is not a function".

## NEW P0: Reimbursements effectiveMonth Date-to-text
Router line 62: `effectiveMonth: new Date(normalizedMonth)` writes Date object to text column.
Schema: `effectiveMonth: text("effectiveMonth")`.
