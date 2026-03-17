# TypeScript 错误全面审计报告

> 审计日期：2026-03-14
> 范围：排除已注释的 Copilot 模块后，剩余 50 个 TypeScript 编译错误
> 视角：产品经理 / 开发工程师 / 测试工程师

---

## 一、总览

| 分类 | 错误数 | 影响级别 | 是否影响运行时 |
|------|--------|----------|----------------|
| A. 真实 Bug：Schema 与代码不一致 | 13 | **高** | **是** |
| B. 防御性代码：`ne(serviceType, "aor")` | 9 | 低 | 否 |
| C. 函数签名不匹配 | 7 | **中** | **可能** |
| D. Zod `.default({})` 写法问题 | 3 | 低 | 否 |
| E. 前端 UI 类型问题 | 10 | 低 | 否 |
| F. 迁移脚本（一次性） | 2 | 无 | 否 |
| G. 已修复（本次 PR） | 9 | — | — |
| **合计** | **50+9** | | |

---

## 二、逐类详细分析

### A. 真实 Bug：Schema 与代码不一致（13 个）— 高优先级

这些错误反映了 **代码使用了 schema 中不存在的值**，意味着代码逻辑和数据库定义有分歧。虽然 SQLite 不会在运行时强制枚举约束，但这些不一致可能导致数据查询失败或逻辑错误。

#### A1. `leaveRecords.status` 使用了不存在的 `"approved"` 值（4 个错误）

| 文件 | 行号 | 代码 | 问题 |
|------|------|------|------|
| `employeeService.ts` | 533 | `eq(leaveRecords.status, 'approved')` | Schema 枚举中没有 `"approved"` |
| `employeeService.ts` | 550 | `eq(leaveRecords.status, 'approved')` | 同上 |
| `employeeService.ts` | 581 | `eq(leaveRecords.status, 'approved')` | 同上 |
| `WorkerMilestones.tsx` | 50 | `milestone.status === "approved"` | 同上 |

**Schema 定义**：`leaveRecords.status` 枚举为 `["submitted", "client_approved", "client_rejected", "admin_approved", "admin_rejected", "locked"]`

**产品经理视角**：这是一个严重的业务逻辑问题。Leave 审批流程是两级审批（client → admin），代码中使用 `"approved"` 是旧的单级审批遗留。如果数据库中没有 `status = "approved"` 的记录，这些查询永远返回空结果，意味着：
- `getActiveLeaveRecordsForDate()` 永远找不到活跃的请假记录
- `getAllActiveLeaveRecordsForDate()` 中的 `"approved"` 分支永远不会匹配
- `getOnLeaveEmployeesWithExpiredLeave()` 中的 `"approved"` 分支永远不会匹配
- Worker 端里程碑页面的 `"approved"` 状态标签永远不会显示

**开发工程师视角**：应该将 `"approved"` 改为 `"admin_approved"`（或同时包含 `"client_approved"` 和 `"admin_approved"`，取决于业务需求）。`getActiveLeaveRecordsForDate` 函数接收 `Date` 对象但 schema 中 `startDate/endDate` 是 `text` 类型，也需要修复。

**测试工程师视角**：这个 bug 可以通过以下场景复现：员工请假被 admin 批准后，系统应该能查到该请假记录，但由于查询条件用了不存在的 `"approved"` 状态，查询结果为空。

#### A2. `invoices.status` 缺少 `"paid"` 和 `"cancelled"`/`"void"` 的类型推断问题（3 个错误）

| 文件 | 行号 | 代码 | 问题 |
|------|------|------|------|
| `invoices.ts` | 980 | `newStatus = 'paid'` | TS 认为 `"paid"` 不在枚举中 |
| `invoices.ts` | 990 | `newStatus === 'paid'` | 同上 |
| `invoices.ts` | 639 | `invoiceMonth: followUpMonth` | `Date` 赋值给 `text` 字段 |

**产品经理视角**：Schema 中 `invoices.status` 确实包含 `"paid"`，但 TS 推断出的类型不包含它。这说明 TypeScript 的类型推断和实际 schema 有偏差。**运行时不会出错**（SQLite 不强制枚举），但发票支付流程的类型安全性没有保障。`invoiceMonth` 传入 `Date` 对象而非字符串，可能导致数据库存储格式不一致。

**开发工程师视角**：`invoices.ts` 第 978 行 `let newStatus = invoice.status` 导致 TS 从当前 `invoice.status` 推断类型，而不是从完整枚举推断。可以用 `as` 断言或声明完整类型来修复。`invoiceMonth` 应该用 `.toISOString()` 转换。

