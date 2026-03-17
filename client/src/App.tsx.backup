/*
 * GEA Admin — App Router
 * Design: Corporate Precision — Swiss International Typographic Style meets Enterprise SaaS
 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
// import Countries from "./pages/Countries"; // Moved to Settings tab
import Settings from "./pages/Settings";
import Customers from "./pages/Customers";
import Payroll from "./pages/Payroll";
import Invoices from "./pages/Invoices";
import Adjustments from "./pages/Adjustments";
import Leave from "./pages/Leave";
import Reimbursements from "./pages/Reimbursements";
import BillingEntities from "./pages/BillingEntities";
import { Redirect } from "wouter";
import AuditLogs from "./pages/AuditLogs";
import HelpCenter from "./pages/HelpCenter";
import KnowledgeBaseAdmin from "./pages/KnowledgeBaseAdmin";
import AISettings from "./pages/AISettings";
import Vendors from "./pages/Vendors";
import VendorBills from "./pages/VendorBills";
import ProfitLossReport from "./pages/ProfitLossReport";
// import CostAllocation from "./pages/CostAllocation"; // Removed: merged into VendorBills detail
import SalesCRM from "./pages/SalesCRM";
import AdminLogin from "./pages/AdminLogin";
import AdminInvite from "./pages/AdminInvite";

// Portal pages (lazy loaded to keep admin bundle separate)
import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { portalTrpc } from "@/lib/portalTrpc";
import { Loader2 } from "lucide-react";
import { isPortalDomain, getPortalBasePath } from "@/lib/portalBasePath";

const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const PortalRegister = lazy(() => import("./pages/portal/PortalRegister"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const PortalOnboarding = lazy(() => import("./pages/portal/PortalOnboarding"));
const PortalEmployees = lazy(() => import("./pages/portal/PortalEmployees"));
const PortalAdjustments = lazy(() => import("./pages/portal/PortalAdjustments"));
const PortalLeave = lazy(() => import("./pages/portal/PortalLeave"));
const PortalInvoices = lazy(() => import("./pages/portal/PortalInvoices"));
const PortalSettings = lazy(() => import("./pages/portal/PortalSettings"));
const PortalEmployeeDetail = lazy(() => import("./pages/portal/PortalEmployeeDetail"));
const PortalPayroll = lazy(() => import("./pages/portal/PortalPayroll"));
const PortalSelfOnboarding = lazy(() => import("./pages/portal/PortalSelfOnboarding"));
const PortalInvoiceDetail = lazy(() => import("./pages/portal/PortalInvoiceDetail"));
const PortalForgotPassword = lazy(() => import("./pages/portal/PortalForgotPassword"));
const PortalResetPassword = lazy(() => import("./pages/portal/PortalResetPassword"));
const PortalReimbursements = lazy(() => import("./pages/portal/PortalReimbursements"));
const PortalKnowledgeBase = lazy(() => import("./pages/portal/PortalKnowledgeBase"));

// Separate QueryClient for portal (no admin auth redirect)
const portalQueryClient = new QueryClient();
const portalTrpcClient = portalTrpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/portal",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

function PortalFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

/**
 * Portal Router — wrapped in its own tRPC provider
 * Completely isolated from admin auth/session
 */
