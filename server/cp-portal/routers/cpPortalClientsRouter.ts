/**
 * CP Portal Clients Router
 *
 * Manages End Clients from the Channel Partner's perspective.
 * All queries are SCOPED to ctx.cpUser.channelPartnerId — CP can only see their own clients.
 *
 * Capabilities:
 * - List clients under this CP (with search, pagination)
 * - View client detail (company info, contacts, employees count)
 * - View employees under a specific client
 *
 * NOTE: Client creation/editing is done by EG Admin (via admin router).
 * CP Portal has read-only access to clients assigned to them.
 * Future: CP may be able to submit onboarding requests for new clients.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, like, sql, count, desc, SQL } from "drizzle-orm";
import {
  protectedCpProcedure,
  cpHrProcedure,
  cpPortalRouter,
} from "../cpPortalTrpc";
import { getDb } from "../../db";
import {
  customers,
  employees,
  customerContacts,
} from "../../../drizzle/schema";

export const cpPortalClientsRouter = cpPortalRouter({
  /**
   * List all clients assigned to this CP
   */
  list: protectedCpProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;
      const offset = (input.page - 1) * input.pageSize;

      // Build conditions — always scoped to this CP
      const conditions: SQL[] = [eq(customers.channelPartnerId, cpId)];

      if (input.search) {
        conditions.push(like(customers.companyName, `%${input.search}%`));
      }
      if (input.status) {
        conditions.push(sql`${customers.status} = ${input.status}`);
      }

      const whereClause = and(...conditions);

      const [items, totalResult] = await Promise.all([
        db
          .select({
            id: customers.id,
            companyName: customers.companyName,
            legalEntityName: customers.legalEntityName,
            country: customers.country,
            status: customers.status,
            industry: customers.industry,
            primaryContactEmail: customers.primaryContactEmail,
            primaryContactName: customers.primaryContactName,
            paymentTermDays: customers.paymentTermDays,
            settlementCurrency: customers.settlementCurrency,
            createdAt: customers.createdAt,
          })
          .from(customers)
          .where(whereClause)
          .orderBy(desc(customers.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(customers)
          .where(whereClause),
      ]);

      return {
        items,
        total: totalResult[0]?.total ?? 0,
      };
    }),

  /**
   * Get client detail — includes employee count
   */
  get: protectedCpProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const cpId = ctx.cpUser.channelPartnerId;

      // Fetch customer — must belong to this CP
      const customerRows = await db
        .select({
          id: customers.id,
          companyName: customers.companyName,
          legalEntityName: customers.legalEntityName,
          registrationNumber: customers.registrationNumber,
          industry: customers.industry,
          address: customers.address,
          city: customers.city,
          state: customers.state,
          country: customers.country,
          postalCode: customers.postalCode,
          primaryContactEmail: customers.primaryContactEmail,
          primaryContactName: customers.primaryContactName,
          primaryContactPhone: customers.primaryContactPhone,
          paymentTermDays: customers.paymentTermDays,
          settlementCurrency: customers.settlementCurrency,
          status: customers.status,
          language: customers.language,
          createdAt: customers.createdAt,
        })
        .from(customers)
        .where(
          and(
            eq(customers.id, input.id),
            eq(customers.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (customerRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      }

      // Get employee count for this client
      const empCountResult = await db
        .select({ total: count() })
        .from(employees)
        .where(
          and(
            eq(employees.customerId, input.id),
            eq(employees.channelPartnerId, cpId)
          )
        );

      return {
        ...customerRows[0],
        employeeCount: empCountResult[0]?.total ?? 0,
      };
    }),

  /**
   * List contacts for a specific client (read-only from CP perspective)
   */
  listContacts: protectedCpProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return [];

      const cpId = ctx.cpUser.channelPartnerId;

      // First verify the customer belongs to this CP
      const customerCheck = await db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.id, input.customerId),
            eq(customers.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (customerCheck.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      }

      return db
        .select({
          id: customerContacts.id,
          contactName: customerContacts.contactName,
          email: customerContacts.email,
          phone: customerContacts.phone,
          role: customerContacts.role,
          isPrimary: customerContacts.isPrimary,
        })
        .from(customerContacts)
        .where(eq(customerContacts.customerId, input.customerId));
    }),

  /**
   * List employees for a specific client
   * CP can see employee roster but NOT salary details
   */
  listEmployees: cpHrProcedure
    .input(
      z.object({
        customerId: z.number(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { items: [], total: 0 };

      const cpId = ctx.cpUser.channelPartnerId;
      const offset = (input.page - 1) * input.pageSize;

      // Verify client belongs to this CP
      const customerCheck = await db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.id, input.customerId),
            eq(customers.channelPartnerId, cpId)
          )
        )
        .limit(1);

      if (customerCheck.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      }

      // Build conditions
      const conditions: SQL[] = [
        eq(employees.customerId, input.customerId),
        eq(employees.channelPartnerId, cpId),
      ];

      if (input.search) {
        conditions.push(
          sql`(${employees.firstName} LIKE ${'%' + input.search + '%'} OR ${employees.lastName} LIKE ${'%' + input.search + '%'} OR ${employees.email} LIKE ${'%' + input.search + '%'})`
        );
      }
      if (input.status) {
        conditions.push(sql`${employees.status} = ${input.status}`);
      }

      const whereClause = and(...conditions);

      // CP sees employee roster but NOT salary/compensation details
      const [items, totalResult] = await Promise.all([
        db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            email: employees.email,
            jobTitle: employees.jobTitle,
            department: employees.department,
            country: employees.country,
            status: employees.status,
            startDate: employees.startDate,
            endDate: employees.endDate,
            employmentType: employees.employmentType,
            createdAt: employees.createdAt,
            // NOTE: salary, compensation, bank details are NOT exposed to CP
          })
          .from(employees)
          .where(whereClause)
          .orderBy(desc(employees.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(employees)
          .where(whereClause),
      ]);

      return {
        items,
        total: totalResult[0]?.total ?? 0,
      };
    }),

  /**
   * Dashboard summary — aggregate stats for CP's client portfolio
   */
  summary: protectedCpProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return { totalClients: 0, activeClients: 0, totalEmployees: 0, activeEmployees: 0 };

    const cpId = ctx.cpUser.channelPartnerId;

    const [clientStats, empStats] = await Promise.all([
      db
        .select({
          total: count(),
          active: sql<number>`SUM(CASE WHEN ${customers.status} = 'active' THEN 1 ELSE 0 END)`,
        })
        .from(customers)
        .where(eq(customers.channelPartnerId, cpId)),
      db
        .select({
          total: count(),
          active: sql<number>`SUM(CASE WHEN ${employees.status} = 'active' THEN 1 ELSE 0 END)`,
        })
        .from(employees)
        .where(eq(employees.channelPartnerId, cpId)),
    ]);

    return {
      totalClients: clientStats[0]?.total ?? 0,
      activeClients: Number(clientStats[0]?.active ?? 0),
      totalEmployees: empStats[0]?.total ?? 0,
      activeEmployees: Number(empStats[0]?.active ?? 0),
    };
  }),
});
