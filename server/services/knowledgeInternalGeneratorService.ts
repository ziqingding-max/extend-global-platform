/**
 * Knowledge Base Internal Data Generator Service
 *
 * Generates knowledge_items articles from existing internal data:
 * - Country Guide chapters (country_guide_chapters table OR country_guide_data.json fallback)
 * - Social Insurance rules (country_social_insurance_items table)
 * - Public Holidays (public_holidays table)
 * - Leave Types (leave_types table)
 * - Country Config (countries_config table)
 *
 * This replaces the external URL-based ingestion approach with a reliable
 * internal data pipeline that leverages GEA's own structured datasets.
 */

import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";
import {
  knowledgeItems,
  countriesConfig,
  publicHolidays,
  leaveTypes,
  countrySocialInsuranceItems,
  countryGuideChapters,
} from "../../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

type Topic = "payroll" | "compliance" | "leave" | "invoice" | "onboarding" | "general";
type Language = "en" | "zh";
type Category = "article" | "alert" | "guide";

interface GeneratedArticle {
  title: string;
  summary: string;
  content: string;
  topic: Topic;
  language: Language;
  category: Category;
  metadata: Record<string, any>;
}

interface GenerationResult {
  totalGenerated: number;
  byType: {
    countryOverview: number;
    socialInsurance: number;
    publicHolidays: number;
    leaveEntitlements: number;
    hiringGuide: number;
    compensationGuide: number;
    terminationGuide: number;
    workingConditions: number;
  };
  countries: string[];
  errors: string[];
}

interface ChapterData {
  countryCode: string;
  chapterKey: string;
  titleEn: string;
  titleZh: string;
  contentEn: string;
  contentZh: string;
}

// ─── Country Guide Data Loader ───────────────────────────────────────────────

/**
 * Load country guide chapters from DB first, fallback to JSON file.
 */
async function loadCountryGuideChapters(
  db: any,
  countryCode: string
): Promise<Map<string, ChapterData>> {
  // Try DB first
  const dbChapters = await db
    .select()
    .from(countryGuideChapters)
    .where(
      and(
        eq(countryGuideChapters.countryCode, countryCode),
        eq(countryGuideChapters.status, "published")
      )
    )
    .orderBy(asc(countryGuideChapters.sortOrder));

  if (dbChapters.length > 0) {
    return new Map(
      dbChapters.map((ch: any) => [
        ch.chapterKey,
        {
          countryCode: ch.countryCode,
          chapterKey: ch.chapterKey,
          titleEn: ch.titleEn,
          titleZh: ch.titleZh,
          contentEn: ch.contentEn,
          contentZh: ch.contentZh,
        },
      ])
    );
  }

  // Fallback to JSON file
  if (!_jsonGuideData) {
    _jsonGuideData = loadJsonGuideData();
  }

  const jsonChapters = _jsonGuideData.get(countryCode) || [];
  return new Map(
    jsonChapters.map((ch) => [
      ch.chapterKey,
      {
        countryCode: ch.countryCode,
        chapterKey: ch.chapterKey,
        titleEn: ch.titleEn,
        titleZh: ch.titleZh,
        contentEn: ch.contentEn,
        contentZh: ch.contentZh,
      },
    ])
  );
}

let _jsonGuideData: Map<string, ChapterData[]> | null = null;

function loadJsonGuideData(): Map<string, ChapterData[]> {
  const result = new Map<string, ChapterData[]>();
  // Try seed-data first (Docker production), then data (development)
  let jsonPath = path.resolve(process.cwd(), "seed-data/country_guide_data.json");
  if (!fs.existsSync(jsonPath)) {
    jsonPath = path.resolve(process.cwd(), "data/country_guide_data.json");
  }

  if (!fs.existsSync(jsonPath)) {
    console.warn(`[KnowledgeGenerator] country_guide_data.json not found`);
    return result;
  }

  try {
    const rawData = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Array<{
      countryCode: string;
      chapterKey: string;
      titleEn: string;
      titleZh: string;
      contentEn: string;
      contentZh: string;
    }>;

    for (const item of rawData) {
      const list = result.get(item.countryCode) || [];
      list.push(item);
      result.set(item.countryCode, list);
    }

    console.log(`[KnowledgeGenerator] Loaded ${rawData.length} chapters from JSON for ${result.size} countries`);
  } catch (err) {
    console.error("[KnowledgeGenerator] Failed to load JSON guide data:", err);
  }

  return result;
}

