# GEA 平台 AOR 业务独立拆分与 Worker Portal 建设方案

**项目**：BEST GEA Platform  
**版本**：v1.0  
**日期**：2026 年 3 月 4 日  
**作者**：Manus AI  

---

## 一、文档概述

本文档是 GEA 平台 AOR（Agent of Record，独立承包商代理）业务从 EOR（Employer of Record，名义雇主）体系中独立拆分的完整技术方案。文档涵盖业务模型对比、数据库架构重构、六大核心模块的详细设计、Worker Portal（第三门户）建设规划、Approver 审批机制实现，以及分阶段开发计划和风险评估。

当前 GEA 系统中，AOR 承包商与 EOR 员工共用同一张 `employees` 表，仅通过 `serviceType` 枚举字段区分。两种截然不同的业务模型被迫共享相同的薪酬流程、假期管理和发票生成逻辑，导致了三个核心问题：第一，**合规风险**——承包商被纳入"薪酬发放"流程，存在用工错分类（misclassification）的法律隐患；第二，**流程错配**——承包商没有社保、假期、工资单等概念，却被迫使用为雇员设计的模块；第三，**扩展瓶颈**——无法为承包商设计独立的里程碑付款、自助入职等差异化功能。

本方案的核心目标是在**最小化对现有 EOR 流程影响**的前提下，为 AOR 业务建立独立的数据层、流程层和展示层，同时引入 Worker Portal 作为员工和承包商的统一自助服务入口。

---

## 二、EOR 与 AOR 业务模型对比

理解 EOR 和 AOR 的本质差异是整个拆分方案的基础。下表从法律关系、付款模式、合规要求等维度进行了全面对比。

| 维度 | EOR（名义雇主） | AOR（独立承包商代理） |
|------|----------------|---------------------|
| **法律关系** | GEA 作为法定雇主，与员工签订劳动合同 | GEA 作为代理，承包商与客户之间为商业服务关系 |
| **人员身份** | 雇员（Employee） | 独立承包商（Independent Contractor） |
| **合同类型** | 劳动合同（Employment Agreement） | 服务协议（Service Agreement / SOW） |
| **社会保险** | 必须缴纳（雇主 + 雇员部分） | 无，承包商自行负责 |
| **个人所得税** | 雇主代扣代缴 | 承包商自行申报 |
| **假期/休假** | 法定年假、病假、产假等 | 无法定假期 |
| **工作时间** | 受劳动法约束 | 自主安排 |
| **付款方式** | 工资发放（Payroll） | 发票结算（Invoice） |
| **付款频率** | 月度（固定） | Monthly / Semi-monthly / Milestone-based |
| **付款金额** | 固定月薪 + 社保 + 福利 | 固定月费 / 半月费 / 里程碑单价 × 数量 |
| **付款凭证** | 工资单（Payslip） | 承包商发票（Contractor Invoice） |
| **客户账单** | EOR Monthly Invoice（含工资+社保+服务费） | AOR Monthly Invoice（含承包商费用+服务费） |
| **Cutoff 日期** | 每月 4 号 23:59 | 共用，每月 4 号 23:59 |
| **变动项** | Adjustments（奖金/扣款/报销） | Adjustments（奖金/扣款/报销） |
| **审批内容** | 假期申请 | 里程碑完成确认 |
| **入职流程** | 收集个人信息 + 合同签署 + 社保开户 | 收集个人信息 + 服务协议签署 |
| **离职流程** | 法定通知期 + 社保关闭 + 经济补偿 | 合同终止通知 |
| **GEA 服务费** | 固定月费（如 $249/人/月） | 固定月费或按比例收取 |

上表揭示了一个根本性矛盾：**EOR 的核心是"雇佣关系管理"，AOR 的核心是"商业服务结算"**。两者在法律本质、付款逻辑和合规要求上完全不同，不应共用同一套数据模型和业务流程。

---

## 三、AOR 承包商三种付款频率详解

AOR 承包商的付款频率是本次拆分中最核心的业务规则之一。系统支持三种付款频率，每种频率在金额设定、Cutoff 逻辑和 Invoice 生成上有显著差异。

### 3.1 Monthly（月度付款）

Monthly 是最简单的付款模式。客户在 Onboarding 时为承包商填写**月薪金额**，该金额在合同期内保持固定。每月 4 号 23:59 为 Cutoff 时间点，系统冻结当期所有已 Approved 的 Adjustments 和 Leave & Milestones 记录。Contractor Invoice 跟随当月 Payroll Run 自动生成，付款日为当月最后一个工作日。Invoice 金额的计算公式为：

> **Monthly Invoice = 月薪金额 + 当月已 Approved 的 Adjustments 净额**

### 3.2 Semi-monthly（半月度付款）

Semi-monthly 模式下，客户在 Onboarding 时填写的是**每次 semi-monthly 付款的金额**（即单次周期金额），而非月薪总额。系统在每月产生两次付款：15 号付款和月底付款。两次付款的计算逻辑有本质区别：

> **15 号付款 = 单次周期金额（固定，不做任何调整）**
>
> **月底付款 = 单次周期金额 + 当月所有已 Approved 的 Adjustments 和 Leave 变动**

这意味着 15 号的付款是纯粹的"预付"性质，所有变动项统一在月底结算。Cutoff 仍然是每月 4 号，仅影响月底那一轮付款。

### 3.3 Milestone-based（里程碑付款）

Milestone-based 是 AOR 独有的付款模式，与 Monthly 和 Semi-monthly 有根本区别——它**没有固定的发放时间**，而是根据里程碑的完成和审批情况动态生成 Invoice。客户在 Onboarding 时填写的是**里程碑单价**，即每完成一个里程碑的固定金额。

承包商在 Worker Portal 中提交里程碑完成记录时，可以一次提交多个里程碑，并上传交付物附件。系统自动将提交内容（含附件下载链接）通过邮件发送给 Approver 审批。Approver 审批通过后，还需经过 Admin 最终确认（Admin Approval）。只有经过 Admin Approval 的里程碑才会进入当期 Contractor Invoice，未 Approved 的里程碑**不进入任何付款流程**。Invoice 金额的计算公式为：

> **Milestone Invoice = 已 Admin Approved 的里程碑数量 × 里程碑单价 + 当期 Adjustments**

下表汇总了三种付款频率在 Onboarding 填写、付款时间和 Invoice 计算上的差异：

