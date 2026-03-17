import { getDb } from "../services/db/connection";
import { countryGuideChapters, salaryBenchmarks } from "../../drizzle/schema";

async function seedToolkit() {
  const db = getDb();
  if (!db) {
    console.error("Failed to connect to DB");
    process.exit(1);
  }

  console.log("Seeding Toolkit Data...");

  // 1. Seed Country Guide for China (CN)
  console.log("Seeding CN Country Guide...");
  await db.insert(countryGuideChapters).values([
    {
      countryCode: "CN",
      part: 1, // Employment
      chapterKey: "employment-contracts",
      titleEn: "Employment Contracts",
      titleZh: "劳动合同",
      contentEn: "Written employment contracts are mandatory in China. They must specify term, job description, working hours, and remuneration.",
      contentZh: "在中国，书面劳动合同是强制性的。必须明确期限、工作内容、工作时间和劳动报酬。",
      sortOrder: 10,
      status: "published",
      version: "2025-Q1"
    },
    {
      countryCode: "CN",
      part: 1, // Employment
      chapterKey: "probation-period",
      titleEn: "Probation Period",
      titleZh: "试用期",
      contentEn: "Probation periods depend on contract length: 1 month for <1 year contracts, 2 months for 1-3 years, 6 months for >3 years.",
      contentZh: "试用期取决于合同期限：一年以下合同最长1个月，一至三年合同最长2个月，三年以上合同最长6个月。",
      sortOrder: 20,
      status: "published",
      version: "2025-Q1"
    },
    {
      countryCode: "CN",
      part: 2, // Business
      chapterKey: "entity-setup",
      titleEn: "Entity Setup (WFOE)",
      titleZh: "设立外商独资企业 (WFOE)",
      contentEn: "Setting up a Wholly Foreign-Owned Enterprise (WFOE) is the most common way for foreign investors to enter the Chinese market.",
      contentZh: "设立外商独资企业（WFOE）是外国投资者进入中国市场最常见的方式。",
      sortOrder: 10,
      status: "published",
      version: "2025-Q1"
    }
  ]).onConflictDoNothing();

  // 2. Seed Salary Benchmarks for China (CN)
  console.log("Seeding CN Salary Benchmarks...");
  await db.insert(salaryBenchmarks).values([
    {
      countryCode: "CN",
      jobCategory: "Software Engineering",
      jobTitle: "Senior Software Engineer",
      seniorityLevel: "senior",
      currency: "CNY",
      salaryP25: "25000",
      salaryP50: "35000",
      salaryP75: "50000",
      dataYear: 2025,
      source: "Market Survey Q1"
    },
    {
      countryCode: "CN",
      jobCategory: "Sales",
      jobTitle: "Sales Manager",
      seniorityLevel: "mid",
      currency: "CNY",
      salaryP25: "15000",
      salaryP50: "25000",
      salaryP75: "40000",
      dataYear: 2025,
      source: "Market Survey Q1"
    }
  ]).onConflictDoNothing();

  console.log("Toolkit Seeding Completed.");
}

seedToolkit().catch(console.error);
