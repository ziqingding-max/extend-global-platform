> **Purpose**: Definitive reference for all business rules, state machines, and calculation logic. AI Agents must consult this document before modifying any business logic.

---

## 1. Employee Lifecycle

Employees follow a strict state machine. Each transition has specific triggers and side effects.

```
pending_review → documents_incomplete → pending_review (loop)
pending_review → onboarding          [triggers: deposit invoice generation]
onboarding → contract_signed
contract_signed → active             [triggers: daily cron auto-activation when startDate arrives]
active → on_leave
on_leave → active
active → offboarding                 [requires: endDate (last working day)]
offboarding → terminated             [triggers: daily cron auto-termination when endDate arrives;
                                       triggers: deposit refund invoice generation]
```

**Hard Rules (must never be violated):**

1. **Offboarding employees MUST be included in payroll.** Employees in `offboarding` status are still employed and must receive salary until their `endDate`.
2. **Offboarding employees MUST continue to accrue leave.** The monthly leave accrual cron job must process `offboarding` employees alongside `active` and `on_leave` employees.

| Status | Meaning | Editable | In Payroll |
|:---|:---|:---:|:---:|
| `pending_review` | Initial submission, under review | Yes | No |
| `documents_incomplete` | Missing documents, needs resubmission | Yes | No |
| `onboarding` | Approved, contract being prepared | Yes | No |
| `contract_signed` | Contract signed, awaiting start date | Limited | No |
| `active` | Currently employed | Limited | Yes |
| `on_leave` | Extended leave (not unpaid leave records) | No | Depends |
| `offboarding` | Notice period, preparing exit | No | Yes |
| `terminated` | Employment ended | No | No |

**Side Effects of Status Changes:**

When an employee transitions to `onboarding`, the system generates a **deposit invoice** (see Section 6). When an employee transitions to `terminated`, the system generates a **deposit refund invoice** (see Section 7). When an employee transitions to `active`, the system **auto-initializes leave balances** (Annual Leave starts at 0, other types at full entitlement) and **auto-initializes leave policies** for the country if not yet configured.

**Symmetric Activation / Termination Cron Jobs:**

- **Auto-Activation** (daily 00:01 Beijing time): Employees in `contract_signed` status whose `startDate ≤ today` are automatically transitioned to `active`.
- **Auto-Termination** (daily 00:02 Beijing time): Employees in `offboarding` status whose `endDate ≤ today` are automatically transitioned to `terminated`.

**Pro-Rata Salary Calculation (Symmetric):**

When an employee starts mid-month, their salary is pro-rated based on `startDate`. When an employee terminates mid-month (endDate falls within the payroll month), their salary is also pro-rated based on `endDate`. If both apply in the same month, the pro-rata covers only the days between startDate and endDate.

**Portal Termination Requests:**

Portal clients can submit termination requests for `active` employees and contractors. The request includes a requested `endDate` and optional `reason`. A notification is sent to the admin team for review. The admin then processes the request by initiating offboarding (for employees) or terminating (for contractors) through the admin interface.

**Employee Code Format**: Auto-generated as `GEA-{COUNTRY_CODE}-{SEQ}` (e.g., `GEA-SG-001`). The sequence is per-country and auto-incremented.

**Visa Requirement**: If the employee's nationality differs from their work country, the system prompts for visa information. Visa statuses: `not_required → pending_application → application_submitted → approved/rejected/expired`.

---

## 2. Invoice Lifecycle

Invoices have 8 statuses and 8 types. The status flow depends on the invoice type.

### Status Flow

```
draft → pending_review → sent → paid
                              → overdue    [auto-detected by daily cron]
                       → void
draft → void
draft → cancelled
```

| Status | Meaning | Editable | Credit Note Applicable |
|:---|:---|:---:|:---:|
| `draft` | Just generated, not reviewed | Yes | No |
| `pending_review` | Under internal review | Yes | **Yes** |
| `sent` | Sent to customer | No | **No** (customer may have downloaded) |
| `paid` | Payment received | No | No |
| `overdue` | Past due date, unpaid | No | No |
| `cancelled` | Cancelled before sending | No | No |
| `void` | Voided after sending | No | No |
| `applied` | Credit note fully applied | No | No |

### Invoice Types

