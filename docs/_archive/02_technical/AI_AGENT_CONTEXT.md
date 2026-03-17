# Technical Context for AI Agents

**Domain**: Finance & Accounting
**System**: GEA Platform (Global Employment)

## 1. Core Entities & Relations

### Wallets
- `customer_wallets`: Operating funds.
- `customer_frozen_wallets`: Security deposits.
- **Invariant**: `balance` must never be negative. All changes via `wallet_transactions`.

### Invoices
- **State Machine**: `draft` -> `pending_review` -> `sent` -> `partially_paid` -> `paid`.
- **Polymorphism**: `invoiceType` determines behavior.
    - `deposit`: Links to `frozen_wallet`.
    - `credit_note`: Increases `main_wallet`.
    - `monthly_aor`: Aggregates `contractor_invoices`.

### Contractor Invoices
- **Status**: `draft` -> `approved` -> `paid`.
- **Linking**: `clientInvoiceId` links AP (Contractor) to AR (Client).
- **Unbilled Definition**: `status = 'approved' AND clientInvoiceId IS NULL`.

## 2. Critical Business Logic Rules

1.  **Delete Protection**: Never physically delete a `sent` or `linked` invoice. Use `void` instead.
2.  **Credit Note**: Is a voucher. Once approved, it is "spent" into the wallet. It cannot be applied to invoices directly.
3.  **Deposit Release**: Must generate a CN first. Never credit wallet directly from Frozen.
4.  **Partial Payment**: Invoice `amountDue` is the source of truth for outstanding debt. `paidAmount` + `walletAppliedAmount` = Total - `amountDue`.

## 3. Codebase Entry Points

- **Wallet Logic**: `server/services/walletService.ts`
- **Invoice Logic**: `server/routers/invoices.ts`
- **AOR Logic**: `server/services/contractorInvoiceGenerationService.ts`
- **Cron Jobs**: `server/cronJobs.ts`

## 4. Verification & Testing
- **E2E Finance Script**: `scripts/verify-finance-workflow.ts`
    - Runs the full lifecycle: Contractor Invoice -> Approval -> Client Invoice -> Partial Pay -> Deposit Release.
    - Use this to verify schema integrity after changes.
