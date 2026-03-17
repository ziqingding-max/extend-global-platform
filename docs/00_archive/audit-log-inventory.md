# EOR SaaS Admin — 审计日志清单

> **版本**: v1.0 | **更新日期**: 2026-02-25

本文档列出系统中所有会产生审计日志的操作，以及日志记录的字段和触发条件。

---

## 1. 审计日志结构

每条审计日志包含以下字段：

| 字段 | 说明 |
|------|------|
| userId | 操作人 ID（NULL = 系统自动操作） |
| userName | 操作人名称 |
| action | 操作类型（如 create, update, delete） |
| entityType | 实体类型（如 customer, employee, payroll_run） |
| entityId | 实体 ID |
| changes | 变更详情（JSON 格式，包含操作参数） |
| ipAddress | 操作者 IP 地址 |
| userAgent | 浏览器 User Agent |
| createdAt | 操作时间 |

---

## 2. 已实现的审计日志操作

### 2.1 客户管理

| 操作 | entityType | action | 触发条件 |
|------|-----------|--------|----------|
| 创建客户 | `customer` | `create` | 新建客户记录 |
| 编辑客户 | `customer` | `update` | 修改客户信息 |
| 创建客户联系人 | `customer_contact` | `create` | 添加联系人 |
| 编辑客户联系人 | `customer_contact` | `update` | 修改联系人 |
| 删除客户联系人 | `customer_contact` | `delete` | 删除联系人 |
| 创建客户定价 | `customer_pricing` | `create` | 添加定价规则 |
| 编辑客户定价 | `customer_pricing` | `update` | 修改定价规则 |
| 删除客户定价 | `customer_pricing` | `delete` | 删除定价规则 |
| 上传客户合同 | `customer_contract` | `create` | 上传合同文件 |
| 编辑客户合同 | `customer_contract` | `update` | 修改合同状态 |
| 删除客户合同 | `customer_contract` | `delete` | 删除合同 |

### 2.2 员工管理

| 操作 | entityType | action | 触发条件 |
|------|-----------|--------|----------|
| 创建员工 | `employee` | `create` | 新建员工记录 |
| 编辑员工 | `employee` | `update` | 修改员工信息 |
| 上传员工合同 | `employee_contract` | `create` | 上传合同 |
| 编辑员工合同 | `employee_contract` | `update` | 修改合同 |
| 删除员工合同 | `employee_contract` | `delete` | 删除合同 |
| 上传员工文件 | `employee_document` | `create` | 上传文件 |
| 删除员工文件 | `employee_document` | `delete` | 删除文件 |

### 2.3 薪酬管理

| 操作 | entityType | action | 触发条件 |
|------|-----------|--------|----------|
| 创建薪酬批次 | `payroll_run` | `create` | 手动或自动创建 |
| 编辑薪酬批次 | `payroll_run` | `update` | 修改状态/备注 |
| 提交审批并锁定 | `payroll_run` | `payroll_submit_lock` | 提交审批时锁定关联异动/假期 |
| 自动填充薪酬明细 | `payroll_item` | `auto_fill` | 执行自动填充 |
| 编辑薪酬明细 | `payroll_item` | `update` | 修改明细项 |
| 删除薪酬明细 | `payroll_item` | `delete` | 删除明细项 |
| 角色变更 | `payroll_run` | `update_role` | 变更用户角色 |

### 2.4 异动薪酬

| 操作 | entityType | action | 触发条件 |
|------|-----------|--------|----------|
| 创建异动 | `adjustment` | `create` | 提交新异动 |
| 编辑异动 | `adjustment` | `update` | 修改异动（submitted 状态） |
| 删除异动 | `adjustment` | `delete` | 删除异动（submitted 状态） |
| 上传报销凭证 | `adjustment` | `upload_receipt` | 上传凭证文件 |

### 2.5 假期管理

| 操作 | entityType | action | 触发条件 |
|------|-----------|--------|----------|
| 创建假期记录 | `leave_record` | `create` | 提交请假 |
| 编辑假期记录 | `leave_record` | `update` | 修改请假（submitted 状态） |
| 删除假期记录 | `leave_record` | `delete` | 删除请假 |
| 取消假期记录 | `leave_record` | `cancel` | 取消请假 |

### 2.6 发票管理

| 操作 | entityType | action | 触发条件 |
|------|-----------|--------|----------|
| 生成月度发票 | `invoices` | `generate` | 从薪酬数据生成发票 |
| 重新生成发票 | `invoices` | `regenerate` | 删除草稿并重新生成 |
| 创建发票 | `invoice` | `create` | 手动创建发票 |
| 编辑发票 | `invoice` | `update` | 修改发票信息/状态 |
| 添加行项目 | `invoice_item` | `create` | 添加发票行项目 |
| 编辑行项目 | `invoice_item` | `update` | 修改行项目 |
| 删除行项目 | `invoice_item` | `delete` | 删除行项目 |

### 2.7 系统管理

| 操作 | entityType | action | 触发条件 |
|------|-----------|--------|----------|
| 创建国家配置 | `country_config` | `create` | 新建国家配置 |
| 批量创建国家 | `country_config` | `batch_create` | 批量预置国家 |
| 编辑国家配置 | `country_config` | `update` | 修改国家设置 |
| 删除国家配置 | `country_config` | `delete` | 删除国家 |
| 创建假期类型 | `leave_type` | `create` | 添加假期类型 |
| 编辑假期类型 | `leave_type` | `update` | 修改假期类型 |
| 删除假期类型 | `leave_type` | `delete` | 删除假期类型 |
| 创建账单主体 | `billing_entity` | `create` | 新建账单主体 |
| 编辑账单主体 | `billing_entity` | `update` | 修改账单主体 |
| 删除账单主体 | `billing_entity` | `delete` | 删除账单主体 |
| 新增/编辑汇率 | `exchange_rate` | `upsert` | 创建或更新汇率 |
| 删除汇率 | `exchange_rate` | `delete` | 删除汇率记录 |
| 初始化默认汇率 | `exchange_rates` | `initialize` | 批量初始化汇率 |

### 2.8 自动化操作（Cron Jobs）

| 操作 | entityType | action | 触发条件 |
|------|-----------|--------|----------|
| 员工自动激活 | `employee` | `employee_auto_activated` | contract_signed → active（startDate ≤ 今天） |
| 员工自动加入薪酬 | `payroll_run` | `employee_auto_added_to_payroll` | 激活后自动加入当月薪酬批次 |
| 员工自动请假 | `employee` | `employee_auto_on_leave` | 假期开始日到达 |
| 员工自动恢复 | `employee` | `employee_auto_return_from_leave` | 假期结束日到达 |
| 薪酬批次自动创建 | `payroll_run` | `payroll_run_auto_created` | 每月5日自动创建 |
| 月度自动锁定 | `system` | `auto_lock_monthly` | 每月5日锁定上月异动/假期 |

---

## 3. 审计日志查看

审计日志通过 **Settings → Audit Logs** 页面查看，仅 `admin` 角色有权访问。支持按时间范围、操作类型、实体类型筛选。
