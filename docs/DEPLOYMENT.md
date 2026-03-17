# Extend Global (EG) Admin 部署文档

> **版本**: 2.0
> **更新日期**: 2026-03-04

## 1. 概述

本文档详细说明了 **Extend Global (EG) Admin** 系统如何通过 **Docker Compose + Nginx + Certbot SSL (self-hosted)** 部署在 **Alibaba Cloud Malaysia (ap-southeast-3)** 节点。系统利用独立的容器化技术和自我托管的基础设施，实现了高效、安全、可扩展的部署架构。

## 2. 部署架构

系统采用前后端分离的单体仓库 (Monorepo) 架构，通过 Docker Compose 进行容器化部署。整体架构如下图所示：

```mermaid
graph TD
    subgraph ACM['Alibaba Cloud Malaysia ap-southeast-3']
        subgraph Docker['Docker Compose Environment']
            A['Node.js Runtime'] --> B['Express Server']
            B --> C{'tRPC API Endpoints'}
            B --> D['Static Assets']
            C --> E['JWT + bcrypt + HttpOnly Cookie']
            C --> F['Database']
            C --> G['File Storage']
            C --> H['Notification Service']
        end
    end

    subgraph NET['Internet']
        U['Admin User'] --> A
        CP['Portal User'] --> A
        WP['Worker User'] --> A
        GH['GitHub Repository'] --> CI2['CI/CD (Self-hosted)']
    end

    CI2 --> A
    F --> J['SQLite']
    G --> K['Alibaba Cloud OSS']
    H --> L['Email Gateway']

    classDef selfhosted fill:#f9f,stroke:#333,stroke-width:2px
    class A,B,C,D,E,F,G,H,CI2,J,K,L selfhosted
```

### 2.1 核心组件

| 组件 | 技术实现 | 描述 |
| :--- | :--- | :--- |
| **运行时环境** | Node.js (v22.x) | 在 Docker 容器中运行的标准 Node.js 环境。 |
| **Web 服务器** | Express.js | 运行在 Node.js 环境中，处理所有传入的 HTTP 请求。 |
| **API** | tRPC | 提供类型安全的 API 端点，分为管理后台 (`/api/trpc`)、客户门户 (`/api/portal`) 和员工门户 (`/api/worker`)。 |
| **前端** | React (Vite) | 编译后的静态资源 (HTML, CSS, JS) 由 Express.js 托管。 |
| **数据库** | SQLite | 使用 **@libsql/client** 和 **drizzle-orm/libsql**。生产环境数据库文件位于 `file:/app/data/production.db`。 |
| **文件存储** | Alibaba Cloud OSS | 通过 S3 兼容的 API (`@aws-sdk/client-s3`) 存储用户上传的文件。 |
| **身份认证** | JWT + bcrypt | 管理后台、客户门户和员工门户均使用独立的 JWT 认证机制，通过 HttpOnly Cookie 存储。 |

## 3. CI/CD 流程

部署流程完全自动化，由自托管的 CI/CD 流水线驱动，该流水线在代码推送到指定分支（例如 `main`）时触发。

1.  **触发构建**: 开发者将代码推送到 GitHub 仓库。
2.  **检出代码**: CI/CD 服务器从仓库中检出最新代码。
3.  **安装依赖**: 执行 `pnpm install` 安装所有项目依赖。
4.  **构建项目**: 执行 `pnpm run build` 命令，该命令包含两个步骤：
    *   `vite build`: 将 `client/` 目录下的前端 React 代码编译打包成静态文件，输出到 `dist/public`。
    *   `esbuild`: 将 `server/` 目录下的后端 TypeScript 代码编译打包成单一的 JavaScript 文件，输出到 `dist/index.js`。
5.  **构建 Docker 镜像**: 使用项目根目录的 `Dockerfile` 构建新的 Docker 镜像。
6.  **部署应用**: 在目标服务器上执行 `docker-compose up -d --build`，使用新构建的镜像重新创建并启动服务。

## 4. 环境变量配置

系统通过 `.env` 文件进行配置，这些变量在 `docker-compose.yml` 中被加载到容器环境中。

