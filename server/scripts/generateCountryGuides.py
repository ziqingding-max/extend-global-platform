#!/usr/bin/env python3
"""
Country Guide Content Generator v2.0

标准化的 Country Guide 内容生成工具。
严格遵循 docs/COUNTRY_GUIDE_SPEC.md 规范。

用法:
  # 生成所有未完成的国家（断点续传）
  python3 -u server/scripts/generateCountryGuides.py

  # 只生成指定国家
  python3 -u server/scripts/generateCountryGuides.py --countries GB,DE,FR

  # 重新生成指定国家（覆盖已有数据）
  python3 -u server/scripts/generateCountryGuides.py --countries CN,JP --force

  # 只运行质量检查（不生成）
  python3 -u server/scripts/generateCountryGuides.py --validate-only

  # 生成后自动运行质量检查
  python3 -u server/scripts/generateCountryGuides.py --with-validation
"""
import json
import os
import sys
import time
import re
import argparse
import concurrent.futures
from datetime import datetime
from openai import OpenAI

# ─── Configuration ────────────────────────────────────────────────────────────

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "country_guide_data.json")
REPORT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "reports")
MODEL = "gpt-4.1-mini"
MAX_WORKERS = 3
VERSION = f"{datetime.now().year}-Q{(datetime.now().month - 1) // 3 + 1}"

# ─── Country Registry ────────────────────────────────────────────────────────

ALL_COUNTRIES = [
    # Asia-Pacific
    ("CN", "China", "CNY"), ("HK", "Hong Kong", "HKD"), ("SG", "Singapore", "SGD"),
    ("VN", "Vietnam", "VND"), ("JP", "Japan", "JPY"), ("KR", "South Korea", "KRW"),
    ("AU", "Australia", "AUD"), ("IN", "India", "INR"), ("TH", "Thailand", "THB"),
    ("MY", "Malaysia", "MYR"), ("ID", "Indonesia", "IDR"), ("PH", "Philippines", "PHP"),
    ("TW", "Taiwan", "TWD"), ("NZ", "New Zealand", "NZD"), ("PK", "Pakistan", "PKR"),
    ("BD", "Bangladesh", "BDT"), ("LK", "Sri Lanka", "LKR"), ("KH", "Cambodia", "KHR"),
    # Americas
    ("US", "United States", "USD"), ("CA", "Canada", "CAD"), ("MX", "Mexico", "MXN"),
    ("BR", "Brazil", "BRL"), ("AR", "Argentina", "ARS"), ("CO", "Colombia", "COP"),
    ("CL", "Chile", "CLP"), ("PE", "Peru", "PEN"), ("CR", "Costa Rica", "CRC"),
    # Europe
    ("GB", "United Kingdom", "GBP"), ("DE", "Germany", "EUR"), ("FR", "France", "EUR"),
    ("IT", "Italy", "EUR"), ("ES", "Spain", "EUR"), ("NL", "Netherlands", "EUR"),
    ("SE", "Sweden", "SEK"), ("CH", "Switzerland", "CHF"), ("IE", "Ireland", "EUR"),
    ("PL", "Poland", "PLN"), ("BE", "Belgium", "EUR"), ("AT", "Austria", "EUR"),
    ("PT", "Portugal", "EUR"), ("NO", "Norway", "NOK"), ("DK", "Denmark", "DKK"),
    ("FI", "Finland", "EUR"), ("CZ", "Czech Republic", "CZK"), ("RO", "Romania", "RON"),
    ("HU", "Hungary", "HUF"), ("GR", "Greece", "EUR"),
    # Middle East & Africa
    ("AE", "United Arab Emirates", "AED"), ("SA", "Saudi Arabia", "SAR"),
    ("IL", "Israel", "ILS"), ("TR", "Turkey", "TRY"), ("EG", "Egypt", "EGP"),
    ("NG", "Nigeria", "NGN"), ("KE", "Kenya", "KES"), ("ZA", "South Africa", "ZAR"),
    ("GH", "Ghana", "GHS"),
]

