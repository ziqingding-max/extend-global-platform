# tRPC 路由清单 (tRPC Routers Reference)

Extend Global (EG) 平台采用 tRPC 作为前后端通信的唯一桥梁。通过 tRPC，后端定义的类型可以无缝推导至前端，实现了端到端的类型安全。

本文档汇总了系统中所有 34 个核心 tRPC Router 的职责说明，是开发人员查找 API 接口的快速索引。

> **代码路径**: `server/routers/*.ts`
> **主入口**: `server/routers/_core/routers.ts` (AppRouter 聚合点)

## 1. 核心业务路由 (Core Business Routers)

### 1.1 组织与角色
* **`channelPartners.ts`**: CP 管理。包含 CP 的创建、列表查询、白标配置更新、状态切换等。
* **`customers.ts`**: 终端客户管理。包含客户的创建、信息更新、归属 CP 查询。
* **`employees.ts`**: EOR 员工生命周期管理。包含员工入职邀请、状态流转、基础信息更新。
* **`contractors.ts`**: AOR 承包商管理。包含服务协议信息、费用配置。
* **`users.ts` / `userManagement.ts`**: 系统账号管理。包含各角色的注册、登录、密码重置、个人信息更新。

### 1.2 日常运营 (HR & Operations)
* **`leave.ts`**: 请假管理。包含员工提交请假申请、Client/Admin 审批、假期余额查询。
* **`reimbursements.ts`**: 费用报销管理。包含提交报销单、上传凭证、审批流程。
* **`customerLeavePolicies.ts`**: 客户级别的定制化请假政策配置（覆盖国家默认指南）。

## 2. 财务与计费路由 (Finance Routers)

这是系统中逻辑最重、交互最频繁的模块组。

### 2.1 账单与发票
* **`invoices.ts`**: 发票的 CRUD 操作。包含查询列表、获取详情、更新状态（如标记为 Paid）。
* **`invoiceGeneration.ts`**: 发票生成引擎的触发入口。包含手动触发某个月份的双层发票生成。
* **`pdfParsing.ts`**: 负责调用后端服务，生成白标 PDF 发票并返回下载链接。

### 2.2 资金与钱包
* **`fundFlow.ts`**: 核心资金流转入口。包含 CP 钱包余额查询、手动支付 Layer 1 发票、资金流水查询。
* **`allocations.ts`**: 资金分配与冲抵记录管理。

### 2.3 对账与利润分析
* **`vendorBills.ts`**: 供应商账单管理。包含上传 Vendor Bill、解析账单总额。
* **`reconciliation.ts`**: 双币种对账引擎的入口。包含自动匹配 Invoice 与 Vendor Bill、人工确认差异（Variance）。
* **`netPnl.ts`**: 净额法 P&L 报表数据源。包含按 CP、国家、时间段聚合净收入与毛利。
* **`fxStripping.ts`**: 汇差剥离引擎的专用查询接口。

### 2.4 定价与计算
* **`calculationRouter.ts`**: 触发特定员工或批量的薪资试算（Payroll Run）。
* **`payroll.ts`**: 薪酬批次管理。包含查看生成的 Payroll Items、确认发薪批次。
* **`adjustments.ts`**: 发票调整项（如红字冲抵、额外扣款）的管理。

## 3. 销售与合规路由 (Sales & Compliance)

### 3.1 销售转化
* **`sales.ts` / `salesLeads.ts`**: CRM 线索管理。
* **`quotationRouter.ts`**: 报价单生成工具。根据国家指南和预估薪资生成对客报价。

### 3.2 合规知识库
* **`countryGuideRouter.ts` / `countries.ts`**: 国家指南管理。包含各国的法定社保费率、封顶线、法定假期天数配置。
* **`knowledgeBaseAdmin.ts`**: AI 合规知识库管理。包含上传合规文档、训练 AI 模型。
* **`salaryBenchmarkRouter.ts`**: 全球薪资基准数据查询（供 Cost Simulator 使用）。

## 4. 系统与基础设施路由 (System Infrastructure)

* **`dashboard.ts`**: 提供各门户首页的聚合统计数据（如在职人数、待办事项、财务概览）。
* **`systemSettings.ts`**: 全局系统配置（如默认时区、通知开关）。
* **`exchangeRates.ts`**: 汇率管理。包含从第三方 API 同步最新汇率、配置对客加价汇率。
* **`notifications.ts`**: 站内信与系统通知管理。
* **`auditLogs.ts`**: 审计日志查询（仅限 Admin 访问）。

## 5. 如何在前端调用 tRPC 路由

前端通过 `@trpc/react-query` 提供的 Hook 进行调用，享受完整的类型提示。

**查询数据 (Query) 示例**：
```tsx
import { trpc } from '../utils/trpc';

function InvoiceList() {
  // 自动推导出 data 的类型为 Invoice[]
  const { data, isLoading } = trpc.invoices.list.useQuery({ 
    status: 'published',
    limit: 10
  });
  
  if (isLoading) return <div>Loading...</div>;
  return <div>{/* 渲染列表 */}</div>;
}
```

**提交数据 (Mutation) 示例**：
```tsx
import { trpc } from '../utils/trpc';

function PayButton({ invoiceId }) {
  const utils = trpc.useContext();
  const payMutation = trpc.fundFlow.payLayer1Invoice.useMutation({
    onSuccess: () => {
      // 支付成功后，使发票列表和钱包余额的缓存失效，触发重新请求
      utils.invoices.list.invalidate();
      utils.fundFlow.getWalletBalance.invalidate();
    }
  });

  return (
    <button onClick={() => payMutation.mutate({ invoiceId })}>
      Pay Now
    </button>
  );
}
```

了解上述路由的分布，可以帮助开发人员在接到新需求时，快速定位应该在哪个文件中添加或修改接口逻辑。