| 维度 | Monthly | Semi-monthly | Milestone-based |
|------|---------|-------------|-----------------|
| **Onboarding 填写金额** | 月薪金额 | 半月薪金额 | 里程碑单价 |
| **金额含义** | 每月固定发放 | 每半月固定发放 | 每个里程碑的报酬 |
| **付款时间** | 月底最后工作日 | 15 号 + 月底 | 跟随 Payroll Run（Admin Approved 后） |
| **Cutoff 影响** | 冻结 Adjustments | 仅影响月底付款 | 以 Admin Approval 时间为准 |
| **Invoice 金额** | 月薪 + Adjustments | 半月薪 + Adjustments（月底） | 里程碑数 × 单价 + Adjustments |
| **是否需要提交** | 否（自动） | 否（自动） | 是（承包商提交里程碑） |

---

## 四、数据库架构重构

### 4.1 核心变更：新建 contractors 表

当前系统中 AOR 承包商存储在 `employees` 表中，通过 `serviceType = 'aor'` 区分。这种设计的问题在于 `employees` 表包含大量仅适用于 EOR 的字段（如 `probationEndDate`、`estimatedEmployerCost`、`leaveEntitlements`），而 AOR 所需的字段（如 `milestoneRate`、`paymentFrequency`）则缺失。

方案是新建独立的 `contractors` 表，将 AOR 相关数据从 `employees` 表中迁移出来。两张表共享部分基础字段（个人信息、国家、客户关联），但在业务字段上完全独立。

```sql
-- contractors 表：AOR 独立承包商
CREATE TABLE contractors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 基础信息（与 employees 共享的字段）
  customerId      INTEGER NOT NULL REFERENCES customers(id),
  countryCode     TEXT NOT NULL,
  firstName       TEXT NOT NULL,
  lastName        TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  nationality     TEXT,
  dateOfBirth     TEXT,
  gender          TEXT CHECK(gender IN ('male','female','other')),
  
  -- AOR 专属字段
  serviceType     TEXT NOT NULL DEFAULT 'aor' CHECK(serviceType IN ('aor')),
  contractType    TEXT CHECK(contractType IN ('fixed_term','indefinite','project_based')),
  startDate       TEXT NOT NULL,
  endDate         TEXT,
  
  -- 付款配置（核心差异）
  paymentFrequency TEXT NOT NULL CHECK(paymentFrequency IN ('monthly','semi_monthly','milestone')),
  paymentAmount    TEXT NOT NULL DEFAULT '0',  -- Monthly=月薪, Semi-monthly=半月薪, Milestone=里程碑单价
  paymentCurrency  TEXT NOT NULL DEFAULT 'USD',
  
  -- 服务费
  serviceFeeType   TEXT CHECK(serviceFeeType IN ('fixed','percentage')),
  serviceFeeAmount TEXT DEFAULT '0',
  
  -- 审批人
  approverName     TEXT,
  approverEmail    TEXT,
  
  -- 状态
  status          TEXT NOT NULL DEFAULT 'pending' 
    CHECK(status IN ('pending','onboarding','active','on_hold','terminated','offboarded')),
  
  -- Worker Portal 关联
  workerUserId    INTEGER,  -- 关联 worker_users 表
  
  -- 入职信息
  onboardingCompletedAt INTEGER,
  selfOnboarding       INTEGER DEFAULT 0,  -- 是否自助入职
  
  -- 地址
  address         TEXT,
  city            TEXT,
  state           TEXT,
  postalCode      TEXT,
  
  -- 银行信息
  bankName        TEXT,
  bankAccountName TEXT,
  bankAccountNumber TEXT,
  bankSwiftCode   TEXT,
  bankBranchCode  TEXT,
  
  -- 文档
  contractUrl     TEXT,
  contractKey     TEXT,
  
  -- 备注
  notes           TEXT,
  
  -- 时间戳
  createdAt       INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt       INTEGER NOT NULL DEFAULT (unixepoch()),
  createdBy       INTEGER,
  updatedBy       INTEGER
);

CREATE INDEX idx_contractors_customer ON contractors(customerId);
CREATE INDEX idx_contractors_country ON contractors(countryCode);
CREATE INDEX idx_contractors_status ON contractors(status);
CREATE INDEX idx_contractors_email ON contractors(email);
```

### 4.2 里程碑记录表

里程碑提交记录需要独立的表来存储，因为其数据结构与 EOR 的 `leave_records` 有本质区别。虽然在 UI 层面两者共用 "Leave & Milestones" 入口，但在数据层应当分离。

```sql
-- contractor_milestones 表：里程碑提交与审批记录
CREATE TABLE contractor_milestones (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contractorId    INTEGER NOT NULL REFERENCES contractors(id),
  customerId      INTEGER NOT NULL REFERENCES customers(id),
  
  -- 提交内容
  title           TEXT NOT NULL,           -- 里程碑标题/描述
  quantity        INTEGER NOT NULL DEFAULT 1,  -- 提交的里程碑数量
  unitPrice       TEXT NOT NULL,           -- 单价（从 contractor.paymentAmount 带入）
  totalAmount     TEXT NOT NULL,           -- 总金额 = quantity × unitPrice
  submittedAt     INTEGER NOT NULL,        -- 提交时间
  notes           TEXT,                    -- 备注
  
  -- 附件（交付物）
  attachments     TEXT,  -- JSON: [{fileName, fileUrl, fileKey, mimeType, size}]
  
  -- 审批流程
  approverName    TEXT,
  approverEmail   TEXT,
  approvalStatus  TEXT NOT NULL DEFAULT 'pending'
    CHECK(approvalStatus IN ('pending','approved','rejected')),
  approvedAt      INTEGER,
  approvalComment TEXT,
  approvalToken   TEXT,  -- JWT token for email approval
  approvalTokenExpiresAt INTEGER,
  
  -- Admin 最终确认
  adminApprovalStatus TEXT NOT NULL DEFAULT 'pending'
    CHECK(adminApprovalStatus IN ('pending','approved','rejected')),
  adminApprovedAt    INTEGER,
  adminApprovedBy    INTEGER,
  adminComment       TEXT,
  
  -- Invoice 关联
  contractorInvoiceId INTEGER,  -- 进入了哪期 Contractor Invoice
  
  -- 时间戳
  createdAt       INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_milestones_contractor ON contractor_milestones(contractorId);
CREATE INDEX idx_milestones_customer ON contractor_milestones(customerId);
CREATE INDEX idx_milestones_approval ON contractor_milestones(approvalStatus);
CREATE INDEX idx_milestones_admin ON contractor_milestones(adminApprovalStatus);
```

### 4.3 Contractor Invoice 表

Contractor Invoice 是 AOR 的核心财务凭证，对应 EOR 中的 Payslip。它记录了每个承包商每期的付款明细。

