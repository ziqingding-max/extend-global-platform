# Extend Global (EG) B2B2B 系统架构与角色职责重构方案

**版本**: v3.1 (最终确认版，含修正)  
**日期**: 2026年03月18日  
**状态**: Approved  

---

## 1. 架构总览：从"直客模式"到"套娃结构"的升维

### 1.1 问题诊断

在最初的系统设计中，我们部分残留了前身系统（GEA）的"平台直面客户（Admin → Client）"的思维惯性。这种惯性在产品交互层表现得尤为明显：Admin Portal 的导航栏中，`Partners` 模块被放置在第 7 位（倒数第二），仅被视为一个附加的管理对象；`Customers` 和 `Invoices` 列表将所有终端客户和账单混在一起，缺乏以 CP 为维度的顶层隔离；CP Portal 更多是一个"只读看板"加"发票转发器"，缺乏真正的业务自主权。

然而，EG 的核心商业模式是 **B2B2B**：EG 不直接面对终端客户（虽然系统支持直客模式，但非主营业务），EG 提供底层基础设施，CP 负责获客与前端服务。为了真正实现 EG 作为全球化底层基础设施平台的定位，我们必须在产品交互与权限架构上进行彻底的"升维重构"。

### 1.2 核心认知：套娃结构

本次重构的核心认知是：**整个系统是一个"套娃结构"**。

EG 和 CP（渠道合作伙伴）的关系，本质上就是原来 GEA 和终端客户（Client）关系的"上移一层"。原来 GEA 管理 Client 的那套业务逻辑（包含 Invoice 开具、Wallet 充值扣款、Frozen Wallet 押金管理、Release Tasks 离职释放等），现在被完整地复制成了两层：

**底层套娃（EG 管 CP）**：EG 作为底层服务商，向 CP 提供基础设施。EG 向 CP 开具 Layer 1 发票（包含真实的员工用工成本 + EG 的底价服务费），管理 CP 预存在 EG 的钱包（Normal Wallet）和押金（Frozen Wallet）。当 CP 名下有员工离职时，EG 通过 Release Tasks 将对应的 Frozen Wallet 余额释放回 CP 的 Normal Wallet 或退回 CP 的银行账户。

**上层套娃（CP 管 Client）**：CP 作为经销商，向终端客户提供白标服务。CP 向 Client 开具 Layer 2 发票（包含相同的员工用工成本 + CP 自己的加价服务费），管理 Client 预存在 CP 的钱包（Normal Wallet）和押金（Frozen Wallet）。当终端客户名下有员工离职时，CP 通过 Release Tasks 将对应的 Frozen Wallet 余额释放回 Client 的 Normal Wallet 或退回 Client 的银行账户。

这两层逻辑在数据模型和业务流转上是**完全对称且互相隔离**的。CP 暴雷或终端客户违约，只在各自的商业合同层级内解决。EG 只需确保每个 CP 在 EG 这里的押金账目清晰即可，CP 的终端客户出了问题，理论上与 EG 无关，因为 EG 和 CP 是独立公司之间的商务合作关系。

### 1.3 套娃结构的对称性图示

为了更直观地理解这种对称性，以下是两层套娃在各个业务维度上的对照关系：

| 业务维度 | 底层套娃 (EG 管 CP) | 上层套娃 (CP 管 Client) |
| :--- | :--- | :--- |
| **商务关系** | EG 与 CP 签署合作协议 | CP 与 Client 签署服务协议 (MSA) |
| **定价规则** | `cpPricingRules` 表（EG 底价） | `cpClientPricing` 表（CP 加价） |
| **发票类型** | Layer 1 (`eg_to_cp`) | Layer 2 (`cp_to_client`) |
| **发票内容** | 员工用工成本 + EG 服务费 | 员工用工成本 + CP 服务费（含利润） |
| **Normal Wallet** | CP 预存在 EG 的可用余额 | Client 预存在 CP 的可用余额 |
| **Frozen Wallet** | CP 交给 EG 的员工押金 | Client 交给 CP 的员工押金 |
| **Deposit Invoice** | EG 向 CP 开具押金发票 | CP 向 Client 开具押金发票 |
| **Release Tasks** | 员工离职 → EG 释放 CP 的 Frozen Wallet | 员工离职 → CP 释放 Client 的 Frozen Wallet |
| **收款确认** | EG 在 Super Admin 确认 CP 到账 | CP 在 CP Portal 确认 Client 到账 |
| **管理入口** | Super Admin Portal | CP Portal |

