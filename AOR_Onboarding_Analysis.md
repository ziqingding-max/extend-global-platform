# AOR (Agent of Record) 入职全流程产品分析报告

## 1. 概述

在 GEA 平台中，AOR（Agent of Record）服务用于管理独立承包商（Contractors）。与 EOR（Employer of Record）全职员工不同，AOR 承包商在生命周期、薪酬结构和法律关系上都有其独特性。

本报告对 AOR 入职流程的三个核心入口进行了全面的代码级产品分析：
1. **Client Portal - "Invite worker to fill"**（客户邀请，承包商自助填写）
2. **Client Portal - "I will fill in the details"**（客户代为填写全部信息）
3. **Admin Portal - 直接创建**（管理员在后台直接创建）

通过对比数据库 Schema 与各端前端表单、后端路由的实现，我们发现并整理了当前 AOR 入职流程中存在的数据断层、字段不一致以及显示 Bug。

## 2. 数据库 Schema 基础要求

AOR 承包商数据存储在独立的 `contractors` 表中（定义于 `drizzle/aor-schema.ts`），与 EOR 员工的 `employees` 表完全隔离。

### `contractors` 表核心字段要求：

| 字段类别 | 字段名 | 是否必填 | 备注说明 |
|----------|--------|----------|----------|
| **身份标识** | `contractorCode`, `customerId` | 是 | Code 为系统自动生成（如 CTR-0001） |
| **基础个人信息** | `firstName`, `lastName`, `email` | 是 | 核心身份信息 |
| **扩展个人信息** | `phone`, `dateOfBirth`, `nationality`, `idNumber`, `idType` | 否 | AOR 场景下通常为选填 |
| **服务地址** | `country` | 是 | 服务所在国家/地区 |
| **详细地址** | `address`, `city`, `state`, `postalCode` | 否 | 详细地址信息 |
| **服务详情** | `jobTitle`, `startDate`, `status` | 是 | 核心服务信息 |
| **扩展服务详情** | `department`, `endDate` | 否 | 部门及合同结束日期 |
| **财务配置** | `currency`, `paymentFrequency`, `rateType` | 是 | 默认：USD, monthly, fixed_monthly |
| **具体金额** | `rateAmount` | 视情况 | 当支付频率为 milestone 时可为空 |
| **银行信息** | `bankDetails` | 否 | JSON 格式存储收款账户信息 |

### 中间态存储：`onboarding_invites` 表

当使用 "Invite worker to fill" 流程时，数据会先暂存在 `onboarding_invites` 表中，待承包商完成自助入职后，再迁移至 `contractors` 表。该表已包含 AOR 专属字段：`paymentFrequency`, `rateAmount`, `contractorCurrency`。

## 3. 三端入口流程对比与问题分析

### 流程一：Client Portal - "Invite worker to fill" (邀请流程)

这是一个双向协作流程：客户填写工作与薪酬信息，发送邀请；承包商通过专属链接填写个人与收款信息。

**客户填写部分 (Step 1 & 2):**
- 服务类型 (AOR)
- 国家/地区、职位名称、部门 (选填)、开始日期、结束日期 (选填)
- 支付频率 (Monthly, Semi-monthly, Milestone)
- 币种、支付金额 (Milestone 除外)
- 承包商姓名与邮箱 (用于发送邀请)

**承包商自助填写部分 (Self-Onboarding):**
- 姓名、邮箱 (从邀请中预填，邮箱锁定)
- 电话、出生日期、性别、国籍、证件信息 (目前代码中错误地要求必填)
- 详细地址 (目前代码中错误地要求必填)
- **银行信息 (当前代码中被错误地跳过)**

**存在的问题 (Bugs):**
1. **列表显示异常 (Bug 1):** 客户在 Portal 发送 AOR 邀请后，页面提示 "2 awaiting response, 1 expired"，但列表实际不显示 AOR 邀请。经查，这是因为前端 `PortalOnboarding.tsx` 中的过滤逻辑或渲染逻辑对 AOR 类型的处理存在隐蔽缺陷。
2. **缺失银行信息收集 (Bug 2):** 在 `PortalSelfOnboarding.tsx` 第 153 行，代码明确写道 `const activeSteps = isAorInvite ? STEPS.filter((s) => s.id !== 3 && s.id !== 4) : STEPS;`，这导致 AOR 承包商无法填写银行收款信息。
3. **不合理的必填校验:** 自助入职 Step 1 的提交校验中，强制要求了 `dateOfBirth`, `gender`, `nationality`, `idType`, `idNumber`, `address`，这对于 AOR 承包商来说过于严格，应改为选填。

### 流程二：Client Portal - "I will fill in the details" (客户代填流程)

客户在一次会话中完成所有信息的填写。

**客户填写部分:**
- 服务类型 (AOR)
- 个人信息：姓名、邮箱
- 地址：国家/地区
- 服务信息：职位名称、部门、开始日期、结束日期
- 薪酬信息：支付频率、币种、支付金额