```sql
-- contractor_invoices 表：承包商发票（对应 EOR 的 payroll_items）
CREATE TABLE contractor_invoices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contractorId    INTEGER NOT NULL REFERENCES contractors(id),
  customerId      INTEGER NOT NULL REFERENCES customers(id),
  
  -- 期间
  periodYear      INTEGER NOT NULL,
  periodMonth     INTEGER NOT NULL,
  periodType      TEXT NOT NULL CHECK(periodType IN ('monthly','semi_monthly_15','semi_monthly_eom','milestone')),
  
  -- 金额明细
  baseAmount      TEXT NOT NULL DEFAULT '0',  -- 基础金额（月薪/半月薪/里程碑总额）
  adjustmentsTotal TEXT NOT NULL DEFAULT '0', -- Adjustments 净额
  totalAmount     TEXT NOT NULL DEFAULT '0',  -- 应付总额
  currency        TEXT NOT NULL DEFAULT 'USD',
  
  -- 里程碑明细（Milestone-based 专用）
  milestoneCount  INTEGER DEFAULT 0,          -- 本期里程碑数量
  milestoneUnitPrice TEXT,                    -- 里程碑单价
  
  -- 状态
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','generated','sent','paid','cancelled')),
  
  -- 关联 Payroll Run
  payrollRunId    INTEGER,  -- 关联的 payroll_runs 记录
  
  -- PDF
  invoicePdfUrl   TEXT,
  invoicePdfKey   TEXT,
  
  -- 付款信息
  payDate         TEXT,      -- 计划付款日
  paidAt          INTEGER,   -- 实际付款时间
  paymentRef      TEXT,      -- 付款凭证号
  
  -- 时间戳
  generatedAt     INTEGER,
  createdAt       INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_ci_contractor ON contractor_invoices(contractorId);
CREATE INDEX idx_ci_customer ON contractor_invoices(customerId);
CREATE INDEX idx_ci_period ON contractor_invoices(periodYear, periodMonth);
CREATE INDEX idx_ci_status ON contractor_invoices(status);
```

### 4.4 AOR Adjustments 表

AOR 的 Adjustments 与 EOR 共享相同的业务语义（奖金、扣款、报销等），但需要关联到 `contractors` 表而非 `employees` 表。方案有两种选择：在现有 `adjustments` 表中增加 `contractorId` 字段（复用方案），或新建独立的 `contractor_adjustments` 表（独立方案）。考虑到数据隔离的清晰性和未来扩展性，推荐**独立方案**。

```sql
-- contractor_adjustments 表：承包商费用调整
CREATE TABLE contractor_adjustments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contractorId    INTEGER NOT NULL REFERENCES contractors(id),
  customerId      INTEGER NOT NULL REFERENCES customers(id),
  
  -- 调整内容
  type            TEXT NOT NULL CHECK(type IN ('bonus','deduction','reimbursement','other')),
  description     TEXT NOT NULL,
  amount          TEXT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  
  -- 期间
  effectiveMonth  TEXT NOT NULL,  -- 格式: 'YYYY-MM'
  
  -- 状态
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','included','cancelled')),
  
  -- Invoice 关联
  contractorInvoiceId INTEGER,
  
  -- 来源
  createdBy       INTEGER,  -- Admin 或 Portal 用户
  source          TEXT CHECK(source IN ('admin','client_portal')),
  
  -- 时间戳
  createdAt       INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_ca_contractor ON contractor_adjustments(contractorId);
CREATE INDEX idx_ca_period ON contractor_adjustments(effectiveMonth);
```

### 4.5 Worker Portal 用户表

Worker Portal 需要独立的用户认证体系。`worker_users` 表存储员工和承包商的登录凭证，通过外键关联到 `employees` 或 `contractors` 表。

```sql
-- worker_users 表：Worker Portal 用户
CREATE TABLE worker_users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  passwordHash    TEXT,           -- bcrypt hash
  
  -- 身份关联（二选一）
  employeeId      INTEGER REFERENCES employees(id),
  contractorId    INTEGER REFERENCES contractors(id),
  
  -- 用户类型
  userType        TEXT NOT NULL CHECK(userType IN ('employee','contractor')),
  
  -- 状态
  status          TEXT NOT NULL DEFAULT 'invited'
    CHECK(status IN ('invited','active','suspended','deactivated')),
  
  -- 邀请
  inviteToken     TEXT,
  inviteTokenExpiresAt INTEGER,
  invitedAt       INTEGER,
  activatedAt     INTEGER,
  
  -- 登录信息
  lastLoginAt     INTEGER,
  loginCount      INTEGER DEFAULT 0,
  
  -- 时间戳
  createdAt       INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX idx_wu_email ON worker_users(email);
CREATE INDEX idx_wu_employee ON worker_users(employeeId);
CREATE INDEX idx_wu_contractor ON worker_users(contractorId);
```

### 4.6 数据库 ER 关系图

下图展示了 AOR 拆分后新建表与现有表之间的关系：

![数据库 ER 图](diagrams/aor_er_diagram.png)

### 4.7 数据库变更汇总

| 操作 | 表名 | 说明 |
|------|------|------|
| **新建** | `contractors` | AOR 承包商主表，从 `employees` 独立 |
| **新建** | `contractor_milestones` | 里程碑提交与审批记录 |
| **新建** | `contractor_invoices` | 承包商发票（对应 EOR 的 payroll_items） |
| **新建** | `contractor_adjustments` | 承包商费用调整 |
| **新建** | `worker_users` | Worker Portal 用户认证 |
| **修改** | `employees` | 移除 `serviceType = 'aor'` 的记录（数据迁移） |
| **修改** | `leave_records` | 新增 `source` 字段标记来源（worker_portal / client_portal） |
| **修改** | `invoices` | 新增 `invoiceCategory` 字段区分 EOR / AOR Invoice |

数据迁移策略：现有 `employees` 表中 `serviceType = 'aor'` 的记录需要迁移到 `contractors` 表。迁移脚本应在维护窗口执行，并保留原始 `employees.id` 到 `contractors` 表的映射关系，以便关联历史数据（如已有的 `adjustments`、`leave_records` 等）。

---

## 五、模块一：Onboarding 分流与 Profiles 统一视图

### 5.1 Onboarding 分流

当前 Admin 添加员工时，`serviceType` 仅作为一个下拉选项，选择后表单字段没有任何变化。拆分后，`serviceType` 的选择将决定进入完全不同的表单流程。

**EOR / Visa EOR 路径**（写入 `employees` 表）：保持现有流程不变，包含劳动合同信息、社保配置、假期额度、试用期等字段。

**AOR 路径**（写入 `contractors` 表）：表单字段精简为个人信息、付款配置和服务协议三个部分。付款配置部分是 AOR 的核心差异点：

