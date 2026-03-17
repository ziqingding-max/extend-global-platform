# EOR SaaS Admin — 数据字典 (Data Object Dictionary)

> **版本**: v1.1 | **更新日期**: 2026-03-04 | **数据库**: SQLite | **ORM**: Drizzle ORM with @libsql/client

本文档定义了系统中所有数据表的结构、字段含义、枚举值域以及表间关系。

---

## 1. 总览

系统共包含 **48 张表**，按业务域分为 11 个模块：

| 模块 | 表名 | 说明 |
|------|------|------|
| 认证与授权 | `users`, `invites` | 系统用户、邀请码 |
| 国家配置 | `countries_config`, `system_config`, `leave_types` | 国家法规、全局设置、假期类型 |
| 客户管理 | `customers`, `customer_contacts`, `customer_pricing`, `customer_contracts`, `customer_leave_policies` | 客户主数据及关联配置 |
| 员工管理 | `employees`, `employee_contracts`, `employee_documents` | 员工档案、合同、文件 |
| 假期管理 | `leave_balances`, `leave_records` | 假期余额与请假记录 |
| 异动薪酬 | `adjustments` | 奖金、津贴、报销、扣款 |
| 薪酬发放 | `payroll_runs`, `payroll_items` | 月度薪酬批次与明细 |
| 发票管理 | `invoices`, `invoice_items` | 客户账单与行项目 |
| 系统管理 | `exchange_rates`, `audit_logs`, `system_settings` | 汇率、审计日志、系统设置 |
| 账单主体 | `billing_entities` | 开票法律实体 |
| Worker 门户 | `worker_profiles`, `worker_onboarding_tasks` | Worker 个人资料与入职任务 |

---

## 2. 架构与部署

- **部署架构**: Docker Compose + Nginx + Certbot SSL (self-hosted)
- **云服务商**: Alibaba Cloud Malaysia (ap-southeast-3)
- **文件存储**: Alibaba Cloud OSS (S3-compatible API via `@aws-sdk/client-s3`)
- **三端访问**:
  - **Admin Portal**: `admin.extendglobal.ai` - 内部运营管理
  - **Client Portal**: `app.extendglobal.ai` - 客户自助服务
  - **Worker Portal**: `worker.extendglobal.ai` - 雇员/合同工自助服务
- **AI 服务**: Alibaba Cloud DashScope (e.g., qwen-turbo, qwen-max)
- **i18n**: Zustand-based i18n store at `client/src/lib/i18n.ts`

---

## 3. 认证机制

