/**
 * Unified Seed Migration
 *
 * This is the SINGLE source of truth for all data initialization.
 * It runs automatically on every server startup via server/_core/index.ts.
 *
 * Seeds the following data (all idempotent - safe to run multiple times):
 *   1. System data: Countries, Leave Types, Public Holidays
 *   2. Social Insurance Rules (required for Employer Cost calculation)
 *   3. AI Provider Configurations
 *   4. Country Guide chapters
 *   5. Business migration data (customers, employees, invoices) — only in non-production
 */

import 'dotenv/config';
import { getDb } from './db';
import {
  customers, employees, customerContacts,
  billingEntities, countriesConfig, leaveTypes, publicHolidays,
  countryGuideChapters, countrySocialInsuranceItems, aiProviderConfigs
} from '../drizzle/schema';
import { eq, and, not, inArray } from 'drizzle-orm';
import { socialInsuranceRules } from './seed/data/socialInsuranceRules';
// @ts-ignore
import seedData from '../data/seed-migration-data.json';
import { readFile } from 'fs/promises';
import { join } from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SeedCustomer {
  clientCode: string;
  companyName: string;
  legalEntityName?: string | null;
  registrationNumber?: string | null;
  industry?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country: string;
  postalCode?: string | null;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  paymentTermDays?: number;
  settlementCurrency: string;
  language?: string;
  depositMultiplier?: number;
  status: string;
  notes?: string | null;
  _oldCompanyId?: number;
}

interface SeedEmployee {
  employeeCode: string;
  customerIndex: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  idNumber?: string | null;
  idType?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country: string;
  postalCode?: string | null;
  department?: string | null;
  jobTitle: string;
  serviceType?: string;
  employmentType?: string;
  startDate: string;
  endDate?: string | null;
  baseSalary: number;
  salaryCurrency: string;
  estimatedEmployerCost?: number | string;
  requiresVisa?: boolean;
  visaStatus?: string | null;
  status: string;
  notes?: string | null;
  _oldEmployeeId?: number;
  _oldCompanyId?: number;
}

