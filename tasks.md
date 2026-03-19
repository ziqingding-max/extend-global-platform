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

## Task Group B-fix: Context Switcher 遗漏修复
- [x] Add `x-cp-context-id` Header injection in Admin tRPC httpBatchLink (`main.tsx`) <!-- id: Bf1 -->
- [x] Enhance `adminProcedure` in `procedures.ts` to parse `x-cp-context-id` and inject `cpContext` into ctx <!-- id: Bf2 -->
- [x] Implement EG-DIRECT permission unlock in `Customers.tsx` — show create/edit buttons when mode is "direct" <!-- id: Bf3 -->

## Task Group D-fix: Release Tasks + depositRefundService 修复
- [x] Create `cpPortalReleaseTasksRouter.ts` — CP can view and approve deposit releases (to_wallet / to_bank) <!-- id: Df1 -->
- [x] Create `CpPortalReleaseTasks.tsx` — Release Tasks page with pending/history tabs and approval dialog <!-- id: Df2 -->
- [x] Fix `depositRefundService.ts` — inherit `invoiceLayer` and `channelPartnerId` from original deposit invoice <!-- id: Df3 -->
- [x] Register Release Tasks in `cpPortalRouter.ts`, `App.tsx`, and `CpPortalLayout.tsx` navigation <!-- id: Df4 -->

## Task Group B-fix: CpWallets 独立页面
- [x] Create `CpWallets.tsx` — standalone Admin page for managing all CP wallets (top-up, adjust, release) <!-- id: Bf4 -->
- [x] Register route in `App.tsx` and update `Layout.tsx` Partner Hub navigation <!-- id: Bf5 -->

## Task Group B-fix2: Invoices.tsx EG-DIRECT 权限解锁
- [x] Integrate `useCpContext` into `Invoices.tsx` — EG-DIRECT mode unlocks Direct Tab editing <!-- id: Bf6 -->
- [x] Add read-only banners for Direct Tab (blue hint) and EG-DIRECT active banner (green confirmation) <!-- id: Bf7 -->
- [x] Replace all `isL2ReadOnly` guards with unified `isReadOnly` (covers both L2 and Direct-without-EG-DIRECT) <!-- id: Bf8 -->

## Task Group B-fix2: CpWallets EG-DIRECT 钱包隐藏
- [x] Hide wallet balances and action buttons for EG-DIRECT (isInternal) CP entries — show "N/A — EG internal entity" <!-- id: Bf9 -->

## Task Group C-fix: CP Portal 合同上传 S3
- [x] Add `listContracts` procedure to `cpPortalClientsRouter.ts` — list contracts scoped to CP's clients <!-- id: Cf1 -->
- [x] Add `uploadContract` procedure — accept base64 file, upload to S3 via `storagePut`, store record <!-- id: Cf2 -->
- [x] Add `getContractDownloadUrl` procedure — generate signed URL via `storageGet` <!-- id: Cf3 -->
- [x] Add `deleteContract` procedure — delete contract record (scoped to CP's clients) <!-- id: Cf4 -->
- [x] Add "Contracts" Tab to `CpPortalClients.tsx` client detail view <!-- id: Cf5 -->
- [x] Implement `ContractsTab` component — table view, upload dialog with file picker, download button <!-- id: Cf6 -->