# ─── Chapter Definitions (strict, from COUNTRY_GUIDE_SPEC.md) ────────────────

CHAPTERS = [
    {
        "part": 1,
        "chapterKey": "overview",
        "titleEn": "Country Overview",
        "titleZh": "国家概览",
        "sortOrder": 1,
        "required_h3_en": [
            "Key Facts",
            "Political System & Government",
            "Economic Overview",
            "Business Culture & Etiquette",
            "Currency & Banking",
            "Key Facts for International Employers",
        ],
        "min_tables": 2,
        "prompt": """You are writing the "Country Overview" chapter for {country_name} in a global employment guide.

You MUST structure the content using EXACTLY these H3 sections in this order:

### Key Facts
Include a table with: Official Name, Capital, Population, Official Language(s), Time Zone(s), Currency (with ISO code), GDP (Nominal), GDP Per Capita.

### Political System & Government
2-3 paragraphs on political system, government structure.

### Economic Overview
2-3 paragraphs on economy, major industries, growth trends. Include a table with: GDP Growth Rate, Major Industries, Unemployment Rate, Ease of Doing Business Rank.

### Business Culture & Etiquette
2-3 paragraphs on business culture, communication style, key considerations.

### Currency & Banking
1-2 paragraphs on currency system, banking, foreign exchange controls.

### Key Facts for International Employers
A bullet list of 5-8 key points for employers considering hiring in {country_name}.

CRITICAL FORMAT RULES:
- Start directly with ### Key Facts (NO H1 or H2 headers, NO introductory paragraph before the first ###)
- Use ### for section headers only (never # or ##)
- All tables must use standard Markdown pipe format
- Use **bold** for key terms and numbers
- Use - for bullet lists (not *)
- Be specific with data and statistics, cite years
- Professional, objective tone, third person
- Minimum 600 words""",
    },
    {
        "part": 2,
        "chapterKey": "hiring",
        "titleEn": "Hiring & Employment",
        "titleZh": "招聘与雇佣",
        "sortOrder": 2,
        "required_h3_en": [
            "Employment Contract Requirements",
            "Types of Employment Contracts",
            "Probation Period",
            "Work Permits & Visa Requirements",
            "Background Checks & Onboarding",
            "Anti-Discrimination Laws",
            "EOR Considerations",
        ],
        "min_tables": 1,
        "prompt": """You are writing the "Hiring & Employment" chapter for {country_name} in a global employment guide.

You MUST structure the content using EXACTLY these H3 sections in this order:

### Employment Contract Requirements
Describe written/oral contract requirements, mandatory clauses. Include a table with: Contract Element, Requirement (Written Contract, Language, Mandatory Clauses, etc.)

### Types of Employment Contracts
Describe fixed-term, indefinite, part-time contracts and their regulations.

### Probation Period
Include a table with: Aspect, Details (Maximum Duration, Notice During Probation, Termination During Probation).

### Work Permits & Visa Requirements
Describe work permit and visa requirements for foreign workers.

### Background Checks & Onboarding
Describe background check limitations, mandatory registrations, onboarding procedures.

### Anti-Discrimination Laws
Describe anti-discrimination laws applicable to hiring.

### EOR Considerations
Describe key considerations when using an Employer of Record in {country_name}.

CRITICAL FORMAT RULES:
- Start directly with ### Employment Contract Requirements (NO H1 or H2 headers, NO introductory paragraph before the first ###)
- Use ### for section headers only (never # or ##)
- All tables must use standard Markdown pipe format
- Use **bold** for key terms
- Use - for bullet lists (not *)
- Be specific with legal references where possible
- Professional, objective tone, third person
- Minimum 600 words""",
    },
    {
        "part": 3,
        "chapterKey": "compensation",
        "titleEn": "Compensation & Taxes",
        "titleZh": "薪酬与税务",
        "sortOrder": 3,
        "required_h3_en": [
            "Minimum Wage",
            "Salary Structure & Payment",
            "Mandatory Bonuses & Allowances",
            "Income Tax",
            "Employer Tax Obligations",
            "Tax Filing & Compliance",
        ],
        "min_tables": 2,
        "prompt": """You are writing the "Compensation & Taxes" chapter for {country_name} in a global employment guide.

You MUST structure the content using EXACTLY these H3 sections in this order:

### Minimum Wage
Include a table with: Category, Rate, Effective Date. Cover national minimum and regional variations if applicable.

### Salary Structure & Payment
Describe typical salary structure, payroll cycle, payment methods.

### Mandatory Bonuses & Allowances
Describe 13th month pay, statutory bonuses, mandatory allowances.

### Income Tax (Employee)
Include a complete tax bracket table with: Taxable Income Range, Tax Rate.

### Employer Tax Obligations
Include a comprehensive table with: Contribution Type, Employer Rate, Employee Rate. Cover social security, health insurance, pension, and all other mandatory contributions. Include a Total row.

### Tax Filing & Compliance
Describe filing deadlines, compliance requirements, penalties.

CRITICAL FORMAT RULES:
- Start directly with ### Minimum Wage (NO H1 or H2 headers, NO introductory paragraph before the first ###)
- Use ### for section headers only (never # or ##)
- All tables must use standard Markdown pipe format with specific numbers/percentages
- Use **bold** for key terms and rates
- Use - for bullet lists (not *)
- Include specific current rates and percentages, avoid "varies"
- Professional, objective tone, third person
- Minimum 600 words""",
    },
    {
        "part": 4,
        "chapterKey": "working-conditions",
        "titleEn": "Working Conditions & Leave",
        "titleZh": "工作条件与假期",
        "sortOrder": 4,
        "required_h3_en": [
            "Standard Working Hours",
            "Overtime Regulations",
            "Annual Leave",
            "Public Holidays",
            "Sick Leave",
            "Maternity & Paternity Leave",
            "Other Statutory Leave",
        ],
        "min_tables": 2,
        "prompt": """You are writing the "Working Conditions & Leave" chapter for {country_name} in a global employment guide.

You MUST structure the content using EXACTLY these H3 sections in this order:

### Standard Working Hours
Include a table with: Aspect, Details (Daily Maximum, Weekly Maximum, Rest Day).

### Overtime Regulations
Include a table with: Overtime Type, Compensation Rate (Weekday Overtime, Weekend Work, Public Holiday Work).

### Annual Leave
Include a table with: Tenure, Entitlement showing how annual leave accrues with service years.

### Public Holidays
Include a COMPLETE table listing ALL public holidays for {country_name} with: Holiday, Date (2026). List every single statutory public holiday.

### Sick Leave
Describe sick leave entitlement, pay rate, medical certificate requirements.

### Maternity & Paternity Leave
Include a table with: Leave Type, Duration, Pay (Maternity Leave, Paternity Leave, Parental Leave).

### Other Statutory Leave
Describe other leave types: bereavement, marriage, study leave, etc.

CRITICAL FORMAT RULES:
- Start directly with ### Standard Working Hours (NO H1 or H2 headers, NO introductory paragraph before the first ###)
- Use ### for section headers only (never # or ##)
- All tables must use standard Markdown pipe format
- Use **bold** for key terms and durations
- Use - for bullet lists (not *)
- Include specific durations and rates
- Professional, objective tone, third person
- Minimum 600 words""",
    },
    {
        "part": 5,
        "chapterKey": "termination",
        "titleEn": "Termination & Compliance",
        "titleZh": "终止与合规",
        "sortOrder": 5,
        "required_h3_en": [
            "Grounds for Termination",
            "Notice Period Requirements",
            "Severance Pay",
            "Unfair Dismissal Protections",
            "Data Protection & Privacy",
            "Workplace Safety & Unions",
            "Dispute Resolution",
        ],
        "min_tables": 1,
        "prompt": """You are writing the "Termination & Compliance" chapter for {country_name} in a global employment guide.

You MUST structure the content using EXACTLY these H3 sections in this order:

### Grounds for Termination
Describe termination with cause, without cause, mutual agreement.

### Notice Period Requirements
Include a table with: Employee Tenure, Employer Notice, Employee Notice (During Probation, < 1 year, 1-5 years, > 5 years).

### Severance Pay
Describe severance calculation method. Include a table with: Tenure, Severance Entitlement.

### Unfair Dismissal Protections
Describe unfair dismissal protections, employee remedies, appeal processes.

### Data Protection & Privacy
Describe data protection laws (GDPR equivalent), employee data handling requirements.

### Workplace Safety & Unions
Describe workplace safety regulations, trade union rights, collective bargaining.

### Dispute Resolution
Describe labor dispute resolution mechanisms: mediation, arbitration, litigation.

CRITICAL FORMAT RULES:
- Start directly with ### Grounds for Termination (NO H1 or H2 headers, NO introductory paragraph before the first ###)
- Use ### for section headers only (never # or ##)
- All tables must use standard Markdown pipe format
- Use **bold** for key terms and periods
- Use - for bullet lists (not *)
- Include specific legal requirements and calculations
- Professional, objective tone, third person
- Minimum 600 words""",
    },
]

