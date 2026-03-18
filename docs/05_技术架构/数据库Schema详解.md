# 数据库 Schema 详解 (Database Schema)

Extend Global (EG) 平台的底层数据存储采用 SQLite，并通过 Drizzle ORM 进行强类型映射。系统包含 60 张核心数据表，构成了支撑 B2B2B 商业模型、双层计费与四方流转的基石。

本文档按照业务领域对核心表进行分类解析，并重点说明表间的关联关系（Foreign Keys）与关键枚举值。

> **文件位置**: `drizzle/schema.ts`
> **表总数**: 60

## 1. 基础与多租户隔离 (Foundation & Multi-tenant)

这是整个系统的顶层架构，决定了数据如何被隔离在不同的品牌和客户之下。

### 1.1 `channelPartners` (渠道合作伙伴表)
* **核心定位**：系统的顶级租户。除了 EG-DIRECT（直客虚拟CP），所有的业务数据最终都可以追溯到某个 CP。
* **关键字段**：
  * `subdomain`: 唯一标识，用于前端白标路由（如 `acme`）。
  * `brandingLogoUrl`, `brandingColor`: 白标视觉配置。
  * `status`: `active`, `suspended`, `terminated`。

### 1.2 `customers` (终端客户表)
* **核心定位**：实际购买服务的企业实体。
* **关键字段**：
  * `channelPartnerId`: **外键**。决定了该客户属于哪个 CP。
  * `settlementCurrency`: 客户选择的结算货币（如 USD, EUR），决定了发票的币种。

### 1.3 `users` (用户与权限表)
* **核心定位**：系统中所有可登录的自然人账号。
* **关键字段**：
  * `role`: 核心权限控制字段。枚举值：`admin`, `cp_admin`, `client_admin`, `worker`, `vendor`。
  * `channelPartnerId`: 如果角色是 `cp_admin`，则关联此字段。
  * `customerId`: 如果角色是 `client_admin` 或 `worker`，则关联此字段。

## 2. 人力资源与生命周期 (HR & Lifecycle)

该领域负责管理实际提供劳动的员工与承包商。系统在物理表层面严格区分了 EOR 员工与 AOR 承包商，因为两者的合规与计费逻辑截然不同。

### 2.1 `employees` (EOR 员工表)
* **核心定位**：受当地劳动法保护的全职员工。
* **关键字段**：
  * `customerId`: 归属的客户。
  * `countryCode`: 雇佣所在国，决定了适用哪套社保与税务规则。
  * `status`: 生命周期状态。枚举值见 [员工生命周期](../02_业务流程/员工生命周期.md)。
  * `baseSalary`, `salaryCurrency`: 基础薪资与当地货币。

### 2.2 `contractors` (AOR 承包商表)
* **核心定位**：签署 B2B 服务协议的独立承包商。
* **关键字段**：结构类似于 `employees`，但没有社保相关的字段，且生命周期状态更简单（无 `Onboarding`，只有 `Pending`, `Active`, `Terminated`）。

### 2.3 `leaveRecords` & `reimbursements` (请假与报销)
* **核心定位**：员工发起的日常申请。
* **关键字段**：
  * `status`: `pending`, `approved`, `rejected`。只有 `approved` 状态的记录才会被计入当月的 Payroll。
  * `payrollRunId`: 一旦该记录被包含在某次发薪中，此字段将被赋值，表示已锁定，不可再修改。

## 3. 财务与计费引擎 (Finance & Billing)

这是系统中最复杂的领域，支撑了双层发票与汇差剥离。

### 3.1 定价规则表
* **`cpPricingRules`**: EG 对 CP 的底层计费规则（Layer 1）。
* **`customerPricing`**: CP 对终端客户的加价规则（Layer 2）。
* **关键字段**：`pricingType` (fixed, percentage, tiered), `feeAmount`, `feePercentage`, `minFee`。

### 3.2 `invoices` (发票主表)
* **核心定位**：面向客户或 CP 的最终账单。
* **关键字段**：
  * `invoiceLayer`: **极其关键**。枚举值：`eg_to_cp` (Layer 1), `cp_to_client` (Layer 2), `eg_to_client` (直客单层)。
  * `customerId`, `channelPartnerId`: 确定发票的归属与可见性。
  * `totalAmount`, `settlementCurrency`: 结算总金额与币种。
  * `status`: `draft`, `published`, `paid`, `voided`。

### 3.3 `invoiceItems` (发票明细表)
* **核心定位**：发票的组成部分，用于支持净额法 P&L 报表的拆解。
* **关键字段**：
  * `type`: 枚举值：`salary`, `tax`, `social_security`, `service_fee`, `fx_markup` 等。
  * `localAmount`, `localCurrency`: 当地货币的原始金额（用于 Pass-through 成本追溯）。
  * `exchangeRate`: 转换为结算货币时使用的汇率（可能包含加价）。

### 3.4 `vendorBills` (供应商账单表)
* **核心定位**：当地 Vendor 发来的实际成本账单，用于对账。
* **关键字段**：`vendorId`, `totalAmount`, `currency`。

### 3.5 `billInvoiceAllocations` (对账匹配表)
* **核心定位**：连接 `invoices`（预估）与 `vendorBills`（实际）的桥梁。
* **关键字段**：`invoiceId`, `vendorBillId`, `varianceUsd` (计算出的差异金额)。

## 4. 钱包与资金流转 (Wallets & Fund Flow)

该领域负责管理 CP 的预充值资金，确保系统不发生垫资风险。

### 4.1 `channelPartnerWallets` (CP 钱包余额表)
* **核心定位**：记录 CP 当前可用的资金余额。
* **关键字段**：
  * `channelPartnerId`: 归属 CP。
  * `currency`: 钱包币种（通常与 Layer 1 发票的结算币种一致，如 USD）。
  * `balance`: 当前可用余额。这是一个高频更新的字段，操作时必须加锁。

### 4.2 `walletTransactions` (钱包流水表)
* **核心定位**：钱包余额变动的不可变账本（Ledger）。
* **关键字段**：
  * `walletId`: 关联的钱包。
  * `type`: `deposit` (充值), `deduction` (扣款), `refund` (退款)。
  * `amount`: 变动金额（正数或负数）。
  * `referenceId`: 如果是扣款，通常关联被支付的 `invoiceId`，以便追溯。

### 4.3 `channelPartnerFrozenWallets` (冻结钱包表)
* **核心定位**：存储 CP 缴纳的员工押金（Deposit）。
* **业务逻辑**：这部分资金不能用于支付日常发票，只有当员工离职且结清最终账单后，才会通过事务转移回可用钱包。

## 5. 核心关联关系 (ER 概览)

理解以下核心路径，有助于快速编写复杂的 SQL 查询：

* **从 CP 查发票**：`channelPartners` (1) → (N) `customers` (1) → (N) `invoices`
* **从发票查员工成本**：`invoices` (1) → (N) `invoiceItems` (N) ← (1) `employees`
* **从流水查账单**：`walletTransactions` (N) → (1) `invoices` (通过 `referenceId`)

在进行二次开发时，如果需要新增表结构，必须在 `drizzle/schema.ts` 中定义，并通过 `npm run db:generate` 和 `npm run db:migrate` 生成并应用迁移文件，严禁直接修改 SQLite 数据库文件。
