# GEA Platform 全链路测试方案

**文档版本**: v1.0  
**编写日期**: 2026-03-05  
**编写者**: Manus AI  
**目标**: 确保 GEA EOR SaaS 平台可安全上线阿里云生产环境

---

## 一、系统架构概览

GEA Platform 是一套 **EOR (Employer of Record) SaaS 管理平台**，包含三个独立的用户端：

| 端 | 域名 | 路由前缀 | 认证方式 | 用户角色 |
|---|---|---|---|---|
| **Admin 后台** | admin.geahr.com | `/` | Manus OAuth | 超级管理员、财务经理、运营经理、普通用户 |
| **Client Portal** | app.geahr.com 或 `/portal` | `/portal` | Portal JWT | 客户联系人 |
| **Worker Portal** | worker.geahr.com 或 `/worker` | `/worker` | Worker JWT | 承包商/自由职业者 |

技术栈为 **Vite + React + TypeScript + tRPC + Drizzle ORM + SQLite/TiDB**，前后端一体化部署。

### 核心业务模块

| 模块 | Admin 路由 | Portal 路由 | Worker 路由 | 后端 Router | DB Service |
|---|---|---|---|---|---|
| Dashboard | `/` | `${base}/` | `${base}/dashboard` | dashboard | commonService |
| Customers | `/customers` | - | - | customers | customerService |
| Employees | `/people` | `${base}/employees` | - | employees | employeeService |
| Contractors | `/people?tab=contractors` | - | - | contractors | contractorService |
| Payroll | `/payroll` | `${base}/payroll` | - | payroll | financeService |
| Invoices | `/invoices` | `${base}/invoices` | `${base}/invoices` | invoices | financeService |
| Adjustments | `/adjustments` | `${base}/adjustments` | - | adjustments | financeService |
| Leave | `/leave` | `${base}/leave` | - | leave | employeeService |
| Reimbursements | `/reimbursements` | `${base}/reimbursements` | - | reimbursements | financeService |
| Vendors | `/vendors` | - | - | vendors | financeService |
| Vendor Bills | `/vendor-bills` | - | - | vendorBills | financeService |
| Billing Entities | `/billing-entities` | - | - | billingEntities | commonService |
| Sales CRM | `/sales-crm` | - | - | sales | commonService |
| Quotations | `/quotations` | - | - | quotations | quotationService |
| Exchange Rates | (Settings) | - | - | exchangeRates | exchangeRateService |
| User Management | (Settings) | - | - | userManagement | userService |
| Audit Logs | `/audit-logs` | - | - | auditLogs | commonService |
| Knowledge Base | `/knowledge-base-admin` | `${base}/knowledge-base` | - | knowledgeBaseAdmin | - |
| Country Guides | `/admin/knowledge/country-guides` | `${base}/country-guide` | - | countryGuides | - |
| AI Settings | `/ai-settings` | - | - | aiSettings | - |
| Copilot | (Drawer) | - | - | copilot | copilotService |
| Notifications | (Header) | - | `${base}/notifications` | notifications | notificationService |
| Wallet | - | `${base}/wallet` | - | wallet | walletService |
| Cost Simulator | - | `${base}/cost-simulator` | - | toolkit | calculationService |
| Salary Benchmark | - | `${base}/salary-benchmark` | - | salaryBenchmarks | - |
| Reports | `/reports/profit-loss` | - | - | reports | financeService |
| Onboarding | - | `${base}/onboarding` | `${base}/onboarding` | portalEmployees / workerOnboarding | - |
| Settings | `/settings` | `${base}/settings` | `${base}/profile` | systemSettings / portalSettings / workerProfile | - |

---

## 二、代码审计发现的问题清单

### 2.1 严重问题（P0 — 阻塞上线）

以下问题会导致功能完全不可用或数据损坏：

#### 问题 #1：11 个 Service 函数签名与 Router 调用严重不匹配

这是系统中**最严重的系统性问题**。Router（路由层）调用 Service 函数时传入的参数格式（filter 对象 + limit + offset）与 Service 函数实际定义的参数格式（page + pageSize）完全不匹配。由于 JavaScript 的弱类型特性，这不会在编译时报错，但会导致**所有筛选条件失效、分页逻辑错误、数据返回异常**。

