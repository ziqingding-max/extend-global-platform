# GEA SaaS 平台全面测试报告

**测试日期**：2026 年 3 月 4 日

**测试环境**：生产环境（admin.geahr.com / app.geahr.com / worker.geahr.com）

**测试版本**：PR #8 合并后（feat/trae-copilot-integration）

---

## 一、测试概览

本次测试覆盖了 GEA SaaS 平台的三个门户（管理后台、客户门户、员工门户），对所有可访问的页面进行了逐一检查，并对核心业务流程进行了端到端验证。测试使用了真实的客户数据（31 家客户、105 名员工、120 张发票）以及手动创建的测试账号。

| 门户 | 测试页面数 | 正常 | 有问题 | 崩溃/404 |
|------|-----------|------|--------|----------|
| 管理后台（Admin） | 25 | 15 | 7 | 3 |
| 客户门户（Portal） | 12 | 7 | 3 | 2 |
| 员工门户（Worker） | 4 | 4 | 0 | 0 |
| **合计** | **41** | **26** | **10** | **5** |

---

## 二、问题清单

### 2.1 P0 — 阻塞上线（必须修复，共 5 个）

以下问题会导致核心功能完全不可用，必须在上线前修复。

| 编号 | 门户 | 页面 | 问题描述 | 根因 |
|------|------|------|----------|------|
| P0-1 | Admin | /customers/:id | **客户详情页 404**。点击任何客户都返回 404，客户管理核心功能完全不可用。 | App.tsx 中 `<Route path="/customers/:id">` 被注释掉了，需要取消注释并恢复 import。 |
| P0-2 | Admin | /invoices (Monthly Overview tab) | **Monthly Overview 页面崩溃白屏**。错误：`ReferenceError: Calendar is not defined`。 | Calendar 组件未正确导入，需要在对应文件中添加 import 语句。 |
| P0-3 | Admin | /people/:id (Documents tab) | **员工文档 Tab 崩溃白屏**。错误：`ReferenceError: docTypeLabels is not defined`。 | docTypeLabels 变量未定义，需要在组件中声明或导入。 |
| P0-4 | Portal | /adjustments | **客户门户 Adjustments 页面崩溃白屏**。错误：`TypeError: s is not a function`。 | PortalAdjustments 组件中存在运行时错误，需要排查具体函数调用。 |
| P0-5 | Worker | worker.geahr.com（根路径） | **Worker Portal 子域名路由错误**。访问 worker.geahr.com 显示管理后台而非员工门户。必须通过 /worker/login 手动访问。 | portalBasePath.ts 中缺少 `isWorkerDomain()` 函数，App.tsx 的 Router 未处理 worker 子域名判断。 |

### 2.2 P1 — 严重问题（上线前应修复，共 5 个）

以下问题严重影响用户体验，建议在上线前修复。

| 编号 | 门户 | 页面 | 问题描述 |
|------|------|------|----------|
| P1-1 | Admin | /adjustments | **i18n 严重缺失**。页面标题显示 "adjustments.title"，按钮显示 "adjustments.button.new"，Tab 和表头全部显示 key 名。 |
| P1-2 | Admin | /leave | **i18n 严重缺失**。页面标题显示 "leave.title"，按钮显示 "leave.button.new"，所有筛选器和表头都显示 key 名。 |
| P1-3 | Portal | /reimbursements | **i18n 缺失 + 骨架屏不消失**。按钮显示 "portal_reimbursements.button.new_reimbursement"，列表区域持续显示骨架屏。 |
| P1-4 | Portal | /settings | **Settings 页面骨架屏不消失**。Company tab 内容全部显示为骨架屏，数据无法加载。 |
| P1-5 | Portal | 登录后跳转 | **登录成功后跳转到 /portal 导致 404**。PortalLogin.tsx 第 30 行硬编码了 `setLocation("/portal")`，在 app.geahr.com 下应跳转到 `/`。 |

### 2.3 P2 — 一般问题（可在后续迭代修复，共 10 个）

以下问题不影响核心功能，但影响用户体验和专业度。

