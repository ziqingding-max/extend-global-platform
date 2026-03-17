# GEA Platform 代码审计报告：P0 级阻塞问题

**文档版本**: v1.1  
**审计日期**: 2026-03-05  
**审计者**: Manus AI  
**目标**: 遵循测试计划（`TEST_PLAN.md`），对 `ziqingding-max/geaplatform_trae` 仓库进行深度代码审计，并确认所有 P0 级阻塞问题。

---

## 审计结论

本次审计确认了测试计划中列出的**全部 P0 级问题**，并且发现了**多个未在计划中但同样严重的 P0 级阻塞问题**。这些问题会导致核心功能（如列表筛选、分页、数据创建/更新）完全失效、关键自动化业务流程（如定时任务）中断以及潜在的数据损坏。**系统在当前状态下完全无法上线。**

以下是确认的所有 P0 级阻塞问题清单，按严重程度和类型划分。

## 1. P0-A：系统性签名不匹配 (13处)

这是系统中**最严重的系统性问题**。路由层（Router）调用服务层（Service）函数时传入的参数与函数签名完全不匹配。这会导致所有列表页的**筛选和分页逻辑完全失效**，返回不可预测的数据。

| # | Service 函数 | Service 签名 | Router 调用方式 | 问题描述 |
|---|---|---|---|---|
| 1 | `listCustomers` | `(page, pageSize, search)` | `({status, search}, limit, offset)` | 筛选对象被当作 `page`，`status` 筛选无效 |
| 2 | `listEmployees` | `(page, pageSize, search)` | `({customerId, status, ...}, limit, offset)` | 筛选对象被当作 `page`，所有筛选无效 |
| 3 | `listAdjustments` | `(page, pageSize)` | `({customerId, ...}, limit, offset)` | 筛选对象被当作 `page`，无任何筛选能力 |
| 4 | `listReimbursements` | `(page, pageSize)` | `({customerId, ...}, limit, offset)` | 筛选对象被当作 `page`，无任何筛选能力 |
| 5 | `listLeaveRecords` | `(page, pageSize, employeeId)` | `({employeeId, status, ...}, limit, offset)` | 筛选对象被当作 `page`，`status` 等筛选无效 |
| 6 | `listVendors` | `(page, pageSize)` | `({status, country, ...}, limit, offset)` | 筛选对象被当作 `page`，无任何筛选能力 |
| 7 | `listVendorBills` | `(vendorId)` | `({vendorId, status, ...}, limit, offset)` | 筛选对象被当作 `vendorId`，分页和筛选无效 |
| 8 | `listSalesLeads` | `(page, pageSize, search)` | `({status, assignedTo, ...}, limit, offset)` | 筛选对象被当作 `page`，`status` 等筛选无效 |
| 9 | `listAuditLogs` | `(page, pageSize)` | `({entityType, userId}, limit, offset)` | 筛选对象被当作 `page`，无任何筛选能力 |
| 10 | `listUsers` | `(page, pageSize, search)` | `(limit, offset)` | `limit` 被当作 `page`，`offset` 被当作 `pageSize`，分页计算错误 |
| 11 | `listAllExchangeRates` | `(page, pageSize)` | `(limit, offset)` | 同上，分页计算错误 |
| 12 | `listEmployees` (in cron) | `(page, pageSize, search)` | `({status}, limit, offset)` | **新发现**：定时任务中调用也存在同样问题 |
| 13 | `listLeaveBalances` (in cron) | `(employeeId)` | `(employeeId, currentYear)` | **新发现**：定时任务中传入多余的 `year` 参数，被忽略 |

## 2. P0-B：Date 对象写入 Text 列 (19处)

多个路由在创建或更新数据时，将 `new Date()` 对象直接写入数据库中类型为 `text` 的日期列。这会导致数据库中存储 `Thu Mar 05 2026 00:00:00 GMT+0000` 而非 `2026-03-05`，造成日期排序、比较、筛选和唯一索引全部失效。

| 文件 | 模块 | 字段 | 问题描述 |
|---|---|---|---|
| `employees.ts` | 员工 | `startDate`, `endDate`, `dateOfBirth`, `visaExpiryDate` | **确认7处**，创建和更新时均存在 |
| `customers.ts` | 客户合同 | `signedDate`, `effectiveDate`, `expiryDate` | **确认6处**，创建和更新时均存在 |
| `customers.ts` | 客户定价 | `effectiveFrom`, `effectiveTo` | **新发现4处**，创建和更新时均存在 |
| `leave.ts` | 请假 | `startDate`, `endDate` | **新发现4处**，创建和更新时均存在 |
| `reimbursements.ts` | 报销 | `effectiveMonth` | **新发现1处**，创建时存在 |
| `exchangeRateService.ts` | 汇率 | `effectiveDate` | **确认1处**，导致唯一索引失效，无法 `upsert` |

## 3. P0-C：关键业务逻辑中断

以下问题导致核心自动化流程和关键功能完全中断，其严重性应从 P1 提升至 P0。

| # | 模块 | 问题描述 | 影响 |
|---|---|---|---|
| 1 | **定时任务 (CronJobs)** | `lockSubmittedAdjustments` 和 `lockSubmittedLeaveRecords` 调用时缺少 `countryCode` 参数。 | **没有任何调整和请假记录会被自动锁定**，导致后续的发薪流程无法聚合这些数据。 |
| 2 | **定时任务 (CronJobs)** | `getSubmitted...ForPayroll` 函数调用时传入了错误的参数，并且其内部硬编码了错误的 `status` 筛选条件。 | **发薪流程永远无法正确获取已锁定的调整和无薪假**，导致薪资计算错误。 |
| 3 | **定时任务 (CronJobs)** | `getContractSignedEmployeesReadyForActivation` 调用时传入了日期参数，但函数本身不接受任何参数，且实现逻辑错误。 | **错误的员工可能在错误的时间被激活**，系统不会按 `startDate` 判断。 |
| 4 | **报销 (Reimbursements)** | `listReimbursements` 服务函数返回 `{data, total}` 对象，但其路由调用方直接对返回结果使用 `.map()`。 | **报销列表页面会直接崩溃**，因为对象没有 `.map` 方法。 |

---

## 总结与建议

当前代码库中存在的 P0 级问题是系统性的，范围广泛且相互关联，已严重影响了系统的基本可用性和数据完整性。**强烈建议在修复所有上述 P0 问题之前，暂停所有其他开发和测试活动。**

建议的修复顺序：
1.  **首先修复 P0-A (签名不匹配)**：这是最基础的问题，修复后才能保证列表页功能正常。
2.  **其次修复 P0-B (Date-to-text)**：确保所有日期数据能被正确存储和查询。
3.  **最后修复 P0-C (业务逻辑中断)**：修复定时任务和报销列表等关键功能的逻辑错误。

在所有 P0 问题修复后，必须严格按照 `TEST_PLAN.md` 中的 P0 回归测试用例进行完整验证，确保问题已彻底解决且无副作用地解决。