---

## 2. 核心角色与职责分工 (Super Admin vs CP Portal)

基于上述套娃结构，我们将原本由 GEA 一个 Admin 承担的所有职责，按照**"谁离员工更近（底层交付）"和"谁离客户更近（前端运营）"**的原则，严格拆分给 Super Admin 和 CP Portal。

### 2.1 Super Admin（EG 平台方）：底层交付与基建中心

Super Admin 是系统的"工厂"，负责把合规、发薪、算税等脏活累活干好，然后按"出厂价"把账单（Layer 1）塞给 CP。

#### 2.1.1 配置 CP (Partner Configuration)

Super Admin 负责 CP 的全生命周期管理。EG 在创建 CP 时只需要填写核心的商务信息，品牌视觉和收款银行等前端运营相关的配置全部下放给 CP 自己在 CP Portal 中完成。具体来说，Super Admin 负责的配置项包括：创建 CP 账号并分配唯一的 `partnerCode`；配置 CP 的域名（subdomain，如 `acme.extendglobal.ai`）；设定 EG 向该 CP 收取的底层价格规则（Layer 1 Pricing），存储在 `cpPricingRules` 表中，支持固定人头费、按比例收费、阶梯计费和最低消费等多种模式；为 CP 创建门户用户（`channelPartnerContacts`），配置其门户角色（admin / finance / operations / viewer），并发送邀请链接。

**以下配置项由 CP 自行在 CP Portal 的 Settings 中管理，EG 不介入**：品牌白标信息（Logo、Favicon、主题色 Primary / Secondary / Accent Color）；CP 的开票信息（Billing Entity Name、地址、Tax ID）；CP 的银行账户信息（用于在 Layer 2 发票上展示给终端客户的收款账户）。CP 用什么银行账户收客户的钱，是 CP 自己的商务决策，与 EG 无关。

#### 2.1.2 向 CP 收钱 (Layer 1 Settlement)

EG 的核心收入来源是 Layer 1 发票。每月 Payroll 引擎运行完毕后，系统基于底层成本数据和 `cpPricingRules` 自动生成 Layer 1 发票草稿。EG 财务审核无误后发布（Published），此时 CP 在其 CP Portal 的 Payables 中看到该账单。CP 可以选择用其在 EG 这里的 Normal Wallet 余额支付，或者线下银行转账后由 EG 财务在 Super Admin 中确认到账并将发票标记为 Paid。

Layer 1 发票的类型与 GEA 时代完全一致，包括但不限于：`monthly_eor`（月度 EOR 服务费）、`monthly_visa_eor`（含签证的 EOR 服务费）、`monthly_aor`（月度 AOR 服务费）、`deposit`（押金发票）、`deposit_refund`（押金退款）、`credit_note`（红字发票/贷项通知单）、`manual`（手动发票）。

#### 2.1.3 管理 CP 押金 (CP Deposit & Frozen Wallet)

EG 向 CP 收取的押金逻辑与 GEA 时代向 Client 收取押金的逻辑完全一致。EG 向 CP 开具 `deposit` 类型的 Layer 1 发票，CP 支付后资金进入 CP 在 EG 这里的 Frozen Wallet。当 CP 名下有员工离职时，EG 通过 Release Tasks 将对应金额从 Frozen Wallet 释放至 CP 的 Normal Wallet（可用于抵扣后续 Layer 1 发票），或者退回 CP 的银行账户（通过开具 `deposit_refund` 类型的发票记录）。

#### 2.1.4 审阅终端客户 (Client Oversight)

Super Admin 对终端客户的信息保持**只读审阅权**。这是因为在 B2B2B 模式下，终端客户是 CP 的客户，由 CP 全权管理。但 EG 作为底层合规兜底方，需要能够查看客户的基础信息以进行 KYC/KYB 审核，确保不存在反洗钱或制裁风险。Super Admin 不能编辑、删除或创建终端客户（EG-DIRECT 场景除外，详见第 4 章）。

#### 2.1.5 管理员工硬数据 (Employee Core Data)

所有与"人"相关的核心操作由 EG 兜底，因为 EG 是真正的法律雇主（Employer of Record）。EG 负责员工的**全生命周期管理**，包括入职（Onboarding）、在职管理和离职（Offboarding）三个阶段：