| # | Service 函数 | 所在文件 | Router 调用方式 | 函数实际签名 | 影响 |
|---|---|---|---|---|---|
| 1 | `listCustomers` | customerService.ts | `({status, search}, limit, offset)` | `(page, pageSize, search)` | 客户列表筛选失效 |
| 2 | `listEmployees` | employeeService.ts | `({customerId, status, country, ...}, limit, offset)` | `(page, pageSize, search)` | 员工列表筛选失效 |
| 3 | `listAdjustments` | financeService.ts | `({customerId, employeeId, ...}, limit, offset)` | `(page, pageSize)` | 调整列表筛选失效 |
| 4 | `listReimbursements` | financeService.ts | `({customerId, employeeId, ...}, limit, offset)` | `(page, pageSize)` | 报销列表筛选失效 |
| 5 | `listLeaveRecords` | employeeService.ts | `({employeeId, status, month}, limit, offset)` | `(page, pageSize, employeeId)` | 请假记录筛选失效 |
| 6 | `listVendors` | financeService.ts | `({status, country, ...}, limit, offset)` | `(page, pageSize)` | 供应商列表筛选失效 |
| 7 | `listVendorBills` | financeService.ts | `({vendorId, status, ...}, limit, offset)` | `(vendorId?)` | 账单列表筛选失效 |
| 8 | `listSalesLeads` | commonService.ts | `({status, assignedTo, search}, limit, offset)` | `(page, pageSize, search)` | 销售线索筛选失效 |
| 9 | `listAuditLogs` | commonService.ts | `({entityType, userId}, limit, offset)` | `(page, pageSize)` | 审计日志筛选失效 |
| 10 | `listUsers` | userService.ts | `(limit, offset)` | `(page, pageSize, search)` | 用户列表分页错误 |
| 11 | `listAllExchangeRates` | commonService.ts | `(limit, offset)` | `(page, pageSize)` | 汇率列表分页错误 |

**具体表现**：Router 传入的第一个参数是 filter 对象（如 `{status: "active"}`），但 Service 函数将其当作 `page` 数字使用，导致 `NaN` 或 `[object Object]` 被用于 SQL 的 `LIMIT/OFFSET`，查询结果不可预测。

#### 问题 #2：Employee/Customer 路由中 Date 对象写入 text 列

与 Invoice 中已修复的问题相同模式，`employees.ts` 路由在创建/更新员工时将 `new Date(input.startDate)` 等 Date 对象传入 `startDate`、`endDate`、`dateOfBirth` 等 **text 类型**列。

| 路由文件 | 行号 | 字段 | 问题 |
|---|---|---|---|
| `employees.ts` | 169 | `startDate` | `new Date(input.startDate)` → text 列 |
| `employees.ts` | 170 | `endDate` | `new Date(input.endDate)` → text 列 |
| `employees.ts` | 171 | `dateOfBirth` | `new Date(input.dateOfBirth)` → text 列 |
| `employees.ts` | 258 | `startDate` (update) | `new Date(input.data.startDate)` → text 列 |
| `employees.ts` | 263 | `endDate` (update) | `new Date(input.data.endDate)` → text 列 |
| `employees.ts` | 268 | `dateOfBirth` (update) | `new Date(input.data.dateOfBirth)` → text 列 |
| `customers.ts` | 629-631 | `signedDate/effectiveDate/expiryDate` | `new Date(...)` → text 列 |
| `customers.ts` | 661-663 | 同上 (update) | `new Date(...)` → text 列 |

**具体表现**：数据库中存储的日期值为 `Thu Mar 05 2026 00:00:00 GMT+0000` 而非 `2026-03-05`，导致日期比较、排序、显示全部异常。

#### 问题 #3：Exchange Rate `effectiveDate` Date 对象写入 text 列

`exchangeRateService.ts` 的 `upsertExchangeRate` 函数接收 `Date` 类型参数并直接写入 `text` 类型的 `effectiveDate` 列。由于 `effectiveDate` 是唯一索引的一部分，Date 对象的字符串化会导致**唯一索引匹配失败**，无法正确 upsert。

### 2.2 高优先级问题（P1 — 功能异常）

#### 问题 #4：Invoice Generation Service 中 `payrollMonth` Date 对象传入

虽然 `invoiceGenerationService.ts` 中的 `invoiceMonth: payrollMonthStr` 已在上一轮修复中改为字符串，但 `generateInvoicesFromPayroll` 函数的参数类型仍然是 `Date`，而调用方（`invoiceGeneration.ts` 路由）传入的也是 `new Date(input.payrollMonth)`。需要确认整个调用链的一致性。

#### 问题 #5：Cron Jobs 中的函数调用可能受签名不匹配影响

`cronJobs.ts` 导入并调用了 `lockSubmittedAdjustments`、`lockSubmittedLeaveRecords`、`getSubmittedAdjustmentsForPayroll`、`getSubmittedUnpaidLeaveForPayroll` 等函数。虽然上一轮 PR 已修复了这些函数的签名，但需要验证 cronJobs 中的调用方式是否与新签名匹配。

