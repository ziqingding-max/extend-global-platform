# 客户钱包系统：产品设计规范与合规指南

> **版本号**: 1.1.0 (升级版)
> **最后更新**: 2026-03-05
> **状态**: 生效中 (Active & Enforced)
> **适用范围**: 全局 (Global)
> **责任方**: 财务合规部 & 平台工程部

---

## 1. 核心原则与红线 (Core Principles & Red Lines)

本系统涉及真金白银的流转，所有设计与开发必须死守以下红线：

### 1.1 资金闭环原则 (Closed Loop)
*   **定义**：资金一旦进入平台（充值/退款），除非客户明确申请提现 (Payout)，否则**严禁流出**系统。
*   **执行**：所有的“退款”动作（如 Invoice Void, Credit Note），默认行为必须是**退回钱包余额**，而不是原路退回银行卡/Stripe。

### 1.2 同币种抵扣原则 (Same Currency Only)
*   **定义**：钱包是**多币种隔离**的。USD 钱包余额**只能**用于支付 USD 发票。
*   **执行**：系统**严禁**自动执行跨币种抵扣（如用 USD 余额付 EUR 账单）。跨币种操作必须通过财务人工换汇（Manual Adjustment）进行，以锁定汇率风险。

### 1.3 复式记账与不可变性 (Double Entry & Immutability)
*   **定义**：每一笔余额变动，必须对应一条不可修改的交易流水。
*   **执行**：`余额 = 历史流水之和`。严禁直接修改 `balance` 字段。严禁 `UPDATE` 或 `DELETE` 任何 `wallet_transactions` 记录。修正错误必须通过“红冲蓝补”（创建一条反向交易）来实现。

---

## 2. 合规性详细要求 (Compliance Requirements)

### 2.1 会计合规：总账映射 (GL Mapping)
为了确保财务报表准确，每一类钱包交易类型 (Transaction Type) 必须明确对应会计科目：

| 交易类型 (`type`) | 方向 | 借方科目 (Dr.) | 贷方科目 (Cr.) | 业务含义 |
| :--- | :--- | :--- | :--- | :--- |
| `top_up` | Credit (+) | 银行存款 (Bank) | **预收账款 (Deferred Revenue)** | 客户充值 |
| `credit_note_in` | Credit (+) | 销售退回 (Sales Return) | **预收账款 (Deferred Revenue)** | 退款转余额 |
| `invoice_deduction` | Debit (-) | **预收账款 (Deferred Revenue)** | 应收账款 (AR) | 余额支付发票 |
| `invoice_refund` | Credit (+) | 应收账款 (AR) | **预收账款 (Deferred Revenue)** | 发票作废回滚 |
| `payout` | Debit (-) | **预收账款 (Deferred Revenue)** | 银行存款 (Bank) | 余额提现 |
| `overpayment_in` | Credit (+) | 银行存款 (Bank) | **预收账款 (Deferred Revenue)** | 超额支付转余额 |

### 2.2 税务合规：凭证与发票
*   **Credit Note PDF**：必须生成。必须包含免责声明：*"This amount has been credited to your wallet balance."*
*   **Invoice PDF**：必须清晰展示支付结构。
    *   *Subtotal: $1,000.00*
    *   *Less Wallet Applied: -$200.00*
    *   *Amount Due: $800.00*
    *   **税务风险提示**：客户只能就 $800.00 的实际支付金额申请增值税抵扣（视具体国家税法而定，系统需提供完整数据支持）。

### 2.3 审计合规：操作留痕
*   **人工调账 (Manual Adjustment)**：
    *   必须记录：`operatorId` (操作人), `reason` (原因), `internalNote` (内部备注)。
    *   **阈值告警**：单笔调账超过 $5,000 必须触发邮件通知财务总监。

---

## 3. 详细产品行为规范 (Product Specifications)

### 3.1 核心流程：Credit Note (退款) -> 钱包
1.  **场景**：员工离职退押金，或服务费减免。
2.  **系统动作**：
    *   生成 Credit Note 实体与 PDF。
    *   **原子操作**：(1) 标记 CN 为 `Paid` + (2) 写入 `credit_note_in` 流水 + (3) 增加钱包余额。
