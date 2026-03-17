# 薪资与三大项全链路深度审计报告

**作者**: Manus AI
**日期**: 2026-03-14
**目标**: 从产品经理、研发工程师、测试工程师三个视角，深度剖析 EOR 三大项（Adjustments / Leave / Reimbursements）、AOR 承包商发票、以及薪资计算链路中的状态流转、边缘场景及并发风险。

---

## 1. 产品经理视角：业务逻辑一致性与体验断层

从产品逻辑上看，系统的核心矛盾在于 **"状态的业务语义"与"功能的可用范围"出现了断层"**。以下两个问题直接影响客户体验和合规性。

### 1.1 客户端请假入口的缺失 (Portal Leave Bug)

在客户端（Client Portal）中，三大项的员工选择器逻辑存在不一致。Adjustments 和 Reimbursements 页面使用了通用的 `PortalWorkerSelector` 组件，不传 status 参数，因此客户可以为任何状态的员工（包括 `offboarding`）提交异动和报销。然而，Leave（请假）页面明确只查询 `active` 和 `on_leave` 状态的员工，`offboarding` 员工被强行过滤掉了。

根据系统的**硬规则 2**（offboarding 员工继续攒年假），处于交接期的员工完全有权利休假。剥夺客户为他们提交请假单的能力，会导致交接期的未休假折算（Unpaid Leave Deduction）无法通过系统流转，只能由 Admin 线下违规操作。

| 入口 | 组件 | 是否包含 offboarding 员工 | 是否符合业务规则 |
|------|------|--------------------------|-----------------|
| Portal Adjustments | PortalWorkerSelector（不传 status） | ✅ 包含 | ✅ 正确 |
| Portal Reimbursements | PortalWorkerSelector（不传 status） | ✅ 包含 | ✅ 正确 |
| Portal Leave | 硬编码 `status: "active"` 和 `"on_leave"` | ❌ 遗漏 | ❌ 违反硬规则 2 |

### 1.2 "on_leave" 状态的薪资盲区

当员工处于请假状态（`on_leave`）时，系统在创建当月薪资单时（Job 3）会直接忽略他们，因为 `getEmployeesForPayrollMonth` 只查询 `active` 和 `offboarding` 状态。请假不代表停薪——无论是带薪假还是无薪假，员工在当月都应该生成薪资单（即使底薪被全额扣除，或者有上个月的异动需要发放）。直接跳过会导致合规违约。

---

## 2. 研发工程师视角：架构缺陷与数据孤岛

从代码实现来看，系统在处理时间线边界时，存在严重的数据孤岛（Orphaned Data）风险。这个问题同时影响 EOR 员工和 AOR 承包商。

### 2.1 EOR 致命缺陷：被遗弃的异动 (Orphaned Adjustments)

这是本次审计发现的**最严重的系统漏洞**。以员工 4 月 20 日离职为例，复现路径如下：

> 员工 4 月 1-20 日正常工作，状态为 `offboarding`。4 月期间，客户提交了 1000 USD 的 Bonus（effectiveMonth = 4 月），并被 Admin 审批通过。4 月 20 日 00:01，Job 8（自动终止）触发，员工状态变为 `terminated`。5 月 5 日 00:00，Job 2（自动锁定）运行，将这笔 1000 USD 的 Bonus 锁定。5 月 5 日 00:01，Job 3（创建 5 月薪资单）运行。

**崩溃点**：Job 3 的核心逻辑是先圈定本月需要发薪的人（`eligibleEmployees`），再去抓取这些人的锁定异动。由于员工在 4 月 20 日已经变成了 `terminated`，他不在 `eligibleEmployees` 名单中。因此，那笔被锁定的 1000 USD 异动永远留在了数据库里，没有进入任何薪资单，**员工永远拿不到这笔钱**。

更极端的情况：如果该员工是某个国家（如新加坡）的唯一员工，`getCountriesWithActiveEmployees()` 根本不会返回新加坡，Job 3 会直接跳过该国，连空的薪资单都不会创建。

### 2.2 AOR 承包商同样存在"被遗弃的异动"

上述问题在 AOR 承包商侧同样存在，且影响范围更广。承包商只有三个状态（`pending_review` / `active` / `terminated`），没有 `offboarding` 缓冲期。一旦承包商被终止，`processMonthlyFromLocked` 和 `processSemiMonthlyFromLocked` 中的 `contractors.status = 'active'` 过滤条件会立即将其排除，导致所有锁定的 Adjustments 被永久遗弃。

值得注意的是，`processMilestoneFromLocked`（按里程碑计费）的实现方式不同——它直接扫描 locked milestones 表，不按承包商状态过滤，因此里程碑承包商不受此 bug 影响。

