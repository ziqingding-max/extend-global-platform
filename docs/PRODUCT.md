# GEA EOR SaaS Admin — 产品文档

> **版本**: 3.2
> **更新日期**: 2026-02-28

---

## 1. 系统概述

**GEA EOR SaaS Admin** 是一套专为全球雇佣 (Employer of Record, EOR) 服务商设计的企业级管理系统。系统通过自动化和集中化的工作流程，将客户签约、员工入职、多国薪酬处理、发票结算、合规管理等核心业务流程整合到统一平台，覆盖 126 个国家和地区，支持 166 种货币。

系统由三个独立门户组成，共享同一套后端服务和数据库，通过严格的认证隔离和数据作用域控制确保安全性。**管理后台 (Admin Portal)** 面向公司内部团队（客户经理、运营经理、财务经理），提供完整的 EOR 业务管理能力。**客户门户 (Client Portal)** 面向客户（HR 经理、财务联系人），提供自助服务能力，包括员工入职、休假申请、发票查看和报销提交。**员工门户 (Worker Portal)** 面向被雇佣的员工和独立承包商，提供个人信息管理、合同查看和薪资单下载等自助服务。

---

## 2. 管理后台功能模块

管理后台按业务职能划分为以下核心模块，每个模块均配有基于角色的访问控制。

### 2.1 仪表盘 (Dashboard)

Dashboard 提供五个维度的数据看板，按角色控制可见性。**Overview** 展示核心 KPI（活跃客户数、活跃员工数、覆盖国家数、待处理任务数）以及月度新入职/离职/新客户趋势。**Operations** 展示薪酬处理进度、截止日期倒计时和运营待办。**Finance** 展示月度收入趋势图（标注“按收款日期 Cash Basis”）、应收账款和发票状态分布。**HR & Leave** 展示 6 项劳动力 KPI、月度劳动力趋势、合同到期预警（30/60/90 天）、休假状态饼图和调整项分布。**Activity Log** 展示近期系统操作记录，支持快速跳转至审计日志详情。

### 2.2 客户管理 (Customers)

客户管理模块覆盖客户公司的完整生命周期。每个客户记录包含公司信息（名称、注册号、行业、地址）、结算货币、付款条件（Net 7/15/30 或自定义天数）和关联的 Billing Entity。系统支持为每个客户配置灵活的定价策略：**全局折扣**（在标准费率基础上按百分比折扣）或**按国家/服务类型指定固定价格**。客户联系人管理支持主要联系人自动同步，以及客户门户邀请（生成邀请链接 → 客户注册 → 登录门户）。客户级别的休假政策（Customer Leave Policies）允许为不同国家配置定制化的年假天数、结转规则和过期时间。

### 2.3 员工管理 (Employees)

员工管理模块处理跨 126 国的员工全生命周期。员工状态流转为：`pending_review → onboarding → documents_incomplete → contract_signed → active → on_leave → offboarding → terminated`。系统支持三种服务类型（EOR、Visa EOR、AOR），当员工国籍与雇佣国不同时自动切换为 Visa EOR 并显示提示。员工货币锁定为所在国法定货币（不可手动选择），薪酬以本地货币计价。员工文档管理支持合同、护照、签证、报销凭证等多类型文件上传至 Alibaba Cloud OSS 存储。自助入职功能允许通过邀请链接让员工自行填写个人信息，雇主预填薪资和合同条款。

### 2.4 薪酬管理 (Payroll)

薪酬模块以**国家 + 月份**为维度组织薪酬批次（Payroll Run）。每月 5 日系统自动为有活跃员工的国家创建当月薪酬批次草稿，并通过 Auto-Fill 功能从已锁定的调整项和休假记录聚合数据到每个员工的薪酬行项目。入职/离职月份按工作日比例计算 Pro-rata 薪资。薪酬批次状态流转为 `draft → pending_approval → approved / rejected`，approved 为终态，后续付款在 Invoice 模块处理。运营经理可手动添加员工、编辑薪酬项（包括未付休假扣款），系统显示参考计算值供对照。

### 2.5 休假管理 (Leave)

休假模块管理员工的休假申请和余额。系统支持多种假期类型（年假、病假、产假、丧假等），每个国家预置法定假期类型。休假记录状态为 `submitted → locked`（取消即直接删除）。跨月休假自动拆分为多条记录，每条独立归属对应月份的薪酬批次。休假创建时自动扣减余额，删除时自动恢复。截止日期逻辑为每月 4 日 23:59（北京时间）锁定上月数据，admin/operations_manager 可覆盖截止限制。客户门户提交的休假需经客户审批后流转至管理员确认。

### 2.6 调整项管理 (Adjustments)

