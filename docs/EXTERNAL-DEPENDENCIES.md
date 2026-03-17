# GEA EOR SaaS — 外部依赖与系统级 API 清单

> **版本**: v1.0 | **更新日期**: 2026-02-28
>
> 本文档列出系统运行所依赖的全部外部 API、平台服务和数据源。
> 在将系统改版为其他公司系统时，必须逐项确认每个依赖是否已正确配置。

---

## 一、依赖总览

| 序号 | 依赖名称 | 类型 | 是否需要 API Key | 用途 | 关键程度 |
|------|----------|------|-----------------|------|----------|
| 1 | ExchangeRate-API | 外部免费 API | 否 | 汇率自动抓取（主源） | **关键** |
| 2 | Frankfurter API (ECB) | 外部免费 API | 否 | 汇率抓取（备用源） | 中等 |
| 3 | Alibaba Cloud DashScope | 外部 API | 是 | 供应商发票 PDF 智能解析 | 中等 |
| 4 | Alibaba Cloud OSS | 外部云服务 | 是 | 文件上传存储（发票、收据、文档） | **关键** |
| 5 | 邮件通知服务 (SMTP) | 外部云服务 | 是 | 系统通知（逾期发票、异常告警） | 中等 |
| 6 | 用户认证 | 内部实现 | 否 | 后台、门户用户认证 | **关键** |
| 7 | CJK 字体 CDN | 静态资源 | 否 | 发票 PDF 中文字符渲染 | 低 |
| 8 | Nager.Date API | 外部免费 API | 否 | 公共假期数据（schema 预留，**尚未实现自动抓取**） | 待实现 |

---

## 二、详细说明

### 1. 汇率自动抓取服务

这是系统中**最核心的外部 API 依赖**，直接影响发票金额计算。

**实现文件**: `server/services/exchangeRateFetchService.ts`

**双源容灾架构**:

| 属性 | 主源: ExchangeRate-API | 备用源: Frankfurter API |
|------|----------------------|----------------------|
| URL | `https://open.er-api.com/v6/latest/{BASE}` | `https://api.frankfurter.dev/v1/latest?from={BASE}&to={CURRENCIES}` |
| 覆盖范围 | 166 种货币 | 30 种货币（ECB 参考汇率） |
| API Key | 不需要 | 不需要 |
| 更新频率 | 每日 | 每日（ECB 16:00 CET 发布） |
| 超时设置 | 15 秒 | 10 秒 |

**调用方式**:
- **自动**: Cron Job 每日 00:05 北京时间执行 `fetchAndStoreExchangeRates()`
- **手动**: Admin 通过 `exchangeRates.triggerFetch` tRPC mutation 触发
- **实时查询**: `exchangeRates.liveRate` 端点直接调用 ExchangeRate-API 获取实时汇率（不存储）

**业务逻辑**:
- 所有汇率以 **USD → XXX** 方向存储
- 自动应用全局 markup（默认 2%），可在系统设置中调整
- 主源失败自动降级到备用源
- 汇率存入 `exchange_rates` 表，含 `rawRate`（原始汇率）和 `rate`（含 markup 汇率）

**改版注意**: 如果新系统的基础货币不是 USD，需要修改 `exchangeRateFetchService.ts` 中的 base currency 逻辑。

---

### 2. AI 服务 (Alibaba Cloud DashScope)

**实现文件**: `server/_core/aiGatewayService.ts`, `server/routers/pdfParsing.ts`

**用途**: 供应商发票 PDF 智能解析，使用 AI 从上传的 PDF/图片中提取结构化数据。

**调用场景**:
- `pdfParsing.parseVendorInvoices` — 多文件批量解析，交叉验证供应商账单
- `pdfParsing.parseVendorInvoice` — 单文件快速解析

**工作流程**:
1. 前端上传文件到 Alibaba Cloud OSS
2. 将文件 URL 和系统上下文（员工列表、客户列表、现有发票）通过 AI Gateway 发送给 DashScope 模型 (e.g., qwen-turbo, qwen-max)
3. LLM 返回结构化 JSON（供应商名称、发票号、行项目、金额等）
4. 前端展示解析结果，用户确认后创建 Vendor Bill

**依赖配置**: 通过 `DASHSCOPE_API_KEY` 环境变量配置，由 `aiGatewayService.ts` 统一路由。

**改版注意**: 系统已解耦 AI 服务提供商。如需更换为其他 LLM（如 OpenAI, Gemini），只需在 `aiGatewayService.ts` 中添加新的 provider 即可。

---

### 3. 文件存储 (Alibaba Cloud OSS)
**实现文件**: `server/storage.ts`