function PortalRouter() {
  const base = getPortalBasePath(); // "" on app.geahr.com, "/portal" otherwise
  return (
    <portalTrpc.Provider client={portalTrpcClient} queryClient={portalQueryClient}>
      <QueryClientProvider client={portalQueryClient}>
        <Suspense fallback={<PortalFallback />}>
          <Switch>
            <Route path={`${base}/login`} component={PortalLogin} />
            <Route path={`${base}/register`} component={PortalRegister} />
            <Route path={`${base}/forgot-password`} component={PortalForgotPassword} />
            <Route path={`${base}/reset-password`} component={PortalResetPassword} />
            <Route path={base || "/"} component={PortalDashboard} />
            <Route path={`${base}/onboarding`} component={PortalOnboarding} />
            <Route path={`${base}/employees/:id`} component={PortalEmployeeDetail} />
            <Route path={`${base}/employees`} component={PortalEmployees} />
            <Route path={`${base}/payroll`} component={PortalPayroll} />
            <Route path={`${base}/self-onboarding`} component={PortalSelfOnboarding} />
            <Route path={`${base}/adjustments`} component={PortalAdjustments} />
            <Route path={`${base}/reimbursements`} component={PortalReimbursements} />
            <Route path={`${base}/leave`} component={PortalLeave} />
            <Route path={`${base}/invoices/:id`} component={PortalInvoiceDetail} />
            <Route path={`${base}/invoices`} component={PortalInvoices} />
            <Route path={`${base}/knowledge-base`} component={PortalKnowledgeBase} />
            <Route path={`${base}/compliance`}>{() => <Redirect to={`${base}/knowledge-base`} />}</Route>
            <Route path={`${base}/help`}>{() => <Redirect to={`${base}/knowledge-base`} />}</Route>
            <Route path={`${base}/settings`} component={PortalSettings} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </QueryClientProvider>
    </portalTrpc.Provider>
  );
}

/**
 * Admin Router — uses admin tRPC provider from main.tsx
 */
function AdminRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/sales-crm" component={SalesCRM} />
      <Route path="/customers" component={Customers} />
      <Route path="/customers/:id" component={Customers} />
      <Route path="/employees" component={Employees} />
      <Route path="/employees/:id" component={Employees} />
      <Route path="/payroll" component={Payroll} />
      <Route path="/payroll/:id" component={Payroll} />
      <Route path="/invoices" component={Invoices} />
      <Route path="/invoices/:id" component={Invoices} />
            <Route path="/adjustments" component={Adjustments} />
            <Route path="/reimbursements" component={Reimbursements} />
      <Route path="/leave" component={Leave} />
      <Route path="/countries">{() => <Redirect to="/settings" />}</Route>
      <Route path="/billing-entities">{() => <BillingEntities />}</Route>
      <Route path="/vendors" component={Vendors} />
      <Route path="/vendors/:id" component={Vendors} />
      <Route path="/vendor-bills" component={VendorBills} />
      <Route path="/vendor-bills/:id" component={VendorBills} />
      {/* Cost Allocation merged into VendorBills detail page */}
      <Route path="/reports/profit-loss" component={ProfitLossReport} />
      <Route path="/exchange-rates">{() => <Redirect to="/settings" />}</Route>
      <Route path="/users">{() => <Redirect to="/settings" />}</Route>
      <Route path="/audit-logs">{() => <AuditLogs />}</Route>
      <Route path="/help" component={HelpCenter} />
      <Route path="/knowledge-base-admin" component={KnowledgeBaseAdmin} />
      <Route path="/ai-settings" component={AISettings} />
      <Route path="/settings" component={Settings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Top-level Router — dispatches to Portal or Admin based on subdomain or path.
 *
 * Subdomain routing:
 *   - app.geahr.com → PortalRouter (all routes at root: /, /login, /employees, etc.)
 *   - admin.geahr.com → AdminRouter (admin dashboard at root)
 *   - localhost / *.manus.space → path-based: /portal/* → PortalRouter, else AdminRouter
 */
function Router() {
  // On portal subdomain (app.geahr.com), render portal at root level
  if (isPortalDomain()) {
    return <PortalRouter />;
  }

  // On admin subdomain or dev: path-based routing
  return (
    <Switch>
      {/* Admin auth pages (no auth required) */}
      <Route path="/login" component={AdminLogin} />
      <Route path="/invite" component={AdminInvite} />
      {/* Portal routes (path-based fallback for dev/manus.space) */}
      <Route path="/portal/:a/:b" component={PortalRouter} />
      <Route path="/portal/:rest*" component={PortalRouter} />
      <Route path="/portal" component={PortalRouter} />
      {/* Admin routes (auth required — handled by Layout component) */}
      <Route>{() => <AdminRouter />}</Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-right" richColors closeButton expand visibleToasts={8} gap={8} />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
