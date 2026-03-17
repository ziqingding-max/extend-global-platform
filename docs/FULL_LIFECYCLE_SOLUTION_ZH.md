# 完整入离职生命周期技术方案 (含承包商对齐与规则修复)

> **版本**：v1.1 | **日期**：2026-03-14 | **作者**：Manus AI

---

## 1. 核心目标与硬规则

本次重构的核心目标是建立一个**完全对称、基于日期驱动的入离职状态机**，并彻底解决已知缺陷。在设计中，必须严格遵守以下两条"硬规则"：

> **硬规则 1 — 薪资结算原则**：只要员工处于 `active` 或 `offboarding`（通知期）状态，就**必须**被纳入每月的薪资计算。

> **硬规则 2 — 假期累积原则**：只要员工处于 `active`、`on_leave` 或 `offboarding` 状态，就**必须**在每月 1 号正常累积年假。

---

## 2. 前置依赖

> **重要**：本方案依赖另一个正在进行的 Task —— **Cron Job 可视化**。该 Task 将在 `server/cronJobs.ts` 中引入 `CRON_JOB_DEFS` 注册表机制，使所有 cron job 自动出现在 Admin Settings > Scheduled Jobs 列表中，并获得开关、时间配置和 "Run Now" 按钮。
>
> **实施顺序**：Cron Job 可视化 PR **必须先合并**，然后本方案再基于合并后的代码开发。这样新增的 `runEmployeeAutoTermination` 可以直接注册到 `CRON_JOB_DEFS`，一步到位，避免返工和合并冲突。

---

## 3. 状态机与生命周期设计

### 3.1 员工状态机 (Employee State Machine)

```
pending_review ⇄ documents_incomplete (循环补件)
pending_review → onboarding           [触发: 押金账单生成]
onboarding → contract_signed
contract_signed → active              [触发: startDate 到达时 cron 自动激活 / 手动"立即激活"]
                                      [副作用: 初始化假期额度; Pro-rata 计入薪资]
active → on_leave ⇄ active            (休假与返回)
active → offboarding                  [触发: 管理员"开始离职", 必须设定 endDate]
offboarding → terminated              [触发: endDate 过期后 cron 自动终止 / 手动"立即终止"]
                                      [副作用: 押金退还账单; 停止薪资和假期累积]
terminated → active                   (重新激活, 需重新生成押金账单)
```

**对称性说明**：入职由 `startDate` + 自动激活定时任务驱动，离职由 `endDate` + 自动终止定时任务驱动。两端都保留手动"立即"按钮用于紧急情况。

### 3.2 承包商状态机 (Contractor State Machine)

```
pending_review → active               [管理员批准]
active → terminated                   [触发: 管理员"终止", 必须设定 endDate + reason]
terminated → active                   (重新激活)
```

**对齐要求**：承包商终止流程必须与员工一样，要求提供明确的 `endDate` 和终止原因，Admin 和 Portal 两端保持一致。

---

## 4. 已知缺陷修复 (Bug Fixes)

### 4.1 BUG-1: 薪资排除 offboarding 员工 (高优先级)

| 项目 | 详情 |
|:---|:---|
| **文件** | `server/services/db/employeeService.ts` |
| **函数** | `getActiveEmployeesForPayroll()` |
| **现状** | 查询条件为 `eq(employees.status, "active")`，排除了 `offboarding` |
| **影响** | 通知期内的员工不会出现在薪资草稿中，违反硬规则 1 |
| **修复** | 改为 `or(eq(employees.status, "active"), eq(employees.status, "offboarding"))` |

**连带影响**：以下两个函数存在相同问题，需要一并修复：

| 函数名 | 文件 | 问题 |
|:---|:---|:---|
| `getCountriesWithActiveEmployees()` | `employeeService.ts` | 仅查询 `active`，导致如果某国只有 `offboarding` 员工，该国不会生成薪资 run |
| `getEmployeesForPayrollMonth()` | `employeeService.ts` | 仅查询 `active`，与 `getActiveEmployeesForPayroll` 相同问题 |

