/**
 * migrate-business-data.ts
 *
 * One-time migration script for business data (Customers + Employees + Contacts).
 * Invoices are NOT handled here — they will be entered manually.
 *
 * This script is idempotent:
 *   - Customers: upsert by clientCode (insert if new, update missing fields if exists)
 *   - Employees: upsert by employeeCode (insert if new, update missing fields if exists)
 *   - Contacts:  insert only if email does not already exist (skip duplicates safely)
 *
 * Usage:
 *   DATABASE_URL=<your-db-url> npm run migrate:business
 *   # or for local dev:
 *   npm run migrate:business
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { join } from 'path';

// ─── DB Connection ───────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is not set.');
  console.error('Usage: DATABASE_URL=file:local.db npm run migrate:business');
  process.exit(1);
}

const url = DATABASE_URL.includes('://')
  ? DATABASE_URL
  : `file:${DATABASE_URL}`;

const client = createClient({ url });
const db = drizzle(client, { schema }) as any;

// ─── Types ───────────────────────────────────────────────────────────────────

interface MigrationCustomer {
  clientCode: string;
  companyName: string;
  legalEntityName: string | null;
  registrationNumber: string | null;
  industry: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postalCode: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  paymentTermDays: number;
  settlementCurrency: string;
  language: string;
  billingEntityId: number | null;
  depositMultiplier: number;
  status: string;
  notes: string | null;
  _oldCompanyId?: number;
}

interface MigrationEmployee {
  employeeCode: string;
  customerIndex: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  idNumber: string | null;
  idType: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postalCode: string | null;
  department: string | null;
  jobTitle: string;
  serviceType: string;
  employmentType: string;
  startDate: string;
  endDate: string | null;
  status: string;
  baseSalary: number;
  salaryCurrency: string;
  estimatedEmployerCost: number | string;
  requiresVisa: boolean;
  visaStatus: string | null;
  notes: string | null;
  _oldEmployeeId?: number;
  _oldCompanyId?: number;
  _companyName?: string;
  _annualLeave?: number;
  _probationLength?: number;
  _additionalCompensation?: string;
}

interface MigrationData {
  _metadata: any;
  customers: MigrationCustomer[];
  employees: MigrationEmployee[];
  deposit_invoices: any[];
  inactive_deposits: any[];
  deposit_refunds: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapEmployeeStatus(jsonStatus: string): "active" | "terminated" | "pending_review" {
  if (jsonStatus === 'inactive') return 'terminated';
  if (jsonStatus === 'active') return 'active';
  return 'pending_review';
}

function mapGender(g: string | null): "male" | "female" | "other" | "prefer_not_to_say" | undefined {
  if (!g) return undefined;
  const lower = g.toLowerCase();
  if (lower === 'male') return 'male';
  if (lower === 'female') return 'female';
  if (lower === 'other') return 'other';
  return undefined;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GEA Business Data Migration                               ║');
  console.log('║  Scope: Customers + Employees + Contacts                   ║');
  console.log('║  Invoices: NOT included (manual entry)                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  // 1. Load migration JSON
  const jsonPath = join(process.cwd(), 'data', 'seed-migration-data.json');
  let data: MigrationData;
  try {
    const content = await readFile(jsonPath, 'utf-8');
    data = JSON.parse(content);
  } catch (err) {
    console.error(`Failed to read migration data from ${jsonPath}:`, err);
    process.exit(1);
  }

  console.log(`📦 Migration data loaded:`);
  console.log(`   Customers:  ${data.customers.length}`);
  console.log(`   Employees:  ${data.employees.length}`);
  console.log(`   (Invoices:  ${data.deposit_invoices.length + data.inactive_deposits.length + data.deposit_refunds.length} — SKIPPED)`);
  console.log();

  // 2. Resolve default billing entity
  const defaultBillingEntity = await db.query.billingEntities.findFirst();
  const billingEntityId = defaultBillingEntity?.id || null;
  if (billingEntityId) {
    console.log(`🏢 Default billing entity: id=${billingEntityId} (${defaultBillingEntity?.entityName})`);
  } else {
    console.log(`⚠️  No billing entity found — billingEntityId will be NULL`);
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: CUSTOMERS
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('━━━ Phase 1: Customers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const customerMap = new Map<number, number>(); // JSON index (1-based) → DB id
  let customersCreated = 0;
  let customersUpdated = 0;
  let customersSkipped = 0;

  for (let i = 0; i < data.customers.length; i++) {
    const c = data.customers[i];
    const index = i + 1; // 1-based index for employee.customerIndex mapping

    // Check if customer already exists
    const existing = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(eq(schema.customers.clientCode, c.clientCode))
      .limit(1);

    let customerId: number;

    if (existing.length > 0) {
      // Customer exists — update to fill in any missing fields
      customerId = existing[0].id;

      await db.update(schema.customers)
        .set({
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
          paymentTermDays: c.paymentTermDays,
          language: c.language as "en" | "zh",
          depositMultiplier: c.depositMultiplier,
          billingEntityId: billingEntityId,
          notes: c.notes || undefined,
          updatedAt: new Date(),
        })
        .where(eq(schema.customers.id, customerId));

      customersUpdated++;
    } else {
      // Customer does not exist — insert with all available fields
      const result = await db.insert(schema.customers).values({
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
        paymentTermDays: c.paymentTermDays,
        settlementCurrency: c.settlementCurrency,
        language: (c.language || 'en') as "en" | "zh",
        billingEntityId: billingEntityId,
        depositMultiplier: c.depositMultiplier,
        status: 'active',
        notes: c.notes || undefined,
      }).returning({ id: schema.customers.id });

      customerId = result[0].id;
      customersCreated++;
    }

    customerMap.set(index, customerId);
  }

  console.log(`✅ Customers: ${customersCreated} created, ${customersUpdated} updated, ${customersSkipped} skipped`);
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: CUSTOMER CONTACTS (split comma-separated emails)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('━━━ Phase 2: Customer Contacts ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let contactsCreated = 0;
  let contactsSkipped = 0;
  const contactWarnings: string[] = [];

  for (let i = 0; i < data.customers.length; i++) {
    const c = data.customers[i];
    const index = i + 1;
    const customerId = customerMap.get(index);
    if (!customerId) continue;

    const rawEmail = c.primaryContactEmail;
    if (!rawEmail) continue;

    const emails = rawEmail.split(',').map(e => e.trim()).filter(e => e.length > 0);

    for (let j = 0; j < emails.length; j++) {
      const email = emails[j];

      // Check if this email already exists in customer_contacts (unique constraint)
      const existingContact = await db
        .select({ id: schema.customerContacts.id, customerId: schema.customerContacts.customerId })
        .from(schema.customerContacts)
        .where(eq(schema.customerContacts.email, email))
        .limit(1);

      if (existingContact.length > 0) {
        // Email already exists — skip to avoid unique constraint violation
        if (existingContact[0].customerId !== customerId) {
          const warning = `⚠️  Email "${email}" already belongs to customerId=${existingContact[0].customerId}, cannot assign to ${c.clientCode} (customerId=${customerId})`;
          contactWarnings.push(warning);
          console.log(`   ${warning}`);
        }
        contactsSkipped++;
        continue;
      }

      // Derive a placeholder contact name from the email prefix
      const emailPrefix = email.split('@')[0];
      const contactName = emailPrefix
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, ch => ch.toUpperCase());

      await db.insert(schema.customerContacts).values({
        customerId: customerId,
        contactName: contactName,
        email: email,
        phone: j === 0 ? (c.primaryContactPhone || undefined) : undefined,
        role: j === 0 ? 'Primary Contact' : undefined,
        isPrimary: j === 0,
        hasPortalAccess: false,
      });

      contactsCreated++;
    }
  }

  console.log(`✅ Contacts: ${contactsCreated} created, ${contactsSkipped} skipped (already exist)`);
  if (contactWarnings.length > 0) {
    console.log(`⚠️  ${contactWarnings.length} cross-customer email conflict(s) — needs manual review`);
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: EMPLOYEES
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('━━━ Phase 3: Employees ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let employeesCreated = 0;
  let employeesUpdated = 0;

  for (let i = 0; i < data.employees.length; i++) {
    const e = data.employees[i];
    const dbCustomerId = customerMap.get(e.customerIndex);
    if (!dbCustomerId) {
      console.log(`   ⚠️  ${e.employeeCode}: customerIndex=${e.customerIndex} not found in customerMap, skipping`);
      continue;
    }

    // Check if employee already exists
    const existing = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(eq(schema.employees.employeeCode, e.employeeCode))
      .limit(1);

    const dbStatus = mapEmployeeStatus(e.status);
    const gender = mapGender(e.gender);

    if (existing.length > 0) {
      // Employee exists — update to fill in missing fields
      const employeeId = existing[0].id;

      await db.update(schema.employees)
        .set({
          customerId: dbCustomerId,
          firstName: e.firstName,
          lastName: e.lastName,
          email: e.email,
          phone: e.phone || undefined,
          dateOfBirth: e.dateOfBirth || undefined,
          gender: gender,
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
        })
        .where(eq(schema.employees.id, employeeId));

      employeesUpdated++;
    } else {
      // Employee does not exist — insert with all available fields
      await db.insert(schema.employees).values({
        employeeCode: e.employeeCode,
        customerId: dbCustomerId,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        phone: e.phone || undefined,
        dateOfBirth: e.dateOfBirth || undefined,
        gender: gender,
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

      employeesCreated++;
    }
  }

  console.log(`✅ Employees: ${employeesCreated} created, ${employeesUpdated} updated`);
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Migration Complete                                        ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Customers:  ${String(customersCreated).padStart(3)} created, ${String(customersUpdated).padStart(3)} updated              ║`);
  console.log(`║  Contacts:   ${String(contactsCreated).padStart(3)} created, ${String(contactsSkipped).padStart(3)} skipped              ║`);
  console.log(`║  Employees:  ${String(employeesCreated).padStart(3)} created, ${String(employeesUpdated).padStart(3)} updated              ║`);
  console.log(`║  Invoices:   SKIPPED (manual entry)                        ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (contactWarnings.length > 0) {
    console.log();
    console.log('⚠️  Contact warnings (need manual review):');
    for (const w of contactWarnings) {
      console.log(`   ${w}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
