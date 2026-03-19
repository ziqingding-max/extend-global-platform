# 通知系统 B2B2B 业务逻辑重构需求文档

## 1. 背景与目标

当前的通知系统（`notificationConstants.ts` + `notificationService.ts`）继承自 GEA 时代的直营模型（EG → End Client / Worker），所有 13 个通知模板均假设 EG 直接面向终端客户和员工。

在 B2B2B 模型下，EG 平台存在 **三条通知链路**，需要完全重新设计：

| 链路 | 发送方 | 接收方 | 品牌 | 邮件模板 |
|------|--------|--------|------|---------|
| **Layer 0: EG Internal** | EG System | EG Admin / Ops | EG 品牌 | `emailLayout.ts` |
| **Layer 1: EG → CP** | EG Platform | CP Contact | EG 品牌 | `emailLayout.ts` |
| **Layer 2: CP → End Client** | CP Portal | End Client Contact | CP 白标品牌 | `cpEmailService.ts` |
| **Layer 3: EG → Worker** | EG Platform | Worker / Contractor | EG 品牌 | `emailLayout.ts` |
| **Layer 4: EG Direct → End Client** | EG Platform | End Client (直签) | EG 品牌 | `emailLayout.ts` |

> **核心原则：** 当客户通过 CP 渠道接入时，EG 不直接联系 End Client，所有面向 End Client 的通知由 CP Portal 以 CP 品牌发出。EG 只与 CP Contact 沟通。当客户是 EG Direct（直签）时，EG 直接联系 End Client。

## 2. 现有 13 个通知模板的重构分析

### 2.1 总览表

| # | 事件 | 当前收件人 | 当前 audience | B2B2B 改造方案 |
|---|------|-----------|-------------|---------------|
| 1 | `invoice_sent` | client:finance, client:admin, admin:finance_manager | client | 拆分为 3 个变体 |
| 2 | `invoice_overdue` | client:finance, client:admin, admin:customer_manager | client | 拆分为 3 个变体 |
| 3 | `payroll_draft_created` | admin:operations_manager | admin | 无需改动 |
| 4 | `new_employee_request` | admin:operations_manager | admin | 小改文案 |
| 5 | `worker_invite` | worker:user | worker | 需区分 CP 渠道 |
| 6 | `worker_invoice_ready` | worker:user | worker | 无需改动 |
| 7 | `worker_payment_sent` | worker:user | worker | 无需改动 |
| 8 | `leave_policy_country_activated` | client:admin, client:hr | client | 拆分为 2 个变体 |
| 9 | `employee_termination_request` | admin:operations_manager, admin:customer_manager | admin | 小改文案 |
| 10 | `contractor_termination_request` | admin:operations_manager, admin:customer_manager | admin | 小改文案 |
| 11 | `employee_onboarding_completed` | client:admin, client:hr_manager, admin:operations_manager | client | 拆分为 2 个变体 |
| 12 | `employee_activated` | client:admin, client:hr_manager | client | 拆分为 2 个变体 |
| 13 | `admin_pending_approval_alert` | admin:operations_manager, admin:customer_manager | admin | 无需改动 |

### 2.2 详细改造方案

#### 2.2.1 Invoice Sent (#1) — 拆分为 3 个变体

**变体 A: `invoice_sent_to_cp`（EG → CP）**
- **场景：** EG 向 CP 发送 EG→CP 层的发票（按 EG→CP 定价）
- **收件人：** `cp:finance`, `cp:admin`
- **品牌：** EG 品牌（`emailLayout.ts`）
- **CTA 按钮：** "View in Partner Portal" → `https://{subdomain}.extendglobal.ai/cp/invoices`
- **签名：** EG Finance Team

**变体 B: `invoice_sent_to_client_via_cp`（CP → End Client，白标）**
- **场景：** CP 向其 End Client 发送 CP→Client 层的发票（按 CP→Client 定价）
- **收件人：** `client:finance`, `client:admin`
- **品牌：** CP 白标品牌（`cpEmailService.ts`）
- **CTA 按钮：** "View Invoice" → CP Portal 发票页面
- **签名：** {CP Company Name} Finance Team
- **附件：** 白标 PDF 发票（使用 CP 品牌）

