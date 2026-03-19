/*
 * EG Admin — App Router
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
import Contractors from "./pages/Contractors";
import ContractorDetail from "./pages/ContractorDetail";
import Settings from "./pages/Settings";
import Customers from "./pages/Customers";
import Payroll from "./pages/Payroll";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Adjustments from "./pages/Adjustments";
import Leave from "./pages/Leave";
import Reimbursements from "./pages/Reimbursements";
import BillingEntities from "./pages/BillingEntities";
import { Redirect } from "wouter";
import AuditLogs from "./pages/AuditLogs";
import KnowledgeBaseAdmin from "./pages/KnowledgeBaseAdmin";
import Vendors from "./pages/Vendors";
import VendorBills from "./pages/VendorBills";
import AnalyzeBill from "./pages/AnalyzeBill";
import ContractorInvoices from "./pages/admin/ContractorInvoices";
import ReleaseTasks from "./pages/admin/ReleaseTasks";
import ProfitLossReport from "./pages/ProfitLossReport";
import SalesCRM from "./pages/SalesCRM";
import Quotations from "./pages/Quotations";
import QuotationCreatePage from "./pages/QuotationCreatePage";
import AdminLogin from "./pages/AdminLogin";
import AdminInvite from "./pages/AdminInvite";
import AdminForgotPassword from "./pages/AdminForgotPassword";
import AdminResetPassword from "./pages/AdminResetPassword";
import CountryGuideList from "@/pages/admin/CountryGuideList";
import CountryGuideEditor from "@/pages/admin/CountryGuideEditor";
import AdminCountryGuide from "@/pages/admin/AdminCountryGuide";
import ChannelPartners from "./pages/ChannelPartners";
import CpWallets from "./pages/CpWallets";
import Reconciliation from "./pages/Reconciliation";

// Portal pages (lazy loaded to keep admin bundle separate)
import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { portalTrpc } from "@/lib/portalTrpc";
import { workerTrpc } from "@/lib/workerTrpc";
import { Loader2 } from "lucide-react";
import { isPortalDomain, getPortalBasePath, isWorkerDomain } from "@/lib/portalBasePath";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { BrandingProvider } from "@/hooks/useBranding";
import { isCpDomain } from "@/lib/cpBranding";

// CP Portal pages
const CpPortalLogin = lazy(() => import("./pages/cp-portal/CpPortalLogin"));
const CpPortalRegister = lazy(() => import("./pages/cp-portal/CpPortalRegister"));
const CpPortalForgotPassword = lazy(() => import("./pages/cp-portal/CpPortalForgotPassword"));
const CpPortalResetPassword = lazy(() => import("./pages/cp-portal/CpPortalResetPassword"));
const CpPortalLayout = lazy(() => import("./pages/cp-portal/CpPortalLayout"));
const CpPortalDashboard = lazy(() => import("./pages/cp-portal/CpPortalDashboard"));
const CpPortalClients = lazy(() => import("./pages/cp-portal/CpPortalClients"));
const CpPortalPricing = lazy(() => import("./pages/cp-portal/CpPortalPricing"));
const CpPortalInvoices = lazy(() => import("./pages/cp-portal/CpPortalInvoices"));
const CpPortalInvoiceDetail = lazy(() => import("./pages/cp-portal/CpPortalInvoiceDetail"));
const CpPortalWallet = lazy(() => import("./pages/cp-portal/CpPortalWallet"));
const CpPortalSettings = lazy(() => import("./pages/cp-portal/CpPortalSettings"));
const CpPortalClientDeposits = lazy(() => import("./pages/cp-portal/CpPortalClientDeposits"));
const CpPortalQuotations = lazy(() => import("./pages/cp-portal/CpPortalQuotations"));
const CpPortalOperations = lazy(() => import("./pages/cp-portal/CpPortalOperations"));
const CpPortalReleaseTasks = lazy(() => import("./pages/cp-portal/CpPortalReleaseTasks"));

// Worker Portal pages
const WorkerLogin = lazy(() => import("./pages/worker/WorkerLogin"));
const WorkerRegister = lazy(() => import("./pages/worker/WorkerRegister"));
const WorkerForgotPassword = lazy(() => import("./pages/worker/WorkerForgotPassword"));
const WorkerResetPassword = lazy(() => import("./pages/worker/WorkerResetPassword"));
const WorkerDashboard = lazy(() => import("./pages/worker/WorkerDashboard"));
const WorkerMilestones = lazy(() => import("./pages/worker/WorkerMilestones"));
const WorkerInvoices = lazy(() => import("./pages/worker/WorkerInvoices"));
const WorkerProfile = lazy(() => import("./pages/worker/WorkerProfile"));
const WorkerOnboarding = lazy(() => import("./pages/worker/WorkerOnboarding"));
const WorkerLeave = lazy(() => import("./pages/worker/WorkerLeave"));
const WorkerReimbursements = lazy(() => import("./pages/worker/WorkerReimbursements"));
const WorkerPayslips = lazy(() => import("./pages/worker/WorkerPayslips"));
const WorkerDocuments = lazy(() => import("./pages/worker/WorkerDocuments"));
const WorkerRoleSelect = lazy(() => import("./pages/worker/WorkerRoleSelect"));

const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const PortalRegister = lazy(() => import("./pages/portal/PortalRegister"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const PortalOnboarding = lazy(() => import("./pages/portal/PortalOnboarding"));
const PortalEmployees = lazy(() => import("./pages/portal/PortalEmployees"));
const PortalPeople = lazy(() => import("./pages/portal/PortalPeople"));
const PortalContractorDetail = lazy(() => import("./pages/portal/PortalContractorDetail"));
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
const PortalKnowledgeBase = lazy(() => import("./pages/portal/PortalKnowledgeBase"));const PortalCostSimulator = lazy(() => import("./pages/portal/CostSimulator"));
const PortalCountryGuide = lazy(() => import("./pages/portal/CountryGuide"));
const PortalSalaryBenchmark = lazy(() => import("./pages/portal/PortalSalaryBenchmark"));
const PortalWallet = lazy(() => import("./pages/portal/PortalWallet"));

// Separate QueryClient for CP Portal
const cpQueryClient = new QueryClient();
const cpTrpcClient = cpTrpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/cp-portal",
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

// Separate QueryClient for worker portal
const workerQueryClient = new QueryClient();
const workerTrpcClient = workerTrpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/worker",
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

/**
 * Worker Router — wrapped in its own tRPC provider
 */