# ─── System Prompt (shared across all chapters) ──────────────────────────────

SYSTEM_PROMPT = """You are a global employment compliance expert writing for a professional Country Guide.

ABSOLUTE RULES:
1. Return a JSON object with exactly two fields: "contentEn" (English) and "contentZh" (Simplified Chinese)
2. Both versions must have IDENTICAL structure: same H3 headers (translated), same tables, same sections
3. Chinese content must be a COMPLETE professional translation, not a summary
4. Chinese character count should be 35%-55% of English character count
5. NEVER use H1 (#) or H2 (##) headers - only H3 (###) and H4 (####)
6. NEVER start with an introductory paragraph - start directly with the first ### header
7. All tables must use standard Markdown pipe format with | and ---
8. Use **bold** for emphasis, - for bullet lists
9. Be specific with numbers, rates, dates - avoid "varies" or "depends"
10. Professional, objective, third-person tone
11. No emoji, no marketing language
12. Minimum 600 English words per chapter"""

# ─── Data I/O ─────────────────────────────────────────────────────────────────

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_data(data):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_completed_countries(data):
    """Returns set of country codes that have all 5 standard chapters."""
    standard_keys = {"overview", "hiring", "compensation", "working-conditions", "termination"}
    country_keys = {}
    for ch in data:
        code = ch["countryCode"]
        if code not in country_keys:
            country_keys[code] = set()
        country_keys[code].add(ch["chapterKey"])
    return {code for code, keys in country_keys.items() if standard_keys.issubset(keys)}


