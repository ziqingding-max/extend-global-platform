/**
 * HTML → PDF Service
 *
 * Uses Puppeteer + system Chromium to render pixel-perfect PDFs from HTML templates.
 * This replaces the old PDFKit-based approach which had issues with:
 *  - Markdown tables not rendering (no table support in drawMarkdown)
 *  - Blank pages due to incorrect page-break logic
 *  - Bold/italic inline formatting not supported
 *  - No company intro section in quotations
 *  - Employer cost breakdown not shown
 */

import puppeteer from "puppeteer-core";
import { marked } from "marked";
import { existsSync } from "fs";
import { execSync } from "child_process";

const CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--font-render-hinting=none",
  "--single-process",
  "--no-zygote",
];

/** Candidate paths tried in order; first existing file wins. */
const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,       // highest priority: set via Dockerfile ENV or .env
  "/usr/bin/chromium-browser",     // Alpine apk install (Dockerfile)
  "/usr/bin/chromium",             // Debian/Ubuntu apt install
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/local/bin/chromium",
  "/snap/bin/chromium",
  "/opt/google/chrome/chrome",
];

function findChromiumPath(): string {
  for (const p of CHROMIUM_CANDIDATES) {
    if (p && existsSync(p)) return p;
  }
  try {
    const found = execSync(
      "which chromium chromium-browser google-chrome google-chrome-stable 2>/dev/null | head -1",
      { encoding: "utf8" }
    ).trim();
    if (found) return found;
  } catch (_) { /* ignore */ }
  throw new Error(
    "Chromium not found. Install it (e.g. `apk add chromium` on Alpine or `apt-get install chromium-browser` on Debian) " +
    "or set the CHROMIUM_PATH environment variable."
  );
};

// ─── Brand Design Tokens ─────────────────────────────────────────────────────
const BRAND = {
  primary: "#005430",
  primaryLight: "#2E6E50",
  gold: "#E1BA2E",
  bg: "#F8FBF9",
  text: "#1a1a1a",
  muted: "#666666",
  border: "#d0ddd6",
  tableHeader: "#e8f0ec",
  tableStripe: "#f4f8f6",
};

