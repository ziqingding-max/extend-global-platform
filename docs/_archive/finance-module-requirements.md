# EOR SaaS Admin — Finance 模块需求文档

> **版本**: v2.1（已确认 + Payroll 成本公式修正）  
> **日期**: 2026-02-25  
> **作者**: Manus AI  
> **范围**: Invoice（发票）、Billing Entity（开票主体）、Exchange Rate（汇率）三个子模块的完整业务逻辑与功能设计，以及 Payroll 成本计算公式的明确定义

---

## 一、模块概览与资金流向

Finance 模块是 EOR SaaS 管理系统的核心收入环节。其职责是将**已审批的 Payroll 数据**转化为面向客户的 **Invoice**，并处理多币种结算、服务费计算、税务、开票主体管理等财务流程。

### 1.1 资金结算路径

整个 EOR 业务的资金流向如下：

```
客户 ──付款──→ Billing Entity ──付款──→ 各国家（发工资、缴社保等）
                    │
                    └── Service Fee 留存在 Billing Entity 作为公司收入
```

关键要点：不同的 Billing Entity 负责不同国家的资金中转。当 Billing Entity 向**特定国家**汇款时，该国政府可能对汇入的 employment cost 总额征收增值税（VAT）。这部分 tax 成本需要通过 Invoice 转嫁给客户。

### 1.2 三个子模块的关系

| 子模块 | 核心职责 | 上游依赖 | 下游影响 |
|--------|---------|---------|---------|
| **Billing Entity** | 管理公司开票主体（法人实体、银行收款信息） | 无 | Invoice 关联开票主体，展示收款方式 |
| **Exchange Rate** | 管理多币种汇率及加价比例 | 无 | Invoice 生成时用于币种转换 |
| **Invoice** | 从 Payroll 生成客户发票，管理发票全生命周期 | Payroll（approved）、Customer Pricing、Exchange Rate、Billing Entity、Countries Config（VAT） | 客户付款、财务对账 |

---

## 二、Payroll 成本计算公式（权威定义）

Payroll 是 Invoice 的核心数据来源。以下明确定义 Payroll 中各级别的成本计算公式，确保 Payroll → Invoice 数据链路的一致性。

### 2.1 Payroll Item 级别（单个员工）

每个 Payroll Item 代表一个员工在某月的薪资明细。各字段的计算关系如下：

| 字段 | 公式 | 说明 |
|------|------|------|
| **Gross** | `baseSalary + bonus + allowances - unpaidLeaveDeduction` | 员工应发工资总额 |
| **Net** | `gross - deductions - taxDeduction - socialSecurityDeduction` | 员工实发工资（到手） |
| **Total Employment Cost** | `gross + employerSocialContribution + reimbursements` | 公司为该员工支付的总成本 |

各字段含义：

| 字段 | 来源 | 说明 |
|------|------|------|
| `baseSalary` | 员工信息 | 基本工资，auto-fill 时从员工记录获取 |
| `bonus` | Adjustments 模块 | 当月已审批的奖金汇总 |
| `allowances` | Adjustments 模块 | 当月已审批的津贴汇总 |
| `reimbursements` | Adjustments 模块 | 当月已审批的报销汇总（公司实际支出，计入 Total Employment Cost） |
| `deductions` | Adjustments 模块 | 当月已审批的扣款汇总 |
| `taxDeduction` | 运营经理手动填写 | 个人所得税扣除（由当地会计师提供） |
| `socialSecurityDeduction` | 运营经理手动填写 | 个人社保扣除（由当地会计师提供） |
| `unpaidLeaveDeduction` | 系统计算 + 运营经理可编辑 | 无薪假扣款 = baseSalary / 月工作日 × 无薪假天数 |
| `employerSocialContribution` | 运营经理手动填写 | 雇主社保成本（由当地会计师提供），**月度实际值** |

### 2.2 Payroll Run 级别（国家月度汇总）

每个 Payroll Run 代表某国家某月的薪资汇总。Run 级别的汇总字段直接累加所有 Item：

| 字段 | 公式 | 说明 |
|------|------|------|
| **Total Gross** | `Σ item.gross` | 所有员工应发工资总额 |
| **Total Deductions** | `Σ (item.deductions + item.taxDeduction + item.socialSecurityDeduction + item.unpaidLeaveDeduction)` | 所有员工扣款总额 |
| **Total Net** | `Σ item.net` | 所有员工实发工资总额 |
| **Total Employer Cost** | `Σ item.totalEmploymentCost` | 所有员工的总雇佣成本 |

