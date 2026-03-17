# Change Request: Clean Up Orphaned Test Invoices (customerId=1)

**Date**: 2026-02-28
**Severity**: P3 (Minor/Low - test data pollution, no impact on core functionality)
**Requester**: User (project owner)

## Business Context
After the previous production data cleanup (removed 17 test customers), 27 orphaned invoices remain in the database. These invoices reference `customerId = 1`, a test customer that was deleted. They appear in the invoice list as "Customer #1" since the JOIN fails to find a matching customer name.

## Technical Solution
Delete the 27 orphaned invoices where `customerId = 1` (which does not exist in the customers table). These invoices:
- All have `status = 'draft'` (never sent or paid)
- All have `invoiceType = 'monthly_eor'`
- All have `total = 1000.00 USD` (test amounts)
- Have zero associated `invoice_items`
- Were created between 2026-02-27 and 2026-02-28 during testing

## Risk Assessment
- **Risk Level**: Very Low
- **Impact**: None on real business data. All 27 records are test data with no downstream dependencies.
- **No invoice_items** associated with these invoices
- All real customers start at ID 780051+, while these reference ID 1

## Backup Plan
Backup the 27 records before deletion for audit trail.

## Rollback Plan
Re-insert the backed-up records if needed (unlikely since they are test data).

## Affected Invoice IDs
750001, 750003, 750004, 780001, 780003, 780004, 810001, 810003, 810004, 840001, 840003, 840004, 840025, 840027, 840028, 840110, 840112, 840113, 840134, 840136, 840137, 840158, 840160, 840161, 870001, 870003, 870004