def remove_country_data(data, country_code):
    """Remove all chapters for a country (used for --force regeneration)."""
    return [ch for ch in data if ch["countryCode"] != country_code]

# ─── Generation ───────────────────────────────────────────────────────────────

def generate_chapter(client, country_code, country_name, currency, chapter_def):
    """Generate a single chapter with retries."""
    prompt = chapter_def["prompt"].format(country_name=country_name, currency=currency)

    for attempt in range(3):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=4000,
                temperature=0.3,
            )

            raw = response.choices[0].message.content
            parsed = json.loads(raw)

            content_en = parsed.get("contentEn", "")
            content_zh = parsed.get("contentZh", "")

            if not content_en or not content_zh:
                raise ValueError("Empty content returned")

            return {
                "countryCode": country_code,
                "part": chapter_def["part"],
                "chapterKey": chapter_def["chapterKey"],
                "titleEn": chapter_def["titleEn"],
                "titleZh": chapter_def["titleZh"],
                "contentEn": content_en,
                "contentZh": content_zh,
                "sortOrder": chapter_def["sortOrder"],
                "version": VERSION,
                "status": "draft",
            }
        except Exception as e:
            print(f"  [RETRY {attempt+1}/3] {country_code}/{chapter_def['chapterKey']}: {e}", flush=True)
            time.sleep(3 * (attempt + 1))

    print(f"  [FAILED] {country_code}/{chapter_def['chapterKey']}: All retries exhausted", flush=True)
    return None


