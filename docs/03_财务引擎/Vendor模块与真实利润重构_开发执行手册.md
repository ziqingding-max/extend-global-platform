# Vendor 模块与真实利润重构 - 开发执行手册

> **文档说明**：本文档为开发执行手册，包含了详细的业务逻辑修正、字段映射关系、需要修改的文件列表及具体代码实现指导。可以直接拆分给不同的开发人员并行执行。

---

## 1. 业务逻辑与数据模型重构

### 1.1 真实 P&L 利润结构
原有的利润计算逻辑（仅累加发票金额和本地货币账单）无法反映真实的美元盈利情况。新的 P&L 结构严格区分**经常性业务**与**非经常性业务**，并引入**实际汇差**计算。

```text
=== Recurring Business (核心 EOR 业务) ===
[发票类型: monthly_eor, monthly_visa_eor, monthly_aor]
  Service Fee Revenue                     [Invoice 侧的 serviceFeeTotal]
  FX Markup Revenue (实际汇差)            [Invoice 侧 Employment Cost (USD) - Vendor Bill 侧 settlementAmountUsd]
  (=) Total Recurring Revenue
  
  (-) Vendor Service Fees                 [Vendor Bill 侧: billType = service_fee]
  (-) Bank Charges                        [Vendor Bill 侧: billType = bank_charge]
  (=) Core Operating Profit

=== Non-recurring Business (非经常性业务) ===
[发票类型: visa_service, manual]
  Non-recurring Invoice Revenue           [一次性服务收费]
  (-) Non-recurring Vendor Cost           [Vendor Bill 侧: category = equipment, consulting 等]
  (=) Non-recurring Margin

=== Other Expenses ===
  (-) Penalties / Late Payment Fees       [Vendor Bill 侧: category = penalty, late_payment_fee]
  (-) Other Operational Costs             [Vendor Bill 侧: billType = operational]

=== Net Profit ===
  Core Operating Profit + Non-recurring Margin - Other Expenses
```

### 1.2 对账与告警逻辑（按国家+月份维度）
- **雇主成本差异**：`invoiceItems.localAmount` (Employment Cost) 总和 vs `vendorBills.localAmount` (Government)。如果不为 0，触发 **Mismatch Alert** 告警。
- **实际汇差收入**：`invoiceItems` 的 Employment Cost (USD) 总和 vs `vendorBills.settlementAmountUsd`。差值计入 `FX Markup Revenue`。

---

## 2. Sprint 1: 基础数据模型与数据入口 (UI & Schema)

**目标**：扩展 Vendor 和 Vendor Bill 的分类体系，并在前端强制要求录入双币种对账字段。

### 2.1 数据库 Schema 调整 (`drizzle/schema.ts`)
- **`vendors.vendorType`** (Line 1495):
  修改枚举为 `["government", "financial", "professional_service", "equipment_provider", "hr_recruitment", "operational"]`。
- **`vendorBills.category`** (Line 1545):
  在现有列表中追加 `"penalty"`, `"late_payment_fee"`。

### 2.2 后端 API 调整 (`server/routers/vendors.ts`, `vendorBills.ts`)
- 更新 Zod schema，使之与上述新的枚举值保持一致。
- 在 `vendorBills.ts` 的 `create` 和 `update` 路由中，增加业务逻辑校验：如果关联的 `vendor.vendorType === "government"`，则必须验证 `localAmount`, `localCurrency`, `settlementAmountUsd` 不为空。

### 2.3 前端页面调整 (`client/src/pages/`)
- **`Vendors.tsx`**:
  - 更新 `vendorTypeColors` 和 `vendorTypeLabels` 映射表。
  - 表单联动：当 `vendorType` 选为 `government` 时，`serviceType` 下拉框仅建议 `Tax Filing` 和 `Social Contributions`。