| Type | Trigger | Numbering Pattern |
|:---|:---|:---|
| `deposit` | Employee status → `onboarding` | `DEP-{prefix}{YYYYMM}-{seq}` |
| `monthly_eor` | Monthly payroll generation | `{prefix}{YYYYMM}-{seq}` |
| `monthly_visa_eor` | Monthly payroll (visa employees) | `{prefix}{YYYYMM}-{seq}` |
| `monthly_aor` | Monthly payroll (AOR employees) | `{prefix}{YYYYMM}-{seq}` |
| `visa_service` | Visa service fee | `VS-{prefix}{YYYYMM}-{seq}` |
| `deposit_refund` | Employee status → `terminated` | `REF-{prefix}{YYYYMM}-{seq}` |
| `credit_note` | Manual creation against existing invoice | `CN-{prefix}{YYYYMM}-{seq}` |
| `manual` | Manual creation | `{prefix}{YYYYMM}-{seq}` |

### Credit Note Rules
These rules are critical and have caused bugs when violated:

1. Credit notes can **only** be applied to invoices in `pending_review` status. Never to `sent` invoices, because the customer may have already downloaded the invoice for payment processing.
2. The applied amount cannot exceed the credit note's remaining balance.
3. The applied amount cannot exceed the target invoice's `amountDue`.
4. After application, the invoice's `creditApplied` and `amountDue` fields must be recalculated.
5. A fully applied credit note's status changes to `applied` and its remaining amount displays as zero.
6. A partially applied credit note displays its remaining balance and links to the applied invoice.
7. Multiple credit notes can be created against a single invoice, but total credits cannot exceed the invoice total.
8. Regular invoices do NOT have a refund function — use credit notes instead.

---

## 3. Payroll Processing Flow

Payroll is organized by **country + month**, not by customer. One payroll run contains all active employees in that country across all customers.

```
Monthly 5th 00:00 → Auto-lock adjustments/leave (submitted → locked)
Monthly 5th 00:01 → Auto-create payroll runs with locked data
                   → Payroll items auto-populated with employee base salary (pro-rata if mid-month start)
                   → Locked adjustments and leave deductions auto-applied
Operations Manager → Review, add employer costs (social security, etc.)
Operations Manager → Submit for approval
Second Operations Manager → Approve (A submits, B approves — dual control)
Finance Manager → Generate invoices from approved payroll runs
```

### Payroll Run Statuses

| Status | Meaning | Editable |
|:---|:---|:---:|
| `draft` | Auto-created, awaiting review | Yes |
| `submitted` | Submitted for approval | No |
| `approved` | Approved, ready for invoicing | No |
| `rejected` | Rejected, needs revision | Yes (reverts to draft) |

### Pro-Rata Salary Calculation

When an employee starts mid-month, their salary is calculated proportionally:

```
proRataAmount = baseSalary × (workedDays / totalWorkingDays)
```

Where `totalWorkingDays` is the number of weekdays in the month (5-day work week default), and `workedDays` is the number of weekdays from the employee's start date to month end. If the employee started before the payroll month, they receive full salary.

### Payroll Item Composition

Each payroll item contains:

| Field | Source | Calculation |
|:---|:---|:---|
| `baseSalary` | Employee record (pro-rata if applicable) | Auto-calculated |
| `bonus` | Locked adjustments (type: bonus) | Sum of all bonus adjustments |
| `allowances` | Locked adjustments (type: allowance) | Sum of all allowance adjustments |
| `reimbursements` | Locked adjustments (type: reimbursement) | Sum of all reimbursement adjustments |
| `deductions` | Locked adjustments (type: deduction) + unpaid leave | Calculated |
| `employerCosts` | Manual entry by operations manager | Social security, insurance, etc. |
| `grossPay` | baseSalary + bonus + allowances + reimbursements | Auto-calculated |
| `netPay` | grossPay - deductions | Auto-calculated |

---

## 4. Monthly Cutoff Rules

The monthly cutoff is the **5th of each month at 00:00 Beijing time (UTC+8)**. This is the most critical timing rule in the system.