// ─── Article Generators ──────────────────────────────────────────────────────

function generateCountryOverviewArticle(
  countryCode: string,
  chapter: ChapterData,
  countryName: string
): GeneratedArticle[] {
  return [
    {
      title: `${countryName} Employment Guide: Country Overview`,
      summary: `Comprehensive overview of ${countryName} for international employers, covering political system, economy, business culture, and key employment facts.`,
      content: chapter.contentEn,
      topic: "general",
      language: "en",
      category: "guide",
      metadata: {
        countryCode,
        sourceType: "internal_country_guide",
        chapterKey: "overview",
        version: "2026-Q1",
      },
    },
    {
      title: `${countryName}雇佣指南：国家概览`,
      summary: `面向国际雇主的${countryName}综合概览，涵盖政治体制、经济概况、商业文化及关键雇佣信息。`,
      content: chapter.contentZh,
      topic: "general",
      language: "zh",
      category: "guide",
      metadata: {
        countryCode,
        sourceType: "internal_country_guide",
        chapterKey: "overview",
        version: "2026-Q1",
      },
    },
  ];
}

function generateHiringArticle(
  countryCode: string,
  chapter: ChapterData,
  countryName: string
): GeneratedArticle[] {
  return [
    {
      title: `Hiring in ${countryName}: Employment Contracts, Work Permits & Onboarding`,
      summary: `Essential guide to hiring employees in ${countryName}, covering contract requirements, probation periods, work permits, and anti-discrimination laws.`,
      content: chapter.contentEn,
      topic: "onboarding",
      language: "en",
      category: "guide",
      metadata: { countryCode, sourceType: "internal_country_guide", chapterKey: "hiring", version: "2026-Q1" },
    },
    {
      title: `${countryName}招聘指南：劳动合同、工作许可与入职流程`,
      summary: `在${countryName}雇佣员工的必备指南，涵盖合同要求、试用期、工作许可及反歧视法律。`,
      content: chapter.contentZh,
      topic: "onboarding",
      language: "zh",
      category: "guide",
      metadata: { countryCode, sourceType: "internal_country_guide", chapterKey: "hiring", version: "2026-Q1" },
    },
  ];
}

function generateCompensationArticle(
  countryCode: string,
  chapter: ChapterData,
  countryName: string
): GeneratedArticle[] {
  return [
    {
      title: `${countryName} Compensation Guide: Salary, Taxes & Employer Obligations`,
      summary: `Detailed guide to compensation structures in ${countryName}, including minimum wage, income tax brackets, employer contributions, and mandatory bonuses.`,
      content: chapter.contentEn,
      topic: "payroll",
      language: "en",
      category: "guide",
      metadata: { countryCode, sourceType: "internal_country_guide", chapterKey: "compensation", version: "2026-Q1" },
    },
    {
      title: `${countryName}薪酬指南：工资结构、税务与雇主义务`,
      summary: `${countryName}薪酬结构详细指南，包括最低工资、个人所得税税率、雇主缴费及法定奖金。`,
      content: chapter.contentZh,
      topic: "payroll",
      language: "zh",
      category: "guide",
      metadata: { countryCode, sourceType: "internal_country_guide", chapterKey: "compensation", version: "2026-Q1" },
    },
  ];
}

function generateTerminationArticle(
  countryCode: string,
  chapter: ChapterData,
  countryName: string
): GeneratedArticle[] {
  return [
    {
      title: `Termination & Compliance in ${countryName}: Notice Periods, Severance & Legal Requirements`,
      summary: `Guide to employee termination in ${countryName}, covering grounds for dismissal, notice periods, severance pay, unfair dismissal protections, and dispute resolution.`,
      content: chapter.contentEn,
      topic: "compliance",
      language: "en",
      category: "guide",
      metadata: { countryCode, sourceType: "internal_country_guide", chapterKey: "termination", version: "2026-Q1" },
    },
    {
      title: `${countryName}终止与合规指南：通知期、遣散费与法律要求`,
      summary: `${countryName}员工终止指南，涵盖解雇理由、通知期、遣散费、不当解雇保护及争议解决机制。`,
      content: chapter.contentZh,
      topic: "compliance",
      language: "zh",
      category: "guide",
      metadata: { countryCode, sourceType: "internal_country_guide", chapterKey: "termination", version: "2026-Q1" },
    },
  ];
}