- **`VendorBills.tsx`**:
  - 更新 `categoryKeys` 数组。
  - **Bug 修复**：`editBill.billType` 下拉框目前只有 `operational/deposit/deposit_refund`，需补全 `service_fee/pass_through/bank_charge`。
  - 表单联动：当选择的 Vendor 是 `government` 时，强制锁定 `billType` 为 `pass_through`，并在 UI 上**高亮** `Local Amount` 和 `Settlement Amount (USD)` 字段（设为 required）。

---

## 3. Sprint 2: 核心财务引擎重构 (Net P&L & Dashboard)

**目标**：重写 P&L 计算逻辑，修复利润失真 Bug，并在 Dashboard 展示核心财务指标。

### 3.1 `server/routers/netPnl.ts` (核心重构)
- **彻底重写**利润聚合逻辑，按照 `1.1` 节的结构计算。
- **修复 Bug**：计算 `pass_through` 成本时，必须使用 `settlementAmountUsd`，绝不能使用 `totalAmount`（这会导致把日元、欧元等本地货币金额错误当成美元累加）。
- 分离 `Recurring` 和 `Non-recurring` 数据。
- 计算实际汇差：按 `countryCode` 和 `payrollMonth` 匹配 Invoices 和 Government Bills。

### 3.2 `server/routers/reports.ts` (Profit & Loss Report)
- 同样需要修复使用 `totalAmount` 计算 Expense 的 Bug，必须转换为统一的 USD (使用 `settlementAmountUsd` 或汇率转换)。

### 3.3 `server/routers/dashboard.ts` (Overview 概览)
- **修复 Bug**：当前的 `financeOverview` 完全没有查询 `vendorBills`，导致 Dashboard 缺失成本数据。
- 增加对 `vendorBills` 的聚合，计算出 `Total Actual Cost (USD)`。
- 返回数据结构增加：`grossMargin`, `coreOperatingProfit`, `netProfit`。

### 3.4 前端 Dashboard (`client/src/pages/Dashboard.tsx`)
- 新增 KPI 卡片：`Gross Margin`, `Net Profit`。
- 修改 `Monthly Revenue` 柱状图：增加 `Gross Margin` 和 `Net Profit` 的折线。

---

## 4. Sprint 3: 对账告警引擎与系统联调 (Reconciliation Alert)

**目标**：实现双币种对账告警，确保会计师数据与政府账单一致。

### 4.1 `server/services/reconciliationEngine.ts`
- 修改 `suggestReconciliationMatches` 函数：
  - 提取对应月份、国家的 `Invoice` 中属于 `Employment Cost` 的 `localAmount` 总和。
  - 提取对应月份、国家的 `Government Vendor Bill` 的 `localAmount`。
  - **告警逻辑**：如果两者绝对差值 > 1.00，则设置 `matchConfidence = "low"`，并附加 `matchReason: "Local currency mismatch! Accountant data differs from Government bill."`。

### 4.2 前端对账页面 (`client/src/pages/Reconciliation.tsx`)
- **Matches Tab**：
  - 在表格中突出显示 `Local Variance`（本地货币差异）。
  - 如果存在差异，显示红色的 `Mismatch Alert` 徽章。
- **Net P&L Tab**：
  - 更新表格列头，严格按照新的 P&L 结构展示：`Invoice Revenue` | `Actual Cost (USD)` | `Gross Margin` | `Service Fees` | `Opex` | `Net Profit`。

---

## 5. 测试与 QA 规范

所有参与此 Task 的开发人员必须遵守以下测试规范：

1. **测试数据构造**：
   - 必须构造多币种场景（如 JPY 员工、EUR 员工）。
   - 必须构造 `invoiceType = "manual"` 的非经常性业务场景。
   - 必须构造“本地货币金额不一致”的异常对账场景。
2. **计算验证**：手动计算一笔测试数据的 Gross Margin 和 Net Profit，与系统报表输出进行核对，确保精确到美分（$0.01）。
3. **After Test Clean Up**：测试完成后，必须清理数据库中产生的测试 Invoice、Vendor 和 Vendor Bills，保持环境整洁。