function WorkerRouter() {
  const isWorkerSubdomain = isWorkerDomain();
  const basePath = isWorkerSubdomain ? "" : "/worker";
  const redirectPath = isWorkerSubdomain ? "/dashboard" : "/worker/dashboard";
  
  return (
    <workerTrpc.Provider client={workerTrpcClient} queryClient={workerQueryClient}>
      <QueryClientProvider client={workerQueryClient}>
        <Suspense fallback={<PortalFallback />}>
          <Switch>
            <Route path={`${basePath}/login`} component={WorkerLogin} />
            <Route path={`${basePath}/register`} component={WorkerRegister} />
            <Route path={`${basePath}/invite/:token`} component={WorkerRegister} />
            <Route path={`${basePath}/forgot-password`} component={WorkerForgotPassword} />
            <Route path={`${basePath}/reset-password`} component={WorkerResetPassword} />
            <Route path={`${basePath}/select-role`} component={WorkerRoleSelect} />
            <Route path={`${basePath}/onboarding`} component={WorkerOnboarding} />
            <Route path={`${basePath}/dashboard`} component={WorkerDashboard} />
            <Route path={`${basePath}/milestones`} component={WorkerMilestones} />
            <Route path={`${basePath}/invoices`} component={WorkerInvoices} />
            <Route path={`${basePath}/leave`} component={WorkerLeave} />
            <Route path={`${basePath}/reimbursements`} component={WorkerReimbursements} />
            <Route path={`${basePath}/payslips`} component={WorkerPayslips} />
            <Route path={`${basePath}/documents`} component={WorkerDocuments} />
            <Route path={`${basePath}/profile`} component={WorkerProfile} />
            <Route path={basePath || "/"}>{() => <Redirect to={redirectPath} />}</Route>
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </QueryClientProvider>
    </workerTrpc.Provider>
  );
}

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
  const base = getPortalBasePath(); // "" on app.extendglobal.ai, "/portal" otherwise
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
            {/* Fallback: /dashboard redirects to root dashboard (for impersonation redirect compatibility) */}
            <Route path={`${base}/dashboard`}>{() => <Redirect to={base || "/"} />}</Route>
            <Route path={`${base}/onboarding`} component={PortalOnboarding} />
            <Route path={`${base}/employees/:id`} component={PortalEmployeeDetail} />
            <Route path={`${base}/employees`} component={PortalPeople} />
            <Route path={`${base}/people`} component={PortalPeople} />
            <Route path={`${base}/contractors/:id`} component={PortalContractorDetail} />
            <Route path={`${base}/payroll`} component={PortalPayroll} />
            <Route path={`${base}/self-onboarding`} component={PortalSelfOnboarding} />
            <Route path={`${base}/adjustments`} component={PortalAdjustments} />
            <Route path={`${base}/reimbursements`} component={PortalReimbursements} />
            <Route path={`${base}/leave`} component={PortalLeave} />
            <Route path={`${base}/invoices/:id`} component={PortalInvoiceDetail} />
            <Route path={`${base}/invoices`} component={PortalInvoices} />
            <Route path={`${base}/wallet`} component={PortalWallet} />
            <Route path={`${base}/cost-simulator`} component={PortalCostSimulator} />
            <Route path={`${base}/country-guide`} component={PortalCountryGuide} />
            <Route path={`${base}/salary-benchmark`} component={PortalSalaryBenchmark} />
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
      <Route path="/quotations" component={Quotations} />
      <Route path="/quotations/new" component={QuotationCreatePage} />
      <Route path="/quotations/edit/:id" component={QuotationCreatePage} />
      <Route path="/customers" component={Customers} />
      <Route path="/customers/:id" component={Customers} />
      <Route path="/people" component={Employees} />
      <Route path="/people/:id" component={Employees} />
      {/* Legacy routes redirect to People */}
      <Route path="/employees">{() => <Redirect to="/people?tab=employees" />}</Route>
      <Route path="/employees/:id">{params => <Redirect to={`/people/${params.id}`} />}</Route>
      <Route path="/contractors">{() => <Redirect to="/people?tab=contractors" />}</Route>
      <Route path="/contractors/:id" component={ContractorDetail} /> {/* Keep detail route if ContractorDetail is used directly */}
      <Route path="/payroll" component={Payroll} />
      <Route path="/payroll/:id" component={Payroll} />
      <Route path="/invoices" component={Invoices} />
      <Route path="/invoices/:id" component={InvoiceDetail} />
            <Route path="/adjustments" component={Adjustments} />
            <Route path="/reimbursements" component={Reimbursements} />
      <Route path="/leave" component={Leave} />
      <Route path="/countries">{() => <Redirect to="/settings" />}</Route>
      <Route path="/billing-entities">{() => <BillingEntities />}</Route>
      <Route path="/vendors" component={Vendors} />
      <Route path="/vendors/:id" component={Vendors} />
      <Route path="/vendor-bills" component={VendorBills} />
      <Route path="/vendor-bills/new" component={AnalyzeBill} />
      <Route path="/vendor-bills/:id" component={VendorBills} />
      <Route path="/admin/contractor-invoices" component={ContractorInvoices} />
      <Route path="/admin/release-tasks" component={ReleaseTasks} />
      {/* Cost Allocation merged into VendorBills detail page */}
      <Route path="/reports/profit-loss" component={ProfitLossReport} />
      <Route path="/reports/reconciliation" component={Reconciliation} />
      <Route path="/exchange-rates">{() => <Redirect to="/settings" />}</Route>
      <Route path="/users">{() => <Redirect to="/settings" />}</Route>
      <Route path="/audit-logs">{() => <AuditLogs />}</Route>
      <Route path="/knowledge-base-admin" component={KnowledgeBaseAdmin} />
      <Route path="/admin/knowledge/country-guides/:countryCode" component={CountryGuideEditor} />
      <Route path="/admin/knowledge/country-guides" component={CountryGuideList} />
      <Route path="/admin/country-guide" component={AdminCountryGuide} />
      <Route path="/channel-partners/:id" component={ChannelPartners} />
      <Route path="/channel-partners" component={ChannelPartners} />
      <Route path="/cp-wallets" component={CpWallets} />
      <Route path="/settings" component={Settings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * CP Portal Router — wrapped in its own tRPC provider + BrandingProvider
 */
function CpPortalRouter() {
  return (
    <cpTrpc.Provider client={cpTrpcClient} queryClient={cpQueryClient}>
      <QueryClientProvider client={cpQueryClient}>
        <BrandingProvider>
          <Suspense fallback={<PortalFallback />}>
            <Switch>
              {/* Auth pages (no layout) */}
              <Route path="/cp/login" component={CpPortalLogin} />
              <Route path="/cp/register" component={CpPortalRegister} />
              <Route path="/cp/forgot-password" component={CpPortalForgotPassword} />
              <Route path="/cp/reset-password" component={CpPortalResetPassword} />
              {/* Authenticated pages (with layout) */}
              <Route path="/cp/clients" component={() => <CpPortalLayout><CpPortalClients /></CpPortalLayout>} />
              <Route path="/cp/pricing" component={() => <CpPortalLayout><CpPortalPricing /></CpPortalLayout>} />
              <Route path="/cp/invoices/:id" component={() => <CpPortalLayout><CpPortalInvoiceDetail /></CpPortalLayout>} />
              <Route path="/cp/invoices" component={() => <CpPortalLayout><CpPortalInvoices /></CpPortalLayout>} />
              <Route path="/cp/wallet" component={() => <CpPortalLayout><CpPortalWallet /></CpPortalLayout>} />
              <Route path="/cp/deposits" component={() => <CpPortalLayout><CpPortalClientDeposits /></CpPortalLayout>} />
              <Route path="/cp/quotations" component={() => <CpPortalLayout><CpPortalQuotations /></CpPortalLayout>} />
              <Route path="/cp/operations" component={() => <CpPortalLayout><CpPortalOperations /></CpPortalLayout>} />
              <Route path="/cp/release-tasks" component={() => <CpPortalLayout><CpPortalReleaseTasks /></CpPortalLayout>} />
              <Route path="/cp/settings" component={() => <CpPortalLayout><CpPortalSettings /></CpPortalLayout>} />
              <Route path="/cp">{() => <CpPortalLayout><CpPortalDashboard /></CpPortalLayout>}</Route>
              {/* Redirect bare root to /cp for CP subdomain access */}
              <Route path="/">{() => <Redirect to="/cp" />}</Route>
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </BrandingProvider>
      </QueryClientProvider>
    </cpTrpc.Provider>
  );
}

/**
 * Top-level Router — dispatches to Portal, Worker, CP Portal, or Admin based on subdomain or path.
 *
 * Subdomain routing:
 *   - {cp}.extendglobal.ai → CP branded domain (CP Portal at /cp, Portal at /portal, Worker at /worker)
 *   - app.extendglobal.ai → EG direct (Portal at root, Admin at /admin)
 *   - localhost / dev → path-based: /cp/* → CpPortalRouter, /portal/* → PortalRouter, etc.
 */
function Router() {
  // On worker subdomain (worker.extendglobal.ai), render worker portal at root level
  if (isWorkerDomain()) {
    return <WorkerRouter />;
  }
  // On portal subdomain (app.extendglobal.ai), render portal at root level
  if (isPortalDomain()) {
    return <PortalRouter />;
  }

  // On CP subdomain ({cp}.extendglobal.ai) — render CP Portal + white-labeled Portal/Worker
  if (isCpDomain()) {
    return (
      <Switch>
        {/* CP Portal routes (CP admin) */}
        <Route path="/cp/:a/:b" component={CpPortalRouter} />
        <Route path="/cp/:rest*" component={CpPortalRouter} />
        <Route path="/cp" component={CpPortalRouter} />

        {/* Worker Portal routes (white-labeled under CP) */}
        <Route path="/worker/:rest*" component={WorkerRouter} />
        <Route path="/worker" component={WorkerRouter} />

        {/* Client Portal routes (white-labeled under CP) */}
        <Route path="/portal/:a/:b" component={PortalRouter} />
        <Route path="/portal/:rest*" component={PortalRouter} />
        <Route path="/portal" component={PortalRouter} />

        {/* Default: CP Portal dashboard */}
        <Route>{() => <CpPortalRouter />}</Route>
      </Switch>
    );
  }

  // On admin subdomain or dev: path-based routing
  return (
    <Switch>
      {/* Admin auth pages (no auth required) */}
      <Route path="/login" component={AdminLogin} />
      <Route path="/invite" component={AdminInvite} />
      <Route path="/forgot-password" component={AdminForgotPassword} />
      <Route path="/reset-password" component={AdminResetPassword} />

      {/* CP Portal routes */}
      <Route path="/cp/:a/:b" component={CpPortalRouter} />
      <Route path="/cp/:rest*" component={CpPortalRouter} />
      <Route path="/cp" component={CpPortalRouter} />
      
      {/* Worker Portal routes */}
      <Route path="/worker/:rest*" component={WorkerRouter} />
      <Route path="/worker" component={WorkerRouter} />

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
