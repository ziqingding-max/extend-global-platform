# GEA 平台 Cron Job 全面审计报告

**作者：** Manus AI（产品经理、开发工程师、测试工程师视角）
**日期：** 2026年3月14日

---

## 一、总览

系统中共有 **7 个定时任务（Cron Job）**，分为两类：**每日执行**（4个）和**每月执行**（3个）。它们在服务器启动时通过 `scheduleCronJobs()` 注册到 `node-cron`。

在本次 PR（fix/payroll-lifecycle-refactor）中，调度器已从硬编码改为**动态调度**（从 `system_config` 读取配置），但 Settings UI 尚未更新以匹配新的后端能力。

| # | 任务名称 | 频率 | 当前默认时间 | 生效状态 | 严重问题 |
|---|---------|------|-------------|---------|---------|
| 1 | 员工自动激活 | 每日 | 00:01 北京 | 部分有效 | 配置键名不匹配 |
| 2 | 自动锁定数据 (EOR+AOR) | 每月 | 5号 00:00 北京 | 有效 | 无 payrollRunId 追踪 |
| 3 | 自动创建薪资单 + 承包商发票 | 每月 | 5号 00:01 北京 | 部分有效 | 缺少报销表聚合 |
| 4 | 假期状态转换 | 每日 | 00:02 北京 | 有效 | 无 |
| 5 | 逾期发票检测 | 每日 | 00:03 北京 | 基本有效 | 时区小问题 |
| 6 | 汇率抓取 | 每日 | 00:05 北京 | 有效 | 无 |
| 7 | 月度假期累计 | 每月 | 1号 00:10 北京 | 有效 | 无 |

---

## 二、逐个任务详细分析

### Job 1：员工自动激活 (`runEmployeeAutoActivation`)

**业务逻辑：** 每天检查所有 `contract_signed` 状态的员工，如果其 `startDate <= 今天`，自动将状态转为 `active`。激活后还会：
- 自动初始化该国家的假期政策（如果尚未配置）
- 为新员工初始化假期余额（年假从 0 开始，按月累计）
- 如果激活日期在月中截止日之前，且当月已有 draft 状态的薪资单，则自动按比例（pro-rata）将该员工加入当月薪资单

**代码调用链：**

```
runEmployeeAutoActivation()
  → getSystemConfig("mid_month_cutoff_day")          ← 读取月中截止日
  → getContractSignedEmployeesReadyForActivation()    ← 查询待激活员工
  → updateEmployee(id, { status: "active" })          ← 状态转换
  → autoInitializeLeavePolicyForCountry()             ← 初始化假期政策
  → initializeLeaveBalancesForEmployee()              ← 初始化假期余额
  → findPayrollRunByCountryMonth()                    ← 查找当月薪资单
  → calculateProRata()                                ← 计算按比例薪资
  → createPayrollItem()                               ← 添加到薪资单
```

**发现的问题：**

| 问题 | 严重程度 | 详情 |
|------|---------|------|
| 配置键名不匹配 | **高** | 代码读取 `mid_month_cutoff_day`，但 Settings UI 保存的是 `mid_month_activation_cutoff`。这意味着管理员在 UI 中修改的值永远不会被 cron job 读取到，始终使用默认值 15。 |
| 加入薪资单时不聚合 adjustments | 低 | 自动激活时只添加 baseSalary（pro-rata），不聚合该员工已有的 adjustments/reimbursements。这在设计上可能是合理的（因为此时数据可能还未 locked），但需要确认产品意图。 |

**当前生效状态：** 部分有效。员工激活功能正常，但月中截止日配置无法通过 UI 生效。

---

### Job 2：自动锁定数据 (`runAutoLock`)

**业务逻辑：** 每月（默认5号）将上个月所有 `admin_approved` 状态的数据批量锁定为 `locked`。锁定范围包括：
- EOR：adjustments、leave_records、reimbursements
- AOR：contractor_adjustments、contractor_milestones

**代码调用链：**

