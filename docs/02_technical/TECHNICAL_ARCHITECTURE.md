# 技术架构与开发规范 (Technical Architecture)

## 1. 技术栈概览 (Tech Stack)

### 1.1 前端 (Frontend)
*   **Framework**: React 19 + Vite
*   **Language**: TypeScript (Strict Mode)
*   **Styling**: Tailwind CSS v4 + Shadcn/UI (Radix Primitives)
*   **State Management**: Zustand (Global), React Query (Server State)
*   **Routing**: Wouter (Lightweight routing)
*   **API Client**: tRPC (Type-safe API calls)

### 1.2 后端 (Backend)
*   **Runtime**: Node.js
*   **Framework**: Express.js
*   **API Layer**: tRPC (End-to-end type safety)
*   **Authentication**: JWT + Custom Middleware (`adminAuth`, `portalAuth`)
*   **Scheduled Tasks**: `node-cron` (Invoicing, Payroll cycles)

### 1.3 数据库 (Database)
*   **Database**: SQLite (via LibSQL/Turso)
*   **ORM**: Drizzle ORM
*   **Migration**: Drizzle Kit

---

## 2. 目录结构规范 (Directory Structure)

```
/
├── client/                 # 前端应用
│   ├── src/
│   │   ├── _core/          # 核心钩子与工具
│   │   ├── components/     # UI 组件 (Shadcn + Business)
│   │   ├── contexts/       # React Contexts
│   │   ├── hooks/          # Custom Hooks
│   │   ├── lib/            # Utilities (TRPC client, etc.)
│   │   └── pages/          # 页面路由组件
├── server/                 # 后端服务
│   ├── _core/              # 核心配置 (TRPC setup, Auth)
│   ├── portal/             # Client Portal API 路由
│   └── services/           # 业务逻辑层 (Service Layer)
├── drizzle/                # 数据库 Schema 与 迁移文件
├── docs/                   # 项目文档中心
└── e2e-tests/              # 端到端测试脚本
```

---

## 3. 开发规范 (Development Standards)

### 3.1 命名约定
*   **Files**:
    *   React Components: `PascalCase.tsx` (e.g., `EmployeeList.tsx`)
    *   Utilities/Hooks: `camelCase.ts` (e.g., `useAuth.ts`, `formatDate.ts`)
*   **Variables**:
    *   Boolean: `isVisible`, `hasError`, `canEdit`
    *   Functions: `handleSubmit`, `fetchData`

### 3.2 代码风格
*   **Imports**: 使用 ESM (`import { X } from 'y'`)，避免 `require`。
*   **Exports**: 优先使用 Named Exports (`export const Component = ...`)，避免 Default Exports (除了 Pages/Lazy components)。
*   **Types**: 所有的 API 输入输出必须定义 Zod Schema。

### 3.3 错误处理
*   后端服务层抛出标准 Error，TRPC 层捕获并转换为 HTTP 响应。
*   前端使用 `try/catch` 包裹 async 操作，或使用 React Query 的 `onError` 回调。

### 3.4 状态管理
*   **Server State**: 必须使用 React Query (`trpc.useQuery`)，禁止将 API 数据手动存入 Zustand/Context 除非用于全局共享。
*   **UI State**: 使用 `useState` (局部) 或 `Zustand` (全局，如 Sidebar 状态、User Session)。

---

## 4. 部署架构 (Deployment)
*   **Container**: Dockerized (Frontend + Backend in one or separate containers).
*   **Process**: Node.js process managed by Docker/PM2.
*   **Static Assets**: Vite build output served by Nginx or Express static middleware.
