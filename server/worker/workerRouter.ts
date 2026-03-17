/**
 * Worker Portal Router
 *
 * Aggregates all worker-related routers.
 *
 * Route access by worker type:
 * - auth, profile, dashboard, documents, notifications: All workers
 * - invoices, milestones: Contractor only
 * - leave, reimbursements, payslips: Employee only
 */

import { workerRouter } from "./workerTrpc";
import { workerAuthRouter } from "./routers/workerAuthRouter";
import { workerProfileRouter } from "./routers/workerProfileRouter";
import { workerOnboardingRouter } from "./routers/workerOnboardingRouter";
import { workerInvoicesRouter } from "./routers/workerInvoicesRouter";
import { workerMilestonesRouter } from "./routers/workerMilestonesRouter";
import { workerDashboardRouter } from "./routers/workerDashboardRouter";
import { workerNotificationsRouter } from "./routers/workerNotificationsRouter";
import { workerLeaveRouter } from "./routers/workerLeaveRouter";
import { workerReimbursementsRouter } from "./routers/workerReimbursementsRouter";
import { workerPayslipsRouter } from "./routers/workerPayslipsRouter";
import { workerDocumentsRouter } from "./routers/workerDocumentsRouter";

export const appWorkerRouter = workerRouter({
  // Shared (all workers)
  auth: workerAuthRouter,
  profile: workerProfileRouter,
  onboarding: workerOnboardingRouter,
  dashboard: workerDashboardRouter,
  notifications: workerNotificationsRouter,
  documents: workerDocumentsRouter,

  // Contractor only
  invoices: workerInvoicesRouter,
  milestones: workerMilestonesRouter,

  // Employee only
  leave: workerLeaveRouter,
  reimbursements: workerReimbursementsRouter,
  payslips: workerPayslipsRouter,
});

export type AppWorkerRouter = typeof appWorkerRouter;