**测试工程师视角**：发票支付功能在运行时应该正常工作，但 `invoiceMonth` 存储为 `Date` 对象的 `toString()` 结果可能导致后续月份匹配查询失败。

#### A3. `contractorMilestones` 缺少 `approvedAt` 字段、`contractorAdjustments` 缺少 `date` 字段（3 个错误）

| 文件 | 行号 | 代码 | 问题 |
|------|------|------|------|
| `ContractorDetail.tsx` | 672 | `m.approvedAt` | Schema 中没有 `approvedAt`，有 `adminApprovedAt` |
| `ContractorDetail.tsx` | 672 | `m.approvedAt` | 同上（两处引用） |
| `ContractorDetail.tsx` | 751 | `adj.date` | Schema 中没有 `date`，有 `effectiveMonth` |

**产品经理视角**：承包商详情页显示里程碑审批时间和调整日期时使用了错误的字段名。前端会显示 `undefined`，用户看到的是空白。

**开发工程师视角**：`approvedAt` 应改为 `adminApprovedAt`（或 `clientApprovedAt`）；`adj.date` 应改为 `adj.effectiveMonth` 或 `adj.createdAt`。

**测试工程师视角**：在承包商详情页的 Milestones 和 Adjustments 标签页中，审批时间和日期列会显示为空。

#### A4. `contractorAdjustments` 更新时传入了不存在的字段（1 个错误）

| 文件 | 行号 | 代码 | 问题 |
|------|------|------|------|
| `contractors.ts` | 365 | `updateContractorAdjustment(input.id, input.data)` | `input.data` 包含 `date` 和 `status: "pending"/"approved"/"rejected"/"invoiced"`，但 schema 中没有 `date` 字段，status 枚举也不匹配 |

**产品经理视角**：承包商调整的编辑功能使用了旧的字段和状态值。更新操作可能静默失败（Drizzle 会忽略不存在的字段），或者状态更新不生效。

**开发工程师视角**：`date` 应改为 `effectiveMonth`；`status` 枚举应对齐为 `["submitted", "client_approved", "client_rejected", "admin_approved", "admin_rejected", "locked"]`。

#### A5. `customerLeavePolicies` 缺少 `isStatutory` 字段（1 个错误）

| 文件 | 行号 | 代码 | 问题 |
|------|------|------|------|
| `customerService.ts` | 217 | `policy.isStatutory` | Schema 中没有 `isStatutory` 字段 |

**产品经理视角**：`syncLeaveBalancesOnPolicyUpdate` 函数试图跳过法定假期策略，但由于字段不存在，`policy.isStatutory` 永远是 `undefined`（falsy），所以这个跳过逻辑永远不会执行。目前这个函数本身是个 stub（内部只有计数逻辑），所以实际影响为零。

#### A6. `PortalUser` 缺少 `id` 属性（2 个错误）

| 文件 | 行号 | 代码 | 问题 |
|------|------|------|------|
| `portalMilestonesRouter.ts` | 196 | `ctx.portalUser.id` | `PortalUser` 接口只有 `contactId`，没有 `id` |
| `portalMilestonesRouter.ts` | 247 | `ctx.portalUser.id` | 同上 |

**产品经理视角**：Portal 用户审批里程碑时，`clientApprovedBy` 字段会被设为 `undefined`（因为 `portalUser.id` 不存在），导致审批记录丢失审批人信息。

**开发工程师视角**：应改为 `ctx.portalUser.contactId`。

**测试工程师视角**：在 Portal 端审批里程碑后，查看审批详情时审批人会显示为空。

---

### B. 防御性代码：`ne(serviceType, "aor")`（9 个错误）— 低优先级

| 文件 | 错误数 | 说明 |
|------|--------|------|
| `employeeService.ts` | 6 | `ne(employees.serviceType, "aor")` |
| `invoiceGenerationService.ts` | 1 | `eq(customerPricing.serviceType, ...)` |
| `exchangeRateService.ts` | 1 | `eq(exchangeRates.effectiveDate, Date)` — 实际是 Date vs string |
| `customers.ts` | 1 | serviceType 包含 aor |

**产品经理视角**：这些是 AOR（Agent of Record）模块拆分后的遗留代码。`employees.serviceType` 枚举只有 `["eor", "visa_eor"]`，但代码中用 `ne(serviceType, "aor")` 来排除 AOR 员工。由于 AOR 已经迁移到独立的 `contractors` 表，数据库中不会有 `serviceType = "aor"` 的员工记录，所以这些过滤条件在运行时是多余的但无害的。

