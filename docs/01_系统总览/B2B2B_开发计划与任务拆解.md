# Extend Global B2B2B 架构重构开发计划与任务拆解

**版本**: v1.1 (补充遗漏项)  
**日期**: 2026年03月18日  

---

## 1. 计划总览

基于《B2B2B 系统架构与角色职责重构方案 v3.1》，本计划将整个重构工作拆解为 6 个独立并行的任务组（Task Groups）。每个任务组都具有高度的内聚性，涉及的文件和逻辑相对独立，确保多个 Task 可以并行开发而不产生代码冲突。

为了保证平稳过渡，所有的开发工作必须遵循以下原则：
- **不破坏现有数据**：所有 Schema 修改必须通过 Drizzle Migration 进行。
- **严格路由隔离**：Admin 的逻辑写在 `server/routers/`，CP Portal 的逻辑写在 `server/cp-portal/routers/`，严禁交叉引用路由。
- **权限校验前置**：所有新增的 tRPC procedure 必须使用对应的鉴权中间件（如 `adminProcedure`, `protectedCpProcedure`）。

---

## 2. 并行任务分组 (Task Groups)

### Task Group A: Admin UI 降噪与重排 (前端为主)

**目标**：调整 Super Admin 的导航结构，将 Partner 提升至第一优先级，并在核心页面（Invoices, Customers）实现按 CP 的顶层隔离。

**具体功能点与涉及文件**：

| 功能点 | 涉及文件 | 详细说明 |
| :--- | :--- | :--- |
| 导航栏重排 | `client/src/components/Layout.tsx` | 将 "Partners" 移至 `useNavGroups` 返回数组的第 1 位，重命名为 "Partner Hub"，并在其下新增 "CP Wallets" 和 "CP Pricing" 子菜单。将 "Customers" 移至 "Client Directory" 分组。 |
| Invoices Tab 隔离 | `client/src/pages/Invoices.tsx` | 将原有的 `layerFilter` 下拉框改为强制的顶级 Tabs（Layer 1 / Layer 2 / Direct）。L2 Tab 必须是只读模式（隐藏所有操作按钮）。 |
| Customers 默认分组 | `client/src/pages/Customers.tsx` | 默认开启 "Group by Partner" 视图，强化 B2B2B 的视觉感知。 |
| Admin CP 表单精简 | `client/src/pages/ChannelPartners.tsx`<br>`server/routers/channelPartnersRouter.ts` | 在前端表单和后端 schema 校验中，移除品牌白标（Logo、颜色）和银行账户的输入项，仅保留商务信息（域名、底价）。 |
| L1 发票完整操作确认 | `server/routers/invoicesRouter.ts` | 检查并确保 Admin 拥有对 L1 发票的完整操作闭环（markPaid, payWithWallet），如果没有则补齐。 |

**依赖关系**：无。可立即开工。

---

### Task Group B: CP 视角切换器 (Context Switcher)

**目标**：在 Super Admin 中实现全局的 CP 视角切换器，解决 EG-DIRECT 的权限矛盾，并允许运营人员下钻查看特定 CP 的数据。

**具体功能点与涉及文件**：

| 功能点 | 涉及文件 | 详细说明 |
| :--- | :--- | :--- |
| 全局状态管理 | `client/src/_core/store/cpContextStore.ts` (新建) | 创建 Zustand store，保存当前选中的 CP ID 及模式（All / Specific CP / EG-DIRECT）。 |
| 顶部切换器组件 | `client/src/components/Layout.tsx` | 在导航栏顶部增加一个全局下拉组件，列出所有 CP。选中时更新全局 Store。 |
| tRPC 中间件适配 | `server/procedures.ts` | 增强 `adminProcedure`，允许前端通过 header 或 input 传递 `x-cp-context-id`，并在 ctx 中注入。 |
| 核心列表页过滤 | `client/src/pages/Customers.tsx`<br>`client/src/pages/Employees.tsx`<br>`client/src/pages/Invoices.tsx` | 读取全局 Store 的 CP ID，自动将其作为默认的过滤参数传递给后端的 list 查询。 |
| EG-DIRECT 权限解锁 | 前端各核心页面 | 当 Store 模式为 EG-DIRECT 时，对 Customers、Invoices 页面解锁编辑/创建按钮。 |
| EG-DIRECT 隐藏 CP Wallet | `client/src/pages/admin/CpWallets.tsx` (新建) | 在展示 CP 钱包列表时，如果检测到 `isInternal = true` 的 CP (EG-DIRECT)，则在 UI 上隐藏其钱包余额（因为 EG 不需要向自己预存钱）。 |