function generateWorkingConditionsArticle(
  countryCode: string,
  chapter: ChapterData,
  countryName: string
): GeneratedArticle[] {
  return [
    {
      title: `Working Conditions in ${countryName}: Hours, Overtime & Leave Policies`,
      summary: `Comprehensive guide to working conditions in ${countryName}, covering standard hours, overtime regulations, annual leave, public holidays, and statutory leave types.`,
      content: chapter.contentEn,
      topic: "leave",
      language: "en",
      category: "guide",
      metadata: { countryCode, sourceType: "internal_country_guide", chapterKey: "working-conditions", version: "2026-Q1" },
    },
    {
      title: `${countryName}工作条件指南：工时、加班与假期政策`,
      summary: `${countryName}工作条件综合指南，涵盖标准工时、加班规定、年假、法定节假日及各类法定假期。`,
      content: chapter.contentZh,
      topic: "leave",
      language: "zh",
      category: "guide",
      metadata: { countryCode, sourceType: "internal_country_guide", chapterKey: "working-conditions", version: "2026-Q1" },
    },
  ];
}

function generateSocialInsuranceArticle(
  countryCode: string,
  items: Array<{
    itemNameEn: string;
    itemNameZh: string;
    category: string;
    rateEmployer: string;
    rateEmployee: string;
    capType: string;
    capBase: string | null;
    notes: string | null;
    legalReference: string | null;
    effectiveYear: number;
  }>,
  countryName: string
): GeneratedArticle[] {
  if (items.length === 0) return [];

  let contentEn = `## Social Insurance & Employer Costs in ${countryName}\n\n`;
  contentEn += `The following table summarizes the mandatory social insurance contributions for employers and employees in ${countryName}.\n\n`;
  contentEn += `| Contribution Type | Category | Employer Rate | Employee Rate | Cap Type |\n`;
  contentEn += `|------------------|----------|--------------|--------------|----------|\n`;

  let totalEmployer = 0;
  let totalEmployee = 0;

  for (const item of items) {
    const employerRate = parseFloat(item.rateEmployer) * 100;
    const employeeRate = parseFloat(item.rateEmployee) * 100;
    totalEmployer += employerRate;
    totalEmployee += employeeRate;
    contentEn += `| ${item.itemNameEn} | ${item.category.replace(/_/g, " ")} | ${employerRate.toFixed(2)}% | ${employeeRate.toFixed(2)}% | ${item.capType.replace(/_/g, " ")} |\n`;
  }

  contentEn += `| **Total** | | **${totalEmployer.toFixed(2)}%** | **${totalEmployee.toFixed(2)}%** | |\n\n`;

  const itemsWithNotes = items.filter((i) => i.notes);
  if (itemsWithNotes.length > 0) {
    contentEn += `### Key Notes\n\n`;
    for (const item of itemsWithNotes) {
      contentEn += `- **${item.itemNameEn}**: ${item.notes}\n`;
    }
    contentEn += "\n";
  }

  const itemsWithRefs = items.filter((i) => i.legalReference);
  if (itemsWithRefs.length > 0) {
    contentEn += `### Legal References\n\n`;
    for (const item of itemsWithRefs) {
      contentEn += `- [${item.itemNameEn}](${item.legalReference})\n`;
    }
    contentEn += "\n";
  }

  contentEn += `> Data effective for year ${items[0]?.effectiveYear || 2025}. Rates may change annually. Always verify with local authorities.\n`;

  // Chinese content
  let contentZh = `## ${countryName}社会保险与雇主成本\n\n`;
  contentZh += `以下表格汇总了${countryName}雇主和雇员的强制性社会保险缴费。\n\n`;
  contentZh += `| 缴费类型 | 类别 | 雇主费率 | 雇员费率 | 封顶类型 |\n`;
  contentZh += `|---------|------|---------|---------|--------|\n`;

  const categoryZhMap: Record<string, string> = {
    social_insurance: "社会保险",
    health_insurance: "医疗保险",
    unemployment: "失业保险",
    pension: "养老金",
    work_injury: "工伤保险",
    housing_fund: "住房公积金",
    trade_union: "工会",
    other_mandatory: "其他强制",
  };

  const capTypeZhMap: Record<string, string> = {
    none: "无上限",
    fixed_amount: "固定金额",
    salary_multiple: "工资倍数",
    bracket: "分级费率",
  };

  for (const item of items) {
    const employerRate = parseFloat(item.rateEmployer) * 100;
    const employeeRate = parseFloat(item.rateEmployee) * 100;
    contentZh += `| ${item.itemNameZh} | ${categoryZhMap[item.category] || item.category} | ${employerRate.toFixed(2)}% | ${employeeRate.toFixed(2)}% | ${capTypeZhMap[item.capType] || item.capType} |\n`;
  }

  contentZh += `| **合计** | | **${totalEmployer.toFixed(2)}%** | **${totalEmployee.toFixed(2)}%** | |\n\n`;

  if (itemsWithNotes.length > 0) {
    contentZh += `### 重要说明\n\n`;
    for (const item of itemsWithNotes) {
      contentZh += `- **${item.itemNameZh}**：${item.notes}\n`;
    }
    contentZh += "\n";
  }

  contentZh += `> 数据适用于${items[0]?.effectiveYear || 2025}年。费率可能每年调整，请以当地官方信息为准。\n`;

  return [
    {
      title: `${countryName} Social Insurance & Employer Cost Breakdown`,
      summary: `Complete breakdown of mandatory social insurance contributions in ${countryName}: employer pays ${totalEmployer.toFixed(1)}%, employee pays ${totalEmployee.toFixed(1)}%.`,
      content: contentEn,
      topic: "payroll",
      language: "en",
      category: "article",
      metadata: {
        countryCode,
        sourceType: "internal_social_insurance",
        totalEmployerRate: totalEmployer.toFixed(2),
        totalEmployeeRate: totalEmployee.toFixed(2),
        itemCount: items.length,
        effectiveYear: items[0]?.effectiveYear || 2025,
      },
    },
    {
      title: `${countryName}社会保险与雇主成本明细`,
      summary: `${countryName}强制性社会保险缴费完整明细：雇主缴费${totalEmployer.toFixed(1)}%，雇员缴费${totalEmployee.toFixed(1)}%。`,
      content: contentZh,
      topic: "payroll",
      language: "zh",
      category: "article",
      metadata: {
        countryCode,
        sourceType: "internal_social_insurance",
        totalEmployerRate: totalEmployer.toFixed(2),
        totalEmployeeRate: totalEmployee.toFixed(2),
        itemCount: items.length,
        effectiveYear: items[0]?.effectiveYear || 2025,
      },
    },
  ];
}

