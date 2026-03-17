import { z } from "zod";
import { router } from "../_core/trpc";
import { financeManagerProcedure } from "../procedures";
import { executeTaskLLM, uploadFileToDashScope } from "../services/aiGatewayService";
import { storagePut, storageGet, storageDownload } from "../storage";
import {
  createVendorBill,
  createVendorBillItem,
  getVendorBillById,
  updateVendorBill,
  listVendors,
  createVendor,
  createBillInvoiceAllocation,
  recalcBillAllocation,
  recalcInvoiceCostAllocation,
  logAuditAction,
  getDb,
} from "../db";
import {
  employees,
  invoices,
  invoiceItems,
  vendors,
  customers,
} from "../../drizzle/schema";
import { eq, like, sql, and, inArray, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// Helper: Build system context for AI (employees, customers, invoices for a given month)
async function buildSystemContext(serviceMonth?: string) {
  const db = await getDb();
  if (!db) return { employees: [], customers: [], invoices: [], summary: "No database available" };

  // Get all active employees with their customer info
  const empRows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      country: employees.country,
      customerId: employees.customerId,
      jobTitle: employees.jobTitle,
      baseSalary: employees.baseSalary,
      salaryCurrency: employees.salaryCurrency,
    })
    .from(employees)
    .where(eq(employees.status, "active"));

  // Get all active customers
  const custRows = await db
    .select({
      id: customers.id,
      clientCode: customers.clientCode,
      companyName: customers.companyName,
      country: customers.country,
      settlementCurrency: customers.settlementCurrency,
    })
    .from(customers)
    .where(eq(customers.status, "active"));

  // Get invoices for the service month (or recent invoices if no month specified)
  let invQuery = db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      customerId: invoices.customerId,
      invoiceType: invoices.invoiceType,
      currency: invoices.currency,
      total: invoices.total,
      status: invoices.status,
      invoiceMonth: invoices.invoiceMonth,
    })
    .from(invoices);

  let invRows;
  if (serviceMonth) {
    // serviceMonth is YYYY-MM, invoiceMonth is stored as date YYYY-MM-DD
    invRows = await invQuery
      .where(
        sql`strftime('%Y-%m', ${invoices.invoiceMonth}) = ${serviceMonth} OR strftime('%Y-%m', ${invoices.createdAt}, 'unixepoch') = ${serviceMonth}`
      )
      .orderBy(desc(invoices.createdAt))
      .limit(200);
  } else {
    invRows = await invQuery
      .orderBy(desc(invoices.createdAt))
      .limit(100);
  }

  // Get invoice items with employee links for matching
  const invIds = invRows.map((i) => i.id);
  let invItemRows: Array<{
    invoiceId: number;
    employeeId: number | null;
    description: string;
    amount: string | number;
    countryCode: string | null;
  }> = [];
  if (invIds.length > 0) {
    invItemRows = await db
      .select({
        invoiceId: invoiceItems.invoiceId,
        employeeId: invoiceItems.employeeId,
        description: invoiceItems.description,
        amount: invoiceItems.amount,
        countryCode: invoiceItems.countryCode,
      })
      .from(invoiceItems)
      .where(inArray(invoiceItems.invoiceId, invIds));
  }

  // Build employee-to-invoice mapping
  const empInvoiceMap: Record<number, Array<{ invoiceId: number; invoiceNumber: string; customerId: number; amount: string | number }>> = {};
  for (const item of invItemRows) {
    if (item.employeeId) {
      if (!empInvoiceMap[item.employeeId]) empInvoiceMap[item.employeeId] = [];
      const inv = invRows.find((i) => i.id === item.invoiceId);
      if (inv) {
        empInvoiceMap[item.employeeId].push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerId: inv.customerId,
          amount: item.amount,
        });
      }
    }
  }

  // Format context for AI
  const empContext = empRows.map((e) => ({
    id: e.id,
    code: e.employeeCode,
    name: `${e.firstName} ${e.lastName}`,
    country: e.country,
    customerId: e.customerId,
    customerName: custRows.find((c) => c.id === e.customerId)?.companyName || "Unknown",
    salary: `${e.salaryCurrency} ${e.baseSalary}`,
    linkedInvoices: empInvoiceMap[e.id] || [],
  }));

  const custContext = custRows.map((c) => ({
    id: c.id,
    code: c.clientCode,
    name: c.companyName,
    country: c.country,
    currency: c.settlementCurrency,
  }));

  const invContext = invRows.map((i) => ({
    id: i.id,
    number: i.invoiceNumber,
    customerId: i.customerId,
    customerName: custRows.find((c) => c.id === i.customerId)?.companyName || "Unknown",
    type: i.invoiceType,
    currency: i.currency,
    total: i.total,
    status: i.status,
    month: i.invoiceMonth,
  }));

  return {
    employees: empContext,
    customers: custContext,
    invoices: invContext,
    summary: `${empContext.length} active employees, ${custContext.length} active customers, ${invContext.length} invoices`,
  };
}

