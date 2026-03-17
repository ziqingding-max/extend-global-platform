# GEA Platform - AOR Service Separation & Worker Portal Development Plan

**Version**: v1.0
**Date**: 2026-03-04
**Status**: Planning

## 1. Overview

This document outlines the comprehensive development, testing, and rollout plan for separating AOR (Contractor) services from the EOR (Employee) infrastructure and establishing a dedicated Worker Portal.

**Core Objective**: Isolate AOR data and logic to ensure legal compliance (prevent misclassification), enable flexible payment models (milestones), and provide a self-service portal for contractors.

---

## 2. Phased Development Roadmap

### Phase 0: Infrastructure & Data Layer (Foundations)
**Goal**: Establish the database structure and prepare for migration without breaking existing functionality.

- [ ] **Environment Setup**
    - [ ] Set up a Staging environment (copy of Prod DB structure + anonymized data).
    - [ ] Configure CI/CD pipeline for Staging deployment.
- [ ] **Schema Definition**
    - [ ] Create `contractors` table (migrating relevant fields from `employees`).
    - [ ] Create `contractor_invoices`, `contractor_milestones`, `contractor_adjustments`.
    - [ ] Create `worker_users` table (auth for Worker Portal).
    - [ ] Create `migration_id_map` table for tracking old `employeeId` to new `contractorId`.
- [ ] **Data Migration Scripting**
    - [ ] Write `migrate_aor_data.ts`: Moves `serviceType='aor'` records from `employees` to `contractors`.
    - [ ] Write `verify_migration.ts`: Double-check record counts and financial totals.
    - [ ] Implement "Dry Run" mode for safe testing.
- [ ] **Safety Measures**
    - [ ] Update `getActiveEmployeesForPayroll` to explicitly exclude AOR types (P0 compliance fix).

### Phase 1: Core Business Logic (Admin Side)
**Goal**: Enable Admin users to manage Contractors separately from Employees.

- [ ] **Backend API (tRPC)**
    - [ ] Create `trpc.contractors` router (CRUD).
    - [ ] Create `trpc.contractorMilestones` router.
    - [ ] Create `trpc.contractorAdjustments` router.
- [ ] **Frontend - Profiles**
    - [ ] Split "Employees" page into "Profiles" with tabs: [All | Employees | Contractors].
    - [ ] Create "Add Contractor" wizard (distinct from Employee onboarding).
    - [ ] Build Contractor Detail View (Overview, Payment Config, Milestones, Invoices).
- [ ] **Frontend - Onboarding Logic**
    - [ ] Implement payment frequency logic: Monthly vs Semi-monthly vs Milestone-based.
    - [ ] Implement Approver selection logic (email-based).

### Phase 2: Financial Engine & Automation
**Goal**: Automate the unique billing cycles of Contractors.

- [ ] **Invoice Generation Engine**
    - [ ] Implement `ContractorInvoiceGenerationService`.
    - [ ] Logic for Monthly: Fixed rate + Adjustments.
    - [ ] Logic for Semi-monthly: 15th (fixed) + EOM (true-up).
    - [ ] Logic for Milestone: Sum of approved milestones.
- [ ] **Client AOR Invoice**
    - [ ] Aggregation logic: Group contractor invoices by Client.
    - [ ] PDF Generation: Reuse existing PDF engine with AOR-specific template (No "Salary", "Payslip" terminology).
- [ ] **Approver System**
    - [ ] Implement "Magic Link" email approval flow for milestones.
    - [ ] Build approval landing page (no login required for external approvers).

### Phase 3: Worker Portal (The Third Portal)
**Goal**: Provide a self-service interface for Contractors.

- [ ] **Infrastructure**
    - [ ] Configure `worker.geahr.com` subdomain routing.
    - [ ] Set up independent JWT auth flow for `worker_users`.
- [ ] **Frontend Application**
    - [ ] **Auth**: Login, Register (via Invite), Reset Password.
    - [ ] **Onboarding**: Self-service profile completion, bank details, document upload.
    - [ ] **Dashboard**: Status overview, pending tasks.
    - [ ] **Milestones**: Submission form (Title, Amount, Attachment).
    - [ ] **Invoices**: View and download history.
- [ ] **Security**
    - [ ] Implement strict IDOR protection (Row-Level Security pattern in tRPC).

### Phase 4: Client Portal Adaptation & Rollout Tools
**Goal**: Update Client view and prepare for mass invites.

- [ ] **Client Portal Updates**
    - [ ] Sidebar adaptation: Show/Hide "Payroll" vs "Invoices" based on workforce type.
    - [ ] Dashboard: Separate AOR stats from EOR stats.
    - [ ] AOR Invoice Approval UI.
- [ ] **Batch Invite System (Rate Limited)**
    - [ ] Build Admin tool: "Bulk Invite".
    - [ ] Implement queuing mechanism (Cron + Queue table) to send max 50 emails/hour.
    - [ ] Status tracking: Invited -> Active.

---

## 3. Testing & QA Strategy

### Unit Testing (Vitest)
- **Financial Logic**: 100% coverage for `ContractorInvoiceService` (especially Semi-monthly logic).
- **Access Control**: Test `protectedWorkerProcedure` to ensure Contractors cannot access Employee data.

### Integration Testing
- **Migration Drill**: Run migration on Staging, verify data integrity.
- **E2E Flows**:
    - Admin creates Contractor -> Contractor receives invite -> Contractor logs in -> Submits Milestone -> Client Approves -> Invoice Generated.

### Security Audit
- **IDOR Check**: Try to access Contractor B's invoice using Contractor A's token.
- **Token Leak**: Ensure "Magic Links" expire after use or 7 days.

---

## 4. Rollout & Migration Plan

### Step 1: Code Freeze & Backup
- Freeze new feature development on `employees` module.
- Full database backup (Snapshot).

### Step 2: Maintenance Window (Go-Live 1 - Backend)
- **Action**: Deploy Phase 0-2 code.
- **Migration**:
    1. Run `migrate_aor_data.ts`.
    2. Run `verify_migration.ts`.
    3. (If success) Enable new Admin UI.
    4. (If fail) Restore DB Snapshot.
- **Verification**: Admin verifies Contractor profiles exist in new system.

### Step 3: Worker Portal Launch (Go-Live 2 - Frontend)
- Deploy `worker.geahr.com`.
- **Soft Launch**: Invite 5 internal users.

### Step 4: Phased Invite
- **Batch 1**: 10% of active Contractors.
- **Batch 2**: 40% of active Contractors.
- **Batch 3**: Remaining 50%.

---

## 5. Post-Launch
- **Monitoring**: Watch for email delivery failures (SendGrid/SES).
- **Support**: Dedicated channel for "I can't log in" issues.
- **Data Cleanup**: After 30 days, archive/remove `serviceType='aor'` columns from `employees` table.
