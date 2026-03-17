/**
 * Channel Partner DB Service
 *
 * CRUD helpers for channel_partners, channel_partner_contacts,
 * cp_pricing_rules, cp_client_pricing, and channel_partner_contracts.
 *
 * Follows the same patterns as customerService.ts.
 */

import { eq, like, count, desc, and, or, isNull } from "drizzle-orm";
import {
  channelPartners, InsertChannelPartner,
  channelPartnerContacts, InsertChannelPartnerContact,
  cpPricingRules, InsertCpPricingRule,
  cpClientPricing, InsertCpClientPricing,
  channelPartnerContracts, InsertChannelPartnerContract,
} from "../../../drizzle/schema";
import { getDb } from "./connection";

// ============================================================================
// CHANNEL PARTNERS
// ============================================================================

export async function createChannelPartner(data: InsertChannelPartner) {
  const db = getDb();
  if (!db) return [];
  return await db.insert(channelPartners).values(data).returning();
}

export async function getChannelPartnerById(id: number) {
  const db = getDb();
  if (!db) return undefined;
  const result = await db.select().from(channelPartners).where(eq(channelPartners.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getChannelPartnerBySubdomain(subdomain: string) {
  const db = getDb();
  if (!db) return undefined;
  const result = await db.select().from(channelPartners)
    .where(eq(channelPartners.subdomain, subdomain))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getInternalChannelPartner() {
  const db = getDb();
  if (!db) return undefined;
  const result = await db.select().from(channelPartners)
    .where(eq(channelPartners.isInternal, true))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export interface ListChannelPartnersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  includeInternal?: boolean;
}

export async function listChannelPartners(params: ListChannelPartnersParams = {}) {
  const { page = 1, pageSize = 50, search, status, includeInternal = false } = params;
  const db = getDb();
  if (!db) return { data: [], total: 0 };
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(channelPartners.companyName, `%${search}%`),
        like(channelPartners.partnerCode, `%${search}%`)
      )
    );
  }
  if (status) conditions.push(eq(channelPartners.status, status as any));
  if (!includeInternal) conditions.push(eq(channelPartners.isInternal, false));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, totalResult] = await Promise.all([
    db.select().from(channelPartners).where(where).limit(pageSize).offset(offset).orderBy(desc(channelPartners.createdAt)),
    db.select({ count: count() }).from(channelPartners).where(where),
  ]);

  return { data, total: totalResult[0]?.count || 0 };
}

export async function updateChannelPartner(id: number, data: Partial<InsertChannelPartner>) {
  const db = getDb();
  if (!db) return;
  await db.update(channelPartners).set(data).where(eq(channelPartners.id, id));
}

/**
 * Generate the next partner code: CP-0001, CP-0002, etc.
 */
export async function generatePartnerCode(): Promise<string> {
  const db = getDb();
  if (!db) return "CP-0001";
  const result = await db.select({ count: count() }).from(channelPartners);
  const nextNum = (result[0]?.count || 0) + 1;
  return `CP-${String(nextNum).padStart(4, "0")}`;
}

// ============================================================================
// CHANNEL PARTNER CONTACTS
// ============================================================================

export async function listChannelPartnerContacts(channelPartnerId: number) {
  const db = getDb();
  if (!db) return [];
  return await db.select().from(channelPartnerContacts)
    .where(eq(channelPartnerContacts.channelPartnerId, channelPartnerId))
    .orderBy(desc(channelPartnerContacts.createdAt));
}