/**
 * Helper: Download file content from various sources (storage key, data URL, or remote URL)
 * and upload to DashScope Files API to get a file-id for Qwen-Long.
 */
async function uploadFileForAI(fileUrl: string, fileKey: string, fileName: string): Promise<string> {
  let fileBuffer: Buffer;

  if (fileKey) {
    const { content } = await storageDownload(fileKey);
    fileBuffer = content;
  } else if (fileUrl.startsWith("data:")) {
    const base64Content = fileUrl.split(",")[1];
    fileBuffer = Buffer.from(base64Content, "base64");
  } else {
    const resp = await fetch(fileUrl);
    const arrayBuffer = await resp.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
  }

  // Upload to DashScope Files API (OpenAI-compatible endpoint)
  // Returns a file-id that can be referenced as fileid://<id> in system messages
  return await uploadFileToDashScope(fileBuffer, fileName);
}



export const pdfParsingRouter = router({
  // Multi-file AI parse: Upload multiple files for one vendor, cross-validate, and suggest allocations
  parseMultiFile: financeManagerProcedure
    .input(
      z.object({
        files: z.array(
          z.object({
            fileUrl: z.string(),
            fileKey: z.string(),
            fileName: z.string(),
            fileType: z.enum(["invoice", "payment_receipt", "statement", "other"]).default("invoice"),
          })
        ).min(1).max(10),
        serviceMonth: z.string(), // YYYY-MM format
        vendorId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Step 1: Build system context
      const systemContext = await buildSystemContext(input.serviceMonth);

      // Step 2: Upload ALL files to DashScope and collect file-ids
      // Qwen-Long uses fileid:// references in system messages for document understanding.
      // This works for ALL file types: PDF, Excel, images, etc.
      const fileIds: string[] = [];
      const fileUploadErrors: string[] = [];
      
      for (const f of input.files) {
        try {
          const fileId = await uploadFileForAI(f.fileUrl, f.fileKey, f.fileName);
          fileIds.push(fileId);
        } catch (e: any) {
          console.warn(`Failed to upload file ${f.fileName} to DashScope:`, e?.message);
          fileUploadErrors.push(`${f.fileName}: ${e?.message || "upload failed"}`);
        }
      }

      if (fileIds.length === 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `All file uploads failed: ${fileUploadErrors.join("; ")}`,
        });
      }

      // Step 3: Build Qwen-Long messages
      // Qwen-Long message format:
      //   - 1st system message: role definition + task instructions + system data
      //   - 2nd system message: fileid:// references (document content)
      //   - user message: the actual question (max 9,000 tokens when 2nd system msg exists)
      const fileIdReferences = fileIds.map((id) => `fileid://${id}`).join(",");

      const response = await executeTaskLLM("vendor_bill_parse", {
        messages: [
          {
            role: "system",
            content: `You are a senior financial analyst for an EOR (Employer of Record) company called Best GEA.
You are analyzing multiple documents from a SINGLE vendor for the service month ${input.serviceMonth}.
The documents may include invoices, payment receipts (POP), bank statements, or other supporting documents.

YOUR TASK:
1. Cross-reference ALL uploaded documents to extract and verify vendor bill information
2. Match line items to employees and customers in our system
3. Classify each line item's cost type (employment_cost, service_fee, visa_fee, equipment_purchase, deposit, deposit_refund, or other)
4. Suggest cost allocations (link vendor costs to our customer invoices)
5. Report confidence levels and any discrepancies between documents

SYSTEM DATA (our active employees, customers, and invoices):
Each employee has: id, code (unique identifier like EMP-0001), name, country, customerId, customerName, salary, linkedInvoices.
${JSON.stringify(systemContext.employees.slice(0, 200), null, 1)}

CUSTOMERS:
${JSON.stringify(systemContext.customers, null, 1)}

INVOICES FOR ${input.serviceMonth}:
${JSON.stringify(systemContext.invoices.slice(0, 100), null, 1)}

Return a JSON object with these fields:
- overallConfidence: number (0-100, how confident you are in the overall extraction)
- vendor: object with:
  - name: string (vendor company name)
  - legalName: string | null
  - country: string (vendor's country)
  - address: string | null
  - city: string | null
  - contactName: string | null
  - contactEmail: string | null
  - contactPhone: string | null
  - taxId: string | null
  - serviceType: string | null (e.g. "Payroll Processing", "Legal", "IT Services")
  - vendorType: string ("client_related" if costs relate to specific employees/customers, "operational" if general business cost)
  - confidence: number (0-100)
- bill: object with:
  - invoiceNumber: string
  - invoiceDate: string (YYYY-MM-DD)
  - dueDate: string | null (YYYY-MM-DD)
  - serviceMonth: string (YYYY-MM)
  - currency: string (3-letter code)
  - subtotal: number
  - tax: number
  - totalAmount: number
  - category: string (one of: payroll_processing, social_contributions, tax_filing, legal_compliance, visa_immigration, hr_advisory, it_services, office_rent, insurance, bank_charges, consulting, equipment, travel, marketing, other)
  - billType: string (one of: "operational", "deposit", "deposit_refund"). Use "deposit" if the bill is for a security deposit, guarantee deposit, or refundable advance payment to the vendor. Use "deposit_refund" if the vendor is returning a previously paid deposit. Use "operational" for all regular service/expense bills.
  - description: string
  - confidence: number (0-100)
- payment: object | null (if POP/receipt is included):
  - bankName: string
  - transactionReference: string
  - paymentDate: string (YYYY-MM-DD)
  - localCurrency: string
  - localAmount: number
  - usdAmount: number
  - exchangeRate: number | null
  - bankFee: number
  - confidence: number (0-100)
- lineItems: array of objects, each with:
  - description: string
  - employeeName: string | null (employee name as shown in document)
  - matchedEmployeeId: number | null (ID from our system if matched, from the SYSTEM DATA above)
  - matchedEmployeeCode: string | null (employee code like EMP-0001 if matched)
  - matchedCustomerId: number | null (customer ID from our system if matched via employee)
  - matchedInvoiceId: number | null (invoice ID from our system if matched)
  - itemType: string (REQUIRED - classify each line item as one of: "employment_cost" for salary/wages/social contributions/tax/pension/insurance paid on behalf of employee, "service_fee" for the vendor's own processing/management/service fee, "visa_fee" for visa/immigration/work permit related costs, "equipment_purchase" for equipment/hardware procurement, "deposit" for security deposit or guarantee, "deposit_refund" for deposit being returned, "other" for anything that doesn't fit above categories)
  - quantity: number
  - unitPrice: number
  - amount: number
  - countryCode: string | null (2-3 letter country code)
  - confidence: number (0-100)
  - matchConfidence: number (0-100, how confident you are specifically about the employee matching. Use 90+ ONLY when employee name/code is explicitly written in the document and clearly matches one employee in SYSTEM DATA. Use 50-89 when matching is based on partial name, country, or inference. Use 0-49 when you are guessing or cannot determine the employee.)
  - matchReason: string | null (explain WHY you matched or didn't match this line item to an employee, e.g. "Name 'John Zhang' exactly matches employee EMP-0012 John Zhang" or "Line item mentions 'China payroll' but cannot determine specific employee" or "No employee information found in this line item")
  - allocationSuggestion: object | null (only for client_related vendor type):
    - invoiceId: number (from our system)
    - employeeId: number (from our system)
    - allocatedAmount: number
    - reason: string (why this allocation is suggested)
- crossValidation: object with:
  - invoiceVsPaymentMatch: boolean | null (do invoice total and payment amount match?)
  - invoiceVsPaymentDifference: number | null (difference if any)
  - lineItemsSumMatchesTotal: boolean (do line items sum to the total?)
  - lineItemsSumDifference: number (difference if any)
  - documentsAnalyzed: number (how many files were successfully parsed)
  - warnings: array of strings (any discrepancies or issues found)
  - notes: array of strings (any helpful observations)

CRITICAL RULES FOR EMPLOYEE MATCHING:
- Employee code (e.g. EMP-0001) is the MOST RELIABLE identifier. If you see an employee code in the document, use it as the primary matching key.
- If no employee code is found, match by name. Names may appear in different orders (e.g. "John Smith" vs "Smith, John"), in local scripts (Chinese, Japanese, Korean), or with slight variations.
- NEVER guess an employee match. If you are not confident (matchConfidence < 50), set matchedEmployeeId to null and explain in matchReason.
- For matchedEmployeeId, ONLY use IDs from the SYSTEM DATA provided. If no match, use null.
- For matchedCustomerId, derive from the matched employee's customerId in SYSTEM DATA.
- For matchedInvoiceId, find the invoice linked to the matched employee for this service month.

CRITICAL RULES FOR ITEM TYPE CLASSIFICATION:
- itemType is REQUIRED for every line item. You MUST classify each line item.
- "employment_cost": Any cost that is the actual compensation or statutory cost of employing someone (salary, wages, social security, pension, health insurance, tax withholding, etc.)
- "service_fee": The vendor's own fee for providing their service (processing fee, management fee, admin fee, platform fee, etc.)
- "visa_fee": Government fees, legal fees, or processing fees specifically for visa/work permit/immigration
- "equipment_purchase": Hardware, laptops, office equipment purchased for employees
- If a line item contains BOTH employment cost and service fee bundled together, classify it as "employment_cost" and add a warning in crossValidation.warnings

CONFIDENCE SCORING RULES:
- Be VERY conservative. Use 90+ only when data is clearly readable, unambiguous, and cross-validated across documents.
- Use 70-89 when data is readable but has minor ambiguity or cannot be cross-validated.
- Use 50-69 when data requires inference or interpretation.
- Use below 50 when you are uncertain. In this case, set the field to null and explain in matchReason or crossValidation.warnings.
- For operational costs (bank fees, office rent, etc.), set vendorType to "operational" and skip allocation suggestions.`,
          },
          {
            // 2nd system message: document content via fileid:// references
            // Qwen-Long will parse and understand all referenced files (PDF, Excel, images, etc.)
            role: "system",
            content: fileIdReferences,
          },
          {
            role: "user",
            content: `I'm uploading ${input.files.length} document(s) from a single vendor for service month ${input.serviceMonth}. File types: ${input.files.map((f) => `${f.fileName} (${f.fileType})`).join(", ")}. Please analyze all documents together, cross-validate the information, and provide structured extraction with confidence scores and allocation suggestions.`,
          },
        ],
        // IMPORTANT: qwen-long-latest only supports json_object mode, NOT json_schema.
        // Per DashScope docs (2026-02-24), json_schema is only supported by qwen-max/plus/flash series.
        // The detailed JSON structure is already described in the system prompt above.
        response_format: {
          type: "json_object",
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI failed to parse documents" });
      }

      const parsed = JSON.parse(content);

      // Validate essential fields since json_object mode doesn't enforce schema
      if (!parsed.vendor || !parsed.bill || !Array.isArray(parsed.lineItems)) {
        console.error("[AI Parse] Missing required fields in AI response:", {
          hasVendor: !!parsed.vendor,
          hasBill: !!parsed.bill,
          hasLineItems: Array.isArray(parsed.lineItems),
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI response is missing required fields (vendor, bill, or lineItems). Please try again.",
        });
      }

      // Ensure payment object has hasPaymentInfo flag for frontend compatibility
      if (parsed.payment && typeof parsed.payment === "object" && parsed.payment.hasPaymentInfo === undefined) {
        // Legacy format: payment was null when no info, or object when present
        parsed.payment.hasPaymentInfo = true;
      }
      if (!parsed.payment || parsed.payment === null) {
        parsed.payment = { hasPaymentInfo: false };
      }

      // Ensure lineItems have allocationSuggestion with hasAllocation flag
      if (parsed.lineItems) {
        parsed.lineItems = parsed.lineItems.map((item: any) => {
          if (!item.allocationSuggestion || item.allocationSuggestion === null) {
            item.allocationSuggestion = { hasAllocation: false, invoiceId: null, employeeId: null, allocatedAmount: null, reason: null };
          } else if (item.allocationSuggestion.hasAllocation === undefined) {
            item.allocationSuggestion.hasAllocation = !!(item.allocationSuggestion.invoiceId || item.allocationSuggestion.employeeId);
          }
          return item;
        });
      }

      // Ensure crossValidation exists with defaults
      if (!parsed.crossValidation) {
        parsed.crossValidation = {
          invoiceVsPaymentMatch: null,
          invoiceVsPaymentDifference: null,
          lineItemsSumMatchesTotal: false,
          lineItemsSumDifference: 0,
          documentsAnalyzed: input.files.length,
          warnings: ["Cross-validation data was not provided by AI"],
          notes: [],
        };
      }

      // Step 4: Try to match or auto-create vendor
      parsed.vendorMatch = null;
      if (parsed.vendor?.name && !input.vendorId) {
        const vendorList = await listVendors({ search: parsed.vendor.name, pageSize: 5 });
        if (vendorList.data.length > 0) {
          parsed.vendorMatch = {
            status: "matched",
            vendor: {
              id: vendorList.data[0].id,
              name: vendorList.data[0].name,
              vendorCode: vendorList.data[0].vendorCode,
              country: vendorList.data[0].country,
            },
          };
        } else {
          // Auto-create vendor
          try {
            const newVendorData: any = {
              name: parsed.vendor.name,
              legalName: parsed.vendor.legalName || undefined,
              country: parsed.vendor.country || "Unknown",
              address: parsed.vendor.address || undefined,
              city: parsed.vendor.city || undefined,
              contactName: parsed.vendor.contactName || undefined,
              contactEmail: parsed.vendor.contactEmail || undefined,
              contactPhone: parsed.vendor.contactPhone || undefined,
              taxId: parsed.vendor.taxId || undefined,
              serviceType: parsed.vendor.serviceType || undefined,
              vendorType: parsed.vendor.vendorType || "client_related",
              currency: parsed.bill?.currency || "USD",
              paymentTermDays: 30,
              status: "active" as const,
              notes: `Auto-created from AI parsing (${input.files.length} files, ${input.serviceMonth})`,
            };
            const newVendorId = await createVendor(newVendorData);
            const vendorCode = `VND-${String(newVendorId).padStart(4, "0")}`;

            parsed.vendorMatch = {
              status: "auto_created",
              vendor: {
                id: newVendorId,
                name: parsed.vendor.name,
                vendorCode,
                country: parsed.vendor.country || "Unknown",
              },
            };

            await logAuditAction({
              userId: ctx.user.id,
              userName: ctx.user.name || ctx.user.email || "Unknown",
              action: "create",
              entityType: "vendor",
              entityId: newVendorId,
              changes: { source: "ai_multi_file_parse", created: newVendorData },
            });
          } catch (err) {
            console.error("Auto-create vendor failed:", err);
            parsed.vendorMatch = { status: "not_found", vendor: null };
          }
        }
      } else if (input.vendorId) {
        const vendorList = await listVendors({ pageSize: 1 });
        const db = await getDb();
        if (db) {
          const vRows = await db.select().from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
          if (vRows[0]) {
            parsed.vendorMatch = {
              status: "pre_selected",
              vendor: {
                id: vRows[0].id,
                name: vRows[0].name,
                vendorCode: vRows[0].vendorCode,
                country: vRows[0].country,
              },
            };
          }
        }
      }

      return {
        parsed,
        files: input.files,
        serviceMonth: input.serviceMonth,
      };
    }),

  // Apply parsed multi-file result: create bill + items + optional allocations
  applyMultiFileParse: financeManagerProcedure
    .input(
      z.object({
        vendorId: z.number(),
        billNumber: z.string(),
        billDate: z.string(),
        dueDate: z.string().optional(),
        billMonth: z.string().optional(),
        currency: z.string().default("USD"),
        subtotal: z.string(),
        tax: z.string().default("0"),
        totalAmount: z.string(),
        category: z.enum([
          "payroll_processing", "social_contributions", "tax_filing",
          "legal_compliance", "visa_immigration", "hr_advisory",
          "it_services", "office_rent", "insurance", "bank_charges",
          "consulting", "equipment", "travel", "marketing", "other",
        ]).default("other"),
        billType: z.enum(["operational", "deposit", "deposit_refund"]).default("operational"),
        description: z.string().optional(),
        receiptFileUrl: z.string().optional(),
        receiptFileKey: z.string().optional(),
        // Payment info (from POP)
        paymentInfo: z.object({
          paidDate: z.string(),
          paidAmount: z.string(),
          bankReference: z.string(),
          bankName: z.string(),
          bankFee: z.string().default("0"),
        }).optional(),
        // Line items
        items: z.array(
          z.object({
            description: z.string(),
            quantity: z.string().default("1"),
            unitPrice: z.string(),
            amount: z.string(),
            itemType: z.enum(["employment_cost", "service_fee", "visa_fee", "equipment_purchase", "deposit", "deposit_refund", "other"]).default("other"),
            relatedEmployeeId: z.number().optional(),
            relatedCustomerId: z.number().optional(),
            relatedCountryCode: z.string().optional(),
          })
        ).optional(),
        // Allocation suggestions to auto-create
        allocations: z.array(
          z.object({
            invoiceId: z.number(),
            employeeId: z.number(),
            allocatedAmount: z.string(),
            description: z.string().optional(),
          })
        ).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { items, allocations, paymentInfo, ...billData } = input;

      // Create the vendor bill
      const billValues: any = {
        ...billData,
        billDate: new Date(billData.billDate),
        dueDate: billData.dueDate ? new Date(billData.dueDate) : undefined,
        billMonth: billData.billMonth ? new Date(`${billData.billMonth}-01`) : undefined,
        submittedBy: ctx.user.id,
        submittedAt: new Date(),
        status: paymentInfo ? "paid" : "pending_approval",
      };

      // If payment info provided, add it
      if (paymentInfo) {
        billValues.paidDate = new Date(paymentInfo.paidDate);
        billValues.paidAmount = paymentInfo.paidAmount;
        billValues.bankReference = paymentInfo.bankReference;
        billValues.bankName = paymentInfo.bankName;
        billValues.bankFee = paymentInfo.bankFee;
      }

      const billId = await createVendorBill(billValues);

      // Create line items
      const itemIds: number[] = [];
      if (items && items.length > 0 && billId) {
        for (const item of items) {
          const itemId = await createVendorBillItem({
            vendorBillId: billId,
            ...item,
          });
          if (itemId) itemIds.push(itemId);
        }
      }

      // Create allocations
      let allocationsCreated = 0;
      if (allocations && allocations.length > 0 && billId) {
        const affectedInvoices: number[] = [];
        for (const alloc of allocations) {
          try {
            await createBillInvoiceAllocation({
              vendorBillId: billId,
              invoiceId: alloc.invoiceId,
              employeeId: alloc.employeeId,
              allocatedAmount: alloc.allocatedAmount,
              description: alloc.description || "Auto-allocated from AI parsing",
              allocatedBy: ctx.user.id,
            });
            allocationsCreated++;
            if (!affectedInvoices.includes(alloc.invoiceId)) {
              affectedInvoices.push(alloc.invoiceId);
            }
          } catch (err) {
            console.error("Failed to create allocation:", err);
          }
        }
        // Recalculate denormalized fields
        await recalcBillAllocation(billId);
        for (const invoiceId of affectedInvoices) {
          await recalcInvoiceCostAllocation(invoiceId);
        }
      }

      // If bank fee > 0 and payment info provided, create separate bank_charges bill
      if (paymentInfo && parseFloat(paymentInfo.bankFee) > 0) {
        const bankFeeBill: any = {
          vendorId: input.vendorId,
          billNumber: `FEE-${paymentInfo.bankReference}`,
          billDate: new Date(paymentInfo.paidDate),
          currency: "USD",
          subtotal: paymentInfo.bankFee,
          tax: "0",
          totalAmount: paymentInfo.bankFee,
          paidAmount: paymentInfo.bankFee,
          status: "paid",
          paidDate: new Date(paymentInfo.paidDate),
          category: "bank_charges",
          description: `Bank wire fee for ${billData.billNumber} via ${paymentInfo.bankName}`,
          bankReference: paymentInfo.bankReference,
          bankName: paymentInfo.bankName,
          submittedBy: ctx.user.id,
          submittedAt: new Date(),
        };
        await createVendorBill(bankFeeBill);
      }

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "create",
        entityType: "vendor_bill",
        entityId: billId,
        changes: {
          source: "ai_multi_file_parse",
          created: { ...billData, itemCount: items?.length || 0, allocationsCreated },
        },
      });

      return {
        id: billId,
        itemsCreated: itemIds.length,
        allocationsCreated,
        message: "Vendor bill created from AI analysis",
      };
    }),

  // Upload file to S3 (generic helper for file uploads)
  uploadFile: financeManagerProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string().default("application/pdf"),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const randomSuffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `vendor-docs/${Date.now()}-${randomSuffix}-${input.fileName}`;
      const { url, key } = await storagePut(fileKey, buffer, input.contentType);
      return { url, key };
    }),

  // Legacy: Single file parse (kept for backward compatibility)
  // Now uses Qwen-Long with fileid:// for document understanding
  parseVendorInvoice: financeManagerProcedure
    .input(
      z.object({
        fileUrl: z.string(),
        fileKey: z.string(),
        vendorId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Upload file to DashScope for Qwen-Long processing
      let fileId: string;
      try {
        fileId = await uploadFileForAI(input.fileUrl, input.fileKey, "vendor-invoice");
      } catch (e: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to upload file for AI processing: ${e?.message}`,
        });
      }

      const response = await executeTaskLLM("vendor_bill_parse", {
        messages: [
          {
            role: "system",
            content: `You are a financial document parser specializing in vendor invoices for an EOR (Employer of Record) company.
Extract the following information from the vendor invoice.

Return a JSON object with these fields:
- vendorName: string
- vendorCountry: string
- invoiceNumber: string
- invoiceDate: string (YYYY-MM-DD)
- dueDate: string | null (YYYY-MM-DD)
- serviceMonth: string | null (YYYY-MM)
- currency: string (3-letter code)
- subtotal: number
- tax: number
- totalAmount: number
- category: string (one of: payroll_processing, social_contributions, tax_filing, legal_compliance, visa_immigration, hr_advisory, it_services, office_rent, insurance, bank_charges, consulting, equipment, travel, marketing, other)
- billType: string (one of: "operational", "deposit", "deposit_refund"). Use "deposit" if the bill is for a security deposit, guarantee deposit, or refundable advance payment. Use "deposit_refund" if the vendor is returning a previously paid deposit. Use "operational" for all regular service/expense bills.
- description: string
- lineItems: array of { description: string, employeeName: string | null, quantity: number, unitPrice: number, amount: number, countryCode: string | null }

Be precise with numbers. If a field is not found, use null.`,
          },
          {
            // 2nd system message: document content via fileid://
            role: "system",
            content: `fileid://${fileId}`,
          },
          {
            role: "user",
            content: "Parse this vendor invoice.",
          },
        ],
        // IMPORTANT: qwen-long-latest only supports json_object mode, NOT json_schema.
        response_format: {
          type: "json_object",
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to parse PDF" });
      }

      const parsed = JSON.parse(content);

      // Try to match vendor
      if (parsed.vendorName && !input.vendorId) {
        const vendorList = await listVendors({ search: parsed.vendorName, pageSize: 5 });
        parsed.matchedVendors = vendorList.data.map((v: any) => ({
          id: v.id,
          name: v.name,
          vendorCode: v.vendorCode,
          country: v.country,
        }));
      }

      return { parsed, fileUrl: input.fileUrl, fileKey: input.fileKey };
    }),

  // Legacy: Apply single vendor invoice (kept for backward compatibility)
  applyVendorInvoice: financeManagerProcedure
    .input(
      z.object({
        vendorId: z.number(),
        billNumber: z.string(),
        billDate: z.string(),
        dueDate: z.string().optional(),
        billMonth: z.string().optional(),
        currency: z.string().default("USD"),
        subtotal: z.string(),
        tax: z.string().default("0"),
        totalAmount: z.string(),
        category: z.enum([
          "payroll_processing", "social_contributions", "tax_filing",
          "legal_compliance", "visa_immigration", "hr_advisory",
          "it_services", "office_rent", "insurance", "bank_charges",
          "consulting", "equipment", "travel", "marketing", "other",
        ]).default("other"),
        billType: z.enum(["operational", "deposit", "deposit_refund"]).default("operational"),
        description: z.string().optional(),
        receiptFileUrl: z.string().optional(),
        receiptFileKey: z.string().optional(),
        items: z.array(
          z.object({
            description: z.string(),
            quantity: z.string().default("1"),
            unitPrice: z.string(),
            amount: z.string(),
            itemType: z.enum(["employment_cost", "service_fee", "visa_fee", "equipment_purchase", "deposit", "deposit_refund", "other"]).default("other"),
            relatedEmployeeId: z.number().optional(),
            relatedCustomerId: z.number().optional(),
            relatedCountryCode: z.string().optional(),
          })
        ).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { items, ...billData } = input;
      const billValues: any = {
        ...billData,
        billDate: new Date(billData.billDate),
        dueDate: billData.dueDate ? new Date(billData.dueDate) : undefined,
        billMonth: billData.billMonth ? new Date(`${billData.billMonth}-01`) : undefined,
        submittedBy: ctx.user.id,
        submittedAt: new Date(),
        status: "pending_approval",
      };

      const insertId = await createVendorBill(billValues);

      if (items && items.length > 0 && insertId) {
        for (const item of items) {
          await createVendorBillItem({
            vendorBillId: insertId,
            ...item,
          });
        }
      }

      await logAuditAction({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email || "Unknown",
        action: "create",
        entityType: "vendor_bill",
        entityId: insertId,
        changes: { source: "pdf_parse", created: { ...billData, itemCount: items?.length || 0 } },
      });

      return { id: insertId, message: "Vendor bill created from parsed invoice" };
    }),
});
