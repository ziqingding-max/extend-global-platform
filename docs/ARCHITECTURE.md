# System Architecture

> **Purpose**: Technical architecture reference for AI Agents and developers. Covers the dual-portal design, data model, authentication flows, API surface, and cron job system.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                             │
│                                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────┐  │
│  │   Admin Portal        │  │   Client Portal       │  │  Worker Portal  │  │
│  │   (React 19 + Vite)   │  │   (React 19 + Vite)   │  │  (React 19 + Vite)│
│  │   admin.geahr.com     │  │   app.geahr.com       │  │  worker.geahr.com │
│  │                       │  │                       │  │                 │
│  │  trpc.* hooks         │  │  portalTrpc.* hooks   │  │  workerTrpc.* hooks│
│  │  → /api/trpc          │  │  → /api/portal        │  │  → /api/worker  │
│  └────────┬──────────────┘  └─────────┬─────────────┘  └───────┬────────┘  │
│           │                           │                        │           │
└───────────┼───────────────────────────┼────────────────────────┼───────────┘
            │                           │                        │
            ▼                           ▼                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     Express 4 Server (Node.js 22)                     │
│                                                                       │
│  ┌─────────────────────────┐ ┌────────────────────────┐ ┌────────────────┐ │
│  │  Admin tRPC Instance    │ │  Portal tRPC Instance  │ │ Worker tRPC Instance │
│  │  /api/trpc              │ │  /api/portal          │ │ /api/worker    │ │
│  │                         │ │                        │ │                │ │
│  │  Auth: JWT (HS256)      │ │  Auth: JWT + bcrypt   │ │ Auth: JWT + bcrypt │
│  │  Context: ctx.user      │ │  Context: ctx.portalUser│ │ Context: ctx.workerUser│
│  │  31 routers             │ │  12 routers           │ │ 7 routers      │ │
│  │  Role-based procedures  │ │  customerId-scoped    │ │ workerId-scoped│
│  └─────────┬───────────────┘ └──────────┬─────────────┘ └───────┬────────┘ │
│            │                             │                        │         │
│            ▼                             ▼                        ▼         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Shared Data Layer                              │  │
│  │  Drizzle ORM → SQLite via @libsql/client (48 tables)            │  │
│  │  Alibaba Cloud OSS → S3-compatible file uploads                  │  │
│  │  ECB API → Exchange rates (daily fetch)                          │  │
│  │  AI Gateway → Alibaba Cloud DashScope (qwen-turbo, qwen-max)     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Cron Jobs (node-cron, 7 scheduled tasks)                        │  │
│  │  Daily: auto-activation, leave transition, overdue, exchange     │  │
│  │  Monthly: leave accrual (1st), auto-lock + payroll (5th)         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. Three-Portal Design

The system runs three separate tRPC instances on the same Express server. They share the database but have no code-level cross-references.

| Aspect | Admin Portal | Client Portal | Worker Portal |
|:---|:---|:---|:---|
| **URL** | `admin.geahr.com` | `app.geahr.com` | `worker.geahr.com` |
| **tRPC Mount** | `/api/trpc` | `/api/portal` | `/api/worker` |
| **tRPC Instance** | `server/_core/trpc.ts` | `server/portal/portalTrpc.ts` | `server/worker/workerTrpc.ts` |
| **Auth Mechanism** | JWT (HS256) in HttpOnly Cookie | JWT + bcrypt (self-managed) | JWT + bcrypt (self-managed) |
| **Context Object** | `ctx.user` (from JWT) | `ctx.portalUser` (customer contact) | `ctx.workerUser` (employee/contractor) |
| **Router File** | `server/routers.ts` (31 routers) | `server/portal/portalRouter.ts` (12 routers) | `server/worker/workerRouter.ts` (7 routers) |
| **Procedure Base** | `protectedProcedure` + role middleware | `protectedPortalProcedure` (auto-injects customerId) | `protectedWorkerProcedure` (auto-injects workerId) |
| **Data Scope** | All customers, all data | Single customer only (customerId-scoped) | Single worker only (workerId-scoped) |
| **Frontend Entry** | `client/src/App.tsx → AdminRouter` | `client/src/App.tsx → PortalRouter` | `client/src/App.tsx → WorkerRouter` |
| **Frontend tRPC** | `client/src/lib/trpc.ts` | `client/src/lib/portalTrpc.ts` | `client/src/lib/workerTrpc.ts` |
| **Layout** | `components/Layout.tsx` (sidebar) | `components/PortalLayout.tsx` (sidebar) | `components/WorkerLayout.tsx` (sidebar) |
| **i18n** | Zustand-based i18n store at `client/src/lib/i18n.ts` | (Shared) | (Shared) |