> **已修复 Bug（v2.1）：** 之前 `Total Employer Cost` 的计算中，`employerSocialContribution` 被重复累加了一次（Item 级别的 `totalEmploymentCost` 已包含 `employerSocialContribution`，但 Run 汇总时又额外加了一次）。现已修正为直接累加各 Item 的 `totalEmploymentCost`。

### 2.3 Estimated Employer Cost vs Employer Social Contribution

系统中存在两个容易混淆的字段，需要明确区分：

| 字段 | 所在表 | UI Label | 用途 | 填写时机 |
|------|--------|----------|------|---------|
| `estimatedEmployerCost` | employees | **Estimated Employer Cost** | 入职前预估的雇主成本，用于 **Deposit** 计算 | 员工创建/onboarding 阶段，由客户经理预估填入 |
| `employerSocialContribution` | payroll_items | **Employer Social Contribution** | 每月实际的雇主社保成本 | 每月 Payroll 处理时，由运营经理从当地会计师获取后填入 |

两者可能数值不同，这是合理的：预估值用于提前收取 Deposit，实际值用于月度 Payroll 结算。

---

## 三、当前实现状态分析

### 3.1 已实现的功能

| 功能 | 状态 | 说明 |
|------|------|------|
| Invoice CRUD | ✅ 基础完成 | 手动创建、列表、详情、状态更新 |
| Invoice 从 Payroll 自动生成 | ✅ 基础完成 | 按客户聚合多国 Payroll，生成 draft invoice |
| Invoice Line Items | ✅ 基础完成 | employment_cost 和 service_fee 两类 |
| Invoice 状态流转 | ✅ 基础完成 | draft → pending_review → sent → paid/overdue |
| Billing Entity CRUD | ✅ 基础完成 | 创建、编辑、删除、默认标记 |
| Exchange Rate 管理 | ✅ 基础完成 | 手动录入、5% markup 自动计算、初始化默认值 |
| Exchange Rate 在 Invoice 生成中使用 | ✅ 基础完成 | 本地货币 → 客户结算货币转换 |
| Payroll 成本计算 | ✅ 已修复 | Total Employer Cost 双重计算 bug 已修正 |

### 3.2 关键缺失与待改进项

| 编号 | 模块 | 问题 | 优先级 |
|------|------|------|--------|
| 1 | Invoice | 未关联 Billing Entity，无法确定由哪个实体开票 | P0 |
| 2 | Invoice | 生成时不检查 Payroll Run 是否已 approved | P0 |
| 3 | Invoice | Service Fee 计算不完整（缺 global_discount 模式、未按 serviceType 区分） | P0 |
| 4 | Invoice | Draft 状态下无法编辑 line items（增删改） | P0 |
| 5 | Invoice | 缺少 Tax/VAT 计算（特定国家的 employment cost 需征收 VAT） | P0 |
| 6 | Invoice | 缺少 Deposit Invoice 自动生成（员工通过 review 时触发） | P1 |
| 7 | Invoice | 缺少 Invoice PDF 导出功能 | P1 |
| 8 | Invoice | 缺少自动邮件发送功能 | P1 |
| 9 | Invoice | 缺少月度管理视图 | P1 |
| 10 | Invoice | 编号规则使用随机数，可能重复 | P1 |
| 11 | Invoice | Credit Note / Deposit Refund 缺少完整业务逻辑 | P2 |
| 12 | Billing Entity | 未与 Customer 关联 | P0 |
| 13 | Billing Entity | 缺少 Logo 字段（PDF 导出需要） | P1 |
| 14 | Exchange Rate | Markup 比例硬编码 5%，不可调整 | P1 |
| 15 | Exchange Rate | 缺少汇率历史按月管理 | P2 |
| 16 | Employee | `employerSocialContribution` 字段需重命名为 `estimatedEmployerCost`，用于 Deposit 计算 | P1 |

---

## 四、完整业务流程设计

### 4.1 月度 Invoice 生成流程（核心流程）

