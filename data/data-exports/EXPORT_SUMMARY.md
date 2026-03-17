# Data Export Summary

**Export Date:** 2026-03-02T18:09:03.251Z

## Baseline Data (System Configuration)
Total Records: 2211

| Table | Records | Description |
|:---|---:|:---|
| countries_config | 126 | Country configurations with payroll cycles, leave types, currency |
| leave_types | 767 | Leave type definitions per country |
| public_holidays | 1312 | Public holidays per country and year |
| system_config | 6 | Global system configuration |

## Production Data
Total Records: 470

| Table | Records | Description |
|:---|---:|:---|
| customers | 68 | Customer companies |
| customer_contacts | 1 | Customer contact persons |
| customer_pricing | 16 | Service pricing per customer/country |
| customer_contracts | 4 | Customer contracts |
| customer_leave_policies | 13 | Leave policies per customer |
| employees | 105 | Employee records |
| employee_contracts | 0 | Employee contracts |
| leave_balances | 0 | Leave balance records |
| leave_records | 0 | Leave transaction records |
| payroll_runs | 2 | Payroll run records |
| payroll_items | 0 | Payroll line items |
| invoices | 126 | Invoice records |
| invoice_items | 126 | Invoice line items |
| adjustments | 0 | Payroll adjustments |
| vendors | 1 | Vendor records |
| vendor_bills | 0 | Vendor bill records |
| users | 8 | Admin user accounts |

## Total
- Baseline Records: 2211
- Production Records: 470
- **Grand Total: 2681**

## Restore Instructions

### Restore Baseline Data Only
```bash
npx tsx restore-baseline-data.mjs
```

### Restore Production Data Only
```bash
npx tsx restore-production-data.mjs
```

### Restore All Data
```bash
npx tsx restore-all-data.mjs
```

## File Structure
```
data-exports/
├── baseline/
│   ├── countries_config.json
│   ├── leave_types.json
│   ├── public_holidays.json
│   └── system_config.json
├── production/
│   ├── customers.json
│   ├── employees.json
│   ├── invoices.json
│   ├── payroll_runs.json
│   └── ... (13 more files)
└── EXPORT_SUMMARY.md
```