### Routing Decision
The `Router` component in `App.tsx` determines which portal to render based on the hostname. On `app.geahr.com` it renders `PortalRouter`, on `worker.geahr.com` it renders `WorkerRouter`. On all other domains (including `localhost`), it uses path-based routing for the Admin portal.

---

## 3. Authentication Flows

### Admin Authentication (JWT + HttpOnly Cookie)

Admin authentication is handled by `server/_core/adminAuth.ts` and `server/_core/authRoutes.ts`. It uses a JWT signed with HS256 (via `jose` library) stored in an HttpOnly cookie.

```
Browser → /login → POST email + password
       → Server validates credentials
       → Server issues JWT in HttpOnly cookie (via JWT_SECRET)
       → Redirect to admin dashboard
```

The initial admin user is bootstrapped from `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` environment variables on first startup.

### Portal Authentication (JWT + Invite)

Portal authentication (`server/portal/portalAuth.ts`) uses JWT with bcrypt for password hashing. Registration is invite-only.

```
Browser → /portal/login → POST email + password
       → Server validates against customerContacts table (bcrypt hash)
       → Server issues JWT (PORTAL_COOKIE_NAME = "portal_session", 7-day expiry)
       → Redirect to portal dashboard
```

An admin creates an invite link (`trpc.customers.createInvite`), generating a time-limited token. The user registers via `/portal/register?token=...` to set their password.

### Worker Authentication (JWT + Invite)

Worker authentication (`server/worker/workerAuth.ts`) follows the same pattern as the portal: JWT with bcrypt and an invite-only registration flow.

---

## 4. Admin tRPC Router Map (31 Routers)

*This list reflects the 31 router files in the `server/routers` directory.*

| Router | File | Middleware | Key Operations |
|:---|:---|:---|:---|
| `auth` | `routers.ts` (inline) | public | `me`, `logout` |
| `customers` | `routers/customers.ts` | customerManager | CRUD, invite, contacts, contracts, pricing |
| `employees` | `routers/employees.ts` | customerManager | CRUD, status transitions, documents, visas |
| `payroll` | `routers/payroll.ts` | operationsManager | Runs, items, submit, approve, reject |
| `invoices` | `routers/invoices.ts` | financeManager | CRUD, status, credit notes, PDF generation |
| `invoiceGeneration` | `routers/invoiceGeneration.ts` | financeManager | Generate from payroll, deposit, visa service |
| `countries` | `routers/countries.ts` | admin | Country config, statutory minimums |
| `leave` | `routers/leave.ts` | operationsManager | Records, balances, approval |
| `adjustments` | `routers/adjustments.ts` | operationsManager | CRUD, lock, bulk operations |
| `reimbursements` | `routers/reimbursements.ts` | operationsManager | CRUD, approval flow |
| `dashboard` | `routers/dashboard.ts` | protected | Aggregated stats, charts, recent activity |
| `billingEntities` | `routers/billingEntities.ts` | admin | CRUD, invoice prefix, exchange markup |
| `userManagement` | `routers/userManagement.ts` | admin | Admin user CRUD, role assignment |
| `auditLogs` | `routers/auditLogs.ts` | admin | Query, filter, export |
| `exchangeRates` | `routers/exchangeRates.ts` | financeManager | View, manual override |
| `systemSettings` | `routers/systemSettings.ts` | admin | Global settings key-value store |
| `customerLeavePolicies` | `routers/customerLeavePolicies.ts` | customerManager | Per-customer leave policy config |
| `vendors` | `routers/vendors.ts` | financeManager | Vendor CRUD |
| `vendorBills` | `routers/vendorBills.ts` | financeManager | Bills, items, cost allocation |
| `reports` | `routers/reports.ts` | financeManager | P&L, cost allocation reports |
| `allocations` | `routers/allocations.ts` | financeManager | Cost allocation CRUD |
| `pdfParsing` | `routers/pdfParsing.ts` | operationsManager | AI-powered PDF data extraction |
| `sales` | `routers/sales.ts` | customerManager | CRM leads, activities, pipeline |
| `copilot` | `routers/copilot.ts` | protected | Chat, context awareness, predictions |
| `aiSettings` | `routers/aiSettings.ts` | admin | Provider config, task routing policies |
| `knowledgeBaseAdmin` | `routers/knowledgeBaseAdmin.ts` | admin | Knowledge base management |
| `notification` | `routers/notification.ts` | protected | In-app notification management |
| `contractor` | `routers/contractor.ts` | operationsManager | Contractor management and invoicing |