```
Payroll Runs Approved（多个国家）
        ↓
财务经理触发 "Generate Invoices"（选择月份）
        ↓
系统校验：该月所有相关 Payroll Run 是否已 approved
  ├── 未全部 approved → 提示哪些国家尚未审批，阻止生成
  └── 全部 approved → 继续
        ↓
按客户聚合 Payroll Items（通过 employee.customerId）
        ↓
对每个客户：
  ├── 确定结算货币（customer.settlementCurrency）
  ├── 确定开票主体（customer.billingEntityId）
  ├── 获取汇率（该月生效的汇率 + markup）
  ├── 计算 Employment Cost
  │     └── 各国 payrollItem.totalEmploymentCost × 汇率（含 markup）
  ├── 计算 Service Fee（按客户定价规则，详见 4.2）
  ├── 计算 Tax/VAT（按国家 VAT 规则，详见 4.3）
  └── 生成 Draft Invoice + Line Items
        ↓
财务经理审核 Draft Invoice
  ├── 可编辑 line items（修改金额、增删行项）
  ├── 可调整汇率 markup
  └── 可添加备注
        ↓
Submit for Review → Sent（自动发送邮件给客户）→ Paid / Overdue
```

### 4.2 Service Fee 计算规则

Service Fee 是 EOR 公司的核心收入来源。系统自动计算后生成 draft，由财务经理人工 review。

**费率匹配优先级（从高到低）：**

| 优先级 | 定价模式 | 匹配条件 | 计算方式 |
|--------|---------|---------|---------|
| 1 | `country_specific` | 客户 + 国家 + 服务类型 | 固定价格 × 该国该服务类型的员工数 |
| 2 | `global_discount` | 客户级全局折扣 | 标准费率 × (1 - 折扣率) × 员工数 |
| 3 | 国家标准费率 | 无客户定价时回退 | countries_config 中的 standardEorRate / standardVisaEorRate / standardAorRate |

**按服务类型区分：** 每个员工有 `serviceType`（eor / visa_eor / aor），匹配对应的费率。同一国家不同服务类型的费率不同。

**Line Item 示例：**
```
Service Fee - Hong Kong EOR (3 employees × $500/employee)    $1,500.00
Service Fee - Singapore Visa EOR (1 employee × $800/employee)  $800.00
```

### 4.3 Tax/VAT 计算规则

**核心逻辑：** 当 Billing Entity 向特定国家汇款支付 employment cost 时，该国政府可能对汇入总额征收增值税。这部分成本需要通过 Invoice 转嫁给客户。

**计算方式：**

```
某国家 VAT = 该国家所有员工的 Total Employment Cost（结算货币） × 该国家 VAT 税率
```

**关键规则：**

VAT 仅针对 **Employment Cost** 部分征收，不包含 Service Fee。不是所有国家都征收 VAT，需要在 `countries_config` 中标记。VAT 税率因国家而异。

**数据来源：** `countries_config` 表新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `vatApplicable` | boolean | 该国家是否征收 VAT |
| `vatRate` | decimal(5,4) | VAT 税率（如 0.0700 = 7%） |

**Invoice Line Item 示例：**
```
Employment Cost - John Smith (HK, HKD → USD)                 $6,200.00
Employment Cost - Jane Doe (HK, HKD → USD)                   $5,800.00
Service Fee - Hong Kong EOR (2 employees × $500)              $1,000.00
VAT - Hong Kong (7% on Employment Cost $12,000.00)              $840.00
```

### 4.4 Deposit Invoice 生成流程

**触发时机：** 员工状态从 `pending_review` 变为 `onboarding`（即通过 review）时，系统自动生成 Deposit Invoice。

**计算公式：**

```
Deposit = (Base Salary + Estimated Employer Cost) × Deposit Multiplier
```

| 参数 | 来源 | 说明 |
|------|------|------|
| Base Salary | `employees.baseSalary` | 员工基本薪资 |
| Estimated Employer Cost | `employees.estimatedEmployerCost`（原 `employerSocialContribution`） | 入职前由客户经理预估填入 |
| Deposit Multiplier | `customers.depositMultiplier` | 默认 2（两个月），部分客户为 1 |

**Deposit Invoice 特点：**

Deposit Invoice 的 `invoiceType` 为 `deposit`，关联到具体员工。结算货币跟随客户的 `settlementCurrency`，如果员工薪资货币与结算货币不同，需要汇率转换。开票主体为客户关联的 Billing Entity。