| 编号 | 门户 | 页面 | 问题描述 |
|------|------|------|----------|
| P2-1 | Admin | 多个页面 | **骨架屏在空数据时不消失**。Payroll、Reimbursements、Vendor Bills、Invoices Active tab 在数据为 0 时仍显示骨架屏动画。 |
| P2-2 | Admin | 多个页面 | **用户名间歇性显示为 "Admin"**。部分页面右上角显示 "AD Admin" 而非 "Simon DING"，刷新后有时恢复。 |
| P2-3 | Admin | /vendors | **筛选器 i18n 缺失**。状态筛选器显示 "common.status.all" 而非 "All"。 |
| P2-4 | Admin | /settings > Notifications | **通知规则 Event 列和 Recipients 列为空**。Finance/Payroll/Onboarding 通知的事件名称和接收者未显示。 |
| P2-5 | Admin | /settings > User Management | **用户列表显示 "No users found"**。当前登录的管理员 Simon DING 应该在列表中。 |
| P2-6 | Admin | /settings > Audit Logs | **时间戳格式异常**。显示 "13 Jan 58141" 而非正确的 2025/2026 年日期。 |
| P2-7 | Portal | Dashboard | **公司名显示错误**。显示 "Test Company" 而非真实公司名 "Fish With You Group Limited"。 |
| P2-8 | Portal | /knowledge-base | **调试按钮泄露**。"Preview marketing payload only (no delivery)" 按钮不应出现在客户门户中。 |
| P2-9 | Worker | 所有页面 | **侧边栏导航链接重复渲染**。每个菜单项（Dashboard、Invoices、Milestones、Profile）都显示两次。 |
| P2-10 | 全局 | 所有门户 | **系统 Logo 硬编码**。Admin 使用临时 CDN 链接，Portal 使用默认图标，缺少 Logo 上传功能。 |

---

## 三、各门户测试详情

### 3.1 管理后台（Admin Portal）

管理后台共测试 25 个页面/功能，整体框架完整，核心列表页面基本可用。

| 页面 | 状态 | 备注 |
|------|------|------|
| Dashboard (/) | ✅ 正常 | 数据卡片、图表、统计全部正确 |
| Customers (/customers) | ✅ 正常 | 31 客户正确显示，分页正常 |
| Customer Detail (/customers/:id) | ❌ 404 | **P0-1** 路由被注释 |
| People (/people) | ✅ 正常 | 105 员工正确显示 |
| Employee Detail (/people/:id) | ⚠️ 部分正常 | Info/Leave/Payroll/Adjustments tab 正常，**Documents tab 崩溃 (P0-3)** |
| Payroll (/payroll) | ⚠️ 骨架屏 | 空数据时骨架屏不消失 |
| Adjustments (/adjustments) | ❌ i18n 缺失 | **P1-1** 几乎所有文本显示 key 名 |
| Reimbursements (/reimbursements) | ⚠️ 骨架屏 | 空数据时骨架屏不消失 |
| Leave (/leave) | ❌ i18n 缺失 | **P1-2** 几乎所有文本显示 key 名 |
| Invoices (/invoices) | ⚠️ 部分正常 | Active/History 正常，**Monthly Overview 崩溃 (P0-2)** |
| Vendors (/vendors) | ⚠️ 小问题 | 筛选器 i18n 缺失 |
| Vendor Bills (/vendor-bills) | ⚠️ 骨架屏 | 空数据时骨架屏不消失 |
| Sales CRM (/sales-crm) | ✅ 正常 | Kanban 看板正常 |
| Quotations (/quotations) | ✅ 正常 | 列表页正常 |
| Profit & Loss (/reports/profit-loss) | ✅ 正常 | 月度报表和图表正常 |
| Knowledge Review (/knowledge-base-admin) | ✅ 正常 | Review/Source/Gaps tabs 正常 |
| Country Guide (/admin/knowledge/country-guides) | ✅ 正常 | 100+ 国家列表正常 |
| AI Settings (/ai-settings) | ✅ 正常 | Provider Endpoints + Task Routing 正常 |
| Help Center (/help) | ✅ 正常 | Guides/FAQ/Glossary/Updates 正常 |
| Settings > Countries | ✅ 正常 | 126 国家数据完整 |
| Settings > Payroll Config | ✅ 正常 | 配置项完整 |
| Settings > Exchange Rates | ✅ 正常 | ECB 汇率功能正常 |
| Settings > Billing Entities | ✅ 正常 | 空状态正确（待配置） |
| Settings > Notifications | ⚠️ 有问题 | Event/Recipients 列为空 |
| Settings > User Management | ⚠️ 有问题 | 用户列表为空 |
| Settings > Audit Logs | ⚠️ 有问题 | 时间戳格式异常 |

### 3.2 客户门户（Client Portal）

客户门户共测试 12 个页面，使用 Fish With You Group Limited 的测试 Portal 账号登录。登录后数据加载正常，大部分页面可用。

