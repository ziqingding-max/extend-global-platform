# Extend Global 邮件通知系统重构与完整方案

> **日期**: 2026-03-20
> **作者**: Manus AI

## 1. 需求理解与复述

根据 `docs` 文件夹下的文档以及代码库的实现（特别是路由层的具体触发逻辑和数据库 Schema 设计），我对 B2B2B 模式下的邮件通知系统需求进行了全面梳理。

系统的核心挑战在于**品牌隔离与上下文感知**。在 B2B2B 模式下，EG 平台存在多条平行的业务链路，必须根据接收方的身份和业务来源，智能决定使用 EG 品牌还是 CP 的白标品牌。

### 1.1 白标范围与品牌策略（已确认）

| 链路 | 门户白标 | 邮件品牌 | 口吻策略 |
|------|----------|----------|----------|
| EG → Super Admin | 不适用 | EG 品牌 | EG 内部系统通知 |
| EG → CP | CP Portal 白标 | EG 品牌 | EG 直接介绍业务、发送发票等 |
| CP → Client | Client Portal 白标 | **CP 白标品牌** | 完全隐藏 EG，CP 以自己的品牌面向客户 |
| EG → Direct Client | 无白标 | EG 品牌 | EG 直接介绍业务、发送发票等 |
| EG → Worker (直签) | **不做白标** | EG 品牌 | "我们受 [Client Name] 的委托，作为本地交付服务商/EOR 为您提供服务" |
| EG → Worker (CP渠道) | **不做白标** | EG 品牌 | "我们受 [Client Name] 和 [CP Name] 的委托，作为本地交付服务商/EOR 为您提供服务" |

> **关键决策（已确认）**：Worker Portal 不做白标设计，保持 EG 品牌。只有 CP Portal 和 Client Portal 做白标。Worker 邮件统一使用 EG 品牌，但必须在内容中说明委托关系，让 Worker 理解 EG 是受谁的委托为其提供服务。

经过深入排查代码（如 `invoices.ts`, `cronJobs.ts`, `cpPortalSettingsRouter.ts`, `authEmailService.ts`, `cpPortalAuthRouter.ts` 等），我发现之前的方案有几处关键的**遗漏点**，现已补充进本方案中：
1. **系统级 Auth 邮件（邀请、密码重置）存在严重的白标漏洞**：当 CP 渠道的 Client 被邀请或重置密码时，系统发送的依然是硬编码的 EG 品牌邮件。此外，Employee Onboarding Invite 也存在同样的白标漏洞。
2. **CP 侧 Auth 邮件功能未实现 (TODOs)**：在 CP Portal 中，CP Admin 邀请新用户（`inviteUser`）、重新发送邀请（`resendInvite`）以及 CP 联系人忘记密码（`forgotPassword`）时，代码中均只有 `// TODO: Send white-labeled email`，**实际上并没有发送任何邮件**。
3. **站内信 (In-App Notifications) 的门户隔离**：目前只有 Admin 和 Worker 有站内信路由，CP Portal 和 Client Portal 尚未实现站内信接口，但数据库 `notifications` 表已经支持了 `targetPortal: "cp" | "client"`，需要配套开发。
4. **钱包与资金流转通知**：当 CP 或 Client 发生多付/少付、发票状态自动流转、或生成 Credit Note 时，除了系统告警，还需要通知相应的财务人员。

---

## 2. 邮件通知链路分类与全景图

基于最新排查，我将系统中的所有邮件通知重新划分为以下五大链路（Layers），并梳理了具体的通知事件：

### 2.1 Layer 0: Super Admin 系统通知 (EG Internal)
**场景**：系统自动触发，通知 EG 运营/财务团队进行审核或处理异常。
**品牌**：EG 品牌（内部告警模板，使用 `notifyOwner` 或内部角色路由）。
**收件人**：`admin:operations_manager`, `admin:finance_manager`, `admin:customer_manager`。

