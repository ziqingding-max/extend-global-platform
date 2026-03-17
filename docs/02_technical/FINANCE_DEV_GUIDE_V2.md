# Finance Core Development Guide

**Target Audience**: Backend Engineers, Frontend Engineers
**Version**: 2.0
**Context**: Full refactor of financial workflows (Wallet, Invoice, AOR, Deposit).

---

## 1. Database Schema Changes

### 1.1 New Enums & Types
Update `drizzle/schema.ts` and `drizzle/aor-schema.ts`.

```typescript
// wallet_transactions.type
export const WalletTransactionType = [
  "credit_note_in",       // CN -> Wallet
  "overpayment_in",       // Excess Payment -> Wallet
  "top_up",               // Bank -> Wallet
  "invoice_deduction",    // Wallet -> Invoice
  "invoice_refund",       // Void Invoice -> Wallet
  "manual_adjustment",    // Admin Fix
  "refund_out"            // Wallet -> Bank (New!)
];

// invoices.status
export const InvoiceStatus = [
  "draft", "pending_review", "sent", "paid", "partially_paid", "overdue", "void", "refunded"
];
```

### 1.2 Migration Tasks
1.  **Contractors**: Hide `rateType` in UI, keep default `fixed_monthly` in DB.
2.  **Contractor Invoices**: Ensure `clientInvoiceId` exists and is indexed.
3.  **Credit Notes**: Add `disposition` column (text, nullable).

---

## 2. Backend Implementation Rules

### 2.1 Wallet Service (`server/services/walletService.ts`)

**Rule 1: No Direct Balance Modification**
All balance changes MUST go through `transact()` or `frozenTransact()`.

**Rule 2: Partial Payment Logic**
```typescript
async function payInvoice(invoiceId: number, amount?: number) {
  // 1. Get Wallet Balance & Invoice AmountDue
  // 2. Determine payment amount: Min(Balance, AmountDue)
  // 3. Transact: "invoice_deduction"
  // 4. Update Invoice:
  //    walletAppliedAmount += payment
  //    amountDue -= payment
  //    status = amountDue <= 0 ? 'paid' : 'partially_paid'
}
```

**Rule 3: Deposit Release**
```typescript
async function releaseDeposit(depositInvoiceId: number) {
  // 1. Debit Frozen Wallet
  // 2. Create Credit Note (Draft/Pending)
  // 3. DO NOT Credit Main Wallet yet!
}
```

### 2.2 Invoice Service (`server/routers/invoices.ts`)

**Rule 4: Safe Delete**
Before deleting a `draft` invoice:
1.  Check if `relatedInvoiceId` is present (Is it a child?).
2.  Check if referenced by `contractor_invoices.clientInvoiceId`.
3.  If dependencies exist -> Throw Error "Cannot delete linked invoice".

### 2.3 AOR Aggregation (`server/services/invoiceGenerationService.ts`)

**Query Logic for Unbilled Items**:
```typescript
const unbilled = await db.query.contractorInvoices.findMany({
  where: and(
    eq(customerId, id),
    eq(status, 'approved'),
    isNull(clientInvoiceId) // Critical!
  )
});
```

---

## 3. Frontend Implementation Guidelines

### 3.1 Admin Portal

**Contractor Invoices Tab**
- **Path**: `/admin/invoices/contractor`
- **Tabs**: `Pending Approval` | `Approved (Unbilled)` | `Billed` | `Paid`
- **Actions**:
    - Pending -> `Approve`
    - Approved -> (No action, waiting for aggregation)

**Deposit Release Tasks**
- **Path**: `/admin/finance/deposit-releases`
- **Action**: List items with `credit_note` in `pending_review`.
- **Buttons**:
    - `Release to Wallet` -> Calls API `approveCreditNote(id, 'wallet')`
    - `Refund to Bank` -> Calls API `markRefunded(id, bankRef)`

### 3.2 Client Portal

**Invoice Detail**
- **Hide**: "Apply Credit" button.
- **Show**: "Pay with Wallet" button.
- **Logic**:
    - If `Wallet Balance < Amount Due`: Show warning modal "Insufficient balance. Pay partial amount X?"

---

## 4. Testing Checklist

- [ ] **Partial Payment**: Create invoice $1000, Wallet $200. Pay. Verify Due = $800.
- [ ] **AOR Aggregation**: Approve 2 contractor invoices. Generate Monthly. Verify Client Invoice Total = Sum + Fee. Verify links.
- [ ] **Deposit Release**: Terminate employee. Trigger release. Verify Frozen -$X, Main +$0 (CN created). Approve CN. Verify Main +$X.
- [ ] **Double Spending**: Try to apply the same CN to two invoices (Should fail/feature removed).

---

## 5. Verification Script

A standalone verification script is provided to validate the entire financial workflow from end-to-end.

**Path**: `scripts/verify-finance-workflow.ts`

**Usage**:
```bash
npx tsx scripts/verify-finance-workflow.ts
```

**What it tests**:
1.  **Setup**: Creates test Customer and Contractor.
2.  **Contractor Invoice**: Generates a monthly invoice for the contractor.
3.  **Approval**: Approves the contractor invoice.
4.  **Aggregation**: Runs the payroll invoice generation to create a Client Invoice (AOR).
5.  **Partial Payment**: Simulates a wallet top-up and partial payment of the Client Invoice.
6.  **Deposit Release**: Simulates a Deposit Invoice payment, then a Deposit Release (Credit Note) flow affecting Frozen and Main wallets.
