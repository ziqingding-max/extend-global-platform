# Customer Wallet Architecture Spec

## 1. Background & Goal
Currently, the system uses a traditional "Credit Note" mechanism where credits must be manually applied to `pending_review` invoices. This creates friction and delays. 
The goal is to implement a **Customer Wallet (Prepayment) System** where:
1.  Refunds/Credits (Credit Notes) automatically convert to wallet balance.
2.  Overpayments automatically convert to wallet balance.
3.  Invoices automatically deduct from wallet balance upon transitioning to `pending_review`.
4.  Rejections/Voids automatically refund the wallet.

This architecture must strictly follow **Double-Entry Accounting** principles and **Tax Compliance** rules (retaining PDF evidence).

## 2. Database Schema

### 2.1 `customer_wallets`
Stores the current balance snapshot. Optimistic locking is used for concurrency control.

```typescript
export const customerWallets = mysqlTable("customer_wallets", {
  id: varchar("id", { length: 255 }).primaryKey(),
  customerId: varchar("customer_id", { length: 255 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull(), // USD, EUR, CNY...
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  version: int("version").notNull().default(0), // Optimistic lock
  updatedAt: timestamp("updated_at").onUpdateNow(),
}, (table) => ({
  uniqueIdx: uniqueIndex("customer_currency_idx").on(table.customerId, table.currency),
}));
```

### 2.2 `wallet_transactions`
The immutable ledger of all fund movements.

```typescript
export const walletTransactions = mysqlTable("wallet_transactions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  walletId: varchar("wallet_id", { length: 255 }).notNull(),
  
  type: mysqlEnum("type", [
    "credit_note_in",       // Credit Note converted to balance (+)
    "overpayment_in",       // Invoice overpayment converted to balance (+)
    "invoice_deduction",    // Balance used to pay invoice (-)
    "invoice_refund",       // Invoice rejected/voided, balance returned (+)
    "manual_adjustment",    // Admin manual adjustment (+/-)
    "payout"                // Withdrawal/Refund to bank (-)
  ]).notNull(),

  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // Always positive
  direction: mysqlEnum("direction", ["credit", "debit"]).notNull(), // credit = increase balance, debit = decrease balance
  
  balanceBefore: decimal("balance_before", { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }).notNull(),
  
  referenceId: varchar("reference_id", { length: 255 }).notNull(), // InvoiceID, CreditNoteID
  referenceType: varchar("reference_type", { length: 50 }).notNull(), // 'invoice', 'credit_note', 'payment'
  
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by", { length: 255 }),
});
```

### 2.3 `invoices` Updates
Add fields to track wallet usage.

```typescript
// Add to invoices table
walletAppliedAmount: decimal("wallet_applied_amount", { precision: 15, scale: 2 }).default("0.00"),
```

## 3. Business Logic & State Transitions

### 3.1 Credit Note Generation (Refund)
*   **Trigger**: Admin creates a Credit Note (e.g., Deposit Refund).
*   **Action**:
    1.  Create `invoices` record (Type: `credit_note`, Status: `paid`).
    2.  Generate PDF with footer: *"Amount credited to wallet balance."*
    3.  Create `wallet_transaction` (Type: `credit_note_in`, Amount: $X).
    4.  Update `customer_wallets` (Balance += $X).

### 3.2 Invoice Lifecycle & Auto-Deduction
*   **Draft -> Pending Review**:
    *   Check `wallet_balance`.
    *   If `balance > 0`:
        *   `deduct = min(balance, invoiceTotal)`
        *   Create `wallet_transaction` (Type: `invoice_deduction`, Amount: $deduct).
        *   Update Invoice: `walletAppliedAmount = deduct`, `amountDue = total - deduct`.
        *   Update `customer_wallets` (Balance -= deduct).
*   **Pending Review -> Sent**:
    *   No balance change (deduction already happened).
    *   PDF shows: *Total: $1000, Wallet: -$200, Due: $800*.
*   **Pending Review -> Rejected (Draft)**:
    *   **Rollback**:
        *   Read `walletAppliedAmount`.
        *   If `walletAppliedAmount > 0`:
            *   Create `wallet_transaction` (Type: `invoice_refund`, Amount: $walletAppliedAmount).
            *   Update `customer_wallets` (Balance += $walletAppliedAmount).
            *   Reset Invoice: `walletAppliedAmount = 0`.

### 3.3 Overpayment
*   **Trigger**: Admin records payment of $1000 for a $800 invoice.
*   **Action**:
    1.  Mark Invoice as `paid`.
    2.  Calculate excess: $200.
    3.  Create `wallet_transaction` (Type: `overpayment_in`, Amount: $200).
    4.  Update `customer_wallets` (Balance += $200).

### 3.4 Void Logic (Safety Lock)
*   **Rule**: A Credit Note that has been credited to the wallet **cannot be voided directly** if the wallet balance is insufficient.
*   **Check**: `currentBalance >= creditNoteAmount`.
*   **If Safe**:
    1.  Deduct balance (Type: `manual_adjustment` / `void_reversal`).
    2.  Void the Credit Note.
*   **If Unsafe**: Reject operation. Prompt user to top up first.

## 4. API & Service Layer

### 4.1 `WalletService`
*   `getWallet(customerId, currency)`
*   `transact(walletId, type, amount, reference, description)`: Transactional update.
*   `auditLog(walletId)`: Fetch transaction history.

### 4.2 `CreditNoteService` Refactor
*   Remove `applyToInvoice` logic.
*   Add `creditToWallet` logic upon creation.

### 4.3 `InvoiceService` Refactor
*   Inject `WalletService.transact` into state transition hooks (`submitForReview`, `reject`, `markAsPaid`).

## 5. Migration Strategy
1.  **Schema Migration**: Create tables.
2.  **Data Migration Script**:
    *   Find all `OPEN` Credit Notes (Status `paid` but `amountDue > 0` or `creditApplied < total`).
    *   For each:
        *   Calculate remaining credit.
        *   Create Wallet (if not exists).
        *   Create `credit_note_in` transaction.
        *   Mark Credit Note as fully processed (internal flag).
