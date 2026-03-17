import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import rateLimit from "express-rate-limit";
import { registerAuthRoutes } from "./authRoutes";
import { registerAdminForgotPasswordRoutes } from "./adminForgotPassword";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { portalAppRouter } from "../portal/portalRouter";
import { createPortalContext } from "../portal/portalTrpc";
import { appWorkerRouter } from "../worker/workerRouter";
import { createWorkerContext } from "../worker/workerTrpc";
import { cpPortalAppRouter } from "../cp-portal/cpPortalRouter";
import { createCpPortalContext } from "../cp-portal/cpPortalTrpc";
import { serveStatic } from "./serve-static";
import { generateInvoicePdf } from "../services/invoicePdfService";
import { countryGuidePdfService } from "../services/countryGuidePdfService";
import { authenticateAdminRequest } from "./adminAuth";
import { authenticatePortalRequest } from "../portal/portalAuth";
import { getDb } from "../db";
import { invoices } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export async function createApp(options: { skipStatic?: boolean } = {}) {
  const app = express();
  const server = createServer(app);
  // Trust proxy (required when behind Nginx reverse proxy)
  app.set('trust proxy', 1);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "https://*"],
          connectSrc: ["'self'", "ws:", "wss:"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
      // Disable HSTS when not using HTTPS yet
      strictTransportSecurity: false,
    })
  );

  // Rate Limiting
  // General API limiter
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // Limit each IP to 300 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

  // Stricter limiter for sensitive auth routes
  const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each IP to 20 login attempts per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts, please try again later." },
  });

  // Apply rate limiting
  app.use("/api", apiLimiter);
  app.use("/api/auth/login", authLimiter); // Specifically protect login


  // Admin auth routes (login/logout + forgot password)
  registerAuthRoutes(app);
  registerAdminForgotPasswordRoutes(app);

  // PDF preview endpoint (inline display in browser)
  app.get("/api/invoices/:id/pdf/preview", async (req, res) => {
    try {
      const user = await authenticateAdminRequest(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const invoiceId = parseInt(req.params.id, 10);
      if (isNaN(invoiceId)) {
        res.status(400).json({ error: "Invalid invoice ID" });
        return;
      }
      const pdfBuffer = await generateInvoicePdf({ invoiceId });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="invoice-${invoiceId}.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length.toString());
      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF preview error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "PDF generation failed" });
    }
  });

  // PDF download endpoint (direct Express route for binary response)
  app.get("/api/invoices/:id/pdf", async (req, res) => {
    try {
      // Verify user session
      const user = await authenticateAdminRequest(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const invoiceId = parseInt(req.params.id, 10);
      if (isNaN(invoiceId)) {
        res.status(400).json({ error: "Invalid invoice ID" });
        return;
      }
      // Fetch invoice number for filename
      const db = getDb();
      const inv = db ? await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, invoiceId)).then(r => r[0]) : null;
      const pdfBuffer = await generateInvoicePdf({ invoiceId });
      const filename = inv?.invoiceNumber ? `${inv.invoiceNumber}.pdf` : `invoice-${invoiceId}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length.toString());
      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF generation error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "PDF generation failed" });
    }
  });

  // Portal PDF download endpoint (uses portal JWT auth)
  app.get("/api/portal-invoices/:id/pdf", async (req, res) => {
    try {
      const portalUser = await authenticatePortalRequest(req);
      if (!portalUser) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const invoiceId = parseInt(req.params.id, 10);
      if (isNaN(invoiceId)) {
        res.status(400).json({ error: "Invalid invoice ID" });
        return;
      }
      // Verify the invoice belongs to this customer
      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Database unavailable" });
        return;
      }
      const [invoice] = await db
        .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.customerId, portalUser.customerId)));
      if (!invoice) {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }
      const pdfBuffer = await generateInvoicePdf({ invoiceId });
      const filename = invoice.invoiceNumber ? `${invoice.invoiceNumber}.pdf` : `invoice-${invoiceId}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length.toString());
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Portal PDF generation error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "PDF generation failed" });
    }
  });

  // Portal Country Guide PDF download endpoint
  app.get("/api/portal-country-guide/:countryCode/pdf", async (req, res) => {
    try {
      const portalUser = await authenticatePortalRequest(req);
      if (!portalUser) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { countryCode } = req.params;
      if (!countryCode || countryCode.length > 3) {
        res.status(400).json({ error: "Invalid country code" });
        return;
      }
      // Bug 4 fix: support ?locale=zh for Chinese language PDF
      const locale = req.query.locale === "zh" ? "zh" : "en";
      const pdfBuffer = await countryGuidePdfService.generatePdf(countryCode.toUpperCase(), locale);
      if (!pdfBuffer) {
        res.status(404).json({ error: "Country guide not found" });
        return;
      }
      const langSuffix = locale === "zh" ? "-zh" : "";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="country-guide-${countryCode}${langSuffix}.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length.toString());
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Country guide PDF error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "PDF generation failed" });
    }
  });

  // Admin Country Guide PDF download endpoint (uses admin session auth)
  app.get("/api/admin-country-guide/:countryCode/pdf", async (req, res) => {
    try {
      const user = await authenticateAdminRequest(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { countryCode } = req.params;
      if (!countryCode || countryCode.length > 3) {
        res.status(400).json({ error: "Invalid country code" });
        return;
      }
      const locale = req.query.locale === "zh" ? "zh" : "en";
      const pdfBuffer = await countryGuidePdfService.generatePdf(countryCode.toUpperCase(), locale);
      if (!pdfBuffer) {
        res.status(404).json({ error: "Country guide not found" });
        return;
      }
      const langSuffix = locale === "zh" ? "-zh" : "";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="country-guide-${countryCode}${langSuffix}.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length.toString());
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Admin country guide PDF error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "PDF generation failed" });
    }
  });

  // Portal impersonation endpoint — admin generates token, this sets cookie and redirects
  app.get("/api/portal-impersonate", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) {
        res.status(400).json({ error: "Missing token" });
        return;
      }
      // Verify the token is valid
      const { verifyPortalToken, setPortalCookie } = await import("../portal/portalAuth");
      const payload = await verifyPortalToken(token);
      if (!payload) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      // Set portal cookie
      setPortalCookie(res, token);
      // Redirect to portal dashboard
      // On app.extendglobal.ai, PortalRouter mounts dashboard at root "/"
      // On other hosts (dev/manus.space), portal uses path prefix "/portal"
      const portalBase = req.hostname === "app.extendglobal.ai" ? "" : "/portal";
      const redirectTarget = portalBase ? `${portalBase}/dashboard` : "/";
      res.redirect(redirectTarget);
    } catch (error) {
      console.error("Portal impersonation error:", error);
      res.status(500).json({ error: "Impersonation failed" });
    }
  });

  // tRPC API — Admin (JWT auth)
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // tRPC API — Client Portal (independent JWT auth)
  // Completely separate router, context, and auth system
  app.use(
    "/api/portal",
    createExpressMiddleware({
      router: portalAppRouter,
      createContext: createPortalContext,
    })
  );

  // tRPC API — Worker Portal (independent JWT auth)
  app.use(
    "/api/worker",
    createExpressMiddleware({
      router: appWorkerRouter,
      createContext: createWorkerContext,
    })
  );

  // tRPC API — CP Portal (independent JWT auth)
  // Completely separate router, context, and auth system for Channel Partners
  app.use(
    "/api/cp-portal",
    createExpressMiddleware({
      router: cpPortalAppRouter,
      createContext: createCpPortalContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (!options.skipStatic) {
    if (process.env.NODE_ENV === "development") {
      // Dynamic import vite-setup only in dev; use string concatenation to prevent esbuild from bundling it
      const viteMod = "./vite-" + "setup";
      const { setupVite } = await import(/* @vite-ignore */ viteMod);
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  }

  return { app, server };
}
