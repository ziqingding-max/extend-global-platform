# 数据库设计指南 (Database Schema Guide)

## 1. 概述 (Overview)
本项目使用 **SQLite (LibSQL)** 作为数据库，通过 **Drizzle ORM** 进行管理。
*   **Schema File**: `drizzle/schema.ts` 是数据库结构的唯一事实来源 (SSOT)。
*   **Migrations**: 所有的 Schema 变更必须通过 `pnpm db:push` 或生成 migration file 进行。

---

## 2. 核心表结构 (Core Tables)

### 2.1 用户与认证 (Identity)
*   `users`: 存储所有后台管理用户。
    *   `role`: `admin`, `user` (基础角色)，Manager 角色通过 `shared/roles.ts` 解析。
    *   `email`: 登录凭证。
    *   `passwordHash`: Bcrypt 哈希。

### 2.2 客户实体 (Customer)
*   `customers`: 客户公司信息。
    *   `status`: `active`, `suspended`, `terminated`。
*   `customer_pricing`: 客户特定的定价策略（覆盖默认配置）。
    *   关联 `customers.id` 和 `countryCode`。

### 2.3 劳动者 (Workers)
*   `employees`: EOR 员工。
    *   `status`: `pending_review`, `onboarding`, `active`, `terminated` 等。
    *   `baseSalary`: 月薪。
*   `contractors`: AOR 承包商。
    *   `status`: `pending_review`, `active`, `terminated`。
    *   `rateType`: `fixed_monthly`, `hourly`, `daily`, `milestone_only`。
    *   `rateAmount`: 对应费率金额。

### 2.4 财务 (Finance)
*   `customer_wallets`: 客户主钱包。
    *   `balance`: 当前可用余额。
    *   `currency`: 钱包币种。
*   `customer_frozen_wallets`: 冻结/押金钱包。
    *   `balance`: 冻结/押金余额。
*   `wallet_transactions`: 资金流水。
    *   `type`: `top_up`, `invoice_deduction`, `credit_note_in` 等。
*   `invoices`: 账单。
    *   `status`: `draft`, `pending_review`, `sent`, `paid`, `overdue` 等。
*   `invoice_items`: 账单明细。
    *   `amount`: 该项金额。

---

## 3. 关键设计决策 (Key Design Decisions)

### 3.1 金额存储 (Money Handling)
*   **类型**: 数据库中使用 `text` 存储金额。
*   **精度**: 应用层统一使用 `decimal.js` 处理计算，防止精度丢失。
*   **多币种**: 所有的金额字段旁通常关联 `currency` 字段。

### 3.2 JSON 字段的使用
SQLite 对 JSON 支持良好，我们在以下场景大量使用 JSON 字段：
*   `bank_details`: 不同国家的银行字段差异巨大，使用 JSON 动态存储。
*   `snapshotData`: 存储报价时的汇率、费率等快照信息。

### 3.3 外键与约束
*   启用 Foreign Key 约束以保证数据完整性。
*   状态字段使用 `text` 配合应用层 `enum` 校验。

---

## 4. 迁移流程 (Migration Workflow)
1.  修改 `drizzle/schema.ts` 或 `aor-schema.ts`。
2.  运行 `pnpm db:push` (开发环境同步)。
3.  生产环境变更需谨慎通过 Drizzle Kit 生成迁移脚本。
