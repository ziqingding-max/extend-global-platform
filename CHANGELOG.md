# Changelog

本文件记录 GEA EOR SaaS Admin 系统的所有重要版本变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

---

## [3.9.0] — 2026-03-06

### Added

- **Dual-Wallet Architecture (Finance V2)**: 全新的双钱包架构，实现资金合规隔离。
    - **Operating Wallet**: `customer_wallets` 用于日常发票支付与余额扣款。
    - **Frozen Wallet**: `customer_frozen_wallets` 专门用于管理押金 (Security Deposit)，与运营资金物理隔离。
- **AOR Aggregation**: 承包商发票 (AP) 审批后自动聚合为客户月度发票 (AR)，支持 `clientInvoiceId` 溯源。
- **Partial Payment**: 发票支付逻辑重构，支持 "钱包余额 + 外部汇款" 组合支付，新增 `partially_paid` 状态。
- **Deposit Release Workflow**: 严格的押金释放流程：员工离职 -> 释放至 Credit Note (Draft) -> 财务审批 -> 进入主钱包或退款至银行。
- **Verification Script**: 新增 `scripts/verify-finance-workflow.ts`，用于验证从签约、开票、支付到押金释放的全链路资金流转。

### Changed

- **Credit Note Logic**: 贷记单 (Credit Note) 批准后直接充值到钱包余额 (Voucher Mode)，不再直接抵扣发票，确保资金流水的复式记账合规性。
- **Invoice State Machine**: 允许 Draft 状态发票的安全删除（无关联时）；新增 `partially_paid` 状态流转。

---

## [3.8.0] — 2026-03-06

### Added

- **Sales CRM Enhancements**: 全面的销售 CRM 流程控制与功能增强。
    - **Quotations Search**: 报价单列表页新增搜索功能，支持按报价单号模糊搜索。
    - **CRM Restrictions (Pipeline Control)**: 实施严格的销售漏斗状态流转限制。
        - **Pipeline Order**: 强制遵循 `Discovery` -> `Leads` -> `Quotation Sent` -> `MSA Sent` -> `MSA Signed` 顺序，禁止跳步。
        - **Quotation Sent Prerequisite**: Lead 转 `Quotation Sent` 必须关联已发送/已接受的报价单。
        - **MSA Signed Prerequisite**: Lead 转 `MSA Signed` 必须关联已接受的报价单且已上传 MSA 合同文件。
    - **Sales Documents**: Lead 详情页新增文档管理模块，支持上传 Contract (MSA)、Proposal 等文件。
    - **Automatic File Sync**: Lead 转 Customer 时，自动将 MSA 合同文件同步至新客户的 Contracts 模块。

### Fixed

- **PDF Download Fix (Production)**: 修复生产环境（阿里云 OSS）下 PDF 下载链接在浏览器中打开空白的问题，改为后端代理下载并返回 Base64 数据流触发下载。
- **Quotation Logic Fixes**:
    - **Employer Cost Calculation**: 修复中国地区 Employer Cost 计算为 0 的问题（默认选中上海地区规则）。
    - **Currency & Totals**: 统一 Quotation 列表页 Total Monthly 显示为 USD；修复创建页中服务费与本地薪资币种混合导致的计算错误（统一转 USD 结算）。
    - **Status Management**: 恢复 Quotations 状态手动调整功能（Draft -> Sent -> Accepted/Rejected），并增加确认弹窗防止误操作。
    - **Draft Editing**: 允许对 Draft 状态的报价单进行二次编辑。

---

## [3.7.0] — 2026-03-05

### Added

- **Bank Details Form (Standardization)**: 新增 `BankDetailsForm` 通用组件，统一员工和供应商的银行信息录入，支持 JSON 动态字段。
- **Frozen Wallet UI (Security Deposit)**: Customer 钱包页面新增 "Security Deposit" 分栏，支持查看押金余额、手动调整（收取/退还）及释放押金至运营余额。
- **Credit Note Creation UI**: Invoice 页面新增 "Create Credit Note" 按钮，支持针对 Paid 发票创建全额或部分退款的贷记单。
- **Pricing Traceability**: Customer Pricing 列表新增 "Source" 列，显示关联的 Quotation 编号并支持跳转，实现价格溯源。
- **Backend API (Wallet)**: `walletRouter` 新增 `getFrozen`, `manualFrozenAdjustment`, `releaseFrozen` 接口。

### Fixed