#### 问题 #6：Portal/Worker 端直接使用 raw SQL 查询

Portal 和 Worker 路由中大部分查询直接使用 `db.select().from(...)` 而非调用 Service 函数，这意味着：
- 没有统一的数据访问层
- 筛选逻辑可能与 Admin 端不一致
- 安全边界（customerId 隔离）依赖每个路由自行实现

### 2.3 中优先级问题（P2 — 体验缺陷）

#### 问题 #7：前端表单字段不完整

多个创建/编辑表单缺少必要字段，用户无法完整填写信息：

| 页面 | 问题 | 状态 |
|---|---|---|
| Invoices 创建表单 | 缺少 invoiceType、invoiceMonth、currency、billingEntity、dueDate、notes | 已在 PR #18 修复 |
| 其他表单 | 需逐一验证 | 待测试 |

#### 问题 #8：构建警告

- `index.js` 主 chunk 超过 2MB（2,104 KB），应进行代码分割
- 缺少 `VITE_ANALYTICS_*` 环境变量定义

---

## 三、全链路测试方案

### 3.1 测试范围与策略

本测试方案覆盖以下维度：

| 维度 | 说明 |
|---|---|
| **功能测试** | 每个页面的 CRUD 操作、状态流转、筛选排序分页 |
| **数据一致性测试** | 前端提交 → 后端路由 → Service 函数 → 数据库写入 → 读取展示的全链路数据正确性 |
| **签名匹配测试** | 验证所有 Router 调用与 Service 函数签名的参数传递正确性 |
| **类型安全测试** | 验证 text 列不会被传入 Date 对象 |
| **权限隔离测试** | Admin/Portal/Worker 三端的数据隔离和权限控制 |
| **业务流程测试** | 端到端业务场景（从入职到发薪到开票的完整流程） |
| **定时任务测试** | Cron Jobs 的逻辑正确性 |
| **边界条件测试** | 空数据、大数据量、并发操作等 |

### 3.2 测试优先级

| 优先级 | 说明 | 测试用例数 |
|---|---|---|
| **P0 — 阻塞上线** | 修复 11 个签名不匹配 + Date-to-text 问题后的回归测试 | 约 45 条 |
| **P1 — 核心业务** | 完整业务流程端到端测试 | 约 30 条 |
| **P2 — 功能完整性** | 每个页面的 CRUD + 筛选分页测试 | 约 120 条 |
| **P3 — 边界与安全** | 权限隔离、边界条件、异常处理 | 约 35 条 |

---

## 四、P0 测试用例：签名不匹配修复验证

> 以下测试用例需要在修复 11 个 Service 函数签名后执行。

### TC-P0-001：listCustomers 签名修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 数据库中存在多个客户，状态分别为 active、inactive、prospect |
| **测试步骤** | 1. 打开 Admin → Customers 页面<br>2. 不设筛选条件，验证列表正常加载<br>3. 按 status = "active" 筛选<br>4. 输入搜索关键词<br>5. 翻页操作 |
| **预期结果** | 筛选条件生效，仅显示匹配的客户；分页正确（limit/offset 而非 page/pageSize） |
| **验证重点** | Service 函数接收 filter 对象并正确构建 WHERE 条件 |

### TC-P0-002：listEmployees 签名修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 数据库中存在多个员工，分属不同客户、国家、状态 |
| **测试步骤** | 1. 打开 Admin → People 页面<br>2. 按 customerId 筛选<br>3. 按 country 筛选<br>4. 按 status 筛选<br>5. 按 serviceType 筛选<br>6. 组合筛选 |
| **预期结果** | 所有筛选条件正确生效，返回数据匹配筛选条件 |

### TC-P0-003：listAdjustments 签名修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 数据库中存在多条调整记录 |
| **测试步骤** | 1. 打开 Admin → Adjustments 页面<br>2. 按 customerId 筛选<br>3. 按 employeeId 筛选<br>4. 按 status 筛选<br>5. 按 adjustmentType 筛选<br>6. 按 effectiveMonth 筛选 |
| **预期结果** | 所有筛选条件正确生效 |

### TC-P0-004：listReimbursements 签名修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 数据库中存在多条报销记录 |
| **测试步骤** | 同 TC-P0-003 模式，按 customerId、employeeId、status、category、effectiveMonth 筛选 |
| **预期结果** | 所有筛选条件正确生效 |

