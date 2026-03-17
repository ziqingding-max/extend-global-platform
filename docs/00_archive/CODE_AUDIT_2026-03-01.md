# 代码审计报告（2026-03-01）

## 审计范围
- 后端认证与安全中间件（`server/_core/`, `server/portal/`）
- 前端关键业务页面（`client/src/pages/Invoices.tsx`）
- 自动化质量门禁（`pnpm check`, `pnpm test`）

## 审计方法
1. 依赖安装与锁文件一致性检查：`pnpm install --frozen-lockfile`
2. 类型检查：`pnpm check`
3. 全量测试：`pnpm test`
4. 依赖漏洞扫描：`pnpm audit --prod`（受仓库策略限制）
5. 静态代码审查（认证、Cookie、安全头、默认账号、i18n）

## 审计结论（摘要）
- **总体状态：中高风险（需整改后再进入严格生产发布窗口）**。
- 类型检查通过，但全量测试存在 **26 个失败用例**，覆盖登录、分页、汇率、发票文案回归等关键路径。
- 存在若干明确安全风险：默认管理员硬编码凭据、缺少统一安全响应头、登录无速率限制、`SameSite=None` 场景下缺少显式 CSRF token 机制。

---

## 关键发现（按严重度）

### 🔴 Critical-1：默认管理员凭据硬编码且启动自动种子
**证据**
- `server/seedAdmin.ts` 中硬编码了默认管理员邮箱、密码，并在启动时自动创建。  

**影响**
- 一旦部署环境未及时替换或被误恢复，存在被撞库/弱口令利用风险。

**建议**
- 立即移除硬编码默认密码，改为“首次启动强制注入环境变量 + 一次性初始化 token”。
- 将 `seedDefaultAdmin()` 改为仅在显式 `SEED_ADMIN_ON_BOOT=true` 且非生产环境可执行。

### 🔴 Critical-2：全量测试失败（质量门禁未通过）
**证据**
- `pnpm test` 结果：40 个测试文件中 6 个失败，779 个测试中 26 个失败。
- 失败集中于：数据库可用性依赖、portal 分页、重置密码、汇率、发票外部备注锁定提示文案。

**影响**
- 当前主干稳定性不足，发布风险较高（功能回归与环境耦合问题并存）。

**建议**
- 将失败测试按“环境依赖问题 / 真实回归”拆分修复。
- 对 DB 依赖测试增加统一 mock 或可跳过策略，避免 CI 环境随机失败。

### 🟠 High-1：缺少安全响应头中间件（Helmet 等）
**证据**
- `server/_core/index.ts` 中仅配置 JSON/urlencoded 与路由挂载，无 helmet/security headers 中间件。

**影响**
- 缺少 CSP、X-Frame-Options 等基础防护，增加 XSS/Clickjacking 攻击面。

**建议**
- 引入 `helmet`，并基于前端资源策略配置 CSP 白名单。

### 🟠 High-2：登录接口无速率限制
**证据**
- `server/_core/authRoutes.ts` 与 `server/portal/routers/portalAuthRouter.ts` 的登录流程未见 rate limit 机制。

**影响**
- 存在暴力破解与凭据填充攻击风险。

**建议**
- 在 admin/portal 登录入口增加基于 IP + 账号维度的限流与短时封禁策略。

### 🟡 Medium-1：`SameSite=None` Cookie + 无显式 CSRF Token
**证据**
- 管理端 cookie 策略使用 `sameSite: "none"`。Portal 也使用 `sameSite: "none"`。

**影响**
- 若跨站请求链路处理不严谨，存在 CSRF 风险窗口。

**建议**
- 对 mutation 路由加 CSRF token 校验（双重提交 cookie 或 synchronizer token pattern）。
- 与网关层配合增加 Origin/Referer 严格校验。

### 🟡 Medium-2：i18n 回归风险（发票页面出现缺失 key）
**证据**
- `client/src/pages/Invoices.tsx` 使用 `t("invoices.detail.notes.externalLocked")`，但在 `client/src/lib/i18n.ts` 中未检索到对应 key。
- 该问题与测试中“External notes locked 文案”失败现象一致。

**影响**
- 前端显示 fallback key/空文案，影响用户理解和验收稳定性。

**建议**
- 在 i18n EN/ZH 同步补齐 `invoices.detail.notes.externalLocked`。
- 增加“i18n key 存在性”静态校验脚本纳入 CI。

---

## 积极项（已具备）
- Admin 与 Portal 认证体系分离（独立 JWT issuer/audience 设计）。
- Portal 发票 PDF 下载接口包含 customer 归属校验。
- TypeScript 类型检查当前可通过。

## 优先整改路线（建议）
1. **24 小时内**：下线硬编码默认管理员密码；补登录限流；补关键 i18n 缺失 key。
2. **72 小时内**：引入 helmet + CSP；补 CSRF token 机制；修复可确定回归测试。
3. **1 周内**：梳理 DB 依赖测试策略，确保 CI 稳定通过率 > 99%。

## 审计命令记录
```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm audit --prod
rg -n "dangerouslySetInnerHTML|innerHTML|eval\(|new Function\(" client server shared drizzle
rg -n "externalLocked|invoices.detail.notes.externalLocked" client/src/lib/i18n.ts client/src/pages/Invoices.tsx
```