export async function getChannelPartnerContactById(id: number) {
  const db = getDb();
  if (!db) return undefined;
  const result = await db.select().from(channelPartnerContacts)
    .where(eq(channelPartnerContacts.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getChannelPartnerContactByEmail(email: string) {
  const db = getDb();
  if (!db) return undefined;
  const result = await db.select().from(channelPartnerContacts)
    .where(eq(channelPartnerContacts.email, email.toLowerCase().trim())).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createChannelPartnerContact(data: InsertChannelPartnerContact) {
  const db = getDb();
  if (!db) return [];
  return await db.insert(channelPartnerContacts).values(data).returning();
}

export async function updateChannelPartnerContact(id: number, data: Partial<InsertChannelPartnerContact>) {
  const db = getDb();
  if (!db) return;
  await db.update(channelPartnerContacts).set(data).where(eq(channelPartnerContacts.id, id));
}

export async function deleteChannelPartnerContact(id: number) {
  const db = getDb();
  if (!db) return;
  await db.delete(channelPartnerContacts).where(eq(channelPartnerContacts.id, id));
}

// ============================================================================
// CP PRICING RULES (EG → CP)
// ============================================================================

export async function listCpPricingRules(channelPartnerId: number) {
  const db = getDb();
  if (!db) return [];
  return await db.select().from(cpPricingRules)
    .where(eq(cpPricingRules.channelPartnerId, channelPartnerId))
    .orderBy(desc(cpPricingRules.createdAt));
}

export async function getCpPricingRuleById(id: number) {
  const db = getDb();
  if (!db) return undefined;
  const result = await db.select().from(cpPricingRules)
    .where(eq(cpPricingRules.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCpPricingRule(data: InsertCpPricingRule) {
  const db = getDb();
  if (!db) return [];
  return await db.insert(cpPricingRules).values(data).returning();
}

export async function updateCpPricingRule(id: number, data: Partial<InsertCpPricingRule>) {
  const db = getDb();
  if (!db) return;
  await db.update(cpPricingRules).set(data).where(eq(cpPricingRules.id, id));
}

export async function deleteCpPricingRule(id: number) {
  const db = getDb();
  if (!db) return;
  await db.delete(cpPricingRules).where(eq(cpPricingRules.id, id));
}

// ============================================================================
// CP CLIENT PRICING (CP → End Client)
// ============================================================================

export async function listCpClientPricing(channelPartnerId: number, customerId?: number) {
  const db = getDb();
  if (!db) return [];
  const conditions = [eq(cpClientPricing.channelPartnerId, channelPartnerId)];
  if (customerId) conditions.push(eq(cpClientPricing.customerId, customerId));
  return await db.select().from(cpClientPricing)
    .where(and(...conditions))
    .orderBy(desc(cpClientPricing.createdAt));
}

export async function getCpClientPricingById(id: number) {
  const db = getDb();
  if (!db) return undefined;
  const result = await db.select().from(cpClientPricing)
    .where(eq(cpClientPricing.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCpClientPricing(data: InsertCpClientPricing) {
  const db = getDb();
  if (!db) return [];
  return await db.insert(cpClientPricing).values(data).returning();
}

export async function updateCpClientPricing(id: number, data: Partial<InsertCpClientPricing>) {
  const db = getDb();
  if (!db) return;
  await db.update(cpClientPricing).set(data).where(eq(cpClientPricing.id, id));
}

export async function deleteCpClientPricing(id: number) {
  const db = getDb();
  if (!db) return;
  await db.delete(cpClientPricing).where(eq(cpClientPricing.id, id));
}

// ============================================================================
// CHANNEL PARTNER CONTRACTS
// ============================================================================

export async function listChannelPartnerContracts(channelPartnerId: number) {
  const db = getDb();
  if (!db) return [];
  return await db.select().from(channelPartnerContracts)
    .where(eq(channelPartnerContracts.channelPartnerId, channelPartnerId))
    .orderBy(desc(channelPartnerContracts.createdAt));
}

export async function createChannelPartnerContract(data: InsertChannelPartnerContract) {
  const db = getDb();
  if (!db) return [];
  return await db.insert(channelPartnerContracts).values(data).returning();
}

export async function updateChannelPartnerContract(id: number, data: Partial<InsertChannelPartnerContract>) {
  const db = getDb();
  if (!db) return;
  await db.update(channelPartnerContracts).set(data).where(eq(channelPartnerContracts.id, id));
}

export async function deleteChannelPartnerContract(id: number) {
  const db = getDb();
  if (!db) return;
  await db.delete(channelPartnerContracts).where(eq(channelPartnerContracts.id, id));
}