- **Component Import Fix**: 修正 `Employees.tsx` 和 `Vendors.tsx` 中 `BankDetailsForm` 的引用方式（默认导入 -> 命名导入），解决生产构建失败问题。

---

## [3.6.0] — 2026-03-05

### Changed

- **认证架构迁移 (Admin)**：Admin Portal 认证从 Manus OAuth 迁移至 **JWT + bcrypt + HttpOnly Cookie**（HS256 via `jose`），与 Portal/Worker 统一认证架构。新增 `server/_core/adminAuth.ts` 和 `server/_core/authRoutes.ts`，移除 Manus OAuth 依赖。
- **数据库迁移**：从 MySQL/TiDB Serverless 迁移至 **SQLite (libsql)**，使用 `@libsql/client` + `drizzle-orm/libsql`，Drizzle config dialect 改为 `"sqlite"`。
- **部署架构迁移**：从 AWS Singapore 迁移至**阿里云马来西亚 (ap-southeast-3)**，采用 Docker Compose + Nginx + Certbot SSL 自托管方案。
- **文件存储迁移**：从 AWS S3 迁移至**阿里云 OSS**（S3-compatible API via `@aws-sdk/client-s3`）。
- **AI 服务迁移**：LLM 调用从 OpenAI 迁移至**阿里云 DashScope**（qwen-turbo/qwen-max 等模型），通过 AI Gateway 统一路由。
- **i18n 架构统一**：全系统国际化统一收敛至 `client/src/lib/i18n.ts`（Zustand-based store），所有页面通过 `useI18n()` + `t("key")` 获取翻译，移除所有硬编码文案。
- **数据库表扩展**：从 33 张表扩展至 **48 张表**，新增 AI 配置（`aiProviderConfigs`、`aiTaskPolicies`、`aiTaskExecutions`）、知识库（`knowledgeItems`、`knowledgeSources` 等）、钱包（`customerWallets`、`walletTransactions`）、通知（`notifications`）等。

### Fixed

- **i18n.ts 重复 key 修复**：移除英文和中文翻译中 29 个重复的 key 定义。
- **组件导入修复**：修复 `DatePicker`（Employees.tsx/Customers.tsx 默认导入 → 命名导入）、`PortalLayout`（PortalWallet.tsx 命名导入 → 默认导入）的导入方式不匹配。
- **walletService.ts 路径修复**：修正 `../db/connection` → `./db/connection`、`../../../drizzle/schema` → `../../drizzle/schema`。
- **Payroll 详情页崩溃修复**：添加缺失的 `payrollStatusLabels` 常量定义，修复 `ReferenceError` 导致的页面崩溃。
- **Payroll 后端签名修复**：修正 `listPayrollRuns`、`getSubmittedAdjustmentsForPayroll`、`lockSubmittedAdjustments`、`getSubmittedUnpaidLeaveForPayroll`、`lockSubmittedLeaveRecords` 共 5 个函数签名与路由调用不匹配的问题。
- **Invoice 创建修复**：修正 `invoiceMonth`/`dueDate` 传入 `Date` 对象到 `text` 类型列的问题，涉及 `invoices.ts`（router）、`invoiceGenerationService.ts`、`depositInvoiceService.ts`、`depositRefundService.ts`、`visaServiceInvoiceService.ts`、`creditNoteService.ts` 共 6 个文件。
- **Invoice 列表修复**：修正 `listInvoices` 函数签名（`page, pageSize, search` → `filters, limit, offset`）和不存在的 schema 字段引用（`issueDate`/`totalAmount`/`type`）。
- **Invoice 创建表单增强**：前端 Invoices.tsx 补全 Invoice Type、Month、Currency、Billing Entity、Due Date、Notes 等缺失字段。

### Documentation

- **全量纲领性文档更新**：基于代码审计结果，更新 README.md、AGENTS.md、CHANGELOG.md 及 docs/ 目录下全部 14 个文档，修正认证架构、数据库类型、部署方案、表数量、路由数量等过时信息。

---

## [3.5.0] — 2026-03-04

### Added

- **Notification Center (Enterprise)**: 全渠道通知中心，支持 Email（带 PDF 附件）和 In-App 站内信。覆盖发票逾期、薪酬生成、员工入职等关键业务节点。
- **Worker Portal (Beta)**: 新增员工/承包商自助门户 `/worker/login`，支持个人资料管理、合同查看、工资单/发票下载。
- **Contractor Management**: 完整的承包商全生命周期管理，支持自动化合同扫描与每日开票（Daily 01:00）。
- **Country Guide Toolkit**: 126 国合规指南 PDF 在线查看与下载。
- **Cost Simulator**: 门户端雇佣成本估算器，帮助客户快速计算 Total Employment Cost。