| # | 事件 (Event Type) | 触发时机 | 现有状态 | 改造建议 |
|---|---|---|---|---|
| 0.1 | `payroll_draft_created` | Cron Job 生成薪资草稿后 | 已实现 | 保持现状。 |
| 0.2 | `admin_pending_approval_alert` | Cron Job 检测到错过薪资锁定的待办项 | 已实现 | 保持现状。 |
| 0.3 | `new_employee_request` | 客户/CP 提交新员工入职申请 | 已实现 | **小改**：增加 `{{channelPartnerName}}` 变量，标明来源渠道。 |
| 0.4 | `employee_termination_request` | 客户/CP 提交员工离职申请 | 已实现 | **小改**：增加 `{{channelPartnerName}}` 变量。 |
| 0.5 | `contractor_termination_request` | 客户/CP 提交承包商终止申请 | 已实现 | **小改**：增加 `{{channelPartnerName}}` 变量。 |
| 0.6 | `system_alert` | 核心系统异常、逾期发票统计、Credit Note 生成 | 已实现 (`notifyOwner`) | 保持现状。 |
| 0.7 | `admin_invite` | Super Admin 邀请新管理员 | 已实现 (`sendAdminInviteEmail`) | 保持现状。 |
| 0.8 | `admin_password_reset` | Super Admin 重置其他管理员密码（临时密码） | 已实现 (`sendAdminPasswordResetEmail`) | 保持现状。 |
| 0.9 | `admin_forgot_password` | Admin 自己忘记密码（重置链接） | 已实现 (`sendAdminForgotPasswordEmail`) | 保持现状。 |

### 2.2 Layer 1: EG to CP 通知
**场景**：EG 作为平台方，与 CP 结算底层成本，或进行渠道管理。
**品牌**：EG 品牌。
**收件人**：`cp:admin`, `cp:finance`, `cp:hr`（从 `channelPartnerContacts` 表获取）。

| # | 事件 (Event Type) | 触发时机 | 现有状态 | 改造建议 |
|---|---|---|---|---|
| 1.1 | `invoice_sent_to_cp` | EG 财务发布 Layer 1 发票 (EG→CP) | **需新增** | 从原 `invoice_sent` 拆分，CTA 指向 CP Portal 发票页。 |
| 1.2 | `invoice_overdue_to_cp` | Layer 1 发票逾期 | **需新增** | 从原 `invoice_overdue` 拆分。 |
| 1.3 | `cp_portal_invite` | Super Admin 或 CP Admin 邀请 CP 联系人 | 部分实现 / 存在 TODO | **需补全**：Admin 侧已实现，但在 `cpPortalSettingsRouter` 中 CP Admin 邀请用户时仅有 TODO 未发邮件，需补全。 |
| 1.4 | `cp_password_reset` | CP 联系人重置密码 | 存在 TODO | **需补全**：在 `cpPortalAuthRouter` 的 `forgotPassword` 中仅有 TODO，并未发送邮件，需补全调用 `sendCpPasswordReset`。 |
| 1.5 | `leave_policy_activated_cp` | CP 渠道客户的新国家假期政策激活 | **需新增** | 从原事件拆分，通知 CP 去配置。 |
| 1.6 | `onboarding_completed_cp` | CP 渠道员工完成入职信息填写 | **需新增** | 从原事件拆分，通知 CP。 |
| 1.7 | `employee_activated_cp` | CP 渠道员工被 EG 激活 | **需新增** | 从原事件拆分，通知 CP。 |
| 1.8 | `wallet_transaction_alert` | CP 钱包发生大额调账或余额不足 | 规划中 | **补充需求**：结合钱包系统规范。 |

### 2.3 Layer 2: CP to End Client 通知 (白标)
**场景**：CP 向其终端客户收费或同步业务进展。**核心要求是完全隐藏 EG 的存在**。
**品牌**：CP 白标品牌（动态加载 Logo、主色调、发件人名称）。
**收件人**：`client:finance`, `client:admin`。

