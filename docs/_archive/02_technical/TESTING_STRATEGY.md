# 测试策略与质量保证 (Testing Strategy)

## 1. 测试分层 (Testing Pyramid)

### 1.1 单元测试 (Unit Tests)
*   **工具**: `vitest`
*   **范围**:
    *   纯函数工具 (`lib/format.ts` 等)。
    *   复杂的业务计算逻辑 (如薪资计算、汇率换算)。
*   **位置**: 位于 `server/` 目录下，命名为 `*.test.ts`。
*   **运行**: `pnpm test`

### 1. Integration Tests (集成测试)
*   **工具**: `vitest`
*   **范围**:
    *   TRPC API 端点逻辑。
    *   数据库交互 (Service Layer)。
*   **策略**: 使用测试数据库，每次测试后必须通过 `cleanup.run()` 清理数据。

### 1.3 端到端测试 (E2E Tests)
*   **工具**: 基于 Shell 脚本和 Node.js 的自研测试套件。
*   **位置**: `e2e-tests/` 目录。
*   **范围**: 核心业务流模拟 (Sales -> Onboarding -> Payroll -> Invoice)。
*   **运行**: `node e2e-tests/run-e2e-tests.js`。

---

## 2. 关键规则 (Critical Rules)

### 2.1 零容忍测试数据泄露 (Rule 6)
*   **必须清理**: 每一个测试文件必须在 `afterAll` 中运行数据清理。
*   **独立性**: 测试不应依赖现有的业务数据。

### 2.2 财务逻辑验证
*   财务相关的测试必须验证 `wallet_transactions` 流水与 `balance` 的一致性。

---

## 3. 自动化任务
*   系统每晚 **23:30** 自动运行 E2E 回归测试。
*   测试报告生成在 `e2e-tests/reports/` 目录下。