**入职阶段（Onboarding）**：审核员工的入职资料（护照、身份证、工作许可等）；生成、上传并签署真实有效的劳动合同（Employment Contract）；配置员工的初始工资、社保基数、个税扣缴方案。

**在职管理阶段**：维护员工的银行卡号（Bank Details），确保薪酬准确下发；调整工资、社保基数等硬数据；管理劳动合同的续签、变更。

**离职阶段（Offboarding）**：处理最终工资结算（Final Pay）；办理社保停缴；终止劳动合同；触发 Release Tasks 释放对应的 Frozen Wallet 押金。

这些数据被视为"底层硬数据"，CP 和 Client 均无权修改。

**员工档案数据的编辑锁定规则**：在员工档案提交审核之前（即状态为 Draft 或类似的可编辑状态时），Client 和 CP 都可以自由修改和补充员工资料。一旦员工档案进入 `Pending Review` 状态（提交给 EG 审核），Client 和 CP 的编辑权即刻锁定，此后只有 EG 的 Super Admin 可以操作（审核通过、打回要求修改、或直接修改数据）。如果 EG 打回要求修改，档案状态回退到可编辑状态，Client 和 CP 重新获得编辑权。

#### 2.1.6 执行 Operations (Operational Delivery)

EG 负责所有底层运营交付工作，因为这些操作直接涉及真实的资金下发和法律合规。具体包括：运行每个月的 Payroll 引擎，计算真实的工资、社保和个税；审批员工提交的请假（Leave）申请，确保符合当地劳动法规定的年假、病假、产假等政策；审批员工提交的报销（Reimbursements）申请；处理薪资调整（Adjustments），如加班费、补发工资、扣款等；向供应商（Vendor）或直接向员工发放薪酬；收集并核对 Vendor Bills，进行成本分摊（Cost Allocation）。

#### 2.1.7 查看 CP 运营情况 (CP Oversight - Read Only)

Super Admin 拥有上帝视角，可以查看所有 CP 给终端客户开具的 Layer 2 发票状态及收款进度。但这仅用于全局监控和风险预警，EG 不会主动干预 CP 与其客户之间的商务关系。例如，如果某个 CP 的 Layer 2 发票长期处于 Overdue 状态，EG 可能会提醒 CP 注意催收，但不会代替 CP 去向终端客户催款。

#### 2.1.8 维护底层数据 (Infrastructure Data)

Super Admin 负责维护系统级的基础数据，这些数据被所有 CP 和 Client 共享使用。包括：全球国家指南（Country Guide），记录各国的劳动法概要、社保政策、税率等；全球公共假日（Public Holidays），用于自动计算各国的工作日和假期；系统级汇率（Exchange Rates）及汇率加价（FX Markup），用于跨币种发票的结算；EG 自己的 Billing Entities（开票实体），即 EG 在不同国家/地区注册的法律实体，用于开具 Layer 1 发票；知识库（Knowledge Base）的内容维护和信息源管理。

### 2.2 CP Portal（渠道合作方）：业务运营与营收中心

CP Portal 是渠道方的"经销商门店"，承担了原本 GEA 系统中面向客户的大部分前端商业化工作。CP 的核心诉求是赚钱——通过在 EG 底价上加价来获取利润。

#### 2.2.1 全权管理客户 (Client Management - Full Control)

CP 对其名下的终端客户拥有**完全的管理权**，不需要 EG 审批。这是因为 CP 和 Client 之间的商务合同是独立签署的，与 EG 无关。具体操作包括：

**客户录入与入驻**：CP 自主录入客户的基础信息（公司名称、注册地址、联系人等），上传 CP 与 Client 签署的服务协议（MSA）。系统生成带有 CP 品牌的邀请链接，发送给客户的联系人。客户收到邀请后注册并登录 Client Portal，看到的是 CP 的品牌，完全不知道 EG 的存在。

**客户信息维护**：CP 可以随时更新客户的公司信息、联系人列表、合同文件等。

**开通 Client Portal 权限**：CP 决定客户的哪些联系人可以登录 Client Portal，以及他们的门户角色（admin / finance / hr / viewer）。

**管理客户押金与钱包**：CP 向客户开具 `deposit` 类型的 Layer 2 发票，客户支付后资金进入客户在 CP 这里的 Frozen Wallet。员工离职后，CP 通过 Release Tasks 将对应金额释放至客户的 Normal Wallet 或退回客户的银行账户。这套逻辑与 EG 管理 CP 押金的逻辑完全对称，且与 EG 完全无关。