第一步，选择**付款频率**（Monthly / Semi-monthly / Milestone-based）。第二步，根据所选频率，金额输入框的标签和提示文案动态变化——Monthly 显示"月薪金额"，Semi-monthly 显示"每次 Semi-monthly 付款金额"并附提示"请填写每半月的付款金额，非月薪总额"，Milestone-based 显示"里程碑单价"并附提示"每完成一个里程碑的固定报酬"。第三步，设置 Approver（姓名 + 邮箱），用于后续里程碑或变动项的审批。

### 5.2 三种入职方式

Admin 在添加 AOR 承包商时，有三种入职方式可选：

**方式一：Admin 直接填写**。Admin 在后台完整填写承包商信息，适用于信息已齐全的场景。

**方式二：发送自助入职链接**。Admin 仅填写承包商的姓名和邮箱，系统生成邀请链接发送到承包商邮箱。承包商点击链接后进入 Worker Portal，自行完成个人信息、银行账户等资料的填写。这种方式依赖 Worker Portal 一期的自助入职功能。

**方式三：从现有人员中选择**。如果客户已有 EOR 员工，Admin 可以从现有人员列表中选择，系统自动将基础信息（姓名、邮箱、国家等）预填到 AOR 表单中。注意，这不是"转换"——EOR 员工记录保持不变，只是复用其基础信息创建一条新的 AOR 承包商记录。

### 5.3 Profiles 统一视图

拆分后，Admin 后台的 "Profiles" 页面（原 "Employees" 页面）需要统一展示 EOR 员工和 AOR 承包商。页面结构设计如下：

**列表页**：合并展示所有人员，新增 "Type" 列（Employee / Contractor），支持按类型筛选。列表中的关键列根据类型动态显示——EOR 显示"月薪"和"社保成本"，AOR 显示"付款频率"和"付款金额/里程碑单价"。

**详情页**：根据人员类型加载完全不同的 Tab 布局。EOR 员工详情页保持现有结构（Overview / Contract / Payroll / Leave / Documents）。AOR 承包商详情页使用新的 Tab 结构：Overview（基本信息+付款配置）、Milestones（里程碑提交历史）、Invoices（Contractor Invoice 历史）、Adjustments（费用调整记录）、Documents（合同和文件）。

---

## 六、模块二：Leave & Milestones 通用化

### 6.1 侧边栏与页面结构

侧边栏统一显示 **"Leave & Milestones"**，不根据客户类型动态切换。页面内部使用 Tab 或筛选器区分两种记录类型。

对于 Client Portal，页面顶部提供类型筛选：如果客户同时拥有 EOR 员工和 AOR 承包商，显示 "All / Leave / Milestones" 三个 Tab；如果客户只有一种类型，则只显示对应的 Tab。

### 6.2 EOR Leave 流程（保持不变）

EOR 的假期管理流程保持现有逻辑不变。唯一的增强是在 `leave_records` 表中新增 `source` 字段，标记记录来源是 `client_portal`（客户代为提交）还是 `worker_portal`（员工自行提交）。两个入口提交的 Leave 进入同一个审批队列。

### 6.3 AOR Milestone 提交流程

AOR 承包商的里程碑提交是一个全新的流程，通过 Worker Portal 或 Client Portal 发起。

**承包商通过 Worker Portal 提交**（主要路径）：承包商登录 Worker Portal 后，进入 "Milestones" 页面，点击 "Submit Milestone" 按钮。提交表单包含以下字段：里程碑标题/描述（必填）、完成数量（默认 1，可填多个）、交付物附件（支持多文件上传）、备注（选填）。系统自动带入里程碑单价并计算总金额（数量 × 单价）。

下图展示了里程碑从提交到进入 Invoice 的完整审批流程：

![里程碑审批流程](diagrams/milestone_approval_flow.png)

**提交后触发审批流程**：系统向 Approver 邮箱发送审批邮件，邮件内容包含里程碑详情（标题、数量、金额）和交付物附件的下载链接。Approver 可以在邮件中直接点击 "Approve" 或 "Reject" 按钮完成审批（基于签名 JWT token，无需登录）。同时，如果 Approver 是 Client Portal 用户，也可以在 Portal 中查看并审批。任一路径完成审批后，另一路径自动失效。

**Approver 审批通过后**，记录状态变为 `approved`，等待 Admin 最终确认。Admin 在后台的 "Leave & Milestones" 管理页面中可以看到所有待确认的里程碑记录，逐条或批量进行 Admin Approval。Admin Approval 完成后，该里程碑进入当期 Contractor Invoice 的计算范围。

---

## 七、模块三：Contractor Invoice 自动化链路

### 7.1 整体流程

Contractor Invoice 的生成跟随现有的 Payroll Run 机制。每月 4 号 23:59 Cutoff 后，系统在执行 EOR Payroll Run 的同时，自动触发 AOR Contractor Invoice 的生成。完整流程如下：

下图展示了 Contractor Invoice 从 Cutoff 到付款的完整流程：

![Contractor Invoice 生成流程](diagrams/contractor_invoice_flow.png)

**Step 1 — Cutoff（每月 4 号 23:59）**。系统冻结当期所有数据：对于 Monthly 和 Semi-monthly 承包商，冻结 `contractor_adjustments` 中 `effectiveMonth` 匹配当期的记录；对于 Milestone-based 承包商，以 `adminApprovedAt` 时间为准，在 Cutoff 之前已 Admin Approved 的里程碑纳入当期。

**Step 2 — 生成 Contractor Invoice**。系统为每个 active 状态的承包商生成一条 `contractor_invoices` 记录。生成逻辑根据付款频率不同而异：

Monthly 承包商生成一条记录，`periodType = 'monthly'`，`baseAmount = paymentAmount`，`adjustmentsTotal` 为当期 Adjustments 净额。

Semi-monthly 承包商生成两条记录：一条 `periodType = 'semi_monthly_15'`，`baseAmount = paymentAmount`，`adjustmentsTotal = 0`（15 号付款不含调整）；一条 `periodType = 'semi_monthly_eom'`，`baseAmount = paymentAmount`，`adjustmentsTotal` 为当期 Adjustments 净额。

Milestone-based 承包商生成一条记录（仅当有已 Admin Approved 的里程碑时），`periodType = 'milestone'`，`baseAmount = milestoneCount × unitPrice`，`adjustmentsTotal` 为当期 Adjustments 净额。如果当期没有已 Approved 的里程碑且没有 Adjustments，则不生成 Invoice。

**Step 3 — 生成 Client AOR Invoice**。系统按客户汇总所有承包商的 Contractor Invoice，加上 markup 和 service fee，生成 Client AOR Monthly Invoice。这张 Invoice 与 EOR Monthly Invoice **分开出具**，客户收到两张独立的账单。