---

## 5. Portal tRPC Router Map (12 Routers)

*This list reflects the 12 router files in the `server/portal/routers` directory.*

| Router | File | Key Operations |
|:---|:---|:---|
| `auth` | `portalAuthRouter.ts` | Login, register, password reset, me, logout |
| `dashboard` | `portalDashboardRouter.ts` | Customer-scoped stats and charts |
| `employees` | `portalEmployeesRouter.ts` | View employees, onboarding submission |
| `adjustments` | `portalAdjustmentsRouter.ts` | Submit adjustments for employees |
| `leave` | `portalLeaveRouter.ts` | Submit leave requests, view balances |
| `payroll` | `portalPayrollRouter.ts` | View payroll runs and items (read-only) |
| `reimbursements` | `portalReimbursementsRouter.ts` | Submit and approve reimbursements |
| `invoices` | `portalInvoicesRouter.ts` | View and download invoices |
| `settings` | `portalSettingsRouter.ts` | Company profile, contact management |

---

## 6. Worker Portal tRPC Router Map (7 Routers)

*This list reflects the 7 router files in the `server/worker/routers` directory.*

| Router | File | Key Operations |
|:---|:---|:---|
| `auth` | `workerAuthRouter.ts` | Login, invite registration, password reset |
| `profile` | `workerProfileRouter.ts` | Personal info, bank details, profile management |
| `documents` | `workerDocumentsRouter.ts` | Contract viewing, compliance docs upload |
| `invoices` | `workerInvoicesRouter.ts` | View and download payslips/invoices |
| `onboarding` | `workerOnboardingRouter.ts` | Onboarding task submission |
| `milestones` | `workerMilestonesRouter.ts` | Milestone tracking and submission |
| `dashboard` | `workerDashboardRouter.ts` | Worker-specific dashboard |

---

## 7. Data Model Overview

The 48 database tables are defined in `drizzle/schema.ts` with relationships in `drizzle/relations.ts`. The database is **SQLite**, accessed via `@libsql/client` and `drizzle-orm/libsql`. The `drizzle.config.ts` specifies `dialect: "sqlite"`. In production, the database file is at `file:/app/data/production.db`.

### Core Entities

```
customers (1) ──── (N) employees
customers (1) ──── (N) customerContacts (portal users)
customers (1) ──── (N) customerContracts
customers (1) ──── (N) customerPricing
customers (1) ──── (1) billingEntities (via billingEntityId)
employees (1) ──── (N) employeeContracts
employees (1) ──── (N) employeeDocuments
employees (1) ──── (N) employeeVisas
```

### Operations

```
payrollRuns (1) ──── (N) payrollItems
payrollItems (N) ──── (1) employees
adjustments (N) ──── (1) employees
leaveRecords (N) ──── (1) employees
leaveBalances (N) ──── (1) employees
reimbursements (N) ──── (1) employees
```

### Finance

```
invoices (1) ──── (N) invoiceItems
invoiceItems (N) ──── (1) employees (optional)
invoices (N) ──── (1) customers
invoices (N) ──── (1) billingEntities
invoices (1) ──── (1) invoices (relatedInvoiceId for credit notes/refunds)
vendors (1) ──── (N) vendorBills
vendorBills (1) ──── (N) vendorBillItems
costAllocations (N) ──── (1) vendorBillItems
costAllocations (N) ──── (1) invoices
```

### System

```
users (admin users)
auditLogs (action tracking)
systemSettings (key-value config)
exchangeRates (daily rates from ECB)
```

---

## 8. Deployment & Infrastructure

The entire system is self-hosted on **Alibaba Cloud Malaysia (ap-southeast-3)** using **Docker Compose**. It is fully independent and has no dependencies on external platforms.

- **Web Server**: Nginx acts as a reverse proxy.
- **SSL**: Managed by Certbot for automatic certificate renewal.
- **File Storage**: **Alibaba Cloud OSS** is used for all file uploads, accessed via an S3-compatible API (`@aws-sdk/client-s3`).

### Environment Variables

Key environment variables include:

- `DATABASE_URL`: SQLite connection string.
- `JWT_SECRET`: Secret for signing admin JWTs.
- `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`: For initial admin user creation.
- `ADMIN_APP_URL`, `PORTAL_APP_URL`, `WORKER_APP_URL`: Base URLs for each portal.
- `OSS_*`: Credentials for Alibaba Cloud OSS.
- `EMAIL_*`: SMTP server settings for sending emails.
- `DASHSCOPE_API_KEY`: API key for Alibaba Cloud DashScope AI services.