调整项模块管理员工的非固定薪酬项，支持多种类别（bonus、allowance、reimbursement、deduction 等）。Currency 从员工所在国自动填充（只读），Customer 从员工关联自动填充。调整项按 effectiveMonth 归属薪酬批次，遵循与休假相同的截止日期逻辑。Employee Selector 组件支持先选客户再选员工的级联搜索。

### 2.7 报销管理 (Reimbursements)

报销模块从调整项中独立出来，支持员工或客户通过门户提交费用报销申请。报销记录包含金额、币种、描述和收据附件（Alibaba Cloud OSS 存储，支持 PDF/图片/ZIP/Office 文档，最大 20MB）。审批流程为 `submitted → client_approved/client_rejected → admin_confirmed`。

### 2.8 发票管理 (Invoices)

发票模块支持 7 种发票类型：**monthly_eor**（月度 EOR 服务费）、**monthly_visa_eor**（月度 Visa EOR 服务费）、**monthly_aor**（月度 AOR 服务费）、**deposit**（押金）、**visa_service**（签证服务费）、**credit_note**（贷记单）、**deposit_refund**（押金退还）和 **manual**（手动创建）。

月度发票自动从已审批薪酬生成，按 Customer × Country × Service Type × Currency × Service Fee Rate 分组。每张发票最多包含 2 种货币（发票结算货币 + 至多 1 种外币），系统自动获取汇率并加收全局 Markup。行项目包含 20 种类型（EOR Service Fee、Employment Cost、Deposit 等），金额计算为 `(Qty × Rate) × (1 + Tax%)`。

发票状态流转为 `draft → pending_review → sent → paid / overdue → cancelled`。贷记单支持全额/部分冲红，可通过 Apply Credit 机制抵扣至 pending_review 状态的发票。Mark as Paid 时系统自动处理欠付（生成 follow-up invoice）和超付（生成 credit note）。发票 PDF 导出包含 Billing Entity Logo、银行信息、VAT 明细和 Credit Applied 行。

### 2.9 供应商与成本管理 (Vendors & Cost Allocation)

供应商模块管理供应商信息和账单。Vendor Bills 支持 AI 智能解析上传的 PDF/图片（自动识别供应商、金额、行项目，不存在的供应商自动创建）。成本分配（Cost Allocation）将账单行项目分配到具体员工和发票。利润与亏损报告（P&L Report）标注“按服务月份 Accrual Basis”，展示收入、成本和利润趋势。

### 2.10 Sales CRM

Sales CRM 模块管理销售线索（Leads），支持多服务类型多选（EOR、Visa EOR、AOR、PEO、Payroll、Consulting）、目标国家多选、预期成交日期和销售活动记录。

### 2.11 系统设置 (Settings)

Settings 页面整合了汇率管理、用户管理、Billing Entities 和审计日志四个 Tab（仅 Admin 可见）。汇率管理集成 ExchangeRate-API（主，166 种货币）和 Frankfurter/ECB（备，30 种货币），每日自动抓取，支持全局 Markup 百分比配置和手动覆盖。用户管理支持角色分配（多角色组合）、禁用/启用用户和重置密码。

### 2.12 智能助手 (Trae Copilot)

Trae Copilot 是基于 AI Gateway 架构的全局智能助手，通过右下角悬浮球提供随时随地的 AI 支持。核心能力包括：
- **上下文感知**：自动读取当前页面数据（如员工薪资详情、发票状态），用户无需手动复制粘贴即可针对当前内容提问。
- **快捷指令 (Quick Actions)**：根据当前页面上下文推荐常用操作（如在员工列表页推荐“添加新员工”，在发票页推荐“导出 PDF”），一键直达。
- **智能预测**：基于历史薪酬数据预测下月支出，或分析合同到期风险。
- **文件分析**：支持上传简历、合同、发票等文件，AI 自动提取关键信息并回答相关问题。
- **多模型路由**：后台通过 AI Gateway 动态选择最佳大模型（如阿里云通义千问的 qwen-turbo, qwen-max），确保回答质量与成本的最优平衡。

### 2.13 通知中心 (Notification Center)

通知中心提供企业级多渠道消息触达能力，支持 **Email**（带 PDF 附件）和 **In-App**（站内信）双通道。

- **实时提醒**：Admin Portal 顶部铃铛图标实时显示未读消息数，下拉查看最近 20 条通知。
- **自动化触发**：覆盖发票逾期（每日检测）、薪酬批次生成（每月 5 日）、新员工入职、休假审批等关键节点。
- **模板化渲染**：通知内容支持多语言模板，系统根据接收者语言偏好自动发送对应语言的通知。

### 2.14 承包商管理 (Contractor Management)
除了标准 EOR 员工，系统新增了对独立承包商（Contractors）的支持。