| 环境变量 | 来源 | 用途 |
| :--- | :--- | :--- |
| `PORT` | `.env` | 指定 Express 服务器监听的端口。 |
| `DATABASE_URL` | `.env` | SQLite 数据库的文件路径。 |
| `JWT_SECRET` | `.env` (Secrets) | 用于签署所有 JWT 的密钥 (内部别名为 `cookieSecret`)。 |
| `ADMIN_BOOTSTRAP_EMAIL` | `.env` (Secrets) | 用于首次启动时创建初始管理员账号的邮箱。 |
| `ADMIN_BOOTSTRAP_PASSWORD`| `.env` (Secrets) | 初始管理员的密码。 |
| `ADMIN_BOOTSTRAP_NAME`| `.env` | 初始管理员的姓名。 |
| `ADMIN_APP_URL` | `.env` | 管理后台的公开访问 URL (admin.extendglobal.ai)。 |
| `PORTAL_APP_URL` | `.env` | 客户门户的公开访问 URL (app.extendglobal.ai)。 |
| `WORKER_APP_URL` | `.env` | 员工门户的公开访问 URL (worker.extendglobal.ai)。 |
| `OSS_ACCESS_KEY_ID` | `.env` (Secrets) | 阿里云 OSS 访问密钥 ID。 |
| `OSS_ACCESS_KEY_SECRET` | `.env` (Secrets) | 阿里云 OSS 访问密钥 Secret。 |
| `OSS_REGION` | `.env` | 阿里云 OSS 的区域 (e.g., ap-southeast-3)。 |
| `OSS_BUCKET` | `.env` | 阿里云 OSS 的存储桶名称。 |
| `OSS_ENDPOINT` | `.env` | 阿里云 OSS 的访问端点。 |
| `EMAIL_*` | `.env` (Secrets) | 用于发送邮件的 SMTP 服务配置。 |
| `DASHSCOPE_API_KEY` | `.env` (Secrets) | 访问阿里云通义千问大模型的 API 密钥。 |

## 5. 核心服务集成

系统集成了多项核心服务，以实现完整的功能。

### 5.1 身份认证 (Authentication)

系统包含三套独立的认证机制，均基于 **JWT + bcrypt + HttpOnly Cookie** 模型：

*   **管理后台**: 认证逻辑位于 `server/_core/adminAuth.ts` 和 `server/_core/authRoutes.ts`。初始管理员通过 `ADMIN_BOOTSTRAP_EMAIL` 和 `ADMIN_BOOTSTRAP_PASSWORD` 环境变量在系统首次启动时创建。会话通过 HS256 签名的 JWT 维护，存储在 HttpOnly Cookie 中。

*   **客户门户**: 采用 **JWT + bcrypt + 邀请注册**模式，后端逻辑位于 `server/portal/portalAuth.ts`。用户密码使用 `bcrypt` 哈希存储，会话通过独立的 JWT (`portal_session` Cookie) 进行管理。

*   **员工门户**: 同样采用 **JWT + bcrypt + 邀请注册**模式，后端逻辑位于 `server/worker/workerAuth.ts`。员工通过邀请链接完成注册，会话通过独立的 JWT (`worker_session` Cookie) 进行管理。

### 5.2 数据库 (Database)

项目使用 **Drizzle ORM** 与 **SQLite** 数据库进行交互，通过 `@libsql/client` 驱动连接。`drizzle.config.ts` 中配置的 `dialect` 为 `"sqlite"`。生产环境中，数据库文件通过 Docker Volume 持久化在 `file:/app/data/production.db`。Drizzle Kit 用于管理数据库模式的迁移。

### 5.3 文件存储 (File Storage)