#### 2.2.2 配置客户价格与报价 (Pricing & Quotations)

CP 的利润来源于在 EG 底价基础上的加价。CP 可以在 CP Portal 中自主配置面向每个客户的定价策略（存储在 `cpClientPricing` 表中），支持固定人头费、按比例加价、混合模式等。CP 还可以使用系统的成本计算器，在 EG 底价基础上加上自己的利润后，生成白标报价单（Quotations）发送给潜在客户。报价单上显示的是 CP 的品牌和联系方式。

#### 2.2.3 协助员工补充资料 (Employee Co-management)

在 B2B2B 模式下，员工的入职资料可能由三方共同补充完善：员工本人通过 Worker Portal 提交、终端客户通过 Client Portal 补充、CP 作为中间桥梁协助收集和跟进。

CP 在 CP Portal 中可以看到名下所有客户的员工列表及其完整信息（包括姓名、职位、入职状态、联系方式、国籍、工作国家等），以便为客户提供服务支持。CP 可以协助补充和完善员工的非硬数据资料（如联系方式、紧急联系人、证件扫描件等），但 **绝对不能修改**以下底层硬数据：员工的实际工资金额（Base Salary）、社保基数与扣缴明细、个税计算方案、银行卡号（Bank Details）、劳动合同条款。这些数据的修改权专属于 EG 的 Super Admin。

**编辑锁定规则同样适用于 CP Portal**：当员工档案处于可编辑状态（Draft）时，CP 可以自由补充非硬数据资料；一旦档案进入 `Pending Review` 状态，CP 的所有编辑权即刻锁定，与 Client Portal 的行为完全一致。

#### 2.2.4 审阅 Operations 信息 (Operations Oversight - Read Only)

CP 可以在 CP Portal 中查看名下所有客户的运营信息，包括：每月 Payroll 的运行状态和进度；员工的请假审批记录和剩余假期天数；员工的报销申请及处理状态；薪资调整（Adjustments）的记录。

这些信息对 CP 来说是"只读"的。CP 查看这些信息的目的是为了及时向终端客户解答疑问、提供客户服务，而不是去干预底层的审批结果（审批权在 EG）。例如，如果终端客户问 CP "我的员工这个月工资为什么少了？"，CP 可以在系统中查看该员工的 Payroll 明细和 Adjustments 记录，然后向客户解释原因。

#### 2.2.5 前端开票与收款 (Invoicing & Receivables)

这是 CP 的核心收入环节。每月 Payroll 引擎运行后，系统在生成 Layer 1 发票的同时，会自动生成 Layer 2 发票的草稿。Layer 2 发票的金额 = 员工用工成本（与 Layer 1 一致）+ CP 的加价服务费（基于 `cpClientPricing` 计算）。

CP 在 CP Portal 中对 Layer 2 草稿进行最终确认。在确认过程中，CP 可以：添加自定义收费项（如线下咨询费、额外的行政服务费等），这些费用纯粹属于 CP 的额外利润，不会反映在 Layer 1 中，也与 EG 无关；调整发票的备注信息和付款条款。

确认无误后，CP 点击"Publish & Send"，系统生成带有 CP 品牌的 PDF 发票并通过邮件发送给终端客户。终端客户通过线下银行转账将款项打入 CP 的真实银行账户（系统外行为），或者使用其在 CP 这里的 Normal Wallet 余额抵扣。CP 收到款项后，在 CP Portal 中手动将 Layer 2 发票标记为 Paid。

---

## 3. 发票与资金流转的统一逻辑 (Invoice & Wallet Engine)

### 3.1 统一的付款与核销逻辑

在套娃结构下，资金流转逻辑在所有层级（EG→CP，CP→Client，EG→Client）保持高度一致。**Wallet 本质上是一个"预付款账户"，提供便捷支付选项，而非强制扣款工具。** 系统绝不会自动从任何一方的钱包中扣款，所有扣款行为都必须由付款方主动发起或由收款方在确认到账后手动标记。

无论发票属于哪个层级，付款流程均遵循以下统一规则：

**第一步：系统生成 Draft 发票。** Invoice 引擎基于 Payroll 数据和对应的定价规则自动生成发票草稿，包含详细的费用明细项（Invoice Items）。

