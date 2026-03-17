# Recommended Project Instructions

> **Purpose**: Copy the content below into the Manus project's "Project Instructions" field. This ensures every new task automatically loads the knowledge base.

---

## Content to Copy

```
GEA EOR SaaS 系统的技术背景信息：
项目基于 Docker Compose + Nginx + Certbot SSL (self-hosted) 部署在阿里云马来西亚 (ap-southeast-3) 服务器上，系统完全独立，无 Manus 平台依赖。
代码仓库地址：https://github.com/ziqingding-max/geaplatform_trae.git

正式环境地址：
- Admin Portal: admin.geahr.com (内部运营)
- Client Portal: app.geahr.com (客户自助服务)
- Worker Portal: worker.geahr.com (员工/合同工自助服务)

技术栈核心：
- 认证: JWT + bcrypt + HttpOnly Cookie。Admin (HS256), Portal/Worker (Invite Registration)。
- 数据库: SQLite (通过 @libsql/client 和 drizzle-orm/libsql)。
- 文件存储: 阿里云 OSS (通过 @aws-sdk/client-s3 S3-compatible API)。
- AI: 阿里云 DashScope (qwen-turbo, qwen-max)，通过 aiGatewayService.ts 路由。
- i18n: Zustand-based i18n store (client/src/lib/i18n.ts)，使用 useI18n() hook 和 t("key") 模式。

关键环境变量 (详情见 .env.example):
- DATABASE_URL
- JWT_SECRET
- ADMIN_BOOTSTRAP_EMAIL / NAME / PASSWORD
- ADMIN_APP_URL / PORTAL_APP_URL / WORKER_APP_URL
- OSS_ACCESS_KEY_ID / SECRET / REGION / BUCKET / ENDPOINT
- EMAIL_*
- DASHSCOPE_API_KEY

项目规模:
- 数据库: 48 张表
- 后端 Routers: Admin (31), Portal (12), Worker (7)
- 前端 Pages: Admin (25), Portal (23), Worker (8)

所有生产环境变更必须遵循 hotfix-governance Skill 的规范。

【AI Agent 必读规范】
1. 新任务开始时，必须先阅读项目根目录的 AGENTS.md，按照其中的阅读顺序了解系统架构、编码规范和业务规则。
2. 如果已安装 gea-eor-knowledge Skill，按照 Skill 中的指引加载对应的参考文档。
3. 所有代码变更必须包含 Vitest 测试，测试必须使用 TestCleanup 清理数据。
4. 保存 checkpoint 前必须运行 post-test audit（见 docs/TESTING.md Section 10），确保数据库无测试数据残留。
5. 所有用户界面文本必须添加中英文双语翻译 (client/src/lib/i18n.ts)。
6. 重大功能变更后，必须同步更新 AGENTS.md 和相关文档（见 docs/DOC-UPDATE-GUIDE.md）。
```

---

## How to Set

1. Open the Manus project "Best GEA 系统"
2. Go to project Settings
3. Replace the current "Project Instructions" with the content above
4. Save