### 4.2 BUG-2: 假期累积排除 offboarding 员工 (高优先级)

| 项目 | 详情 |
|:---|:---|
| **文件** | `server/cronJobs.ts` |
| **函数** | `runMonthlyLeaveAccrual()` |
| **现状** | 仅获取 `active` 和 `on_leave` 员工 |
| **影响** | 通知期内的员工不会累积年假，违反硬规则 2 |
| **修复** | 添加第三行：`const { data: offboardingEmployees } = await listEmployees({ status: "offboarding", pageSize: 10000 });` 并合并到 `allEligibleEmployees` |

### 4.3 BUG-3: 承包商 terminate 接口是死代码

| 项目 | 详情 |
|:---|:---|
| **文件** | `server/routers/contractors.ts` |
| **接口** | `contractors.terminate` |
| **现状** | 接口只接收 `{ id }`，硬编码 `endDate = today`，无 reason；但前端从未调用此接口，而是直接调用 `contractors.update({ id, data: { status: "terminated" } })` |
| **影响** | 终止时不记录原因，不强制设定 endDate |
| **修复** | 见第 5.2 节 |

### 4.4 BUG-4: 离职员工薪资缺少 Pro-rata 计算

| 项目 | 详情 |
|:---|:---|
| **文件** | `server/cronJobs.ts` 和 `server/routers/payroll.ts` |
| **函数** | `runAutoCreatePayrollRuns()` 和 `autoFill` |
| **现状** | 现有 Pro-rata 逻辑仅基于 `startDate`（入职月中开始），没有基于 `endDate`（离职月中结束）的对称计算 |
| **影响** | 如果员工在月中离职（如 15 号），仍会被计算全月薪资 |
| **修复** | 在 `calculateProRata` 函数中增加 `endDate` 参数，当 `endDate` 在薪资月份内时，`workedDays` 应截止到 `endDate` |

---

## 5. 后端接口与定时任务改造

### 5.1 新增定时任务：自动终止 (Auto-Termination)

| 项目 | 详情 |
|:---|:---|
| **文件** | `server/cronJobs.ts` |
| **函数名** | `runEmployeeAutoTermination()` |
| **调度时间** | 每天北京时间 00:01（与 `runEmployeeAutoActivation` 同一时间段） |
| **逻辑** | 查找 `status = 'offboarding' AND endDate <= today` 的员工 → 更新为 `terminated` → 触发押金退还账单 → 记录审计日志 |
| **注册** | 注册到 `CRON_JOB_DEFS` 数组（依赖 Cron Job 可视化 PR 合并后），自动出现在 Admin Settings > Scheduled Jobs |

需要在 `employeeService.ts` 中新增查询函数：

```typescript
export async function getOffboardingEmployeesReadyForTermination(dateStr: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(employees).where(and(
    eq(employees.status, 'offboarding'),
    lte(employees.endDate, dateStr)
  ));
}
```

### 5.2 承包商接口对齐 (Contractor Alignment)

**方案**：重写 `contractors.terminate` 接口，前端改为调用此接口。

```typescript
// 重写后的 terminate 接口
terminate: customerManagerProcedure
  .input(z.object({
    id: z.number(),
    endDate: z.string(),          // 必填：最后工作日
    reason: z.string().optional(), // 选填：终止原因
  }))
  .mutation(async ({ input, ctx }) => {
    await updateContractor(input.id, {
      status: "terminated",
      endDate: input.endDate,
    });
    await logAuditAction({
      userId: ctx.user.id,
      userName: ctx.user.name || null,
      action: "terminate",
      entityType: "contractor",
      entityId: input.id,
      changes: JSON.stringify({
        endDate: input.endDate,
        reason: input.reason || "No reason provided",
      }),
    });
    return { success: true };
  }),
```

同时在 `contractors.update` 中增加拦截：

```typescript
// 在 update mutation 内部增加
if (input.data.status === "terminated") {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Please use the dedicated terminate endpoint with endDate and reason.",
  });
}
```

### 5.3 员工接口增强 (Employee Endpoint Enhancement)

