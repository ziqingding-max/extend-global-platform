# Worker Portal Refactor — Full-Stack Overhaul

## Summary

This PR delivers a comprehensive refactor of the Worker Portal, transforming it from a contractor-only tool into a unified, mobile-first self-service platform for both **Employees (EOR)** and **Contractors (AOR)**.

## Business Context

Worker Portal is the daily workspace for workers to manage their employment-related tasks. This refactor:
1. **Extends identity support** — Workers can now be either Employees or Contractors, with strict role-based access control.
2. **Adds missing business modules** — Leave, Reimbursements, Payslips, Documents for Employees; Milestone deliverable submission for Contractors.
3. **Establishes data flow bridges** — Backend services ready for Admin/Client Portal to invite workers and manage their data.
4. **Mobile-first design** — All pages redesigned with bottom navigation, card-based layouts, and responsive breakpoints.

## Changes by Layer

### Database Schema (`drizzle/`)

| Change | Description |
|--------|-------------|
| `worker_users.employeeId` | New nullable column linking worker accounts to Employee records |
| `contractor_documents` | New table for contractor file management |
| `contractor_contracts` | New table for contractor contract management |
| `employee_payslips` | New table for admin-uploaded payslip PDFs |
| `contractor_milestones` deliverable fields | 4 new columns for milestone file submission |
| Migration SQL | `drizzle/migrations/0001_worker_portal_refactor.sql` |

### Backend (`server/worker/`)

| File | Change |
|------|--------|
| `workerAuth.ts` | Extended JWT payload with `employeeId` and `workerType`; added `resolveWorkerType()` helper |
| `workerTrpc.ts` | Added `contractorOnlyProcedure` and `employeeOnlyProcedure` middleware for RBAC |
| `workerAuthRouter.ts` | Updated login/register/reset flows to support dual identity |
| `workerDashboardRouter.ts` | Dynamic dashboard data based on worker type |
| `workerInvoicesRouter.ts` | Restricted to contractors via `contractorOnlyProcedure` |
| `workerMilestonesRouter.ts` | Added `submit` mutation for deliverable upload |
| `workerProfileRouter.ts` | Dual-source profile (contractors or employees table) |
| `workerLeaveRouter.ts` | **NEW** — Employee leave balance, history, submit, cancel |
| `workerReimbursementsRouter.ts` | **NEW** — Employee expense submission and tracking |
| `workerPayslipsRouter.ts` | **NEW** — Employee payslip listing and detail |
| `workerDocumentsRouter.ts` | **NEW** — Unified document/contract viewer for both types |
| `workerRouter.ts` | Updated to register all new routers |

### Backend Services (`server/services/`)

| File | Change |
|------|--------|
| `authEmailService.ts` | Added `sendWorkerPortalInviteEmail()` template |
| `workerProvisioningService.ts` | **NEW** — `provisionWorkerUser()` and `resendWorkerInvite()` for account creation |

### Frontend (`client/src/pages/worker/`)

| File | Change |
|------|--------|
| `WorkerLayout.tsx` | Mobile-first responsive layout with bottom nav; dynamic menu by worker type |
| `WorkerDashboard.tsx` | Identity-aware dashboard with different cards for Employee vs Contractor |
| `WorkerInvoices.tsx` | Card-based invoice list with detail drawer; mobile-optimized |
| `WorkerMilestones.tsx` | Milestone list with deliverable upload and submit flow |
| `WorkerProfile.tsx` | Profile header card with type badge; responsive form layout |
| `WorkerLeave.tsx` | **NEW** — Leave balance cards, request form, history list |
| `WorkerReimbursements.tsx` | **NEW** — Expense submission form with file upload |
| `WorkerPayslips.tsx` | **NEW** — Payslip list with download links |
| `WorkerDocuments.tsx` | **NEW** — Tabbed document/contract viewer |
| `App.tsx` | Added lazy imports and routes for all new pages |

## Feature Matrix by Worker Type

| Feature | Employee | Contractor |
|---------|----------|------------|
| Dashboard | ✅ | ✅ |
| Payslips | ✅ | ❌ |
| Leave | ✅ | ❌ |
| Reimbursements | ✅ | ❌ |
| Invoices | ❌ | ✅ |
| Milestones | ❌ | ✅ |
| Documents | ✅ | ✅ |
| Profile | ✅ | ✅ |

## Data Flow: Worker Portal ↔ Admin/Client Portal

```
Admin/Client Portal                    Worker Portal
─────────────────                      ─────────────
                                       
[Invite to Worker Portal] ──────────► worker_users record created
  (provisionWorkerUser)                  ↓
                                       Invite email sent
                                         ↓
                                       Worker sets password
                                         ↓
                                       Worker logs in
                                       
[Upload Payslip PDF] ──────────────► employee_payslips record
  (Admin)                              ↓
                                       Worker views in Payslips tab
                                       
[Approve Leave/Expense] ◄─────────── Worker submits Leave/Expense
  (Client/Admin)                       status: submitted → approved
                                       
[Review Milestone] ◄──────────────── Worker uploads deliverable
  (Client)                             status: submitted → approved
```

## TODO (Phase 2 — Admin/Client Portal UI)

These backend APIs are ready but the Admin/Client Portal UI buttons have **not** been added yet (per user request to focus on Worker Portal first):

- [ ] Admin: "Invite to Worker Portal" button on Employee/Contractor detail pages
- [ ] Admin: Upload payslip PDF for employees
- [ ] Admin: Upload documents/contracts for contractors
- [ ] Client Portal: "Invite to Worker Portal" button on People detail pages
- [ ] Mobile App: Consider React Native / Expo wrapper for iOS/Android distribution

## Migration

Run the SQL migration before deploying:
```bash
sqlite3 your-database.db < drizzle/migrations/0001_worker_portal_refactor.sql
```

## Testing Checklist

- [ ] Contractor login → sees Dashboard, Invoices, Milestones, Documents, Profile
- [ ] Employee login → sees Dashboard, Payslips, Leave, Reimbursements, Documents, Profile
- [ ] Contractor cannot access /worker/leave, /worker/payslips, /worker/reimbursements
- [ ] Employee cannot access /worker/invoices, /worker/milestones
- [ ] Mobile viewport: bottom navigation renders correctly, no horizontal scroll
- [ ] Milestone submit: file URL and notes saved to database
- [ ] Leave submit: record created with status "submitted"
- [ ] Reimbursement submit: record created with status "submitted"
- [ ] provisionWorkerUser() creates worker_users record and sends email