interface SeedData {
  customers: SeedCustomer[];
  employees: SeedEmployee[];
  deposit_invoices: any[];
  inactive_deposits: any[];
  deposit_refunds: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function readJsonFile(relativePath: string) {
  // In production Docker, seed data is at /app/seed-data (not affected by volume mount).
  // In development, seed data is at ./data (relative to project root).
  const candidates = [
    join(process.cwd(), 'seed-data', relativePath),  // Docker production path
    join(process.cwd(), 'data', relativePath),        // Development / fallback path
  ];
  for (const path of candidates) {
    try {
      const content = await readFile(path, 'utf-8');
      return JSON.parse(content);
    } catch {
      // Try next candidate
    }
  }
  console.warn(`[Seed] Could not read ${relativePath} from any known path. Skipping.`);
  return null;
}

function parseDates(obj: any, dateFields: string[]) {
  const newObj = { ...obj };
  for (const field of dateFields) {
    if (newObj[field]) {
      newObj[field] = new Date(newObj[field]);
    }
  }
  return newObj;
}

// ─── 1. System Data: Countries, Leave Types, Holidays ────────────────────────

async function seedSystemData(db: any) {
  console.log('[Seed] Checking system data (Countries, Leave Types, Holidays)...');

  // 1a. Countries
  const countries = await readJsonFile('data-exports/baseline/countries_config.json');
  if (countries) {
    let count = 0;
    for (const country of countries) {
      const { id, ...data } = country;
      const formatted = parseDates(data, ['createdAt', 'updatedAt']);

      await db.insert(countriesConfig)
        .values(formatted)
        .onConflictDoUpdate({
          target: countriesConfig.countryCode,
          set: {
            countryName: formatted.countryName,
            localCurrency: formatted.localCurrency,
            payrollCycle: formatted.payrollCycle,
            standardEorRate: formatted.standardEorRate,
            isActive: formatted.isActive,
            updatedAt: new Date(),
          },
        });
      count++;
    }
    console.log(`[Seed] Processed ${count} countries`);

    // Clean up any test/orphan countries not in baseline data
    const validCodes = new Set(countries.map((c: any) => c.countryCode || c.code));
    const allDbCountries = await db.select({ countryCode: countriesConfig.countryCode }).from(countriesConfig);
    const orphanCodes = allDbCountries
      .map((r: any) => r.countryCode)
      .filter((code: string) => !validCodes.has(code));
    if (orphanCodes.length > 0) {
      for (const code of orphanCodes) {
        await db.delete(countriesConfig).where(eq(countriesConfig.countryCode, code));
        console.log(`[Seed] Removed orphan/test country: ${code}`);
      }
      console.log(`[Seed] Cleaned up ${orphanCodes.length} orphan/test countries`);
    }
  }

  // 1b. Leave Types
  const ltData = await readJsonFile('data-exports/baseline/leave_types.json');
  if (ltData) {
    let count = 0;
    for (const lt of ltData) {
      const { id, ...data } = lt;
      const formatted = parseDates(data, ['createdAt', 'updatedAt']);

      const existing = await db.query.leaveTypes.findFirst({
        where: and(
          eq(leaveTypes.countryCode, formatted.countryCode),
          eq(leaveTypes.leaveTypeName, formatted.leaveTypeName)
        ),
      });

      if (!existing) {
        await db.insert(leaveTypes).values(formatted);
        count++;
      }
    }
    console.log(`[Seed] Added ${count} new leave types`);
  }

  // 1c. Public Holidays
  const holidays = await readJsonFile('data-exports/baseline/public_holidays.json');
  if (holidays) {
    let count = 0;
    for (const h of holidays) {
      const { id, ...data } = h;
      const formatted = parseDates(data, ['createdAt', 'updatedAt']);

      const existing = await db.query.publicHolidays.findFirst({
        where: and(
          eq(publicHolidays.countryCode, formatted.countryCode),
          eq(publicHolidays.year, formatted.year),
          eq(publicHolidays.holidayDate, formatted.holidayDate),
          eq(publicHolidays.holidayName, formatted.holidayName)
        ),
      });

      if (!existing) {
        await db.insert(publicHolidays).values(formatted);
        count++;
      }
    }
    console.log(`[Seed] Added ${count} new holidays`);
  }
}

// ─── 2. Social Insurance Rules (Critical for Employer Cost) ──────────────────

async function seedSocialInsuranceData(db: any) {
  console.log('[Seed] Checking social insurance rules...');

  let count = 0;
  for (const rule of socialInsuranceRules) {
    const existing = await db.select()
      .from(countrySocialInsuranceItems)
      .where(
        and(
          eq(countrySocialInsuranceItems.countryCode, rule.countryCode),
          eq(countrySocialInsuranceItems.itemKey, rule.itemKey),
          eq(countrySocialInsuranceItems.effectiveYear, rule.effectiveYear)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(countrySocialInsuranceItems).values(rule);
      count++;
    }
  }
  console.log(`[Seed] Added ${count} new social insurance rules (total defined: ${socialInsuranceRules.length})`);
}

// ─── 3. AI Provider Configurations ──────────────────────────────────────────

async function seedAIProviderConfigs(db: any) {
  console.log('[Seed] Checking AI provider configurations...');

  const providers = [
    {
      provider: "volcengine",
      displayName: "Volcengine Doubao",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      model: "doubao-seed-1-6-251015",
      apiKeyEnv: "ARK_API_KEY",
      isEnabled: true,
      priority: 1
    },
    {
      provider: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      apiKeyEnv: "OPENAI_API_KEY",
      isEnabled: true,
      priority: 10
    }
  ];

  for (const p of providers) {
    await db.insert(aiProviderConfigs)
      .values(p as any)
      .onConflictDoUpdate({
        target: aiProviderConfigs.provider,
        set: {
          displayName: p.displayName,
          baseUrl: p.baseUrl,
          model: p.model,
          apiKeyEnv: p.apiKeyEnv,
          isEnabled: p.isEnabled,
          priority: p.priority,
          updatedAt: new Date()
        }
      });
  }
  console.log(`[Seed] Processed ${providers.length} AI providers`);
}

// ─── 4. Country Guide Chapters ──────────────────────────────────────────────

async function seedCountryGuides(db: any) {
  const guideData = await readJsonFile('country_guide_data.json');
  if (!guideData || !Array.isArray(guideData) || guideData.length === 0) {
    console.log('[Seed] No country guide data found, skipping.');
    return;
  }

  console.log(`[Seed] Checking ${guideData.length} country guide chapters...`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const ch of guideData) {
    if (!ch.countryCode || !ch.chapterKey || !ch.contentEn) {
      skipped++;
      continue;
    }

    try {
      const existing = await db.query.countryGuideChapters.findFirst({
        where: and(
          eq(countryGuideChapters.countryCode, ch.countryCode),
          eq(countryGuideChapters.chapterKey, ch.chapterKey)
        ),
      });

      if (existing) {
        const contentChanged = existing.contentEn !== ch.contentEn || existing.contentZh !== ch.contentZh;
        const versionNewer = ch.version && ch.version > (existing.version || '');

        if (contentChanged || versionNewer) {
          await db.update(countryGuideChapters)
            .set({
              part: ch.part,
              titleEn: ch.titleEn,
              titleZh: ch.titleZh,
              contentEn: ch.contentEn,
              contentZh: ch.contentZh,
              sortOrder: ch.sortOrder,
              version: ch.version || '2026-Q1',
              status: ch.status || 'published',
              updatedAt: new Date(),
            })
            .where(eq(countryGuideChapters.id, existing.id));
          updated++;
        } else {
          skipped++;
        }
      } else {
        await db.insert(countryGuideChapters).values({
          countryCode: ch.countryCode,
          part: ch.part,
          chapterKey: ch.chapterKey,
          titleEn: ch.titleEn,
          titleZh: ch.titleZh,
          contentEn: ch.contentEn,
          contentZh: ch.contentZh,
          sortOrder: ch.sortOrder,
          version: ch.version || '2026-Q1',
          status: ch.status || 'published',
        });
        created++;
      }
    } catch (err: any) {
      console.warn(`[Seed] Failed to seed ${ch.countryCode}/${ch.chapterKey}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`[Seed] Country guides: ${created} created, ${updated} updated, ${skipped} skipped.`);
}

// ─── 5. Business Migration Data (non-production only) ────────────────────────

async function seedBusinessMigrationData(db: any) {
  const data = seedData as unknown as SeedData;

  console.log(`[Seed] Checking migration data:
  - ${data.customers.length} customers
  - ${data.employees.length} employees
  - Invoices: SKIPPED (manual entry only)
  `);

  const defaultBillingEntity = await db.query.billingEntities.findFirst();
  const billingEntityId = defaultBillingEntity?.id || null;

  const customerMap = new Map<number, number>();

  // ── Customers (upsert by clientCode) ──
  console.log('[Seed] Syncing Customers...');
  for (let i = 0; i < data.customers.length; i++) {
    const c = data.customers[i];
    const index = i + 1;

    const existing = await db.select({ id: customers.id }).from(customers).where(eq(customers.clientCode, c.clientCode)).limit(1);

    let customerId: number;

    if (existing.length > 0) {
      customerId = existing[0].id;
      // Update to fill in any missing fields
      await db.update(customers).set({
        companyName: c.companyName,
        legalEntityName: c.legalEntityName || undefined,
        address: c.address || undefined,
        city: c.city || undefined,
        state: c.state || undefined,
        country: c.country,
        postalCode: c.postalCode || undefined,
        primaryContactEmail: c.primaryContactEmail || undefined,
        primaryContactPhone: c.primaryContactPhone || undefined,
        settlementCurrency: c.settlementCurrency,
        paymentTermDays: c.paymentTermDays || 30,
        language: (c.language || 'en') as "en" | "zh",
        depositMultiplier: c.depositMultiplier || 2,
        billingEntityId: billingEntityId,
        notes: c.notes || undefined,
        updatedAt: new Date(),
      }).where(eq(customers.id, customerId));
    } else {
      const result = await db.insert(customers).values({
        clientCode: c.clientCode,
        companyName: c.companyName,
        legalEntityName: c.legalEntityName || undefined,
        registrationNumber: c.registrationNumber || undefined,
        industry: c.industry || undefined,
        address: c.address || undefined,
        city: c.city || undefined,
        state: c.state || undefined,
        country: c.country,
        postalCode: c.postalCode || undefined,
        primaryContactName: c.primaryContactName || undefined,
        primaryContactEmail: c.primaryContactEmail || undefined,
        primaryContactPhone: c.primaryContactPhone || undefined,
        paymentTermDays: c.paymentTermDays || 30,
        settlementCurrency: c.settlementCurrency,
        language: (c.language || 'en') as "en" | "zh",
        depositMultiplier: c.depositMultiplier || 2,
        billingEntityId: billingEntityId,
        status: 'active',
        notes: c.notes || undefined,
      }).returning({ id: customers.id });

      customerId = result[0].id;
      console.log(`[Seed] Customer ${c.clientCode} created`);
    }
    customerMap.set(index, customerId);
  }

  // ── Customer Contacts (split comma-separated emails, skip duplicates) ──
  console.log('[Seed] Syncing Customer Contacts...');
  let contactsCreated = 0;
  let contactsSkipped = 0;
  for (let i = 0; i < data.customers.length; i++) {
    const c = data.customers[i];
    const index = i + 1;
    const customerId = customerMap.get(index);
    if (!customerId || !c.primaryContactEmail) continue;

    const emails = c.primaryContactEmail.split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0);
    for (let j = 0; j < emails.length; j++) {
      const email = emails[j];
      const existingContact = await db.select({ id: customerContacts.id }).from(customerContacts).where(eq(customerContacts.email, email)).limit(1);
      if (existingContact.length > 0) {
        contactsSkipped++;
        continue;
      }
      const emailPrefix = email.split('@')[0];
      const contactName = emailPrefix.replace(/[._-]/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase());
      await db.insert(customerContacts).values({
        customerId,
        contactName,
        email,
        phone: j === 0 ? (c.primaryContactPhone || undefined) : undefined,
        role: j === 0 ? 'Primary Contact' : undefined,
        isPrimary: j === 0,
        hasPortalAccess: false,
      });
      contactsCreated++;
    }
  }
  console.log(`[Seed] Contacts: ${contactsCreated} created, ${contactsSkipped} skipped (already exist)`);

  // ── Employees (upsert by employeeCode) ──
  console.log('[Seed] Syncing Employees...');
  for (let i = 0; i < data.employees.length; i++) {
    const e = data.employees[i];

    const dbCustomerId = customerMap.get(e.customerIndex);
    if (!dbCustomerId) continue;

    let dbStatus: "active" | "terminated" | "pending_review" = "active";
    if (e.status === 'inactive') dbStatus = 'terminated';
    else if (e.status === 'active') dbStatus = 'active';

    const gender = e.gender?.toLowerCase() === 'male' ? 'male'
      : e.gender?.toLowerCase() === 'female' ? 'female'
      : e.gender?.toLowerCase() === 'other' ? 'other'
      : undefined;

    const existing = await db.select({ id: employees.id }).from(employees).where(eq(employees.employeeCode, e.employeeCode)).limit(1);

    if (existing.length > 0) {
      const employeeId = existing[0].id;
      // Update to fill in any missing fields
      await db.update(employees).set({
        customerId: dbCustomerId,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        phone: e.phone || undefined,
        dateOfBirth: e.dateOfBirth || undefined,
        gender: gender as any,
        nationality: e.nationality || undefined,
        idNumber: e.idNumber || undefined,
        idType: e.idType || undefined,
        address: e.address || undefined,
        city: e.city || undefined,
        state: e.state || undefined,
        country: e.country,
        postalCode: e.postalCode || undefined,
        department: e.department || undefined,
        jobTitle: e.jobTitle,
        serviceType: (e.serviceType || 'eor') as "eor" | "visa_eor",
        employmentType: (e.employmentType || 'long_term') as "fixed_term" | "long_term",
        startDate: e.startDate,
        endDate: e.endDate || undefined,
        status: dbStatus,
        baseSalary: String(e.baseSalary),
        salaryCurrency: e.salaryCurrency,
        estimatedEmployerCost: String(e.estimatedEmployerCost || '0'),
        requiresVisa: e.requiresVisa || false,
        visaStatus: (e.visaStatus || 'not_required') as any,
        updatedAt: new Date(),
      }).where(eq(employees.id, employeeId));
    } else {
      await db.insert(employees).values({
        employeeCode: e.employeeCode,
        customerId: dbCustomerId,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        phone: e.phone || undefined,
        dateOfBirth: e.dateOfBirth || undefined,
        gender: gender as any,
        nationality: e.nationality || undefined,
        idNumber: e.idNumber || undefined,
        idType: e.idType || undefined,
        address: e.address || undefined,
        city: e.city || undefined,
        state: e.state || undefined,
        country: e.country,
        postalCode: e.postalCode || undefined,
        department: e.department || undefined,
        jobTitle: e.jobTitle,
        serviceType: (e.serviceType || 'eor') as "eor" | "visa_eor",
        employmentType: (e.employmentType || 'long_term') as "fixed_term" | "long_term",
        startDate: e.startDate,
        endDate: e.endDate || undefined,
        status: dbStatus,
        baseSalary: String(e.baseSalary),
        salaryCurrency: e.salaryCurrency,
        estimatedEmployerCost: String(e.estimatedEmployerCost || '0'),
        requiresVisa: e.requiresVisa || false,
        visaStatus: (e.visaStatus || 'not_required') as any,
      });
      console.log(`[Seed] Employee ${e.employeeCode} created`);
    }
  }

  // NOTE: Invoices are NOT seeded here. They will be entered manually in the system.
  console.log('[Seed] Business migration data completed (invoices skipped — manual entry).');
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function seedMigration() {
  const db = await getDb();
  if (!db) {
    console.warn('[Seed] Database connection failed, skipping migration seed');
    return;
  }

  // Always seed system reference data (idempotent, safe for all environments)
  await seedSystemData(db);
  await seedSocialInsuranceData(db);
  await seedAIProviderConfigs(db);
  await seedCountryGuides(db);

  // Seed business migration data (customers, employees, contacts)
  // Data already imported to production — no longer needed on startup
  // await seedBusinessMigrationData(db);

  console.log('[Seed] All seed operations completed.');
}