| 计费模式 | 发票生成逻辑 | 是否过滤承包商状态 | 是否有孤岛风险 |
|----------|-------------|-------------------|---------------|
| Monthly | `processMonthlyFromLocked` | ✅ 只查 `active` | ❌ 有风险 |
| Semi-monthly | `processSemiMonthlyFromLocked` | ✅ 只查 `active` | ❌ 有风险 |
| Milestone | `processMilestoneFromLocked` | ❌ 直接扫描 locked 数据 | ✅ 安全 |

---

## 3. 测试工程师视角：并发与时序竞态条件

系统的定时任务（Cron Jobs）依赖 `node-cron` 调度，多个任务被安排在同一分钟执行，引发了严重的竞态条件。

### 3.1 5 号 00:01 的"死亡一分钟"

在每月 5 号的 00:01，系统会同时启动三个核心任务：Job 1（Employee Activation）、Job 8（Employee Termination）和 Job 3（Auto-Create Payroll）。`node-cron` 并没有保证这三个任务的执行顺序，它们在 Node.js 的事件循环中几乎是并发执行的。

假设某员工的 End Date 是 5 月 4 日。如果 Job 8 先跑完，员工在 00:01 的前几秒变成了 `terminated`，紧接着 Job 3 跑，发现他已经 terminated，不给他发薪资单。但如果 Job 3 先跑完，此时员工还是 `offboarding`，成功给他创建了薪资单，几秒后 Job 8 才把他变成 `terminated`。**同一个员工，仅仅因为 CPU 调度的微秒级差异，可能拿到工资，也可能拿不到工资。** 这是测试中最可怕的非确定性 Bug。

### 3.2 请假状态流转的"单行道"陷阱

Job 4（Leave Status Transition，每天 00:02 运行）负责处理员工的请假状态。它只允许 `active` 状态的员工转入 `on_leave`（这是正确的，offboarding 员工请假不应改变状态）。但当假期结束时，系统会**无条件**将员工状态改回 `active`。

这意味着：如果一个 `offboarding` 员工因为某种原因被手动改成了 `on_leave`（比如 Admin 操作失误），当假期结束时，系统会把他变成 `active`，**彻底丢失他的离职状态和 End Date 约束**。Job 8 只查 `offboarding` 状态的员工，所以这个员工永远不会被自动终止，变成了一个"幽灵员工"。

---

## 4. 第二轮审计：自动化闭环中的断裂点

### 4.1 Sign-on Bonus 的"无人审批"黑洞

月中入职的员工（15 号之后激活），系统会自动生成一笔 Sign-on Bonus，其初始状态是 `submitted`。然而，每月的 Job 2（Auto-Lock）只锁定 `admin_approved` 状态的异动。这意味着这笔系统自动生成的 Bonus 必须经过 **客户审批 → Admin 审批** 两道人工关卡，才能在下个月被锁定并进入薪资单。

由于这笔 Bonus 是系统自动创建的，客户和 Admin 很容易忽略它。如果没有人在下个月 5 号之前完成审批，这笔钱就不会被锁定，员工的入职补发工资将无限期延迟。

### 4.2 自动终止与押金退还的断层

系统有两条路径可以将员工终止：手动终止（Admin 在后台修改状态）和自动终止（Job 8 在 endDate 到期时触发）。手动终止时，代码会同步调用 `generateDepositRefund`，生成押金退还账单。但自动终止的代码中只有一行注释：`// TODO: Trigger deposit refund billing when billing service is available`。

这意味着**所有正常走完交接期被系统自动终止的员工，他们的押金都会被卡在冻结钱包（Frozen Wallet）中**，除非 Finance 人员想起来去手动触发退还流程。考虑到大多数员工都是走正常流程自动终止的，这个遗漏影响面很大。

| 终止路径 | 是否自动生成 Deposit Refund | 押金去向 |
|----------|---------------------------|---------|
| 手动终止（Admin 修改状态） | ✅ 自动触发 `generateDepositRefund` | 生成退还账单 → Finance 处理 |
| 自动终止（Job 8） | ❌ 只有 TODO 注释 | 卡在 Frozen Wallet，无人处理 |

### 4.3 Admin 迟审批的连锁反应

客户在 Cutoff 前压线 Approve 了三大项，但 Admin 还没来得及审批。5 号 00:00 Job 2 运行时，这些数据还停留在 `client_approved` 状态，不会被锁定。Job 3 创建薪资单时自然也拿不到这些数据。Admin 在 6 号才审批，此时数据变成 `admin_approved`，但已经错过了本月的锁定窗口。

