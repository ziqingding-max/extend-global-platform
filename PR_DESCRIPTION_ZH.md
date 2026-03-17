# Worker Portal 重构 — 全栈升级与双身份支持

## 交付内容总结

本次 PR 对 Worker Portal 进行了全面的重构，将其从一个仅供承包商（Contractor）使用的简单页面，升级为支持**员工（EOR）**和**承包商（AOR）**双重身份的移动端优先（Mobile-first）自助服务工作台。

### 1. 核心业务升级
- **双身份支持**：同一套前端代码，通过底层状态机和 JWT Token 智能识别登录者身份（Employee 或 Contractor），并动态渲染对应的菜单和权限。
- **全新业务模块**：
  - **休假管理 (Leave)**：员工专属。支持查看年假/病假余额、提交请假申请、查看历史记录。
  - **报销管理 (Reimbursements)**：员工专属。支持填写报销单、上传发票凭证。
  - **工资单 (Payslips)**：员工专属。支持查看和下载由 Admin 上传的月度工资单 PDF。
  - **文件与合同 (Documents)**：通用。支持查看个人档案和签署的合同文件。
  - **里程碑交付 (Milestones)**：承包商专属。支持上传交付物文件并提交审核。
- **自动开户流转**：新增 `workerProvisioningService`，打通了“Admin/Client 邀请 -> 自动生成账号 -> 发送邀请邮件 -> Worker 激活登录”的完整数据流转。

### 2. 架构与代码变更

#### 数据库层 (Drizzle Schema)
- `worker_users` 表新增 `employeeId` 字段，建立与员工表的关联。
- 新增 `contractor_documents`（承包商文件表）和 `contractor_contracts`（承包商合同表）。
- 新增 `employee_payslips`（员工工资单表）。
- `contractor_milestones` 表新增 4 个字段，用于记录交付物文件 URL 和提交时间。
- **提供完整的 SQL 迁移文件**：`drizzle/0011_worker_portal_refactor.sql`。

#### 后端 API (tRPC Routers)
- 升级 `workerAuth.ts`，JWT payload 中注入 `employeeId` 和 `workerType`。
- 新增 RBAC（基于角色的访问控制）中间件：`contractorOnlyProcedure` 和 `employeeOnlyProcedure`，从接口层面防止越权访问。
- 新增 4 个 Router：`workerLeaveRouter`、`workerReimbursementsRouter`、`workerPayslipsRouter`、`workerDocumentsRouter`。

#### 前端页面 (React + Tailwind)
- 废弃原有的左侧固定导航栏，全面采用**移动端优先**的响应式布局（Bottom Navigation 底部导航）。
- 表格数据在移动端自动转换为卡片流（Card List）展示，避免横向滚动。
- 所有表单支持移动端原生交互（如调用手机相册上传凭证）。

---

## 🚀 部署与上线指南

您提到目前只是合并了代码，还没有部署。由于本次更新涉及**数据库变更**和 **Nginx 路由修复**，请严格按照以下步骤在生产环境进行部署。

### 步骤 1：拉取最新代码
登录到您的生产服务器（阿里云），进入项目目录并拉取最新代码：
```bash
cd /path/to/your/project
git pull origin main
```

### 步骤 2：Nginx 路由配置修复（非常重要）
**注意**：在您反馈 `worker.extendglobal.ai` 404 后，我发现并修复了原 Nginx 配置中的一个冲突。
旧配置会将 `worker.extendglobal.ai/` 强制 rewrite 为 `/worker/`，这与前端的 SPA 路由逻辑冲突。新代码中已经修复了 `nginx/conf.d/gea-saas.conf` 和 `enable-ssl.sh`。

如果您之前已经运行过 `enable-ssl.sh` 并且生成了带有 SSL 的配置文件（通常位于 `/etc/nginx/conf.d/` 或被脚本直接覆盖），您需要：
1. 重新运行一次 `docker compose up -d --build` 来更新 Nginx 容器内的配置。
2. 如果您的 SSL 是通过宿主机配置的，请确保将最新的 `nginx/conf.d/gea-saas.conf` 内容同步到宿主机。

### 步骤 3：重新构建与启动 Docker 容器
由于新增了依赖和大量的全栈代码，必须重新构建镜像：
```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```
*提示：构建过程可能需要几分钟时间，请耐心等待。*

### 步骤 4：检查数据库迁移是否成功
在 `docker-entrypoint.sh` 中，我们配置了容器启动时自动执行 `/app/drizzle/` 目录下的 SQL 迁移文件。
请查看应用日志，确认 `0011_worker_portal_refactor.sql` 是否成功执行：
```bash
docker logs gea-saas-app | grep "Migration"
```
您应该能看到类似 `[Entrypoint] Applying migration: 0011_worker_portal_refactor.sql` 的成功日志。

### 步骤 5：验证 worker.extendglobal.ai 访问
在浏览器中访问 `https://worker.extendglobal.ai`。
- 预期结果：页面成功加载，显示登录界面（不再是 404）。
- 如果您的 `worker.extendglobal.ai` 域名还没有解析，请先在阿里云域名控制台添加 A 记录指向服务器 IP。
- 如果访问提示“不安全”或无法访问 HTTPS，请运行 `./enable-ssl.sh` 申请并配置证书。

---

## 待办事项 (Phase 2)

本次交付重点完成了 Worker Portal 的全部功能和后端的衔接 API。为了保持本期 PR 的稳定性，**暂时没有修改 Admin 和 Client Portal 的前端页面**。

在下一期迭代中，我们可以补充以下管理端 UI：
1. **Admin / Client Portal**：在人员详情页添加 "Invite to Worker Portal" 按钮（调用已写好的 `provisionWorkerUser` 接口）。
2. **Admin**：添加上传员工工资单 PDF 的入口。
3. **Admin**：添加上传承包商合同/文件的入口。
