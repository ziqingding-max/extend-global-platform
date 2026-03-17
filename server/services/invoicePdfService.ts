/**
 * Invoice PDF Generation Service
 * Generates professional PDF invoices with billing entity info, bank details, VAT breakdown.
 * Layout: Item (Type + Description two-line) | Employee | Curr | Amount
 * Supports CJK characters via Noto Sans SC font downloaded at runtime.
 */
import PDFDocument from "pdfkit";
import { getInvoiceById, listInvoiceItemsByInvoice, getCustomerById, getBillingEntityById } from "../db";
import { storageGet } from "../storage";
import path from "path";
import fs from "fs";

interface PdfOptions {
  invoiceId: number;
}

import os from "os";

// Font file URL (hosted on CDN) and local cache path
const CJK_FONT_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663378930055/BicAsHhoridCdJUF.ttf";
const CJK_FONT_CACHE_DIR = path.join(os.tmpdir(), ".font-cache");
const CJK_FONT_CACHE_PATH = path.join(CJK_FONT_CACHE_DIR, "NotoSansSC-Regular.ttf");

/** Check if text contains any non-ASCII characters that need CJK font */
function hasCJK(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(text);
}

/** Download and cache the CJK font file */
async function ensureCJKFont(): Promise<string | null> {
  try {
    // Check local cache first
    if (fs.existsSync(CJK_FONT_CACHE_PATH)) {
      return CJK_FONT_CACHE_PATH;
    }
    // Download from CDN
    console.log("[InvoicePDF] Downloading CJK font...");
    fs.mkdirSync(CJK_FONT_CACHE_DIR, { recursive: true });
    const response = await fetch(CJK_FONT_URL);
    if (!response.ok) {
      console.warn("[InvoicePDF] Failed to download CJK font:", response.status);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(CJK_FONT_CACHE_PATH, buffer);
    console.log("[InvoicePDF] CJK font cached successfully");
    return CJK_FONT_CACHE_PATH;
  } catch (err) {
    console.warn("[InvoicePDF] Failed to ensure CJK font:", err);
    return null;
  }
}

/**
 * Generate a PDF buffer for a given invoice.
 */
export async function generateInvoicePdf(options: PdfOptions): Promise<Buffer> {
  const invoice = await getInvoiceById(options.invoiceId);
  if (!invoice) throw new Error("Invoice not found");

  const customer = await getCustomerById(invoice.customerId);
  const billingEntity = invoice.billingEntityId
    ? await getBillingEntityById(invoice.billingEntityId)
    : null;
  const items = await listInvoiceItemsByInvoice(invoice.id);

  // Pre-fetch logo buffer before entering the sync Promise callback
  // Use signed URL from storageGet for private OSS buckets
  let logoBuffer: Buffer | null = null;
  if (billingEntity && (billingEntity.logoFileKey || billingEntity.logoUrl)) {
    try {
      let logoUrl = billingEntity.logoUrl;
      if (billingEntity.logoFileKey) {
        const { url: signedUrl } = await storageGet(billingEntity.logoFileKey);
        logoUrl = signedUrl;
      }
      if (logoUrl) {
        const logoResponse = await fetch(logoUrl);
        if (logoResponse.ok) {
          logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
        }
      }
    } catch (logoErr) {
      console.warn("[InvoicePDF] Failed to fetch billing entity logo:", logoErr);
    }
  }

  // Pre-download CJK font if needed
  const cjkFontPath = await ensureCJKFont();

  // Credit Note Apply mechanism removed — wallet-based flow only.
  // creditApplied field is no longer used; only walletAppliedAmount remains.

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    // Register CJK font if available
    if (cjkFontPath) {
      doc.registerFont("NotoSansSC", cjkFontPath);
    }

    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 100; // 50 margin each side
    const rightCol = 350;

    /**
     * Smart text rendering: use CJK font for text containing non-ASCII characters,
     * Helvetica for pure ASCII text.
     */
    function smartText(text: string, x: number, y: number, opts?: any, fontStyle?: "normal" | "bold") {
      if (hasCJK(text) && cjkFontPath) {
        doc.font("NotoSansSC");
      } else {
        doc.font(fontStyle === "bold" ? "Helvetica-Bold" : "Helvetica");
      }
      doc.text(text, x, y, opts);
    }

    // ========== HEADER ==========
    let leftY = 50; // Tracks left column Y position
    const rightStartY = 50; // Right column always starts at top

    // Billing entity logo (left side, above entity name)
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 50, leftY, { width: 80, height: 40, fit: [80, 40] });
        leftY += 48;
      } catch (logoErr) {
        console.warn("[InvoicePDF] Failed to render logo:", logoErr);
      }
    }

    // Billing entity info (left side)
    // Helper: calculate actual rendered height of text (accounts for word-wrap)
    function textHeight(text: string, fontSize: number, width: number): number {
      doc.fontSize(fontSize);
      return doc.heightOfString(text, { width }) + 2; // +2 for line spacing
    }

    doc.fontSize(16).fillColor("#1a1a1a");
    if (billingEntity) {
      smartText(billingEntity.entityName, 50, leftY, { width: 280 }, "bold");
      leftY += textHeight(billingEntity.entityName, 16, 280) + 2;
      doc.fontSize(9).fillColor("#666666");
      if (billingEntity.legalName && billingEntity.legalName !== billingEntity.entityName) {
        smartText(billingEntity.legalName, 50, leftY, { width: 280 });
        leftY += textHeight(billingEntity.legalName, 9, 280);
      }
      if (billingEntity.address) {
        smartText(billingEntity.address, 50, leftY, { width: 280 });
        leftY += textHeight(billingEntity.address, 9, 280);
      }
      const cityLine = [billingEntity.city, billingEntity.state, billingEntity.postalCode].filter(Boolean).join(", ");
      if (cityLine) {
        smartText(cityLine, 50, leftY, { width: 280 });
        leftY += textHeight(cityLine, 9, 280);
      }
      if (billingEntity.country) {
        smartText(billingEntity.country, 50, leftY, { width: 280 });
        leftY += textHeight(billingEntity.country, 9, 280);
      }
      if (billingEntity.registrationNumber) {
        const regText = `Reg: ${billingEntity.registrationNumber}`;
        smartText(regText, 50, leftY, { width: 280 });
        leftY += textHeight(regText, 9, 280);
      }
      if (billingEntity.taxId) {
        const taxText = `Tax ID: ${billingEntity.taxId}`;
        smartText(taxText, 50, leftY, { width: 280 });
        leftY += textHeight(taxText, 9, 280);
      }
    } else {
      smartText("GEA - Global Employment Advisors", 50, leftY, { width: 280 }, "bold");
      leftY += 20;
    }

    // Invoice title (right side — independent Y tracking)
    let ry = rightStartY;
    doc.fontSize(24).font("Helvetica-Bold").fillColor("#1a1a1a");
    doc.text("INVOICE", rightCol, ry, { width: pageWidth - rightCol + 50, align: "right" });
    ry += 32;

    doc.fontSize(10).font("Helvetica").fillColor("#333333");
    doc.text(`Invoice #: ${invoice.invoiceNumber}`, rightCol, ry, { width: pageWidth - rightCol + 50, align: "right" });
    ry += 14;
    doc.text(`Date: ${safeFormatDate(invoice.createdAt)}`, rightCol, ry, { width: pageWidth - rightCol + 50, align: "right" });
    ry += 14;
    if (invoice.dueDate) {
      doc.text(`Due Date: ${safeFormatDate(invoice.dueDate)}`, rightCol, ry, { width: pageWidth - rightCol + 50, align: "right" });
      ry += 14;
    }
    if (invoice.invoiceMonth) {
      // Fix: invoiceMonth is stored as "YYYY-MM-DD" string. Parse it correctly to avoid timezone offset.
      const monthVal = String(invoice.invoiceMonth);
      let monthStr: string;
      if (/^\d{4}-\d{2}/.test(monthVal)) {
        // Parse year and month directly from the string to avoid timezone issues
        const [yearStr, monthNumStr] = monthVal.split("-");
        const monthNames = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"];
        monthStr = `${monthNames[parseInt(monthNumStr, 10) - 1]} ${yearStr}`;
      } else {
        monthStr = new Date(monthVal).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      }
      doc.text(`Period: ${monthStr}`, rightCol, ry, { width: pageWidth - rightCol + 50, align: "right" });
      ry += 14;
    }
    const typeLabel = invoice.invoiceType === "deposit" ? "Deposit Invoice"
      : invoice.invoiceType === "monthly_eor" ? "Monthly Invoice (EOR)"
      : invoice.invoiceType === "monthly_visa_eor" ? "Monthly Invoice (Visa EOR)"
      : invoice.invoiceType === "monthly_aor" ? "Monthly Invoice (AOR)"
      : invoice.invoiceType === "visa_service" ? "Visa Service Invoice"
      : invoice.invoiceType === "credit_note" ? "Credit Note"
      : invoice.invoiceType === "deposit_refund" ? "Deposit Refund"
      : invoice.invoiceType === "manual" ? "Invoice"
      : "Invoice";
    doc.font("Helvetica-Bold").text(typeLabel, rightCol, ry, { width: pageWidth - rightCol + 50, align: "right" });
    ry += 14;

    // ========== BILL TO ==========
    // Use the max of left and right column Y positions to start Bill To section
    let billToY = Math.max(leftY, ry) + 15;
    doc.moveTo(50, billToY).lineTo(50 + pageWidth, billToY).lineWidth(0.5).strokeColor("#cccccc").stroke();
    billToY += 15;

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888");
    doc.text("BILL TO", 50, billToY);
    billToY += 14;

    doc.fontSize(10).fillColor("#1a1a1a");
    smartText(customer?.companyName || `Customer #${invoice.customerId}`, 50, billToY, undefined, "bold");
    billToY += 14;

    doc.fontSize(9).fillColor("#666666");
    if (customer?.legalEntityName) {
      smartText(customer.legalEntityName, 50, billToY, { width: 280 });
      billToY += textHeight(customer.legalEntityName, 9, 280);
    }
    if (customer?.address) {
      smartText(customer.address, 50, billToY, { width: 280 });
      billToY += textHeight(customer.address, 9, 280);
    }
    const custCityLine = [customer?.city, customer?.state, customer?.postalCode].filter(Boolean).join(", ");
    if (custCityLine) {
      smartText(custCityLine, 50, billToY, { width: 280 });
      billToY += textHeight(custCityLine, 9, 280);
    }
    if (customer?.country) {
      smartText(customer.country, 50, billToY, { width: 280 });
      billToY += textHeight(customer.country, 9, 280);
    }
    if (customer?.primaryContactEmail) {
      doc.font("Helvetica"); doc.text(customer.primaryContactEmail, 50, billToY, { width: 280 });
      billToY += textHeight(customer.primaryContactEmail, 9, 280);
    }

    // ========== LINE ITEMS TABLE ==========
    let tableY = billToY + 20;
    doc.moveTo(50, tableY).lineTo(50 + pageWidth, tableY).lineWidth(0.5).strokeColor("#cccccc").stroke();
    tableY += 8;

    // 6-column layout: Item | Curr | Qty | Rate | Tax | Amount
    const cols = {
      item: { x: 50, w: 175 },
      curr: { x: 230, w: 40 },
      qty: { x: 275, w: 40 },
      rate: { x: 320, w: 75 },
      tax: { x: 400, w: 50 },
      amount: { x: 455, w: 90 },
    };

    doc.fontSize(8).font("Helvetica-Bold").fillColor("#888888");
    doc.text("ITEM", cols.item.x, tableY, { width: cols.item.w });
    doc.text("CURR", cols.curr.x, tableY, { width: cols.curr.w });
    doc.text("QTY", cols.qty.x, tableY, { width: cols.qty.w, align: "right" });
    doc.text("RATE", cols.rate.x, tableY, { width: cols.rate.w, align: "right" });
    doc.text("TAX", cols.tax.x, tableY, { width: cols.tax.w, align: "right" });
    doc.text("AMOUNT", cols.amount.x, tableY, { width: cols.amount.w, align: "right" });

    tableY += 14;
    doc.moveTo(50, tableY).lineTo(50 + pageWidth, tableY).lineWidth(0.3).strokeColor("#e0e0e0").stroke();
    tableY += 6;

    // Table rows
    const currency = invoice.currency || "USD";
    const itemTypeLabels: Record<string, string> = {
      eor_service_fee: "EOR Service Fee",
      visa_eor_service_fee: "Visa EOR Service Fee",
      aor_service_fee: "AOR Service Fee",
      employment_cost: "Employment Cost",
      deposit: "Deposit",
      equipment_procurement_fee: "Equipment Procurement",
      one_time_onboarding_fee: "Onboarding Fee",
      one_time_offboarding_fee: "Offboarding Fee",
      administrative_setup_fee: "Admin Setup Fee",
      contract_termination_fee: "Contract Termination",
      payroll_processing_fee: "Payroll Processing",
      tax_filing_compliance_fee: "Tax Filing & Compliance",
      hr_advisory_service_fee: "HR Advisory",
      legal_compliance_support_fee: "Legal & Compliance",
      visa_immigration_service_fee: "Visa & Immigration",
      relocation_support_fee: "Relocation Support",
      custom_benefits_admin_fee: "Benefits Admin",
      bank_transfer_fee: "Bank Transfer Fee",
      consulting_fee: "Consulting Fee",
      management_consulting_fee: "Mgmt Consulting",
    };

    for (const item of items) {
      // Check if we need a new page (need ~30px for two-line item)
      if (tableY > doc.page.height - 160) {
        doc.addPage();
        tableY = 50;
      }

      // Line 1: Type label (bold) + data columns
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#333333");
      const typeText = itemTypeLabels[item.itemType] || item.itemType;
      doc.text(typeText, cols.item.x, tableY, { width: cols.item.w });

      // Curr
      doc.font("Helvetica").fillColor("#333333").fontSize(8);
      doc.text(item.localCurrency || currency || "—", cols.curr.x, tableY, { width: cols.curr.w });

      // Qty
      doc.text(parseFloat(item.quantity?.toString() || "1").toString(), cols.qty.x, tableY, { width: cols.qty.w, align: "right" });

      // Rate
      doc.text(formatNum(item.unitPrice), cols.rate.x, tableY, { width: cols.rate.w, align: "right" });

      // Tax
      const vatRate = parseFloat(item.vatRate?.toString() || "0");
      doc.text(vatRate > 0 ? `${vatRate}%` : "—", cols.tax.x, tableY, { width: cols.tax.w, align: "right" });

      // Amount (show local currency amount; fallback to invoice amount)
      doc.text(formatNum(item.localAmount || item.amount), cols.amount.x, tableY, { width: cols.amount.w, align: "right" });

      // Line 2: Description (smaller, muted)
      tableY += 11;
      doc.fontSize(7).fillColor("#888888");
      const desc = item.description.length > 80 ? item.description.slice(0, 77) + "..." : item.description;
      smartText(desc, cols.item.x + 2, tableY, { width: cols.item.w + cols.curr.w + cols.qty.w - 2 });

      tableY += 14;
    }

    // ========== INVOICE CURRENCY + TOTALS ==========
    tableY += 6;
    doc.moveTo(50, tableY).lineTo(50 + pageWidth, tableY).lineWidth(0.5).strokeColor("#cccccc").stroke();
    tableY += 10;

    const totalsLabelX = 350;
    const totalsValX = 435;
    const totalsValW = 110;

    // Invoice Currency
    doc.fontSize(9).font("Helvetica").fillColor("#888888");
    doc.text("Invoice Currency", totalsLabelX, tableY, { width: 110 });
    doc.font("Helvetica-Bold").fillColor("#333333");
    doc.text(currency, totalsValX, tableY, { width: totalsValW, align: "right" });
    tableY += 16;

    // Exchange Rate (only show if there are foreign currency items)
    const foreignCurrencies = new Set(
      items.map((i: any) => i.localCurrency).filter((c: any) => c && c !== currency)
    );
    if (foreignCurrencies.size > 0 && invoice.exchangeRateWithMarkup) {
      const foreignCcy = Array.from(foreignCurrencies)[0] as string;
      doc.fontSize(9).font("Helvetica").fillColor("#888888");
      doc.text("Exchange Rate", totalsLabelX, tableY, { width: 110 });
      doc.font("Helvetica").fillColor("#333333");
      const rateStr = parseFloat(invoice.exchangeRateWithMarkup).toFixed(6);
      doc.text(`1 ${foreignCcy} = ${rateStr} ${currency}`, totalsValX, tableY, { width: totalsValW, align: "right" });
      tableY += 16;
    }

    // Subtotal
    doc.fontSize(9).font("Helvetica").fillColor("#666666");
    doc.text("Subtotal", totalsLabelX, tableY, { width: 110 });
    doc.text(`${currency} ${formatNum(invoice.subtotal)}`, totalsValX, tableY, { width: totalsValW, align: "right" });
    tableY += 14;

    // Tax / VAT
    doc.text("Tax / VAT", totalsLabelX, tableY, { width: 110 });
    doc.text(`${currency} ${formatNum(invoice.tax)}`, totalsValX, tableY, { width: totalsValW, align: "right" });
    tableY += 14;

    // Wallet deductions section
    const walletAppliedAmt = parseFloat(invoice.walletAppliedAmount?.toString() || "0");
    const hasDeductions = walletAppliedAmt > 0.01;

    if (hasDeductions) {
      tableY += 4;
      doc.moveTo(totalsLabelX, tableY).lineTo(50 + pageWidth, tableY).lineWidth(0.3).strokeColor("#aaaaaa").stroke();
      tableY += 8;

      doc.fontSize(9).font("Helvetica-Bold").fillColor("#2563eb");
      doc.text("INVOICE TOTAL", totalsLabelX, tableY, { width: 110 });
      doc.text(`${currency} ${formatNum(invoice.total)}`, totalsValX, tableY, { width: totalsValW, align: "right" });
      tableY += 14;

      doc.fontSize(8).font("Helvetica").fillColor("#2563eb");

      // Show Wallet Applied deductions (use single-line layout to prevent wrapping)
      doc.text("Less: Wallet Applied", totalsLabelX, tableY, { width: totalsValX - totalsLabelX - 2, lineBreak: false });
      doc.text(`- ${currency} ${formatNum(walletAppliedAmt)}`, totalsValX, tableY, { width: totalsValW, align: "right" });
      tableY += 12;
      
      tableY += 2;
    }

    // Total line
    tableY += 4;
    doc.moveTo(totalsLabelX, tableY).lineTo(50 + pageWidth, tableY).lineWidth(0.5).strokeColor("#333333").stroke();
    tableY += 8;

    // Show adjusted AMOUNT DUE when wallet is applied, otherwise show TOTAL DUE
    const finalAmountDue = walletAppliedAmt > 0.01
      ? parseFloat(invoice.amountDue?.toString() || (parseFloat(invoice.total?.toString() || "0") - walletAppliedAmt).toFixed(2))
      : parseFloat(invoice.total?.toString() || "0");
    const totalLabel = walletAppliedAmt > 0.01 ? "AMOUNT DUE" : "TOTAL DUE";

    doc.fontSize(11).font("Helvetica-Bold").fillColor("#1a1a1a");
    doc.text(totalLabel, totalsLabelX, tableY, { width: 110 });
    doc.text(`${currency} ${formatNum(finalAmountDue.toFixed(2))}`, totalsValX, tableY, { width: totalsValW, align: "right" });

    // ========== BANK DETAILS ==========
    if (billingEntity && billingEntity.bankDetails) {
      tableY += 35;

      if (tableY > doc.page.height - 120) {
        doc.addPage();
        tableY = 50;
      }

      doc.moveTo(50, tableY).lineTo(50 + pageWidth, tableY).lineWidth(0.5).strokeColor("#cccccc").stroke();
      tableY += 12;

      doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888");
      doc.text("PAYMENT DETAILS", 50, tableY);
      tableY += 14;

      // Render bank details as plain text preserving line breaks
      doc.fontSize(9).fillColor("#333333");
      const bankLines = billingEntity.bankDetails.split("\n");
      for (const line of bankLines) {
        if (tableY > doc.page.height - 80) {
          doc.addPage();
          tableY = 50;
        }
        smartText(line.trim(), 50, tableY, { width: pageWidth });
        tableY += 12;
      }
    }

    // ========== NOTES ==========
    if (invoice.notes) {
      tableY += 20;
      if (tableY > doc.page.height - 80) {
        doc.addPage();
        tableY = 50;
      }
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#888888");
      doc.text("NOTES", 50, tableY);
      tableY += 12;
      doc.fontSize(8).fillColor("#666666");
      smartText(invoice.notes, 50, tableY, { width: pageWidth });
    }

    // No footer — removed "Generated on" text

    doc.end();
  });
}

/** Safely format a date value */
function safeFormatDate(val: any, locale: string = "en-GB", options?: Intl.DateTimeFormatOptions): string {
  if (!val) return "N/A";
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString(locale, options);
}

function formatNum(val: any): string {
  if (val === null || val === undefined) return "0.00";
  const num = typeof val === "string" ? parseFloat(val) : Number(val);
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