**使用场景**（共 10+ 个上传点）:

| 模块 | 文件类型 | 存储路径模式 |
|------|----------|-------------|
| 客户管理 | 合同、文档 | `customers/{customerId}/documents/` |
| 员工管理 | 护照、合同、证件 | `employees/{employeeId}/documents/` |
| 薪酬调整 | 收据凭证 | `adjustments/{adjustmentId}/receipts/` |
| 报销管理 | 报销凭证 | `reimbursements/{reimbursementId}/receipts/` |
| 账单实体 | 公司 Logo | `billing-entities/{entityId}/logo/` |
| 供应商发票 | PDF 原件 | `vendor-bills/uploads/` |
| 客户门户 | 员工文档、调整凭证、报销凭证 | 同上（通过 Portal 路由） |

**依赖配置**: 使用 S3 兼容 API (`@aws-sdk/client-s3`) 连接。需配置环境变量 `OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`OSS_REGION`、`OSS_BUCKET`、`OSS_ENDPOINT`。

**改版注意**: 该模块已配置为兼容 S3 的 API，可轻松切换到 AWS S3 或其他兼容服务。

---

### 4. 通知服务

**实现文件**: `server/_core/notification.ts`

**触发场景**:

| 触发点 | 文件位置 | 通知内容 |
|--------|----------|----------|
| 逾期发票检测 | `server/cronJobs.ts:592` | 每日扫描发现逾期发票时通知 Owner |
| 发票状态变更 | `server/routers/invoices.ts:573,606` | 发票被标记为已支付或已取消时通知 |
| 贷记单创建 | `server/routers/invoices.ts:1004` | 创建贷记单时通知 |

**改版注意**: 系统默认实现是邮件通知。需要配置 SMTP 服务相关的环境变量 (`EMAIL_*`)。可以替换为企业微信/Slack Webhook 等其他通知方式。

---

### 5. 用户认证 (JWT + bcrypt + HttpOnly Cookie)

**实现文件**: `server/_core/adminAuth.ts`, `server/_core/authRoutes.ts`, `server/portal/portalAuth.ts`, `server/worker/workerAuth.ts`

**认证架构**:

| 门户 | 域名 | 认证方式 | 说明 |
|------|----------|----------|------|
| Admin Portal | admin.geahr.com | JWT + bcrypt | JWT (HS256) 存储在 HttpOnly Cookie 中。初始管理员通过环境变量引导创建。 |
| Client Portal | app.geahr.com | JWT + bcrypt + 邀请注册 | 客户通过管理员生成的邀请链接注册，使用密码 + JWT 认证。 |
| Worker Portal | worker.geahr.com | JWT + bcrypt + 邀请注册 | 员工/合同工通过邀请链接注册，进行身份验证和自助服务。 |

**关键环境变量**:
- `JWT_SECRET` — 用于签发 JWT 和 Session Cookie 的密钥 (内部别名 `cookieSecret`)
- `ADMIN_BOOTSTRAP_EMAIL` — 初始管理员邮箱
- `ADMIN_BOOTSTRAP_PASSWORD` — 初始管理员密码

**改版注意**: 整个认证系统完全独立，不依赖任何第三方 OAuth 服务。

---

### 6. CJK 字体 CDN

**实现文件**: `server/services/invoicePdfService.ts`

**URL**: `https://files.manuscdn.com/user_upload_by_module/session_file/310519663378930055/BicAsHhoridCdJUF.ttf`

**用途**: 发票 PDF 生成时，如果发票内容包含中文/日文/韩文字符，需要下载 Noto Sans SC 字体。首次下载后缓存到 `.font-cache/` 目录。

**改版注意**: 这个 URL 是一个公共 CDN 上的字体文件。为保证稳定性，建议将字体文件上传到自己的 CDN 或 OSS，并更新 `CJK_FONT_URL` 常量。

---

### 7. 公共假期数据（Nager.Date API — 待实现）

**当前状态**: 数据库 schema 已创建（`public_holidays` 表），`source` 字段默认值为 `nager_api`，但**自动抓取功能尚未实现**。

**现有实现**:
- 数据库表 `public_holidays` 已有 97 条记录（手动或通过 SQL 导入）
- `server/db.ts` 提供了 CRUD 函数（`listPublicHolidays`、`createPublicHoliday`、`deletePublicHolidaysByCountryYear`）
- 客户门户 `PortalCompliance.tsx` 有假期日历展示 UI
- **缺失**: 没有从 Nager.Date API 自动抓取的 Service 或 Cron Job

**推荐实现方案**:

```
API: https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}
方法: GET
无需 API Key
返回: [{ date, localName, name, countryCode, fixed, global, types }]
```