- **全生命周期**：包含承包商入职、合同管理、合规文档收集。
- **自动化开票**：每日 01:00 定时任务自动扫描活跃承包商合同，生成待审核发票。
- **独立门户**：承包商可通过 Worker Portal 登录，自助上传发票、查看付款记录。

---

## 3. 三大门户：管理、客户与员工

系统包含三大门户，分别服务于不同用户群体，并通过独立的域名访问：
- **管理门户 (Admin Portal)**: `admin.geahr.com` - 供内部运营、财务、销售团队使用。
- **客户门户 (Client Portal)**: `app.geahr.com` - 供客户 HR 和财务联系人使用。
- **员工门户 (Worker Portal)**: `worker.geahr.com` - 供 EOR 员工和独立承包商使用。

### 3.1 客户门户 (Client Portal)

客户门户采用 Apple Liquid Glass 设计语言（毛玻璃效果、柔和阴影、流体动画），通过独立的 JWT + bcrypt 认证体系和 `protectedPortalProcedure`（每个查询强制注入 `ctx.customerId`）确保数据隔离。

**Dashboard** 展示交互式 KPI 卡片、员工国家分布柱状图、月度薪酬趋势柱状图、员工状态分布环形图、待办事项和近期活动时间线。**员工入职** 支持雇主发起和员工自助填写两种模式，多步骤向导引导完成个人信息、雇佣条款、薪酬和文档上传。**员工管理** 展示客户名下所有员工的状态、合同和文档信息，支持详情页查看。**薪酬查看** 按国家和月份浏览已审批的薪酬明细和员工薪资单（Earnings → Gross Pay → Deductions → Net Pay → Reimbursements → Total Payout）。**发票与财务** 包含发票列表（Active/History Tab）、账户摘要（Outstanding/Paid/Credit Balance）、PDF 下载和 Credit Note 详情。**休假与调整** 客户可为员工提交休假申请和报销单，经客户审批后流转至管理员确认。**合规中心** 提供各国公共假期日历（1,312 条记录）和雇佣合规信息。**设置** 包含休假政策管理、团队管理和公司信息编辑。

### 3.2 员工/承包商门户 (Worker Portal)

新增的 Worker Portal 为被雇佣员工和独立承包商提供自助服务，采用 JWT + bcrypt 实现身份认证和邀请注册制。

- **独立入口**：通过 `worker.geahr.com` 访问，与 Admin/Client Portal 隔离。
- **核心功能**：个人资料管理、合同查看与下载、工资单/发票历史记录与下载、里程碑跟踪、以及提交入职所需文件。
- **入职引导**：通过 Onboarding Wizard 完成合规信息填写和证件上传。

---

## 4. 核心自动化逻辑

系统通过 `server/cronJobs.ts` 注册以下定时任务，减少人工操作和错误。

| 自动化流程 | 执行时间 (北京时间) | 核心逻辑 |
|:---|:---|:---|
| 员工自动激活 | 每日 00:01 | `contract_signed` 且 `startDate ≤ today` → `active`；若日期 ≤ 15 日则加入当月薪酬（Pro-rata），> 15 日则跳过当月 |
| 休假状态同步 | 每日 00:01 | 休假开始日到达 → `on_leave`；休假结束日到达 → `active` |
| 发票逾期检测 | 每日 01:00 | `sent` 且 `dueDate < today` → `overdue` |
| 汇率自动抓取 | 每日 17:00 CET | 从 ExchangeRate-API 获取 USD 基准汇率（166 种货币），Frankfurter 作为备用 |
| 承包商开票 | 每日 01:00 | 扫描活跃承包商合同，自动生成待审核发票 |
| 数据自动锁定 | 每月 5 日 00:00 | 锁定上月已提交的调整项和休假记录（`submitted → locked`） |
| 薪酬批次生成 | 每月 5 日 00:01 | 为有活跃员工的国家自动创建当月薪酬批次草稿，Auto-Fill 聚合已锁定数据 |
| 押金发票生成 | 员工 → `onboarding` | 自动生成押金发票：`(月薪 + 预估雇主成本) × 押金月数` |
| 签证服务费发票 | Visa → `application_submitted` | 自动生成签证服务费发票（费率来自国家配置） |
| 押金退还 | 员工 → `terminated` | 自动生成押金退还贷记单 |
| 夜间自动化测试 | 每日 23:30 | 运行全量端到端测试（销售/入职/薪酬/发票/RBAC），自动重试失败用例并生成 HTML 报告 |
| 测试数据清理 | 每日 00:01 | 清理测试产生的临时数据，确保生产环境纯净 |

---

## 5. 权限控制 (RBAC)

系统实现了细粒度的基于角色的访问控制。`admin` 和 `user` 为互斥角色；`operations_manager`、`finance_manager`、`customer_manager` 可组合分配给同一用户。