**Step 4 — 付款与状态流转**。客户支付 Client AOR Invoice 后，Admin 标记为 Paid，系统自动将关联的所有 Contractor Invoice 状态更新为 Paid，并记录实际付款日期。

### 7.2 Invoice 状态流转

```
draft → generated → sent → paid
                  ↘ cancelled
```

`draft` 状态在 Cutoff 后自动生成时设置，Admin 确认无误后批量更新为 `generated`，发送给承包商后更新为 `sent`，客户付款后更新为 `paid`。任何阶段都可以取消（`cancelled`），但已 `paid` 的不可取消。

### 7.3 Contractor Invoice PDF

每条 Contractor Invoice 需要生成品牌化的 PDF 文件，内容包括：GEA 公司信息和 Logo、承包商姓名和联系方式、Invoice 编号和日期、付款期间、金额明细（基础金额 + Adjustments 逐项列示 + 总计）、付款方式和银行信息。PDF 使用现有的 PDFKit 引擎生成，复用 EOR Invoice 的品牌模板。

---

## 八、模块四：Approver 审批机制

### 8.1 Approver 设置

Approver 的设置位于 Profile 详情页中，仅需两个字段：**姓名**和**邮箱**。这是一个刻意简化的设计——Approver 不需要在任何系统中注册账号，可以是任何拥有邮箱的人。

当 Admin 或客户在设置 Approver 时输入邮箱，系统自动检索现有人员（Portal 用户、员工、承包商）是否有匹配的邮箱。如果匹配到，自动填充姓名并显示身份标签（如 "Portal User - John Smith"）；如果未匹配到，用户手动填写姓名即可。

### 8.2 双路径审批实现

审批系统支持两条并行路径，任一完成即视为审批完成。

**路径 A：邮件链接审批**。当有新的 Leave 或 Milestone 提交时，系统生成一封审批邮件发送给 Approver。邮件中包含提交详情（类型、日期/数量、金额、备注）和交付物附件的下载链接（如有）。邮件底部有两个按钮："Approve" 和 "Reject"，分别链接到带有签名 JWT token 的 URL。

JWT token 的 payload 包含：`recordId`（记录 ID）、`recordType`（leave / milestone）、`action`（approve / reject）、`approverEmail`、`exp`（过期时间，建议 7 天）。URL 格式为：

```
https://app.geahr.com/api/approval?token=<signed_jwt>
```

点击后，后端验证 token 签名和有效期，执行审批操作，并返回一个简洁的结果页面（"审批成功"或"该记录已被处理"）。**整个过程无需登录**。

**路径 B：Client Portal 审批**。如果 Approver 恰好是 Client Portal 用户，可以在 Portal 的 "Leave & Milestones" 页面中看到待审批的记录，直接在页面内操作。

**互斥机制**：两条路径共享同一个审批状态字段（`approvalStatus`）。当任一路径将状态从 `pending` 更新为 `approved` 或 `rejected` 时，另一路径的操作将被拒绝（token 对应的记录已非 `pending` 状态）。邮件链接点击后显示"该记录已被处理"。

### 8.3 审批邮件模板

审批邮件需要支持中英双语，根据 Approver 的语言偏好（可在 Profile 中设置，默认英文）发送。邮件模板应包含以下要素：

对于 **Leave 审批邮件**：员工姓名、假期类型、起止日期、天数、备注。

对于 **Milestone 审批邮件**：承包商姓名、里程碑标题、完成数量、单价、总金额、交付物附件下载链接、备注。

---

## 九、模块五：Worker Portal（第三门户）

### 9.1 架构定位

Worker Portal 是 GEA 系统的第三个独立门户，与 Admin Portal 和 Client Portal 并列。它面向的用户是**员工**（EOR）和**承包商**（AOR），为他们提供自助服务能力。

从技术架构上看，Worker Portal 遵循现有的双门户模式进行扩展。下图展示了三门户的完整架构层次：

![三门户架构图](diagrams/triple_portal_architecture.png)

三门户的核心技术参数对比如下：

| 维度 | Admin Portal | Client Portal | Worker Portal |
|------|-------------|---------------|---------------|
| **用户** | GEA 内部员工 | 客户 HR/财务 | 员工/承包商 |
| **认证** | JWT（email+password） | JWT（email+password） | JWT（email+password） |
| **API 入口** | `/api/trpc` | `/api/portal` | `/api/worker`（新建） |
| **前端路由** | `/admin/*` | `/portal/*` | `/worker/*`（新建） |
| **数据范围** | 全量 | 本客户数据 | 本人数据 |

Worker Portal 的认证体系独立于 Client Portal，使用 `worker_users` 表存储凭证。用户通过 Onboarding 时的邮箱邀请链接激活账号，设置密码后即可登录。

### 9.2 一期功能：自助入职 + 核心提交

**自助入职（Self-onboarding）**：当 Admin 选择"发送自助入职链接"方式添加员工/承包商时，系统创建一条 `worker_users` 记录（状态为 `invited`），生成带有 invite token 的链接，通过邮件发送。承包商/员工点击链接后进入 Worker Portal 的入职向导页面，依次填写个人信息、银行账户、上传证件等。提交后，`worker_users` 状态更新为 `active`，对应的 `employees` 或 `contractors` 记录更新为 `onboarding` 或 `active`。

**AOR 里程碑提交**：承包商登录后，在 "Milestones" 页面提交里程碑完成记录。表单包含标题、数量、附件上传。提交后自动触发审批邮件。

**EOR Leave 提交**：员工登录后，在 "Leave" 页面提交假期申请。表单与 Client Portal 中的 Leave 提交表单一致，但操作主体从"客户代为提交"变为"员工自行提交"。提交后同样触发审批流程。

### 9.3 二期功能：查看与下载

**EOR 工资单查看**：员工可以查看自己的历史工资单（Payslip），支持 PDF 下载。数据来源为 `payroll_items` 表中关联到该员工的记录。

**AOR Invoice 查看**：承包商可以查看自己的历史 Contractor Invoice，支持 PDF 下载。数据来源为 `contractor_invoices` 表。

### 9.4 三期功能：档案管理

**个人档案更新**：员工/承包商可以更新部分个人信息（如联系方式、紧急联系人、地址），更新后需要 Admin 审核确认。

**银行账户管理**：员工/承包商可以更新银行账户信息，更新后需要 Admin 审核确认（涉及资金安全）。

### 9.5 Worker Portal 页面结构

