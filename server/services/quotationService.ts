import { getDb } from "../db";
import { quotations, customers, salesLeads, billingEntities, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { calculationService } from "./calculationService";
import { getExchangeRate } from "./exchangeRateService";
import { storagePut, storageGet } from "../storage";
import { generateQuotationPdf, BrandingInfo } from "./htmlPdfService";
import { countryGuidePdfService } from "./countryGuidePdfService";
import { mergePdfs } from "./contentMergeService";

interface QuotationItemInput {
  countryCode: string;
  regionCode?: string; // Added regionCode
  headcount: number;
  salary: number;
  currency: string;
  serviceType: "eor" | "visa_eor" | "aor";
  serviceFee: number;
  oneTimeFee?: number;
}

interface CreateQuotationInput {
  leadId?: number;
  customerId?: number;
  items: QuotationItemInput[];
  validUntil?: string;
  createdBy: number;
  notes?: string;
  includeCountryGuide?: boolean; // New Flag
}

interface UpdateQuotationInput extends CreateQuotationInput {
  id: number;
  updatedBy: number;
}

export const quotationService = {
  createQuotation: async (input: CreateQuotationInput) => {
    const db = getDb();
    if (!db) throw new Error("Database connection failed");

    // 1. Calculate costs for each item
    const calculatedItems = [];
    let totalMonthly = 0;
    const quotationCurrency = "USD"; // Standardize on USD for the final quotation total

    // TODO: Dynamic year selection based on validity. For now using 2025 as our seed data is 2025.
    const year = 2025; 

    for (const item of input.items) {
      // 1a. AOR: No social insurance calculation
      if (item.serviceType === "aor") {
        // For AOR, "salary" is the Contractor Rate.
        // There are no employer costs (no social insurance).
        const employerCost = 0;
        const totalEmploymentCostLocal = item.salary;
        
        let exchangeRate = 1;
        let usdEmploymentCost = totalEmploymentCostLocal;

        // Convert to USD if needed
        if (item.currency !== "USD") {
          const rateData = await getExchangeRate("USD", item.currency);
          if (rateData) {
             exchangeRate = rateData.rateWithMarkup;
             usdEmploymentCost = totalEmploymentCostLocal / exchangeRate;
          }
        }

        const subtotal = (usdEmploymentCost + item.serviceFee) * item.headcount;

        calculatedItems.push({
          ...item,
          employerCost, 
          totalEmploymentCost: totalEmploymentCostLocal, 
          exchangeRate,
          usdEmploymentCost,
          subtotal, 
          calcDetails: [] // No social insurance breakdown
        });

        totalMonthly += subtotal;
        continue; // Skip to next item
      }

      // 1b. EOR / Visa EOR: Calculate social insurance
      const calcResult = await calculationService.calculateSocialInsurance({
        countryCode: item.countryCode,
        year,
        salary: item.salary,
        regionCode: item.regionCode, 
      });

      const employerCost = parseFloat(calcResult.totalEmployer);
      const totalEmploymentCostLocal = item.salary + employerCost;
      
      // Convert Local Employment Cost to USD
      // item.currency is the Local Currency (e.g., CNY, EUR)
      let exchangeRate = 1;
      let usdEmploymentCost = totalEmploymentCostLocal;

      if (item.currency !== "USD") {
        const rateData = await getExchangeRate("USD", item.currency);
        if (rateData) {
           // rateData.rateWithMarkup is USD -> Local (e.g. 1 USD = 7.2 CNY)
           // To convert Local -> USD: Amount / Rate
           exchangeRate = rateData.rateWithMarkup;
           usdEmploymentCost = totalEmploymentCostLocal / exchangeRate;
        }
      }

      // Total Item Monthly = USD Employment Cost + USD Service Fee
      const subtotal = (usdEmploymentCost + item.serviceFee) * item.headcount;

      calculatedItems.push({
        ...item,
        employerCost, // Local
        totalEmploymentCost: totalEmploymentCostLocal, // Local
        exchangeRate,
        usdEmploymentCost,
        subtotal, // USD
        calcDetails: calcResult.items
      });

      totalMonthly += subtotal;
    }

    // 2. Generate Quotation Number
    // Format: Q-{YYYY}{MM}{DD}-{Random4}
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const quotationNumber = `Q-${dateStr}-${randomSuffix}`;

    // 3. Create Record
    const [result] = await db.insert(quotations).values({
      quotationNumber,
      leadId: input.leadId,
      customerId: input.customerId,
      countries: JSON.stringify(calculatedItems),
      totalMonthly: totalMonthly.toFixed(2),
      currency: quotationCurrency,
      snapshotData: calculatedItems, // Full breakdown
      validUntil: input.validUntil || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), // Default 15 days
      status: "draft",
      createdBy: input.createdBy,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning({ id: quotations.id });

    // 4. Generate PDF
    await quotationService.generatePdf(result.id, input.includeCountryGuide);

    return result;
  },

  updateQuotation: async (input: UpdateQuotationInput) => {
    const db = getDb();
    if (!db) throw new Error("Database connection failed");

    // Check status
    const existing = await db.query.quotations.findFirst({
        where: eq(quotations.id, input.id)
    });
    if (!existing) throw new Error("Quotation not found");
    if (existing.status !== "draft") throw new Error("Only draft quotations can be edited");

    // 1. Recalculate
    const calculatedItems = [];
    let totalMonthly = 0;
    const quotationCurrency = "USD";
    const year = 2025; 

    for (const item of input.items) {
      // 1a. AOR: No social insurance calculation
      if (item.serviceType === "aor") {
        const employerCost = 0;
        const totalEmploymentCostLocal = item.salary;
        
        let exchangeRate = 1;
        let usdEmploymentCost = totalEmploymentCostLocal;

        if (item.currency !== "USD") {
          const rateData = await getExchangeRate("USD", item.currency);
          if (rateData) {
             exchangeRate = rateData.rateWithMarkup;
             usdEmploymentCost = totalEmploymentCostLocal / exchangeRate;
          }
        }

        const subtotal = (usdEmploymentCost + item.serviceFee) * item.headcount;

        calculatedItems.push({
          ...item,
          employerCost, 
          totalEmploymentCost: totalEmploymentCostLocal, 
          exchangeRate,
          usdEmploymentCost,
          subtotal, 
          calcDetails: [] 
        });

        totalMonthly += subtotal;
        continue; 
      }

      // 1b. EOR / Visa EOR: Calculate social insurance
      const calcResult = await calculationService.calculateSocialInsurance({
        countryCode: item.countryCode,
        year,
        salary: item.salary,
        regionCode: item.regionCode, 
      });

      const employerCost = parseFloat(calcResult.totalEmployer);
      const totalEmploymentCostLocal = item.salary + employerCost;
      
      let exchangeRate = 1;
      let usdEmploymentCost = totalEmploymentCostLocal;

      if (item.currency !== "USD") {
        const rateData = await getExchangeRate("USD", item.currency);
        if (rateData) {
           exchangeRate = rateData.rateWithMarkup;
           usdEmploymentCost = totalEmploymentCostLocal / exchangeRate;
        }
      }

      const subtotal = (usdEmploymentCost + item.serviceFee) * item.headcount;

      calculatedItems.push({
        ...item,
        employerCost, 
        totalEmploymentCost: totalEmploymentCostLocal, 
        exchangeRate,
        usdEmploymentCost,
        subtotal, 
        calcDetails: calcResult.items
      });

      totalMonthly += subtotal;
    }

    // 2. Update Record
    await db.update(quotations).set({
      leadId: input.leadId,
      customerId: input.customerId,
      countries: JSON.stringify(calculatedItems),
      totalMonthly: totalMonthly.toFixed(2),
      currency: quotationCurrency,
      snapshotData: calculatedItems,
      validUntil: input.validUntil,
      updatedAt: new Date()
    }).where(eq(quotations.id, input.id));

    // 3. Regenerate PDF
    await quotationService.generatePdf(input.id, input.includeCountryGuide);

    return { id: input.id };
  },

  generatePdf: async (quotationId: number, includeCountryGuide = false) => {
    const db = getDb();
    if (!db) throw new Error("Database connection failed");

    const quotation = await db.query.quotations.findFirst({
      where: eq(quotations.id, quotationId)
    });
    if (!quotation) throw new Error("Quotation not found");

    let customerName = "Valued Customer";
    let customerAddress = "";
    
    if (quotation.customerId) {
      const customer = await db.query.customers.findFirst({
        where: eq(customers.id, quotation.customerId)
      });
      if (customer) {
        customerName = customer.companyName;
        customerAddress = [customer.address, customer.city, customer.country].filter(Boolean).join(", ");
      }
    } else if (quotation.leadId) {
      const lead = await db.query.salesLeads.findFirst({
        where: eq(salesLeads.id, quotation.leadId)
      });
      if (lead) {
        customerName = lead.companyName;
        customerAddress = lead.country || "";
      }
    }

    // Drizzle already parses JSON columns, so we don't need to parse it again if it's an object/array
    const items = Array.isArray(quotation.snapshotData) 
      ? quotation.snapshotData 
      : typeof quotation.snapshotData === 'string' 
        ? JSON.parse(quotation.snapshotData) 
        : [];
    
    // Step 1: Fetch billing entity info (for branding + "Issued By" section)
    // Priority: isDefault=true → first active entity → hardcoded GEA defaults
    let billingEntity: any = undefined;
    let branding: BrandingInfo = {
      shortName: "GEA",
      fullName: "Global Employment Advisors",
      contactEmail: "support@bestgea.com",
    };

    let defaultBilling = await db.query.billingEntities.findFirst({
      where: eq(billingEntities.isDefault, true)
    });
    if (!defaultBilling) {
      // Fall back to first active entity
      defaultBilling = await db.query.billingEntities.findFirst({
        where: eq(billingEntities.isActive, true)
      }) ?? undefined;
    }
    if (defaultBilling) {
      const addressParts = [defaultBilling.address, defaultBilling.city, defaultBilling.country].filter(Boolean);
      const address = addressParts.join(", ") || undefined;
      billingEntity = {
        entityName: defaultBilling.entityName,
        legalName: defaultBilling.legalName,
        address,
        contactEmail: defaultBilling.contactEmail ?? undefined,
        contactPhone: defaultBilling.contactPhone ?? undefined,
        country: defaultBilling.country,
      };
      // Build BrandingInfo from the same entity
      // Resolve logo URL: prefer signed S3 URL from logoFileKey, fall back to logoUrl
      let resolvedLogoUrl = defaultBilling.logoUrl ?? null;
      if (defaultBilling.logoFileKey) {
        try {
          const { url: signedUrl } = await storageGet(defaultBilling.logoFileKey);
          resolvedLogoUrl = signedUrl;
        } catch (err) {
          console.warn("[QuotationService] Failed to sign logo URL:", err);
        }
      }
      branding = {
        shortName: defaultBilling.entityName,
        fullName: defaultBilling.legalName,
        logoUrl: resolvedLogoUrl,
        contactEmail: defaultBilling.contactEmail ?? null,
        address: address ?? null,
        legalName: defaultBilling.legalName,
      };
    }

    // Step 1b: Fetch creator info (name & email for "Issued By" and contact sections)
    let createdByName: string | undefined;
    let createdByEmail: string | undefined;
    if (quotation.createdBy) {
      const creator = await db.query.users.findFirst({
        where: eq(users.id, quotation.createdBy)
      });
      if (creator) {
        createdByName = creator.name ?? undefined;
        createdByEmail = creator.email ?? undefined;
      }
    }

    // Step 2: Generate the Quotation PDF using HTML engine
    const quotationBuffer = await generateQuotationPdf({
      quotationNumber: quotation.quotationNumber,
      customerName,
      customerAddress,
      items: items as any[],
      totalMonthly: quotation.totalMonthly,
      currency: quotation.currency,
      validUntil: quotation.validUntil ?? undefined,
      billingEntity,
      branding,
      createdByName,
      createdByEmail,
    });

    // Step 3: Fetch Additional PDFs (Country Guides)
    const pdfsToMerge: Buffer[] = [quotationBuffer];
    
    if (includeCountryGuide) {
        const countries = Array.from(new Set(items.map((i: any) => i.countryCode)));
        for (const code of countries) {
          const guideBuffer = await countryGuidePdfService.generatePdf(code as string);
          if (guideBuffer) pdfsToMerge.push(guideBuffer);
        }
    }

    // Step 4: Merge
    // Bug fix: htmlPdfService already adds "Page X" in each page footer;
    // setting addPageNumbers=true here would create duplicate overlapping page numbers.
    const finalPdfBuffer = await mergePdfs(pdfsToMerge, { 
      addPageNumbers: false,
      metadata: {
        title: `Quotation ${quotation.quotationNumber}`,
        subject: `Proposal for ${customerName}`
      }
    });

    // Step 5: Upload to S3
    const fileName = `Quotation-${quotation.quotationNumber}.pdf`;
    const { key, url } = await storagePut(`quotations/${fileName}`, finalPdfBuffer, "application/pdf");

    // Update DB
    await db.update(quotations)
      .set({ pdfKey: key, pdfUrl: url })
      .where(eq(quotations.id, quotationId));
    
    return { key, url, buffer: finalPdfBuffer };
  }
};

function formatMoney(amount: number) {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
