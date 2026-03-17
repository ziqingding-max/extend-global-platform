# Customer Wallet Checklist

## 1. Schema & Data Model
- [ ] `customer_wallets` table exists and includes `balance`, `version` (optimistic lock).
- [ ] `wallet_transactions` table exists and links to `walletId`.
- [ ] `invoices` table has `walletAppliedAmount` column (default 0).
- [ ] Unique index `(customerId, currency)` on `customer_wallets` is enforced.

## 2. Wallet Core Logic (Transaction Safety)
- [ ] `transact()` method uses database transactions (`db.transaction`).
- [ ] `transact()` prevents negative balance (unless allowed by config - strictly no negative for now).
- [ ] Optimistic locking (`version` check) prevents race conditions during concurrent updates.
- [ ] `wallet_transactions` are immutable (no update/delete allowed).

## 3. Credit Note -> Wallet Flow
- [ ] Creating a Credit Note (e.g., Deposit Refund) automatically credits the wallet.
- [ ] Credit Note status is marked as `paid` / `processed` immediately.
- [ ] Wallet transaction type is `credit_note_in`.
- [ ] PDF footer contains "Credited to Wallet Balance" notice.

## 4. Invoice Payment -> Wallet Flow (Auto-Deduction)
- [ ] Transitioning Invoice from `Draft` to `Pending Review` triggers deduction.
- [ ] Deduction amount is `min(balance, invoiceTotal)`.
- [ ] `walletAppliedAmount` on Invoice is updated correctly.
- [ ] `wallet_transaction` type is `invoice_deduction`.
- [ ] Invoice `amountDue` reflects the remaining balance.

## 5. Rejection / Void Flow (Rollback)
- [ ] Rejecting a `Pending Review` Invoice (back to `Draft`) triggers a refund to wallet.
- [ ] Refund amount equals the previously deducted `walletAppliedAmount`.
- [ ] `walletAppliedAmount` on Invoice resets to 0.
- [ ] `wallet_transaction` type is `invoice_refund`.

## 6. Overpayment Logic
- [ ] Marking an Invoice as `Paid` with `amountPaid > amountDue` credits the difference to wallet.
- [ ] `wallet_transaction` type is `overpayment_in`.

## 7. Migration Logic
- [ ] Existing OPEN Credit Notes are correctly identified.
- [ ] Balance is calculated as `total - creditApplied`.
- [ ] Wallet is created if missing.
- [ ] Transaction history reflects the migration source.
