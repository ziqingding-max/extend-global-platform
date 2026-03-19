# Vendor 模块与真实利润重构详细方案

## 1. 业务背景与逻辑修正

经过与业务方的深入沟通，明确了 Extend Global (EG) 的核心资金流转与利润计算逻辑：

1. **真实成本的来源**：Invoice 中的 `Employment Cost`（包含 Gross Salary, Employer Social Security 等）**不是预估值**，而是由当地会计师事务所提供的**真实本地货币数据**。
2. **收款与汇差**：EG 收到这些真实的本地货币成本后，按当时汇率**上浮一定比例**（FX Markup），加上服务费，折算成 USD 向客户开具 Invoice。客户支付 USD。
3. **付款与对账**：EG 收到 USD 后，在真实市场换汇，支付本地货币给当地政府（税局/社保局）和会计师。
4. **对账的真正意义**：
   - **正常情况**：会计师给的数据 = 政府实际收的钱。
   - **异常告警**：如果政府实际收的钱（Government Vendor Bill 的本地货币金额）与会计师提供的数据（Invoice Employment Cost 中的本地货币金额）**不一致**，系统必须产生告警，通知运营团队（可能存在政策变动、罚款或计算错误）。
5. **真实利润公式**：
   - `Gross Margin = Invoice USD 收款 - 实际换汇支付的 USD (settlementAmountUsd)`
   - `Net Profit = Gross Margin - 运营费用 (会计师费、银行手续费、设备、猎头、罚款等)`

---

## 2. 数据库 Schema 改造点 (`drizzle/schema.ts`)

为了支撑上述业务逻辑，底层数据模型需要做以下扩展：

### 2.1 `vendors` 表
- **`vendorType` 字段扩展**：
  将现有的 `["client_related", "operational"]` 替换为 6 大类：
  `["government", "financial", "professional_service", "equipment_provider", "hr_recruitment", "operational"]`

### 2.2 `vendor_bills` 表
- **`category` 字段扩展**：
  在现有类别中增加 `penalty`（罚款）和 `late_payment_fee`（滞纳金）。
- **字段强制性逻辑（通过 Zod 和前端约束，非 Schema 层）**：
  当 `vendorType` 为 `government` 时，必须填写 `localAmount`, `localCurrency`, `settlementAmountUsd`，以便与 Invoice 中的真实数据进行对账。

---

## 3. 后端 API 改造点 (`server/routers/`)

### 3.1 `vendors.ts`
- 更新 `create` 和 `update` 的 Zod 校验，支持新的 6 种 `vendorType`。

### 3.2 `vendorBills.ts`
- 更新 Zod 校验，支持新增的 `category`。
- 增加业务逻辑校验：如果关联的 Vendor 是 `government` 类型，强制要求传入 `localAmount` 和 `settlementAmountUsd`。

### 3.3 `netPnl.ts` (核心利润计算引擎)
当前逻辑未扣除 Pass-through 账单的实际 USD 成本。需彻底重构聚合逻辑：
- **Total USD Inflow** = Sum of paid invoices `total`
- **Total Actual Cost (USD)** = Sum of paid `vendorBills.settlementAmountUsd` (where `vendorType` = `government` / `billType` = `pass_through`)
- **Gross Margin** = Total USD Inflow - Total Actual Cost
- **Operating Expenses (Opex)** = Sum of paid `vendorBills.totalAmount` (where `vendorType` != `government`)
- **Net Profit** = Gross Margin - Operating Expenses
- *注意：这些指标需要在按月、按客户、按渠道的维度上进行下钻计算。*

### 3.4 `dashboard.ts` (Overview 概览数据)
- 修改 `financeOverview` 查询，加入对 Vendor Bills 的聚合。
- 返回给前端的数据结构中增加：`totalActualCost`, `grossMargin`, `totalOpex`, `netProfit`。

