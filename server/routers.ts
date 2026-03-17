import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { customersRouter } from "./routers/customers";
import { employeesRouter } from "./routers/employees";
import { payrollRouter } from "./routers/payroll";
import { invoicesRouter } from "./routers/invoices";
import { invoiceGenerationRouter } from "./routers/invoiceGeneration";
import { countriesRouter } from "./routers/countries";
import { leaveRouter } from "./routers/leave";
import { adjustmentsRouter } from "./routers/adjustments";
import { reimbursementsRouter } from "./routers/reimbursements";
import { dashboardRouter } from "./routers/dashboard";
import { billingEntitiesRouter } from "./routers/billingEntities";
import { userManagementRouter } from "./routers/userManagement";
import { auditLogsRouter } from "./routers/auditLogs";
import { exchangeRatesRouter } from "./routers/exchangeRates";
import { systemSettingsRouter } from "./routers/systemSettings";
import { customerLeavePoliciesRouter } from "./routers/customerLeavePolicies";
import { vendorsRouter } from "./routers/vendors";
import { vendorBillsRouter } from "./routers/vendorBills";
import { reportsRouter } from "./routers/reports";
import { allocationsRouter } from "./routers/allocations";
import { pdfParsingRouter } from "./routers/pdfParsing";
import { salesRouter } from "./routers/sales";
import { knowledgeBaseAdminRouter } from "./routers/knowledgeBaseAdmin";
import { notificationsRouter } from "./routers/notifications";
import { calculationRouter } from "./routers/calculationRouter";
import { quotationRouter } from "./routers/quotationRouter";
import { countryGuideRouter } from "./routers/countryGuideRouter";
import { salaryBenchmarkRouter } from "./routers/salaryBenchmarkRouter";
import { contractorsRouter } from "./routers/contractors";
import { walletRouter } from "./routers/billing/walletRouter";
import { channelPartnersRouter } from "./routers/channelPartners";
import { reconciliationRouter } from "./routers/reconciliation";
import { fxStrippingRouter } from "./routers/fxStripping";
import { netPnlRouter } from "./routers/netPnl";
import { fundFlowRouter } from "./routers/fundFlow";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  customers: customersRouter,
  employees: employeesRouter,
  payroll: payrollRouter,
  invoices: invoicesRouter,
  invoiceGeneration: invoiceGenerationRouter,
  countries: countriesRouter,
  leave: leaveRouter,
  adjustments: adjustmentsRouter,
  reimbursements: reimbursementsRouter,
  dashboard: dashboardRouter,
  billingEntities: billingEntitiesRouter,
  userManagement: userManagementRouter,
  auditLogs: auditLogsRouter,
  exchangeRates: exchangeRatesRouter,
  systemSettings: systemSettingsRouter,
  customerLeavePolicies: customerLeavePoliciesRouter,
  vendors: vendorsRouter,
  vendorBills: vendorBillsRouter,
  reports: reportsRouter,
  allocations: allocationsRouter,
  pdfParsing: pdfParsingRouter,
  sales: salesRouter,
  knowledgeBaseAdmin: knowledgeBaseAdminRouter,
  notifications: notificationsRouter,
  calculation: calculationRouter,
  quotations: quotationRouter,
  countryGuides: countryGuideRouter,
  salaryBenchmarks: salaryBenchmarkRouter,
  contractors: contractorsRouter,
  wallet: walletRouter,
  channelPartners: channelPartnersRouter,
  reconciliation: reconciliationRouter,
  fxStripping: fxStrippingRouter,
  netPnl: netPnlRouter,
  fundFlow: fundFlowRouter,
});

export type AppRouter = typeof appRouter;