| 页面 | 状态 | 备注 |
|------|------|------|
| Login (/login) | ✅ 正常 | 表单完整 |
| Dashboard (/) | ✅ 正常 | 统计卡片、图表、员工分布正确 |
| Employees (/employees) | ✅ 正常 | 23 名员工正确显示 |
| Payroll (/payroll) | ✅ 正常 | 空状态正确 |
| Adjustments (/adjustments) | ❌ 崩溃 | **P0-4** TypeError 白屏 |
| Reimbursements (/reimbursements) | ❌ i18n 缺失 | **P1-3** 按钮和描述显示 key 名 |
| Leave (/leave) | ✅ 正常 | 标题和空状态正确 |
| Invoices (/invoices) | ✅ 正常 | 22 条发票数据正确 |
| Cost Simulator (/cost-simulator) | ✅ 正常 | 表单完整 |
| Country Guide (/country-guide) | ✅ 正常 | 无内容（待管理后台添加） |
| Knowledge Base (/knowledge-base) | ⚠️ 有问题 | 调试按钮泄露 |
| Settings (/settings) | ❌ 骨架屏 | **P1-4** 数据无法加载 |
| Onboarding (/onboarding) | ✅ 正常 | 空状态正确 |

### 3.3 员工门户（Worker Portal）

员工门户共测试 4 个页面，使用手动创建的测试 Contractor + Worker 账号登录。所有页面功能正常，但存在路由和 UI 问题。

| 页面 | 状态 | 备注 |
|------|------|------|
| Login (/worker/login) | ✅ 正常 | 表单完整 |
| Dashboard (/worker/dashboard) | ✅ 正常 | 统计卡片正确 |
| Invoices (/worker/invoices) | ✅ 正常 | 空状态正确 |
| Milestones (/worker/milestones) | ✅ 正常 | 空状态正确 |
| Profile (/worker/profile) | ✅ 正常 | 个人信息正确显示 |

---

## 四、修复优先级建议

### 第一批（上线前必须修复 — P0）

这 5 个问题直接导致核心功能不可用，必须在通知客户之前修复：

1. **P0-1 客户详情页 404** — 取消注释 App.tsx 中的路由和 import（约 5 分钟）
2. **P0-2 Monthly Overview 崩溃** — 添加 Calendar 组件的 import 语句（约 10 分钟）
3. **P0-3 员工文档 Tab 崩溃** — 声明或导入 docTypeLabels 变量（约 10 分钟）
4. **P0-4 Portal Adjustments 崩溃** — 排查 PortalAdjustments 组件的函数调用错误（约 30 分钟）
5. **P0-5 Worker 子域名路由** — 添加 isWorkerDomain() 函数和 Router 判断逻辑（约 1 小时）

### 第二批（上线前应修复 — P1）

这 5 个问题严重影响用户体验：

6. **P1-1/P1-2 Adjustments 和 Leave i18n** — 在 translations.ts 中添加缺失的翻译 key（约 1 小时）
7. **P1-3 Portal Reimbursements i18n** — 添加 portal_reimbursements 翻译 key（约 20 分钟）
8. **P1-4 Portal Settings 骨架屏** — 排查 API 返回数据（约 30 分钟）
9. **P1-5 Portal 登录跳转** — 修改 PortalLogin.tsx 使用 portalPath() 函数（约 10 分钟）

### 第三批（后续迭代 — P2）

10 个 P2 问题可以在客户上线后逐步修复。

---

## 五、上线前配置清单

除了代码修复外，以下配置项也需要在上线前完成：

| 配置项 | 状态 | 说明 |
|--------|------|------|
| HTTPS 证书 | ✅ 已完成 | 三个子域名均已启用 HTTPS |
| 阿里云 OSS | ✅ 已完成 | gea-saas-files bucket，内网 Endpoint |
| 系统 Logo | ❌ 待处理 | 需要开发 Logo 上传功能或在代码中替换为正式 Logo |
| SMTP 邮件服务 | ❌ 未配置 | 邀请邮件、密码重置、通知邮件依赖 SMTP |
| Billing Entity | ❌ 未创建 | 发票生成需要至少一个 Billing Entity |
| 数据库备份策略 | ⚠️ 手动备份 | 建议配置定时自动备份 |

---

## 六、测试账号信息

| 门户 | 邮箱 | 密码 | 关联公司/角色 |
|------|------|------|--------------|
| Admin | simon.ding@bestgea.com | BestGEA2026~~ | 系统管理员 |
| Portal | test.portal@geahr.com | TestPortal2026!! | Fish With You Group Limited / admin |
| Worker | test.worker@geahr.com | TestWorker2026!! | Test Contractor (CON-TEST-001) |

---

**报告结论**：GEA SaaS 平台整体框架完整，大部分页面可正常访问。但存在 **5 个 P0 级阻塞问题**和 **5 个 P1 级严重问题**需要在上线前修复。建议按优先级分批修复，P0 问题修复后即可进行第二轮验收测试。