在 `server/routers/employees.ts` 的 `update` mutation 中增加验证：

```typescript
// 当状态变为 offboarding 时，必须提供 endDate
if (input.data.status === "offboarding" && !input.data.endDate) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "endDate is required when starting offboarding.",
  });
}

// 当状态变为 terminated 时，自动设置 endDate 为今天（如果未提供）
if (input.data.status === "terminated" && !input.data.endDate) {
  updateData.endDate = new Date().toISOString().split('T')[0];
}
```

### 5.4 客户门户终止请求 (Portal Termination Requests)

在 `portalEmployeesRouter.ts` 和 `portalContractorsRouter.ts` 中分别新增：

```typescript
requestTermination: portalHrProcedure
  .input(z.object({
    id: z.number(),
    requestedEndDate: z.string(),
    reason: z.string().min(1, "Reason is required"),
  }))
  .mutation(async ({ input, ctx }) => {
    // 验证：只有 active 状态可以请求终止（offboarding 说明管理员已审批，无需重复请求）
    // ...

    // 发送通知给管理员
    await notificationService.send({
      type: "employee_termination_request", // 或 "contractor_termination_request"
      entityType: "employee", // 或 "contractor"
      entityId: input.id,
      customerId: ctx.portalUser.customerId,
      metadata: {
        requestedEndDate: input.requestedEndDate,
        reason: input.reason,
        requestedBy: ctx.portalUser.name,
      },
    });

    return { success: true };
  }),
```

### 5.5 通知服务扩展 (Notification Service)

#### 5.5.1 后端：`notificationConstants.ts`

在 `DEFAULT_RULES` 中新增两个事件类型：

```typescript
employee_termination_request: {
  enabled: true,
  channels: ["email", "in_app"],
  recipients: ["admin:operations_manager"],
  templates: {
    en: {
      emailSubject: "Employee Termination Request: {{employeeName}}",
      emailBody: "<p>Customer {{customerName}} ({{requestedBy}}) has requested termination for employee {{employeeName}} ({{employeeCode}}).</p><p>Requested end date: {{requestedEndDate}}</p><p>Reason: {{reason}}</p>",
      inAppMessage: "Termination request for {{employeeName}} from {{customerName}}. End date: {{requestedEndDate}}."
    },
    zh: {
      emailSubject: "员工终止请求：{{employeeName}}",
      emailBody: "<p>客户 {{customerName}}（{{requestedBy}}）为员工 {{employeeName}}（{{employeeCode}}）提交了终止请求。</p><p>期望终止日期：{{requestedEndDate}}</p><p>原因：{{reason}}</p>",
      inAppMessage: "收到 {{customerName}} 提交的 {{employeeName}} 终止请求，期望终止日期：{{requestedEndDate}}。"
    }
  }
},
contractor_termination_request: {
  enabled: true,
  channels: ["email", "in_app"],
  recipients: ["admin:operations_manager"],
  templates: {
    en: {
      emailSubject: "Contractor Termination Request: {{contractorName}}",
      emailBody: "<p>Customer {{customerName}} ({{requestedBy}}) has requested termination for contractor {{contractorName}} ({{contractorCode}}).</p><p>Requested end date: {{requestedEndDate}}</p><p>Reason: {{reason}}</p>",
      inAppMessage: "Termination request for {{contractorName}} from {{customerName}}. End date: {{requestedEndDate}}."
    },
    zh: {
      emailSubject: "承包商终止请求：{{contractorName}}",
      emailBody: "<p>客户 {{customerName}}（{{requestedBy}}）为承包商 {{contractorName}}（{{contractorCode}}）提交了终止请求。</p><p>期望终止日期：{{requestedEndDate}}</p><p>原因：{{reason}}</p>",
      inAppMessage: "收到 {{customerName}} 提交的 {{contractorName}} 终止请求，期望终止日期：{{requestedEndDate}}。"
    }
  }
},
```

#### 5.5.2 前端：`NotificationSettingsSection.tsx`

