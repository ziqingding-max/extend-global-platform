# AI Agent Onboarding Guide

> **Purpose**: This file is the **single entry point** for any AI Agent or Engineer starting a new task.
> **Philosophy**: Documentation is the Single Source of Truth (SSOT). Code is the implementation of documentation.

---

## 1. System Identity
**GEA EOR SaaS Admin** is a global Employment Record (EOR) and Agency of Record (AOR) platform.
*   **Three Portals**: Admin Portal (Ops), Client Portal (Customers), Worker Portal (Employees/Contractors).
*   **One Database**: Shared SQLite (LibSQL) database with strict role-based access.
*   **Stack**: React 19, Node.js (Express + tRPC), Drizzle ORM.

---

## 2. Documentation Navigation (The Three-Tier Structure)

You **MUST** read the relevant documentation before writing code.

### Tier 1: Business Logic (For Humans & Product Owners)
*   **`docs/01_business/CORE_BUSINESS_LOGIC.md`**: The "Big Picture". Entities (Customer, Employee, Contractor) and core flows. **READ THIS FIRST.**
*   **`docs/01_business/FINANCIAL_COMPLIANCE_FLOW.md`**: Money flows, Wallet, Invoicing, Credit Notes, Exchange Rates.
*   **`docs/01_business/WORKER_CLASSIFICATION_RULES.md`**: EOR vs AOR distinction, compliance rules.

### Tier 2: Technical Architecture (For Engineers)
*   **`docs/02_technical/TECHNICAL_ARCHITECTURE.md`**: Tech stack, directory structure, coding standards.
*   **`docs/02_technical/DATABASE_SCHEMA_GUIDE.md`**: Database schema, key tables, migration workflow.
*   **`docs/02_technical/TESTING_STRATEGY.md`**: Testing levels (Unit, Integration, E2E), CI/CD.

### Tier 3: Context & Archives
*   **`docs/00_archive/`**: Old reports, audits, and deprecated specs. Use for historical reference only.
*   **`CHANGELOG.md`**: Version history.

---

## 3. Critical Rules (Non-Negotiable)

### Rule 1: Documentation First
*   Before making any complex change, check if it conflicts with `CORE_BUSINESS_LOGIC.md`.
*   If you change business logic in code, you **MUST** update the documentation in the same PR/Commit.

### Rule 2: Database Integrity
*   **Schema**: `drizzle/schema.ts` is the SSOT.
*   **Money**: Always handle multi-currency logic carefully. Use `decimal` types.
*   **Migrations**: Never modify the DB manually. Use `pnpm db:push`.

### Rule 3: Tri-Portal Isolation
*   **Admin**: `server/routers/`
*   **Portal**: `server/portal/routers/`
*   **Worker**: `server/worker/routers/`
*   **Security**: Never share procedures across portals. Portal procedures must always filter by `customerId`. Worker procedures by `employeeId`.

### Rule 4: Zero-Tolerance Test Data
*   **Cleanup**: Tests must clean up their data.
*   **Production Safety**: The dev environment might share resources (e.g. S3). Be careful.

---

## 4. Quick Reference

### Directory Map
```
/
├── client/                 # React Frontend
├── server/                 # Node.js Backend
├── drizzle/                # DB Schema & Migrations
├── docs/                   # Documentation (SSOT)
│   ├── 01_business/        # Business Logic
│   └── 02_technical/       # Technical Specs
└── e2e-tests/              # End-to-End Tests
```

### Essential Commands
```bash
pnpm dev              # Start dev server
pnpm test             # Run Vitest unit/integration tests
pnpm db:push          # Sync Schema to DB
```

---

## 5. Task Execution Flow
1.  **Understand**: Read `AGENTS.md` and relevant `docs/01_business` files.
2.  **Plan**: Check `docs/02_technical` for architectural fit.
3.  **Execute**: Write code.
4.  **Verify**: Run tests.
5.  **Document**: Update docs if logic changed.
