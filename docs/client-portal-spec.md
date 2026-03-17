# Client Portal & Worker Portal — 技术规格

> **版本**: 2.1
> **更新日期**: 2026-03-04

---

## 1. 架构概述

系统包含三个独立的前端门户，共享同一套后端服务和数据库，但各自拥有独立的认证体系、tRPC 实例和 UI 设计。

| 门户 | 域名 | 用途 | 设计语言 |
|:---|:---|:---|:---|
| **Admin Portal** | `admin.extendglobal.ai` | 内部运营管理 | Ant Design |
| **Client Portal** | `app.extendglobal.ai` | 客户自助服务 | Apple Liquid Glass |
| **Worker Portal** | `worker.extendglobal.ai` | 员工/合同工自助服务 | Material Design 3 |

### 1.1 Client Portal (客户门户)

| 维度 | 实现方式 |
|:---|:---|
| tRPC 实例 | `server/portal/portalTrpc.ts` |
| 路由 | `server/portal/routers/` (**12** 个路由文件) |
| 前端 | `client/src/pages/portal/` (**23** 个页面) |
| 数据隔离 | `protectedPortalProcedure` 自动注入 `ctx.customerId` |

### 1.2 Worker Portal (员工门户)

| 维度 | 实现方式 |
|:---|:---|
| tRPC 实例 | `server/worker/workerTrpc.ts` |
| 路由 | `server/worker/routers/` (**7** 个路由文件) |
| 前端 | `client/src/pages/worker/` (**8** 个页面) |
| 数据隔离 | `protectedWorkerProcedure` 自动注入 `ctx.workerId` |

---

## 2. 认证体系 (JWT + bcrypt + HttpOnly Cookie)

系统采用基于 JWT 的统一认证方案，取代了旧的 Manus OAuth。所有密码均通过 `bcrypt` 哈希处理。JWT 存储在 `HttpOnly` Cookie 中以防范 XSS 攻击。

- **Admin Auth**: JWT (HS256) 签名，通过 `jose` 库实现。初始管理员通过 `ADMIN_BOOTSTRAP_EMAIL` 和 `ADMIN_BOOTSTRAP_PASSWORD` 环境变量引导创建。核心文件位于 `server/_core/adminAuth.ts` 和 `server/_core/authRoutes.ts`。
- **Portal Auth**: JWT + 邀请注册流程。核心文件位于 `server/portal/portalAuth.ts`。
- **Worker Auth**: JWT + 邀请注册流程。核心文件位于 `server/worker/workerAuth.ts`。

环境变量 `JWT_SECRET` (内部别名 `cookieSecret`) 用于所有 JWT 签名。

### 2.1 Client Portal 认证流程

门户用户存储在 `customer_contacts` 表中，通过 `hasPortalAccess` 字段控制访问权限。管理员在 Admin 系统中为客户联系人启用门户访问，点击 "Send Invite" 生成邀请链接。客户联系人点击链接后设置密码完成注册。后续通过邮箱 + 密码登录，服务端签发 JWT 存储在 HttpOnly Cookie 中。

### 2.2 Worker Portal 认证流程

员工/合同工用户存储在 `workers` 表中。管理员或客户在相应后台发起邀请，员工点击邀请链接设置密码完成注册。后续通过邮箱 + 密码登录。

---

## 3. 功能模块

### 3.1 Client Portal 功能

| 模块 | 页面文件 | 后端路由 | 功能说明 |
|:---|:---|:---|:---|
| Dashboard | `PortalDashboard.tsx` | `portalDashboardRouter.ts` | KPI 卡片、员工分布图、薪酬趋势、待办事项 |
| Employees | `PortalEmployees.tsx`, `PortalEmployeeDetail.tsx` | `portalEmployeesRouter.ts` | 员工列表、详情、文档查看 |
| Onboarding | `PortalOnboarding.tsx`, `PortalSelfOnboarding.tsx` | `portalEmployeesRouter.ts` | 雇主发起入职、员工自助填写 |
| Payroll | `PortalPayroll.tsx` | `portalPayrollRouter.ts` | 按国家/月份查看已审批薪酬 |
| Invoices | `PortalInvoices.tsx`, `PortalInvoiceDetail.tsx` | `portalInvoicesRouter.ts` | 发票列表、详情、PDF 下载、账户摘要 |
| Leave | `PortalLeave.tsx` | `portalLeaveRouter.ts` | 休假申请、余额查看、审批 |
| Adjustments | `PortalAdjustments.tsx` | `portalAdjustmentsRouter.ts` | 调整项查看 |
| Reimbursements | `PortalReimbursements.tsx` | `portalReimbursementsRouter.ts` | 报销提交、审批、附件上传 |
| Compliance | `PortalCompliance.tsx` | `portalDashboardRouter.ts` | 公共假期日历、合规信息 |
| Settings | `PortalSettings.tsx` | `portalSettingsRouter.ts` | 休假政策、团队管理、公司信息 |
| Help Center | `PortalHelpCenter.tsx` | — | 操作指南、FAQ、术语表 |
| Auth | `PortalLogin.tsx`, `PortalRegister.tsx`, `PortalForgotPassword.tsx`, `PortalResetPassword.tsx` | `portalAuthRouter.ts` | 登录、注册、密码重置 |

