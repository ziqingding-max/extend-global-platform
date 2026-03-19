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

---

# Task Group B: Context Switcher Checklist

## B1. State Management
- [x] `cpContextStore.ts` created with Zustand — stores `mode`, `cpId`, `cpName`.
- [x] Three modes supported: `all`, `eg_direct`, `specific_cp`.
- [x] State persists across page navigation within the same session.

## B2. UI Component
- [x] `CpContextSwitcher.tsx` renders a dropdown in the Admin top nav bar.
- [x] Dropdown shows "All CPs", "EG-DIRECT", and a list of specific CPs.
- [x] Active context is visually highlighted with a colored banner below the nav.
- [x] Banner shows the current context mode and a "Clear" button.

## B3. Data Filtering Integration
- [x] `Customers.tsx` — global context overrides local cpFilter when active.
- [x] `Employees.tsx` — global context overrides local cpFilter when active.
- [x] `useInvoices.ts` — global context overrides local cpFilter when active.
- [x] EG-DIRECT mode filters for `channelPartnerId = null`.

---

# Task Group D: CP 资金发票闭环 Checklist

## D1. Invoice Custom Items
- [x] `addCustomItem` endpoint — CP can add custom fee items (consulting, markup) to L2 draft invoices.
- [x] `removeCustomItem` endpoint — CP can remove custom items from L2 draft invoices.
- [x] Only `draft` status invoices allow modification.
- [x] Invoice total is recalculated after adding/removing items.

## D2. Mark Paid (Offline Payment)
- [x] `markPaid` endpoint — CP marks L2 invoice as paid after receiving offline payment.
- [x] **NO wallet deduction** — only manual marking is allowed (per business rule).
- [x] Records `paidDate` and `paidBy` (CP contact ID).

## D3. Client Deposits
- [x] `cpPortalClientDepositsRouter.ts` — lists client deposit wallets scoped to CP.
- [x] Shows frozen wallet balances and transaction history.
- [x] Release tasks page for unfreezing client deposits.

## D4. Frontend
- [x] `CpPortalInvoices.tsx` — Payables (L1) / Receivables (L2) dual-tab view.
- [x] `CpPortalInvoiceDetail.tsx` — add/remove custom items UI.
- [x] `CpPortalClientDeposits.tsx` — deposit management page.

---

# Task Group E: CP 商业化扩展模块 Checklist

## E1. Quotations
- [x] `cpPortalQuotationsRouter.ts` — CRUD with CP data isolation.
- [x] Reuses core `quotationService` with forced `channelPartnerId` scoping.
- [x] Status transitions: draft → sent → accepted/rejected/expired.
- [x] `CpPortalQuotations.tsx` — list, detail dialog, status management.

## E2. Operations Overview
- [x] `cpPortalOperationsRouter.ts` — read-only aggregation of payroll, leave, adjustments, reimbursements.
- [x] All data scoped via `employee.channelPartnerId`.
- [x] Summary endpoint provides pending counts.
- [x] `CpPortalOperations.tsx` — tabbed view with 4 data tables.

## E3. Profit Dashboard
- [x] `cpPortalDashboardRouter.ts` — profit analytics.
- [x] `profitOverview` — L2 revenue, L1 cost, gross profit, margin %.
- [x] `monthlyTrend` — last 12 months bar chart data.
- [x] `quickStats` — client count, employee count, pending/overdue invoices.
- [x] `CpPortalDashboard.tsx` — enhanced with profit cards + CSS bar chart.

## E4. Navigation & Routing
- [x] All new routers registered in `cpPortalRouter.ts`.
- [x] All new pages registered in `App.tsx` with lazy loading.
- [x] Navigation items added to `CpPortalLayout.tsx`.

---

# Task Group B-fix: Context Switcher 遗漏修复 Checklist

## Bf1. tRPC Header Injection
- [x] `main.tsx` — Admin tRPC `httpBatchLink` now injects `x-cp-context-id` header from cpContextStore.
- [x] Header value format: `all`, `direct`, or numeric CP ID string.

## Bf2. Backend Middleware Adaptation
- [x] `procedures.ts` — `adminProcedure` parses `x-cp-context-id` from request headers.
- [x] Injects `cpContext: { mode, cpId }` into tRPC context for downstream use.
- [x] Graceful fallback: if header is missing, defaults to `{ mode: "all", cpId: null }`.

## Bf3. EG-DIRECT Permission Unlock
- [x] `Customers.tsx` — when `cpContext.mode === "direct"`, create/edit buttons are unlocked.
- [x] `isDirectMode` flag controls button visibility for direct-managed clients.

## Bf4. CpWallets Standalone Page
- [x] `CpWallets.tsx` — dedicated Admin page for all CP wallet management.
- [x] Shows prepaid balance and frozen deposit for each CP.
- [x] Top-up, manual adjustment, and frozen release actions.
- [x] Route registered at `/cp-wallets` in `App.tsx`.
- [x] `Layout.tsx` Partner Hub nav updated to link to `/cp-wallets` (was `/channel-partners?tab=wallets`).

---

# Task Group D-fix: Release Tasks + depositRefundService 修复 Checklist

## Df1. CP Portal Release Tasks
- [x] `cpPortalReleaseTasksRouter.ts` — list, approve, summary endpoints.
- [x] Lists `deposit_refund` and `credit_note` invoices scoped to CP.
- [x] Pending/History tab filtering.
- [x] Approve with disposition: `to_wallet` (credit main wallet) or `to_bank` (mark as bank refund).
- [x] Delegates to shared `approveCreditNote` service for actual wallet operations.
- [x] `cpFinanceProcedure` required for approve action (role-based access).

## Df2. Release Tasks Frontend
- [x] `CpPortalReleaseTasks.tsx` — summary cards, pending/history table, approval dialog.
- [x] Radio group for disposition selection with clear UX guidance.
- [x] Bank refund warning notice.
- [x] Registered in `App.tsx` at `/cp/release-tasks`.
- [x] Navigation item "Releases" added to `CpPortalLayout.tsx`.

## Df3. depositRefundService Fix
- [x] `depositRefundService.ts` — now inherits `invoiceLayer` from original deposit invoice.
- [x] Also inherits `channelPartnerId` (falls back to customer's CP if deposit has none).
- [x] Ensures deposit_refund invoices appear in correct L1/L2/Direct tab in Admin.
- [x] Ensures deposit_refund invoices are visible in CP Portal queries.
