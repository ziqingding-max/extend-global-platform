# GEA Platform — Leave、Adjustment、Reimbursement 模块运营流程方案

**版本**: 1.0
**日期**: 2026-03-11
**作者**: Manus AI（基于代码库 `ziqingding-max/geaplatform_trae` 深度分析）

---

## 目录

1. [概述与核心架构](#1-概述与核心架构)
2. [角色与权限矩阵](#2-角色与权限矩阵)
3. [Payroll Cutoff 机制（全模块通用）](#3-payroll-cutoff-机制全模块通用)
4. [Leave 模块完整流程](#4-leave-模块完整流程)
5. [Adjustment 模块完整流程](#5-adjustment-模块完整流程)
6. [Reimbursement 模块完整流程](#6-reimbursement-模块完整流程)
7. [三模块横向对比](#7-三模块横向对比)
8. [自动化任务总览](#8-自动化任务总览)
9. [运营注意事项与建议](#9-运营注意事项与建议)

---

## 1. 概述与核心架构

GEA Platform 的 **Leave**（假期）、**Adjustment**（薪酬调整）和 **Reimbursement**（报销）三个模块共同构成了员工薪酬变动管理的核心。三者均遵循统一的"提交 → 客户审批 → GEA 审批 → 锁定"四阶段工作流，并通过 Payroll Cutoff 机制与月度薪酬计算周期深度绑定。

系统由三个主要端口组成，分别服务于不同的用户群体：

| 端口 | 服务对象 | 主要职责 |
| :--- | :--- | :--- |
| **Admin Portal** | GEA 内部运营团队 | 全局数据管理、最终审批、薪酬单生成与发布 |
| **Client Portal** | 客户公司的 HR 管理员 | 代员工提交申请、初级审批、查看员工数据 |
| **Worker Portal** | 员工本人 | 当前版本中，员工**无法**直接提交 Leave/Adjustment/Reimbursement 申请 |

> **重要说明**: 经代码审阅确认，当前版本中员工（Employee）没有独立的操作入口来提交假期申请或报销。所有申请均由 Client Portal 的 HR 管理员或 GEA Admin 代为操作。

---

## 2. 角色与权限矩阵

系统通过 RBAC（基于角色的访问控制）严格限制不同用户的操作范围。

| 角色 | 所属端口 | 查看 | 创建 | 编辑 | 删除 | 客户审批 | GEA 审批 | Cutoff 后操作 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `viewer` | Client Portal | ✓ | — | — | — | — | — | — |
| `hr_manager` | Client Portal | ✓ | ✓ | ✓ (submitted) | ✓ (submitted) | ✓ | — | — |
| `admin` | Client Portal | ✓ | ✓ | ✓ (submitted) | ✓ (submitted) | ✓ | — | — |
| `user` | Admin Portal | ✓ | — | — | — | — | — | — |
| `operations_manager` | Admin Portal | ✓ | ✓ | ✓ (非locked) | ✓ (非locked) | — | ✓ | **✓** |
| `admin` | Admin Portal | ✓ | ✓ | ✓ (非locked) | ✓ (非locked) | — | ✓ | **✓** |

---

## 3. Payroll Cutoff 机制（全模块通用）

Payroll Cutoff 是贯穿三个模块的核心限制机制，其目的是保证每个薪酬月份的数据在薪酬计算前达到稳定状态。

### 3.1. 截止日规则

对于薪酬月 `YYYY-MM`，其 Cutoff 截止时间为 **下一个月的第 N 日 23:59（北京时间）**。默认 N=4，即每月4日。该配置存储在 `system_config` 表中，字段为 `payroll_cutoff_day` 和 `payroll_cutoff_time`，可由 GEA Admin 调整。

**示例**: 2026年2月的薪酬月，其 Cutoff 截止时间为 **2026年3月4日 23:59（北京时间）**。

### 3.2. Cutoff 对各操作的影响

| 操作 | Cutoff 前 | Cutoff 后（普通用户） | Cutoff 后（`operations_manager`/`admin`） |
| :--- | :--- | :--- | :--- |
| 创建新记录 | ✓ 允许 | ✗ 被阻止 | ✓ 允许 |
| 编辑已有记录 | ✓ 允许 | ✗ 被阻止 | ✓ 允许 |
| 删除记录 | ✓ 允许 | ✗ 被阻止 | ✓ 允许 |
| 审批操作 | ✓ 允许 | ✓ 允许（审批不受 Cutoff 限制） | ✓ 允许 |

### 3.3. Payroll Run 锁定规则

除 Cutoff 时间限制外，还存在一个更强的硬性限制：如果某员工对应国家和月份的薪酬单（`payrollRun`）已进入 `pending_approval` 或 `approved` 状态，则**任何人**（包括 `admin`）都无法再为该月份添加新的 Leave 申请或 Adjustment 记录。这是系统保护已确认薪酬数据的最终防线。

### 3.4. Leave 模块的月份归属规则（特殊）

Leave 模块对月份归属有一个特殊规定：**假期记录归属于其结束日期（`endDate`）所在的月份**，而非开始日期。这一规则在跨月假期的处理中尤为关键。

---

## 4. Leave 模块完整流程

### 4.1. 核心数据实体

Leave 模块涉及四张核心数据库表，它们之间存在层级关系：

| 数据库表 | 描述 | 关键字段 |
| :--- | :--- | :--- |
| `leaveTypes` | 全局假期类型定义（按国家） | `countryCode`, `leaveTypeName`, `annualEntitlement`, `isPaid` |
| `customerLeavePolicies` | 客户自定义假期政策（覆盖全局设置） | `customerId`, `annualEntitlement`, `expiryRule`, `carryOverDays` |
| `leaveBalances` | 员工假期余额（按年、按类型） | `employeeId`, `year`, `totalEntitlement`, `used`, `remaining` |
| `leaveRecords` | 具体假期申请记录 | `employeeId`, `startDate`, `endDate`, `days`, `status` |

### 4.2. 假期政策配置流程

假期政策的配置是整个 Leave 模块的基础，决定了员工的假期额度。

GEA Admin 首先在全局层面为各国家配置 `leaveTypes`，定义法定假期类型及最低天数。客户的 Portal Admin 随后可以在 Client Portal 的设置中，针对公司业务所在的每个国家，基于全局假期类型创建 `customerLeavePolicies`，设置高于法定标准的年假天数、额度结转上限（`carryOverDays`）以及过期规则（`expiryRule`：`year_end` 年末过期 / `anniversary` 周年日过期 / `no_expiry` 永不过期）。

### 4.3. 假期余额（Balance）的生成与更新

员工的假期余额通过以下三种机制动态维护：

**机制一：员工激活时初始化**

当新员工被系统激活时（由每日 00:01 北京时间的定时任务触发），系统自动调用 `initializeLeaveBalancesForEmployee` 函数，为该员工创建当年所有适用假期类型的 `leaveBalances` 记录。系统优先使用 `customerLeavePolicies` 中的配置，若无则回退到全局 `leaveTypes`。同时，系统会检查上一年度的剩余余额，并根据 `carryOverDays` 上限将可结转天数累加到新年度的 `totalEntitlement` 中。

**机制二：按月比例计提（新员工）**

针对年中入职的员工，系统通过每月1日 00:10（北京时间）运行的 `runMonthlyLeaveAccrual` 任务，按月更新其 `totalEntitlement`。计算公式为：`ceil((年假总额 / 12) * 已完整服务月数 * 2) / 2`（向上取至最接近的 0.5 天）。该任务持续运行，直至员工的计提额度达到年度总额上限。

**机制三：申请创建时即时扣减**

当 GEA Admin 在 Admin Portal 创建一条假期申请并完成审批后，系统会立即调用 `adjustLeaveBalance` 函数，从员工的 `leaveBalances` 中扣除对应天数（增加 `used`，减少 `remaining`）。若余额不足（`remaining` 将变为负数），系统会给出警告但仍允许继续操作。

### 4.4. 假期申请的完整状态流转

```
[创建] → submitted
                ↓ (Client Portal 批准)
        client_approved ← (Client Portal 驳回) → client_rejected [终态]
                ↓ (Admin Portal 批准)
        admin_approved ← (Admin Portal 驳回) → admin_rejected [终态]
                ↓ (每月5日 00:00 自动锁定)
            locked [终态]
```

**各状态下的可操作性:**

| 状态 | Client Portal 可操作 | Admin Portal 可操作 | 说明 |
| :--- | :--- | :--- | :--- |
| `submitted` | 审批、驳回、编辑、删除 | 编辑、删除 | 初始状态，可自由修改 |
| `client_approved` | — | Admin 审批、Admin 驳回 | 等待 GEA 最终确认 |
| `client_rejected` | — | — | 流程终止，无法再操作 |
| `admin_approved` | — | — | 已确认，等待月末自动锁定 |
| `admin_rejected` | — | — | 流程终止，余额已返还 |
| `locked` | — | — | 最终归档状态，不可修改 |

### 4.5. 跨月假期的自动拆分

当假期申请的起止日期跨越两个或多个月份时，系统会自动调用 `splitLeaveByMonth` 函数进行拆分。拆分逻辑如下：

系统首先统计每个月份内的工作日数量（默认按5天工作制，可按国家配置为6天），然后按照各月份工作日占总工作日的比例，将总假期天数按比例分配，最终生成多条独立的 `leaveRecord`，每条记录对应一个月份，并在 `reason` 字段中注明拆分信息（如 `[Split 2026-03: 2026-03-28 to 2026-03-31]`）。

**示例**: 员工申请 2026-03-28 至 2026-04-05 共 7 个工作日的假期，系统将自动拆分为：3月份 3 天（归属 3 月薪酬）和 4 月份 4 天（归属 4 月薪酬）两条独立记录。

### 4.6. 半天假期支持

Client Portal 在创建假期申请时，支持 `isHalfDay` 选项。当勾选此项时，系统会在用户输入的总天数基础上减去 0.5 天，以支持最后一天为半天假的场景。

### 4.7. 重叠检测

系统在创建或编辑假期申请时，会自动检查该员工在相同日期范围内是否已存在 `submitted` 或 `locked` 状态的假期记录。若存在重叠，操作将被阻止并返回详细的冲突信息。

### 4.8. 员工状态自动联动

每日 00:02（北京时间），`runLeaveStatusTransition` 定时任务会根据 `admin_approved` 或 `locked` 状态的假期记录，自动更新员工状态：

当员工有当日或之前开始的有效假期记录时，其状态从 `active` 自动变更为 `on_leave`；当员工所有假期记录均已结束时，其状态从 `on_leave` 自动恢复为 `active`。

---

## 5. Adjustment 模块完整流程

### 5.1. 核心数据实体

`adjustments` 表是处理所有影响最终薪酬的一次性项目的主要载体。

| 字段 | 类型/枚举值 | 说明 |
| :--- | :--- | :--- |
| `adjustmentType` | `bonus` / `allowance` / `deduction` / `reimbursement` / `other` | 调整性质，决定其在薪酬单中的归类 |
| `category` | `housing` / `transport` / `meals` / `performance_bonus` / `year_end_bonus` / `overtime` / `travel_reimbursement` / `equipment_reimbursement` / `absence_deduction` / `other` | 更细化的分类 |
| `effectiveMonth` | `YYYY-MM-01` | 归属的薪酬月份，是 Cutoff 检查的依据 |
| `amount` | 文本（支持小数） | 金额，货币自动从员工信息中获取 |
| `receiptFileUrl` | 可选 | 收据附件（可选，报销类型建议上传） |

### 5.2. 状态流转

Adjustment 的状态流转与 Leave 完全一致：

```
submitted → client_approved / client_rejected
client_approved → admin_approved / admin_rejected
admin_approved → locked (每月5日 00:00 自动)
```

**关键差异**: Adjustment 模块在 Client Portal 端**不支持**直接编辑已提交的记录（只能在 `submitted` 状态下编辑），且 Client Portal 用户**无法**在 Cutoff 后进行任何写操作。

### 5.3. 与薪酬计算的集成

Adjustment 是唯一与自动化薪酬计算深度集成的模块。每月5日 00:01（北京时间），`runAutoCreatePayrollRuns` 任务在生成月度薪酬单时，会按以下规则聚合所有 `locked` 状态的 `adjustments` 记录：

| `adjustmentType` | 计入薪酬单字段 | 对净薪资的影响 |
| :--- | :--- | :--- |
| `bonus` | `bonus` | 增加（计入 Gross） |
| `allowance` | `allowances` | 增加（计入 Gross） |
| `reimbursement` | `reimbursements` | 增加（计入 Gross） |
| `deduction` | `deductions` | 减少（从 Net 中扣除） |
| `other` | `deductions` | 减少（从 Net 中扣除） |

### 5.4. Cutoff 临近预警

当 Adjustment 的归属月份距离 Cutoff 不足 48 小时时，系统在创建成功后会返回一条 `cutoffWarning` 提示，提醒用户尽快完成审批流程。

---

## 6. Reimbursement 模块完整流程

### 6.1. 核心数据实体

`reimbursements` 表是一个独立的报销管理模块，其数据结构与 `adjustments` 类似，但有以下关键特点：

| 字段 | 类型/枚举值 | 说明 |
| :--- | :--- | :--- |
| `category` | `travel` / `equipment` / `meals` / `transportation` / `medical` / `education` / `office_supplies` / `communication` / `other` | 报销类别，比 Adjustment 更细化 |
| `receiptFileUrl` | **必填** | 发票/收据附件，创建时强制上传 |
| `effectiveMonth` | `YYYY-MM-01` | 归属的薪酬月份 |

### 6.2. 状态流转

Reimbursement 的状态流转与 Leave/Adjustment 完全一致：

```
submitted → client_approved / client_rejected
client_approved → admin_approved / admin_rejected
admin_approved → locked (目前无自动锁定，需手动处理)
```

**各状态下的可操作性:**

| 状态 | Client Portal 可操作 | Admin Portal 可操作 |
| :--- | :--- | :--- |
| `submitted` | 审批、驳回、编辑、删除 | 编辑、删除 |
| `client_approved` | — | Admin 审批、Admin 驳回 |
| `client_rejected` | — | — |
| `admin_approved` | — | — |
| `admin_rejected` | — | — |
| `locked` | — | — |

### 6.3. 关键限制：与薪酬计算的集成缺失

这是运营团队**必须重点关注**的系统性问题。经代码深度分析，独立的 `reimbursements` 模块目前存在以下两个集成缺口：

**缺口一：无自动锁定**

每月5日运行的 `runAutoLock` 定时任务，其代码实现中**仅处理 `adjustments` 和 `leaveRecords` 两张表**，并不包含 `reimbursements` 表。这意味着即使报销申请已经过 GEA Admin 批准（`admin_approved`），其状态也**不会**被自动变更为 `locked`。

**缺口二：不计入自动薪酬计算**

每月5日运行的 `runAutoCreatePayrollRuns` 定时任务，在聚合薪酬数据时，**只查询 `adjustments` 表**，不查询 `reimbursements` 表。因此，通过独立报销模块审批通过的金额，**不会自动出现在系统生成的薪酬单中**。

### 6.4. 当前运营操作建议

基于上述分析，运营团队应建立以下临时操作规范：

所有需要计入员工当月薪酬的报销，**必须通过 `Adjustment` 模块提交**，选择 `adjustmentType` 为 `reimbursement`，并上传相应票据。独立的 `Reimbursement` 模块可作为辅助性的票据审批和记录工具，但其审批通过的金额需要 GEA Admin 手动在 `Payroll` 模块中进行相应处理，才能最终反映在员工薪酬单上。

---

## 7. 三模块横向对比

| 对比维度 | Leave | Adjustment | Reimbursement |
| :--- | :--- | :--- | :--- |
| **提交入口** | Client Portal (HR) / Admin | Client Portal (HR) / Admin | Client Portal (HR) / Admin |
| **员工自助提交** | 不支持 | 不支持 | 不支持 |
| **附件要求** | 无 | 可选 | **必须上传收据** |
| **月份归属依据** | 结束日期 (`endDate`) 所在月 | `effectiveMonth` 字段 | `effectiveMonth` 字段 |
| **跨月自动拆分** | **支持** | 不适用 | 不适用 |
| **Cutoff 检查** | 基于结束日期月份 | 基于 `effectiveMonth` | **无 Cutoff 检查** |
| **Payroll Run 锁定检查** | ✓ | ✓ | ✓ |
| **自动锁定（月5日）** | ✓ (`admin_approved` → `locked`) | ✓ (`admin_approved` → `locked`) | **✗ 无自动锁定** |
| **自动计入薪酬单** | ✓ (无薪假自动计算扣款) | ✓ (按类型计入 Gross/Deduction) | **✗ 不自动计入** |
| **余额管理** | ✓ (实时更新 `leaveBalances`) | 不适用 | 不适用 |
| **审批层级** | Client → Admin (两级) | Client → Admin (两级) | Client → Admin (两级) |

---

## 8. 自动化任务总览

系统通过以下定时任务实现关键业务流程的自动化，所有时间均为**北京时间**：

| 任务名称 | 执行时间 | 主要功能 |
| :--- | :--- | :--- |
| 员工自动激活 & 余额初始化 | 每日 00:01 | 激活到期员工，初始化其假期余额 |
| 假期状态自动联动 | 每日 00:02 | 根据假期记录自动切换员工 `active`/`on_leave` 状态 |
| 汇率自动更新 | 每日 00:05 | 从 ECB 获取最新汇率 |
| 承包商发票自动生成 | 每日 01:00 | 为承包商生成月度发票 |
| 数据自动锁定 | **每月5日 00:00** | 将上月所有 `admin_approved` 的 Adjustment 和 Leave 记录状态变更为 `locked` |
| 薪酬单自动生成 | **每月5日 00:01** | 基于锁定数据，为各国家自动创建当月薪酬单草稿 |
| 假期余额月度计提 | **每月1日 00:10** | 为年中入职的新员工按月更新假期额度 |

---

## 9. 运营注意事项与建议

### 9.1. 关键操作时间节点

每月的运营工作应围绕以下时间节点展开：

**每月1日**: 系统自动为新员工计提假期额度。运营团队可在此时检查新员工的假期余额是否已正确初始化。

**每月4日 23:59（北京时间）**: 当月薪酬月的 Cutoff 截止时间。在此之前，Client Portal 用户必须完成所有当月的 Leave 申请和 Adjustment 提交，并完成客户侧审批。GEA 运营团队应在截止前完成所有 `client_approved` 记录的最终审批。

**每月5日 00:00**: 系统自动锁定所有 `admin_approved` 的 Adjustment 和 Leave 记录，并于 00:01 自动生成月度薪酬单草稿。

### 9.2. 报销处理的双轨制注意事项

目前系统存在两种报销提交路径，运营团队必须明确区分：

通过 **Adjustment 模块**（选择 `adjustmentType = reimbursement`）提交的报销，会经过完整的自动化流程，最终自动计入员工薪酬单。这是**推荐的标准路径**。

通过独立的 **Reimbursement 模块**提交的报销，虽然有更细化的类别分类和强制票据要求，但目前**不会自动计入薪酬单**，需要 GEA Admin 在 Payroll 模块中手动处理。

### 9.3. 假期余额负数的处理

系统允许假期余额变为负数（即员工实际使用的假期天数超过其额度），但会在操作时给出警告。运营团队应定期检查余额为负的员工，并与客户沟通是否需要进行相应的薪酬扣款调整（通过 Adjustment 模块的 `deduction` 类型处理）。

### 9.4. 跨月假期的运营处理

当员工申请跨月假期时，系统会自动拆分为多条记录。运营团队需注意，这些拆分后的记录在审批时需要**逐条审批**，且每条记录的 Cutoff 检查依据各自的结束日期月份。建议在提交跨月假期申请时，提前确认所有涉及月份的 Cutoff 状态，避免部分记录因 Cutoff 已过而无法提交。

### 9.5. Reimbursement 模块的未来集成

独立的 `reimbursements` 模块的数据结构已完整设计（包含 `payrollRunId` 字段），表明其最终目标是与薪酬流程完全集成。运营团队应与开发团队保持沟通，明确该模块的后续开发计划，以便在集成完成后及时调整运营流程，实现全自动化处理。
