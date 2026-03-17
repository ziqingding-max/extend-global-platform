import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import os from "os";

// --- Constants & Config ---

const CJK_FONT_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663378930055/BicAsHhoridCdJUF.ttf";
const CJK_FONT_CACHE_DIR = path.join(os.tmpdir(), ".font-cache");
const CJK_FONT_CACHE_PATH = path.join(CJK_FONT_CACHE_DIR, "NotoSansSC-Regular.ttf");

export const BRAND_COLORS = {
  primary: "#1B5E20", // Deep Green
  accent: "#D4A017",  // Gold
  background: "#FFF8E1", // Beige
  text: "#1a1a1a",
  textMuted: "#666666",
  border: "#cccccc"
};

// --- Font Management ---

function hasCJK(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(text);
}

export async function ensureCJKFont(): Promise<string | null> {
  try {
    if (fs.existsSync(CJK_FONT_CACHE_PATH)) {
      return CJK_FONT_CACHE_PATH;
    }
    fs.mkdirSync(CJK_FONT_CACHE_DIR, { recursive: true });
    
    // @ts-ignore
    const response = await fetch(CJK_FONT_URL);
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(CJK_FONT_CACHE_PATH, buffer);
    return CJK_FONT_CACHE_PATH;
  } catch (err) {
    console.warn("[PDFBrand] Failed to ensure CJK font:", err);
    return null;
  }
}

// --- Brand Components ---

interface CreatePdfOptions {
  size?: "A4" | "LETTER";
  margins?: { top: number; bottom: number; left: number; right: number };
}

export async function createBrandedPdfDocument(options: CreatePdfOptions = {}): Promise<{ doc: PDFKit.PDFDocument; cjkFontPath: string | null }> {
  const doc = new PDFDocument({
    size: options.size || "A4",
    margins: options.margins || { top: 50, bottom: 50, left: 50, right: 50 },
    autoFirstPage: true
  });

  const cjkFontPath = await ensureCJKFont();
  if (cjkFontPath) {
    doc.registerFont("NotoSansSC", cjkFontPath);
  }

  return { doc, cjkFontPath };
}

export function drawCoverPage(doc: PDFKit.PDFDocument, title: string, subtitle: string, date: string, cjkFontPath: string | null) {
  // Background
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(BRAND_COLORS.background);

  // Geometric Decoration (Gold Accent)
  doc.save();
  doc.moveTo(0, 0).lineTo(200, 0).lineTo(0, 200).fill(BRAND_COLORS.accent);
  doc.restore();

  // Logo Area (Placeholder)
  doc.fontSize(24).fillColor(BRAND_COLORS.primary).font("Helvetica-Bold").text("GEA", 50, 50);
  doc.fontSize(10).fillColor(BRAND_COLORS.textMuted).font("Helvetica").text("Global Employment Advisors", 50, 75);

  // Title Centered
  const centerY = doc.page.height / 2 - 50;
  
  doc.fontSize(36).fillColor(BRAND_COLORS.primary);
  if (hasCJK(title) && cjkFontPath) doc.font("NotoSansSC");
  else doc.font("Helvetica-Bold");
  doc.text(title, 50, centerY, { align: "center", width: doc.page.width - 100 });

  // Subtitle
  doc.moveDown();
  doc.fontSize(18).fillColor(BRAND_COLORS.text);
  if (hasCJK(subtitle) && cjkFontPath) doc.font("NotoSansSC");
  else doc.font("Helvetica");
  doc.text(subtitle, { align: "center", width: doc.page.width - 100 });

  // Date
  doc.moveDown(2);
  doc.fontSize(12).fillColor(BRAND_COLORS.textMuted);
  doc.text(date, { align: "center" });

  // Footer Decoration
  doc.rect(0, doc.page.height - 20, doc.page.width, 20).fill(BRAND_COLORS.primary);
  
  // New Page for content
  doc.addPage();
  // Reset background for next pages (white)
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("white"); 
}

export function drawHeader(doc: PDFKit.PDFDocument, title: string) {
  const topY = 30;
  doc.fontSize(10).fillColor(BRAND_COLORS.textMuted).text("GEA - Global Employment Advisors", 50, topY);
  doc.fontSize(10).text(title, 50, topY, { align: "right", width: doc.page.width - 100 });
  
  // Divider line
  doc.moveTo(50, topY + 15).lineTo(doc.page.width - 50, topY + 15)
     .lineWidth(0.5).strokeColor(BRAND_COLORS.border).stroke();
}

export function drawFooter(doc: PDFKit.PDFDocument, pageNumber: number) {
  const bottomY = doc.page.height - 40;
  
  // Divider line
  doc.moveTo(50, bottomY - 10).lineTo(doc.page.width - 50, bottomY - 10)
     .lineWidth(0.5).strokeColor(BRAND_COLORS.border).stroke();

  doc.fontSize(8).fillColor(BRAND_COLORS.textMuted);
  doc.text("Confidential & Proprietary", 50, bottomY);
  doc.text(`Page ${pageNumber}`, 50, bottomY, { align: "right", width: doc.page.width - 100 });
}

export function smartText(doc: PDFKit.PDFDocument, text: string, x: number | null, y: number | null, opts: any, cjkFontPath: string | null, bold = false) {
  if (hasCJK(text) && cjkFontPath) {
    doc.registerFont("NotoSansSC", cjkFontPath);
    doc.font("NotoSansSC");
  } else {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica");
  }
  if (x !== null && y !== null) {
    doc.text(text, x, y, opts);
  } else {
    doc.text(text, opts);
  }
}

export function drawMarkdown(doc: PDFKit.PDFDocument, content: string, cjkFontPath: string | null) {
  const lines = content.split("\n");
  const margin = 50;
  const width = doc.page.width - 100;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      doc.moveDown(0.5);
      continue;
    }

    if (doc.y > doc.page.height - 50) {
      doc.addPage();
    }

    if (trimmed.startsWith("# ")) {
      // H1
      doc.fontSize(16).fillColor(BRAND_COLORS.primary);
      smartText(doc, trimmed.substring(2), null, null, { width }, cjkFontPath, true);
      doc.moveDown(0.5);
    } else if (trimmed.startsWith("## ")) {
      // H2
      doc.fontSize(14).fillColor(BRAND_COLORS.primary);
      smartText(doc, trimmed.substring(3), null, null, { width }, cjkFontPath, true);
      doc.moveDown(0.5);
    } else if (trimmed.startsWith("### ")) {
      // H3
      doc.fontSize(12).fillColor(BRAND_COLORS.text);
      smartText(doc, trimmed.substring(4), null, null, { width }, cjkFontPath, true);
      doc.moveDown(0.3);
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      // List
      doc.fontSize(10).fillColor(BRAND_COLORS.text);
      const text = trimmed.substring(2);
      
      const currentY = doc.y;
      doc.circle(margin + 5, currentY + 4, 2).fill(BRAND_COLORS.accent);
      
      smartText(doc, text, margin + 15, currentY - 2, { width: width - 15 }, cjkFontPath);
      doc.moveDown(0.2);
    } else {
      // Paragraph
      doc.fontSize(10).fillColor(BRAND_COLORS.text);
      smartText(doc, trimmed, null, null, { width, align: "justify" }, cjkFontPath);
      doc.moveDown(0.5);
    }
  }
}