### TC-P0-005：listLeaveRecords 签名修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 数据库中存在多条请假记录 |
| **测试步骤** | 按 employeeId、status、month 筛选 |
| **预期结果** | 所有筛选条件正确生效 |

### TC-P0-006：listVendors 签名修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 数据库中存在多个供应商 |
| **测试步骤** | 按 status、country、vendorType、search 筛选 |
| **预期结果** | 所有筛选条件正确生效 |

### TC-P0-007：listVendorBills 签名修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 数据库中存在多条供应商账单 |
| **测试步骤** | 按 vendorId、status、category、billMonth、search 筛选 |
| **预期结果** | 所有筛选条件正确生效，返回 `{data, total}` 格式 |

### TC-P0-008：listSalesLeads 签名修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 数据库中存在多条销售线索 |
| **测试步骤** | 按 status、assignedTo、search 筛选 |
| **预期结果** | 所有筛选条件正确生效 |

### TC-P0-009：listAuditLogs 签名修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 数据库中存在审计日志 |
| **测试步骤** | 按 entityType、userId 筛选 |
| **预期结果** | 所有筛选条件正确生效 |

### TC-P0-010：listUsers / listAllExchangeRates 分页修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 数据库中存在多个用户和汇率记录 |
| **测试步骤** | 1. 打开 Settings → Users 页面，验证分页<br>2. 打开 Settings → Exchange Rates 页面，验证分页 |
| **预期结果** | limit/offset 分页正确，不会出现 NaN 或数据重复 |

### TC-P0-011：Employee Date-to-text 修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 修复 employees.ts 中的 Date-to-text 问题 |
| **测试步骤** | 1. 创建新员工，填写 startDate、endDate、dateOfBirth<br>2. 查看数据库中存储的值<br>3. 在详情页查看日期显示 |
| **预期结果** | 数据库中存储 `2026-03-05` 格式，而非 `Thu Mar 05 2026 00:00:00 GMT+0000` |

### TC-P0-012：Customer Contract Date-to-text 修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 修复 customers.ts 中的 Date-to-text 问题 |
| **测试步骤** | 1. 创建客户合同，填写 signedDate、effectiveDate、expiryDate<br>2. 查看数据库中存储的值 |
| **预期结果** | 数据库中存储 `2026-03-05` 格式 |

### TC-P0-013：Exchange Rate effectiveDate 修复验证

| 项目 | 内容 |
|---|---|
| **前置条件** | 修复 exchangeRateService.ts 中的 Date-to-text 问题 |
| **测试步骤** | 1. 手动添加汇率<br>2. 更新同一货币对的汇率（应 upsert）<br>3. 验证唯一索引正常工作 |
| **预期结果** | effectiveDate 存储为 `2026-03-05` 格式，upsert 正常工作 |

---

## 五、P1 测试用例：核心业务流程端到端

### 5.1 员工全生命周期流程

#### TC-P1-001：员工入职 → 激活 → 发薪 → 离职

| 步骤 | 操作 | 验证点 |
|---|---|---|
| 1 | Admin 创建客户（含 pricing、billing entity） | 客户数据完整存储 |
| 2 | Admin 创建员工（status=onboarding） | 员工数据完整，日期格式正确 |
| 3 | 上传员工合同，状态改为 contract_signed | 状态流转正确 |
| 4 | Cron Job 自动激活（或手动激活为 active） | startDate <= today 时自动激活 |
| 5 | 创建 Payroll Run（选择国家和月份） | Payroll Run 创建成功 |
| 6 | 进入 Payroll Run 详情 | **不再崩溃**（payrollStatusLabels 已定义） |
| 7 | 添加/编辑 Payroll Items | 金额计算正确 |
| 8 | 提交并锁定 Payroll Run | 状态流转正确 |
| 9 | 生成 Invoice | Invoice 创建成功，invoiceMonth 格式正确 |
| 10 | 发送 Invoice → 标记已付款 | 状态流转：draft → sent → paid |
| 11 | 员工离职（status=terminated） | endDate 格式正确 |
| 12 | 生成 Deposit Refund Invoice | 退款 Invoice 创建成功 |

#### TC-P1-002：调整项全流程

| 步骤 | 操作 | 验证点 |
|---|---|---|
| 1 | Portal 客户提交调整（bonus/allowance/deduction） | 调整创建成功，status=submitted |
| 2 | Admin 审批调整 | status → admin_approved，adminApprovedAt 正确 |
| 3 | Cron Job 月初自动锁定 | status → locked |
| 4 | Payroll Run 自动聚合锁定的调整 | 调整金额正确反映在 payroll item 中 |

#### TC-P1-003：请假全流程