**Deposit Invoice Line Item 示例：**
```
Deposit - John Smith
  Base Salary: $5,000.00
  Estimated Employer Cost: $1,200.00
  Monthly Employment Cost: $6,200.00
  Deposit (×2): $12,400.00
```

**Deposit Refund：** 员工离职（terminated）时，可手动创建 `deposit_refund` 类型的 Invoice，关联原 Deposit Invoice（`relatedInvoiceId`）。

### 4.5 Invoice 状态流转

```
draft ──→ pending_review ──→ sent ──→ paid
  │              │              │
  │              ↓              ↓
  │          cancelled       overdue ──→ paid
  │
  ↓
 void
```

| 状态 | 可执行操作 | 说明 |
|------|----------|------|
| **draft** | 编辑所有字段、编辑 line items、删除、提交审核 | 自动生成后的初始状态 |
| **pending_review** | 标记已发送、退回 draft、取消 | 财务经理审核中 |
| **sent** | 标记已付款（需填 paidAmount）、标记逾期 | 已发送给客户（系统自动发邮件 + 支持导出手动发送） |
| **overdue** | 标记已付款 | 逾期未付 |
| **paid** | 创建 credit note | 已收款 |
| **cancelled** | 无 | 已取消 |
| **void** | 无 | 已作废 |

**发送机制：** 当状态变为 `sent` 时，系统自动发送邮件给客户（附带 Invoice PDF），同时支持导出 PDF 手动发送。

### 4.6 Credit Note 流程

Credit Note（贷项通知单）用于冲红已发送/已付款的 Invoice。从已付款/已发送的 Invoice 详情页创建，必须关联原 Invoice（`relatedInvoiceId`），支持全额冲红或部分冲红。Line Items 金额为负数，创建后状态为 draft，审核后可发送。

---

## 五、Billing Entity 模块设计

### 5.1 核心定位

Billing Entity 代表公司的法人实体，是 Invoice 的开票方和收款方。每个客户关联一个 Billing Entity，Invoice 中需要列明该 Billing Entity 的收款方式（银行账户信息）。

### 5.2 Customer ↔ Billing Entity 关联

**关联方式：** 在 `customers` 表新增 `billingEntityId` 字段，建立一对一关系。

**关联时机：** 在 Customer 上传合同（Contract）时设置关联的 Billing Entity。也可以在 Customer 详情页直接设置。

### 5.3 Schema 变更

`billing_entities` 表新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `logoUrl` | text | 公司 logo URL（用于 Invoice PDF） |
| `logoFileKey` | varchar(500) | S3 file key |
| `invoicePrefix` | varchar(20) | Invoice 编号前缀（如 "SG-"、"HK-"） |
| `paymentTermDays` | int | 默认付款期限（天），用于自动计算 Invoice 到期日 |

### 5.4 Invoice 中的收款信息展示

Invoice（包括 PDF 导出）中需要展示 Billing Entity 的以下信息：公司名称（entityName / legalName）、公司地址、Logo、银行名称（bankName）、银行账号（bankAccountNumber）、SWIFT Code（bankSwiftCode）、Routing Number（bankRoutingNumber）、收款货币（currency）。

---

## 六、Exchange Rate 模块设计

### 6.1 核心功能

Exchange Rate 模块管理多币种之间的汇率，在 Invoice 生成时用于将各国本地货币的 employment cost 转换为客户的结算货币。

### 6.2 Markup 机制

**当前：** 固定 5% markup，硬编码在 `exchangeRateService.ts` 中。

**改进：** 系统默认 markup 比例可在 System Settings 中配置。每条汇率记录的 markup 可手动调整（覆盖系统默认值）。Invoice 生成时使用 `rateWithMarkup` 进行转换。Draft Invoice 中财务经理可以进一步调整汇率。

### 6.3 汇率使用规则

Invoice 生成时的汇率选择逻辑：首先查找该月份 `effectiveDate` 最近的汇率记录；如果没有找到，使用最新的汇率记录。汇率记录中同时存储原始汇率（`rate`）和含 markup 的汇率（`rateWithMarkup`），Invoice 生成使用 `rateWithMarkup`。

### 6.4 未来规划（不在本次范围）

