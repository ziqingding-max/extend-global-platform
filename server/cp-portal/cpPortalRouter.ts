/**
 * CP Portal Main Router
 *
 * Combines all CP portal sub-routers into a single tRPC router.
 * This is mounted at /api/cp-portal (completely separate from admin's /api/trpc
 * and client portal's /api/portal).
 *
 * SECURITY ARCHITECTURE:
 * - Uses its own tRPC instance (cpPortalRouter) with its own context (CpPortalContext)
 * - Authentication via CP Portal JWT (issuer: "eg-cp-portal")
 * - Every data-access procedure uses protectedCpProcedure which injects channelPartnerId
 * - No cross-router access between admin, client portal, and CP portal
 *
 * SUB-ROUTERS:
 * - auth: Login, register, password management, branding query (PR 2.2)
 * - clients: End Client management from CP perspective (PR 2.3)
 * - pricing: CP→Client pricing configuration (PR 2.3)
 * - settings: CP branding, billing info, portal user management (PR 2.3)
 * - invoices: CP-layer invoice viewing + custom items + markPaid (PR 2.3, Task Group D)
 * - wallet: CP wallet balance and transaction viewing (PR 2.3)
 * - clientDeposits: End Client deposit (frozen wallet) management (Task Group D)
 * - quotations: CP quotation creation and management (Task Group E)
 * - operations: Read-only operations overview — payroll, leave, adjustments (Task Group E)
 * - dashboard: Profit analytics and KPI dashboard (Task Group E)
 */

import { cpPortalRouter } from "./cpPortalTrpc";
import { cpPortalAuthRouter } from "./routers/cpPortalAuthRouter";
import { cpPortalClientsRouter } from "./routers/cpPortalClientsRouter";
import { cpPortalPricingRouter } from "./routers/cpPortalPricingRouter";
import { cpPortalSettingsRouter } from "./routers/cpPortalSettingsRouter";
import { cpPortalInvoicesRouter } from "./routers/cpPortalInvoicesRouter";
import { cpPortalWalletRouter } from "./routers/cpPortalWalletRouter";
import { cpPortalClientDepositsRouter } from "./routers/cpPortalClientDepositsRouter";
import { cpPortalQuotationsRouter } from "./routers/cpPortalQuotationsRouter";
import { cpPortalOperationsRouter } from "./routers/cpPortalOperationsRouter";
import { cpPortalDashboardRouter } from "./routers/cpPortalDashboardRouter";

export const cpPortalAppRouter = cpPortalRouter({
  auth: cpPortalAuthRouter,
  clients: cpPortalClientsRouter,
  pricing: cpPortalPricingRouter,
  settings: cpPortalSettingsRouter,
  invoices: cpPortalInvoicesRouter,
  wallet: cpPortalWalletRouter,
  clientDeposits: cpPortalClientDepositsRouter,
  quotations: cpPortalQuotationsRouter,
  operations: cpPortalOperationsRouter,
  dashboard: cpPortalDashboardRouter,
});

export type CpPortalAppRouter = typeof cpPortalAppRouter;