**变体 C: `invoice_sent_to_direct_client`（EG Direct → End Client）**
- **场景：** EG 直签客户的发票
- **收件人：** `client:finance`, `client:admin`
- **品牌：** EG 品牌（`emailLayout.ts`）
- **CTA 按钮：** "View in Client Portal" → `https://app.extendglobal.ai`
- **签名：** EG Finance Team
- **说明：** 基本保持现有模板不变

#### 2.2.2 Invoice Overdue (#2) — 拆分为 3 个变体

与 Invoice Sent 对称，分为：
- `invoice_overdue_to_cp`（EG → CP）
- `invoice_overdue_to_client_via_cp`（CP → End Client，白标）
- `invoice_overdue_to_direct_client`（EG Direct → End Client）

#### 2.2.3 Payroll Draft Created (#3) — 无需改动

纯 Admin 内部通知，不涉及外部收件人。

#### 2.2.4 New Employee Request (#4) — 小改文案

**改动点：**
- 文案中 "through the Client Portal" 改为 "through the portal"（可能来自 CP Portal 或 Client Portal）
- 新增模板变量 `{{channelPartnerName}}`，在 Info Card 中显示来源渠道
- 如果是 CP 渠道客户，增加一行 `<EG_ROW label="Channel Partner" value="{{channelPartnerName}}" />`

#### 2.2.5 Worker Invite (#5) — 需区分 CP 渠道

**问题：** Worker 的雇佣关系可能通过 CP 渠道建立。Worker 看到的品牌应该是 EG（因为 EG 是法律上的 EOR），但邀请链接需要指向正确的 Worker Portal。

**建议：** 保持 EG 品牌不变（Worker 与 EG 签约），但在模板中增加 `{{clientCompanyName}}` 变量，让 Worker 知道自己是为哪家公司工作。

#### 2.2.6 Worker Invoice Ready (#6) & Worker Payment Sent (#7) — 无需改动

Worker 面向的通知始终使用 EG 品牌，不受 B2B2B 影响。

#### 2.2.7 Leave Policy Country Activated (#8) — 拆分为 2 个变体

**变体 A: `leave_policy_activated_cp`（通知 CP）**
- **场景：** CP 渠道客户的新国家假期政策激活
- **收件人：** `cp:admin`, `cp:hr`
- **品牌：** EG 品牌
- **CTA：** "Review in Partner Portal" → CP Portal

**变体 B: `leave_policy_activated_direct`（通知直签客户）**
- 保持现有模板不变

#### 2.2.8 Employee/Contractor Termination Request (#9, #10) — 小改文案

**改动点：**
- "through the Client Portal" → "through the portal"
- 新增 `{{channelPartnerName}}` 变量（同 #4）

#### 2.2.9 Employee Onboarding Completed (#11) — 拆分为 2 个变体

**变体 A: `onboarding_completed_cp`（通知 CP）**
- **收件人：** `cp:admin`, `cp:hr_manager`, `admin:operations_manager`
- **品牌：** EG 品牌
- **CTA：** "View in Partner Portal"

**变体 B: `onboarding_completed_direct`（通知直签客户）**
- 保持现有模板不变

#### 2.2.10 Employee Activated (#12) — 拆分为 2 个变体

**变体 A: `employee_activated_cp`（通知 CP）**
- **收件人：** `cp:admin`, `cp:hr_manager`
- **品牌：** EG 品牌
- **CTA：** "View in Partner Portal"

**变体 B: `employee_activated_direct`（通知直签客户）**
- 保持现有模板不变

#### 2.2.11 Admin Pending Approval Alert (#13) — 无需改动

纯 Admin 内部通知。

## 3. 系统架构改造

### 3.1 NotificationConfig 类型扩展