集成外部汇率 API 自动获取最新汇率、按客户或按币种设置不同 markup 比例、汇率变动提醒。

---

## 七、数据模型变更汇总

### 7.1 Schema 变更

| 表 | 变更类型 | 字段 | 类型 | 说明 |
|----|---------|------|------|------|
| `employees` | **重命名** | `employerSocialContribution` → `estimatedEmployerCost` | decimal(15,2) | 入职前预估雇主成本，用于 Deposit 计算 |
| `customers` | **新增** | `billingEntityId` | int | 关联的开票主体 |
| `customers` | **新增** | `depositMultiplier` | int, default 2 | Deposit 倍数（1 或 2） |
| `invoices` | **新增** | `billingEntityId` | int | 该 Invoice 的开票主体 |
| `billing_entities` | **新增** | `logoUrl` | text | 公司 logo URL |
| `billing_entities` | **新增** | `logoFileKey` | varchar(500) | S3 file key |
| `billing_entities` | **新增** | `invoicePrefix` | varchar(20) | Invoice 编号前缀 |
| `billing_entities` | **新增** | `paymentTermDays` | int | 默认付款期限（天） |
| `countries_config` | **新增** | `vatApplicable` | boolean, default false | 是否征收 VAT |
| `countries_config` | **新增** | `vatRate` | decimal(5,4) | VAT 税率 |

### 7.2 不变更的部分

`exchange_rates` 表结构不变。`invoice_items` 表结构不变（`itemType` enum 已覆盖所需类型）。`customer_pricing` 表结构不变（已支持两种定价模式）。`payroll_items` 表的 `employerSocialContribution` 字段不变（这是月度实际值，与 employees 表的 `estimatedEmployerCost` 是不同概念）。

---

## 八、Invoice 语言

Invoice 的语言跟随客户系统语言（`customers.language` 字段，支持 `en` / `zh`）。具体影响包括：Invoice PDF 的标题、字段标签、页脚等使用客户语言；Line Item 的 description 使用客户语言；邮件模板使用客户语言。

---

## 九、实施优先级与开发计划

根据业务价值和依赖关系，建议按以下顺序实施：

### Phase 1（P0 — 核心逻辑修正）

| 功能 | 预估工作量 | 说明 |
|------|-----------|------|
| Schema 变更（employees 重命名、customers 新增字段、invoices 新增字段、countries_config VAT 字段、billing_entities 新增字段） | 小 | 基础数据结构 |
| Customer ↔ Billing Entity 关联（前后端） | 小 | Customer 页面增加 Billing Entity 选择 |
| Invoice 生成逻辑优化（前置校验 + 完整 service fee 计算 + VAT 计算） | 大 | 核心收入逻辑 |
| Invoice Draft 编辑能力（line items 增删改 + 汇率调整） | 中 | 财务经理日常必需 |

### Phase 2（P1 — 完整流程）

| 功能 | 预估工作量 | 说明 |
|------|-----------|------|
| Deposit Invoice 自动生成（员工通过 review 时触发） | 中 | 含 estimatedEmployerCost 字段改造 |
| Invoice 编号自增序列 | 小 | 含 Billing Entity prefix |
| Invoice 月度管理视图 | 中 | 全局视图 + 生成状态 |
| Exchange Rate markup 可调整 | 小 | System Settings 配置 |
| Invoice PDF 导出 | 大 | 模板设计 + PDF 生成 |
| Invoice 自动邮件发送 | 中 | 邮件模板 + 发送逻辑 |
| Billing Entity Logo 上传 | 小 | S3 存储 + PDF 展示 |

### Phase 3（P2 — 扩展功能）

| 功能 | 预估工作量 | 说明 |
|------|-----------|------|
| Credit Note 完整流程 | 中 | 冲红逻辑 |
| Deposit Refund 流程 | 中 | 离职退款 |
| 汇率历史按月管理 | 小 | 历史查询 |

### Phase 4（P3 — 未来规划）

| 功能 | 说明 |
|------|------|
| 客户自助门户（查看/下载 Invoice） | 需要客户端开发 |
| 自动对账（银行流水匹配） | 需要银行 API 集成 |
| 逾期自动提醒 | 定时任务 |
| 财务报表（收入、应收账款、账龄分析） | 数据分析 |
| 汇率 API 自动获取 | 外部 API 集成 |