```
runAutoLock()
  → 计算 prevMonth（当前月 - 1）
  → lockSubmittedAdjustments(prevMonthDate)           ← admin_approved → locked
  → lockSubmittedLeaveRecords(prevMonthStr)            ← admin_approved → locked
  → lockSubmittedReimbursements(prevMonthDate)         ← admin_approved → locked
  → lockContractorAdjustments(prevMonthDate)           ← admin_approved → locked
  → lockContractorMilestones(prevMonthDate)            ← admin_approved → locked
```

**发现的问题：**

| 问题 | 严重程度 | 详情 |
|------|---------|------|
| 不传 payrollRunId | 中 | lock 函数已支持可选的 `payrollRunId` 参数，但 cron job 调用时不传（因为此时薪资单尚未创建）。这意味着 cron 锁定的数据没有 payrollRunId 追踪，无法精确回滚。这在设计上是合理的（auto-lock 发生在 auto-create 之前），但需要在 Job 3 创建薪资单后回写 payrollRunId。 |
| 只锁定 admin_approved | 低 | 如果有数据仍处于 `submitted` 或 `client_approved` 状态（即还未经过管理员审批），它们不会被锁定，也不会进入薪资单。这是正确的设计行为。 |

**当前生效状态：** 有效。锁定逻辑正确，但缺少 payrollRunId 追踪。

---

### Job 3：自动创建薪资单 + 承包商发票 (`runAutoCreatePayrollRuns` + `runAutoCreateContractorInvoices`)

**业务逻辑：** 每月（默认5号，在 auto-lock 之后1分钟）为所有有在职员工的国家创建当月的 draft 薪资单，并聚合上月已锁定的数据。同时为承包商生成发票。

**代码调用链：**

```
runAutoCreatePayrollRuns()
  → 计算 targetMonth = 当前月, prevMonth = 当前月 - 1
  → getCountriesWithActiveEmployees()
  → 对每个国家:
    → findPayrollRunByCountryMonth()                   ← 检查是否已存在
    → createPayrollRun({ status: "draft" })            ← 创建薪资单
    → getEmployeesForPayrollMonth()                    ← 获取合格员工
    → getSubmittedAdjustmentsForPayroll(country, prevMonth, ["locked"])  ← 聚合 adjustments
    → getSubmittedUnpaidLeaveForPayroll(country, prevMonth, ["locked"])  ← 聚合 unpaid leave
    → 对每个员工:
      → calculateProRata()                             ← 计算按比例薪资
      → 聚合 bonus/allowances/reimbursements/deductions（来自 adjustments 表）
      → 计算 unpaid leave 扣款
      → createPayrollItem()                            ← 创建薪资条目
    → updatePayrollRun()                               ← 更新总额

runAutoCreateContractorInvoices()
  → 计算 prevMonth
  → ContractorInvoiceGenerationService.generateFromLockedData()
    → processMonthlyFromLocked()
    → processSemiMonthlyFromLocked()
    → processMilestoneFromLocked()
```

**发现的问题：**

| 问题 | 严重程度 | 详情 |
|------|---------|------|
| 缺少 reimbursements 表聚合 | **高** | Cron Job 3 只从 `adjustments` 表聚合数据（包括 type="reimbursement" 的记录），但**完全没有查询 `reimbursements` 表**。而手动的 `autoFill`（payroll.ts）已经修复为同时聚合两个表。这意味着通过 cron 自动创建的薪资单会**遗漏所有独立报销记录**。 |
| 不回写 payrollRunId | **高** | 创建薪资单后，没有将 `payrollRunId` 回写到被消费的 locked adjustments/leave/reimbursements 上。这导致这些数据虽然被聚合进了薪资单，但数据库中没有任何关联记录。如果后续需要回滚或审计，无法追踪哪些数据属于哪个薪资单。 |
| totalEmploymentCost = net | 低 | `totalEmploymentCost` 直接等于 `net`，没有加入雇主社保等成本。这可能是因为 cron 无法获取 employer cost 的计算公式，但会导致自动创建的薪资单总成本不准确。 |