### Changed

- **Cron Job 增强**: 新增每日 01:00 承包商发票生成任务；优化发票逾期检测与通知触发逻辑。
- **UI/UX**: 顶部导航栏新增通知铃铛图标；Settings 页面新增通知偏好设置。

---

## [3.4.0] — 2026-03-03

### Added

- **Trae Copilot Integration**：全新发布智能助手，提供全局悬浮入口，支持上下文感知的 AI 对话与操作建议。
- **Smart Assistant UI**：悬浮球交互设计，支持聊天、预测分析、文件上传和快捷指令。
- **Context Awareness**：自动检测当前页面上下文（如 Employee Detail, Invoice List），提供相关建议。
- **AI Routing Infrastructure**：基于 `aiGatewayService` 的任务路由中心，支持多 Provider 策略与故障回退。
- **Documentation**：完整的 Copilot 技术方案文档 (`docs/copilot-*.md`) 及架构更新。

---

## [3.3.1] — 2026-03-03

### Changed

- **Version3 文案标准落地（Admin + Client Portal）**：统一优化 AI Settings / Knowledge Review / Portal Knowledge Base 关键文案，聚焦"可理解、少歧义、动作可预期"。
- **AI Settings 命名重构**：`AI Provider Settings` 调整为 `AI Task Routing Center`，并将 `Providers`、`Task Policies` 等改为更明确的"路由/端点"语义。
- **知识模块表达优化**：明确营销按钮为"仅预览不发送"，并优化内容缺口、采集流程等管理术语，降低误解成本。

---

## [3.3.0] — 2026-03-02

### Added

- **Knowledge Base + AI Gateway（Admin/Portal）**：新增 Portal Knowledge Base 页面与路由，新增 Admin KnowledgeBaseAdmin / AISettings 页面与管理能力；支持来源抓取、AI 归纳草稿、来源权威性评估、人工审核发布。
- **AI Provider / Task Policy 运行时配置**：新增 `ai_provider_configs` 与 `ai_task_policies` 数据模型，支持任务级主备 Provider 路由与回退策略。
- **安全基线增强**：服务端增加 Helmet 安全响应头；Admin 登录增加 `express-rate-limit`；Portal 登录限流器补充窗口清理机制以避免长期内存增长。

### Changed

- **AI 调用路径解耦**：Vendor Bill 解析等调用切换为 `executeTaskLLM` 任务网关路径，统一 Provider 选择逻辑。
- **i18n 持续治理（分批推进）**：完成 `AISettings`、`AuditLogs`、`AdminLogin`、`AdminInvite`、`NotFound` 以及 `VendorBills`（AI 上传/审核主流程）的硬编码文案替换。
- **运营文档同步**：补充/更新 i18n 审计与统一评审文档，明确"全量 i18n 页面化替换"作为持续波次推进项。

### Fixed

- **生产引导账号风险收敛**：`seedDefaultAdmin` 在生产环境要求显式 `ADMIN_BOOTSTRAP_PASSWORD`，不再依赖硬编码默认密码。

---

## [3.2.0] — 2026-02-28

### Fixed

- **分页状态持久化**：修复 Customers、Employees、Invoices 三个列表页面在进入详情页后返回时丢失当前页码的问题。根本原因是组件挂载时筛选重置 `useEffect` 覆盖了 URL 同步的页码，通过 `useRef` 跳过首次挂载的筛选重置解决。

### Changed

- **项目文档全面重写**：README.md 重写为专业的项目概览文档，新增 CHANGELOG.md 版本日志，更新 docs/PRODUCT.md 产品文档，清理过时的临时文档。

---

## [3.1.0] — 2026-02-28

### Added
- **管理员一键访问客户门户**：Admin 可通过一键按钮生成临时 JWT，以客户身份登录 Client Portal 进行调试和支持。
- **发票分页**：Invoice 列表页新增分页控件（Active 和 History 标签页各自独立分页，每页 20 条）。
- **全局筛选页码重置**：所有列表页在筛选条件变更时自动重置到第 1 页。
- **详情页返回保留页码**：从列表进入详情页时通过 URL `?page=N` 参数传递当前页码，返回时恢复。

