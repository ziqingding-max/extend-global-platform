# 资金合规与财务流转规范 (Financial Compliance & Flows)

## 1. 钱包系统 (Wallet System)

### 1.1 双钱包架构
*   **Main Wallet (`customer_wallets`)**:
    *   用途：日常支付 (Invoice Payment)。
    *   资金来源：银行转账 Top-up、Credit Note 转换。
*   **Frozen Wallet (`customer_frozen_wallets`)**:
    *   用途：押金 (Deposit) 托管。
    *   资金来源：Deposit Invoice 支付。
    *   **隔离性**: 冻结资金不可用于支付日常月结账单，必须经过 Release 流程。

---

## 2. 发票生命周期 (Invoice Lifecycle)

基于 `invoices` 表的 `status` 枚举：

1.  **Draft**: 草稿状态，正在计算金额，未发送给客户。
2.  **Pending Review**: 内部审核中 (待运营/财务经理确认)。
3.  **Sent**: 已发送给客户，等待支付。
4.  **Paid**: 客户已全额支付。
5.  **Overdue**: 超过 `dueDate` 仍未支付。
6.  **Cancelled**: 发票在发送前被取消。
7.  **Void**: 发票已发送但因错误作废 (需开具 Credit Note 或重新开票)。
8.  **Applied**: **仅适用于 Credit Note 或 Deposit 类型**，表示该票据金额已被完全抵扣或使用。

---

## 3. Credit Note (贷记单) 逻辑

*   **定义**: `invoices` 表中 `invoiceType = 'credit_note'` 的记录。
*   **生成**: 通常由发票纠错、退款或超额支付生成。
*   **流转**:
    1.  创建 Credit Note，状态为 `sent` (或 `paid`，视业务定义而定，表示生效)。
    2.  **抵扣 (Application)**:
        *   Credit Note **不自动** 抵扣未付发票。
        *   客户或 Admin 需手动操作 "Apply Credit"。
        *   记录存储于 `credit_note_applications` 表 (`creditNoteId` -> `appliedToInvoiceId`)。
    3.  **余额**:
        *   若 Credit Note 被完全抵扣，状态变为 `applied`。
        *   或者，Credit Note 金额可转换为 Wallet Balance (`wallet_transactions` type: `credit_note_in`)。

---

## 4. AOR 资金流转 (AOR Financial Flow)

AOR 业务涉及两次开票动作：

| 步骤 | 票据类型 | 发起方 | 接收方 | 表格 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Contractor Invoice** | 承包商/系统 | GEA | `contractor_invoices` |
| 2 | **Client Invoice** | GEA | 客户 | `invoices` (type: `monthly_aor`) |

*   **关联**: `contractor_invoices.clientInvoiceId` 字段关联到最终的 Client Invoice。
*   **支付顺序**: 必须先收后付 (Pay-when-Paid)。系统需确认 Client Invoice 状态为 `paid` 后，才允许将对应的 Contractor Invoice 标记为 `approved` / `paid`。

---

## 5. 汇率处理
*   **锁定**: Invoice 生成时，写入 `exchangeRate` 和 `exchangeRateWithMarkup`。
*   **源**: `exchange_rates` 表。
*   **多币种**:
    *   `invoices` 表存储结算币种 (如 USD) 的 `total`。
    *   `invoice_items` 表存储原始币种 (如 EUR) 的 `localAmount`。