| 步骤 | 操作 | 验证点 |
|---|---|---|
| 1 | Portal 客户为员工提交请假申请 | 请假记录创建，startDate/endDate 格式正确 |
| 2 | Admin 审批请假 | status 流转正确 |
| 3 | 无薪假自动影响 Payroll | 扣薪金额正确计算 |
| 4 | 假期余额自动更新 | leaveBalance 正确扣减 |

#### TC-P1-004：报销全流程

| 步骤 | 操作 | 验证点 |
|---|---|---|
| 1 | Portal 客户提交报销（含附件） | 报销创建成功，附件上传成功 |
| 2 | Admin 审批报销 | status 流转正确 |
| 3 | 报销反映在 Payroll 或 Invoice 中 | 金额正确 |

#### TC-P1-005：Invoice 全生命周期

| 步骤 | 操作 | 验证点 |
|---|---|---|
| 1 | 手动创建 Invoice（所有字段） | 所有字段正确存储（invoiceMonth、dueDate 为字符串） |
| 2 | 添加 Invoice Line Items | 金额计算正确 |
| 3 | 发送 Invoice（status → sent） | sentDate 正确（timestamp 类型，Date 对象正确） |
| 4 | 标记部分付款 | paidAmount 正确，amountDue 更新 |
| 5 | 标记全额付款（status → paid） | paidDate 正确 |
| 6 | 创建 Credit Note | 负数金额，relatedInvoiceId 正确 |
| 7 | 应用 Credit Note 到其他 Invoice | creditApplied 更新 |

#### TC-P1-006：Contractor 全流程

| 步骤 | 操作 | 验证点 |
|---|---|---|
| 1 | 创建 Contractor | 数据完整存储 |
| 2 | 创建 Milestones | 里程碑正确关联 |
| 3 | Worker Portal 登录 | JWT 认证正确 |
| 4 | Worker 提交 Invoice | Invoice 创建成功 |
| 5 | Admin 审批 Contractor Invoice | 状态流转正确 |

### 5.2 自动化流程测试

#### TC-P1-007：Cron Job — 自动激活员工

| 项目 | 内容 |
|---|---|
| **前置条件** | 存在 status=contract_signed 且 startDate <= today 的员工 |
| **测试步骤** | 手动触发 cron job 逻辑 |
| **预期结果** | 员工 status → active，如果 startDate <= 15号则加入当月 payroll |

#### TC-P1-008：Cron Job — 自动锁定调整/请假

| 项目 | 内容 |
|---|---|
| **前置条件** | 存在 status=submitted 的调整和请假记录 |
| **测试步骤** | 手动触发每月5号的锁定逻辑 |
| **预期结果** | 所有 submitted 调整/请假 → locked |

#### TC-P1-009：Cron Job — 自动创建 Payroll Run

| 项目 | 内容 |
|---|---|
| **前置条件** | 存在活跃员工的国家 |
| **测试步骤** | 手动触发每月5号的 payroll 创建逻辑 |
| **预期结果** | 为每个有活跃员工的国家创建 draft payroll run |

#### TC-P1-010：Invoice 自动生成

| 项目 | 内容 |
|---|---|
| **前置条件** | 存在已完成的 Payroll Run |
| **测试步骤** | 触发 Invoice Generation |
| **预期结果** | 按客户+国家+服务类型生成 Invoice，invoiceMonth 为字符串格式 |

---

## 六、P2 测试用例：各页面功能完整性

### 6.1 Admin 后台页面

#### 6.1.1 Dashboard (`/`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-001 | Dashboard 统计卡片 | 员工总数、客户总数、本月 payroll 金额正确 |
| TC-P2-002 | 员工按状态分布图 | 数据与实际一致 |
| TC-P2-003 | 员工按国家分布图 | 数据与实际一致 |
| TC-P2-004 | 最近活动列表 | 审计日志正确展示 |
| TC-P2-005 | 财务概览（Finance Manager） | 应收/应付/利润数据正确 |
| TC-P2-006 | 运营概览（Operations Manager） | 待处理事项数据正确 |

#### 6.1.2 Customers (`/customers`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-010 | 客户列表加载 | 列表正确展示，分页正常 |
| TC-P2-011 | 创建客户 | 所有字段正确存储 |
| TC-P2-012 | 编辑客户 | 更新成功，审计日志记录 |
| TC-P2-013 | 客户详情 — Contacts | 联系人 CRUD |
| TC-P2-014 | 客户详情 — Pricing | 定价 CRUD |
| TC-P2-015 | 客户详情 — Contracts | 合同 CRUD，日期格式正确 |
| TC-P2-016 | 客户详情 — Leave Policies | 假期政策 CRUD |
| TC-P2-017 | 客户筛选（status、search） | 筛选条件正确生效 |

