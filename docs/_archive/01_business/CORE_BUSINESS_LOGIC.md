# 核心业务逻辑架构 (Core Business Logic)

## 1. 系统概述 (System Overview)
GEA Platform 是一个全球化的名义雇主 (EOR) 和代理记录 (AOR) 平台。系统通过三个独立的门户连接四方角色，但底层数据模型严格区分 **Employee (EOR)** 和 **Contractor (AOR)**。

### 1.1 核心角色 (Core Roles)
*   **Customer (客户)**: 购买服务的企业。
*   **Employee (EOR)**: 全职员工，与 GEA (或合作伙伴) 签署劳动合同。
*   **Contractor (AOR)**: 独立承包商，与 GEA 签署服务协议 (Service Agreement)。
*   **Vendor (供应商)**: 提供落地服务的当地合作伙伴。

---

## 2. 核心实体与生命周期 (Entities & Lifecycle)

### 2.1 客户 (Customer)
*   **定义**: 购买平台服务的企业实体。
*   **生命周期 (Status)**:
    *   **Sales Lead**: 销售线索，位于 CRM 模块 (`sales_leads` 表)。
    *   **Active**: 签署 MSA 后，由销售/Admin 转化为正式客户。**注意：系统无 `onboarding` 状态，创建即 `active`**。
    *   **Suspended**: 欠费或违规，暂停服务。
    *   **Terminated**: 终止合作。
*   **关键关联**: `customer_pricing` (定价), `customer_wallets` (资金).

### 2.2 EOR 员工 (Employee)
*   **法律关系**: GEA (Employer) <-> Employee。
*   **表结构**: `employees`
*   **生命周期 (Status)**:
    1.  **Pending Review**: 客户发起入职邀请，待 Admin 审核。
    2.  **Documents Incomplete**: 员工资料未提交齐全。
    3.  **Onboarding**: 资料齐全，正在进行合规检查/合同签署。
    4.  **Contract Signed**: 合同已签署，等待入职日 (`startDate`)。
    5.  **Active**: 到达入职日，正常在职。
    6.  **On Leave**: 处于长期休假中。
    7.  **Offboarding**: 发起离职流程。
    8.  **Terminated**: 正式离职。

### 2.3 AOR 承包商 (Contractor)
*   **法律关系**: GEA (Service Provider) <-> Contractor。**注意：承包商与 GEA 签署服务协议，而非直接与客户签署。**
*   **表结构**: `contractors` (独立于 employees 表)
*   **生命周期 (Status)**:
    1.  **Pending Review**: 邀请/创建中。
    2.  **Active**: 审核通过，服务中。**(无 Onboarding 状态)**
    3.  **Terminated**: 服务终止。

---

## 3. 核心业务流程 (Core Workflows)

### 3.1 客户转化 (Customer Conversion)
1.  **Sales Lead**: 销售在 CRM 中跟进。
2.  **Conversion**: 签署线下 MSA 后，Admin 在系统创建 Customer。
3.  **Pricing**: 配置 `customer_pricing` (Global Discount 或 Country Fixed Price)。
4.  **Wallet**: 系统自动创建多币种钱包 (`customer_wallets`)。

### 3.2 AOR 业务流 (Contractor Flow)
AOR 业务采用 **背对背 (Back-to-Back)** 模式：
1.  **签约**: Contractor 与 GEA 签署服务协议。
2.  **请款 (Invoicing)**:
    *   **Step 1**: 系统/承包商生成 **Contractor Invoice** (`contractor_invoices` 表)，向 GEA 请款。
    *   **Step 2**: GEA 生成 **Client Invoice** (`invoices` 表，类型 `monthly_aor`)，向客户请款。包含：承包商费用 + GEA 服务费。
3.  **资金流 (Payment)**:
    *   客户支付 Client Invoice -> 资金进入 GEA 账户。
    *   GEA 支付 Contractor Invoice -> 资金流向承包商。

### 3.3 EOR 薪酬流 (Payroll Flow)
1.  **Payroll Run**: 每月 5 日自动生成 `payroll_runs`。
2.  **Invoicing**: 基于 Payroll 计算结果，生成 **Client Invoice** (类型 `monthly_eor`)。
3.  **Payment**: 客户支付 Invoice。
4.  **Disbursement**: GEA 向员工发放薪资 (Net Salary) 并向税务局缴纳税费。

---

## 4. 权限与隔离 (Permissions)
*   **Admin Portal**: 全局管理 (`admin` 角色)。
*   **Client Portal**: 仅访问本公司数据 (`customer_manager` / `finance` 角色)。
*   **Worker Portal**: 仅访问本人数据 (`worker` 角色)。
*   **数据隔离**:
    *   EOR 数据存储于 `employees`。
    *   AOR 数据存储于 `contractors`。
    *   两者互不相通，ID 体系独立。
