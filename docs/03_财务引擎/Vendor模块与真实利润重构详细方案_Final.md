# Vendor 模块与真实利润重构详细方案 (Final)

## 1. 业务背景与逻辑修正

经过与业务方的深入沟通，明确了 Extend Global (EG) 的核心资金流转与利润计算逻辑：

1. **真实成本的来源**：Invoice 中的 `Employment Cost`（包含 Gross Salary, Employer Social Security 等）**不是预估值**，而是由当地会计师事务所提供的**真实本地货币数据**。
2. **收款与汇差**：EG 收到这些真实的本地货币成本后，按当时汇率**上浮一定比例**（FX Markup），加上服务费，折算成 USD 向客户开具 Invoice。客户支付 USD。
3. **付款与对账**：EG 收到 USD 后，在真实市场换汇，支付本地货币给当地政府（税局/社保局）和会计师。
4. **对账的真正意义**：
   - **正常情况**：会计师给的数据 = 政府实际收的钱。
   - **异常告警**：如果政府实际收的钱（Government Vendor Bill 的本地货币金额）与会计师提供的数据（Invoice Employment Cost 中的本地货币金额）**不一致**，系统必须产生告警，通知运营团队（可能存在政策变动、罚款或计算错误）。

## 2. 真实 P&L 利润结构设计

为了准确反映 EG 的经营状况，P&L 报表将分为**核心经常性业务**和**非经常性业务**两部分：

### 2.1 核心 EOR 业务 (Recurring Business)
*对应发票类型：`monthly_eor`, `monthly_visa_eor`, `monthly_aor`*

- **Monthly Invoice Revenue (USD)**: 每月向客户收取的总 USD。
- **(-) Actual Employment Cost (USD)**: 实际支付给政府的 USD 成本（Government Vendor Bills 的 `settlementAmountUsd`）。
- **(=) Gross Margin**: 核心毛利。
- **(-) Vendor Service Fees**: 会计师事务所等专业服务商的费用。
- **(-) Bank Charges**: 银行手续费。
- **(=) Core Operating Profit**: 核心运营利润。

### 2.2 非经常性业务 (Non-recurring Business)
*对应发票类型：`visa_service`, `manual` (如设备采购、猎头费等)*

- **Non-recurring Invoice Revenue**: 客户支付的一次性费用。
- **(-) Non-recurring Vendor Cost**: 对应的供应商账单（设备供应商、猎头供应商的 Vendor Bill）。
- **(=) Non-recurring Margin**: 非经常性业务毛利。

### 2.3 其他运营费用与净利润 (Other Expenses & Net Profit)
- **(-) Penalties / Late Payment Fees**: 罚款、滞纳金等非常规支出。
- **(-) Other Operational Costs**: 其他日常运营开支。
- **(=) Net Profit**: Core Operating Profit + Non-recurring Margin - Other Expenses。

---

## 3. 数据库 Schema 与 API 改造点

### 3.1 `vendors` 表 & API
- **`vendorType` 字段扩展**：
  从现有的 `["client_related", "operational"]` 扩展为 6 大类：
  `["government", "financial", "professional_service", "equipment_provider", "hr_recruitment", "operational"]`

### 3.2 `vendor_bills` 表 & API
- **`category` 字段扩展**：
  在现有类别中增加 `penalty`（罚款）和 `late_payment_fee`（滞纳金）。
- **强约束逻辑**：
  当关联的 Vendor 是 `government` 类型时，后端 API 和前端表单强制要求填写 `localAmount`, `localCurrency` 和 `settlementAmountUsd`。

### 3.3 `netPnl.ts` (核心利润计算引擎)
- 彻底重构利润计算逻辑，按照上述第 2 节的 P&L 结构，分别聚合 Recurring 和 Non-recurring 的收入与成本。
- 修复现有 Bug：使用 `settlementAmountUsd` 作为真实美元成本，而不是错误地累加本地货币金额。

### 3.4 `dashboard.ts` (Overview 概览数据)
- 修复现有 Bug：当前 Dashboard 只有 Invoice 数据，没有成本数据。
- 增加 Vendor Bills 的聚合查询，向前端返回 `Gross Margin`, `Core Operating Profit`, `Net Profit` 等核心指标。

### 3.5 `reconciliationEngine.ts` (对账告警逻辑)
- 增加**本地货币一致性校验**：对比 `Invoice.localCurrencyTotal` 与 `VendorBill.localAmount`。
- 如果差值超过容差（如 1.00），生成 `matchReason: "Local currency mismatch! Accountant data differs from Government bill."`，并将 `matchConfidence` 标记为 `low`。

---

## 4. 前端页面改造点

### 4.1 `Vendors.tsx` & `VendorBills.tsx`
- 更新下拉选项，支持新的 Vendor Type 和 Bill Category。
- **表单联动**：选择 `government` Vendor 时，`billType` 锁定为 `pass_through`，并高亮 `Local Amount` 和 `Settlement Amount (USD)` 为必填项。

### 4.2 `Dashboard.tsx` (Finance Tab)
- 新增 KPI 卡片：`Gross Margin`, `Core Operating Profit`, `Net Profit`。
- 更新 Monthly Revenue 柱状图，增加利润折线。

### 4.3 `Reconciliation.tsx`
- 在 Suggested Matches 表格中突出显示“Local Variance”。
- 出现差异时展示红色的“Mismatch Alert” Badge。
- 重构 Net P&L Tab 的表格列头，反映新的 P&L 结构。

---

## 5. 敏捷开发与测试计划 (3 个 Sprint)

### Sprint 1: 基础数据模型与数据入口 (UI & Schema)
- **开发目标**：系统能够正确、规范地录入 6 大类 Vendor 和对应的账单（包含罚款和强制的 settlementAmountUsd）。
- **涉及文件**：`schema.ts`, `vendors.ts`, `vendorBills.ts`, `Vendors.tsx`, `VendorBills.tsx`
- **测试策略**：
  1. 创建各类 Vendor，验证下拉框联动。
  2. 创建 Government 账单，验证缺失 `settlementAmountUsd` 时系统是否拦截。
  3. 执行 After Test Clean Up，清理测试产生的 Vendor 和 Bill。

### Sprint 2: 核心财务引擎重构 (Net P&L & Dashboard)
- **开发目标**：管理层可以在 Dashboard 和报表中看到完全准确的真实利润（区分经常性与非经常性）。
- **涉及文件**：`netPnl.ts`, `dashboard.ts`, `Dashboard.tsx`, `Reconciliation.tsx` (Net P&L Tab)
- **测试策略**：
  1. 准备一套完整的测试数据：包含 EOR 发票、设备发票、政府账单、会计师账单、罚款账单。
  2. 验证 P&L 报表中的 `Gross Margin` 和 `Net Profit` 计算是否绝对准确。
  3. 执行 After Test Clean Up。

### Sprint 3: 对账告警引擎与系统联调 (Reconciliation Alert)
- **开发目标**：运营团队能够及时发现会计师算错或政府罚款等异常情况。
- **涉及文件**：`reconciliationEngine.ts`, `Reconciliation.tsx` (Matches Tab)
- **测试策略**：
  1. 构造“Invoice 本地金额 = 账单本地金额”的数据，验证正常 Match。
  2. 构造“Invoice 本地金额 ≠ 账单本地金额”的数据，验证 Mismatch Alert 是否正确触发。
  3. 执行全链路最终 QA 和 After Test Clean Up。