function generatePublicHolidaysArticle(
  countryCode: string,
  holidays: Array<{
    holidayDate: Date;
    holidayName: string;
    localName: string | null;
    year: number;
    isGlobal: boolean;
  }>,
  countryName: string
): GeneratedArticle[] {
  if (holidays.length === 0) return [];

  const year = holidays[0]?.year || 2026;

  let contentEn = `## ${countryName} Public Holidays ${year}\n\n`;
  contentEn += `${countryName} observes **${holidays.length}** public holidays in ${year}. Employees are entitled to paid time off on these days.\n\n`;
  contentEn += `| # | Date | Holiday | Local Name | Nationwide |\n`;
  contentEn += `|---|------|---------|------------|------------|\n`;

  const sorted = [...holidays].sort(
    (a, b) => new Date(a.holidayDate).getTime() - new Date(b.holidayDate).getTime()
  );

  sorted.forEach((h, idx) => {
    const date = new Date(h.holidayDate);
    const dateStr = date.toISOString().split("T")[0];
    contentEn += `| ${idx + 1} | ${dateStr} | ${h.holidayName} | ${h.localName || "-"} | ${h.isGlobal ? "Yes" : "Regional"} |\n`;
  });

  contentEn += `\n### Key Information for Employers\n\n`;
  contentEn += `- Employees working on public holidays are typically entitled to overtime pay (usually 200-300% of regular pay, depending on local labor law).\n`;
  contentEn += `- If a public holiday falls on a weekend, the substitute day policy varies by country.\n`;
  contentEn += `- Some holidays marked as "Regional" may only apply to specific states or provinces.\n`;

  let contentZh = `## ${countryName} ${year}年法定节假日\n\n`;
  contentZh += `${countryName}在${year}年共有**${holidays.length}**个法定节假日。员工在这些日期享有带薪休假权利。\n\n`;
  contentZh += `| # | 日期 | 节假日 | 当地名称 | 全国性 |\n`;
  contentZh += `|---|------|-------|---------|-------|\n`;

  sorted.forEach((h, idx) => {
    const date = new Date(h.holidayDate);
    const dateStr = date.toISOString().split("T")[0];
    contentZh += `| ${idx + 1} | ${dateStr} | ${h.holidayName} | ${h.localName || "-"} | ${h.isGlobal ? "是" : "地区性"} |\n`;
  });

  contentZh += `\n### 雇主须知\n\n`;
  contentZh += `- 在法定节假日工作的员工通常有权获得加班费（通常为正常工资的200-300%，具体取决于当地劳动法）。\n`;
  contentZh += `- 如果法定节假日恰逢周末，补休政策因国家而异。\n`;
  contentZh += `- 标记为"地区性"的节假日可能仅适用于特定州或省份。\n`;

  return [
    {
      title: `${countryName} Public Holidays ${year}: Complete Calendar for Employers`,
      summary: `Complete list of ${holidays.length} public holidays in ${countryName} for ${year}, with dates and employer obligations.`,
      content: contentEn,
      topic: "leave",
      language: "en",
      category: "article",
      metadata: { countryCode, sourceType: "internal_public_holidays", year, holidayCount: holidays.length },
    },
    {
      title: `${countryName} ${year}年法定节假日完整日历`,
      summary: `${countryName}${year}年${holidays.length}个法定节假日完整列表，含日期及雇主义务说明。`,
      content: contentZh,
      topic: "leave",
      language: "zh",
      category: "article",
      metadata: { countryCode, sourceType: "internal_public_holidays", year, holidayCount: holidays.length },
    },
  ];
}