#### 6.1.3 People / Employees (`/people`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-020 | 员工列表加载 | 列表正确展示 |
| TC-P2-021 | 创建员工 | 所有字段正确存储，日期为字符串格式 |
| TC-P2-022 | 编辑员工 | 更新成功 |
| TC-P2-023 | 员工详情 — Documents | 文档上传/下载/删除 |
| TC-P2-024 | 员工详情 — Contracts | 合同 CRUD |
| TC-P2-025 | 员工详情 — Leave Balances | 假期余额初始化和编辑 |
| TC-P2-026 | 员工筛选（customerId、status、country、serviceType、search） | 所有筛选条件生效 |
| TC-P2-027 | 员工状态流转 | onboarding → contract_signed → active → terminated |
| TC-P2-028 | Contractors Tab | 承包商列表和筛选 |

#### 6.1.4 Payroll (`/payroll`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-030 | Payroll Run 列表 | 列表正确展示，筛选生效 |
| TC-P2-031 | 创建 Payroll Run | 选择国家和月份，创建成功 |
| TC-P2-032 | Payroll Run 详情 | **页面不崩溃**，payrollStatusLabels 正确显示 |
| TC-P2-033 | 添加 Payroll Item | 员工选择器正常，金额输入正确 |
| TC-P2-034 | 编辑 Payroll Item | 更新成功 |
| TC-P2-035 | 删除 Payroll Item | 删除成功 |
| TC-P2-036 | Payroll Run 状态流转 | draft → processing → completed |
| TC-P2-037 | 自动聚合调整/请假 | 锁定的调整和无薪假正确反映 |

#### 6.1.5 Invoices (`/invoices`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-040 | Invoice 列表 | 列表正确展示，筛选生效 |
| TC-P2-041 | 手动创建 Invoice | **所有表单字段可用**，数据正确存储 |
| TC-P2-042 | Invoice 详情 | 所有信息正确展示 |
| TC-P2-043 | 编辑 Invoice | 更新成功，invoiceMonth/dueDate 为字符串 |
| TC-P2-044 | Invoice Line Items CRUD | 添加/编辑/删除行项目 |
| TC-P2-045 | Invoice 状态流转 | draft → sent → paid |
| TC-P2-046 | 批量标记已付款 | 多选 Invoice 批量操作 |
| TC-P2-047 | Invoice Generation | 从 Payroll 自动生成 Invoice |
| TC-P2-048 | Credit Note 创建 | 负数金额，关联原始 Invoice |
| TC-P2-049 | Deposit Invoice 生成 | 押金 Invoice 正确生成 |
| TC-P2-050 | Deposit Refund 生成 | 退款 Invoice 正确生成 |
| TC-P2-051 | Invoice PDF 导出 | PDF 生成正确 |

#### 6.1.6 Adjustments (`/adjustments`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-055 | 调整列表 | 列表正确展示，筛选生效 |
| TC-P2-056 | 创建调整 | 所有字段正确存储 |
| TC-P2-057 | 编辑调整 | 更新成功 |
| TC-P2-058 | 删除调整 | 删除成功 |
| TC-P2-059 | 调整审批流程 | submitted → admin_approved → locked |
| TC-P2-060 | 按 effectiveMonth 筛选 | 筛选正确 |

#### 6.1.7 Leave (`/leave`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-065 | 请假记录列表 | 列表正确展示，筛选生效 |
| TC-P2-066 | 创建请假记录 | startDate/endDate 格式正确 |
| TC-P2-067 | 审批请假 | 状态流转正确 |
| TC-P2-068 | 删除请假 | 删除成功，余额恢复 |

#### 6.1.8 Reimbursements (`/reimbursements`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-070 | 报销列表 | 列表正确展示，筛选生效 |
| TC-P2-071 | 创建报销 | 所有字段正确存储 |
| TC-P2-072 | 审批报销 | 状态流转正确 |

#### 6.1.9 Vendors (`/vendors`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-075 | 供应商列表 | 列表正确展示，筛选生效 |
| TC-P2-076 | 创建供应商 | 所有字段正确存储 |
| TC-P2-077 | 编辑/删除供应商 | 操作成功 |

#### 6.1.10 Vendor Bills (`/vendor-bills`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-080 | 账单列表 | 列表正确展示，筛选生效 |
| TC-P2-081 | 创建账单 | 所有字段正确存储 |
| TC-P2-082 | 账单行项目 CRUD | 添加/编辑/删除 |
| TC-P2-083 | 成本分配 | 账单与 Invoice 的成本关联 |