**第二步：确认发布 (Published/Sent)。** 收款方（EG 或 CP）审核发票内容无误后，将其发布并发送给付款方。此时发票状态从 Draft 变为 Sent。

**第三步：付款方选择支付方式。** 付款方有两种选择：

- **方式 A — Wallet 抵扣**：如果付款方的 Normal Wallet 中有足够余额，可直接在系统中点击"使用余额支付"。系统执行原子操作：扣减 Wallet 余额 + 将发票状态变为 Paid + 记录 Wallet Transaction。
- **方式 B — 线下转账**：付款方通过线下银行将款项打入收款方的真实银行账户。收款方查账确认收到款项后，在系统中手动将发票标记为 Paid。

### 3.2 三种业务场景的完整资金流转对照

| 维度 | 外部 CP - Layer 1 (`eg_to_cp`) | 外部 CP - Layer 2 (`cp_to_client`) | EG 直签 - 单层 (`eg_to_client`) |
| :--- | :--- | :--- | :--- |
| **业务含义** | EG 向 CP 收取底层成本 + EG 服务费 | CP 向 Client 收取用工成本 + CP 加价 | EG 直接向 Client 收取全部费用 |
| **发票生成者** | Super Admin (Invoice 引擎自动生成) | 系统自动生成草稿，CP 确认发布 | Super Admin (Invoice 引擎自动生成) |
| **付款方** | CP | Client | Client |
| **收款方** | EG | CP | EG |
| **Wallet 支付** | CP 用其在 EG 的 Normal Wallet 余额 | Client 用其在 CP 的 Normal Wallet 余额 | Client 用其在 EG 的 Normal Wallet 余额 |
| **线下转账** | CP 打款至 EG 银行账户 | Client 打款至 CP 银行账户 | Client 打款至 EG 银行账户 |
| **收款确认主体** | EG (Super Admin) | CP (CP Portal) | EG (Super Admin) |
| **Deposit Invoice** | EG 向 CP 开具 | CP 向 Client 开具 | EG 向 Client 开具 |
| **Frozen Wallet** | CP 在 EG 的 Frozen Wallet | Client 在 CP 的 Frozen Wallet | Client 在 EG 的 Frozen Wallet |
| **Release Tasks** | EG 释放 CP 的 Frozen → Normal 或退银行 | CP 释放 Client 的 Frozen → Normal 或退银行 | EG 释放 Client 的 Frozen → Normal 或退银行 |

### 3.3 发票类型的统一性

无论是 Layer 1、Layer 2 还是直签单层发票，支持的发票类型（`invoiceType`）完全一致，包括：

| 发票类型 | 说明 | 适用场景 |
| :--- | :--- | :--- |
| `deposit` | 押金发票 | 新员工入职时收取押金 |
| `monthly_eor` | 月度 EOR 服务费 | 每月常规结算 |
| `monthly_visa_eor` | 含签证的 EOR 服务费 | 涉及签证办理的员工 |
| `monthly_aor` | 月度 AOR 服务费 | 独立承包商 |
| `visa_service` | 签证服务费 | 单独的签证办理 |
| `deposit_refund` | 押金退款 | 员工离职后退还押金 |
| `credit_note` | 红字发票/贷项通知单 | 冲抵错误账单 |
| `manual` | 手动发票 | 特殊收费项 |

### 3.4 两级 Invoice 状态机的解耦

虽然 Layer 1 和 Layer 2 共享同一个 `invoices` 表和同一套 `status` 枚举值，但在产品交互层面，它们的状态流转含义和操作主体完全不同，必须在 UI 上严格隔离展示。

**Layer 1 (EG → CP) 的状态流转：**

`Draft` → EG 财务审核底层成本无误 → `Sent` → CP 收到账单，选择 Wallet 支付或线下转账 → EG 确认收款 → `Paid`

如果 CP 逾期未付：`Sent` → 超过 Due Date → `Overdue` → CP 最终付款 → `Paid`

如果发现错误需要作废：任何状态 → `Cancelled` 或 `Void`

**Layer 2 (CP → Client) 的状态流转：**

`Draft` → CP 审核加价和自定义收费项 → CP 点击 Publish & Send → `Sent` → Client 收到账单，选择 Wallet 支付或线下转账 → CP 确认收款 → `Paid`

如果 Client 逾期未付：`Sent` → 超过 Due Date → `Overdue` → CP 发送催款提醒 → Client 最终付款 → `Paid`

