# P0 Issue #1: Service Function Signature vs Router Call Mismatch Audit

## Summary: ALL 11 MISMATCHES CONFIRMED PRESENT

### 1. listCustomers - MISMATCH CONFIRMED
- **Service**: `listCustomers(page: number = 1, pageSize: number = 50, search?: string)`
- **Router call**: `listCustomers({status, search}, limit, offset)`
- **Problem**: First arg is object `{status, search}` but service expects `page: number`. Object becomes NaN in offset calc. `status` filter completely ignored by service.

### 2. listEmployees - MISMATCH CONFIRMED
- **Service**: `listEmployees(page: number = 1, pageSize: number = 50, search?: string)`
- **Router call**: `listEmployees({customerId, status, country, serviceType, search}, limit, offset)`
- **Problem**: First arg is object but service expects `page: number`. All filters (customerId, status, country, serviceType) completely ignored.

### 3. listAdjustments - MISMATCH CONFIRMED
- **Service**: `listAdjustments(page: number = 1, pageSize: number = 50)`
- **Router call**: `listAdjustments({customerId, employeeId, status, adjustmentType, effectiveMonth}, limit, offset)`
- **Problem**: First arg is filter object but service expects `page: number`. No filter support in service at all.

### 4. listReimbursements - MISMATCH CONFIRMED
- **Service**: `listReimbursements(page: number = 1, pageSize: number = 50)`
- **Router call**: `listReimbursements({customerId, employeeId, status, category, effectiveMonth}, limit, offset)`
- **Problem**: First arg is filter object but service expects `page: number`. No filter support in service. Also: router expects array return but service returns `{data, total}`.

### 5. listLeaveRecords - MISMATCH CONFIRMED
- **Service**: `listLeaveRecords(page: number = 1, pageSize: number = 50, employeeId?: number)`
- **Router call**: `listLeaveRecords({employeeId, status, month}, limit, offset)`
- **Problem**: First arg is filter object but service expects `page: number`. status and month filters ignored.

### 6. listVendors - MISMATCH CONFIRMED
- **Service**: `listVendors(page: number = 1, pageSize: number = 50)`
- **Router call**: `listVendors({status, country, vendorType, search}, limit, offset)`
- **Problem**: First arg is filter object but service expects `page: number`. No filter support in service at all.

### 7. listVendorBills - MISMATCH CONFIRMED
- **Service**: `listVendorBills(vendorId?: number)`
- **Router call**: `listVendorBills({vendorId, status, category, billMonth, search}, limit, offset)`
- **Problem**: First arg is filter object but service expects `vendorId?: number`. Object passed as vendorId won't match. No pagination. Returns array, not `{data, total}`.

### 8. listSalesLeads - MISMATCH CONFIRMED
- **Service**: `listSalesLeads(page: number = 1, pageSize: number = 50, search?: string)`
- **Router call**: `listSalesLeads({status, assignedTo, search}, limit, offset)`
- **Problem**: First arg is filter object but service expects `page: number`. status and assignedTo filters ignored.

### 9. listAuditLogs - MISMATCH CONFIRMED
- **Service**: `listAuditLogs(page: number = 1, pageSize: number = 50)`
- **Router call**: `listAuditLogs({entityType, userId}, limit, offset)`
- **Problem**: First arg is filter object but service expects `page: number`. No filter support in service at all.

### 10. listUsers - MISMATCH CONFIRMED (different pattern)
- **Service**: `listUsers(page: number = 1, pageSize: number = 50, search?: string)`
- **Router call**: `listUsers(input.limit, input.offset)`
- **Problem**: Router passes `limit` as `page` and `offset` as `pageSize`. Service does `offset = (page - 1) * pageSize` which with limit=100, offset=0 gives offset=(100-1)*0=0 (accidentally works for first page), but page 2 with limit=100, offset=100 gives offset=(100-1)*100=9900 (WRONG).

### 11. listAllExchangeRates - MISMATCH CONFIRMED (same pattern as #10)
- **Service**: `listAllExchangeRates(page: number = 1, pageSize: number = 50)`
- **Router call**: `listAllExchangeRates(input.limit, input.offset)`
- **Problem**: Same as #10 - limit passed as page, offset passed as pageSize.