#### 6.1.11 Sales CRM (`/sales-crm`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-085 | 销售线索列表 | 列表正确展示，筛选生效 |
| TC-P2-086 | 创建线索 | 所有字段正确存储 |
| TC-P2-087 | 线索活动记录 | 活动 CRUD |
| TC-P2-088 | 线索状态流转 | prospect → qualified → proposal → won/lost |

#### 6.1.12 Quotations (`/quotations`)

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P2-090 | 报价列表 | 列表正确展示 |
| TC-P2-091 | 创建报价 | 所有字段正确，计算正确 |
| TC-P2-092 | 报价详情/编辑 | 更新成功 |

#### 6.1.13 其他 Admin 页面

| TC ID | 页面 | 测试项 |
|---|---|---|
| TC-P2-095 | Billing Entities | CRUD 操作 |
| TC-P2-096 | Settings — Countries | 国家配置列表和编辑 |
| TC-P2-097 | Settings — Exchange Rates | 汇率列表、手动添加、自动获取 |
| TC-P2-098 | Settings — Users | 用户列表、邀请、角色管理 |
| TC-P2-099 | Settings — System | 系统配置 |
| TC-P2-100 | Audit Logs | 日志列表、筛选 |
| TC-P2-101 | Knowledge Base Admin | 知识源 CRUD |
| TC-P2-102 | Country Guides | 国家指南编辑器 |
| TC-P2-103 | AI Settings | AI 提供商配置 |
| TC-P2-104 | Reports — Profit & Loss | 报表数据正确 |
| TC-P2-105 | Copilot Drawer | AI 对话功能 |
| TC-P2-106 | Notifications | 通知列表、标记已读 |

### 6.2 Client Portal 页面

| TC ID | 页面 | 测试项 |
|---|---|---|
| TC-P2-110 | Portal Login | 登录/注册/忘记密码 |
| TC-P2-111 | Portal Dashboard | 统计数据正确，仅显示当前客户数据 |
| TC-P2-112 | Portal Employees | 员工列表（仅当前客户），创建员工 |
| TC-P2-113 | Portal Employee Detail | 员工详情查看 |
| TC-P2-114 | Portal Onboarding | 员工入职流程 |
| TC-P2-115 | Portal Self-Onboarding | 员工自助入职 |
| TC-P2-116 | Portal Payroll | 查看 Payroll Run（仅当前客户） |
| TC-P2-117 | Portal Invoices | Invoice 列表和详情（仅当前客户） |
| TC-P2-118 | Portal Invoice Detail | Invoice 详情、PDF 下载 |
| TC-P2-119 | Portal Adjustments | 提交调整申请 |
| TC-P2-120 | Portal Leave | 提交请假申请 |
| TC-P2-121 | Portal Reimbursements | 提交报销申请 |
| TC-P2-122 | Portal Wallet | 钱包余额和交易记录 |
| TC-P2-123 | Portal Settings | 修改密码、公司信息 |
| TC-P2-124 | Portal Knowledge Base | 知识库浏览 |
| TC-P2-125 | Portal Cost Simulator | 成本模拟计算 |
| TC-P2-126 | Portal Country Guide | 国家指南浏览 |
| TC-P2-127 | Portal Salary Benchmark | 薪资基准查询 |

### 6.3 Worker Portal 页面

| TC ID | 页面 | 测试项 |
|---|---|---|
| TC-P2-130 | Worker Login | 登录/注册 |
| TC-P2-131 | Worker Dashboard | 统计数据正确 |
| TC-P2-132 | Worker Onboarding | 入职信息填写 |
| TC-P2-133 | Worker Milestones | 里程碑查看和更新 |
| TC-P2-134 | Worker Invoices | 提交 Invoice |
| TC-P2-135 | Worker Profile | 个人信息编辑 |

---

## 七、P3 测试用例：安全与边界条件

### 7.1 权限隔离测试

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P3-001 | Portal 数据隔离 | 客户 A 无法看到客户 B 的员工/Invoice/Payroll |
| TC-P3-002 | Worker 数据隔离 | Worker A 无法看到 Worker B 的数据 |
| TC-P3-003 | Admin 角色权限 | 普通用户无法访问 Finance Manager 功能 |
| TC-P3-004 | Portal 未登录访问 | 未登录时重定向到登录页 |
| TC-P3-005 | Worker 未登录访问 | 未登录时重定向到登录页 |
| TC-P3-006 | Admin 未登录访问 | 未登录时重定向到登录页 |