**关键区别**：Layer 1 的所有操作在 Super Admin 中完成，Layer 2 的所有操作在 CP Portal 中完成。在 Super Admin 的 Invoices 页面中，必须通过强制的 Tab 隔离（`Layer 1` / `Layer 2` / `Direct`）来防止运营人员混淆。

---

## 4. EG-DIRECT (直签客户) 场景的特殊处理

### 4.1 设计原则：不破坏套娃结构

在 B2B2B 模式中，EG 偶尔也会直接签约终端客户（如战略客户或特殊合作）。为了不破坏套娃结构的系统一致性，系统引入了 **"EG-DIRECT" 虚拟 CP** 的概念。

> **核心逻辑：EG-DIRECT 是一个"EG 自己做自己的经销商"的概念。套娃结构不变，只是这一层 CP 恰好是 EG 自己。**

在数据库层面，`channelPartners` 表中存在一条 `isInternal = true` 的记录，其 `companyName` 为 "EG-DIRECT"，`subdomain` 为 null（因为不需要独立的白标域名）。所有 EG 直签的终端客户，其 `customers.channelPartnerId` 统一指向这条记录的 ID。

直签客户登录 Client Portal 时，系统检测到其所属 CP 的 `isInternal = true`，于是使用 EG 自己的品牌配置（Logo、主题色）来渲染界面。客户看到的就是 Extend Global 的品牌。

### 4.2 解决 Super Admin 的权限矛盾：CP 视角切换器 (Context Switcher)

在正常逻辑中，Super Admin 对 Client 是"只读"的，因为客户归 CP 管。但直签客户没有外部 CP 来管理，必须由 EG 的运营人员来承担 CP 的角色（包括编辑客户信息、开票、管 Wallet 等）。

为了优雅地解决这个权限矛盾，**Super Admin 将引入一个全局的"CP 视角切换器 (Context Switcher)"**，类似于 AWS Console 切换 Account 或 Shopify 切换 Store 的概念。这个切换器位于 Admin Portal 的顶部导航栏，始终可见。

**视角模式一：默认上帝视角 (All Partners)**

这是 Super Admin 的默认状态。在此视角下，运营人员看到所有 CP 的汇总数据，可以管理底层交付（Payroll、Employee、Compliance）和 EG 与所有 CP 之间的结算。对所有终端客户数据保持**只读**。

**视角模式二：切换至外部 CP (如 "ACME Corp")**

视图自动降维，仅显示该 CP 名下的客户和员工数据。主要用于排查问题、审计数据、查看该 CP 的 Layer 2 开票情况。对该 CP 名下的客户数据依然保持**只读**（因为那是别人的 CP，EG 不应干预）。

**视角模式三：切换至 EG-DIRECT**

视图降维至 EG 自己的直签客户。此时系统**自动解锁 CP 级别的管理权限**，因为 EG 就是这个虚拟 CP 的 owner。EG 运营人员在此视角下等同于登录了 CP Portal，可以执行以下操作：创建和编辑客户信息、上传合同、开通 Client Portal 权限、管理客户的 Wallet 和 Frozen Wallet、配置客户价格、开具和发送发票、确认客户收款。

**未来可扩展性**：如果将来 EG 需要"代管"某个外部 CP（例如 CP 暴雷，EG 临时接管其客户），只需在权限系统中将该 CP 标记为"EG 可管理"，Admin 切换到该 CP 视角时就自动拥有管理权，不需要修改任何代码逻辑。

### 4.3 直签客户的发票生成逻辑

当 Invoice 引擎检测到客户归属于 `isInternal = true` 的 CP 时，执行以下特殊逻辑：

1. **跳过双层发票生成**：不生成 Layer 1 和 Layer 2 两张发票（因为"EG 给自己开 Layer 1 发票"毫无意义）。
2. **直接生成单层发票**：生成一张 `invoiceLayer = eg_to_client` 的发票。这张发票代表 EG 直接向终端客户收取的最终费用。
3. **定价规则**：使用 `cpClientPricing` 表中为该客户配置的价格（由 EG 运营人员在 EG-DIRECT 视角下配置），而非 `cpPricingRules`（因为没有中间商加价的概念）。

### 4.4 EG-DIRECT 的 Wallet 处理

**EG-DIRECT 的 CP Wallet**：理论上不需要存在（EG 不需要"向自己预存钱"）。系统可以保留这条 Wallet 记录但余额永远为 0，或者在 UI 上直接隐藏。