function generateLeaveEntitlementsArticle(
  countryCode: string,
  leaves: Array<{
    leaveTypeName: string;
    annualEntitlement: number | null;
    isPaid: boolean;
    description: string | null;
  }>,
  countryName: string,
  countryConfig: { statutoryAnnualLeave: number | null; workingDaysPerWeek: number | null }
): GeneratedArticle[] {
  if (leaves.length === 0) return [];

  let contentEn = `## ${countryName} Leave Entitlements\n\n`;
  contentEn += `Employees in ${countryName} are entitled to the following statutory leave types. `;
  if (countryConfig.statutoryAnnualLeave) {
    contentEn += `The statutory minimum annual leave is **${countryConfig.statutoryAnnualLeave} days** per year`;
    if (countryConfig.workingDaysPerWeek) {
      contentEn += ` based on a **${countryConfig.workingDaysPerWeek}-day** work week`;
    }
    contentEn += `.\n\n`;
  } else {
    contentEn += "\n\n";
  }

  contentEn += `| Leave Type | Annual Entitlement | Paid | Notes |\n`;
  contentEn += `|-----------|-------------------|------|-------|\n`;

  for (const leave of leaves) {
    const days = leave.annualEntitlement ? `${leave.annualEntitlement} days` : "As needed";
    contentEn += `| ${leave.leaveTypeName} | ${days} | ${leave.isPaid ? "Yes" : "No"} | ${leave.description || "-"} |\n`;
  }

  contentEn += `\n### Important Notes for Employers\n\n`;
  contentEn += `- Leave entitlements are statutory minimums; employers may offer more generous policies.\n`;
  contentEn += `- Unused annual leave may carry over to the next year depending on local regulations.\n`;
  contentEn += `- Sick leave may require a medical certificate after a specified number of consecutive days.\n`;
  contentEn += `- Maternity and paternity leave durations and pay rates are set by law and cannot be reduced.\n`;

  const leaveTypeNameZh: Record<string, string> = {
    "Annual Leave": "年假",
    "Sick Leave": "病假",
    "Unpaid Leave": "无薪假",
    "Maternity Leave": "产假",
    "Paternity Leave": "陪产假",
    "Bereavement Leave": "丧假",
    "Marriage Leave": "婚假",
    "Parental Leave": "育儿假",
    "Compassionate Leave": "恩恤假",
    "Study Leave": "学习假",
    "Personal Leave": "事假",
    "Family Leave": "家庭假",
    "Public Holiday Leave": "法定节假日",
    "Casual Leave": "临时假",
    "Earned Leave": "累积假",
    "Festival Leave": "节日假",
    "Privilege Leave": "特权假",
  };

  let contentZh = `## ${countryName}假期权益\n\n`;
  contentZh += `${countryName}的员工享有以下法定假期类型。`;
  if (countryConfig.statutoryAnnualLeave) {
    contentZh += `法定最低年假为每年**${countryConfig.statutoryAnnualLeave}天**`;
    if (countryConfig.workingDaysPerWeek) {
      contentZh += `（基于每周**${countryConfig.workingDaysPerWeek}天**工作制）`;
    }
    contentZh += `。\n\n`;
  } else {
    contentZh += "\n\n";
  }

  contentZh += `| 假期类型 | 年度天数 | 带薪 | 备注 |\n`;
  contentZh += `|---------|---------|------|-----|\n`;

  for (const leave of leaves) {
    const days = leave.annualEntitlement ? `${leave.annualEntitlement}天` : "按需";
    const nameZh = leaveTypeNameZh[leave.leaveTypeName] || leave.leaveTypeName;
    contentZh += `| ${nameZh} | ${days} | ${leave.isPaid ? "是" : "否"} | ${leave.description || "-"} |\n`;
  }

  contentZh += `\n### 雇主须知\n\n`;
  contentZh += `- 假期权益为法定最低标准，雇主可提供更优厚的政策。\n`;
  contentZh += `- 未使用的年假是否可结转至下一年取决于当地法规。\n`;
  contentZh += `- 连续病假超过规定天数后可能需要提供医疗证明。\n`;
  contentZh += `- 产假和陪产假的时长及薪资标准由法律规定，不得减少。\n`;

  return [
    {
      title: `${countryName} Leave Entitlements: Annual, Sick, Maternity & More`,
      summary: `Complete guide to statutory leave entitlements in ${countryName}, including ${leaves.length} leave types with days and pay status.`,
      content: contentEn,
      topic: "leave",
      language: "en",
      category: "article",
      metadata: {
        countryCode,
        sourceType: "internal_leave_types",
        leaveTypeCount: leaves.length,
        statutoryAnnualLeave: countryConfig.statutoryAnnualLeave,
      },
    },
    {
      title: `${countryName}假期权益指南：年假、病假、产假及更多`,
      summary: `${countryName}法定假期权益完整指南，涵盖${leaves.length}种假期类型及天数、薪资标准。`,
      content: contentZh,
      topic: "leave",
      language: "zh",
      category: "article",
      metadata: {
        countryCode,
        sourceType: "internal_leave_types",
        leaveTypeCount: leaves.length,
        statutoryAnnualLeave: countryConfig.statutoryAnnualLeave,
      },
    },
  ];
}