所有文件（如员工合同、报销凭证、公司 Logo）都存储在 **Alibaba Cloud OSS** 中。应用通过 `@aws-sdk/client-s3` 包提供的 S3 兼容 API 与 OSS 进行交互。相关的凭证和配置（`OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, `OSS_REGION`, `OSS_BUCKET`, `OSS_ENDPOINT`）通过环境变量提供。

### 5.4 定时任务 (Cron Jobs)

系统包含多个关键的后台定时任务，定义在 `server/cronJobs.ts` 中，使用 `node-cron` 库进行调度。所有任务均以**亚洲/上海**时区 (`Asia/Shanghai`) 为基准执行。

| 任务 | Cron 表达式 | 执行时间 (北京时间) | 描述 |
| :--- | :--- | :--- | :--- |
| 员工自动激活 | `0 1 0 * * *` | 每日 00:01 | 将合同已签署且入职日期已到的员工状态从未激活更新为“活跃”。 |
| 假期状态转换 | `0 2 0 * * *` | 每日 00:02 | 根据假期记录自动将员工状态在“活跃”和“休假中”之间转换。 |
| 发票逾期检测 | `0 3 0 * * *` | 每日 00:03 | 将已发送但超过付款期限的发票状态更新为“逾期”。 |
| 汇率自动获取 | `0 5 0 * * *` | 每日 00:05 | 从 `ExchangeRate-API` 或 `Frankfurter API` 获取最新汇率并存入数据库。 |
| 月度数据锁定 | `0 0 0 5 * *` | 每月 5 日 00:00 | 自动锁定上一个月的异动薪酬和假期记录，使其不可再修改。 |
| 薪酬批次创建 | `0 1 0 5 * *` | 每月 5 日 00:01 | 为所有有活跃员工的国家自动创建当月的薪酬批次草稿。 |

## 6. 监控与日志

*   **应用日志**: 所有 `console.log` 和 `console.error` 的输出都会被 Docker 捕获，可通过 `docker-compose logs` 查看。
*   **访问日志**: Nginx 作为反向代理，记录所有传入的 HTTP 请求日志。
*   **审计日志**: 应用层面，所有关键的写操作（如创建客户、更新发票状态）都会在 `audit_logs` 数据表中创建一条记录，详细追踪了操作人、时间、IP 地址和变更内容。
*   **前端调试**: 在开发环境中，通过自定义的 Vite 插件 (`vitePluginManusDebugCollector`)，浏览器端的控制台日志和网络请求会被发送到后端并写入本地 `.manus-logs` 目录，便于调试。

## 7. 三大门户

系统提供三个独立的前端门户，服务于不同角色的用户：

*   **管理后台 (Admin Portal)**: `admin.extendglobal.ai` - 供内部运营团队使用，管理客户、员工、合同、薪酬、发票等核心业务数据。
*   **客户门户 (Client Portal)**: `app.extendglobal.ai` - 供客户公司的 HR 或管理员使用，用于员工入职、管理团队、查看发票和报告等自服务功能。
*   **员工门户 (Worker Portal)**: `worker.extendglobal.ai` - 供签约的员工或承包商使用，提供个人资料管理、合同查看、薪资单/发票下载、工时与里程碑跟踪、以及入职流程引导等功能。

## 8. Channel Partner (CP) 白标子域名部署

### 8.1 DNS 配置
在阿里云 DNS 控制台为 `extendglobal.ai` 添加以下记录：

| 记录类型 | 主机记录 | 记录值 | 说明 |
| :--- | :--- | :--- | :--- |
| A | admin | 服务器 IP | 管理后台 |
| A | app | 服务器 IP | 客户门户 |
| A | worker | 服务器 IP | 员工门户 |
| A | * | 服务器 IP | CP 白标通配符（所有 CP 子域名） |

### 8.2 SSL 证书
- **方案 A（推荐）**：申请通配符证书 `*.extendglobal.ai`，支持所有 CP 子域名
  - 需要 DNS TXT 记录验证
  - 运行 `enable-ssl.sh` 选择选项 2
- **方案 B（简易）**：仅为固定子域名申请证书
  - HTTP 验证，全自动
  - CP 子域名需要单独申请证书或使用 HTTP
  - 运行 `enable-ssl.sh` 选择选项 1

### 8.3 CP 子域名路由逻辑
1. 用户访问 `acme.extendglobal.ai`
2. Nginx 通配符 `*.extendglobal.ai` server 块捕获请求
3. 前端 SPA 通过 `isCpDomain()` 检测到 CP 子域名 `acme`
4. 前端调用 `GET /api/branding/acme` 获取 CP 品牌信息（Logo、主色调、公司名）
5. 根据 URL 路径渲染对应门户：
   - `acme.extendglobal.ai/portal` → ACME 的客户门户（白标）
   - `acme.extendglobal.ai/worker` → ACME 的员工门户（白标）
   - `acme.extendglobal.ai/` → 默认重定向到客户门户

### 8.4 四方资金流转
系统支持完整的 B2B2B 四方资金流转：
1. **Client → CP**：客户支付 Layer 2 发票（CP 品牌）
2. **CP → EG**：CP 钱包自动扣款 Layer 1 发票金额
3. **EG → Vendor**：EG 支付供应商账单
4. **差额 = CP 利润**：Layer 2 - Layer 1 = CP 服务费收入

### 8.5 财务引擎
- **双层发票引擎**：Layer 1（EG→CP）+ Layer 2（CP→Client）
- **双币种对账**：Invoice ↔ Vendor Bill 自动匹配
- **汇差剥离**：分离 pass-through 成本与 FX markup 收入
- **净额法 P&L**：多维度（按 CP、客户、国家、币种、月份）分析