```
Worker Portal
├── Login / Register (邀请链接激活)
├── Self-onboarding Wizard (入职向导，仅首次)
├── Dashboard (概览)
│   ├── 员工：下次发薪日、最近工资单、假期余额
│   └── 承包商：待审批里程碑、最近 Invoice、本月收入
├── Leave (仅 EOR 员工)
│   ├── 提交假期申请
│   └── 假期历史
├── Milestones (仅 AOR 承包商)
│   ├── 提交里程碑
│   └── 里程碑历史与状态
├── Payslips (仅 EOR 员工，二期)
├── Invoices (仅 AOR 承包商，二期)
├── Profile (三期)
│   ├── 个人信息
│   └── 银行账户
└── Settings
    ├── 修改密码
    └── 语言偏好
```

---

## 十、模块六：Client Portal 适配与 Dashboard 增强

### 10.1 侧边栏自适应

Client Portal 的侧边栏需要根据客户拥有的人员类型动态调整显示内容。判断逻辑基于该客户下是否存在 active 状态的 EOR 员工或 AOR 承包商。

| 菜单项 | 纯 EOR 客户 | 纯 AOR 客户 | 混合客户 |
|--------|-----------|-----------|---------|
| Dashboard | 显示 | 显示 | 显示 |
| Profiles | 显示（仅 Employees） | 显示（仅 Contractors） | 显示（合并视图） |
| Leave & Milestones | 显示 | 显示 | 显示 |
| Payroll | 显示 | 隐藏 | 显示 |
| Invoices | 显示（EOR） | 显示（AOR） | 显示（分 Tab） |
| Adjustments | 显示 | 显示 | 显示 |

### 10.2 Dashboard 增强

Dashboard 页面新增 AOR 统计卡片，与现有 EOR 卡片并列展示：

| 卡片 | 数据来源 | 说明 |
|------|---------|------|
| Active Contractors | `contractors` WHERE status='active' | AOR 承包商总数 |
| Pending Milestones | `contractor_milestones` WHERE approvalStatus='pending' | 待审批里程碑数 |
| This Month AOR Cost | `contractor_invoices` 当月汇总 | 本月 AOR 总支出 |
| Next Pay Date | 计算逻辑 | 下一个 AOR 付款日 |

### 10.3 Invoices 页面分离

Client Portal 的 Invoices 页面需要区分 EOR 和 AOR 两类 Invoice。推荐使用 Tab 切换：

**EOR Invoices Tab**：显示现有的 EOR Monthly Invoice 列表，保持不变。

**AOR Invoices Tab**：显示 AOR Monthly Invoice 列表（Client AOR Invoice），每张 Invoice 可展开查看关联的 Contractor Invoice 明细。

---

## 十一、开发计划与资源估算

### 11.1 模块依赖关系

本次 AOR 拆分涉及的模块存在明确的依赖关系，必须按顺序开发。下图展示了各 Phase 的时间安排和并行关系：

![开发路线图](diagrams/dev_roadmap.png)

```
Phase 0: 数据层拆分（无依赖）
  └── contractors 表 + 数据迁移 + Profiles 统一视图

Phase 1: 核心流程（依赖 Phase 0）
  ├── Onboarding 分流
  ├── Leave & Milestones 通用化
  ├── Contractor Adjustments
  └── Approver 审批机制（邮件审批）

Phase 2: Invoice 自动化（依赖 Phase 1）
  ├── Contractor Invoice 生成引擎
  ├── Client AOR Invoice 生成
  └── Invoice PDF 生成

Phase 3: Worker Portal 一期（依赖 Phase 1）
  ├── 认证框架（worker_users + JWT）
  ├── 自助入职向导
  ├── 里程碑提交
  └── Leave 提交

Phase 4: Portal 适配（依赖 Phase 2）
  ├── Client Portal 侧边栏自适应
  ├── Dashboard AOR 卡片
  └── Invoices 页面分离

Phase 5: Worker Portal 二期（依赖 Phase 2 + Phase 3）
  ├── Payslip 查看
  └── Contractor Invoice 查看

Phase 6: Worker Portal 三期（依赖 Phase 5）
  ├── 个人档案更新
  └── 银行账户管理
```

### 11.2 工作量估算

| Phase | 模块 | 工作日 | 说明 |
|-------|------|--------|------|
| **Phase 0** | 数据层拆分 | **8** | Schema 设计 2d + 数据迁移 2d + Profiles UI 4d |
| **Phase 1** | 核心流程 | **18** | Onboarding 分流 4d + Leave & Milestones 5d + Adjustments 3d + Approver 审批 6d |
| **Phase 2** | Invoice 自动化 | **12** | 生成引擎 5d + Client Invoice 3d + PDF 4d |
| **Phase 3** | Worker Portal 一期 | **15** | 认证框架 3d + 自助入职 5d + 里程碑提交 4d + Leave 提交 3d |
| **Phase 4** | Portal 适配 | **6** | 侧边栏 2d + Dashboard 2d + Invoices 2d |
| **Phase 5** | Worker Portal 二期 | **5** | Payslip 3d + Invoice 查看 2d |
| **Phase 6** | Worker Portal 三期 | **5** | 档案更新 3d + 银行账户 2d |
| **QA** | 测试与修复 | **8** | 单元测试 3d + 集成测试 3d + UAT 2d |
| | **总计** | **77 人天** | 约 15.5 周（单人） |

### 11.3 并行开发建议

如果团队有 2 名开发者，可以按以下方式并行：

**Dev A（后端为主）**：Phase 0 数据层 → Phase 1 Approver 审批 → Phase 2 Invoice 引擎 → Phase 5 Worker Portal 二期

**Dev B（前端为主）**：Phase 0 Profiles UI → Phase 1 Onboarding + Leave & Milestones → Phase 3 Worker Portal 一期 → Phase 4 Portal 适配

关键路径为 Phase 0 → Phase 1 → Phase 2 → Phase 4，约 44 天（9 周）。Worker Portal 一期（Phase 3）可以与 Phase 2 并行开发，不在关键路径上。

### 11.4 里程碑计划

| 里程碑 | 预计时间 | 交付物 |
|--------|---------|--------|
| M1: 数据层就绪 | 第 2 周末 | contractors 表 + 数据迁移完成 + Profiles 页面可用 |
| M2: 核心流程可用 | 第 5 周末 | Onboarding 分流 + Leave & Milestones + Approver 审批 |
| M3: Invoice 自动化 | 第 8 周末 | Contractor Invoice 全链路 + Client AOR Invoice |
| M4: Worker Portal 一期上线 | 第 8 周末 | 自助入职 + 里程碑提交 + Leave 提交 |
| M5: Portal 适配完成 | 第 9 周末 | Client Portal 全面适配 AOR |
| M6: Worker Portal 二期 | 第 11 周末 | Payslip + Invoice 查看 |
| M7: 全部完成 | 第 13 周末 | Worker Portal 三期 + QA + UAT |