**当前生效状态：** 部分有效。能创建薪资单并聚合 adjustments 和 leave，但遗漏 reimbursements 表数据，且无 payrollRunId 追踪。

---

### Job 4：假期状态转换 (`runLeaveStatusTransition`)

**业务逻辑：** 每天检查两件事：
1. 如果有 `active` 员工的假期记录覆盖了今天（startDate <= today <= endDate），将其状态转为 `on_leave`
2. 如果有 `on_leave` 员工的所有假期记录都已结束（endDate < today），将其状态恢复为 `active`

**代码调用链：**

```
runLeaveStatusTransition()
  → getAllActiveLeaveRecordsForDate(todayStr)          ← 查找覆盖今天的假期
  → 对每个有假期的员工:
    → 检查 emp.status === "active"
    → updateEmployee(id, { status: "on_leave" })
  → getOnLeaveEmployeesWithExpiredLeave(todayStr)      ← 查找假期已结束的员工
  → 对每个假期结束的员工:
    → updateEmployee(id, { status: "active" })
```

**发现的问题：** 无明显问题。逻辑清晰，状态转换正确。

**当前生效状态：** 有效。

---

### Job 5：逾期发票检测 (`runOverdueInvoiceDetection`)

**业务逻辑：** 每天扫描所有 `sent` 状态的发票，如果 `dueDate < today`，自动标记为 `overdue`，并发送通知。

**代码调用链：**

```
runOverdueInvoiceDetection()
  → 直接查询 invoices 表: status = "sent" AND dueDate < today
  → 对每个逾期发票:
    → update status → "overdue"
    → notificationService.send({ type: "invoice_overdue" })
    → notifyOwner()（如果有逾期发票）
```

**发现的问题：**

| 问题 | 严重程度 | 详情 |
|------|---------|------|
| 时区不一致 | 低 | `todayStr` 使用 `new Date().toISOString().split("T")[0]`，这是 UTC 时间，而其他 cron job 都使用北京时间。在 UTC+8 的 00:00-08:00 之间，UTC 日期比北京日期晚一天，可能导致逾期检测延迟几小时。 |

**当前生效状态：** 基本有效。时区差异影响极小（最多延迟8小时标记逾期）。

---

### Job 6：汇率抓取 (`fetchAndStoreExchangeRates`)

**业务逻辑：** 每天从 ECB（欧洲央行）抓取最新汇率并存储。ECB 在 CET 16:00 发布，北京时间 00:05 = CET 17:05，确保能获取到当天最新数据。

**代码调用链：**

```
fetchAndStoreExchangeRates()
  → 调用 ECB API
  → 存储到 exchange_rates 表
  → 返回 { ratesStored, date, errors }
```

**发现的问题：** 无。

**当前生效状态：** 有效。

---

### Job 7：月度假期累计 (`runMonthlyLeaveAccrual`)

**业务逻辑：** 每月1号为当年入职的员工按比例累计年假额度。规则：每服务满一个月，获得年假总额的 1/12。只累计"Annual"类型的假期，其他假期（病假、产假等）在激活时已全额初始化。

**代码调用链：**

```
runMonthlyLeaveAccrual()
  → listEmployees({ status: "active" })
  → listEmployees({ status: "on_leave" })
  → 筛选当年入职的员工
  → 对每个员工:
    → 计算已服务月数
    → getCustomerLeavePoliciesForCountry()             ← 获取假期政策
    → listLeaveBalances(empId, currentYear)            ← 获取当前余额
    → 对每个 Annual Leave 余额:
      → 计算累计额度 = (年假总额 / 12) × 已服务月数
      → 向上取整到 0.5 天
      → updateLeaveBalance()                           ← 更新余额
```

**发现的问题：** 无明显问题。逻辑完整，包含了之前的 bug 修复（只累计年假、包含 on_leave 员工）。

**当前生效状态：** 有效。

---

## 三、跨任务关联问题