// ─── Main Generation Function ────────────────────────────────────────────────

export async function generateKnowledgeFromInternalData(options?: {
  countryCodes?: string[];
  types?: Array<
    | "countryOverview"
    | "socialInsurance"
    | "publicHolidays"
    | "leaveEntitlements"
    | "hiringGuide"
    | "compensationGuide"
    | "terminationGuide"
    | "workingConditions"
  >;
  dryRun?: boolean;
}): Promise<GenerationResult> {
  const db = getDb();
  if (!db) {
    throw new Error("Database connection unavailable");
  }

  const result: GenerationResult = {
    totalGenerated: 0,
    byType: {
      countryOverview: 0,
      socialInsurance: 0,
      publicHolidays: 0,
      leaveEntitlements: 0,
      hiringGuide: 0,
      compensationGuide: 0,
      terminationGuide: 0,
      workingConditions: 0,
    },
    countries: [],
    errors: [],
  };

  const typesToGenerate = options?.types || [
    "countryOverview",
    "socialInsurance",
    "publicHolidays",
    "leaveEntitlements",
    "hiringGuide",
    "compensationGuide",
    "terminationGuide",
    "workingConditions",
  ];

  // Get all active countries
  const allCountries = await db
    .select()
    .from(countriesConfig)
    .where(eq(countriesConfig.isActive, true));

  const targetCountries = options?.countryCodes?.length
    ? allCountries.filter((c) => options.countryCodes!.includes(c.countryCode))
    : allCountries;

  console.log(`[KnowledgeGenerator] Processing ${targetCountries.length} countries, types: ${typesToGenerate.join(", ")}`);

  const allArticles: GeneratedArticle[] = [];
  const processedCountries = new Set<string>();

  for (const country of targetCountries) {
    const cc = country.countryCode;
    const countryName = country.countryName;

    try {
      // Load country guide chapters (DB or JSON fallback)
      const chapterMap = await loadCountryGuideChapters(db, cc);

      // 1. Country Overview
      if (typesToGenerate.includes("countryOverview") && chapterMap.has("overview")) {
        const articles = generateCountryOverviewArticle(cc, chapterMap.get("overview")!, countryName);
        allArticles.push(...articles);
        result.byType.countryOverview += articles.length;
      }

      // 2. Hiring Guide
      if (typesToGenerate.includes("hiringGuide") && chapterMap.has("hiring")) {
        const articles = generateHiringArticle(cc, chapterMap.get("hiring")!, countryName);
        allArticles.push(...articles);
        result.byType.hiringGuide += articles.length;
      }

      // 3. Compensation Guide
      if (typesToGenerate.includes("compensationGuide") && chapterMap.has("compensation")) {
        const articles = generateCompensationArticle(cc, chapterMap.get("compensation")!, countryName);
        allArticles.push(...articles);
        result.byType.compensationGuide += articles.length;
      }

      // 4. Termination Guide
      if (typesToGenerate.includes("terminationGuide") && chapterMap.has("termination")) {
        const articles = generateTerminationArticle(cc, chapterMap.get("termination")!, countryName);
        allArticles.push(...articles);
        result.byType.terminationGuide += articles.length;
      }

      // 5. Working Conditions
      if (typesToGenerate.includes("workingConditions") && chapterMap.has("working-conditions")) {
        const articles = generateWorkingConditionsArticle(cc, chapterMap.get("working-conditions")!, countryName);
        allArticles.push(...articles);
        result.byType.workingConditions += articles.length;
      }

      // 6. Social Insurance
      if (typesToGenerate.includes("socialInsurance")) {
        const siItems = await db
          .select()
          .from(countrySocialInsuranceItems)
          .where(eq(countrySocialInsuranceItems.countryCode, cc))
          .orderBy(asc(countrySocialInsuranceItems.sortOrder));

        if (siItems.length > 0) {
          const articles = generateSocialInsuranceArticle(cc, siItems, countryName);
          allArticles.push(...articles);
          result.byType.socialInsurance += articles.length;
        }
      }

      // 7. Public Holidays
      if (typesToGenerate.includes("publicHolidays")) {
        const holidays = await db
          .select()
          .from(publicHolidays)
          .where(eq(publicHolidays.countryCode, cc))
          .orderBy(asc(publicHolidays.holidayDate));

        if (holidays.length > 0) {
          const articles = generatePublicHolidaysArticle(cc, holidays, countryName);
          allArticles.push(...articles);
          result.byType.publicHolidays += articles.length;
        }
      }

      // 8. Leave Entitlements
      if (typesToGenerate.includes("leaveEntitlements")) {
        const leaves = await db
          .select()
          .from(leaveTypes)
          .where(eq(leaveTypes.countryCode, cc));

        if (leaves.length > 0) {
          const articles = generateLeaveEntitlementsArticle(cc, leaves, countryName, {
            statutoryAnnualLeave: country.statutoryAnnualLeave,
            workingDaysPerWeek: country.workingDaysPerWeek,
          });
          allArticles.push(...articles);
          result.byType.leaveEntitlements += articles.length;
        }
      }

      processedCountries.add(cc);
    } catch (error: any) {
      result.errors.push(`${cc} (${countryName}): ${error?.message || "Unknown error"}`);
      console.error(`[KnowledgeGenerator] Error processing ${cc}:`, error);
    }
  }

  result.totalGenerated = allArticles.length;
  result.countries = Array.from(processedCountries);

  // Insert into DB
  if (!options?.dryRun && allArticles.length > 0) {
    const now = new Date();
    const batchSize = 50;

    for (let i = 0; i < allArticles.length; i += batchSize) {
      const batch = allArticles.slice(i, i + batchSize);
      await db.insert(knowledgeItems).values(
        batch.map((article) => ({
          customerId: null,
          sourceId: null,
          title: article.title,
          summary: article.summary,
          content: article.content,
          status: "published" as const,
          category: article.category,
          topic: article.topic,
          language: article.language,
          aiConfidence: 95,
          aiSummary: article.summary,
          publishedAt: now,
          metadata: article.metadata,
        }))
      );
    }

    console.log(`[KnowledgeGenerator] Inserted ${allArticles.length} articles into knowledge_items`);
  }

  return result;
}