### 3.2 Worker Portal 功能

| 模块 | 功能说明 |
|:---|:---|
| Profile | 个人信息与银行账户管理 |
| Contract | 劳动合同与服务协议查看 |
| Payslips/Invoices | 工资单或服务发票下载 |
| Milestones | 项目里程碑与交付物跟踪 |
| Onboarding | 自助入职流程与文档提交 |

---

## 4. 数据流向

| 数据 | Admin 写入 | Portal 读取 | Portal 写入 | Worker 读/写 |
|:---|:---:|:---:|:---:|:---:|
| Employees | ✅ (全量 CRUD) | ✅ | ✅ (入职请求) | ✅ (个人信息) |
| Adjustments | ✅ (锁定/处理) | ✅ | — | — |
| Leave | ✅ (确认) | ✅ | ✅ (提交/客户审批) | ✅ (提交申请) |
| Reimbursements | ✅ (确认) | ✅ | ✅ (提交/客户审批) | ✅ (提交申请) |
| Invoices | ✅ (生成/发送) | ✅ (下载 PDF) | — | ✅ (下载发票) |
| Leave Policies | ✅ (覆盖) | ✅ | ✅ (配置) | ✅ (查看) |
| Portal Users | ✅ (初始邀请) | ✅ | ✅ (管理) | — |
| Worker Users | ✅ (初始邀请) | — | — | ✅ (管理) |

---

## 5. 技术栈与基础设施

系统已从原有的 Manus 平台和 AWS 服务栈迁移至完全独立的自托管架构。

| 分类 | 技术/服务 | 详情 |
|:---|:---|:---|
| **数据库** | **SQLite** | 通过 `@libsql/client` 和 `drizzle-orm/libsql` 访问。生产环境数据库文件位于 Docker Volume (`/app/data/production.db`)。总计 **48 张表**。 |
| **部署** | **Docker Compose** | 部署于 **Alibaba Cloud Malaysia (ap-southeast-3)** 服务器，使用 Nginx 作为反向代理，并通过 Certbot 实现 SSL 证书自动续期。 |
| **文件存储** | **Alibaba Cloud OSS** | S3 兼容 API，通过 `@aws-sdk/client-s3` SDK 进行交互。 |
| **AI 服务** | **Alibaba Cloud DashScope** | 替代 OpenAI/Gemini/Claude。通过 `aiGatewayService.ts` 路由到 `qwen-turbo`、`qwen-max` 等模型。 |
| **国际化 (i18n)** | **Zustand Store** | 状态管理库 Zustand 实现的 i18n store (`client/src/lib/i18n.ts`)，所有页面通过 `useI18n()` hook 和 `t("key")` 函数进行翻译。 |

---

## 6. 核心服务与路由统计

| 类型 | 模块 | 数量 | 备注 |
|:---|:---|:---:|:---|
| **后端路由** | Admin Routers | 31 | `server/admin/routers/` |
| | Portal Routers | 12 | `server/portal/routers/` |
| | Worker Routers | 7 | `server/worker/routers/` |
| **前端页面** | Admin Pages | 25 | `client/src/pages/admin/` |
| | Portal Pages | 23 | `client/src/pages/portal/` |
| | Worker Pages | 8 | `client/src/pages/worker/` |

---

## 7. 环境变量 (.env)

系统不再依赖 `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `BUILT_IN_FORGE_API_URL`, `VITE_APP_ID` 等 Manus 平台相关变量。

**必需环境变量:**

- `DATABASE_URL`: 数据库连接字符串 (e.g., `file:/app/data/production.db`)
- `JWT_SECRET`: JWT 签名密钥
- `ADMIN_BOOTSTRAP_EMAIL`: 初始管理员邮箱
- `ADMIN_BOOTSTRAP_NAME`: 初始管理员姓名
- `ADMIN_BOOTSTRAP_PASSWORD`: 初始管理员密码
- `ADMIN_APP_URL`: Admin 门户 URL
- `PORTAL_APP_URL`: Client 门户 URL
- `WORKER_APP_URL`: Worker 门户 URL
- `OSS_ACCESS_KEY_ID`: 阿里云 OSS Access Key
- `OSS_ACCESS_KEY_SECRET`: 阿里云 OSS Secret Key
- `OSS_REGION`: 阿里云 OSS Region
- `OSS_BUCKET`: 阿里云 OSS Bucket 名称
- `OSS_ENDPOINT`: 阿里云 OSS Endpoint
- `EMAIL_*`: 邮件服务相关配置 (e.g., `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`)
- `DASHSCOPE_API_KEY`: 阿里云通义千问 API Key
