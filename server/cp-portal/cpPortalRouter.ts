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
 * FUTURE: Additional sub-routers will be added in PR 2.3:
 * - cpPortalClientsRouter (End Client management from CP perspective)
 * - cpPortalPricingRouter (CP→Client pricing configuration)
 * - cpPortalSettingsRouter (CP branding, billing info management)
 * - cpPortalInvoicesRouter (CP-layer invoice viewing)
 * - cpPortalWalletRouter (CP wallet balance and transaction viewing)
 */

import { cpPortalRouter } from "./cpPortalTrpc";
import { cpPortalAuthRouter } from "./routers/cpPortalAuthRouter";

export const cpPortalAppRouter = cpPortalRouter({
  auth: cpPortalAuthRouter,
  // Future sub-routers (PR 2.3):
  // clients: cpPortalClientsRouter,
  // pricing: cpPortalPricingRouter,
  // settings: cpPortalSettingsRouter,
  // invoices: cpPortalInvoicesRouter,
  // wallet: cpPortalWalletRouter,
});

export type CpPortalAppRouter = typeof cpPortalAppRouter;