---

## 十二、风险评估与缓解措施

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| **数据迁移导致历史数据丢失** | 低 | 极高 | 迁移前完整备份；保留 employees→contractors 的 ID 映射表；迁移脚本经过充分测试后在维护窗口执行 |
| **EOR 流程受到意外影响** | 中 | 高 | 所有 EOR 相关代码路径增加回归测试；AOR 拆分不修改 employees 表结构（仅移除 AOR 数据） |
| **邮件审批的安全性** | 中 | 中 | JWT token 设置合理的过期时间（7 天）；token 使用后立即失效（一次性）；审批 URL 使用 HTTPS |
| **Worker Portal 认证与现有系统冲突** | 低 | 中 | Worker Portal 使用完全独立的 JWT 签名密钥和 API 路径；cookie 使用不同的 name 和 path |
| **Semi-monthly 付款逻辑复杂度** | 中 | 中 | 15 号付款固定金额的设计已大幅简化逻辑；充分的单元测试覆盖三种付款频率 |
| **里程碑审批链路过长** | 中 | 低 | 提供 Admin 批量审批功能；设置审批提醒（Approver 48 小时未响应则提醒） |
| **承包商不熟悉 Worker Portal** | 中 | 低 | 入职邀请邮件中包含操作指南；Worker Portal 界面简洁直观；提供中英双语支持 |

---

## 十三、与现有开发计划的关系

本 AOR 拆分方案与此前制定的《GEA 平台功能扩展整合需求文档》（85 人天，14 模块）是**并行但独立**的两条开发线。两者的关系如下：

**共享依赖**：社保计算引擎（M4）是 Toolkit 和报价工具的依赖，但 AOR 拆分不依赖它——AOR 承包商没有社保。

**互不阻塞**：AOR 拆分可以在 Toolkit 开发之前、之后或同时进行，两者没有模块级依赖。

**共享基础设施**：PDF 品牌模板引擎（M3）可以被 Contractor Invoice PDF 复用；Approver 审批机制可以被 EOR Leave 审批复用。

**建议的整体优先级**：考虑到 AOR 拆分涉及数据架构变更（新建 contractors 表、数据迁移），且影响面较广，建议**优先启动 AOR 拆分**，在数据层稳定后再推进 Toolkit 和 Country Guide 等功能扩展。

---

## 十四、全局合规性审查：确保 Contractor 不被标记为 Employee

### 14.1 审查背景与原则

AOR 业务从 EOR 体系独立拆分后，系统中最大的合规风险是**用工错分类（Worker Misclassification）**——即在代码、UI、数据库或 API 中将独立承包商（Contractor）错误地标记或处理为雇员（Employee）。在许多司法管辖区，这种错分类可能导致严重的法律后果，包括补缴社保、罚款和诉讼。因此，必须在全局范围内进行系统性审查，确保拆分后的每一个触点都正确区分两种身份。

核心术语规范如下：

| 术语 | 适用范围 | 说明 |
|------|---------|------|
| **Employee** | 仅 EOR 雇员 | 与 GEA 存在劳动合同关系的人员 |
| **Contractor** | 仅 AOR 承包商 | 与客户存在商业服务关系的独立承包商 |
| **Worker** | 统称 | Employee 和 Contractor 的上位概念，仅用于 Worker Portal 等需要统一称呼的场景 |
| **Payroll** | 仅 EOR | 工资发放流程，不适用于 Contractor |
| **Invoice** | AOR 为主 | Contractor Invoice（承包商发票）和 Client Invoice（客户账单） |
| **Payslip** | 仅 EOR | 工资单，不适用于 Contractor |
| **Salary / 薪资** | 仅 EOR | Contractor 使用 Payment / Fee / Rate 等术语 |
| **Leave** | 两者均可 | EOR 为法定假期，AOR 为合同约定的无薪假期 |
| **Milestone** | 仅 AOR | 里程碑付款，不适用于 Employee |

### 14.2 数据库层合规审查

当前系统中 AOR 承包商存储在 `employees` 表中（`serviceType = 'aor'`），这是最根本的合规问题。以下是需要修改的数据库层面问题：

| 问题 | 当前状态 | 修改方案 | 优先级 |
|------|---------|---------|-------|
| AOR 数据存储在 `employees` 表 | `employees.serviceType = 'aor'` | 迁移至独立的 `contractors` 表 | **P0** |
| `employees` 表的 `employeeCode` 字段 | AOR 记录也生成 `EMP-xxxx` 编号 | 迁移后 Contractor 使用 `CTR-xxxx` 编号 | **P0** |
| `adjustments` 表的 `employeeId` 字段 | AOR 的 Adjustments 也关联 `employeeId` | 新建 `contractor_adjustments` 表，使用 `contractorId` | **P0** |
| `leave_records` 表的 `employeeId` 字段 | AOR 的 Leave 也关联 `employeeId` | AOR Leave 迁移至 `contractor_milestones` 或新建 `contractor_leave_records` | **P1** |
| `payroll_items` 表 | AOR 记录也生成 payroll_items | 拆分后 AOR 使用 `contractor_invoices` 表 | **P0** |
| `invoice_items` 表的 `employeeId` 字段 | AOR service fee 的 invoice item 也关联 `employeeId` | AOR 拆分后使用 `contractorId` 字段或独立的 AOR invoice 表 | **P1** |
| `onboarding_invites` 表 | 字段名为 `employeeName`、`employeeEmail`、`employeeId` | 方案一：重命名为通用名（`workerName`、`workerEmail`）；方案二：AOR 使用独立的邀请表 | **P1** |
| `getActiveEmployeesForPayroll()` 函数 | 查询 `employees` 表所有 active 记录，**未过滤 serviceType** | 添加 `WHERE serviceType != 'aor'` 过滤条件，防止 AOR 承包商进入 Payroll Run | **P0 关键** |

> **关键发现**：`getActiveEmployeesForPayroll()` 函数（`server/services/db/employeeService.ts:88`）当前查询所有 active 状态的 employees，**没有排除 `serviceType = 'aor'` 的记录**。这意味着 AOR 承包商可能被错误地纳入 EOR 的 Payroll Run 中。虽然在数据迁移后 `employees` 表中将不再有 AOR 记录，但在迁移完成前和过渡期内，必须立即添加过滤条件作为安全保障。

### 14.3 API 层合规审查

当前所有 AOR 相关操作都通过 `employees.*` 命名空间的 tRPC procedure 处理，这在语义上将 Contractor 等同于 Employee。

