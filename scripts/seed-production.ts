
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { socialInsuranceRules } from '../server/seed/data/socialInsuranceRules';

// Initialize DB connection
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is not set.');
  console.error('Usage: DATABASE_URL=file:local.db npm run seed:prod');
  process.exit(1);
}

const url = DATABASE_URL.includes("://") 
  ? DATABASE_URL 
  : `file:${DATABASE_URL}`;

const client = createClient({ url });
const db = drizzle(client, { schema });

// Helper to read JSON data
async function readData(relativePath: string) {
  const fullPath = join(process.cwd(), 'data', relativePath);
  try {
    const content = await readFile(fullPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Warning: Could not read ${relativePath}. Skipping.`);
    return null;
  }
}

// Helper to parse dates
function parseDates(obj: any, dateFields: string[]) {
  const newObj = { ...obj };
  for (const field of dateFields) {
    if (newObj[field]) {
      newObj[field] = new Date(newObj[field]);
    }
  }
  return newObj;
}

async function seedCountries() {
  console.log('🌍 Seeding Countries...');
  const countries = await readData('data-exports/baseline/countries_config.json');
  if (!countries) return;

  let count = 0;
  
  for (const country of countries) {
    const { id, ...data } = country;
    const formatted = parseDates(data, ['createdAt', 'updatedAt']);

    await db.insert(schema.countriesConfig)
      .values(formatted)
      .onConflictDoUpdate({
        target: schema.countriesConfig.countryCode,
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
  console.log(`✅ Processed ${count} countries.`);
}

async function seedLeaveTypes() {
  console.log('🌴 Seeding Leave Types...');
  const leaveTypes = await readData('data-exports/baseline/leave_types.json');
  if (!leaveTypes) return;

  let count = 0;
  
  for (const lt of leaveTypes) {
    const { id, ...data } = lt;
    const formatted = parseDates(data, ['createdAt', 'updatedAt']);

    const existing = await db.query.leaveTypes.findFirst({
      where: and(
        eq(schema.leaveTypes.countryCode, formatted.countryCode),
        eq(schema.leaveTypes.leaveTypeName, formatted.leaveTypeName)
      ),
    });

    if (!existing) {
      await db.insert(schema.leaveTypes).values(formatted);
      count++;
    }
  }
  console.log(`✅ Added ${count} new leave types.`);
}

async function seedHolidays() {
  console.log('🎉 Seeding Holidays...');
  const holidays = await readData('data-exports/baseline/public_holidays.json');
  if (!holidays) return;

  let count = 0;
  
  for (const holiday of holidays) {
    const { id, ...data } = holiday;
    const formatted = parseDates(data, ['createdAt', 'updatedAt']);

    const existing = await db.query.publicHolidays.findFirst({
      where: and(
        eq(schema.publicHolidays.countryCode, formatted.countryCode),
        eq(schema.publicHolidays.year, formatted.year),
        eq(schema.publicHolidays.holidayDate, formatted.holidayDate),
        eq(schema.publicHolidays.holidayName, formatted.holidayName)
      ),
    });

    if (!existing) {
      await db.insert(schema.publicHolidays).values(formatted);
      count++;
    }
  }
  console.log(`✅ Added ${count} new holidays.`);
}

async function seedBusinessData() {
  console.log('💼 Seeding Business Data (Customers, Employees, Invoices)...');
  const seedData = await readData('seed-migration-data.json');
  if (!seedData) {
    console.error('❌ Failed to read seed-migration-data.json');
    return;
  }

  // Maps to link JSON indexes (1-based) to DB IDs
  const customerMap = new Map<number, number>(); // index -> dbId
  const employeeMap = new Map<number, number>(); // index -> dbId

  // 1. Customers
  console.log('  🏢 Seeding Customers...');
  let custCount = 0;
  for (let i = 0; i < seedData.customers.length; i++) {
    const c = seedData.customers[i];
    const index = i + 1;

    // Check existence
    const existing = await db.select({ id: schema.customers.id })
      .from(schema.customers)
      .where(eq(schema.customers.clientCode, c.clientCode))
      .limit(1);
    
    let customerId: number;

    if (existing.length > 0) {
      customerId = existing[0].id;
    } else {
      const result = await db.insert(schema.customers).values({
        clientCode: c.clientCode,
        companyName: c.companyName,
        legalEntityName: c.legalEntityName || c.companyName,
        country: c.country,
        primaryContactEmail: c.primaryContactEmail,
        settlementCurrency: c.settlementCurrency,
        status: 'active',
        paymentTermDays: 30,
        language: 'en',
        depositMultiplier: 2,
        notes: `Imported from migration seed. Old ID: ${c._oldCompanyId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning({ id: schema.customers.id });
      
      customerId = result[0].id;
      custCount++;
    }
    customerMap.set(index, customerId);
  }
  console.log(`  ✅ Added/Checked ${custCount} new customers.`);

  // 2. Employees
  console.log('  👥 Seeding Employees...');
  let empCount = 0;
  for (let i = 0; i < seedData.employees.length; i++) {
    const e = seedData.employees[i];
    const index = i + 1;

    const dbCustomerId = customerMap.get(e.customerIndex);
    if (!dbCustomerId) continue;

    const existing = await db.select({ id: schema.employees.id })
      .from(schema.employees)
      .where(eq(schema.employees.employeeCode, e.employeeCode))
      .limit(1);
    
    let employeeId: number;

    if (existing.length > 0) {
      employeeId = existing[0].id;
    } else {
      let dbStatus = "active";
      if (e.status === 'inactive') dbStatus = 'terminated';
      else if (e.status === 'active') dbStatus = 'active';

      const result = await db.insert(schema.employees).values({
        employeeCode: e.employeeCode,
        customerId: dbCustomerId,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        nationality: e.nationality,
        country: e.country,
        jobTitle: e.jobTitle,
        startDate: e.startDate,
        endDate: e.endDate || null,
        baseSalary: e.baseSalary.toString(),
        salaryCurrency: e.salaryCurrency,
        status: dbStatus as any,
        serviceType: 'eor',
        employmentType: 'long_term',
        requiresVisa: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning({ id: schema.employees.id });

      employeeId = result[0].id;
      empCount++;
    }
    employeeMap.set(index, employeeId);
  }
  console.log(`  ✅ Added/Checked ${empCount} new employees.`);

  // 3. Invoices
  console.log('  📄 Seeding Invoices...');
  const allInvoices = [
    ...(seedData.deposit_invoices || []).map((inv: any) => ({ ...inv, source: 'deposit_invoices' })),
    ...(seedData.inactive_deposits || []).map((inv: any) => ({ ...inv, source: 'inactive_deposits' })),
    ...(seedData.deposit_refunds || []).map((inv: any) => ({ ...inv, source: 'deposit_refunds' }))
  ];

  let invCount = 0;
  for (const inv of allInvoices) {
    const dbCustomerId = customerMap.get(inv.customerIndex);
    const dbEmployeeId = employeeMap.get(inv.employeeIndex);

    if (!dbCustomerId || !dbEmployeeId) continue;

    const existing = await db.select({ id: schema.invoices.id })
      .from(schema.invoices)
      .where(eq(schema.invoices.invoiceNumber, inv.invoiceNumber))
      .limit(1);

    if (existing.length > 0) continue;

    let dbType = "deposit";
    if (inv.invoiceType === 'deposit_refund') dbType = 'deposit_refund';

    let dbStatus = "sent";
    if (inv.status === 'draft') dbStatus = 'draft';
    else if (inv.status === 'sent') dbStatus = 'sent';
    
    const invResult = await db.insert(schema.invoices).values({
      invoiceNumber: inv.invoiceNumber,
      customerId: dbCustomerId,
      invoiceType: dbType as any,
      invoiceMonth: inv.issueDate,
      currency: inv.currency,
      subtotal: inv.total.toString(),
      total: inv.total.toString(),
      status: dbStatus as any,
      dueDate: inv.dueDate,
      sentDate: dbStatus === 'sent' ? new Date(inv.issueDate) : null,
      createdAt: new Date(inv.issueDate),
      notes: `Imported from ${inv.source}`,
    }).returning({ id: schema.invoices.id });

    const invoiceId = invResult[0].id;

    await db.insert(schema.invoiceItems).values({
      invoiceId: invoiceId,
      employeeId: dbEmployeeId,
      description: `${dbType === 'deposit' ? 'Security Deposit' : 'Deposit Refund'} - ${inv.invoiceNumber}`,
      quantity: "1.00",
      unitPrice: inv.total.toString(),
      amount: inv.total.toString(),
      itemType: "deposit",
      localCurrency: inv.currency,
      localAmount: inv.total.toString(),
    });
    invCount++;
  }
  console.log(`  ✅ Added ${invCount} new invoices.`);
}

async function verifyData() {
  console.log('\n🔍 Verifying Data Integrity...');
  
  const customerCount = await db.select({ count: schema.customers.id }).from(schema.customers);
  console.log(`- Customers: ${customerCount.length} (Expected: ~31)`);
  
  const employeeCount = await db.select({ count: schema.employees.id }).from(schema.employees);
  console.log(`- Employees: ${employeeCount.length} (Expected: ~105)`);
  
  const countryCount = await db.select({ count: schema.countriesConfig.id }).from(schema.countriesConfig);
  console.log(`- Countries: ${countryCount.length} (Expected: 126)`);
  
  if (customerCount.length < 30) console.warn('⚠️  Warning: Customer count seems low.');
  if (employeeCount.length < 100) console.warn('⚠️  Warning: Employee count seems low.');
}

async function seedSocialInsurance() {
  console.log('🛡️ Seeding Social Insurance Rules...');
  
  // Clear existing rules to avoid duplicates if running multiple times
  // Or use onConflictDoUpdate if we have a unique constraint.
  // The schema has indices but no unique constraint on (countryCode, itemKey, effectiveYear).
  // However, let's just insert for now. Or better, delete all and re-insert since this is seed.
  // Actually, let's check if we can use onConflict.
  // The schema doesn't seem to enforce uniqueness on the combination of fields.
  // Let's just delete all rules for now to be safe, or check existence.
  
  // For safety in production seed, maybe we should just insert if not exists.
  
  let count = 0;
  for (const rule of socialInsuranceRules) {
    const existing = await db.select().from(schema.countrySocialInsuranceItems).where(
      and(
        eq(schema.countrySocialInsuranceItems.countryCode, rule.countryCode),
        eq(schema.countrySocialInsuranceItems.itemKey, rule.itemKey),
        eq(schema.countrySocialInsuranceItems.effectiveYear, rule.effectiveYear)
      )
    ).limit(1);

    if (existing.length === 0) {
      await db.insert(schema.countrySocialInsuranceItems).values(rule);
      count++;
    }
  }
  console.log(`✅ Added ${count} new social insurance rules.`);
}

async function seedAIConfigs() {
  console.log('🤖 Seeding AI Configurations...');
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
    await db.insert(schema.aiProviderConfigs)
      .values(p as any)
      .onConflictDoUpdate({
        target: schema.aiProviderConfigs.provider,
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
  console.log(`✅ Seeded ${providers.length} AI providers.`);
}

async function main() {
  try {
    console.log('🚀 Starting Production Data Seeding...');
    console.log('---------------------------------------');
    
    await seedCountries();
    await seedLeaveTypes();
    await seedHolidays();
    await seedSocialInsurance();
    await seedBusinessData();
    await seedAIConfigs();
    
    await verifyData();
    
    console.log('---------------------------------------');
    console.log('🎉 Seeding Completed Successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

main();