| # | 事件 (Event Type) | 触发时机 | 现有状态 | 改造建议 |
|---|---|---|---|---|
| 2.1 | `invoice_sent_to_client_via_cp` | CP 发布 Layer 2 发票 (CP→Client) | 已实现部分 | **需重构**：将硬编码逻辑抽象为通知模板，纳入 `notificationService`。 |
| 2.2 | `invoice_overdue_to_client_via_cp` | Layer 2 发票逾期 | 已实现部分 | 同上。 |
| 2.3 | `client_portal_invite_via_cp` | 邀请终端客户联系人 (Admin、Client Admin 或 CP Admin 触发) | 现有是 EG 品牌；CP Portal 侧功能缺失 | **P0 漏洞修复**：必须支持白标化。同时 `cpPortalClientsRouter.ts` 的 `togglePortalAccess` 当前只开关权限，未生成 inviteToken 也未发送邀请邮件，需补全。 |
| 2.4 | `client_password_reset_via_cp` | 终端客户忘记密码 | 现有是 EG 品牌 | **P0 漏洞修复**：调用 `sendPortalPasswordResetEmail` 时需支持白标。 |
| 2.5 | `client_password_changed_by_admin` | Admin 重置终端客户密码并通知 | 现有是 EG 品牌 | **P0 漏洞修复**：调用 `sendPortalPasswordChangedEmail` 时需支持白标。 |
| 2.6 | `wallet_deduction_notice` | 客户钱包余额自动抵扣发票 | 规划中 | **补充需求**：高亮显示抵扣金额与剩余应付。 |

### 2.4 Layer 3: EG Direct to End Client 通知
**场景**：EG 直签客户的日常运营通知。
**品牌**：EG 品牌。
**收件人**：`client:finance`, `client:admin`, `client:hr`。

| # | 事件 (Event Type) | 触发时机 | 现有状态 | 改造建议 |
|---|---|---|---|---|
| 3.1 | `invoice_sent_to_direct_client` | 直签客户发票发布 | 现有 `invoice_sent` | 保持逻辑，作为拆分后的变体 C。 |
| 3.2 | `invoice_overdue_to_direct_client` | 直签客户发票逾期 | 现有 `invoice_overdue` | 保持逻辑，作为拆分后的变体 C。 |
| 3.3 | `leave_policy_activated_direct` | 直签客户新国家假期政策激活 | 现有逻辑 | 保持逻辑，作为拆分后的变体 B。 |
| 3.4 | `onboarding_completed_direct` | 直签员工完成入职 | 现有逻辑 | 保持逻辑，作为拆分后的变体 B。 |
| 3.5 | `employee_activated_direct` | 直签员工被激活 | 现有逻辑 | 保持逻辑，作为拆分后的变体 B。 |

### 2.5 Layer 4: EG to Worker 通知
**场景**：员工入职、发薪、发票等。因为 EG 是法定 EOR 雇主，统一使用 EG 品牌。**Worker Portal 不做白标**。
**品牌**：EG 品牌。
**收件人**：`worker:user`。
**核心策略（口吻调整）**：Worker 邮件统一使用 EG 品牌，但在内容上必须说明三方/四方关系：
- **CP 渠道 Worker**："我们受 `[Client Name]` 和 `[CP Name]` 的委托，作为本地交付服务商/法定雇主（EOR）为您提供服务。"
- **直签渠道 Worker**："我们受 `[Client Name]` 的委托，作为本地交付服务商/法定雇主（EOR）为您提供服务。"

| # | 事件 (Event Type) | 触发时机 | 现有状态 | 改造建议 |
|---|---|---|---|---|
| 4.1 | `worker_portal_invite` | 邀请 Worker 注册 Worker Portal 账户 | 已实现 | **文案改造**：传入 `clientName` 和可选的 `cpName`，根据是否为 CP 渠道动态调整 "受委托" 口吻。 |
| 4.2 | `worker_invoice_ready` | 承包商发票生成 | 已实现 | 无需改动。 |
| 4.3 | `worker_payment_sent` | 员工/承包商付款汇出 | 已实现 | 无需改动。 |
| 4.4 | `onboarding_invite_self_service` | 邀请员工填写入职表格 | 已实现 | **文案改造**：保持 EG 品牌，但在邮件正文中明确 "受 `[Client Name]` (及 `[CP Name]`) 委托" 的三方关系口吻。 |
| 4.5 | `worker_password_reset` | Worker 忘记密码 | 已实现 | 保持 EG 品牌。 |

