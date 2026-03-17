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