- **Admin Auth**: JWT (HS256) signed via `jose` library, stored in HttpOnly cookie. (server/_core/adminAuth.ts, server/_core/authRoutes.ts)
- **Portal Auth**: JWT + bcrypt + Invite Registration. (server/portal/portalAuth.ts)
- **Worker Auth**: JWT + bcrypt + Invite Registration. (server/worker/workerAuth.ts)
- **关键环境变量**: `JWT_SECRET`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`

---

## 4. 详细表定义

### 4.1 `users` — 系统用户

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PK | — | 主键 |
| email | TEXT | UNIQUE | NULL | 邮箱 |
| passwordHash | TEXT | 否 | NULL | Bcrypt 哈希密码 (用于非 SSO 登录) |
| name | TEXT | 否 | NULL | 用户显示名 |
| role | TEXT | 是 | `user` | 角色：`admin`, `customer_manager`, `operations_manager`, `finance_manager`, `user` |
| language | TEXT | 是 | `en` | 界面语言偏好 |
| isActive | INTEGER | 是 | 1 | 是否启用 (1=true, 0=false) |
| createdAt | INTEGER | 是 | CURRENT_TIMESTAMP | 创建时间 |
| updatedAt | INTEGER | 是 | CURRENT_TIMESTAMP | 更新时间（自动） |
| lastSignedIn | INTEGER | 否 | NULL | 最后登录时间 |

**索引**: `email_idx(email)`, `role_idx(role)`

---

### 4.2 `countries_config` — 国家配置

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PK | — | 主键 |
| countryCode | TEXT | UNIQUE | — | ISO 3166-1 alpha-2 国家代码 |
| countryName | TEXT | 是 | — | 国家名称 |
| localCurrency | TEXT | 是 | — | ISO 4217 法定货币代码 |
| payrollCycle | TEXT | 是 | `monthly` | 发薪周期：`monthly`, `semi_monthly` |
| probationPeriodDays | INTEGER | 否 | 90 | 试用期天数 |
| noticePeriodDays | INTEGER | 否 | 30 | 通知期天数 |
| workingDaysPerWeek | INTEGER | 否 | 5 | 每周工作天数 |
| statutoryAnnualLeave | INTEGER | 否 | 14 | 法定年假天数 |
| standardEorRate | REAL | 否 | NULL | EOR 标准服务费（/人/月） |
| standardVisaEorRate | REAL | 否 | NULL | Visa EOR 标准服务费 |
| standardAorRate | REAL | 否 | NULL | AOR 标准服务费 |
| visaEorSetupFee | REAL | 否 | NULL | Visa EOR 一次性设置费 |
| standardRateCurrency | TEXT | 否 | `USD` | 标准费率货币 |
| vatApplicable | INTEGER | 是 | 0 | 是否适用 VAT (1=true, 0=false) |
| vatRate | REAL | 否 | `0` | VAT 税率（百分比，如 9.00 = 9%） |
| isActive | INTEGER | 是 | 0 | 是否激活（有服务费 = 激活） |
| notes | TEXT | 否 | NULL | 备注 |
| createdAt | INTEGER | 是 | CURRENT_TIMESTAMP | — |
| updatedAt | INTEGER | 是 | CURRENT_TIMESTAMP | — |

**索引**: `country_code_idx(countryCode)` UNIQUE

**业务规则**: 当 `standardEorRate`、`standardVisaEorRate`、`standardAorRate` 中任一非空时，`isActive` 自动设为 true。

---

### 4.3 `customer_contracts` — 客户合同

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PK | — | 主键 |
| customerId | INTEGER | 是 | — | FK → `customers.id` |
| contractName | TEXT | 是 | — | 合同名称 |
| contractType | TEXT | 否 | NULL | 合同类型 |
| fileUrl | TEXT | 否 | NULL | OSS 文件 URL |
| fileKey | TEXT | 否 | NULL | OSS 文件 Key |
| signedDate | INTEGER | 否 | NULL | 签署日期 (Unix Timestamp) |
| effectiveDate | INTEGER | 否 | NULL | 生效日期 (Unix Timestamp) |
| expiryDate | INTEGER | 否 | NULL | 到期日期 (Unix Timestamp) |
| status | TEXT | 是 | `draft` | 状态：`draft`, `signed`, `expired`, `terminated` |
| createdAt | INTEGER | 是 | CURRENT_TIMESTAMP | — |
| updatedAt | INTEGER | 是 | CURRENT_TIMESTAMP | — |

---

### 4.4 Worker Portal: `worker.extendglobal.ai`

Worker Portal 是为雇员和合同工设计的自助服务平台，提供以下核心功能：
- **个人资料管理**: 查看和更新个人信息。
- **合同查看**: 随时访问和查看雇佣合同。
- **薪资单/发票下载**: 下载历史薪资单或服务发票。
- **里程碑跟踪**: (针对合同工) 跟踪项目里程碑和交付物。
- **入职流程**: 完成和跟踪入职任务清单。

---

## 5. 枚举值域汇总

| 枚举名称 | 值域 |
|----------|------|
| 用户角色 | `admin`, `customer_manager`, `operations_manager`, `finance_manager`, `user` |
| 员工状态 | `pending_review`, `onboarding`, `contract_signed`, `active`, `on_leave`, `offboarding`, `terminated` |
| 服务类型 | `eor`, `visa_eor`, `aor` |
| 雇佣类型 | `fixed_term`, `long_term` |
| 签证状态 | `not_required`, `pending_application`, `application_submitted`, `approved`, `rejected`, `expired` |
| 客户状态 | `active`, `suspended`, `terminated` |
| 定价类型 | `global_discount`, `country_specific` |
| 合同状态 | `draft`, `signed`, `expired`, `terminated` |
| 异动类型 | `bonus`, `allowance`, `reimbursement`, `deduction`, `other` |
| 异动/假期状态 | `submitted`, `locked` |
| 薪酬批次状态 | `draft`, `pending_approval`, `approved`, `rejected` |
| 发票类型 | `deposit`, `monthly`, `one_time`, `deposit_refund`, `credit_note` |
| 发票状态 | `draft`, `pending_review`, `sent`, `paid`, `overdue`, `cancelled`, `void` |
| 发票行项目类型 | `employment_cost`, `service_fee`, `bonus`, `allowance`, `reimbursement`, `deduction`, `deposit`, `deposit_refund`, `credit`, `vat`, `other` |
| 文件类型 | `resume`, `passport`, `national_id`, `work_permit`, `visa`, `contract`, `education`, `other` |
| 假期过期规则 | `year_end`, `anniversary`, `no_expiry` |
| 账单周期 | `monthly`, `quarterly`, `annual` |
| 发薪周期 | `monthly`, `semi_monthly` |

---

## 6. 环境变量参考

| 变量名 | 示例值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `file:/app/data/production.db` | **[必需]** SQLite 数据库文件路径 |
| `JWT_SECRET` | `a-very-secret-and-long-string` | **[必需]** JWT 签名密钥 |
| `ADMIN_BOOTSTRAP_EMAIL` | `admin@example.com` | **[必需]** 初始管理员邮箱 |
| `ADMIN_BOOTSTRAP_NAME` | `Admin User` | **[必需]** 初始管理员姓名 |
| `ADMIN_BOOTSTRAP_PASSWORD` | `securePassword123` | **[必需]** 初始管理员密码 |
| `ADMIN_APP_URL` | `https://admin.extendglobal.ai` | **[必需]** Admin 门户 URL |
| `PORTAL_APP_URL` | `https://app.extendglobal.ai` | **[必需]** Client 门户 URL |
| `WORKER_APP_URL` | `https://worker.extendglobal.ai` | **[必需]** Worker 门户 URL |
| `OSS_ACCESS_KEY_ID` | `your-access-key` | **[必需]** 阿里云 OSS Access Key |
| `OSS_ACCESS_KEY_SECRET` | `your-secret-key` | **[必需]** 阿里云 OSS Secret Key |
| `OSS_REGION` | `ap-southeast-3` | **[必需]** 阿里云 OSS Region |
| `OSS_BUCKET` | `geahr-prod-bucket` | **[必需]** 阿里云 OSS Bucket 名称 |
| `OSS_ENDPOINT` | `oss-ap-southeast-3.aliyuncs.com` | **[必需]** 阿里云 OSS Endpoint |
| `EMAIL_HOST` | `smtp.aliyun.com` | **[必需]** 邮件服务器地址 |
| `EMAIL_PORT` | `465` | **[必需]** 邮件服务器端口 |
| `EMAIL_USER` | `noreply@extendglobal.ai` | **[必需]** 邮件发送用户名 |
| `EMAIL_PASS` | `your-email-password` | **[必需]** 邮件发送密码 |
| `DASHSCOPE_API_KEY` | `sk-xxxxxxxxxxxx` | **[必需]** 阿里云通义千问 API Key |