def generate_country(country_tuple):
    """Generate all 5 chapters for a single country."""
    code, name, currency = country_tuple
    client = OpenAI()
    results = []

    for chapter_def in CHAPTERS:
        result = generate_chapter(client, code, name, currency, chapter_def)
        if result:
            results.append(result)
            print(f"  [OK] {code}/{chapter_def['chapterKey']} ({len(result['contentEn'])} EN / {len(result['contentZh'])} ZH chars)", flush=True)
        else:
            print(f"  [SKIP] {code}/{chapter_def['chapterKey']} - generation failed", flush=True)
        time.sleep(0.5)

    return results

# ─── Validation ───────────────────────────────────────────────────────────────

def validate_chapter(chapter, chapter_def):
    """Validate a single chapter against the spec. Returns list of issues."""
    issues = []
    code = chapter["countryCode"]
    key = chapter["chapterKey"]
    prefix = f"{code}/{key}"

    en = chapter.get("contentEn", "")
    zh = chapter.get("contentZh", "")

    # 1. Non-empty
    if not en:
        issues.append(f"{prefix}: contentEn is empty")
        return issues
    if not zh:
        issues.append(f"{prefix}: contentZh is empty")

    # 2. Word count
    en_words = len(en.split())
    if en_words < 600:
        issues.append(f"{prefix}: EN word count too low ({en_words} < 600)")

    # 3. ZH/EN ratio
    ratio = len(zh) / len(en) if len(en) > 0 else 0
    if ratio < 0.30:
        issues.append(f"{prefix}: ZH/EN ratio too low ({ratio:.2f} < 0.30)")
    if ratio > 0.60:
        issues.append(f"{prefix}: ZH/EN ratio too high ({ratio:.2f} > 0.60)")

    # 4. No H1 or H2
    if re.search(r"^# [^#]", en, re.MULTILINE):
        issues.append(f"{prefix}: Contains H1 header (forbidden)")
    if re.search(r"^## [^#]", en, re.MULTILINE):
        issues.append(f"{prefix}: Contains H2 header (forbidden)")

    # 5. H3 count
    h3_headers = re.findall(r"^### (.+)$", en, re.MULTILINE)
    min_h3 = len(chapter_def.get("required_h3_en", []))
    if len(h3_headers) < max(min_h3, 4):
        issues.append(f"{prefix}: Too few H3 headers ({len(h3_headers)} < {max(min_h3, 4)})")

    # 6. Required H3 headers (fuzzy match)
    if chapter_def.get("required_h3_en"):
        found_h3_lower = [h.lower().strip() for h in h3_headers]
        for req_h3 in chapter_def["required_h3_en"]:
            req_lower = req_h3.lower()
            matched = any(req_lower in found or found in req_lower for found in found_h3_lower)
            if not matched:
                keywords = req_lower.split("&")[0].strip().split()[:2]
                matched = any(all(kw in found for kw in keywords) for found in found_h3_lower)
            if not matched:
                issues.append(f"{prefix}: Missing required H3 '{req_h3}'")

    # 7. Table count
    table_separators = re.findall(r"^\|[-:| ]+\|$", en, re.MULTILINE)
    min_tables = chapter_def.get("min_tables", 1)
    if len(table_separators) < min_tables:
        issues.append(f"{prefix}: Too few tables ({len(table_separators)} < {min_tables})")

    # 8. ZH H3 count should match EN
    zh_h3_count = len(re.findall(r"^### .+$", zh, re.MULTILINE))
    if zh_h3_count < len(h3_headers) - 1:
        issues.append(f"{prefix}: ZH has fewer H3 headers ({zh_h3_count}) than EN ({len(h3_headers)})")

    # 9. Field values
    if chapter["part"] != chapter_def["part"]:
        issues.append(f"{prefix}: part mismatch ({chapter['part']} != {chapter_def['part']})")
    if chapter["sortOrder"] != chapter_def["sortOrder"]:
        issues.append(f"{prefix}: sortOrder mismatch")
    if chapter["titleEn"] != chapter_def["titleEn"]:
        issues.append(f"{prefix}: titleEn mismatch ('{chapter['titleEn']}' != '{chapter_def['titleEn']}')")
    if chapter["titleZh"] != chapter_def["titleZh"]:
        issues.append(f"{prefix}: titleZh mismatch")

    return issues


