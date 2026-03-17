## Phase 14: AOR Services Separation & Worker Portal

### Phase 0: Infrastructure & Data Layer (Foundations)
- [x] Create `contractors` table schema (migrating relevant fields from `employees`)
- [x] Create `contractor_invoices`, `contractor_milestones`, `contractor_adjustments` schemas
- [x] Create `worker_users` table schema (auth for Worker Portal)
- [x] Create `migration_id_map` table schema
- [x] Write `migrate_aor_data.ts` script
- [x] Write `verify_migration.ts` script
- [x] Update `getActiveEmployeesForPayroll` to exclude AOR types

### Phase 1: Core Business Logic (Admin Side)
- [x] Create `trpc.contractors` router (CRUD)
- [x] Create `trpc.contractorMilestones` router
- [x] Create `trpc.contractorAdjustments` router
- [x] Split "Employees" page into "Profiles" with tabs [All | Employees | Contractors]
- [x] Create "Add Contractor" wizard
- [ ] Build Contractor Detail View (Overview, Payment Config, Milestones, Invoices)
- [ ] Implement payment frequency logic (Monthly/Semi-monthly/Milestone)
- [ ] Implement Approver selection logic

### Phase 2: Financial Engine & Automation
- [ ] Implement `ContractorInvoiceGenerationService`
- [ ] Implement Client AOR Invoice aggregation logic
- [ ] Create AOR-specific PDF template
- [ ] Implement "Magic Link" email approval flow

### Phase 3: Worker Portal (The Third Portal)
- [ ] Configure `worker.geahr.com` subdomain routing
- [ ] Set up independent JWT auth flow for `worker_users`
- [ ] Build Worker Portal Auth pages (Login, Register, Reset)
- [ ] Build Worker Portal Onboarding pages
- [ ] Build Worker Portal Dashboard
- [ ] Build Worker Portal Milestones submission
- [ ] Build Worker Portal Invoices view

### Phase 4: Client Portal Adaptation & Rollout Tools
- [ ] Update Client Portal Sidebar (conditional Payroll/Invoices)
- [ ] Update Client Portal Dashboard (separate AOR stats)
- [ ] Build Admin "Bulk Invite" tool with rate limiting