这笔异动要等到下个月 5 号才会被锁定，再下个月才会进入薪资单——**员工等了整整两个月**。虽然 Admin 可以通过 `addItem` 手动将员工添加到已创建的薪资单中（该接口会自动拉取 `admin_approved` 和 `locked` 状态的异动），但这完全依赖 Admin 的人工意识，没有任何系统提醒。

---

## 5. 最终修复蓝图 (Final Remediation Blueprint)

结合两轮审计的所有发现，下表汇总了全部问题及其优先级和建议修复方案：

| # | 问题 | 严重程度 | 影响范围 | 修复方案 |
|---|------|---------|---------|---------|
| 1 | EOR 被遗弃的异动 | **P0 致命** | 所有离职员工 | Job 3 以 locked 数据驱动，不以员工状态驱动 |
| 2 | AOR 被遗弃的异动 | **P0 致命** | Monthly/Semi-monthly 承包商 | 移除 `processMonthlyFromLocked` 和 `processSemiMonthlyFromLocked` 中的 `status = 'active'` 过滤 |
| 3 | 5 号 00:01 竞态条件 | **P0 致命** | 所有 endDate 在 4 号的员工 | 错峰执行：Lock(00:00) → Activate/Terminate(00:01) → Payroll(00:05) |
| 4 | on_leave 员工漏发工资 | **P1 严重** | 所有请假中员工 | `getEmployeesForPayrollMonth` 加入 `on_leave` |
| 5 | 自动终止不触发押金退还 | **P1 严重** | 所有自动终止的员工 | 补全 Job 8 中的 `generateDepositRefund` 调用 |
| 6 | Sign-on Bonus 无人审批 | **P1 严重** | 所有月中入职员工 | 系统生成时直接设为 `admin_approved` |
| 7 | Leave Transition 单行道 | **P2 中等** | 被误操作为 on_leave 的 offboarding 员工 | `on_leave` → 恢复时检查 endDate，有则恢复为 `offboarding` |
| 8 | Portal Leave 遗漏 offboarding | **P2 中等** | 交接期员工 | 修改 Leave 页面员工筛选，加入 `offboarding` |
| 9 | Admin 迟审批无提醒 | **P3 建议** | 压线审批场景 | 增加系统通知：Cutoff 后仍有 `client_approved` 数据时提醒 Admin |

### 5.1 核心数据消费逻辑重构

无论是 EOR 薪资单还是 AOR 承包商发票，**生成逻辑必须以"Locked 数据"为驱动，而不是以"当前人员状态"为驱动**。

对于 EOR，Job 3 在拉取 `eligibleEmployees` 时，应先查所有 `active / offboarding / on_leave` 的员工，再额外扫描 `adjustments`、`leaveRecords`、`reimbursements` 表中所有 `status = 'locked'` 且属于该月数据的员工 ID，将两个集合合并。只要有 locked 数据，无论员工当前是什么状态（哪怕是 `terminated`），都必须为他生成薪资单。

对于 AOR，应移除 `processMonthlyFromLocked` 和 `processSemiMonthlyFromLocked` 中的 `contractors.status = 'active'` 过滤条件，改为与 Milestone 模式一致的"数据驱动"逻辑。

### 5.2 状态流转与并发安全

Cron Job 必须严格错峰执行，建立流水线依赖关系：

| 时间 | 任务 | 职责 | 依赖 |
|------|------|------|------|
| 00:00 | Job 2 (Auto-Lock) | 锁定上月 admin_approved 数据 | 无 |
| 00:01 | Job 1 (Activation) + Job 8 (Termination) | 状态流转 | Lock 完成后 |
| 00:02 | Job 4 (Leave Transition) | 请假状态流转 | 状态流转完成后 |
| **00:05** | **Job 3 (Auto-Create Payroll & Invoices)** | **算钱** | **所有前置任务完成后** |
| 00:10 | Job 6 (Leave Accrual) | 年假累计 | 独立 |

Leave Transition 的修复逻辑：在 `on_leave` → 恢复转换前，检查员工是否有 `endDate` 且 endDate 尚未过期。如果是，应恢复为 `offboarding` 而不是 `active`，防止离职标记丢失。

### 5.3 自动化体验闭环

Sign-on Bonus 由系统自动生成时，应直接将状态设置为 `admin_approved`，跳过人工审批环节。这笔钱是系统根据 Pro-rata 公式精确计算的，不存在需要人工判断的空间，强制审批只会增加遗漏风险。

Job 8（Employee Auto-Termination）在将员工状态改为 `terminated` 后，必须立即调用 `generateDepositRefund(emp.id)`，确保押金退还账单自动生成，与手动终止路径保持一致。

客户端 Leave 页面的员工筛选条件应从 `["active", "on_leave"]` 扩展为 `["active", "on_leave", "offboarding"]`，与 Adjustments 和 Reimbursements 页面保持一致。