**存在的问题 (Bugs):**
1. **缺失银行信息步骤 (Bug 3):** 在 `PortalOnboarding.tsx` 中，`EMPLOYER_FILL_STEPS_AOR` 仅定义了 4 个步骤（Service, Basic Info, Engagement, Payment），缺少了 Bank Details 步骤。
2. **字段收集不全:** 相比 Schema 支持的字段，此流程缺少了电话、国籍、详细地址等选填字段的收集入口。

### 流程三：Admin Portal - 直接创建 (管理员流程)

管理员在后台 Employees/Contractors 页面直接创建承包商。

**管理员填写部分 (`ContractorCreateDialog.tsx`):**
- 归属客户 (Customer)
- 个人信息：姓名、邮箱
- 服务信息：职位名称、开始日期
- 地址：国家/地区
- 薪酬信息：币种、支付频率、支付金额
- 银行信息 (Bank Details)
- 默认审批人 (Default Approver)

**存在的问题 (Bugs):**
1. **字段收集不全:** 管理员表单缺少了电话、出生日期、国籍、证件信息、详细地址、部门、结束日期等字段，导致管理员无法录入完整的承包商档案。

## 4. 字段映射与对齐矩阵

下表展示了理想状态下（修复后）三端应如何统一收集 AOR 字段：

| 字段名 | Schema 要求 | 流程一 (邀请+自助) | 流程二 (客户代填) | 流程三 (Admin创建) |
|--------|-------------|--------------------|-------------------|--------------------|
| `firstName` / `lastName` | 必填 | 承包商填写 | 客户填写 | Admin 填写 |
| `email` | 必填 | 客户填写(邀请) | 客户填写 | Admin 填写 |
| `phone` | 选填 | 承包商填写 | 客户填写 (需补充) | Admin 填写 (需补充) |
| `dateOfBirth` | 选填 | 承包商填写 | 客户填写 (需补充) | Admin 填写 (需补充) |
| `nationality` | 选填 | 承包商填写 | 客户填写 (需补充) | Admin 填写 (需补充) |
| `idType` / `idNumber` | 选填 | 承包商填写 | 客户填写 (需补充) | Admin 填写 (需补充) |
| `country` | 必填 | 客户填写 | 客户填写 | Admin 填写 |
| `address` / `city` 等 | 选填 | 承包商填写 | 客户填写 (需补充) | Admin 填写 (需补充) |
| `jobTitle` | 必填 | 客户填写 | 客户填写 | Admin 填写 |
| `department` | 选填 | 客户填写 | 客户填写 | Admin 填写 (需补充) |
| `startDate` | 必填 | 客户填写 | 客户填写 | Admin 填写 |
| `endDate` | 选填 | 客户填写 | 客户填写 | Admin 填写 (需补充) |
| `paymentFrequency` | 必填 | 客户填写 | 客户填写 | Admin 填写 |
| `currency` | 必填 | 客户填写 | 客户填写 | Admin 填写 |
| `rateAmount` | 视情况必填 | 客户填写 | 客户填写 | Admin 填写 |
| `bankDetails` | 选填(强烈建议) | **承包商填写(需修复)** | **客户填写(需修复)** | Admin 填写 |

## 5. 修复方案建议

为了实现 AOR 入职全流程的三端统一，建议采取以下修复步骤：

### 阶段一：修复核心阻断性 Bug
1. **修复 AOR 邀请列表不显示问题**
   - 检查 `PortalOnboarding.tsx` 中的 `activeInvites` 渲染逻辑，确保 AOR 类型的邀请卡片正确渲染。
2. **补全 AOR 银行信息收集**
   - **自助入职端**：修改 `PortalSelfOnboarding.tsx`，移除对 AOR 隐藏 Step 4 (Bank Details) 的逻辑。
   - **客户代填端**：修改 `PortalOnboarding.tsx`，在 `EMPLOYER_FILL_STEPS_AOR` 中增加 Bank Details 步骤，并在 `submitAorMutation` 中传递 `bankDetails` 数据。
   - **后端路由**：更新 `portalEmployeesRouter.ts` 中的 `submitSelfServiceOnboarding` 和 `portalContractorsRouter.ts` 中的 `submitOnboarding`，确保 `bankDetails` 被正确序列化并存入 `contractors` 表。

### 阶段二：优化校验与字段对齐
1. **放宽 AOR 自助入职校验**
   - 在 `PortalSelfOnboarding.tsx` 中，针对 AOR 邀请，取消对 DOB、性别、国籍、证件和地址的强制必填校验。
2. **统一三端表单字段**
   - 扩展 Admin 端的 `ContractorCreateDialog.tsx`，增加缺失的选填字段（电话、国籍、地址、部门等）。
   - 扩展 Client Portal 的代填表单，增加相应的选填字段，确保客户和管理员拥有同等的数据录入能力。
