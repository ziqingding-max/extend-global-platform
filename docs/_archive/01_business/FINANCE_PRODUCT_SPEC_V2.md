# Finance System - Product Requirements Document (PRD)

**Module**: Finance Core & AOR
**Version**: 2.0
**Status**: Final

---

## 1. Executive Summary
This PRD outlines the overhaul of the GEA Platform's financial system to support a strict **Dual-Wallet** architecture and a fully compliant **AOR (Contractor)** workflow. The goal is to eliminate financial ambiguity, ensure GAAP compliance, and streamline the user experience for Finance Managers.

## 2. Key Features

### 2.1 Dual-Wallet System
- **Objective**: Physically separate "Operating Funds" from "Security Deposits".
- **Main Wallet**: Used for all bill payments.
- **Frozen Wallet**: Restricted access. Only for holding deposits.
- **User Story**: "As a client, I want to see my deposit funds separately so I don't accidentally spend them on monthly bills."

### 2.2 Flexible Invoice Payment
- **Objective**: Allow clients to utilize wallet balances even if they don't cover the full invoice amount.
- **Feature**: **Partial Payment**.
- **User Story**: "As a client with $500 in my wallet and a $1000 invoice, I want to pay the $500 and wire the remaining $500."

### 2.3 AOR (Contractor) Workflow
- **Objective**: Automate contractor payments while maintaining a clear "Unbilled" vs "Billed" state.
- **Flow**:
    1.  Contractor Invoice generated (Draft).
    2.  Admin approves (Approved).
    3.  **Aggregation**: Finance generates Client Invoice -> Links Contractor Invoices.
    4.  Client pays -> Contractor gets paid.

### 2.4 Deposit Release & Refunds
- **Objective**: Strict control over outgoing funds.
- **Flow**:
    1.  Release triggers Credit Note creation.
    2.  Finance Manager decides: **Credit to Wallet** OR **Refund to Bank**.
    3.  No automatic refunding without approval.

## 3. UI/UX Requirements

### 3.1 Invoice Status Indicators
Update all Invoice Lists with the following badges:
- `Draft` (Gray)
- `Pending Review` (Yellow)
- `Sent` (Blue)
- `Partially Paid` (Purple - NEW)
- `Paid` (Green)
- `Refunded` (Orange - NEW, for CNs)
- `Void` (Red)

### 3.2 Invoice Type Filters
Add dropdown filter to Invoice Lists:
- `All Types`
- `Monthly Service` (EOR/AOR)
- `Deposit`
- `Credit Note`
- `One-off / Manual`

---

## 4. Success Metrics
- **Zero "Ghost" Funds**: Total Assets = Main Wallet + Frozen Wallet.
- **100% Traceability**: Every wallet transaction linked to an Invoice ID.
- **Reduced Support Tickets**: Clients clearly understand "Balance Due" vs "Total".
