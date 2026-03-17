/**
 * Portal Main Router
 *
 * Combines all portal sub-routers into a single tRPC router.
 * This is mounted at /api/portal (completely separate from admin's /api/trpc).
 *
 * SECURITY ARCHITECTURE:
 * - Uses its own tRPC instance (portalRouter) with its own context (PortalContext)
 * - Authentication via portal JWT (not admin Manus OAuth)
 * - Every data-access procedure uses protectedPortalProcedure which injects customerId
 * - No cross-router access between admin and portal
 */

import { portalRouter } from "./portalTrpc";
import { portalAuthRouter } from "./routers/portalAuthRouter";
import { portalDashboardRouter } from "./routers/portalDashboardRouter";
import { portalEmployeesRouter } from "./routers/portalEmployeesRouter";
import { portalAdjustmentsRouter } from "./routers/portalAdjustmentsRouter";
import { portalLeaveRouter } from "./routers/portalLeaveRouter";
import { portalInvoicesRouter } from "./routers/portalInvoicesRouter";
import { portalSettingsRouter } from "./routers/portalSettingsRouter";
import { portalPayrollRouter } from "./routers/portalPayrollRouter";
import { portalReimbursementsRouter } from "./routers/portalReimbursementsRouter";
import { portalKnowledgeBaseRouter } from "./routers/portalKnowledgeBaseRouter";
import { portalToolkitRouter } from "./routers/portalToolkitRouter";
import { portalWalletRouter } from "./routers/portalWalletRouter";
import { portalContractorsRouter } from "./routers/portalContractorsRouter";
import { portalMilestonesRouter } from "./routers/portalMilestonesRouter";

export const portalAppRouter = portalRouter({
  auth: portalAuthRouter,
  dashboard: portalDashboardRouter,
  employees: portalEmployeesRouter,
  adjustments: portalAdjustmentsRouter,
  leave: portalLeaveRouter,
  payroll: portalPayrollRouter,
  reimbursements: portalReimbursementsRouter,
  invoices: portalInvoicesRouter,
  settings: portalSettingsRouter,
  knowledgeBase: portalKnowledgeBaseRouter,
  toolkit: portalToolkitRouter,
  wallet: portalWalletRouter,
  contractors: portalContractorsRouter,
  milestones: portalMilestonesRouter,
});

export type PortalAppRouter = typeof portalAppRouter;