---

## 3. 架构设计与重构方案 (三重视角)

### 3.1 产品经理视角：用户体验与品牌隔离
**痛点分析**：当前系统最大的风险是**品牌穿透**。在 `authEmailService.ts` 中，面向 Client 的邀请和密码重置完全没有判断是否属于 CP 渠道，直接发送了带有 Extend Global 标志的邮件。此外，CP Portal 中的 `inviteUser` 甚至还是一个 TODO，没有发送邮件。
**解决方案**：
1. **严格的受众隔离 (Audience Isolation)**：引入 `audience: "cp"` 概念，明确区分 EG 客户和 CP 客户。
2. **白标邮件引擎 (White-label Engine)**：所有的 Client 级邮件，必须先判断该 Client 是否属于某个 CP（`customerId -> channelPartnerId`）。如果是，**强制**走 `cp_whitelabel` 布局。
3. **站内信全覆盖**：目前只有 Worker 门户实现了 `workerNotificationsRouter.ts`，我们需要为 CP Portal 和 Client Portal 也补充对应的 Notification 路由，真正发挥 `notifications` 表中 `targetPortal` 的作用。

### 3.2 开发工程师视角：系统架构设计
为了支持上述复杂的路由逻辑，需要对核心的 `notificationService.ts` 进行改造。

#### 3.2.1 扩展 `NotificationConfig` 类型
```typescript
export type NotificationConfig = {
  enabled: boolean;
  channels: ("email" | "in_app")[];
  recipients: string[]; // 新增支持 "cp:admin", "cp:finance"
  audience: "admin" | "client" | "worker" | "cp"; // 新增 "cp"
  emailLayout: "eg" | "cp_whitelabel"; // 决定渲染哪个外层 HTML
  templates: {
    en: TemplateConfig;
    zh: TemplateConfig;
  };
};
```

#### 3.2.2 改造 `notificationService.send()` 核心流程
目前的 `send` 方法是扁平的，改造后应具备**上下文感知**能力：
1. **输入参数扩展**：`NotificationEvent` 新增 `channelPartnerId?: number`。
2. **动态模板选择**：在发送 `invoice_sent` 时，不再只有一个配置，而是通过代码逻辑判断：
   - 如果 `layer === 'eg_to_cp'` -> 使用 `invoice_sent_to_cp` 配置。
   - 如果 `layer === 'cp_to_client'` -> 使用 `invoice_sent_to_client_via_cp` 配置（走白标）。
   - 如果是直签 -> 使用 `invoice_sent_to_direct_client` 配置。
3. **收件人解析 (Recipient Resolution)**：在 `resolveRecipients` 方法中，新增对 `cp:*` 前缀的解析，从 `channelPartnerContacts` 表中查询对应的联系人。
4. **布局渲染分发**：
   - 如果 `config.emailLayout === 'cp_whitelabel'`，则调用 `getCpBranding()` 获取 CP 颜色和 Logo，并使用 `renderCpEmailLayout()`。
   - 否则，使用现有的 `renderEmailLayout()`。

#### 3.2.3 修复 Auth 邮件的白标漏洞 (P0级隐患)
**改造方案**：
1. **重构 Client Auth 邮件**：修改 `authEmailService.ts` 中的 `sendPortalInviteEmail`、`sendPortalPasswordResetEmail` 和 `sendPortalPasswordChangedEmail`，增加可选参数 `channelPartnerId`。在发送前查询该 CP 的品牌配置，如果存在则使用 `renderCpEmailLayout` 渲染白标邮件；否则回退到 `renderEmailLayout`（EG 品牌）。
2. **重构 Worker 邮件口吻**：修改 `sendOnboardingInviteEmail` 和 `sendWorkerPortalInviteEmail`，保持 EG 品牌，但增加可选参数 `channelPartnerName`，在模板中实现 "受委托作为本地交付服务商" 的差异化口吻。
3. **补全 CP Portal TODOs**：
   - 在 `cpPortalSettingsRouter.ts` 的 `inviteUser` 和 `resendInvite` 中，调用 `sendCpPortalInvite` 发送白标邀请邮件。
   - 在 `cpPortalAuthRouter.ts` 的 `forgotPassword` 中，调用 `sendCpPasswordReset` 发送白标重置邮件。