### 7.2 边界条件测试

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P3-010 | 空数据状态 | 各列表页在无数据时显示空状态提示 |
| TC-P3-011 | 大数据量分页 | 1000+ 条记录时分页正常 |
| TC-P3-012 | 特殊字符输入 | 搜索框输入 SQL 注入字符不崩溃 |
| TC-P3-013 | 并发操作 | 两个 Admin 同时编辑同一记录 |
| TC-P3-014 | 网络中断恢复 | API 超时后的错误提示和重试 |
| TC-P3-015 | 金额精度 | 小数点后多位的金额计算精度 |
| TC-P3-016 | 跨时区日期 | 不同时区下日期显示一致性 |
| TC-P3-017 | 汇率为 0 或负数 | 输入验证 |
| TC-P3-018 | 重复提交 | 快速双击创建按钮不会创建两条记录 |

### 7.3 异常处理测试

| TC ID | 测试项 | 验证点 |
|---|---|---|
| TC-P3-020 | 404 页面 | 访问不存在的路由显示 NotFound |
| TC-P3-021 | 数据库连接失败 | 优雅降级，显示错误提示 |
| TC-P3-022 | API 返回错误 | 前端 toast 显示错误信息 |
| TC-P3-023 | ErrorBoundary | 组件崩溃时显示错误边界而非白屏 |

---

## 八、修复优先级与实施建议

### 8.1 必须在上线前修复的问题

| 优先级 | 问题 | 预估工作量 | 影响范围 |
|---|---|---|---|
| **P0-1** | 11 个 Service 函数签名不匹配 | 4-6 小时 | 所有列表页的筛选和分页 |
| **P0-2** | employees.ts Date-to-text（6 处） | 1 小时 | 员工创建/编辑 |
| **P0-3** | customers.ts Date-to-text（6 处） | 1 小时 | 客户合同创建/编辑 |
| **P0-4** | exchangeRateService.ts Date-to-text | 30 分钟 | 汇率 upsert |

### 8.2 建议上线前修复

| 优先级 | 问题 | 预估工作量 |
|---|---|---|
| **P1-1** | 验证 cronJobs 调用签名一致性 | 1 小时 |
| **P1-2** | 验证 invoiceGeneration 全链路 Date 一致性 | 1 小时 |

### 8.3 上线后可逐步优化

| 优先级 | 问题 | 预估工作量 |
|---|---|---|
| **P2-1** | 代码分割优化（chunk > 2MB） | 2-3 小时 |
| **P2-2** | Portal 端统一数据访问层 | 4-8 小时 |
| **P2-3** | 添加 TypeScript strict 模式 | 持续优化 |

---

## 九、测试执行计划

| 阶段 | 内容 | 时间 | 前置条件 |
|---|---|---|---|
| **阶段 1** | 修复 P0 问题（签名不匹配 + Date-to-text） | 1-2 天 | - |
| **阶段 2** | P0 回归测试（TC-P0-001 ~ TC-P0-013） | 0.5 天 | 阶段 1 完成 |
| **阶段 3** | P1 核心业务流程测试（TC-P1-001 ~ TC-P1-010） | 1 天 | 阶段 2 通过 |
| **阶段 4** | P2 功能完整性测试（TC-P2-001 ~ TC-P2-135） | 2-3 天 | 阶段 3 通过 |
| **阶段 5** | P3 安全与边界测试（TC-P3-001 ~ TC-P3-023） | 1 天 | 阶段 4 通过 |
| **阶段 6** | 修复测试中发现的问题并回归 | 1-2 天 | 阶段 5 完成 |
| **阶段 7** | 上线前最终验收 | 0.5 天 | 所有 P0/P1 问题关闭 |

**总计预估**: 7-10 个工作日（含修复时间）

---

## 十、测试环境要求

| 项目 | 要求 |
|---|---|
| **测试数据库** | 与生产环境相同的 TiDB/MySQL 实例（或独立测试实例） |
| **测试数据** | 至少包含：5 个客户、20 个员工（分布在 3+ 国家）、10 条调整、5 条请假、3 个 Payroll Run、10 张 Invoice |
| **测试账号** | Admin（各角色各一个）、Portal（至少 2 个不同客户）、Worker（至少 2 个） |
| **浏览器** | Chrome 最新版（主要）、Safari、Firefox |
| **网络** | 模拟正常网络和弱网环境 |

---

*本文档由 Manus AI 基于代码深度审计自动生成，覆盖了系统的所有功能模块和已发现的代码缺陷。建议在修复 P0 问题后按阶段执行测试。*