### Fixed

- **Invoice 详情页崩溃**：修复 Hooks 排序违规导致的 "Rendered more hooks than during the previous render" 错误。
- **VAT 设置更新**：仅越南和泰国设置 VAT Applicable = true，其余国家均设为 false。

---

## [3.0.0] — 2026-02-27

### Added

- **客户与员工分页**：Customers 和 Employees 列表页新增分页控件（每页 20 条，Previous/Next 导航）。
- **国家服务费批量配置**：一键为 126 个国家设置分层服务费（Tier 1: EOR $249, Visa EOR $599; Tier 2: EOR $449, Visa EOR $699; 全部: AOR $249, Visa 一次性 $5,000）并激活所有国家。
- **美国和波多黎各假期类型**：新增 7 种标准假期类型（年假 7 天，其余 0 天）。
- **员工创建自动初始化休假额度**：创建员工时自动从所在国家的假期类型初始化 Leave Balance。

---

## [2.9.0] — 2026-02-27

### Added

- **押金退还功能**：已付款的 Deposit Invoice 现在支持 "Convert to Refund" 操作，生成 Deposit Refund 发票。
- **种子数据迁移**：从 GitHub 拉取 `seed-migration-data.json`，导入 31 个客户、21 个员工、23 个押金发票等真实业务数据。

### Fixed

- **汇率精度**：修复高汇率货币（IDR/IRR/LAK/VND）的 decimal 精度不足问题。

---

## [2.8.0] — 2026-02-27

### Added

- **子域名路由**：支持 `admin.geahr.com`（管理后台）和 `app.geahr.com`（客户门户）子域名访问，同时保留 `/portal/*` 路径回退。
- **管理员重置用户密码**：Settings > User Management 新增重置密码功能（生成临时密码）。

### Changed

- **生产数据清理**：清理所有测试数据，遵循 hotfix-governance 规范。

---

## [2.7.0] — 2026-02-26

### Added

- **会计逻辑改进**：Revenue 查询排除 credit_note 类型；Dashboard Finance 标注 "按收款日期 (Cash Basis)"；P&L Report 标注 "按服务月份 (Accrual Basis)"。
- **供应商账单类型**：新增 `billType` 字段（operational/deposit/deposit_refund），AI 上传自动检测类型。
- **成本分配规则**：Deposit 类型账单仅允许分配到 Deposit 发票；已抵扣贷记单的 Deposit 禁止分配。

### Changed

- **UI 优化 7 项**：P&L 链接移至 Dashboard Finance Tab；Vendor Bill 审批按钮；上传对话框文件名溢出修复；成本分配员工下拉修复；Billing Entities 和 Audit Logs 移入 Settings 页面。

---

## [2.6.0] — 2026-02-25

### Added

- **Portal Apple Liquid Glass 设计语言**：全部 13 个门户页面和 4 个认证页面重写为 Liquid Glass 风格（毛玻璃效果、柔和阴影、流体动画）。
- **全局状态标签规范化**：所有 Admin 和 Portal 页面的状态标签统一使用 `statusLabels` 对象映射，修复 `.replace("_", " ")` 缺少全局标志的问题。
- **Admin Invoice CSV 导出**：Invoice 列表页新增 Export CSV 按钮。
- **全球员工分布图重写**：替换失败的 GeoJSON 地图为水平柱状图 + 国家卡片，消除 CORS 依赖。

### Fixed

- **External Notes 锁定逻辑**：改为白名单模式（仅 draft/pending_review 允许编辑），后端验证防止非法更新。

---

## [2.5.0] — 2026-02-24
### Added

- **Portal UX Overhaul Batch 4**：Payroll/Adjustment/Leave History 页面；Reimbursement 从 Adjustments 拆分为独立模块。
- **审批工作流**：Leave 和 Reimbursement 新增客户审批流程（submitted → client_approved/client_rejected → admin_confirmed）。
- **Portal Help Center**：完整的帮助中心（操作指南、FAQ、术语表、更新日志）。
- **Admin 重置客户密码**：管理员可为客户门户用户重置密码。
- **Portal 主要联系人保护**：客户无法自行修改主要联系人信息（只读 + 提示信息）。

---

## [2.4.0] — 2026-02-23

### Added