def validate_country(country_code, data):
    """Validate all chapters for a country. Returns list of issues."""
    issues = []
    chapters = [ch for ch in data if ch["countryCode"] == country_code]

    expected_keys = {c["chapterKey"] for c in CHAPTERS}
    found_keys = {ch["chapterKey"] for ch in chapters}

    missing = expected_keys - found_keys
    extra = found_keys - expected_keys

    if missing:
        issues.append(f"{country_code}: Missing chapters: {missing}")
    if extra:
        issues.append(f"{country_code}: Extra chapters (should be removed): {extra}")

    from collections import Counter
    key_counts = Counter(ch["chapterKey"] for ch in chapters)
    dupes = {k: v for k, v in key_counts.items() if v > 1}
    if dupes:
        issues.append(f"{country_code}: Duplicate chapters: {dupes}")

    chapter_map = {c["chapterKey"]: c for c in CHAPTERS}
    for ch in chapters:
        if ch["chapterKey"] in chapter_map:
            issues.extend(validate_chapter(ch, chapter_map[ch["chapterKey"]]))

    return issues


def validate_all(data):
    """Validate all data. Returns dict of country_code -> issues."""
    all_issues = {}
    country_codes = sorted(set(ch["countryCode"] for ch in data))

    for code in country_codes:
        issues = validate_country(code, data)
        if issues:
            all_issues[code] = issues

    return all_issues