| Date | Event | Effect |
|:---|:---|:---|
| Before 5th | Adjustments and leave records are `submitted` | Editable by users |
| 5th 00:00 | Auto-lock cron runs | All `submitted` records for previous month → `locked` |
| 5th 00:01 | Auto-create payroll cron runs | New payroll runs created with locked data |
| After 5th | Locked records | Cannot be edited or deleted by any role |

**Adjustment statuses**: `submitted` (editable) → `locked` (auto-locked on 5th) → included in payroll.

**Leave record statuses**: `submitted` → `approved` → `locked`. Unpaid leave generates deductions in payroll.

---

## 5. Leave Management
### Leave Types

| Type | Affects Payroll | Balance Tracked |
|:---|:---:|:---:|
| `annual_leave` | No (paid) | Yes |
| `sick_leave` | No (paid) | Yes |
| `unpaid_leave` | **Yes** (deduction) | No |
| `maternity_leave` | Depends on country | Yes |
| `paternity_leave` | Depends on country | Yes |
| `compassionate_leave` | No (paid) | No |
| `other` | Configurable | No |

### Leave Policy Auto-Initialization

When a new employee is onboarded (via Admin, Portal, or Self-Service), the system automatically checks if the customer has leave policies configured for the employee's employment country. If not, statutory leave policies are automatically created from the `leave_types` table defaults. The customer is notified via email and a Dashboard pending task to review and customize the policies in **Settings > Leave Policies**.

**Trigger Points**: `employees.create` (Admin), `submitOnboarding` (Portal), `submitSelfServiceOnboarding` (Self-Service), and `runEmployeeAutoActivation` (Cron).

### Leave Balance Initialization

Leave balances are **only created when an employee transitions to `active` status**, not at employee creation time. Employees in `pending_review`, `documents_incomplete`, `onboarding`, or `contract_signed` status do not have leave balances, and the Leave tab is hidden from their detail page.

**Annual Leave starts at 0 days** upon activation. Other leave types (Sick, Maternity, Paternity, etc.) are initialized at full statutory/policy entitlement immediately.

### Leave Balance Accrual

Leave balances are tracked in the `leaveBalances` table. **Only Annual Leave** accrues monthly on the 1st of each month via cron job. The accrual formula:

```
accruedEntitlement = (annualEntitlement / 12) × fullMonthsServed
```

Rounding: values are rounded up to the nearest 0.5 day, then to the nearest integer for storage. The accrual is capped at the full annual entitlement.

**Eligible employees**: `active`, `on_leave`, and `offboarding` employees are all processed. Only employees who started in the current year are subject to pro-rata accrual.

**Customer Leave Policy**: Each customer can configure leave policies per country. The annual entitlement must be **greater than or equal to** the statutory minimum defined in `countries_config`. Carry-over rules and expiry rules are configurable per policy.

### Leave Balance Deduction & Insufficient Balance Handling

When a leave request is created (via Admin or Portal), the system automatically deducts the requested days from the employee's leave balance for that leave type and year.

**Strict Balance Rule**: For all paid leave types (`isPaid = true`), the remaining balance **cannot go below 0**. If the requested days exceed the remaining balance, the system automatically splits the request:

1. **Paid portion**: Uses the remaining balance (e.g., 3 days Annual Leave remaining → 3 days Annual Leave)
2. **Unpaid portion**: The excess days are automatically converted to Unpaid Leave (e.g., requesting 5 days with 3 remaining → 3 days Annual + 2 days Unpaid)

The frontend displays a warning banner before submission when insufficient balance is detected, showing the split breakdown. The user is informed via toast notification after successful creation.

**Balance Restoration**: When a leave record is deleted, the balance is restored (used decremented, remaining incremented).

**Unpaid Leave**: Leave types with `isPaid = false` have no balance limit and are not subject to deduction checks.

### Unpaid Leave Deduction

Unpaid leave generates a payroll deduction calculated as:

```
deduction = (baseSalary / totalWorkingDays) × unpaidLeaveDays
```

This deduction is applied as a negative adjustment in the payroll item's `deductions` field.

---

## 6. Deposit Invoice Rules

A deposit invoice is generated when an employee's status changes to `onboarding`. The calculation formula:

```
depositAmount = (baseSalary + estimatedEmployerCost) × depositMultiplier
```

Where `depositMultiplier` is configured per customer (default: 2). If the employee's salary currency differs from the customer's settlement currency, the amount is converted using the exchange rate with markup.