- **财务会计规则 (Round 52)**：Deposit 退还和贷记单互斥；仅允许全额贷记单用于 Deposit；贷记单累计限额不超过发票总额；`sent` 状态贷记单才可抵扣；`pending_review` 发票才可接收抵扣。
- **发票 PDF 贷记单显示**：PDF 中 Subtotal 和 Total 之间新增 "Less: Credit Applied" 行。
- **Mark as Paid 调整**：使用调整后的 Amount Due（总额减去已抵扣贷记）进行付款比较。

### Fixed

- **Deposit 生命周期**：通过关系检查（deposit_refund/credit_note 存在性）判断 Deposit 有效状态，而非状态字段。
- **Invoice 小计/总计计算**：修复未应用汇率的 bug（本地货币金额直接显示为结算货币）。

---

## [2.3.0] — 2026-02-22

### Added

- **贷记单抵扣机制**：新增 `credit_note_applications` 表，支持将贷记单余额抵扣至待审核发票，自动追踪 `remainingBalance`。
- **MonthPicker 全局统一**：所有日期/月份输入替换为统一的 DatePicker 和 MonthPicker 组件。
- **Invoice 汇率自动获取修复**：添加/更新行项目时自动获取汇率并同步到发票级别。

---

## [2.2.0] — 2026-02-21

### Added

- **Portal UX Overhaul Batch 2**：Invoice 逻辑全面重写（Balance Due 计算、Related Documents 双向链接、Credit Note 详情页、Deposit 关联交易）；Payroll 优化（国旗显示、多国支持、薪资单详情页）；Onboarding 重设计（Liquid Glass 风格、统一入口）。
- **Portal UX Overhaul Batch 3**：Compliance Hub（公共假期日历 + 合规信息）；中英双语切换（i18n）；Company Information 增强。

---

## [2.1.0] — 2026-02-20

### Added

- **Client Portal 完整实现 (Round 39–41)**：Portal 独立 JWT 认证、9 个后端路由、18 个前端页面。包含 Dashboard（世界地图 + KPI）、员工管理、薪酬查看、发票下载、休假/调整提交、设置管理。
- **Portal 邀请流程 (Round 40)**：Admin 生成邀请链接 → 客户注册 → 登录门户。
- **Portal 密码重置 (Round 41)**：忘记密码 → 重置令牌 → 新密码设置。

---

## [2.0.0] — 2026-02-18

### Added

- **Dashboard 重建 (Round 48)**：5 个 Tab（Overview, Operations, Finance, HR & Leave, Activity Log），交互式图表，角色控制可见性。
- **Help Center**：8 个模块操作指南、12 条 FAQ、12 条术语表，中英双语。
- **页面过渡动画**：fadeInUp 动画 + PageSkeleton 加载骨架屏。
- **Audit Logs 用户名显示**：LEFT JOIN users 表，回填 1,904 条历史记录。

### Changed

- **i18n 完善**：Dashboard（30+ 键）、AuditLogs、BillingEntities、ExchangeRates、UserManagement 页面全部完成中文翻译。

---

## [1.9.0] — 2026-02-17

### Added

- **Payroll 截止日期逻辑 (Round 44)**：共享截止日期工具（每月 4 日 23:59 北京时间）；跨月休假自动拆分；角色覆盖（admin/ops_manager 可绕过截止限制）。
- **业务逻辑修复 8 项 (Round 45)**：跨月休假拆分为多条记录；Invoice 生成/重生成重复警告；Cron 薪酬月份修正；客户联系人自动同步；员工重复休假检测；DatePicker/MonthPicker 组件。

---

## [1.8.0] — 2026-02-16
### Added

- **Invoice PDF 预览**：Draft/Pending Review 状态支持浏览器内预览。
- **Invoice 单条重生成**：Draft 状态发票支持独立重新生成。
- **Invoice 可编辑字段**：Draft 状态下可修改 Billing Entity、Customer、Currency、Due Date、Notes。

### Fixed

- **PDF 布局修复**：Header 左右列独立 Y 轴追踪，Logo 不再破坏 Entity 信息布局。
- **Service Fee 不含 VAT**：Service Fee 类型行项目 VAT Rate 强制为 0。
- **Subtotal 计算修正**：subtotal = 雇佣成本，serviceFeeTotal 独立，total = subtotal + serviceFeeTotal + taxTotal。

---

## [1.7.0] — 2026-02-15

### Added