### 3.4 测试工程师视角：测试策略与清理
针对此次重构，测试复杂度极高，因为涉及多方角色的交叉。

**测试用例矩阵**：
1. **场景 A：EG 直签客户**
   - 触发 `invoice_sent` -> 验证收件人是 Client Finance，邮件品牌是 EG。
   - 触发密码重置 -> 验证收到 EG 品牌邮件。
2. **场景 B：CP 及其名下的客户**
   - 触发 `invoice_sent` (Layer 1) -> 验证收件人是 CP Finance，邮件品牌是 EG。
   - 触发 `invoice_sent` (Layer 2) -> 验证收件人是 Client Finance，邮件品牌是 **CP 自定义品牌**，附件 PDF 是白标发票。
   - 触发 Client 密码重置 -> 验证收到 **CP 自定义品牌**邮件。
3. **场景 C：员工 (Worker)**
   - 触发直签客户的入职邀请 -> 验证收到 EG 品牌邮件，正文包含 "受 [Client Name] 委托作为本地交付服务商"。
   - 触发 CP 渠道客户的入职邀请 -> 验证收到 EG 品牌邮件，正文包含 "受 [Client Name] 和 [CP Name] 委托作为本地交付服务商"。

**After Test Clean Up**：
所有自动化测试必须包裹在事务中，或在 `afterAll` 中执行：
- 删除测试创建的 `users`, `channelPartners`, `channelPartnerContacts`, `customers`, `invoices`, `notifications`。
- 清理测试过程中产生的 S3 PDF 文件残留。

---

## 4. 实施步骤与优先级 (Action Plan)

如果您确认上述方案无误，我将按照以下步骤进行开发（敏捷开发模式）：

**Phase 1: 基础设施改造 (P0)**
- 修改 `notificationConstants.ts`，扩展 `NotificationConfig` 类型，拆分 `invoice_sent` 和 `invoice_overdue` 为 3 个变体。
- 修改 `notificationService.ts`，支持 `cp:*` 收件人解析和 `cp_whitelabel` 邮件布局切换。

**Phase 2: Auth 邮件白标化修复与补全 (P0)**
- 改造 `authEmailService.ts`，为 `sendPortalInviteEmail`、`sendPortalPasswordResetEmail`、`sendPortalPasswordChangedEmail` 和 `sendOnboardingInviteEmail` 增加白标支持。
- 修改相关路由（`customers.ts`, `portalSettingsRouter.ts`, `portalAuthRouter.ts`, `portalEmployeesRouter.ts`），在调用邮件服务时传入 `channelPartnerId`。
- 补全 `cpPortalSettingsRouter.ts` 中的 `inviteUser` 和 `resendInvite` 邮件发送 TODO。
- 补全 `cpPortalAuthRouter.ts` 中的 `forgotPassword` 邮件发送 TODO。
- 补全 `cpPortalClientsRouter.ts` 中 `togglePortalAccess` 的邀请流程（生成 inviteToken + 发送白标邀请邮件）。

**Phase 3: 业务链路接入 (P1)**
- 将 `cpPortalInvoicesRouter.ts` 中硬编码的发送逻辑迁移到统一的 `notificationService.send()` 框架下。
- 修改 `cronJobs.ts` 中的逾期检测逻辑，支持区分 Layer 1 和 Layer 2 发票，并触发对应的通知变体。

**Phase 4: 站内信扩展与文案优化 (P2)**
- 开发 `cpPortalNotificationsRouter.ts` 和 `portalNotificationsRouter.ts`，实现 CP 和 Client 的站内信读取。
- 修改 `new_employee_request` 等 Admin 通知，注入 `channelPartnerName`。
- 拆分 `employee_onboarding_completed` 等通知为 CP 和 Direct 变体。

---
请您审阅以上补充后的完整方案。如果您确认该方案符合您的意图，我将立即开始代码开发。