| 模块 | Admin | Ops Manager | Finance Manager | Customer Manager |
|:---|:---:|:---:|:---:|:---:|
| Dashboard 全部 Tab | ✅ | 部分 | 部分 | 部分 |
| Employees 增删改查 | ✅ | ✅ | 只读 | 只读 |
| Payroll 审批/编辑 | ✅ | ✅ | 只读 | — |
| Leave / Adjustments | ✅ | ✅ | — | — |
| Reimbursements | ✅ | ✅ | — | — |
| Invoices 生成/编辑 | ✅ | 只读 | ✅ | — |
| Billing Entities | ✅ | — | ✅ | — |
| Vendors / P&L | ✅ | — | ✅ | — |
| Settings 全部 Tab | ✅ | — | — | — |
| Sales CRM | ✅ | — | — | ✅ |
| Audit Logs | ✅ | 只读 | 只读 | 只读 |

---

## 6. 技术栈与数据模型

系统采用前后端分离架构，部署于阿里云马来西亚 (ap-southeast-3) 地域，通过 Docker Compose + Nginx + Certbot SSL 实现自托管部署，完全独立运行。

- **认证体系**: 全面采用 **JWT + bcrypt + HttpOnly Cookie** 方案。管理员认证 (server/_core/adminAuth.ts, server/_core/authRoutes.ts) 使用 HS256 签名的 JWT；客户和员工门户 (server/portal/portalAuth.ts, server/worker/workerAuth.ts) 在此基础上增加了邀请注册流程。初始管理员通过 `ADMIN_BOOTSTRAP_EMAIL` 和 `ADMIN_BOOTSTRAP_PASSWORD` 环境变量引导创建。
- **数据库**: 使用 **SQLite**，通过 `@libsql/client` 客户端和 `drizzle-orm/libsql` 操作。`drizzle.config.ts` 中 `dialect` 配置为 `"sqlite"`。生产环境数据库文件位于 Docker Volume 挂载的 `/app/data/production.db`。
- **文件存储**: 使用 **阿里云 OSS**，通过 `@aws-sdk/client-s3` 实现 S3 兼容 API 调用。相关环境变量包括 `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, `OSS_REGION`, `OSS_BUCKET`, `OSS_ENDPOINT`。
- **核心依赖**: TypeScript, React, tRPC, Drizzle ORM, Zustand, TanStack Table/Query, Shadcn UI, Express.js。

### 6.1 数据模型概览

系统包含 48 张业务表，核心实体关系如下：

| 实体域 | 包含表 | 说明 |
|:---|:---|:---|
| 客户域 | customers, customer_contacts, customer_pricing, customer_contracts, customer_leave_policies | 客户公司信息、联系人、定价、合同和休假政策 |
| 员工域 | employees, contractors, employee_contracts, contractor_contracts, leave_balances, leave_records, adjustments, reimbursements | 员工及承包商全生命周期数据 |
| 薪酬域 | payroll_runs, payroll_items, contractor_invoices | 按国家+月份组织的薪酬批次和行项目 |
| 财务域 | invoices, invoice_items, credit_note_applications, billing_entities, exchange_rates | 发票、贷记单、账单实体和汇率 |
| 供应商域 | vendors, vendor_bills, vendor_bill_items, bill_invoice_allocations | 供应商账单和成本分配 |
| 合规域 | countries_config, leave_types, public_holidays | 126 国配置、假期类型和公共假期 |
| 销售域 | sales_leads, sales_activities | 销售线索和活动记录 |
| AI 域 | ai_provider_configs, ai_task_policies, copilot_chats, copilot_messages | AI 提供商配置、任务路由策略及聊天历史 |
| 通知域 | notifications, notification_templates, user_notification_settings | 通知消息、模板及用户偏好 |
| 系统域 | users, audit_logs, system_config, system_settings | 用户、审计、系统配置 |

完整的字段级数据字典详见 [data-dictionary.md](data-dictionary.md)。

---

## 7. 国际化与多币种

系统内置中英双语支持（i18n），用户可在界面实时切换语言。国际化方案基于 **Zustand-based i18n store** (`client/src/lib/i18n.ts`)，所有页面通过 `useI18n()` hook 和 `t("key")` 模式实现文本渲染。所有状态标签、操作提示、Dashboard 指标和 Help Center 内容均提供双语版本。

多币种处理遵循以下规则：员工薪资以所在国法定货币计价（不可手动选择），发票以客户结算货币计价。每张发票最多包含 2 种货币（结算货币 + 至多 1 种外币），系统自动获取汇率并加收全局 Markup。金额格式化通过 `formatAmount` 集中处理，KRW/VND/IDR 等大数值货币显示 0 位小数，其他货币显示 2 位小数。
