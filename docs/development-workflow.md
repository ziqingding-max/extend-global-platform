> **版本**: 2.0
> **更新日期**: 2026-02-28

---

## 1. 技术架构

系统采用 TypeScript 全栈单体仓库 (Monorepo) 架构，前后端共享类型定义，通过 tRPC 实现端到端类型安全。

| 层级 | 技术选型 | 关键文件 |
|:---|:---|:---|
| 前端 | React 19 + Vite + Tailwind CSS 4 + Shadcn/UI | `client/src/` |
| API | tRPC 11 + SuperJSON | `server/routers/`, `server/portal/routers/`, `server/worker/routers/` |
| 后端 | Node.js 22 + Express 4 | `server/_core/` |
| ORM | Drizzle ORM | `drizzle/schema.ts`, `server/db.ts` |
| 数据库 | SQLite | `drizzle/migrations/` |
| 测试 | Vitest | `server/*.test.ts` |

---

## 2. 添加新功能的标准流程

每个功能的开发遵循以下五步循环，确保类型安全和代码一致性。

**第一步：Schema 定义。** 在 `drizzle/schema.ts` 中定义或修改表结构，在 `drizzle/relations.ts` 中更新关系定义，然后运行 `pnpm db:push` 执行迁移。

**第二步：数据库查询层。** 在 `server/db.ts` 中添加查询函数。对于复杂业务逻辑（如发票生成、汇率计算），在 `server/services/` 中创建独立的 Service 文件。

**第三步：tRPC Procedure。** 在 `server/routers/` 中创建或扩展路由文件，选择 `publicProcedure`（无需认证）或 `protectedProcedure`（需要登录）。使用 Zod 定义输入校验，通过 `ctx.user.role` 进行权限检查。客户门户功能在 `server/portal/routers/` 中创建，使用 `protectedPortalProcedure`（自动注入 `ctx.customerId`）。员工门户功能则在 `server/worker/routers/` 中创建，使用 `protectedWorkerProcedure`。

**第四步：前端 UI。** 在 `client/src/pages/` 中创建页面组件，通过 `trpc.*.useQuery / useMutation` 调用后端。使用 Shadcn/UI 组件保持一致性，并通过 `useI18n` 钩子和 `t('key')` 模式实现国际化。在 `client/src/App.tsx` 中注册路由。

**第五步：测试。** 在 `server/*.test.ts` 中编写 Vitest 测试用例，覆盖正常路径、错误路径和权限检查。所有测试文件必须包含 `afterAll` 清理逻辑。

---

## 3. 代码规范

### 3.1 日期与时间

所有业务时间戳以 UTC 毫秒级 Unix 时间戳存储在数据库中。前端展示时通过 `client/src/lib/format.ts` 的 `formatDate` 函数转换为用户本地时区，统一使用 `DD MMM YYYY` 格式（如 `28 Feb 2026`）。截止日期逻辑以北京时间 (UTC+8) 为基准。

### 3.2 金额与货币

金额通过 `formatAmount` 函数统一格式化，自动处理千分位分隔符。KRW、VND、IDR 等大数值货币显示 0 位小数，其他货币显示 2 位小数。员工薪资货币锁定为所在国法定货币（不可手动选择），发票以客户结算货币计价。

### 3.3 状态标签

所有状态显示通过 `statusLabels` 对象映射，而非直接使用 `.replace("_", " ")`。状态标签支持中英双语，颜色编码保持全局一致。

### 3.4 角色检查

使用 `shared/roles.ts` 的 `hasRole` 和 `hasAnyRole` 函数进行多角色判断。后端通过 `ctx.user.role` 字段检查权限，前端通过 `useAuth().user?.role` 条件渲染。

### 3.5 路由文件拆分

当路由文件超过 150 行时，拆分到 `server/routers/<feature>.ts`。当前系统已拆分为 31 个管理后台路由、12 个客户门户路由和 7 个员工门户路由。

---

## 4. 测试规范

项目包含 40 个测试文件，633+ 测试用例。测试分为以下层级：

| 层级 | 类型 | 工具 | 执行频率 |
|:---|:---|:---|:---|
| L1 | 单元测试 / 集成测试 | Vitest (`pnpm test`) | 每次代码变更后 |
| L2 | 类型检查 | TypeScript (`npx tsc --noEmit`) | 每次代码变更后 |
| L3 | 服务健康检查 | 手动检查 | 每次重启后 |
| L4 | 浏览器冒烟测试 | 手动验证 | 每次交付前 |

回归测试触发规则：Schema 变更需全量回归；Router 变更需回归受影响模块及关联模块；Frontend 变更需回归受影响页面；Bug 修复需回归修复模块和原始报告场景。

---

## 5. 版本管理

每次保存检查点会生成唯一的版本 ID（8 位哈希）。版本语义遵循 SemVer 规范：Major 版本对应重大功能模块上线，Minor 版本对应新功能或子模块完成，Patch 版本对应 Bug 修复和 UI 微调。

回滚策略按优先级排列：首先尝试代码修复（保持前进），其次是回滚到稳定的检查点版本，最后通过 SQL 脚本修复数据层面问题。

---

## 6. 发布检查清单


每次准备交付检查点前，需完成以下检查：

| 检查项 | 命令 / 方法 | 通过标准 |
|:---|:---|:---|
| 测试通过 | `pnpm test` | 全部通过 |
| 类型检查 | `npx tsc --noEmit` | 零错误 |
| 服务健康 | 手动检查 | 服务正常 |
| 浏览器控制台 | 开发者工具 | 无错误 |
| todo.md | 文件审查 | 已完成项标记为 `[x]` |
| 数据清理 | SQL / 管理界面 | 无垃圾数据 |
| 功能验证 | 浏览器端到端 | 核心流程走通 |

---

## 7. 生产环境变更规范

所有生产环境变更必须遵循 hotfix 治理规范，包括代码修复、配置变更和数据操作。变更前需评估影响范围，变更后需验证功能正常，并在审计日志中记录操作。