**依赖关系**：依赖 Task Group A 的导航重排完成，以确保 UI 结构稳定。

---

### Task Group C: CP Portal 客户与员工管理赋权

**目标**：让 CP Portal 拥有完全的终端客户管理权，并增加对员工档案的非硬数据编辑能力，同时落实编辑锁定规则。

**具体功能点与涉及文件**：

| 功能点 | 涉及文件 | 详细说明 |
| :--- | :--- | :--- |
| CP 客户 CRUD | `server/cp-portal/routers/cpPortalClientsRouter.ts`<br>`client/src/pages/cp-portal/CpPortalClients.tsx` | 后端新增 `create`, `update` procedure。前端将只读列表改为完整的管理界面。 |
| 合同上传与 S3 集成 | `client/src/pages/cp-portal/CpPortalClientDetail.tsx` | 在客户详情页新增合同文件上传功能，调用现有的 S3/OSS 接口。 |
| Client Portal 权限管理 | `server/cp-portal/routers/cpPortalClientsRouter.ts` | 允许 CP 为其客户的联系人开通或撤销 Client Portal 的登录权限。 |
| CP 独立员工页面 | `client/src/pages/cp-portal/CpPortalEmployees.tsx` (新建) | 新增独立的 Employees 页面，替代原来仅嵌套在客户详情中的展示。 |
| 员工资料协助编辑 | `server/cp-portal/routers/cpPortalClientsRouter.ts` | 后端新增 `updateEmployeeInfo` procedure（仅限非硬数据）。 |
| 员工档案双端编辑锁定 | `server/cp-portal/routers/cpPortalClientsRouter.ts`<br>`server/portal/routers/portalEmployeesRouter.ts` | 在 CP 和 Client 的 update 接口中增加前置校验：`if (employee.status === 'pending_review') throw TRPCError('LOCKED')`。前端根据状态禁用编辑按钮。 |

**依赖关系**：无。可立即开工。

---

### Task Group D: CP Portal 资金与发票闭环

**目标**：在 CP Portal 中实现 Layer 2 发票的完整闭环（添加自定义项、标记付款），并引入 Client Wallet 和 Deposit 管理。

**具体功能点与涉及文件**：

| 功能点 | 涉及文件 | 详细说明 |
| :--- | :--- | :--- |
| Invoices Tab 拆分 | `client/src/pages/cp-portal/CpPortalInvoices.tsx` | 拆分为 Payables (L1, 待付给EG) 和 Receivables (L2, 向客户收) 两个顶级 Tab。 |
| L2 自定义收费项 | `server/cp-portal/routers/cpPortalInvoicesRouter.ts`<br>`client/src/pages/cp-portal/CpPortalInvoiceDetail.tsx` | 后端新增 `addCustomItem` procedure。前端允许在 Draft 状态的 L2 发票上添加纯利润收费项。 |
| L2 收款与 Wallet | `server/cp-portal/routers/cpPortalInvoicesRouter.ts`<br>`server/cp-portal/routers/cpPortalWalletRouter.ts` | 后端新增 `markPaid` 和 `payWithWallet` procedure。前端增加相应按钮。 |
| Client Deposit 管理 | `server/cp-portal/routers/cpPortalWalletRouter.ts`<br>`client/src/pages/cp-portal/CpPortalClients.tsx` | 允许 CP 为终端客户开具 Deposit Invoice，并在客户详情页展示 Client 的 Frozen Wallet 余额。 |
| CP 释放客户押金 | `client/src/pages/cp-portal/CpPortalReleaseTasks.tsx` (新建) | CP Portal 新增 Release Tasks 页面，用于释放客户的 Frozen Wallet（员工离职时）。 |