建议创建 `server/services/holidayFetchService.ts`，参考 `exchangeRateFetchService.ts` 的双源容灾模式，并添加 Cron Job 每年 1 月 1 日自动抓取当年所有运营国家的假期数据。

---

## 三、定时任务（Cron Jobs）清单


所有定时任务定义在 `server/cronJobs.ts`，时区统一为 `Asia/Shanghai`（北京时间）。

| 执行时间 | 任务名称 | 函数 | 说明 |
|----------|----------|------|------|
| 每日 00:01 | 员工自动激活 | `runEmployeeAutoActivation()` | 将到达入职日期的 pending 员工自动转为 active |
| 每日 00:02 | 假期状态转换 | `runLeaveStatusTransition()` | 自动将员工状态在 active ↔ on_leave 之间切换 |
| 每日 00:03 | 逾期发票检测 | `runOverdueInvoiceDetection()` | 扫描已过 due_date 的未付发票，标记为 overdue 并通知 |
| 每日 00:05 | 汇率自动抓取 | `fetchAndStoreExchangeRates()` | 从 ExchangeRate-API / Frankfurter 抓取最新汇率 |
| 每月 1 日 00:10 | 假期余额累计 | `runMonthlyLeaveAccrual()` | 为新员工按 pro-rata 计算并累计年假余额 |
| 每月 5 日 00:00 | 数据自动锁定 | `runAutoLock()` | 锁定上月已提交的薪酬调整和假期数据 |
| 每月 5 日 00:01 | 薪酬单自动创建 | `runAutoCreatePayrollRuns()` | 基于锁定数据自动创建当月薪酬单 |

**改版注意**: 这些 Cron Job 使用 `node-cron` 库，在服务器进程内运行。系统采用 Docker Compose 部署，服务是常驻进程，此方案可行。如果未来部署到无状态环境（如 Serverless），需要迁移到外部调度服务（如 AWS EventBridge）。

---

## 四、Seed 数据与初始化

### 默认管理员账户

**实现文件**: `server/seedAdmin.ts`

服务器首次启动时，会根据环境变量自动创建默认管理员：

| 环境变量 | 示例值 |
|------|-----|
| `ADMIN_BOOTSTRAP_EMAIL` | `admin@example.com` |
| `ADMIN_BOOTSTRAP_PASSWORD` | `a_strong_password` |
| `ADMIN_BOOTSTRAP_NAME` | `Admin User` |

**改版注意**: 首次部署时**必须设置**这些环境变量，否则无法登录后台。

### 国家配置数据

`countries_config` 表存储各国的劳动法参数（试用期、通知期、法定年假、EOR 费率等）。这些数据通过 Admin 后台的 "Countries" 页面手动管理，没有自动 seed 脚本。

**改版注意**: 新系统需要手动配置运营国家数据，或编写 seed 脚本批量导入。

---

## 五、改版检查清单

将系统部署或交付给客户时，按以下顺序逐项确认：

| 序号 | 检查项 | 文件位置/环境变量 | 操作 |
|------|--------|----------|------|
| 1 | 配置初始管理员 | `ADMIN_BOOTSTRAP_*` | 设置邮箱、密码、姓名环境变量 |
| 2 | 确认汇率 API 可用 | `server/services/exchangeRateFetchService.ts` | 验证 ExchangeRate-API 和 Frankfurter 在部署区域可访问 |
| 3 | 配置 OSS 存储 | `OSS_*` | 配置 OSS/S3 的 Access Key, Secret, Region, Bucket, Endpoint |
| 4 | 配置 AI 服务 | `DASHSCOPE_API_KEY` | 配置阿里云 DashScope API Key |
| 5 | 配置通知服务 | `EMAIL_*` | 配置 SMTP 服务器信息用于发送邮件通知 |
| 6 | 配置认证密钥 | `JWT_SECRET` | 设置一个长且随机的字符串作为 JWT 密钥 |
| 7 | 替换 CJK 字体 URL | `server/services/invoicePdfService.ts` | (可选) 将字体上传到自己的 CDN/OSS 以提高稳定性 |
| 8 | 导入国家配置 | Admin 后台 → Countries | 手动配置或编写 seed 脚本 |
| 9 | 导入公共假期 | 数据库 `public_holidays` 表 | 手动导入或实现 Nager API 自动抓取 |
| 10 | 验证 Cron Jobs | `server/cronJobs.ts` | 确认时区设置和执行频率符合业务需求 |
| 11 | 更新品牌信息 | `shared/const.ts`、i18n、Logo | 替换公司名称、Logo、邮件模板 |