**Duplicate Prevention**: The system checks for existing active deposit invoices for the same employee. A new deposit is only generated if all previous deposits have been processed (refunded or credited). Cancelled deposits are excluded from this check.

---

## 7. Deposit Refund Rules

A deposit refund invoice is generated when an employee's status changes to `terminated`. The refund amount equals the original deposit invoice total. The refund invoice is linked to the original deposit via `relatedInvoiceId`.

---

## 8. Invoice Generation from Payroll

Monthly invoices are generated from **approved** payroll runs. The generation process splits invoices along **5 dimensions**:

| Dimension | Reason |
|:---|:---|
| Customer | Each customer gets separate invoices |
| Service Type | EOR, Visa EOR, AOR → different invoice types |
| Country Code | Different countries → different invoices |
| Local Currency | Different salary currencies → different invoices |
| Service Fee Rate | Different pricing tiers → different invoices |

Each invoice contains:

1. **Employment cost items**: One per employee, showing base salary, adjustments, and employer costs. The Tax column shows the VAT rate from `countries_config`.
2. **Service fee item**: Merged for all employees in the group. Quantity = number of employees. Rate = per-employee service fee from customer pricing.
3. **Currency conversion**: If employee salary currency differs from customer settlement currency, amounts are converted using `exchangeRateWithMarkup`.

### Invoice Amount Fields

| Field | Calculation |
|:---|:---|
| `subtotal` | Sum of all line item amounts (employment costs + service fees) |
| `serviceFeeTotal` | Sum of service fee line items only |
| `tax` | Sum of VAT across all line items |
| `total` | subtotal + tax |
| `creditApplied` | Total credit notes applied (default 0) |
| `amountDue` | total - creditApplied |

---

## 9. Exchange Rate & Multi-Currency


Exchange rates are fetched daily from the European Central Bank (ECB) at 00:05 Beijing time. Rates are stored in the `exchangeRates` table with the base currency as EUR.

**Markup**: Each billing entity can configure an exchange rate markup percentage. The `exchangeRateWithMarkup` is calculated as:

```
exchangeRateWithMarkup = baseRate × (1 + markupPercentage / 100)
```

**Display Rule**: The invoice edit page shows both the stored rate and the real-time rate side by side, allowing operators to compare the markup difference.

**Zero-Decimal Currencies**: KRW, VND, IDR are displayed with 0 decimal places. All other currencies use 2 decimal places.

---

## 10. Cost Allocation (Vendor Bills → Invoices)

Vendor bills can be allocated to customer invoices to track profitability. The allocation creates a link between a vendor bill item and an invoice, recording the allocated amount.

The `costAllocated` field on invoices is a denormalized aggregate of all allocations for query performance. The P&L report uses this data to calculate gross profit per customer:

```
grossProfit = invoiceTotal - allocatedVendorCosts
```

---

## 11. Portal Data Isolation

The system provides three distinct portals with strict data isolation:

1.  **Admin Portal (`admin.geahr.com`)**: For internal GEA operations staff. Access is controlled by JWT signed with HS256, stored in an HttpOnly cookie. Initial admin user is bootstrapped via environment variables.
2.  **Client Portal (`app.geahr.com`)**: For customers. Every query is scoped by `customerId`. This is enforced at the tRPC middleware level (`protectedPortalProcedure`). Portal users can only see employees, invoices, adjustments, and leave records belonging to their customer. Authentication is JWT + bcrypt with an invite-based registration flow.
3.  **Worker Portal (`worker.geahr.com`)**: For employees and contractors. Allows workers to manage their profile, view contracts, download payslips/invoices, track milestones, and complete onboarding tasks. Authentication is JWT + bcrypt with an invite-based registration flow.

Portal users have their own role system: `admin` (full access), `hr_manager` (employees, leave), `finance` (invoices, read-only), `viewer` (read-only all).

---

## 12. Reimbursement Flow

Reimbursements follow a two-level approval process:

```
submitted → customer_approved → gea_confirmed → locked
submitted → customer_rejected
```

The customer portal allows HR managers to approve/reject reimbursements. Once customer-approved, GEA operations confirms and the reimbursement is included in the next payroll cycle as an adjustment.
