# GEA EOR SaaS Admin

**Global Employment Advisors (GEA)** 是一套企业级 Employer of Record (EOR) 全球雇佣管理系统，支持从客户签约、员工入职、多国薪酬处理到发票结算的端到端数字化解决方案。
系统采用 **TypeScript 全栈架构**，支持中英双语，覆盖 126 个国家和地区。

> **管理后台**: [admin.extendglobal.ai](https://admin.extendglobal.ai)
> **客户门户**: [app.extendglobal.ai](https://app.extendglobal.ai)
> **员工门户**: [worker.extendglobal.ai](https://worker.extendglobal.ai)

---

## 📂 文档导航 (Documentation Map)

本项目采用 **三层文档治理架构**，请根据您的角色阅读相应文档。

### 🟢 第一层：业务与合规 (For Business Stakeholders)
*适用于产品经理、业务分析师、合规专员*
*   **[核心业务逻辑 (Core Business Logic)](docs/01_business/CORE_BUSINESS_LOGIC.md)**: 全局业务大图，实体关系，核心流程。**必读**。
*   **[资金与合规 V2 (Finance Spec V2)](docs/01_business/FINANCE_COMPLIANCE_SPEC_V2.md)**: 全新的双钱包系统、AOR 聚合支付、押金释放与发票合规流程。
*   **[劳动者分类规则 (Worker Classification)](docs/01_business/WORKER_CLASSIFICATION_RULES.md)**: EOR vs AOR 的合规边界与校验规则。

### 🔵 第二层：技术架构 (For Engineers)
*适用于开发工程师、架构师、QA*
*   **[技术架构 (Technical Architecture)](docs/02_technical/TECHNICAL_ARCHITECTURE.md)**: 技术栈、目录结构、代码规范、部署架构。
*   **[数据库指南 (Database Guide)](docs/02_technical/DATABASE_SCHEMA_GUIDE.md)**: Schema 设计、迁移流程、关键表结构。
*   **[测试策略 (Testing Strategy)](docs/02_technical/TESTING_STRATEGY.md)**: 单元测试、E2E 测试、CI/CD 流程。

### 🟣 第三层：AI 协作 (For AI Agents)
*适用于 AI 辅助编程、自动化脚本*
*   **[AI Agent 指南 (AGENTS.md)](AGENTS.md)**: AI 协作的上下文、规则与红线。

---

## 🚀 快速开始 (Quick Start)

### 环境要求
*   Node.js 18+ (推荐 22.x LTS)
*   pnpm 9.x
*   SQLite (无需安装服务，使用 LibSQL 客户端)

### 安装与启动
```bash
# 1. 克隆仓库
git clone https://github.com/ziqingding-max/geaplatform_trae.git
cd geaplatform_trae

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env

# 4. 数据库迁移
pnpm db:push

# 5. 启动开发服务器 (前后端)
pnpm dev
```

---

## 🛠️ 技术栈概览

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | React 19, Vite, Tailwind v4, Shadcn/UI | SPA 架构，响应式设计 |
| **后端** | Node.js, Express, tRPC | 类型安全的 API 层 |
| **数据库** | SQLite (LibSQL), Drizzle ORM | 轻量高效，Schema-First |
| **测试** | Vitest, Custom E2E Scripts | 全链路质量保证 |
| **AI** | 阿里云 DashScope | 智能路由与任务处理 |

---

## ⚖️ 许可证
本项目为 **GEA (Global Employment Advisors)** 专有软件。
未经授权不得复制、分发或修改。
