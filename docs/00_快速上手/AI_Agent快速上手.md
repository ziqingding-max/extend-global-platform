# AI Agent 快速上手指南 (System Prompt for AI Agents)

欢迎！如果你是一个自主 AI Agent（如 Manus、Devin、Cursor 或 GitHub Copilot），正在接手或协助开发 Extend Global (EG) 平台，**请在执行任何代码修改前，完整读取并遵循本文档的指令。**

本指南旨在为你提供系统的全局上下文，并设定不可逾越的代码修改红线。

## 1. 核心系统架构与上下文

Extend Global 是一个基于 **B2B2B 模式的全球名义雇主 (EOR) 平台**。
* **核心技术栈**: TypeScript, React 18, Vite, Node.js, tRPC, Drizzle ORM, SQLite.
* **Monorepo 结构**:
  * `/client`: 前端代码，包含 Admin, App (CP/Client), Worker 三个门户。
  * `/server`: 后端代码，包含路由 (`routers/`) 和业务逻辑 (`services/`)。
  * `/drizzle`: 数据库 Schema 和迁移文件。
* **核心业务逻辑**:
  * **四方角色**: EG (平台方) -> CP (渠道方) -> Client (终端客户) -> Worker (员工)。
  * **双层发票**: 系统必须同时生成面向 CP 的底价账单 (Layer 1) 和面向 Client 的对客账单 (Layer 2)。
  * **白标机制 (White-label)**: 前端界面必须根据访问的子域名动态加载 CP 的品牌信息（Logo、颜色），**绝对禁止在前端硬编码 "Extend Global"**。

## 2. 代码修改硬性约束 (Red Lines)

作为 AI Agent，你的能力很强，但也容易引入难以察觉的漏洞。在修改代码时，你**必须**遵守以下红线：

### 2.1 数据库与 Drizzle ORM
* **禁止直接写 SQL**: 所有数据库交互必须通过 Drizzle ORM 进行强类型查询。
* **修改 Schema 的流程**: 如果你需要修改数据库结构，必须先修改 `drizzle/schema.ts`，然后使用 shell 工具执行 `pnpm run db:generate` 生成迁移文件，**绝对不能直接修改现有的 SQLite 文件或历史迁移文件**。
* **精度问题**: 所有的金额计算（如 `amount`, `balance`）必须考虑精度丢失问题。尽量在服务层完成计算后再存入数据库，不要在 SQL 查询中直接做复杂的浮点数运算。

### 2.2 资金与事务 (Fund Flow & Transactions)
* **强制事务**: 任何涉及 `channelPartnerWallets` (钱包余额)、`walletTransactions` (资金流水) 或 `invoices` 状态变更的操作，**必须**包裹在 `db.transaction(async (tx) => { ... })` 中。
* **悲观锁**: 在扣减钱包余额前，必须使用 `FOR UPDATE` 锁定钱包记录，防止高并发导致的余额透支。

### 2.3 权限与越权防御 (RBAC & IDOR)
* **禁止信任前端参数**: 在后端的 tRPC 路由层，如果接口接收一个 `customerId` 或 `employeeId`，你**不能**直接拿它去查询数据库。
* **强制上下文校验**: 你必须从 `ctx.user` 中提取当前登录用户的 `role`、`channelPartnerId` 或 `customerId`，并将其作为 `WHERE` 条件的一部分，强制进行数据隔离。
  * *示例*: `where: and(eq(customers.id, input.id), eq(customers.channelPartnerId, ctx.user.channelPartnerId))`

### 2.4 tRPC 与前后端通信
* **禁止使用 fetch/axios**: 前端调用后端接口**必须**使用 `trpc.react` Hook（如 `trpc.invoices.list.useQuery()`）。
* **类型同步**: 如果你修改了后端的 Router 返回值或输入参数 (Zod Schema)，前端的 TypeScript 编译器会自动报错。你必须同时修复前端的调用代码，确保类型完全匹配。

## 3. 推荐的 Agent 工作流

当用户向你下达一个需求时，请遵循以下步骤：

1. **信息收集 (Gather Context)**:
   * 使用 `match` (grep) 工具搜索相关的 tRPC Router 或 Service。
   * 查看 `drizzle/schema.ts` 了解相关表结构。
   * 如果涉及业务流程，阅读 `docs/02_业务流程/` 下的相关文档。
2. **制定计划 (Plan)**:
   * 向用户输出你的修改计划，明确指出你需要修改哪些后端路由、哪些前端组件、是否需要修改数据库。
   * **等待用户确认后再开始写代码。**
3. **执行与测试 (Execute & Test)**:
   * 修改代码后，如果项目在运行中，注意查看控制台的 TypeScript 编译错误。
   * 确保新加的 API 接口包含正确的权限中间件（如 `cpAdminProcedure`）。
4. **交付 (Deliver)**:
   * 总结你修改的内容，特别说明你是如何处理数据隔离和事务的。

## 4. 关键文件索引指引

如果你迷失了方向，请从以下文件开始搜索：
* 所有的数据库表结构：`drizzle/schema.ts`
* 所有的 API 入口：`server/routers/_core/routers.ts`
* 发票生成核心逻辑：`server/services/dualLayerInvoiceService.ts`
* 资金扣款核心逻辑：`server/services/fundFlowEngine.ts`
* 前端白标解析逻辑：`client/src/hooks/useCpBranding.ts`

**请记住：在 Extend Global 平台中，安全性与准确性永远高于功能的丰富度。宁可抛出错误阻断操作，也绝不能算错一分钱。**
