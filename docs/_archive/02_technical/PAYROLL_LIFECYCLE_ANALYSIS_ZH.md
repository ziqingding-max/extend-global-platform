# 薪资生命周期系统分析与重构提案

**作者：** Manus AI（产品经理、研发工程师、测试工程师视角）
**日期：** 2026年3月13日

本文档对 GEA 平台的薪资（Payroll）生命周期进行了全面的系统级分析。我们识别出了当前实现中存在的关键设计缺陷、逻辑不一致以及数据流断层，并提出了一套全局性的重构计划。

## 1. 当前架构与逻辑缺陷分析

目前的薪资生命周期通过两条平行的链路运行，但这两条链路在概念和设计上存在严重的错位：一条是**自动定时任务（Cron Job）链路**，另一条是**管理员手动操作（Admin UI）链路**。

### 1.1 月份归属逻辑的错位

系统中最根本的缺陷在于，不同模块对"哪个月的数据属于哪个月的薪资单"的理解是不一致的。

| 流程 | 数据抓取月份 | 设计意图与隐患 |
|------|--------------|----------------|
| **Cron Job (`runAutoCreatePayrollRuns`)** | `prevMonth`（例：3月的薪资单抓取2月数据） | 设计上有1个月的延迟。假设2月的数据在3月5日被锁定，然后立即被消耗用于生成3月的薪资单。 |
| **手动 `autoFill` (Admin UI)** | `currentMonth`（例：3月的薪资单抓取3月数据） | 假设 N 月的薪资单应该反映 N 月当月产生的数据。 |
| **手动 `addItem` (Admin UI)** | `currentMonth` | 与 `autoFill` 逻辑相同。 |

**影响：** 如果 Cron Job 自动运行，3月的薪资单里包含的是2月的 adjustments（调整项）。但如果管理员在同一个3月的薪资单上点击 "Auto Fill"（自动填充），系统却会去拉取3月的 adjustments。这导致了严重的数据不一致和潜在的财务结算错误。

### 1.2 状态机死锁与 "Locked" 陷阱

系统中的数据实体（如 Adjustments、Reimbursements、Leave Records）遵循以下状态流转：
`submitted`（已提交） → `client_approved`（客户已批） → `admin_approved`（管理员已批） → `locked`（已锁定）

`locked` 状态本应是一个终态，表示该数据已被某张薪资单消费。然而，目前的实现存在断层：

1. **自动锁定的盲区：** `runAutoLock` 定时任务会在每月5号将所有 `admin_approved` 的数据批量改为 `locked`，但**并没有为它们分配 `payrollRunId`**。
2. **手动填充的盲区：** 手动的 `autoFill` 接口在查询时，只查找 `admin_approved` 状态的数据。
3. **导致的死锁：** 如果 `runAutoLock` 执行了（数据变成了 `locked`），但随后的自动创建薪资单任务失败或被跳过，管理员就只能使用手动 "Auto Fill"。但是，手动 "Auto Fill" 根本找不到这些数据，因为它们已经是 `locked` 状态，不再是 `admin_approved`。这些财务数据就此变成了系统中的"孤儿"。

### 1.3 删除操作与回滚失败

当管理员通过 `deleteItem` 删除某个员工的薪资条目时，系统会重新计算薪资单的总额，但**未能解锁关联的底层数据**。

**影响：** 如果管理员为了修正错误删除了某个员工的薪资条目，该员工关联的 adjustments、reimbursements 和 leave records 依然保持在 `locked` 状态。当管理员重新添加该员工或再次运行 "Auto Fill" 时，系统会忽略这些数据。这导致员工的财务数据在薪资单中彻底凭空消失。

### 1.4 配置项与代码硬编码的脱节

Admin Settings（系统设置）页面允许管理员配置薪资生命周期的时间点：
- `payroll_cutoff_day`（默认：4号）
- `payroll_auto_create_day`（默认：5号）

虽然 `cutoff.ts` 能够动态读取 `payroll_cutoff_day` 来限制前端的 UI 提交，但 `cronJobs.ts` 中的定时任务执行时间却是**硬编码**在每月5号的（`"0 0 0 5 * *"`）。

**影响：** 如果管理员在 UI 中将自动创建日（auto-create day）修改为10号，定时任务依然会在5号雷打不动地执行。这会导致在实际的截止日期（Cutoff）到来之前，数据就被提前锁定。

### 1.5 数据库 Schema 的不一致

- `adjustments` 表：包含 `payrollRunId` 字段
- `reimbursements` 表：包含 `payrollRunId` 字段
- `leave_records` 表：**缺失 `payrollRunId` 字段**

**影响：** 一旦请假记录（Leave Record）被锁定，系统就无法确切追溯它到底是被哪一张薪资单消费的。这使得自动回滚和精确的财务审计变得不可能。

---

## 2. 全局重构方案提案

为了彻底解决这些系统性问题，我们必须为薪资归属建立单一的事实来源（Single Source of Truth），并强制执行严格的、可逆的状态机。

