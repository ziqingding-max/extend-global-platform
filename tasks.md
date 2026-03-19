# Tasks Breakdown

## Phase 1: Database & Schema
- [ ] Create `customer_wallets` table in `drizzle/schema.ts` <!-- id: 0 -->
- [ ] Create `wallet_transactions` table in `drizzle/schema.ts` <!-- id: 1 -->
- [ ] Add `walletAppliedAmount` to `invoices` table in `drizzle/schema.ts` <!-- id: 2 -->
- [ ] Define relationships in `drizzle/relations.ts` <!-- id: 3 -->
- [ ] Run `pnpm db:push` to apply changes <!-- id: 4 -->

## Phase 2: Core Service Implementation
- [ ] Create `server/services/walletService.ts` with `getWallet` and `transact` methods <!-- id: 5 -->
- [ ] Implement optimistic locking and transaction safety in `walletService` <!-- id: 6 -->
- [ ] Add `creditToWallet` logic to `server/services/creditNoteService.ts` <!-- id: 7 -->
- [ ] Refactor `server/services/invoiceService.ts` to handle auto-deduction on `submitForReview` <!-- id: 8 -->
- [ ] Refactor `server/services/invoiceService.ts` to handle rollback on `reject` <!-- id: 9 -->
- [ ] Implement `overpayment_in` logic in `server/routers/billing/invoiceRouter.ts` (`updateStatus`) <!-- id: 10 -->

## Phase 3: Migration
- [ ] Write migration script `scripts/migrate-credits-to-wallet.ts` <!-- id: 11 -->
- [ ] Test migration script on local DB with seed data <!-- id: 12 -->

## Phase 4: Frontend & UI
- [ ] Create `server/routers/billing/walletRouter.ts` (TRPC) <!-- id: 13 -->
- [ ] Add Wallet section to Admin Customer Detail page <!-- id: 14 -->
- [ ] Add Wallet Transaction History table component <!-- id: 15 -->
- [ ] Update Invoice PDF generator to show Wallet Deduction line item <!-- id: 16 -->
- [ ] Update Credit Note PDF generator to show Wallet Credit footer <!-- id: 17 -->

## Phase 5: Testing & Verification
- [ ] Write unit tests for `walletService` (concurrency, negative balance protection) <!-- id: 18 -->
- [ ] Write integration tests for Invoice Lifecycle (Draft -> Pending -> Reject -> Pending -> Paid) <!-- id: 19 -->
- [ ] Verify "Void Credit Note" safety lock <!-- id: 20 -->

---

## Task Group B: Context Switcher (Admin 端全局 CP 视角切换)
- [x] Create `cpContextStore.ts` (Zustand) — global CP context state <!-- id: B1 -->
- [x] Create `CpContextSwitcher.tsx` — dropdown component with All / EG-DIRECT / Specific CP modes <!-- id: B2 -->
- [x] Integrate into `Layout.tsx` — top nav bar + context banner <!-- id: B3 -->
- [x] Integrate into `Customers.tsx` — override local cpFilter with global context <!-- id: B4 -->
- [x] Integrate into `Employees.tsx` — override local cpFilter with global context <!-- id: B5 -->
- [x] Integrate into `useInvoices.ts` — override local cpFilter with global context <!-- id: B6 -->

## Task Group D: CP 资金发票闭环
- [x] Add `addCustomItem` to `cpPortalInvoicesRouter.ts` — CP adds custom fee items to L2 draft invoices <!-- id: D1 -->
- [x] Add `removeCustomItem` to `cpPortalInvoicesRouter.ts` — CP removes custom items from L2 draft invoices <!-- id: D2 -->
- [x] Add `markPaid` to `cpPortalInvoicesRouter.ts` — CP marks L2 invoice as paid (offline payment only, NO wallet deduction) <!-- id: D3 -->
- [x] Create `cpPortalClientDepositsRouter.ts` — Client Deposit management (list deposits, frozen wallet, release tasks) <!-- id: D4 -->
- [x] Update `CpPortalInvoices.tsx` — Payables/Receivables dual-tab view with markPaid button <!-- id: D5 -->
- [x] Update `CpPortalInvoiceDetail.tsx` — addCustomItem/removeCustomItem UI <!-- id: D6 -->
- [x] Create `CpPortalClientDeposits.tsx` — Client Deposits page <!-- id: D7 -->
- [x] Register routes in `cpPortalRouter.ts` and `App.tsx` <!-- id: D8 -->

## Task Group E: CP 商业化扩展模块
- [x] Create `cpPortalQuotationsRouter.ts` — CP quotation CRUD with data isolation <!-- id: E1 -->
- [x] Create `cpPortalOperationsRouter.ts` — read-only operations overview (payroll, leave, adjustments, reimbursements) <!-- id: E2 -->
- [x] Create `cpPortalDashboardRouter.ts` — profit analytics (L2 revenue, L1 cost, gross profit, margin, monthly trend) <!-- id: E3 -->
- [x] Create `CpPortalQuotations.tsx` — quotation list, detail, status management <!-- id: E4 -->
- [x] Create `CpPortalOperations.tsx` — tabbed operations overview (payroll, leave, adjustments, reimbursements) <!-- id: E5 -->
- [x] Enhance `CpPortalDashboard.tsx` — profit cards, monthly trend bar chart, quick stats <!-- id: E6 -->
- [x] Register all new routers in `cpPortalRouter.ts` <!-- id: E7 -->
- [x] Add navigation items in `CpPortalLayout.tsx` <!-- id: E8 -->