**开发工程师视角**：可以安全移除这些 `ne(serviceType, "aor")` 条件，因为 AOR 数据已经不在 employees 表中。但需要确认迁移是否完成。另外 `exchangeRateService.ts` 的问题是 `effectiveDate` 参数类型为 `Date` 但 schema 字段是 `text`，需要转为字符串。

**建议**：暂不修改，等 AOR 迁移完全确认后再清理。

---

### C. 函数签名不匹配（7 个错误）— 中优先级

| 文件 | 行号 | 调用 | 实际签名 | 问题 |
|------|------|------|----------|------|
| `employees.ts` | 660 | `buffer.toString("base64")` | `storageDownload` 返回 `{content, contentType}` | 应该用 `buffer.content.toString("base64")` |
| `employees.ts` | 789 | `buffer.toString("base64")` | 同上 | 同上 |
| `reimbursements.ts` | 69 | `buffer.toString("base64")` | 同上 | 同上 |
| `systemSettings.ts` | 41 | `setSystemConfig(key, value, description)` | `setSystemConfig(key, value)` 只接受 2 参数 | `description` 参数被忽略 |
| `systemSettings.ts` | 56 | 同上 | 同上 | 同上 |
| `dashboard.ts` | 51 | `listAuditLogs(undefined, 20, 0)` | `listAuditLogs(params={})` 只接受 1 个对象参数 | 分页参数没有生效 |
| `customerLeavePolicies.ts` | 93 | `syncLeaveBalancesOnPolicyUpdate(input.id)` | 需要 `(customerId, countryCode)` 两个参数 | 传了 policy ID 而非 customerId |

**产品经理视角**：
- **文件下载（3个）**：合同下载、文档下载、报销单下载功能**全部失败**。`storageDownload` 返回 `{content, contentType}` 对象，代码却对整个对象调用 `.toString("base64")`，结果是 `"[object Object]"`，下载的文件内容是乱码。这是**用户可感知的 bug**。
- **系统设置（2个）**：`description` 参数被静默忽略，不影响功能但配置描述无法保存。
- **Dashboard（1个）**：审计日志只显示默认 50 条而非预期的 20 条，不影响功能但分页不准确。
- **Leave Policy 同步（1个）**：传了错误的参数（policy ID 而非 customerId + countryCode），但由于函数本身是 stub，实际无影响。

**开发工程师视角**：文件下载的 3 个错误是**真正的运行时 bug**，需要立即修复。

**测试工程师视角**：在 Admin 端下载员工合同、文档或报销单时，下载的文件将是损坏的。

---

### D. Zod `.default({})` 写法问题（3 个错误）— 低优先级

| 文件 | 行号 | 问题 |
|------|------|------|
| `notifications.ts` | 21 | `.default({})` 需要提供完整默认值对象 |
| `notifications.ts` | 26 | 同上 |
| `notifications.ts` | 27 | 同上 |

**产品经理视角**：通知配置的 Zod schema 验证定义有问题，但由于 Zod 在运行时会用各字段的 `.default("")` 填充，实际不影响功能。

**开发工程师视角**：将 `.default({})` 改为 `.default({ emailSubject: "", emailBody: "", inAppMessage: "" })` 即可。

---

### E. 前端 UI 类型问题（10 个错误）— 低优先级

| 文件 | 错误数 | 问题 | 运行时影响 |
|------|--------|------|------------|
| `Employees.tsx` | 5 | `.useMutation()` 用在了 `.query()` 定义的路由上 | **是 — 功能不可用** |
| `NotificationCenter.tsx` | 2 | `size="xs"` 不在 Button 组件的 size 枚举中 | 否 — 降级为默认 size |
| `Invoices.tsx` | 2 | `CurrencySelect` 的 `onChange` 应为 `onValueChange` | **可能 — 事件不触发** |
| `Contractors.tsx` | 1 | `country` 不在 list API 的 input 中 | **是 — 参数被忽略** |
| `WorkerMilestones.tsx` | 1 | `"paid"` 不在 milestone status 枚举中 | 否 — 条件永远为 false |

**产品经理视角**：
- **Employees.tsx（5个）**：`initializeLeaveBalances` 和 `updateLeaveBalance` 在 router 中定义为 `.query()` 但前端用 `.useMutation()` 调用。tRPC 会报错，这两个功能**完全不可用**：初始化假期余额和编辑假期余额。
- **Invoices.tsx（2个）**：手动创建发票时的币种选择器可能不工作（`onChange` vs `onValueChange` 属性名不匹配）。
- **Contractors.tsx（1个）**：承包商列表页的国家筛选器不生效，因为 API 不接受 `country` 参数。