在 Admin Settings > Notifications tab 中集成新通知类型，使管理员可以可视化管理（开关、编辑模板、配置接收者）：

**`EVENT_LABELS` 新增：**

```typescript
employee_termination_request: { en: "Employee Termination Request", zh: "员工终止请求" },
contractor_termination_request: { en: "Contractor Termination Request", zh: "承包商终止请求" },
```

**`EVENT_DESCRIPTIONS` 新增：**

```typescript
employee_termination_request: {
  en: "Triggered when a customer requests termination for an employee via Portal.",
  zh: "当客户通过门户为员工提交终止请求时触发。"
},
contractor_termination_request: {
  en: "Triggered when a customer requests termination for a contractor via Portal.",
  zh: "当客户通过门户为承包商提交终止请求时触发。"
},
```

**`groups` 新增分组：**

```typescript
const groups = {
  // ... 现有分组 ...
  [locale === "zh" ? "离职" : "Offboarding"]: [
    "employee_termination_request",
    "contractor_termination_request"
  ],
};
```

---

## 6. 前端交互改造

### 6.1 Admin 员工详情页 (`Employees.tsx`)

将以下状态转换按钮从简单的 `confirm()` 改为自定义 Dialog：

| 按钮 | 触发条件 | 对话框字段 | 后端调用 |
|:---|:---|:---|:---|
| 开始离职 (Start Offboarding) | `active` 状态 | `endDate`（必填）, `reason`（选填） | `employees.update({ status: "offboarding", endDate })` |
| 立即终止 (Terminate Now) | `offboarding` 状态 | `endDate`（默认今天）, `reason`（必填） | `employees.update({ status: "terminated", endDate })` |
| 立即激活 (Activate Now) | `contract_signed` 状态 | 确认对话框 | `employees.update({ status: "active" })` |

其余状态转换（如 rollback、put on leave）保持现有的简单确认逻辑不变。

### 6.2 Admin 承包商详情页 (`ContractorDetail.tsx`)

| 按钮 | 触发条件 | 对话框字段 | 后端调用 |
|:---|:---|:---|:---|
| 终止 (Terminate) | `active` 或 `pending_review` 状态 | `endDate`（默认今天）, `reason`（选填） | `contractors.terminate({ id, endDate, reason })` |

移除现有的 `confirm()` 弹窗和通过 `contractors.update` 设置 `status: "terminated"` 的逻辑。

### 6.3 Portal 员工详情页 (`PortalEmployeeDetail.tsx`)

| 按钮 | 触发条件 | 对话框字段 | 后端调用 |
|:---|:---|:---|:---|
| 请求终止 (Request Termination) | 仅 `active` 状态 | `requestedEndDate`（必填）, `reason`（必填） | `portalEmployees.requestTermination()` |

按钮位于页面头部，状态 Badge 旁边。

### 6.4 Portal 承包商详情页 (`PortalContractorDetail.tsx`)

| 按钮 | 触发条件 | 对话框字段 | 后端调用 |
|:---|:---|:---|:---|
| 请求终止 (Request Termination) | `active` 状态 | `requestedEndDate`（必填）, `reason`（必填） | `portalContractors.requestTermination()` |

---

## 7. 影响范围汇总