### 阶段 1：统一月份归属逻辑（确立 "N-1" 规则）

我们必须在整个平台范围内统一采用 "N-1" 规则：**第 N 月的薪资单（Payroll Run）必须且只能消费第 N-1 月的 Adjustments、Reimbursements 和 Leave Records。**

* **行动项：** 重构 `server/routers/payroll.ts` 中的 `autoFill`、`addItem` 和 `previewItem` 接口，将查询参数从 `payrollMonth` 修改为 `prevMonth`（上个月）。
* **行动项：** 确保所有的查询都精准匹配 `effectiveMonth = prevMonth`（针对 Adjustments/Reimbursements）以及 `endDate` 落在 `prevMonth` 范围内（针对 Leave Records）。

### 阶段 2：修复状态机与查询逻辑

我们必须允许手动流程消费那些被定时任务自动锁定、但尚未实际分配给任何薪资单的数据。

* **行动项：** 更新 `getSubmittedAdjustmentsForPayroll`、`getSubmittedReimbursementsForPayroll` 和 `getSubmittedUnpaidLeaveForPayroll` 中的查询逻辑。
* **新的查询条件：**
  ```sql
  WHERE (status = 'admin_approved') 
     OR (status = 'locked' AND payrollRunId IS NULL)
  ```
* **设计意图：** 这个条件既能抓取到刚刚被管理员批准的新数据，也能安全地抓取到被 `runAutoLock` 批量锁定但还未被消费的数据，同时避免了重复拉取已经被其他薪资单消费的数据。

### 阶段 3：实现安全回滚（删除即解锁）

删除薪资条目（Payroll Item）必须是一个完全可逆的操作，它应该释放底层的财务数据，使其能够被再次消费。

* **行动项：** 修改 `server/routers/payroll.ts` 中的 `deleteItem` 接口。
* **业务逻辑：** 在删除 `payroll_item` 之前，在数据库中查询所有 `payrollRunId = existingItem.payrollRunId` 且 `employeeId = existingItem.employeeId` 的 Adjustments 和 Reimbursements。将它们的状态回退为 `admin_approved`，并将 `payrollRunId` 置为 `NULL`。

### 阶段 4：数据库 Schema 标准化

* **行动项：** 创建一个 Drizzle 数据库迁移（Migration），为 `leave_records` 表添加 `payrollRunId: integer("payrollRunId")` 字段。
* **行动项：** 更新 `autoFill` 和 `addItem` 接口，在锁定请假记录时，同步将当前的 `payrollRunId` 写入 `leave_records` 表，使其行为与 Adjustments 保持一致。
* **行动项：** 将 `leave_records` 纳入阶段 3 的回滚逻辑中。

### 阶段 5：定时任务的动态调度

必须移除硬编码的 cron 表达式，改为动态读取管理员的系统设置。

* **行动项：** 重构 `server/cronJobs.ts`。系统启动时应从 `system_settings` 中读取 `payroll_auto_create_day`，而不是使用硬编码的 `"0 0 0 5 * *"`。
* **行动项：** 实现一个调度刷新机制：当管理员通过 `systemSettings.update` 接口修改了这些时间设置时，系统能够自动重启或重新调度底层的 node-cron 任务。

---

## 3. QA 测试与验证策略

重构完成后，必须执行以下核心测试用例以验证生命周期的完整性：

1. **安全回滚测试（The Rollback Test）：**
   - 创建一条 adjustment（状态为 admin_approved）。
   - 在 UI 上执行手动 Auto Fill（adjustment 状态变为 locked，且分配了 payrollRunId）。
   - 删除该员工的薪资条目（Payroll Item）。
   - *预期结果：* 该 adjustment 的状态恢复为 admin_approved，且 payrollRunId 变回 NULL。
   - 再次执行手动 Auto Fill。
   - *预期结果：* 该 adjustment 能够被成功拉取并重新进入薪资单。

2. **自动与手动交接测试（The Cron-to-Manual Handoff Test）：**
   - 创建一条 adjustment（状态为 admin_approved）。
   - 手动触发后端的 `runAutoLock` 函数（模拟每月5号的自动锁定，此时 adjustment 变为 locked，但 payrollRunId 为 NULL）。
   - 在 UI 上执行手动 Auto Fill。
   - *预期结果：* 即使数据是 locked 状态，依然能被成功拉取进入薪资单，并正确分配 payrollRunId。

3. **N-1 月份归属测试（The N-1 Month Test）：**
   - 创建一张 3月 的薪资单。
   - 分别在 2月 和 3月 各创建一条 adjustment。
   - 执行手动 Auto Fill。
   - *预期结果：* 只有 2月 的 adjustment 被拉取进入了 3月 的薪资单，3月 的数据被正确忽略（留待 4月 处理）。

## 总结

当前的实现将"自动生成"和"手动生成"视为两套互相冲突的独立系统。通过统一月份归属逻辑、强制执行严格的 `payrollRunId` 关联，并构建完善的撤销回滚机制，我们可以彻底消除数据丢失的隐患，确保平台财务数据的绝对准确与一致。
