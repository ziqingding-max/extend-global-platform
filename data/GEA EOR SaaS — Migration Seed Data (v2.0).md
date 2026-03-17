# GEA EOR SaaS — Migration Seed Data (v2.0)

## 概述

`seed-migration-data.json` 包含从 GEA 老系统迁移的 **完整员工数据**，包括活跃员工、离职员工及其关联的客户和押金（含退还）数据。数据经过四数据源交叉验证。

## 数据范围

| 数据类型 | 数量 | 说明 |
|---------|------|------|
| 客户公司 (customers) | 31 家 | 18 家(首轮) + 13 家(补充) |
| 活跃员工 (employees, active) | 82 人 | 61 人(首轮) + 21 人(补充) |
| 离职员工 (employees, inactive) | 23 人 | 全部新增 |
| 活跃员工押金 (deposit_invoices) | 81 笔 | 61 笔(首轮) + 20 笔(补充), Théo Doré 无押金 |
| 离职员工押金 (inactive_deposits) | 23 笔 | 全部23名离职员工均有押金收取记录 |
| 押金退还 (deposit_refunds) | 22 笔 | 22名离职员工已退还, VIET PHUONG NGUYEN 除外 |

## JSON 结构

```json
{
  "_metadata": { ... },
  "customers": [...],           // 31 家客户公司
  "employees": [...],           // 105 名员工 (82 活跃 + 23 离职)
  "deposit_invoices": [...],    // 81 笔活跃员工押金
  "inactive_deposits": [...],   // 23 笔离职员工押金
  "deposit_refunds": [...]      // 22 笔离职员工退还
}
```

## 数据结构

### customers 数组
每个客户对象包含以下字段，对应 `customers` 表 schema：

- `clientCode`: 客户编号（CUS-330001 ~ CUS-330031）
- `companyName`: 公司名称
- `country`: 注册国家
- `primaryContactEmail`: 主要联系邮箱
- `settlementCurrency`: 结算币种
- `status`: 状态（全部为 active）
- `_oldCompanyId`: 老系统公司 ID（仅供参考）

### employees 数组
每个员工对象包含以下字段，对应 `employees` 表 schema：

- `employeeCode`: 员工编号（EMP-000001 ~ EMP-000105）
- `customerIndex`: 对应 customers 数组的 **1-based 索引**
- `firstName` / `lastName`: 姓名
- `email`: 邮箱
- `nationality`: 国籍
- `country`: 工作国家
- `jobTitle`: 职位
- `startDate`: 入职日期
- `endDate`: 离职日期（离职员工）
- `baseSalary`: 月薪（老系统原始值 ÷ 100）
- `salaryCurrency`: 薪资币种
- `status`: 状态（active / inactive）
- `_oldEmployeeId`: 老系统员工 ID（仅供参考）
- `_oldCompanyId`: 老系统公司 ID（仅供参考）
- `_annualLeave`: 年假天数（仅供参考）
- `_probationLength`: 试用期月数（仅供参考）
- `_additionalCompensation`: 额外薪酬说明（仅供参考）

### deposit_invoices / inactive_deposits / deposit_refunds 数组
每笔发票对象包含以下字段，对应 `invoices` + `invoice_items` 表 schema：

- `invoiceNumber`: 账单编号（来自老系统）
- `customerIndex`: 对应 customers 数组的 **1-based 索引**
- `employeeIndex`: 对应 employees 数组的 **1-based 索引**
- `invoiceType`: `deposit` / `deposit_refund`
- `currency`: 币种
- `total`: 金额
- `status`: 状态（sent / draft）
- `issueDate`: 开票日期
- `dueDate`: 到期日期

## 员工编号分配

| 范围 | 类型 | 说明 |
|------|------|------|
| EMP-000001 ~ EMP-000061 | 活跃(首轮) | 首轮精确匹配 |
| EMP-000062 ~ EMP-000082 | 活跃(补充) | P&L/Invoice-3 交叉验证匹配 |
| EMP-000083 ~ EMP-000105 | 离职 | 全部离职员工 |

## 客户编号分配

| 范围 | 说明 |
|------|------|
| CUS-330001 ~ CUS-330018 | 首轮客户(有活跃员工) |
| CUS-330019 ~ CUS-330031 | 补充客户(含离职员工关联) |

## 导入顺序

1. **customers** (31 条) → 按数组顺序导入
2. **employees** (105 条) → 通过 `customerIndex` (1-based) 关联客户
3. **deposit_invoices** (81 条) → 活跃员工押金，通过 `customerIndex` + `employeeIndex` 关联
4. **inactive_deposits** (23 条) → 离职员工押金收取记录
5. **deposit_refunds** (22 条) → 离职员工押金退还记录

### 索引关系说明

`customerIndex` 和 `employeeIndex` 是 **1-based 索引**，指向对应数组中的位置：

```javascript
// 获取员工对应的客户
const employee = data.employees[0]; // 第1个员工
const customer = data.customers[employee.customerIndex - 1]; // 对应客户

// 获取押金对应的员工和客户
const deposit = data.deposit_invoices[0];
const employee = data.employees[deposit.employeeIndex - 1];
const customer = data.customers[deposit.customerIndex - 1];
```

### 以 `_` 开头的字段

所有以 `_` 开头的字段（如 `_oldEmployeeId`、`_companyName`）仅供参考和调试，**不应写入数据库**。

## 特殊情况

1. **Théo Doré** (EMP-000076, KAILAS FRANCE): 活跃员工，四个数据源均无押金记录
2. **VIET PHUONG NGUYEN** (EMP-000103, Fujian Nanfu): 离职员工，押金 USD 6,189.22 已收取但**未退还**
3. **Shakil Ahmad** (EMP-000079, Hongkong Pony AI): 活跃员工，押金 USD 3,400.00 状态为**未付款(draft)**

## 数据来源

- 老系统数据库 (GEA.zip) — 员工、EOR、公司基础数据
- GEA-invoice.sql — 老系统 Invoice 数据
- Invoice-3.xlsx — 后台导出 Invoice 数据（押金金额主要来源）
- GEA 2026年度 P&L — 财务数据（交叉验证）
- 员工押金 repo — 人工核对台账（交叉验证）

## 注意事项

1. 薪资数据来自老系统，单位已从分转换为元（÷100）
2. `idNumber` 字段已清空（老系统存储的是文件 JSON，非实际证件号）
3. 员工编号（employeeCode）和客户编号（clientCode）为临时分配，导入时应由系统重新生成
4. 部分离职员工的退还金额币种可能与收取币种不同（如 Kevin Winoto 收取 USD 退还 HKD）
