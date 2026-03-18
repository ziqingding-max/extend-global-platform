# 劳动者分类与合规规则 (Worker Classification Rules)

## 1. 分类原则

### 1.1 Employee (EOR 模式)
*   **合约方**: GEA (或当地实体) 与 劳动者。
*   **性质**: 劳动合同 (Employment Contract)。
*   **系统状态**: 拥有完整的 Onboarding 流程 (`pending` -> `onboarding` -> `active`)。
*   **权益**: 享有法定年假、社保、并受当地劳动法解雇保护。

### 1.2 Contractor (AOR 模式)
*   **合约方**: GEA 与 承包商 (Service Agreement)。
    *   *注意*: 虽然承包商为客户工作，但法律形式上是承包商向 GEA 提供服务，GEA 再向客户转售服务 (Back-to-Back)。
*   **性质**: 服务协议 (Service Agreement)。
*   **系统状态**: 简化流程 (`pending` -> `active`)，无 Onboarding 状态。
*   **权益**: 无带薪假 (PTO)、无社保 (由承包商自行申报)。

---

## 2. 关键合规差异

| 维度 | Employee (EOR) | Contractor (AOR) |
| :--- | :--- | :--- |
| **发票流** | 仅 Client Invoice | Contractor Inv -> Client Inv (背对背) |
| **税收** | GEA 代扣代缴 (Withholding) | 承包商自行申报 (Self-reporting) |
| **付款周期** | 固定月薪 (Monthly) | 支持 Hourly, Milestone, Fixed |
| **入职** | 需收集完整 KYC & 银行 & 社保信息 | 仅需 KYC & 银行 & W8/W9 表格 |
| **系统表** | `employees` | `contractors` |

---

## 3. 风险控制
*   **误分类风险**: 严禁在 AOR 模块中出现 "Salary" (薪水) 字眼，统一使用 "Service Fee" (服务费) 或 "Rate" (费率)。
*   **福利限制**: AOR 承包商不应在该平台申请休假 (Leave) 或 报销福利 (Benefits)，除非作为服务费的一部分开具发票。