| 文件 | 变更类型 | 说明 |
|:---|:---|:---|
| `server/services/db/employeeService.ts` | 修改 | 修复 3 个函数的 offboarding 排除问题；新增 `getOffboardingEmployeesReadyForTermination` |
| `server/cronJobs.ts` | 修改+新增 | 修复假期累积 Bug；新增 `runEmployeeAutoTermination`；注册到 `CRON_JOB_DEFS`；增加 endDate Pro-rata |
| `server/routers/employees.ts` | 修改 | 增加 offboarding 时 endDate 必填验证 |
| `server/routers/contractors.ts` | 修改 | 重写 terminate 接口；update 接口拦截直接终止 |
| `server/routers/payroll.ts` | 修改 | `autoFill` 中增加 endDate Pro-rata 计算 |
| `server/portal/routers/portalEmployeesRouter.ts` | 新增 | 添加 `requestTermination` 接口 |
| `server/portal/routers/portalContractorsRouter.ts` | 新增 | 添加 `requestTermination` 接口 |
| `server/services/notificationConstants.ts` | 新增 | 添加 `employee_termination_request` 和 `contractor_termination_request` 通知类型 |
| `client/src/components/pages/NotificationSettingsSection.tsx` | 修改 | 添加新通知类型的标签、描述和"离职"分组 |
| `client/src/pages/Employees.tsx` | 修改 | 状态转换按钮改为 Dialog |
| `client/src/pages/ContractorDetail.tsx` | 修改 | 终止按钮改为 Dialog，调用新接口 |
| `client/src/pages/portal/PortalEmployeeDetail.tsx` | 新增 | 添加"请求终止"按钮和 Dialog |
| `client/src/pages/portal/PortalContractorDetail.tsx` | 新增 | 添加"请求终止"按钮和 Dialog |
| `docs/BUSINESS-RULES.md` | 更新 | 更新员工生命周期描述，添加两条硬规则 |

---

## 8. 数据库变更

**本方案无需数据库结构迁移 (No DB Migration)**。所有新增数据需求通过以下方式实现：

- **终止原因 (reason)**：记录在 `audit_logs.changes` JSON 字段中。
- **终止日期 (endDate)**：复用 `employees.endDate` 和 `contractors.endDate` 现有字段。
- **终止请求**：通过通知系统传递，不单独建表。

---

## 9. 测试与验证策略

| 测试场景 | 验证点 | 对应规则 |
|:---|:---|:---|
| offboarding 员工出现在薪资草稿中 | `autoFill` 和 `runAutoCreatePayrollRuns` 包含 offboarding 员工 | 硬规则 1 |
| offboarding 员工月中离职的 Pro-rata | `endDate` 在月中时，薪资按实际工作天数计算 | 硬规则 1 |
| offboarding 员工年假累积 | `runMonthlyLeaveAccrual` 包含 offboarding 员工 | 硬规则 2 |
| 自动终止定时任务 | `endDate` 过期后自动 offboarding → terminated | 状态机对称性 |
| 开始离职必须填 endDate | 不提供 endDate 时后端返回 400 | 数据完整性 |
| Admin 承包商终止需要 endDate | Dialog 强制填写，审计日志记录 reason | 前后端对齐 |
| Portal 员工终止请求 | 提交后管理员收到通知 | Portal 功能 |
| Portal 承包商终止请求 | 提交后管理员收到通知 | Portal 功能 |
| 通知在 Settings 中可见 | 新通知类型出现在 Notifications tab 的"离职"分组中 | 通知可视化 |
| Cron Job 在 Settings 中可见 | `runEmployeeAutoTermination` 出现在 Scheduled Jobs 列表中 | Cron 可视化 |

---

## 10. 实施顺序

| 阶段 | 内容 | 前置依赖 |
|:---|:---|:---|
| **Phase 0** | 等待 Cron Job 可视化 PR 合并 | 无 |
| **Phase 1** | Bug Fixes：修复 4.1、4.2、4.3、4.4 四个缺陷 | Phase 0 |
| **Phase 2** | 后端定时任务：实现 `runEmployeeAutoTermination`，注册到 `CRON_JOB_DEFS` | Phase 0 |
| **Phase 3** | 后端接口：员工 endDate 验证、承包商 terminate 重写、Portal requestTermination | Phase 1 |
| **Phase 4** | 通知服务：`notificationConstants.ts` 新增事件类型 | Phase 3 |
| **Phase 5** | 前端 Admin：员工/承包商详情页 Dialog 改造 | Phase 3 |
| **Phase 6** | 前端 Portal：员工/承包商详情页"请求终止"按钮 | Phase 3, Phase 4 |
| **Phase 7** | 前端 Settings：`NotificationSettingsSection.tsx` 新增"离职"分组 | Phase 4 |
| **Phase 8** | 文档更新：`BUSINESS-RULES.md` | Phase 1-7 |