**直签客户的 Client Wallet**：这才是真正有意义的。直签客户付 Deposit → 进入客户在 EG-DIRECT 下的 Frozen Wallet → 员工离职 → EG 通过 Release Tasks 释放到客户的 Normal Wallet 或退回银行。操作主体是 EG 运营人员，在 Super Admin 的 EG-DIRECT 视角下执行。

---

## 5. Super Admin 导航栏重构方案

基于上述职责分工，Admin Portal 的导航栏需要从"GEA 直客思维"重构为"EG B2B2B 思维"。以下是建议的新导航结构：

| 导航分组 | 包含模块 | 核心说明 |
| :--- | :--- | :--- |
| **Partner Hub** | Partners (CP 列表)、CP Wallets、CP Pricing | 提升至第一优先级。CP 是 EG 的"客户"，是系统的第一公民。 |
| **Operations** | Payroll、Adjustments、Reimbursements、Leave & Milestones、Contractor Invoices | EG 的核心交付工作，按员工维度运营。 |
| **Finance & Settlement** | Invoices (L1/L2/Direct Tab 隔离)、P&L Report、Reconciliation、Release Tasks | EG 的资金结算中心，按发票层级隔离展示。 |
| **Client Directory** | Customers、People (Employees + Contractors) | 降级为只读检索池，默认按 CP 分组展示。切换到 EG-DIRECT 视角时解锁编辑权。 |
| **Vendor** | Vendors、Vendor Bills | EG 的供应商管理，用于成本核算。 |
| **Sales** | CRM Pipeline、Quotations、Country Guide | 销售相关工具。 |
| **System** | Settings、Knowledge Base Admin、Country Guide Admin、Billing Entities、Audit Logs | 系统级配置与维护。 |

---

## 6. CP Portal 功能模块清单

基于 CP 的职责定义，CP Portal 需要从当前的"只读看板"升级为完整的"业务操作系统"。以下是 CP Portal 的完整功能模块清单：

| 模块 | 当前状态 | 目标状态 | 核心功能说明 |
| :--- | :--- | :--- | :--- |
| **Dashboard** | 已实现（基础） | 需增强 | 增加利润看板：总营收 (L2) - 底层成本 (L1) = 毛利。展示活跃客户数、活跃员工数、待收款金额、钱包余额。 |
| **Clients** | 已实现（只读） | 需重构为完全管理 | 客户 CRUD、合同上传、Client Portal 权限管理、客户 Wallet/Frozen Wallet 管理、Deposit Invoice 开具、Release Tasks。 |
| **Pricing** | 已实现 | 保持 | 管理 CP→Client 的定价规则。 |
| **Quotations** | 未实现 | 需新增 | 从 Admin 下放。CP 基于成本计算器加价后生成白标报价单。 |
| **Invoices** | 已实现（基础） | 需增强 | 分为 Payables (L1，EG 发来的账单) 和 Receivables (L2，发给客户的账单)。L2 支持添加自定义收费项。 |
| **Wallet** | 已实现 | 保持 | 查看 CP 在 EG 的 Normal Wallet 余额和交易记录。 |
| **Employees** | 已实现（只读） | 需增强 | 协助补充员工资料，查看完整员工信息，但不能修改底层硬数据。 |
| **Operations Overview** | 未实现 | 需新增 | 只读查看 Payroll 进度、Leave 审批、Reimbursements 状态、Adjustments 记录。 |
| **Settings** | 已实现 | 需增强 | CP 品牌配置（Logo、Favicon、主题色）、开票信息（Billing Entity、Tax ID）、银行账户信息、用户管理。品牌和开票信息从 Admin 下放至此，由 CP 自行维护。 |

---

## 7. 数据权限矩阵

以下矩阵详细定义了每个角色对每类数据的访问权限。**R** = Read（只读），**W** = Write（可编辑），**-** = 无权限。