| 问题 | 当前状态 | 修改方案 | 优先级 |
|------|---------|---------|-------|
| AOR CRUD 操作 | `trpc.employees.create/update/list` 处理所有 serviceType | 新建 `trpc.contractors.*` 命名空间 | **P0** |
| AOR Adjustments | `trpc.adjustments.*` 使用 `employeeId` 参数 | 新建 `trpc.contractorAdjustments.*` 命名空间 | **P0** |
| AOR Leave | `trpc.leave.*` 使用 `employeeId` 参数 | AOR 使用 `trpc.contractorMilestones.*` 命名空间 | **P0** |
| Invoice 生成 | `invoiceGenerationService.ts` 通过 `employee.serviceType` 分流 | AOR Invoice 使用独立的生成逻辑，不经过 Payroll Run | **P0** |
| Portal API | `trpc.portal.employees.*` 返回所有 serviceType | 拆分为 `trpc.portal.employees.*`（仅 EOR）和 `trpc.portal.contractors.*`（仅 AOR） | **P1** |

### 14.4 Admin Portal UI 合规审查

| 页面/组件 | 当前状态 | 修改方案 | 优先级 |
|----------|---------|---------|-------|
| 侧边栏导航 "Employees" | 所有人员（含 AOR）都在 Employees 菜单下 | 改为 "Profiles" 或拆分为 "Employees" + "Contractors" | **P0** |
| Employees 列表页 | AOR 和 EOR 混合显示，表头为 "Employees" | 拆分为两个 Tab 或两个独立页面 | **P0** |
| 新建人员对话框 | 标题为 "Add Employee"，包含 serviceType 下拉 | EOR 入口标题为 "Add Employee"，AOR 入口标题为 "Add Contractor" | **P1** |
| 人员详情页 | 统一使用 Employee 相关标签 | AOR 详情页使用 Contractor 相关标签（如 "Payment" 而非 "Salary"） | **P1** |
| Payroll 页面 | 可能包含 AOR 记录的 payroll items | 确保仅显示 EOR 数据 | **P0** |
| Leave & Milestones 页面 | 统一入口 | 内部按 Employee Leave 和 Contractor Milestones 分区显示 | **P1** |

### 14.5 Client Portal UI 合规审查

| 页面/组件 | 当前状态 | 修改方案 | 优先级 |
|----------|---------|---------|-------|
| 侧边栏 "Employees" | 所有人员都在 Employees 菜单下 | 改为 "Profiles" 或 "Team Members" | **P0** |
| 人员列表 | AOR 和 EOR 混合，列头为 "Employee" | 使用 Tab 分离或统一列头为 "Name" | **P0** |
| 人员详情页 | AOR 承包商详情页标题区显示 serviceType badge（"AOR"） | 保留 badge 但确保其他标签使用 Contractor 术语 | **P1** |
| Onboarding 流程 | 三种 serviceType 选择后统一进入 "Add Employee" 流程 | AOR 选择后进入 "Add Contractor" 流程，表单字段差异化 | **P1** |
| Dashboard 统计 | 可能将 AOR 人数计入 "Total Employees" | 分离为 "Employees" 和 "Contractors" 两个统计卡片 | **P1** |
| Invoices 页面 | EOR 和 AOR Invoice 混合显示 | 使用 Tab 分离 "EOR Invoices" 和 "AOR Invoices" | **P1** |

### 14.6 Invoice 生成逻辑合规审查

当前的 Invoice 生成服务（`invoiceGenerationService.ts`）通过 `employee.serviceType` 字段将 AOR 记录分流到 `monthly_aor` 类型的 Invoice 中。这种设计虽然在功能上可行，但存在以下合规问题：

第一，AOR 承包商的费用通过 **Payroll Run** 流程生成 Invoice，而 Payroll 是一个明确的雇佣关系概念。在法律审计中，如果发现承包商的付款记录出现在 Payroll 系统中，可能被视为事实雇佣关系的证据。

第二，AOR 的 Invoice item 使用 `employeeId` 字段关联到 `employees` 表，进一步强化了承包商被视为雇员的风险。

修改方案：AOR 拆分后，Contractor Invoice 的生成应完全独立于 Payroll Run。虽然两者可以共享 Cutoff 时间点（每月 4 号），但 Contractor Invoice 的生成逻辑应从 `contractors` 表读取数据，使用 `contractorId` 关联，并通过独立的 `contractor_invoices` 表存储结果。Client AOR Invoice 的生成也应独立于现有的 EOR Invoice 生成流程。

### 14.7 合规审查执行计划

建议将合规审查分为三个阶段执行：

**阶段一（与 Phase 0 同步，P0 优先级）**：在数据迁移之前，立即为 `getActiveEmployeesForPayroll()` 添加 `serviceType != 'aor'` 过滤条件，防止 AOR 承包商进入 Payroll Run。这是一个零成本的安全保障措施，应在任何其他开发工作之前完成。

**阶段二（与 Phase 0-1 同步）**：完成数据迁移后，新建 `contractors.*` API 命名空间，将 Admin Portal 和 Client Portal 中的 AOR 相关操作迁移到新的 API 上。同时更新 UI 中的导航标签和页面标题。

**阶段三（与 Phase 2-4 同步）**：完成 Invoice 生成逻辑的独立化，确保 AOR 的付款流程完全脱离 Payroll 体系。更新所有剩余的 UI 标签和术语。

---

## 十五、总结

本方案通过六大模块的系统设计，实现了 AOR 业务从 EOR 体系的完整独立：

**数据层独立**——新建 `contractors`、`contractor_milestones`、`contractor_invoices`、`contractor_adjustments` 四张核心表，AOR 数据与 EOR 数据在数据库层面完全分离。

**流程层独立**——Onboarding 分流确保 AOR 承包商从入职开始就进入独立的业务流程；三种付款频率（Monthly / Semi-monthly / Milestone-based）的差异化处理确保了业务规则的准确执行。

**展示层统一**——Profiles 页面提供 EOR + AOR 的统一视图，侧边栏统一显示 "Leave & Milestones"，Client Portal 通过自适应导航为不同类型的客户提供最相关的功能入口。

**自助服务能力**——Worker Portal 作为第三门户，为员工和承包商提供了自助入职、里程碑提交、假期申请、工资单查看等核心能力，减轻了 Admin 和客户的操作负担。

**灵活的审批机制**——Approver 可以是任何拥有邮箱的人，通过邮件一键审批或 Client Portal 审批两条路径完成操作，兼顾了便捷性和灵活性。

整体工作量约 77 人天（15.5 周单人），如果 2 人并行开发，关键路径约 9 周，Worker Portal 一期可在第 8 周末交付。

---

*本文档基于 GEA 平台代码库（截至 2026 年 3 月 3 日）的深入审计和多轮需求讨论。工作量估算基于单人全职开发的假设，实际工期因团队规模和并行度而调整。*