3.  **异常处理**：若原子操作失败，整个事务回滚，CN 保持 `Draft` 状态。

### 3.2 核心流程：发票自动抵扣 (Auto-Deduction)
1.  **场景**：每月 1 号生成月度账单。
2.  **时机**：发票状态从 `Draft` -> `Pending Review` 的瞬间。
3.  **逻辑**：
    *   锁定钱包行记录 (Select for Update)。
    *   计算 `抵扣额 = MIN(钱包余额, 发票未付金额)`。
    *   若 `抵扣额 > 0`：执行扣款，更新发票 `walletAppliedAmount`。
4.  **通知**：发送给客户的 "Invoice Ready" 邮件中，必须高亮显示：“您的钱包余额已自动抵扣 $X，您只需支付剩余的 $Y。”

### 3.3 核心流程：发票作废/拒绝 (Void/Reject)
1.  **场景**：发票生成有误，被财务拒绝或作废。
2.  **逻辑**：
    *   检查该发票是否已使用钱包抵扣 (`walletAppliedAmount > 0`)。
    *   若有，**必须**先执行“回滚交易” (`invoice_refund`)，将资金退回钱包。
    *   然后再将发票状态更为 `Void` 或 `Draft`。
3.  **禁止**：严禁在未退回资金的情况下直接删除发票。

### 3.4 核心流程：超额支付 (Overpayment)
1.  **场景**：客户手滑多转了 $100。
2.  **逻辑**：
    *   财务录入实收金额。
    *   系统自动计算溢价。
    *   生成 `overpayment_in` 流水，余额增加。
    *   **不再生成** 单独的 Credit Note 实体（减少对账混乱）。

---

## 4. 技术架构与开发指引 (Technical Guidelines)

### 4.1 数据库模式 (Schema Constraints)
*   **`customer_wallets`**：
    *   `currency`: **不可变**。
    *   `version`: **强制乐观锁**。每次更新 `balance` 必须 `SET version = version + 1 WHERE version = old_version`。
*   **`wallet_transactions`**：
    *   `referenceId`: **非空**。每笔钱必须有来源。
    *   `type`: **枚举约束**。严禁使用魔法字符串。

### 4.2 服务层调用规范 (`WalletService`)
*   **单例模式**：所有资金操作只能通过 `WalletService` 入口。
*   **事务边界**：`WalletService.transact()` 必须在数据库事务 (`db.transaction`) 内部运行，确保 `流水写入` 和 `余额更新` 的原子性。
*   **负余额保护**：
    *   Debit 类操作（扣款、提现），必须检查 `balance - amount >= 0`。
    *   Credit 类操作（充值、退款），无限制。

### 4.3 扩展性设计
*   **新功能接入**：
    *   若需开发“推荐返利”功能：请新增 Transaction Type `referral_reward`，并在 GL Mapping 表中注册对应的会计科目（如 `Dr. Marketing Expense / Cr. Deferred Revenue`）。
*   **报表接入**：
    *   客户对账单 (Statement)：通过聚合 `wallet_transactions` 按月生成。
    *   余额快照：`customer_wallets` 表仅用于实时展示，**严禁**用于生成历史报表（因为余额是动态的）。历史余额必须通过回溯流水计算得出。

---

## 5. 运维与监控 (Operations & Monitoring)

### 5.1 每日对账脚本 (Reconciliation Job)
*   **脚本逻辑**：
    ```sql
    FOR EACH wallet:
      CALCULATED_BALANCE = SUM(amount * direction_sign) FROM wallet_transactions
      ACTUAL_BALANCE = SELECT balance FROM customer_wallets
      IF CALCULATED_BALANCE != ACTUAL_BALANCE:
        ALERT("CRITICAL: Wallet Integrity Breach for Customer " + customerId)
    ```
*   **频率**：每日凌晨 03:00 UTC。

### 5.2 敏感操作审计
*   **监控对象**：所有 `manual_adjustment` 类型的交易。
*   **告警**：任何人工调增余额（Credit）的操作，必须实时推送到财务群 (Slack/Teams)。

---

**文档结束**