```typescript
export type NotificationConfig = {
  enabled: boolean;
  channels: ("email" | "in_app")[];
  recipients: string[];
  audience: "admin" | "client" | "worker" | "cp";  // 新增 "cp"
  emailLayout: "eg" | "cp_whitelabel";              // 新增：决定使用哪套邮件模板
  templates: {
    en: TemplateConfig;
    zh: TemplateConfig;
  };
};
```

### 3.2 NotificationService 改造

`notificationService.ts` 的 `dispatchNotification()` 方法需要增加以下能力：

1. **CP 上下文感知：** 接收 `channelPartnerId` 参数，判断客户是 CP 渠道还是直签
2. **动态模板选择：** 根据 CP 上下文自动选择对应的模板变体
3. **动态 URL 构建：** 根据 CP 的 `subdomain` 构建正确的 Portal URL
4. **邮件布局切换：** `emailLayout: "eg"` 使用 `renderEmailLayout()`，`emailLayout: "cp_whitelabel"` 使用 `renderCpEmailLayout()`
5. **收件人解析扩展：** 支持 `cp:admin`, `cp:finance`, `cp:hr` 等新的收件人角色

### 3.3 收件人角色扩展

当前支持的收件人角色前缀：
- `admin:` — EG 管理员
- `client:` — End Client 联系人
- `worker:` — Worker / Contractor

新增：
- `cp:` — Channel Partner 联系人（从 `channelPartnerContacts` 表查询）

### 3.4 模板变量扩展

所有模板需要新增以下可选变量：

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{channelPartnerName}}` | CP 公司名 | "ABC Partners Sdn Bhd" |
| `{{portalUrl}}` | 动态 Portal URL | `https://abc.extendglobal.ai/cp/...` |
| `{{clientCompanyName}}` | End Client 公司名（Worker 邮件中使用） | "TechCorp Inc." |

## 4. 新增通知事件（B2B2B 专属）

除了现有模板的拆分，B2B2B 模型还需要以下全新的通知事件：

| # | 事件 | 链路 | 说明 |
|---|------|------|------|
| 14 | `cp_portal_invite` | EG → CP | 已实现（`cpEmailService.ts`），需纳入统一通知框架 |
| 15 | `cp_password_reset` | EG → CP | 已实现（`cpEmailService.ts`），需纳入统一通知框架 |
| 16 | `cp_new_client_added` | EG → CP | 通知 CP 有新客户被分配到其渠道 |
| 17 | `cp_pricing_updated` | EG → CP | 通知 CP 定价规则有变更 |
| 18 | `cp_monthly_summary` | EG → CP | CP 月度业务摘要（员工数、发票总额等） |

## 5. 实施优先级建议

### P0 — 立即实施（影响核心业务流程）
- Invoice Sent / Overdue 的 3 个变体拆分
- NotificationConfig 类型扩展（增加 `cp` audience）
- 收件人解析支持 `cp:` 前缀

### P1 — 短期实施（影响用户体验）
- Employee Onboarding / Activated 的 CP 变体
- Leave Policy Activated 的 CP 变体
- Admin 通知中增加 `{{channelPartnerName}}` 上下文

### P2 — 中期实施（增强功能）
- CP Portal Invite / Password Reset 纳入统一通知框架
- CP New Client Added 通知
- CP Pricing Updated 通知

### P3 — 长期实施（运营优化）
- CP Monthly Summary 月度摘要
- 通知偏好设置（允许 CP 自定义接收哪些通知）
- 通知日志和审计追踪

## 6. 测试要点

1. **CP 渠道客户场景：** 创建 CP → 分配客户 → 触发各类通知 → 验证收件人和品牌正确
2. **EG Direct 客户场景：** 直签客户 → 触发各类通知 → 验证保持现有行为
3. **混合场景：** 同一系统中同时存在 CP 渠道和直签客户 → 验证通知不会串
4. **白标一致性：** CP 白标邮件中不应出现任何 EG 品牌元素
5. **URL 正确性：** 所有 CTA 按钮链接指向正确的 Portal
6. **邮件发送降级：** SMTP 未配置时不报错，仅记录日志