// ─── Shared CSS ───────────────────────────────────────────────────────────────
const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 10pt;
    line-height: 1.6;
    color: ${BRAND.text};
    background: white;
  }

  /* ── Page Layout ── */
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 18mm 16mm 22mm 16mm;
    position: relative;
    page-break-after: always;
    background: white;
  }
  .page:last-child { page-break-after: avoid; min-height: auto; }

  /* ── Cover Page ── */
  .cover {
    background: white;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0;
    overflow: hidden;
    position: relative;
  }
  /* Decorative sidebar */
  .cover-sidebar {
    position: absolute;
    top: 0;
    left: 0;
    width: 18mm;
    height: 100%;
    background: ${BRAND.primary};
    z-index: 1;
  }
  .cover-sidebar::after {
    content: '';
    position: absolute;
    bottom: 60mm;
    left: 0;
    width: 18mm;
    height: 3mm;
    background: ${BRAND.gold};
  }
  /* Decorative corner accent */
  .cover-corner {
    position: absolute;
    top: 0;
    right: 0;
    width: 80mm;
    height: 80mm;
    z-index: 1;
    overflow: hidden;
  }
  .cover-corner::before {
    content: '';
    position: absolute;
    top: -30mm;
    right: -30mm;
    width: 100mm;
    height: 100mm;
    border: 6mm solid ${BRAND.bg};
    border-radius: 50%;
  }
  .cover-corner::after {
    content: '';
    position: absolute;
    top: -15mm;
    right: -15mm;
    width: 60mm;
    height: 60mm;
    border: 2mm solid ${BRAND.gold};
    border-radius: 50%;
    opacity: 0.5;
  }
  /* Bottom decorative stripe */
  .cover-bottom-accent {
    position: absolute;
    bottom: 0;
    left: 18mm;
    right: 0;
    height: 16mm;
    background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%);
    z-index: 1;
    display: flex;
    align-items: center;
    padding: 0 14mm;
  }
  .cover-bottom-accent::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 40mm;
    height: 100%;
    background: ${BRAND.gold};
    opacity: 0.15;
  }
  .cover-bottom-text {
    color: rgba(255,255,255,0.8);
    font-size: 7.5pt;
    letter-spacing: 0.5px;
    z-index: 2;
  }
  .cover-body {
    flex: 1;
    padding: 30mm 16mm 30mm 34mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    z-index: 2;
  }
  .cover-logo {
    font-size: 32pt;
    font-weight: 700;
    color: ${BRAND.primary};
    letter-spacing: -0.5px;
  }
  .cover-tagline {
    font-size: 8.5pt;
    color: ${BRAND.muted};
    margin-top: 2mm;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }
  .cover-divider {
    width: 35mm;
    height: 1.2mm;
    background: linear-gradient(90deg, ${BRAND.gold} 0%, transparent 100%);
    margin: 14mm 0;
    border-radius: 1mm;
  }
  .cover-title {
    font-size: 32pt;
    font-weight: 700;
    color: ${BRAND.primary};
    line-height: 1.15;
    margin-bottom: 5mm;
    letter-spacing: -0.3px;
  }
  .cover-subtitle {
    font-size: 14pt;
    color: ${BRAND.primaryLight};
    margin-bottom: 3mm;
    font-weight: 500;
  }
  .cover-date {
    font-size: 9pt;
    color: ${BRAND.muted};
    margin-top: 2mm;
  }
  .cover-meta {
    margin-top: 12mm;
    padding-top: 6mm;
    border-top: 0.5pt solid ${BRAND.border};
    display: flex;
    gap: 12mm;
  }
  .cover-meta-item {
    display: flex;
    flex-direction: column;
  }
  .cover-meta-label {
    font-size: 6.5pt;
    color: ${BRAND.muted};
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 1mm;
  }
  .cover-meta-value {
    font-size: 9pt;
    color: ${BRAND.text};
    font-weight: 500;
  }

  /* ── Page Header ── */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 3mm;
    border-bottom: 0.5pt solid ${BRAND.border};
    margin-bottom: 6mm;
  }
  .page-header-logo {
    font-size: 11pt;
    font-weight: 700;
    color: ${BRAND.primary};
  }
  .page-header-title {
    font-size: 9pt;
    color: ${BRAND.muted};
  }

  /* ── Page Footer ── */
  .page-footer {
    position: absolute;
    bottom: 8mm;
    left: 16mm;
    right: 16mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 0.5pt solid ${BRAND.border};
    padding-top: 2mm;
    font-size: 7.5pt;
    color: ${BRAND.muted};
  }

  /* ── Typography ── */
  h1 { font-size: 18pt; font-weight: 700; color: ${BRAND.primary}; margin: 6mm 0 3mm; }
  h2 { font-size: 14pt; font-weight: 700; color: ${BRAND.primary}; margin: 5mm 0 2.5mm; border-bottom: 0.5pt solid ${BRAND.border}; padding-bottom: 1.5mm; }
  h3 { font-size: 11pt; font-weight: 600; color: ${BRAND.primaryLight}; margin: 4mm 0 2mm; }
  h4 { font-size: 10pt; font-weight: 600; color: ${BRAND.text}; margin: 3mm 0 1.5mm; }
  p  { margin: 0 0 2.5mm; }
  strong { font-weight: 600; }
  em { font-style: italic; }

  /* ── Lists ── */
  ul, ol { margin: 1.5mm 0 2.5mm 5mm; padding-left: 4mm; }
  li { margin-bottom: 1mm; }
  ul li::marker { color: ${BRAND.gold}; }

  /* ── Tables ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 3mm 0 4mm;
    font-size: 9pt;
    page-break-inside: avoid;
  }
  thead tr {
    background: ${BRAND.tableHeader};
  }
  thead th {
    padding: 2.5mm 3mm;
    text-align: left;
    font-weight: 600;
    font-size: 8.5pt;
    color: ${BRAND.primary};
    border: 0.5pt solid ${BRAND.border};
    white-space: nowrap;
  }
  tbody tr:nth-child(even) {
    background: ${BRAND.tableStripe};
  }
  tbody td {
    padding: 2mm 3mm;
    border: 0.5pt solid ${BRAND.border};
    vertical-align: top;
    font-size: 9pt;
  }

  /* ── Section Card ── */
  .section-card {
    background: ${BRAND.bg};
    border: 0.5pt solid ${BRAND.border};
    border-radius: 2mm;
    padding: 4mm 5mm;
    margin-bottom: 4mm;
    page-break-inside: auto;
  }
  .section-card-title {
    font-size: 10pt;
    font-weight: 600;
    color: ${BRAND.primary};
    margin-bottom: 2mm;
    display: flex;
    align-items: center;
    gap: 2mm;
  }

  /* ── Info Grid ── */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2mm 6mm;
    margin-bottom: 4mm;
  }
  .info-item label {
    font-size: 7.5pt;
    color: ${BRAND.muted};
    text-transform: uppercase;
    letter-spacing: 0.3px;
    display: block;
    margin-bottom: 0.5mm;
  }
  .info-item span {
    font-size: 9.5pt;
    font-weight: 500;
    color: ${BRAND.text};
  }

  /* ── Quotation Table ── */
  .qt-table {
    width: 100%;
    border-collapse: collapse;
    margin: 3mm 0;
    font-size: 9pt;
  }
  .qt-table thead tr {
    background: ${BRAND.primary} !important;
    color: white !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .qt-table thead th {
    padding: 2.5mm 3mm;
    text-align: left;
    font-weight: 600;
    font-size: 8pt;
    border: none;
    white-space: nowrap;
    background: ${BRAND.primary} !important;
    color: white !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .qt-table thead th.right { text-align: right; }
  .qt-table tbody tr:nth-child(even) { background: ${BRAND.tableStripe}; }
  .qt-table tbody td {
    padding: 2mm 3mm;
    border-bottom: 0.5pt solid ${BRAND.border};
    vertical-align: top;
  }
  .qt-table tbody td.right { text-align: right; font-variant-numeric: tabular-nums; }
  .qt-table tbody td.bold { font-weight: 600; }
  .qt-table tfoot tr { background: ${BRAND.tableHeader}; }
  .qt-table tfoot td {
    padding: 2.5mm 3mm;
    font-weight: 700;
    border-top: 1pt solid ${BRAND.primary};
  }
  .qt-table tfoot td.right { text-align: right; font-size: 11pt; color: ${BRAND.primary}; }

  /* ── Cost Breakdown ── */
  .cost-breakdown {
    margin: 2mm 0 3mm 0;
    padding: 2mm 3mm;
    background: white;
    border: 0.5pt solid ${BRAND.border};
    border-radius: 1.5mm;
    font-size: 8.5pt;
  }
  .cost-breakdown-title {
    font-size: 8pt;
    font-weight: 600;
    color: ${BRAND.muted};
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 1.5mm;
  }
  .cost-breakdown table {
    margin: 0;
    font-size: 8pt;
  }
  .cost-breakdown table thead th {
    background: ${BRAND.tableHeader};
    font-size: 7.5pt;
    padding: 1.5mm 2mm;
  }
  .cost-breakdown table tbody td {
    padding: 1.5mm 2mm;
    font-size: 8pt;
  }
  .cost-breakdown-total {
    margin-top: 1.5mm;
    text-align: right;
    font-weight: 600;
    font-size: 8.5pt;
    color: ${BRAND.primary};
  }

  /* ── Total Box ── */
  .total-box {
    display: flex;
    justify-content: flex-end;
    margin-top: 4mm;
  }
  .total-inner {
    background: ${BRAND.primary};
    color: white;
    padding: 3mm 6mm;
    border-radius: 2mm;
    text-align: right;
  }
  .total-label { font-size: 8pt; opacity: 0.8; }
  .total-amount { font-size: 16pt; font-weight: 700; }

  /* ── Notes / Terms ── */
  .notes-box {
    background: ${BRAND.bg};
    border-left: 2pt solid ${BRAND.gold};
    padding: 3mm 4mm;
    margin: 4mm 0;
    font-size: 9pt;
    color: ${BRAND.muted};
  }

  /* ── Chapter heading ── */
  .chapter-heading {
    display: flex;
    align-items: center;
    gap: 3mm;
    margin-bottom: 4mm;
    padding-bottom: 2mm;
    border-bottom: 1pt solid ${BRAND.primary};
  }
  .chapter-number {
    background: ${BRAND.primary};
    color: white;
    width: 7mm;
    height: 7mm;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9pt;
    font-weight: 700;
    flex-shrink: 0;
  }
  .chapter-title {
    font-size: 14pt;
    font-weight: 700;
    color: ${BRAND.primary};
  }

  /* ── TOC ── */
  .toc-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 1.5mm 0;
    border-bottom: 0.3pt dotted ${BRAND.border};
    font-size: 10pt;
  }
  .toc-item:last-child { border-bottom: none; }
  .toc-num {
    font-weight: 600;
    color: ${BRAND.primary};
    min-width: 8mm;
  }
  .toc-title { flex: 1; padding: 0 3mm; }
  .toc-dots { flex: 1; border-bottom: 0.3pt dotted ${BRAND.muted}; margin: 0 2mm 1.5mm; }

  /* ── Print ── */
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

// ─── Helper: render markdown to HTML ─────────────────────────────────────────
function mdToHtml(content: string): string {
  if (!content) return "";
  // Configure marked for GFM (tables, etc.)
  marked.setOptions({ gfm: true, breaks: true } as any);
  return marked.parse(content) as string;
}

// ─── Helper: format money ─────────────────────────────────────────────────────
function fmt(n: number, currency = ""): string {
  const s = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${s}` : s;
}

// ─── Helper: launch browser ───────────────────────────────────────────────
async function launchBrowser() {
  const executablePath = findChromiumPath();
  return puppeteer.launch({
    executablePath,
    args: CHROMIUM_ARGS,
    headless: true,
  });
}

// ─── Helper: fetch remote logo and convert to base64 data URI ────────────────────
// Puppeteer may not load external URLs during PDF generation; embedding as base64 is reliable.
async function fetchLogoAsBase64(url: string): Promise<string | null> {
  try {
    const https = await import("https");
    const http = await import("http");
    return await new Promise((resolve) => {
      const client = url.startsWith("https") ? https : http;
      (client as any).get(url, (res: any) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const contentType = (res.headers["content-type"] as string) || "image/png";
          resolve(`data:${contentType};base64,${buf.toString("base64")}`);
        });
        res.on("error", () => resolve(null));
      }).on("error", () => resolve(null));
    });
  } catch {
    return null;
  }
}

// ─── Helper: render HTML to PDF buffer ───────────────────────────────────────────────
async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ─── Branding Info (from Billing Entity) ────────────────────────────────────
export interface BrandingInfo {
  /** Short display name, e.g. "GEA" or entityName */
  shortName: string;
  /** Full legal / trading name, e.g. "Global Employment Advisors" */
  fullName: string;
  /** S3/OSS URL for logo image – will be pre-fetched and converted to base64 before PDF generation */
  logoUrl?: string | null;
  /** Pre-fetched base64 data URI for logo (set internally before rendering) */
  logoBase64?: string | null;
  /** Contact email shown in T&C footer */
  contactEmail?: string | null;
  /** One-line address for "Issued By" section */
  address?: string | null;
  /** Legal name override */
  legalName?: string | null;
}

/** Default branding used when no billing entity is configured */
const DEFAULT_BRANDING: BrandingInfo = {
  shortName: "GEA",
  fullName: "Global Employment Advisors",
  logoUrl: null,
  contactEmail: "support@bestgea.com",
};

// ─── Page wrapper helpers ───────────────────────────────────────────────────
/** Pre-fetch logo URL as base64 so Puppeteer can embed it without network access during PDF rendering */
async function resolveBrandingLogo(branding: BrandingInfo): Promise<BrandingInfo> {
  if (branding.logoUrl && !branding.logoBase64) {
    const b64 = await fetchLogoAsBase64(branding.logoUrl);
    return { ...branding, logoBase64: b64 };
  }
  return branding;
}

function logoHtml(b: BrandingInfo, size: "cover" | "header"): string {
  // Prefer pre-fetched base64; fall back to URL (may not render in Puppeteer); fall back to text
  const src = b.logoBase64 || b.logoUrl;
  if (src) {
    const h = size === "cover" ? "18mm" : "7mm";
    return `<img src="${src}" alt="${b.shortName}" style="height:${h};max-width:60mm;object-fit:contain;display:block;" />`;
  }
  if (size === "cover") {
    return `<div class="cover-logo">${b.shortName}</div>`;
  }
  return `<span class="page-header-logo">${b.shortName}</span>`;
}

interface CoverMeta {
  label: string;
  value: string;
}

function coverPage(title: string, subtitle: string, date: string, branding: BrandingInfo = DEFAULT_BRANDING, meta?: CoverMeta[]): string {
  const metaHtml = meta && meta.length > 0
    ? `<div class="cover-meta">${meta.map(m => `
        <div class="cover-meta-item">
          <span class="cover-meta-label">${m.label}</span>
          <span class="cover-meta-value">${m.value}</span>
        </div>`).join("")}
      </div>`
    : "";

  return `
  <div class="page cover">
    <div class="cover-sidebar"></div>
    <div class="cover-corner"></div>
    <div class="cover-body">
      <div>
        ${logoHtml(branding, "cover")}
        ${!branding.logoUrl && !branding.logoBase64 ? `<div class="cover-tagline">${branding.fullName}</div>` : ""}
      </div>
      <div class="cover-divider"></div>
      <div class="cover-title">${title}</div>
      <div class="cover-subtitle">${subtitle}</div>
      <div class="cover-date">${date}</div>
      ${metaHtml}
    </div>
    <div class="cover-bottom-accent">
      <span class="cover-bottom-text">Confidential &amp; Proprietary &mdash; ${branding.fullName}</span>
    </div>
  </div>`;
}

function contentPage(headerTitle: string, pageNum: number, totalPages: number, body: string, branding: BrandingInfo = DEFAULT_BRANDING): string {
  return `
  <div class="page">
    <div class="page-header">
      ${logoHtml(branding, "header")}
      <span class="page-header-title">${headerTitle}</span>
    </div>
    ${body}
    <div class="page-footer">
      <span>Confidential &amp; Proprietary</span>
      <span>${branding.fullName}</span>
      <span>Page ${pageNum}</span>
    </div>
  </div>`;
}

// ─── Country Guide PDF ────────────────────────────────────────────────────────
export interface CountryGuideChapter {
  id: number;
  titleEn: string;
  titleZh?: string;
  contentEn: string;
  contentZh?: string;
  chapterKey: string;
  sortOrder: number;
}

export interface CountryInfo {
  countryCode: string;
  countryName: string;
}

export async function generateCountryGuidePdf(
  country: CountryInfo,
  chapters: CountryGuideChapter[],
  locale: "en" | "zh" = "en",
  branding: BrandingInfo = DEFAULT_BRANDING
): Promise<Buffer> {
  // Pre-fetch logo as base64 so Puppeteer can embed it reliably
  branding = await resolveBrandingLogo(branding);
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const headerTitle = `Country Guide: ${country.countryName}`;

  let pages = "";

  // 1. Cover — with metadata
  const guideMeta: CoverMeta[] = [
    { label: "Country", value: country.countryName },
    { label: "Chapters", value: `${chapters.length}` },
  ];
  pages += coverPage("Country Guide", country.countryName, date, branding, guideMeta);

  // 2. Table of Contents
  let tocRows = chapters.map((ch, i) => `
    <div class="toc-item">
      <span class="toc-num">${i + 1}.</span>
      <span class="toc-title">${locale === "zh" && ch.titleZh ? ch.titleZh : ch.titleEn}</span>
    </div>`).join("");

  pages += contentPage(headerTitle, 2, chapters.length + 2, `
    <h2>Table of Contents</h2>
    <div style="margin-top: 4mm;">${tocRows}</div>
  `, branding);

  // 3. Chapter pages
  chapters.forEach((ch, i) => {
    const title = locale === "zh" && ch.titleZh ? ch.titleZh : ch.titleEn;
    const content = locale === "zh" && ch.contentZh ? ch.contentZh : ch.contentEn;
    const htmlContent = mdToHtml(content);

    pages += contentPage(headerTitle, i + 3, chapters.length + 2, `
      <div class="chapter-heading">
        <div class="chapter-number">${i + 1}</div>
        <div class="chapter-title">${title}</div>
      </div>
      <div class="chapter-content">${htmlContent}</div>
    `, branding);
  });

  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${headerTitle}</title>
  <style>${BASE_CSS}</style>
</head>
<body>${pages}</body>
</html>`;

  return htmlToPdf(html);
}

// ─── Quotation PDF ────────────────────────────────────────────────────────────
export interface QuotationItem {
  countryCode: string;
  serviceType: string;
  headcount: number;
  salary: number;
  currency: string;
  employerCost: number;
  serviceFee: number;
  oneTimeFee?: number;
  usdEmploymentCost: number;
  subtotal: number;
  exchangeRate: number;
  calcDetails?: Array<{
    itemNameEn: string;
    employerContribution: string;
    employerRate: string;
    category: string;
  }>;
}

export interface QuotationData {
  quotationNumber: string;
  customerName: string;
  customerAddress?: string;
  companyIntro?: string;
  items: QuotationItem[];
  totalMonthly: string;
  currency: string;
  validUntil?: string;
  notes?: string;
  branding?: BrandingInfo;
  billingEntity?: {
    entityName: string;
    legalName: string;
    address?: string;
    contactEmail?: string;
    contactPhone?: string;
    country: string;
  };
  /** Name of the user who created this quotation */
  createdByName?: string;
  /** Email of the user who created this quotation */
  createdByEmail?: string;
}

export async function generateQuotationPdf(data: QuotationData): Promise<Buffer> {
  // Pre-fetch logo as base64 so Puppeteer can embed it reliably (Bug 1 fix)
  const branding: BrandingInfo = await resolveBrandingLogo(data.branding ?? DEFAULT_BRANDING);
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const headerTitle = `Quotation #${data.quotationNumber}`;
  const validUntil = data.validUntil
    ? new Date(data.validUntil).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "N/A";

  let pages = "";

  // 1. Cover — with metadata
  const coverMeta: CoverMeta[] = [
    { label: "Prepared For", value: data.customerName },
    { label: "Reference", value: data.quotationNumber },
  ];
  if (data.createdByName) {
    coverMeta.push({ label: "Your Contact", value: data.createdByName });
  }
  pages += coverPage("Quotation Proposal", `Ref: ${data.quotationNumber}`, date, branding, coverMeta);

  // 2. Company Introduction — uses billing entity name dynamically
  const companyIntroHtml = data.companyIntro
    ? `<p>${data.companyIntro}</p>`
    : `
    <h3>About CGL Group</h3>
    <p>CGL Group's core business is international executive search (CGL), with a focus on serving innovative startups and traditional enterprises undergoing transformation in China's growing economy. We provide strategic talent advisory, talent mapping, and help enterprises recruit core executive teams based on our deep understanding of industry talent markets. We also design competitive compensation packages and deliver CEO and executive leadership coaching and onboarding support.</p>

    <h3>About GEA (Global Employment Advisors)</h3>
    <p>As CGL's overseas business sub-brand, GEA helps Chinese enterprises navigate emerging markets across the full lifecycle — from Access to Implementation, from Development to Reorganization — providing comprehensive, end-to-end human resources services and solutions.</p>
    <p>We design differentiated solutions tailored not only to different industries — such as new energy, smart manufacturing, food &amp; beverage, healthcare, consumer electronics, and embodied AI — but also to clients within the same industry who have distinct strategic priorities for their overseas expansion.</p>
    <p>From lightweight market entry targeting a single destination to regional hub models with unified settlement centers, we deliver customized solutions that best fit the flexible and diversified needs of Chinese enterprises going global.</p>
  `;

  pages += contentPage(headerTitle, 2, 0, `
    <h2>About GEA (Global Employment Advisors)</h2>
    <div class="section-card">
      ${companyIntroHtml}
    </div>

    <h2>Prepared For</h2>
    <div class="info-grid">
      <div class="info-item">
        <label>Company</label>
        <span>${data.customerName}</span>
      </div>
      ${data.customerAddress ? `<div class="info-item"><label>Address</label><span>${data.customerAddress}</span></div>` : ""}
      <div class="info-item">
        <label>Quotation Reference</label>
        <span>${data.quotationNumber}</span>
      </div>
      <div class="info-item">
        <label>Date Issued</label>
        <span>${date}</span>
      </div>
      <div class="info-item">
        <label>Valid Until</label>
        <span>${validUntil}</span>
      </div>
      <div class="info-item">
        <label>Currency</label>
        <span>${data.currency}</span>
      </div>
    </div>

    ${data.billingEntity ? `
    <h2>Issued By</h2>
    <div class="info-grid">
      <div class="info-item">
        <label>Legal Entity</label>
        <span>${data.billingEntity.legalName}</span>
      </div>
      ${data.createdByName ? `<div class="info-item"><label>Contact Person</label><span>${data.createdByName}</span></div>` : ""}
      ${data.createdByEmail ? `<div class="info-item"><label>Email</label><span>${data.createdByEmail}</span></div>` : ""}
    </div>` : ""}
  `, branding);

  // 3. Pricing Summary Page
  const tableRows = data.items.map((item, idx) => {
    const serviceLabel = item.serviceType === "eor" ? "EOR"
      : item.serviceType === "visa_eor" ? "Visa EOR"
      : item.serviceType === "aor" ? "AOR"
      : item.serviceType.toUpperCase();

    const localCurrency = item.currency !== "USD"
      ? `<div style="font-size:7.5pt;color:${BRAND.muted};">${item.currency} ${fmt(item.salary)} × ${item.headcount}</div>`
      : "";

    const exchangeNote = item.currency !== "USD" && item.exchangeRate !== 1
      ? `<div style="font-size:7.5pt;color:${BRAND.muted};">Rate: 1 USD = ${item.exchangeRate.toFixed(4)} ${item.currency}</div>`
      : "";

    // Employer cost breakdown sub-table
    let breakdownHtml = "";
    if (item.calcDetails && item.calcDetails.length > 0) {
      const breakdownRows = item.calcDetails.map(d => `
        <tr>
          <td>${d.itemNameEn}</td>
          <td style="text-align:right">${d.employerRate}</td>
          <td style="text-align:right">${item.currency} ${fmt(parseFloat(d.employerContribution))}</td>
        </tr>`).join("");

      breakdownHtml = `
        <div class="cost-breakdown">
          <div class="cost-breakdown-title">Employer Contribution Breakdown</div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align:right">Rate</th>
                <th style="text-align:right">Amount (${item.currency})</th>
              </tr>
            </thead>
            <tbody>${breakdownRows}</tbody>
          </table>
          <div class="cost-breakdown-total">Total ER Cost: ${item.currency} ${fmt(item.employerCost)}</div>
        </div>`;
    }

    return `
      <tr>
        <td>${item.countryCode}</td>
        <td>${serviceLabel}</td>
        <td class="right">${item.headcount}</td>
        <td class="right">
          USD ${fmt(item.salary / (item.exchangeRate || 1))}
          ${localCurrency}
          ${exchangeNote}
        </td>
        <td class="right">
          USD ${fmt(item.employerCost / (item.exchangeRate || 1))}
          ${item.calcDetails && item.calcDetails.length > 0 ? `<div style="font-size:7.5pt;color:${BRAND.primary};cursor:pointer;">▼ see breakdown below</div>` : ""}
        </td>
        <td class="right">USD ${fmt(item.serviceFee)}${item.oneTimeFee ? `<div style="font-size:7.5pt;color:${BRAND.muted};">+ USD ${fmt(item.oneTimeFee)} (one-time)</div>` : ""}</td>
        <td class="right bold">USD ${fmt(item.subtotal)}</td>
      </tr>
      ${breakdownHtml ? `<tr><td colspan="7" style="padding:0 3mm 3mm;">${breakdownHtml}</td></tr>` : ""}`;
  }).join("");

  pages += contentPage(headerTitle, 3, 0, `
    <h2>Pricing Summary</h2>
    <p style="color:${BRAND.muted};font-size:9pt;margin-bottom:3mm;">All amounts in USD unless otherwise noted. Monthly recurring costs.</p>

    <table class="qt-table">
      <thead>
        <tr>
          <th>Country</th>
          <th>Service</th>
          <th class="right">Headcount</th>
          <th class="right">Gross Salary</th>
          <th class="right">Employer Cost</th>
          <th class="right">Service Fee</th>
          <th class="right">Monthly Subtotal</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="6" style="font-weight:700;font-size:10pt;">Total Monthly (${data.currency})</td>
          <td class="right">USD ${fmt(parseFloat(data.totalMonthly))}</td>
        </tr>
      </tfoot>
    </table>

    <div class="total-box">
      <div class="total-inner">
        <div class="total-label">TOTAL MONTHLY INVESTMENT</div>
        <div class="total-amount">USD ${fmt(parseFloat(data.totalMonthly))}</div>
      </div>
    </div>
  `, branding);

  // 4. Notes (if any) + Terms & Conditions page
  const contactEmail = data.createdByEmail ?? branding.contactEmail ?? data.billingEntity?.contactEmail ?? "support@bestgea.com";
  const contactName = data.createdByName ?? branding.shortName + " account manager";
  const notesHtml = data.notes ? `
    <div class="notes-box" style="margin-bottom:6mm;">
      <strong>Notes:</strong><br>${data.notes}
    </div>` : "";
  pages += contentPage(headerTitle, 4, 0, `
    ${notesHtml}
    <h2>Terms &amp; Conditions</h2>
    <div class="section-card" style="font-size: 8pt; line-height: 1.5;">
        <h3>1. Agreement &amp; Validity</h3>
        <p>This Quotation Proposal ("Quotation") is issued by ${branding.fullName} ("Company") to ${data.customerName} ("Client") and is valid until <strong>${validUntil}</strong>. Upon acceptance by the Client, this Quotation shall be incorporated into and form part of the Master Services Agreement ("MSA") executed between the Company and the Client. All terms defined in the MSA shall have the same meaning when used herein. Prices and terms are subject to change after the validity date, and any revised quotation shall supersede this document in its entirety.</p>

        <h3>2. Scope of Services</h3>
        <p>The Company shall provide comprehensive employment services tailored to the Client's needs, as described below. The specific scope for each engagement shall be detailed in the applicable Schedule to the MSA.</p>
        <p><strong>2.1. Employer of Record (EOR):</strong> The Company will act as the legal employer for the Client's designated personnel in the respective country. Services include: preparing and maintaining employment contracts and all necessary documentation; facilitating employee onboarding; monthly payroll processing including wages, deductions, and withholdings; administration of statutory benefits programs; tax compliance; and managing termination procedures in accordance with local labor laws. The Client retains full responsibility for the day-to-day management, supervision, work assignments, and performance evaluation of the personnel.</p>
        <p><strong>2.2. Agent of Record (AOR):</strong> The Company will engage independent contractors on behalf of the Client. Services include: contractor agreement administration, compliance verification, and payment processing. The fees quoted represent the contractor's gross rate plus the Company's management fee; no statutory employer contributions are applicable under this model.</p>

        <h3>3. Fees &amp; Payment</h3>
        <p><strong>3.1. Service Fees:</strong> The recurring monthly service fees and any one-time fees are as specified in the Pricing Summary of this Quotation. All fees are exclusive of any applicable Value Added Tax (VAT), Goods and Services Tax (GST), or similar sales taxes, which shall be added to the invoice where required by applicable law.</p>
        <p><strong>3.2. Employment Costs:</strong> The Client shall be responsible for the full employment cost, which includes the employee's gross salary and all mandatory employer contributions (e.g., social security, insurance, pension, housing fund) as required by local law in the country of employment. Current and future provisions of local labor law, collective labor agreements, and tax legislation shall apply.</p>
        <p><strong>3.3. Invoicing &amp; Payment:</strong> The Company will issue invoices monthly in advance. Unless otherwise agreed in the MSA, invoices are payable within seven (7) days of issuance by bank transfer to the Company's designated account. The Client shall be solely responsible for paying any taxes, levies, or charges imposed by any applicable tax authority in connection with the Services.</p>
        <p><strong>3.4. Security Deposit:</strong> A security deposit, typically equivalent to two (2) months of total estimated employment costs and service fees, is required upon commencement of services and will be invoiced separately. The deposit shall be refunded upon termination of services, net of any outstanding amounts owed by the Client.</p>
        <p><strong>3.5. Late Payment:</strong> If the Client fails to pay any invoice within fourteen (14) days after a payment reminder notification from the Company, the Company reserves the right to suspend or terminate the Services immediately in accordance with the MSA.</p>

        <h3>4. Currency &amp; Exchange Rates</h3>
        <p>This Quotation is presented in USD for comparative purposes. Invoices will be issued in the Client's designated billing currency as agreed in the MSA. Costs incurred in local currencies (e.g., salaries, employer contributions) will be converted using the prevailing exchange rate at the time of payroll processing. The exchange rates shown in this Quotation are indicative only and subject to market fluctuation; final invoiced amounts may vary accordingly.</p>

        <h3>5. Confidentiality</h3>
        <p>This Quotation and its contents are confidential and proprietary to the Company. It is intended solely for the use of the named Client and may not be disclosed, reproduced, or distributed to any third party without the prior written consent of the Company. Both parties agree to maintain the confidentiality of all proprietary and sensitive information exchanged during the course of the business relationship, using at least the same degree of care as each party applies to its own confidential information. These obligations shall survive the termination of the agreement.</p>

        <h3>6. Limitation of Liability</h3>
        <p><strong>6.1.</strong> The Company's sole liability to the Client in relation to any and all claims arising under or in connection with the Services (whether in contract, tort, negligence, strict liability, or otherwise) shall be for direct damages only, and shall not exceed, in the aggregate, the total service fees paid by the Client to the Company in the six (6) month period immediately preceding the event giving rise to the claim.</p>
        <p><strong>6.2.</strong> Neither party shall be liable for any loss of profits, income, revenue, anticipated savings, business, contracts, commercial opportunities, or goodwill, nor for any special, indirect, incidental, punitive, or consequential loss or damage, howsoever arising.</p>
        <p><strong>6.3.</strong> Neither party shall be liable for any losses arising out of a Force Majeure Event, being an event outside the reasonable control of the affected party, including but not limited to natural disasters, wars, epidemics, government actions, internet failures, or power outages.</p>

        <h3>7. Governing Law &amp; Dispute Resolution</h3>
        <p>This Quotation and any subsequent agreement shall be governed by and construed in accordance with the laws of Hong Kong SAR. All disputes arising out of or in connection with this Quotation or the MSA shall be resolved in accordance with the dispute resolution mechanism specified in the MSA.</p>
    </div>

    <div class="notes-box" style="margin-top:6mm;">
      For questions about this quotation, please contact <strong>${contactName}</strong> at <strong>${contactEmail}</strong>.
    </div>
  `, branding);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${headerTitle}</title>
  <style>${BASE_CSS}</style>
</head>
<body>${pages}</body>
</html>`;

  return htmlToPdf(html);
}