- **Invoice 重大重构 (Round 28)**：7 种发票类型 + 20 种行项目类型；月度发票按 Customer × Employee Type × Currency × Service Fee Rate 拆分；Visa Service Invoice 自动生成。
- **Payment Terms**：Customer 级别 Payment Terms（Net 7/15/30）；不同发票类型的 Due Date 计算规则。
- **Invoice 多币种规则**：每张发票最多 2 种货币；自动获取汇率并加收 Markup。

---

## [1.6.0] — 2026-02-14

### Added

- **Pre-Launch 准备 (Round 35)**：ExchangeRate-API 集成（166 种货币）；Settings 页面整合（汇率 + 用户管理）；RBAC 全面执行；日期/金额/国家格式统一审计。
- **GEA 品牌更新**：Logo、配色（#005430, #2E6E50, #E1BA2E）、Favicon、系统标题。
- **Pre-Launch 最终打磨 (Round 36)**：业务验证规则；UI 间距修复；Invoice 生成逻辑修正（VAT 按行项目、按国家分组）；审计日志自然语言描述；汇率方向统一为 USD→XXX。

---

## [1.5.0] — 2026-02-13

### Added

- **Finance Phase 3 (Round 23)**：Deposit Refund Invoice（员工终止时自动生成）；Credit Note（全额/部分冲红）；Invoice 批量操作（发送、标记已付）；Invoice 删除规则。
- **Finance Phase 2 (Round 22)**：Deposit Invoice 自动生成；Billing Entity 增强（Logo、IBAN）；Invoice PDF 导出；Invoice 编号自增序列。
- **Finance Phase 1 (Round 19)**：Customer ↔ Billing Entity 关联；Countries VAT 配置；Invoice 生成优化（审批检查、服务费计算、VAT）；Invoice Draft 编辑。

---

## [1.4.0] — 2026-02-11

### Added

- **Unpaid Leave Deduction 重构 (Round 17)**：Leave 模块移除扣款字段，Payroll 模块计算并允许编辑。
- **Leave Balance 重构 (Round 16)**：移除手动编辑 used；添加假期过期时间；Leave 状态简化为 submitted/locked。
- **Payroll 状态简化**：draft → pending_approval → approved → rejected（移除 paid/processed）。
- **Active/History Tab**：Payroll、Leave、Adjustments 页面新增 Active/History 切换。

---

## [1.3.0] — 2026-02-09

### Added

- **Adjustments & Leave 重构 (Round 13)**：移除审批工作流；截止日期锁定逻辑；Currency/Customer 自动填充；Adjustments → Payroll 数据流；Leave → Payroll 数据流。
- **Employee Selector 组件**：可复用的级联选择器（先选客户，再选员工，支持搜索）。
- **大额货币支持**：KRW/VND/IDR 等大数值货币的输入和显示优化。
- **报销附件上传**：S3 存储，支持 PDF/图片/ZIP/Office 文档（最大 20MB）。
- **On Leave 状态自动转换**：Cron 每日检查休假开始/结束，自动切换员工状态。

---

## [1.2.0] — 2026-02-07

### Added

- **Payroll by Country 架构重构 (Round 11)**：薪酬以国家为维度（非客户）；员工货币锁定为所在国法定货币；Invoice 按客户聚合多国薪酬。
- **Countries Preset (Round 12)**：125 国预置数据（法定货币、薪酬周期、年假、试用期等）；全局薪酬配置（截止日期、发薪日）。
- **Semi-Auto Payroll**：每月 5 日自动创建薪酬批次；自动填充活跃员工；Pro-rata 计算。
- **Employee contract_signed 状态**：新增合同签署状态，到达 startDate 自动激活。

---

## [1.1.0] — 2026-02-05

### Added

- **核心业务模块**：Customers（客户管理）、Employees（员工管理）、Payroll（薪酬处理）、Invoices（发票管理）、Leave（休假管理）、Adjustments（调整项管理）、Countries（国家配置）、Billing Entities（账单实体）、Exchange Rates（汇率管理）。
- **Dashboard**：核心 KPI 卡片、员工状态分布、近期活动。
- **RBAC**：admin、operations_manager、finance_manager、customer_manager 四种角色。
- **Audit Logs**：全操作审计日志。

---

## [1.0.0] — 2026-02-03

### Added

- 项目初始化，基于 React 19 + TypeScript + Vite + Tailwind CSS 4 前端。
- Express + tRPC + Drizzle ORM 后端。
- SQLite (libsql) 数据库。
- JWT + bcrypt 认证。
