/**
 * Worker Documents Router
 *
 * Both Employee and Contractor: view documents and contracts uploaded by Admin/Client.
 *
 * Employee:
 *   - listDocuments: employee_documents excluding documentType = 'payslip' | 'contract'
 *     (payslips → dedicated Payslips page, contracts → Contracts tab)
 *   - listContracts: employee_documents (documentType = 'contract') merged with employee_contracts
 *
 * Contractor:
 *   - listDocuments: contractor_documents (all types)
 *   - listContracts: contractor_contracts
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  workerRouter,
  protectedWorkerProcedure,
} from "../workerTrpc";
import { getDb } from "../../services/db/connection";
import {
  employeeDocuments,
  employeeContracts,
  contractorDocuments,
  contractorContracts,
} from "../../../drizzle/schema";
import { eq, and, notInArray, desc } from "drizzle-orm";

export const workerDocumentsRouter = workerRouter({
  /**
   * List my documents — excludes payslip and contract types for employees
   * (payslips shown in Payslips page, contracts shown in Contracts tab)
   */
  listDocuments: protectedWorkerProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { workerUser } = ctx;

    if (workerUser.workerType === "employee" && workerUser.employeeId) {
      // Exclude payslip and contract — they have their own dedicated views
      const docs = await db
        .select({
          id: employeeDocuments.id,
          documentType: employeeDocuments.documentType,
          documentName: employeeDocuments.documentName,
          fileUrl: employeeDocuments.fileUrl,
          mimeType: employeeDocuments.mimeType,
          fileSize: employeeDocuments.fileSize,
          notes: employeeDocuments.notes,
          uploadedAt: employeeDocuments.uploadedAt,
        })
        .from(employeeDocuments)
        .where(
          and(
            eq(employeeDocuments.employeeId, workerUser.employeeId),
            notInArray(employeeDocuments.documentType, ["payslip", "contract"])
          )
        )
        .orderBy(desc(employeeDocuments.uploadedAt));

      return { workerType: "employee" as const, documents: docs };
    } else if (workerUser.workerType === "contractor" && workerUser.contractorId) {
      const docs = await db
        .select({
          id: contractorDocuments.id,
          documentType: contractorDocuments.documentType,
          documentName: contractorDocuments.documentName,
          fileUrl: contractorDocuments.fileUrl,
          mimeType: contractorDocuments.mimeType,
          fileSize: contractorDocuments.fileSize,
          notes: contractorDocuments.notes,
          uploadedAt: contractorDocuments.uploadedAt,
        })
        .from(contractorDocuments)
        .where(eq(contractorDocuments.contractorId, workerUser.contractorId))
        .orderBy(desc(contractorDocuments.uploadedAt));

      return { workerType: "contractor" as const, documents: docs };
    }

    return { workerType: workerUser.workerType, documents: [] };
  }),

  /**
   * List my contracts — merges employee_documents (documentType=contract) + employee_contracts
   */
  listContracts: protectedWorkerProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { workerUser } = ctx;

    if (workerUser.workerType === "employee" && workerUser.employeeId) {
      // Source 1 (primary): employee_documents with documentType = "contract"
      const contractDocs = await db
        .select({
          id: employeeDocuments.id,
          documentName: employeeDocuments.documentName,
          fileUrl: employeeDocuments.fileUrl,
          mimeType: employeeDocuments.mimeType,
          notes: employeeDocuments.notes,
          uploadedAt: employeeDocuments.uploadedAt,
        })
        .from(employeeDocuments)
        .where(
          and(
            eq(employeeDocuments.employeeId, workerUser.employeeId),
            eq(employeeDocuments.documentType, "contract")
          )
        )
        .orderBy(desc(employeeDocuments.uploadedAt));

      // Source 2 (secondary): employee_contracts table (structured contracts)
      const structuredContracts = await db
        .select({
          id: employeeContracts.id,
          contractType: employeeContracts.contractType,
          fileUrl: employeeContracts.fileUrl,
          signedDate: employeeContracts.signedDate,
          effectiveDate: employeeContracts.effectiveDate,
          expiryDate: employeeContracts.expiryDate,
          status: employeeContracts.status,
          createdAt: employeeContracts.createdAt,
        })
        .from(employeeContracts)
        .where(eq(employeeContracts.employeeId, workerUser.employeeId))
        .orderBy(desc(employeeContracts.createdAt));

      // Merge into unified format
      const contracts: any[] = [];

      for (const doc of contractDocs) {
        contracts.push({
          id: doc.id,
          source: "document" as const,
          contractType: doc.documentName || "Contract",
          fileUrl: doc.fileUrl,
          signedDate: null,
          effectiveDate: null,
          expiryDate: null,
          status: null,
          notes: doc.notes,
          createdAt: doc.uploadedAt,
        });
      }

      for (const c of structuredContracts) {
        contracts.push({
          id: c.id,
          source: "contract" as const,
          contractType: c.contractType || "Employment Contract",
          fileUrl: c.fileUrl,
          signedDate: c.signedDate,
          effectiveDate: c.effectiveDate,
          expiryDate: c.expiryDate,
          status: c.status,
          notes: null,
          createdAt: c.createdAt,
        });
      }

      // Sort by date descending
      contracts.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      return { workerType: "employee" as const, contracts };
    } else if (workerUser.workerType === "contractor" && workerUser.contractorId) {
      const contracts = await db
        .select({
          id: contractorContracts.id,
          contractType: contractorContracts.contractType,
          fileUrl: contractorContracts.fileUrl,
          signedDate: contractorContracts.signedDate,
          effectiveDate: contractorContracts.effectiveDate,
          expiryDate: contractorContracts.expiryDate,
          status: contractorContracts.status,
          createdAt: contractorContracts.createdAt,
        })
        .from(contractorContracts)
        .where(eq(contractorContracts.contractorId, workerUser.contractorId))
        .orderBy(desc(contractorContracts.createdAt));

      // Map to unified format
      return {
        workerType: "contractor" as const,
        contracts: contracts.map(c => ({
          ...c,
          source: "contract" as const,
          notes: null,
        })),
      };
    }

    return { workerType: workerUser.workerType, contracts: [] };
  }),
});