### 3.5 `reconciliationEngine.ts` (对账告警逻辑)
- 重构 `suggestReconciliationMatches` 函数。
- 匹配逻辑：找到同月份、同国家的 Invoice 和 Government Vendor Bill。
- **告警逻辑**：对比 `Invoice.localCurrencyTotal` (或具体的社保税费项) 与 `VendorBill.localAmount`。
- 如果两者差值超过容差（如 1.00 本地货币），将该 Match 的 `matchConfidence` 标记为 `low`，并生成 `matchReason: "Local currency mismatch! Accountant data differs from Government bill."`，作为告警提示运营。

---

## 4. 前端页面改造点 (`client/src/pages/`)

### 4.1 `Vendors.tsx`
- 更新 `vendorTypeOptions` 和颜色映射，支持 6 大分类。
- 表单联动：选择不同的 Vendor Type 时，动态过滤 `serviceType` 的建议选项（例如 Government 只能选 Tax/Social Security 相关服务）。

### 4.2 `VendorBills.tsx`
- 更新 `categoryKeys`，加入 `penalty` 和 `late_payment_fee`。
- 表单联动：
  - 当选择的 Vendor 类型为 `government` 时，`billType` 强制锁定为 `pass_through`。
  - 表单中**高亮** `Local Amount` 和 `Settlement Amount (USD)` 字段，并设为必填。

### 4.3 `Dashboard.tsx` (Finance Tab)
- 现有的 Finance KPI 卡片只展示了 Revenue 和 Service Fee。
- **新增 KPI 卡片**：
  - `Gross Margin` (Total Revenue - Actual Cost)
  - `Operating Expenses`
  - `Net Profit`
- **图表调整**：Monthly Revenue 柱状图中，增加 `Gross Margin` 和 `Net Profit` 的折线，直观展示盈利趋势。

### 4.4 `Reconciliation.tsx`
- 在 Suggested Matches 表格中，突出显示“本地货币差异（Local Variance）”。
- 如果出现本地货币差异，用醒目的红色 Badge 标出“Mismatch Alert”，提醒运营会计师数据与政府账单不符。
- Net P&L Tab 的表格列头更新，反映真实的公式：`Gross Invoice` | `Actual Cost (USD)` | `Gross Margin` | `Opex` | `Net Profit`。

---

## 5. 敏捷开发排期与执行计划 (3 个 Sprint)

### Sprint 1: 基础数据模型与数据入口 (Schema & UI Forms)
- **任务**：
  1. 修改 `schema.ts` 中的枚举值。
  2. 修改 `vendors.ts` 和 `vendorBills.ts` 的 API 校验。
  3. 修改 `Vendors.tsx` 前端页面，实现 Vendor Type 扩展。
  4. 修改 `VendorBills.tsx` 前端页面，实现 Government 账单的强约束（强调录入 settlementAmountUsd）。
- **产出**：系统能够正确、规范地录入 6 大类 Vendor 和对应的账单，包含罚款类别。

### Sprint 2: 核心财务引擎重构 (Net P&L & Dashboard)
- **任务**：
  1. 重写 `netPnl.ts`，按照 `Gross Margin = 收款 - 实际换汇支付` 的真实公式重新计算各项指标。
  2. 修改 `dashboard.ts`，聚合真实的成本和利润数据。
  3. 修改前端 `Dashboard.tsx` 和 `Reconciliation.tsx` (Net P&L Tab)，展示真实的利润指标。
- **产出**：管理层可以在 Dashboard 和报表中看到完全准确的真实利润。

### Sprint 3: 对账告警引擎与系统联调 (Reconciliation Alert & QA)
- **任务**：
  1. 修改 `reconciliationEngine.ts`，实现“会计师数据 vs 政府账单”的本地货币一致性校验。
  2. 修改前端 `Reconciliation.tsx`，展示告警信息。
  3. 创建全链路测试数据（从 Invoice 到 Vendor Bill），验证 P&L 计算和告警逻辑的准确性。
  4. 执行 After Test Clean Up。
- **产出**：运营团队能够及时发现会计师算错或政府罚款等异常情况，整个重构闭环完成。