### 3.1 Job 2 → Job 3 的数据流断层

Job 2（auto-lock）和 Job 3（auto-create）设计为顺序执行（00:00 锁定，00:01 创建），但存在以下问题：

1. **Job 2 锁定数据时不传 payrollRunId**（因为薪资单还不存在）
2. **Job 3 创建薪资单后不回写 payrollRunId**（代码中没有这个步骤）
3. 结果：cron 自动流程产生的数据**完全没有 payrollRunId 追踪**

对比手动流程：`autoFill` 和 `addItem` 在 payroll.ts 中已经正确传递 payrollRunId。

### 3.2 手动 vs 自动的一致性差异

| 功能 | 手动流程 (payroll.ts) | 自动流程 (cronJobs.ts) |
|------|----------------------|----------------------|
| N-1 月份归属 | ✅ 使用 `getPrevMonth()` | ✅ 使用 `prevMonth` 计算 |
| 聚合 adjustments | ✅ 查询 `admin_approved` + `locked` | ✅ 只查询 `locked` |
| 聚合 reimbursements 表 | ✅ 查询 `getSubmittedReimbursementsForPayroll` | ❌ **完全缺失** |
| payrollRunId 回写 | ✅ lock 时传入 | ❌ **不传入** |
| deleteItem 回滚 | ✅ 解锁关联数据 | N/A |

### 3.3 配置键名不匹配汇总

| 功能 | 代码读取的键 | Settings UI 保存的键 | 是否匹配 |
|------|------------|-------------------|---------|
| 月中激活截止日 | `mid_month_cutoff_day` | `mid_month_activation_cutoff` | ❌ |
| 薪资截止日 | `payroll_cutoff_day` | `payroll_cutoff_day` | ✅ |
| 薪资截止时间 | `payroll_cutoff_time` | `payroll_cutoff_time` | ✅ |
| 自动创建日 | 之前硬编码，现在 `cron_payroll_create_day` | `payroll_auto_create_day` | ❌（新旧键不同） |

---

## 四、当前调度器状态

在本次 PR 中，`scheduleCronJobs()` 已从硬编码改为动态调度：

**已完成：**
- 所有 7 个 job 注册为 `CRON_JOB_DEFS` 数组
- 从 `system_config` 读取 `cron_{key}_enabled`、`cron_{key}_day`、`cron_{key}_time`
- 支持热重载（`rescheduleAllJobs()`）
- 支持按 key 手动触发（`runJobByKey()`）
- 记录 `last_run` 和 `last_error` 到 `system_config`
- 后端 API 已添加：`listCronJobs`、`updateCronJob`、`triggerCronJob`、`rescheduleJobs`

**未完成：**
- Settings UI 尚未更新以展示和配置所有 cron job
- 旧的 Settings UI 中的 `payroll_auto_create_day` / `payroll_auto_create_time` 配置项与新的 `cron_payroll_create_day` / `cron_payroll_create_time` 不一致

---

## 五、建议修复优先级

| 优先级 | 问题 | 影响 | 建议 |
|--------|------|------|------|
| **P0** | Job 3 缺少 reimbursements 表聚合 | 自动创建的薪资单遗漏所有独立报销 | 在 `runAutoCreatePayrollRuns` 中添加 `getSubmittedReimbursementsForPayroll` 查询 |
| **P0** | Job 1 配置键名不匹配 | 管理员无法通过 UI 修改月中截止日 | 统一为同一个键名 |
| **P1** | Job 3 不回写 payrollRunId | 无法追踪哪些数据被哪个薪资单消费 | 创建薪资单后，更新 locked 数据的 payrollRunId |
| **P1** | Settings UI 更新 | 管理员无法可视化配置 cron job | 实现新的 Scheduled Jobs 面板 |
| **P2** | Job 5 时区不一致 | 逾期检测可能延迟几小时 | 改用北京时间 |
| **P2** | 新旧配置键名统一 | 避免混乱 | 迁移旧键到新键，或保持兼容 |