**依赖关系**：无。可立即开工。

---

### Task Group E: CP Portal 商业化扩展模块 (新增)

**目标**：将报价单功能下放给 CP，并为 CP 提供运营透明度和利润看板。

**具体功能点与涉及文件**：

| 功能点 | 涉及文件 | 详细说明 |
| :--- | :--- | :--- |
| Quotations 模块下放 | `server/cp-portal/routers/cpPortalQuotationsRouter.ts` (新建)<br>`client/src/pages/cp-portal/CpPortalQuotations.tsx` (新建) | 将 Admin 的报价单功能迁移至 CP Portal，允许 CP 基于 EG 底价 + 自己配置的加价规则，生成白标报价单。 |
| Operations Overview | `server/cp-portal/routers/cpPortalOperationsRouter.ts` (新建)<br>`client/src/pages/cp-portal/CpPortalOperations.tsx` (新建) | 新增只读看板，允许 CP 查看其名下所有客户的 Payroll 进度、Leave 审批状态、Reimbursements 和 Adjustments。 |
| Dashboard 利润看板 | `server/cp-portal/routers/cpPortalDashboardRouter.ts`<br>`client/src/pages/cp-portal/CpPortalDashboard.tsx` | 增强 Dashboard，新增核心指标：`L2 总营收 - L1 总成本 = CP 毛利`。 |

**依赖关系**：无。可立即开工。

---

### Task Group F: 底层双层发票引擎改造与 EG-DIRECT 适配

**目标**：修改 Schema 并调整后端的发票生成逻辑，完美支持 `eg_to_client` 类型，确保套娃结构在底层数据模型上的自洽。

**具体功能点与涉及文件**：

| 功能点 | 涉及文件 | 详细说明 |
| :--- | :--- | :--- |
| Schema 修改 | `drizzle/schema.ts` | 在 `invoiceLayer` enum 中增加 `"eg_to_client"` 值。运行 Drizzle generate 和 migrate。 |
| 发票引擎改造 | `server/services/dualLayerInvoiceService.ts` | 修改 `generateDualLayerInvoices` 函数：当 `isInternal` 为 true 时，生成的发票 `invoiceLayer` 必须设为 `"eg_to_client"`，而不是 `"eg_to_cp"`。 |
| 释放任务双层隔离 | `server/services/depositRefundService.ts` | 确保 Admin 执行的 Release Tasks 只操作 CP 的 Frozen Wallet，而 CP Portal 执行的 Release Tasks 只操作 Client 的 Frozen Wallet。 |
| Admin Deposit 支持 | `server/services/depositInvoiceService.ts` | 确保 Admin 为 CP 开具 Deposit Invoice 的逻辑完整可用。 |

**依赖关系**：必须在其他涉及发票的 Task 之前或并行初期完成，因为它是底层数据结构的变更。

---

## 3. 执行建议

为了最大化开发效率，建议按以下顺序分发任务：

1. **第一批次 (Day 1-3)**: 同时启动 Task Group A (Admin UI)、Task Group C (CP 客户赋权)、Task Group E (CP 商业化扩展) 和 Task Group F (底层引擎改造)。这四个组互不干扰，可以由 4 个独立的 Task 并行开发。
2. **第二批次 (Day 4-7)**: 在 Task Group A 完成后，启动 Task Group B (Context Switcher)；在 Task Group C 跑通后，启动 Task Group D (CP 资金闭环)。

所有代码提交必须遵循 `feat(scope): description` 的格式，并在 PR 中明确指出属于哪个 Task Group，以便进行代码审查和业务逻辑的交叉审查。
