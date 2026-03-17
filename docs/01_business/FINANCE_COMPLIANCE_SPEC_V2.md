# 全球薪酬支付平台 (GEA) 财务合规与核心流程重构方案 (v2.0)

本文档是 GEA 平台财务核心重构的最高指导文件。本方案基于 GAAP/IFRS 会计准则、反洗钱 (AML) 合规要求以及全球薪酬业务（EOR/AOR）的实际场景制定。

**生效日期**: 2026-03-06
**状态**: 待开发 (Ready for Dev)
**版本**: v2.0 (Final)

---

## 1. 业务架构概览 (Business Architecture)

### 1.1 双钱包隔离体系 (Dual-Wallet System)
为满足资金存管合规性，系统实行“物理隔离”的账户体系。

*   **Main Wallet (主钱包/余额账户)**
    *   **定义**：客户的可用资金池，用于支付日常账单（Payroll, Service Fee, Tax）。
    *   **资金来源**：`Overpayment` (超额支付), `Credit Note Release` (押金释放转入), `Refund` (退款转入)。
    *   **资金去向**：`Invoice Payment` (支付账单), `Refund Out` (提现退款)。
    *   **会计性质**：**预收账款 (Deferred Revenue / Prepayment)**。

*   **Frozen Wallet (冻结钱包/押金账户)**
    *   **定义**：专款专用的押金池，严格锁定，不可用于日常支付。
    *   **资金来源**：`Deposit Invoice Payment` (押金缴纳)。
    *   **资金去向**：`Deposit Release` (释放至 Credit Note)。
    *   **会计性质**：**其他应付款-押金 (Other Payables - Deposit)**。

### 1.2 交易凭证化 (Voucher-Based Transaction)
*   **原则**：系统中每一分钱的变动，必须有对应的财务凭证（Invoice 或 Credit Note）。
*   **Credit Note (CN)**：
    *   **新定义**：CN 是唯一的“红字凭证”和“内部转账凭证”。
    *   **功能**：CN 一经批准 (Approved)，其金额**立即**转化为 Main Wallet 余额。
    *   **废除**：**彻底废除**“Apply Credit to Invoice”功能，防止资金双重使用。

---

## 2. 核心业务流程 (Core Business Workflows)

### 2.1 押金全生命周期 (Deposit Lifecycle)
适用于 EOR / Visa EOR 业务。

1.  **收取 (Collection)**
    *   **触发**：Employee Onboarding。
    *   **生成**：自动生成 `Type=Deposit` Invoice (Draft)。
    *   **支付**：客户支付 -> 资金进入 **Frozen Wallet**。

2.  **释放 (Release) - 严格合规流程**
    *   **触发条件**：Employee Terminated + 30天（系统自动扫描）。
    *   **执行动作**：
        1.  **扣款**：Frozen Wallet 扣除押金金额。
        2.  **凭证**：自动生成一张 `Credit Note` (关联原 Deposit Invoice)。
        3.  **处置 (Disposition)**：财务经理在 Credit Note 详情页进行审批。
            *   **路径 A (转余额 - 默认)**：CN 批准 -> Main Wallet 增加 -> 客户可用于抵扣下月工资。
            *   **路径 B (退款 - 例外)**：CN 标记为 Refunded -> 记录银行转账流水 -> 资金物理流出。

### 2.2 发票支付与扣款 (Invoice Payment)
适用于所有 Invoice 类型（Monthly EOR, Monthly AOR, One-off）。

1.  **混合支付 (Partial Payment)**
    *   **场景**：Invoice $10,000，Wallet $4,000。
    *   **动作**：客户点击 "Pay with Wallet"。
    *   **结果**：
        *   Wallet 扣除 $4,000。
        *   Invoice `walletAppliedAmount` = $4,000。
        *   Invoice `amountDue` = $6,000。
        *   Invoice 状态保持 `Sent` (或 Partially Paid)。
    *   **结清**：客户线下支付剩余 $6,000 -> 财务标记 Paid。

### 2.3 Contractor (AOR) 专属流程
严格区分 AP (应付) 和 AR (应收)。

1.  **Contractor Invoice (AP) 生成**
    *   **频率**：由 `Payment Frequency` 决定 (Monthly / Semi-Monthly)。
    *   **金额**：`Monthly` = Rate Amount; `Semi-Monthly` = Rate Amount (前端已做半月金额输入处理)。
    *   **状态**：生成为 `Draft` -> Admin 审批为 `Approved` (此时为 **Unbilled** 状态)。

2.  **Client Invoice (AR) 汇总**
    *   **触发**：财务点击通用的 "Generate Monthly Invoice" 按钮。
    *   **范围**：所有 `Status=Approved` 且 `Unbilled` (`clientInvoiceId IS NULL`) 的 Contractor Invoices。
    *   **动作**：
        1.  汇总金额 + 计算 Service Fee。
        2.  生成 Client Invoice (Monthly AOR)。
        3.  **回写**：更新 Contractor Invoice 的 `clientInvoiceId`，防止重复开票。