def generate_report(data, all_issues):
    """Generate a validation report."""
    os.makedirs(REPORT_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = os.path.join(REPORT_DIR, f"validation_{timestamp}.md")

    country_codes = sorted(set(ch["countryCode"] for ch in data))
    total_chapters = len(data)
    total_issues = sum(len(v) for v in all_issues.values())
    passed = [c for c in country_codes if c not in all_issues]
    failed = [c for c in country_codes if c in all_issues]

    lines = [
        f"# Country Guide Validation Report",
        f"",
        f"**Generated**: {datetime.now().isoformat()}",
        f"**Total Countries**: {len(country_codes)}",
        f"**Total Chapters**: {total_chapters}",
        f"**Passed**: {len(passed)}",
        f"**Failed**: {len(failed)}",
        f"**Total Issues**: {total_issues}",
        f"",
        f"## Summary",
        f"",
        f"| Status | Countries |",
        f"|--------|-----------|",
        f"| PASS | {', '.join(passed) if passed else 'None'} |",
        f"| FAIL | {', '.join(failed) if failed else 'None'} |",
        f"",
    ]

    if all_issues:
        lines.append("## Issues Detail")
        lines.append("")
        for code in failed:
            lines.append(f"### {code}")
            lines.append("")
            for issue in all_issues[code]:
                lines.append(f"- {issue}")
            lines.append("")

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return report_path

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Country Guide Content Generator v2.0")
    parser.add_argument("--countries", type=str, help="Comma-separated country codes to generate (e.g., GB,DE,FR)")
    parser.add_argument("--force", action="store_true", help="Force regeneration (overwrite existing data)")
    parser.add_argument("--validate-only", action="store_true", help="Only run validation, no generation")
    parser.add_argument("--with-validation", action="store_true", help="Run validation after generation")
    parser.add_argument("--workers", type=int, default=MAX_WORKERS, help=f"Number of parallel workers (default: {MAX_WORKERS})")
    args = parser.parse_args()

    data = load_data()
    print(f"[INIT] Loaded {len(data)} existing chapters from {DATA_FILE}", flush=True)

    # Validate-only mode
    if args.validate_only:
        print("\n=== Running Validation ===", flush=True)
        all_issues = validate_all(data)
        report_path = generate_report(data, all_issues)
        total_issues = sum(len(v) for v in all_issues.values())
        print(f"\nValidation complete: {total_issues} issues found", flush=True)
        print(f"Report saved to: {report_path}", flush=True)
        if all_issues:
            for code, issues in sorted(all_issues.items()):
                print(f"\n  {code}: {len(issues)} issues", flush=True)
                for issue in issues:
                    print(f"    - {issue}", flush=True)
        return

    # Determine which countries to generate
    country_map = {c[0]: c for c in ALL_COUNTRIES}

    if args.countries:
        target_codes = [c.strip().upper() for c in args.countries.split(",")]
        invalid = [c for c in target_codes if c not in country_map]
        if invalid:
            print(f"ERROR: Unknown country codes: {invalid}", flush=True)
            sys.exit(1)
        targets = [country_map[c] for c in target_codes]
    else:
        completed = get_completed_countries(data)
        targets = [c for c in ALL_COUNTRIES if c[0] not in completed]

    if args.force:
        for code, _, _ in targets:
            data = remove_country_data(data, code)
        save_data(data)
        print(f"[FORCE] Cleared data for {len(targets)} countries", flush=True)

    if not targets:
        print("[DONE] All countries already completed! Use --force to regenerate.", flush=True)
        if args.with_validation:
            all_issues = validate_all(data)
            report_path = generate_report(data, all_issues)
            print(f"Validation report: {report_path}", flush=True)
        return

    print(f"\n[PLAN] Will generate {len(targets)} countries: {[t[0] for t in targets]}", flush=True)
    print(f"[PLAN] Using {args.workers} parallel workers, model={MODEL}\n", flush=True)

    # Generate in batches
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        for i in range(0, len(targets), args.workers):
            batch = targets[i:i + args.workers]
            batch_num = i // args.workers + 1
            total_batches = (len(targets) + args.workers - 1) // args.workers
            print(f"=== Batch {batch_num}/{total_batches}: {[c[0] for c in batch]} ===", flush=True)

            futures = {executor.submit(generate_country, country): country for country in batch}

            for future in concurrent.futures.as_completed(futures):
                country = futures[future]
                try:
                    results = future.result()
                    if results:
                        data = remove_country_data(data, country[0])
                        data.extend(results)
                        save_data(data)
                        print(f"  [SAVED] {country[0]}: {len(results)}/5 chapters", flush=True)
                except Exception as e:
                    print(f"  [ERROR] {country[0]}: {e}", flush=True)

            time.sleep(1)

    completed = get_completed_countries(data)
    print(f"\n[DONE] Generation complete! {len(completed)} countries with full data.", flush=True)

    # Post-generation validation
    if args.with_validation:
        print("\n=== Running Post-Generation Validation ===", flush=True)
        all_issues = validate_all(data)
        report_path = generate_report(data, all_issues)
        total_issues = sum(len(v) for v in all_issues.values())
        print(f"Validation: {total_issues} issues found", flush=True)
        print(f"Report: {report_path}", flush=True)
        if all_issues:
            for code, issues in sorted(all_issues.items()):
                print(f"\n  {code}: {len(issues)} issues", flush=True)
                for issue in issues[:5]:
                    print(f"    - {issue}", flush=True)
                if len(issues) > 5:
                    print(f"    ... and {len(issues)-5} more", flush=True)


if __name__ == "__main__":
    main()
