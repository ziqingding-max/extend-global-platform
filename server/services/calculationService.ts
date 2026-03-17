import { getDb } from "../db";
import { countrySocialInsuranceItems } from "../../drizzle/schema";
import { eq, and, or, isNull } from "drizzle-orm";

interface CalculationInput {
  countryCode: string;
  year: number;
  salary: number; // Monthly base salary
  regionCode?: string; // Optional: e.g. "CN-SH" for Shanghai
  age?: number; // Optional: for age-based rules (e.g. SG CPF)
}

interface ContributionItem {
  itemKey: string;
  itemNameEn: string;
  itemNameZh: string;
  category: string;
  employerContribution: string; // Formatted to 2 decimals
  employeeContribution: string; // Formatted to 2 decimals
  employerRate: string; // Display string
  employeeRate: string; // Display string
  capNote?: string; // Explanation of cap if applied
}

interface CalculationResult {
  countryCode: string;
  year: number;
  salary: number;
  items: ContributionItem[];
  totalEmployer: string;
  totalEmployee: string;
  totalCost: string; // Salary + Employer Contribution
}

export const calculationService = {
  /**
   * Calculate social insurance contributions for a given salary
   */
  calculateSocialInsurance: async (input: CalculationInput): Promise<CalculationResult> => {
    const { countryCode, year, salary, regionCode, age } = input;

    const db = getDb();
    if (!db) throw new Error("Database connection failed");

    // 1. Fetch rules
    // If regionCode is provided, fetch items for that region OR national items (null region)
    // If regionCode is NOT provided, fetch only national items (null region)
    const whereClause = regionCode
      ? and(
          eq(countrySocialInsuranceItems.countryCode, countryCode),
          eq(countrySocialInsuranceItems.effectiveYear, year),
          eq(countrySocialInsuranceItems.isActive, true),
          or(
            eq(countrySocialInsuranceItems.regionCode, regionCode),
            isNull(countrySocialInsuranceItems.regionCode)
          )
        )
      : and(
          eq(countrySocialInsuranceItems.countryCode, countryCode),
          eq(countrySocialInsuranceItems.effectiveYear, year),
          eq(countrySocialInsuranceItems.isActive, true),
          isNull(countrySocialInsuranceItems.regionCode)
        );

    const db_rules = await db
      .select()
      .from(countrySocialInsuranceItems)
      .where(whereClause)
      .orderBy(countrySocialInsuranceItems.sortOrder);
      
    let rules = db_rules;

    // Fallback logic for countries where ALL rules might be tied to a region, 
    // but no region was selected (e.g. US, VN, CA).
    // In this case, we pick the first available region's rules as a representative estimate.
    if (rules.length === 0 && !regionCode) {
        const anyRules = await db.query.countrySocialInsuranceItems.findMany({
            where: and(
                eq(countrySocialInsuranceItems.countryCode, countryCode),
                eq(countrySocialInsuranceItems.effectiveYear, year),
                eq(countrySocialInsuranceItems.isActive, true)
            ),
            orderBy: [countrySocialInsuranceItems.sortOrder]
        });
        
        if (anyRules.length > 0) {
            // Pick rules from the first region found
            const firstRegion = anyRules.find(r => r.regionCode !== null)?.regionCode;
            if (firstRegion) {
                rules = anyRules.filter(r => r.regionCode === firstRegion || r.regionCode === null);
            } else {
                rules = anyRules;
            }
        }
    }

    const items: ContributionItem[] = [];
    let totalEmployer = 0;
    let totalEmployee = 0;

    for (const rule of rules) {
      // 2. Filter by Age Bracket if applicable
      if (age !== undefined) {
        if (rule.ageBracketMin !== null && age < rule.ageBracketMin) continue;
        if (rule.ageBracketMax !== null && age > rule.ageBracketMax) continue;
      }

      // 3. Filter by Salary Bracket if applicable (e.g. HK MPF min salary)
      // Note: Usually salary brackets affect RATES, but here we treat them as eligibility for the rule
      // Or we handle specific logic like HK MPF inside the calculation
      
      const rateEmployer = parseFloat(rule.rateEmployer);
      const rateEmployee = parseFloat(rule.rateEmployee);

      // 4. Calculate Employer Contribution
      let employerBase = salary;
      let employerCapNote = "";
      
      // Apply Cap Logic for Employer
      if (rule.capType === "fixed_amount" && rule.capBase) {
        const cap = parseFloat(rule.capBase);
        if (salary > cap) {
          employerBase = cap;
          employerCapNote = `Capped at ${cap}`;
        }
      } else if (rule.capType === "salary_multiple" && rule.capMultiplier && rule.capReferenceBase) {
        const ref = parseFloat(rule.capReferenceBase);
        const mult = parseFloat(rule.capMultiplier);
        const cap = ref * mult;
        if (salary > cap) {
          employerBase = cap;
          employerCapNote = `Capped at ${cap} (${mult}x Base)`;
        }
      }

      let employerAmount = employerBase * rateEmployer;

      // 5. Calculate Employee Contribution
      let employeeBase = salary;
      let employeeCapNote = "";

      // Special Case: HK MPF Min Salary check for Employee
      if (countryCode === "HK" && rule.salaryBracketMin) {
        const minSalary = parseFloat(rule.salaryBracketMin);
        if (salary < minSalary) {
            employeeBase = 0; // Exempt
            employeeCapNote = `Below min salary ${minSalary}`;
        }
      }
      
      // Apply Cap Logic for Employee (same as Employer usually, but calculated independently)
      if (employeeBase > 0) {
        if (rule.capType === "fixed_amount" && rule.capBase) {
            const cap = parseFloat(rule.capBase);
            if (salary > cap) {
            employeeBase = cap;
            // employeeCapNote = `Capped at ${cap}`; // Redundant to show twice if same
            }
        } else if (rule.capType === "salary_multiple" && rule.capMultiplier && rule.capReferenceBase) {
            const ref = parseFloat(rule.capReferenceBase);
            const mult = parseFloat(rule.capMultiplier);
            const cap = ref * mult;
            if (salary > cap) {
            employeeBase = cap;
            }
        }
      }

      let employeeAmount = employeeBase * rateEmployee;

      // Rounding (2 decimals)
      // Use simple rounding: Math.round(num * 100) / 100
      employerAmount = Math.round(employerAmount * 100) / 100;
      employeeAmount = Math.round(employeeAmount * 100) / 100;

      totalEmployer += employerAmount;
      totalEmployee += employeeAmount;

      items.push({
        itemKey: rule.itemKey,
        itemNameEn: rule.itemNameEn,
        itemNameZh: rule.itemNameZh,
        category: rule.category,
        employerContribution: employerAmount.toFixed(2),
        employeeContribution: employeeAmount.toFixed(2),
        employerRate: `${(rateEmployer * 100).toFixed(2)}%`,
        employeeRate: `${(rateEmployee * 100).toFixed(2)}%`,
        capNote: employerCapNote || employeeCapNote || undefined
      });
    }

    // Sort items by category or other logic if needed? 
    // They are already sorted by sortOrder from DB.

    return {
      countryCode,
      year,
      salary,
      items,
      totalEmployer: totalEmployer.toFixed(2),
      totalEmployee: totalEmployee.toFixed(2),
      totalCost: (salary + totalEmployer).toFixed(2)
    };
  }
};