---

## 3. 发票状态机与类型定义 (Invoice State Machine)

### 3.1 Invoice Types
| Type Code | 业务含义 | 备注 |
| :--- | :--- | :--- |
| `deposit` | 押金发票 | 进入 Frozen Wallet |
| `monthly_eor` | 月度 EOR 账单 | 包含薪资、社保、服务费 |
| `monthly_visa_eor` | 月度 Visa EOR 账单 | 仅服务费 |
| `monthly_aor` | 月度 AOR 汇总账单 | 包含 Contractor 费用 + 服务费 |
| `visa_service` | 签证服务费 | 一次性费用 |
| `credit_note` | 贷项通知单 | 红字发票，用于退款或调整 |
| `manual` | 手动发票 | 杂项收费 |
| `shortfall` | 补款发票 | 支付不足时生成 |

*(注：已废除 `deposit_refund` 类型，统一并入 `credit_note`)*

### 3.2 Invoice Statuses
| Status | 含义 | 可操作性 |
| :--- | :--- | :--- |
| `draft` | 草稿 | 可编辑，可物理删除 (仅限孤立 Invoice) |
| `pending_review` | 待审核 | 不可编辑金额，不可删除 |
| `sent` | 已发送 | 锁定，等待支付 |
| `paid` | 已支付 | 终态 |
| `partially_paid` | 部分支付 | 等待剩余款项 |
| `overdue` | 逾期 | 由 Cron Job 自动标记 |
| `void` | 作废 | 也就是 Cancelled，保留痕迹 |
| `refunded` | 已退款 | 专用于 Credit Note (路径 B) |

---

## 4. 开发计划与功能清单 (Development Plan)

### Phase 1: 数据库与基础服务 (Backend Core)
- [ ] **DB Migration**:
    - [ ] `contractors`: 移除 `rateType` 字段（或保留但废弃）。
    - [ ] `invoices`: 确认包含 `walletAppliedAmount`, `amountDue`。
    - [ ] `contractor_invoices`: 确认包含 `clientInvoiceId`。
    - [ ] `wallet_transactions`: 新增 `refund_out` 类型。
    - [ ] `credit_notes`: 增加 `disposition` 字段 (`wallet`, `bank`)。
- [ ] **Wallet Service 重构**:
    - [ ] 实现 `payInvoice(id, amount?)` 支持部分支付逻辑。
    - [ ] 移除所有自动扣款 (Auto-deduction) 代码。
    - [ ] 实现 `releaseFrozenToCreditNote` 原子操作。
- [ ] **Invoice Service 重构**:
    - [ ] 实现 `deleteInvoice` 的“安全删除”逻辑（检查依赖）。
    - [ ] 移除 `applyCreditToInvoice` 相关接口。

### Phase 2: AOR 业务模块 (AOR Module)
- [ ] **Contractor Invoice Generation**:
    - [ ] 实现 Cron Job: 按 Frequency 生成 Draft Invoice。
    - [ ] 实现 Admin Approval API (`draft` -> `approved`)。
- [ ] **Aggregation Logic**:
    - [ ] 更新 `GenerateMonthlyInvoice` 服务，增加 AOR 分支。
    - [ ] 实现 `Unbilled` 查询逻辑 (`approved` + `clientInvoiceId is null`)。
    - [ ] 实现 Client Invoice 生成与 ID 回写事务。

### Phase 3: 前端交互与页面 (Frontend)
- [ ] **Admin Portal**:
    - [ ] 新增 **Contractor Invoices** Tab (Pending / Approved / Billed / Paid)。
    - [ ] 新增 **Deposit Release Tasks** 页面 (Release / Refund / Cancel)。
    - [ ] Invoice List 增加 Type 筛选器。
- [ ] **Client Portal**:
    - [ ] Invoice Detail: 移除 "Apply Credit"，新增 "Pay with Wallet" (支持余额不足提示)。
    - [ ] Invoice Detail: 显示 "Payment History" (Wallet + Bank)。

### Phase 4: 测试与验收 (QA & Acceptance)
- [ ] **Unit Tests**: 覆盖 Wallet 扣款、余额计算、并发锁。
- [ ] **Integration Tests**: 模拟完整的 Deposit -> Release -> CN -> Wallet 闭环。
- [ ] **UAT**: 财务人员验证 AOR 汇总金额是否准确。

---

## 5. 风险控制与合规检查 (Compliance Checklist)

- [ ] **不可篡改性**: 确认 `Sent` 状态后的 Invoice 无法修改金额。
- [ ] **资金闭环**: 确认 `Total Assets = Main Wallet + Frozen Wallet`。
- [ ] **权限隔离**: 确认只有 `Finance Manager` 角色可以执行 Release 和 Refund 操作。
- [ ] **审计痕迹**: 确认所有 Wallet 变动都有对应的 `referenceId` (Invoice/CN ID)。