**开发工程师视角**：
- `Employees.tsx`：router 端应该将 `initializeLeaveBalances` 和 `updateLeaveBalance` 从 `.query()` 改为 `.mutation()`（因为它们是写操作）。
- `Invoices.tsx`：将 `onChange` 改为 `onValueChange`。
- `Contractors.tsx`：需要在 router 的 list input 中添加 `country` 参数。

---

### F. 迁移脚本（2 个错误）— 无需修复

| 文件 | 问题 |
|------|------|
| `migrate_aor_data.ts` | AOR 迁移脚本使用了 `serviceType = "aor"` 和旧的 adjustment 字段 |

这是一次性迁移脚本，已经执行完毕，不需要修复。

---

### G. `WalletService.releaseFrozenToMain` 方法不存在（1 个错误）

| 文件 | 行号 | 问题 |
|------|------|------|
| `walletRouter.ts` | 126 | `walletService.releaseFrozenToMain()` 方法不存在 |

**产品经理视角**：钱包的"解冻资金到主账户"功能**完全不可用**，调用时会抛出运行时错误。

**开发工程师视角**：需要在 `WalletService` 中实现 `releaseFrozenToMain` 方法，或者将调用改为已有的 `releaseDepositToCreditNote` 方法（如果业务逻辑一致）。

---

## 三、按影响级别排序的修复建议

### 必须立即修复（影响用户功能）

| 序号 | 问题 | 影响 | 修复方案 | 风险 |
|------|------|------|----------|------|
| 1 | 文件下载返回 `[object Object]`（3处） | 合同/文档/报销单下载全部损坏 | `buffer.content.toString("base64")` | 零风险 |
| 2 | `portalUser.id` → `portalUser.contactId`（2处） | Portal 审批人信息丢失 | 字段名替换 | 零风险 |
| 3 | Leave 查询用 `"approved"` 而非 `"admin_approved"`（4处） | 请假记录查询永远为空 | 替换状态值 | 需确认业务逻辑 |
| 4 | `initializeLeaveBalances` / `updateLeaveBalance` 定义为 query 而非 mutation | 假期余额初始化和编辑不可用 | router 端 `.query()` → `.mutation()` | 低风险 |
| 5 | `ContractorDetail` 使用不存在的字段名（3处） | 承包商详情显示空白 | 字段名映射修正 | 零风险 |
| 6 | `CurrencySelect` 属性名错误 | 手动创建发票时币种选择不工作 | `onChange` → `onValueChange` | 零风险 |
| 7 | `walletService.releaseFrozenToMain` 不存在 | 钱包解冻功能不可用 | 需实现方法或调整调用 | 需确认业务逻辑 |

### 建议修复（改善代码质量）

| 序号 | 问题 | 修复方案 | 风险 |
|------|------|----------|------|
| 8 | `invoiceMonth` 传入 Date 对象 | `.toISOString()` 转换 | 低 |
| 9 | `setSystemConfig` 缺少 description 参数 | 扩展函数签名 | 低 |
| 10 | `listAuditLogs` 调用方式错误 | 改为对象参数 | 低 |
| 11 | `syncLeaveBalancesOnPolicyUpdate` 参数错误 | 传入正确的 customerId + countryCode | 低（函数是 stub） |
| 12 | `contractors.list` 缺少 country 参数 | 添加到 router input | 低 |
| 13 | `contractor.adjustments.update` 字段名和状态枚举不匹配 | 对齐 schema | 低 |
| 14 | Zod `.default({})` 写法 | 提供完整默认值 | 零 |
| 15 | `NotificationCenter` size="xs" | 改为 "sm" | 零 |
| 16 | `WorkerMilestones` 使用 "paid"/"approved" | 对齐枚举值 | 零 |

### 暂不修复

| 序号 | 问题 | 原因 |
|------|------|------|
| 17 | `ne(serviceType, "aor")` 9 处 | AOR 迁移遗留，无害 |
| 18 | `migrate_aor_data.ts` 2 处 | 一次性脚本 |
| 19 | `exchangeRateService` Date vs string | 需要更深入调查调用链 |
| 20 | `customers.ts` / `quotationRouter.ts` aor 类型 | AOR 相关，暂不动 |
| 21 | `invoices.ts` "paid" 类型推断 | 运行时正常，仅 TS 推断问题 |

---

## 四、总结

在 50 个错误中：
- **7 个是真正影响用户功能的 bug**（文件下载损坏、Portal 审批人丢失、请假查询失效、假期余额操作不可用、承包商详情空白、币种选择不工作、钱包解冻不可用）
- **9 个是代码质量问题**（函数签名不匹配、字段名错误等）
- **15 个是 AOR 迁移遗留**（无害）
- **10 个是前端类型标注问题**（大部分不影响运行时）
- **2 个是一次性脚本**（无需修复）