| 数据类型 | Super Admin (上帝视角) | Super Admin (EG-DIRECT 视角) | CP Portal | Client Portal | Worker Portal |
| :--- | :--- | :--- | :--- | :--- | :--- |
| CP 配置 - 商务信息 (域名/底价) | W | - | R (自己的) | - | - |
| CP 配置 - 品牌与开票 (Logo/色调/银行账户) | R | - | W (自己的) | - | - |
| CP Wallet / Frozen Wallet | W | - | R (自己的) | - | - |
| 客户基础信息 | R | W | W (自己的客户) | R (自己的) | - |
| 客户合同文件 | R | W | W (自己的客户) | R (自己的) | - |
| Client Portal 权限 | R | W | W (自己的客户) | - | - |
| 客户 Wallet / Frozen Wallet | R | W | W (自己的客户) | R (自己的) | - |
| 客户定价规则 | R | W | W (自己的客户) | - | - |
| 员工基础信息 (姓名/职位/国家) | W | W | R/W (Draft 状态可编辑，Pending Review 后锁定) | R/W (Draft 状态可编辑，Pending Review 后锁定) | R (自己的) |
| 员工硬数据 (工资/社保/合同/银行卡) | W | W | - | - | R (自己的) |
| Payroll 数据 | W | W | R (自己客户的) | R (自己的) | R (自己的 Payslip) |
| Leave 审批 | W | W | R (自己客户的) | R (自己的员工) | R/W (自己的) |
| Reimbursements 审批 | W | W | R (自己客户的) | R (自己的员工) | R/W (自己的) |
| Adjustments | W | W | R (自己客户的) | R (自己的) | R (自己的) |
| Layer 1 发票 | W | - | R (自己的) | - | - |
| Layer 2 发票 | R | - | W (自己的) | R (自己的) | - |
| 直签发票 (eg_to_client) | - | W | - | R (自己的) | - |
| Vendor / Vendor Bills | W | W | - | - | - |
| Country Guide / Holidays | W | W | R | R | R |
| Exchange Rates | W | W | R | - | - |
| Audit Logs | R | R | R (自己的) | - | - |

---

## 8. 实施路线图 (Roadmap)

为确保重构平稳落地，建议按以下阶段推进开发：

### Phase 1: 导航重构与视角切换 (Quick Win，预计 1-2 周)

本阶段的目标是在不改变底层数据模型的前提下，通过 UI 层面的调整让系统"看起来"像一个 B2B2B 平台。

具体任务包括：重排 Super Admin 导航栏，将 Partner Hub 提升至第一位；在 Super Admin 顶部实现全局的 CP 视角切换器（Context Switcher），支持 All Partners / 具体 CP / EG-DIRECT 三种模式；处理 EG-DIRECT 视角下的权限提升逻辑（对 Client 数据从只读变为可编辑）；在 Invoices 列表页增加强制的 Layer 1 / Layer 2 / Direct Tab 隔离；在 Customers 列表页默认增加 Group by Partner 视图。

### Phase 2: CP Portal 赋权与套娃闭环 (Core Value，预计 2-3 周)

本阶段的目标是让 CP Portal 从"只读看板"升级为完整的"业务操作系统"，实现上层套娃的闭环。

具体任务包括：在 CP Portal 中实装完整的客户管理工作流（Client CRUD，无需 EG 审批）；在 CP Portal 中实装客户 Wallet / Frozen Wallet / Deposit Invoice / Release Tasks 的完整管理功能；在 CP Portal 引入 Quotations 模块，允许 CP 生成白标报价；完善 CP Portal 的 Invoice 模块，将其分为 Payables (L1) 和 Receivables (L2)，并允许 CP 在 L2 草稿上添加自定义收费项；在 CP Portal 增加 Operations Overview 模块（只读查看 Payroll / Leave / Reimbursements）；增强 CP Dashboard，加入利润看板。

### Phase 3: 资金与押金的双层隔离 (Advanced，预计 2 周)

本阶段的目标是确保底层套娃（EG 管 CP）和上层套娃（CP 管 Client）在资金层面完全隔离且自洽。

具体任务包括：确保 Release Tasks 在 Layer 1 和 Layer 2 之间严格隔离执行（EG 的 Release Tasks 只释放 CP 的 Frozen Wallet，CP 的 Release Tasks 只释放 Client 的 Frozen Wallet）；在 Schema 中补充 `eg_to_client` 枚举值到 `invoiceLayer` 字段；实现双层发票引擎对 `eg_to_client` 类型的完美兼容（当前代码中 `isInternal` 检测已存在，但需要确保所有下游逻辑都正确处理）；实现 Credit Note 在 L1 和 L2 之间的独立生成与冲抵逻辑。

---

*本文档作为 Extend Global 平台核心架构的 Source of Truth，任何后续的业务功能开发均需严格遵循本文档定义的边界与职责。文档版本将随系统迭代持续更新。*
