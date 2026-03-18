# Country Guide 内容规范 (Content Specification)

**版本**: 2.0
**最后更新**: 2026-03-10
**维护者**: GEA Platform Team

## 1. 概述

本文档定义了 Country Guide 内容的标准化规范。所有生成、编辑、导入的 Country Guide 内容必须严格遵循本规范，以确保跨国家、跨时间、跨 Task 的一致性。

## 2. 章节结构定义

每个国家的 Country Guide 由 **5 个标准章节** 组成，不多不少。每个章节的标识符（chapterKey）、标题、排序、内容结构均已固定。

| # | chapterKey | titleEn | titleZh | sortOrder | 最低英文字数 | 必需的 Markdown 元素 |
|---|-----------|---------|---------|-----------|------------|-------------------|
| 1 | `overview` | Country Overview | 国家概览 | 1 | 600 | H3 x 6+, Table x 2+ |
| 2 | `hiring` | Hiring & Employment | 招聘与雇佣 | 2 | 600 | H3 x 5+, Table x 1+ |
| 3 | `compensation` | Compensation & Taxes | 薪酬与税务 | 3 | 600 | H3 x 5+, Table x 2+ |
| 4 | `working-conditions` | Working Conditions & Leave | 工作条件与假期 | 4 | 600 | H3 x 5+, Table x 2+ |
| 5 | `termination` | Termination & Compliance | 终止与合规 | 5 | 600 | H3 x 4+, Table x 1+ |

## 3. 各章节内容模板

### 3.1 Chapter 1: Country Overview (`overview`)

**必须包含的 H3 子标题（按顺序）**：

```markdown
### Key Facts

| Attribute | Details |
|-----------|---------|
| Official Name | ... |
| Capital | ... |
| Population | ... |
| Official Language(s) | ... |
| Time Zone(s) | ... |
| Currency | ... (ISO code) |
| GDP (Nominal) | ... |
| GDP Per Capita | ... |

### Political System & Government

(2-3 段落描述政治体制、政府结构)

### Economic Overview

(2-3 段落描述经济状况、主要产业、增长趋势)

| Indicator | Value |
|-----------|-------|
| GDP Growth Rate | ... |
| Major Industries | ... |
| Unemployment Rate | ... |
| Ease of Doing Business Rank | ... |

### Business Culture & Etiquette

(2-3 段落描述商业文化、沟通风格、注意事项)

### Currency & Banking

(1-2 段落描述货币体系、银行系统、外汇管制)

### Key Facts for International Employers

(要点列表，5-8 条关键信息)
```

### 3.2 Chapter 2: Hiring & Employment (`hiring`)

**必须包含的 H3 子标题（按顺序）**：

```markdown
### Employment Contract Requirements

(描述书面/口头合同要求、必须条款)

| Contract Element | Requirement |
|-----------------|-------------|
| Written Contract | Required/Not Required |
| Language | ... |
| Mandatory Clauses | ... |

### Types of Employment Contracts

(固定期限、无固定期限、兼职等)

### Probation Period

| Aspect | Details |
|--------|---------|
| Maximum Duration | ... |
| Notice During Probation | ... |
| Termination During Probation | ... |

### Work Permits & Visa Requirements

(外国员工的工作许可和签证要求)

### Background Checks & Onboarding

(背景调查限制、入职必须的注册和手续)

### Anti-Discrimination Laws

(招聘中的反歧视法律要求)

### EOR Considerations

(使用 Employer of Record 的注意事项)
```

### 3.3 Chapter 3: Compensation & Taxes (`compensation`)

**必须包含的 H3 子标题（按顺序）**：

```markdown
### Minimum Wage

| Category | Rate | Effective Date |
|----------|------|---------------|
| National Minimum | ... | ... |
| (Regional variations if applicable) | ... | ... |

### Salary Structure & Payment

(薪资结构、发薪周期、支付方式)

### Mandatory Bonuses & Allowances

(13薪、法定奖金、强制津贴)

### Income Tax (Employee)

| Taxable Income Range | Tax Rate |
|---------------------|----------|
| ... | ...% |
| ... | ...% |

### Employer Tax Obligations

| Contribution Type | Employer Rate | Employee Rate |
|------------------|--------------|--------------|
| Social Security | ...% | ...% |
| Health Insurance | ...% | ...% |
| Pension | ...% | ...% |
| (Others) | ...% | ...% |
| **Total** | **...%** | **...%** |

### Tax Filing & Compliance

(申报截止日期、合规要求)
```

### 3.4 Chapter 4: Working Conditions & Leave (`working-conditions`)

**必须包含的 H3 子标题（按顺序）**：

```markdown
### Standard Working Hours

| Aspect | Details |
|--------|---------|
| Daily Maximum | ... hours |
| Weekly Maximum | ... hours |
| Rest Day | ... |

### Overtime Regulations

| Overtime Type | Compensation Rate |
|--------------|------------------|
| Weekday Overtime | ...% of regular pay |
| Weekend Work | ...% of regular pay |
| Public Holiday Work | ...% of regular pay |

### Annual Leave

| Tenure | Entitlement |
|--------|------------|
| 1st year | ... days |
| After X years | ... days |

### Public Holidays

| Holiday | Date (2026) |
|---------|------------|
| ... | ... |
(列出所有法定公共假日)

### Sick Leave

(病假天数、薪资比例、医疗证明要求)

### Maternity & Paternity Leave

| Leave Type | Duration | Pay |
|-----------|----------|-----|
| Maternity Leave | ... weeks | ...% of salary |
| Paternity Leave | ... days | ...% of salary |
| Parental Leave | ... | ... |

### Other Statutory Leave

(丧假、婚假、学习假等)
```

### 3.5 Chapter 5: Termination & Compliance (`termination`)

**必须包含的 H3 子标题（按顺序）**：

```markdown
### Grounds for Termination

(有因解雇、无因解雇、协商解除)

### Notice Period Requirements

| Employee Tenure | Employer Notice | Employee Notice |
|----------------|----------------|----------------|
| During Probation | ... | ... |
| < 1 year | ... | ... |
| 1-5 years | ... | ... |
| > 5 years | ... | ... |

### Severance Pay

(遣散费计算方式、适用条件)

| Tenure | Severance Entitlement |
|--------|----------------------|
| ... | ... |

### Unfair Dismissal Protections

(不当解雇保护、员工申诉途径)

### Data Protection & Privacy

(数据保护法律、GDPR 等效法规、员工数据处理要求)

### Workplace Safety & Unions

(工作场所安全法规、工会权利、集体谈判)

### Dispute Resolution

(劳动争议解决机制、仲裁、诉讼)
```

## 4. Markdown 格式规范

### 4.1 标题层级

- **不使用 H1 (`#`)**：章节标题由系统 UI 渲染，内容中不需要 H1
- **不使用 H2 (`##`)**：不要在内容开头放置 H2 级别的章节总标题
- **H3 (`###`)** 作为内容中的最高级标题，对应上述模板中的各个小节
- **H4 (`####`)** 用于 H3 下的子分类（可选）

### 4.2 表格

- 所有表格必须使用标准 Markdown pipe 格式
- 表头行和分隔行必须完整
- 数值类数据（税率、天数、金额）优先使用表格展示
- 表格中的数字必须具体，避免使用"varies"等模糊表述

### 4.3 列表

- 使用 `-` 作为无序列表标记（不使用 `*`）
- 有序列表使用 `1.` `2.` `3.` 格式
- 列表项之间不留空行

### 4.4 强调

- 使用 `**粗体**` 标注关键术语和数字
- 不使用斜体
- 不使用 emoji

### 4.5 内容风格

- 专业、客观、准确
- 使用第三人称
- 避免营销性语言
- 数据尽量引用具体年份
- 金额使用当地货币和 USD 对照（如适用）

## 5. 中文内容规范

### 5.1 翻译质量要求

- 中文内容必须是完整的专业翻译，不是摘要或缩写
- 中文字符数应为英文字符数的 **35%-55%**（正常的中英文比例）
- 所有表格必须完整翻译，包括表头
- 专有名词保留英文原文并附中文说明（如 "EOR（名义雇主）"）

### 5.2 中文格式

- 标题结构与英文完全一致
- 表格结构与英文完全一致
- 中文标点使用全角符号

## 6. 数据 JSON Schema

每条章节记录的 JSON 格式如下：

```json
{
  "countryCode": "string (ISO 3166-1 alpha-2, 大写, 如 'CN')",
  "part": "integer (1-5, 对应 sortOrder)",
  "chapterKey": "string (enum: overview|hiring|compensation|working-conditions|termination)",
  "titleEn": "string (固定值，见第2节表格)",
  "titleZh": "string (固定值，见第2节表格)",
  "contentEn": "string (Markdown, 遵循第3-4节规范)",
  "contentZh": "string (Markdown, 遵循第3、5节规范)",
  "sortOrder": "integer (1-5, 与 part 相同)",
  "version": "string (格式: YYYY-QN, 如 '2026-Q1')",
  "status": "string (enum: draft|published|archived, 新生成默认 'draft')"
}
```

## 7. 质量检查清单

每个国家的 Country Guide 生成后，必须通过以下自动化检查：

| # | 检查项 | 通过标准 |
|---|-------|---------|
| 1 | 章节完整性 | 恰好 5 个章节，chapterKey 完全匹配 |
| 2 | 英文字数 | 每章 >= 600 词 |
| 3 | 中文比例 | 每章 ZH/EN 字符比在 0.30-0.60 之间 |
| 4 | H3 标题数 | 每章 >= 4 个 H3 标题 |
| 5 | 表格数量 | overview >= 2, compensation >= 2, working-conditions >= 2, 其余 >= 1 |
| 6 | 无 H1/H2 | 内容中不包含 `# ` 或 `## ` 开头的行 |
| 7 | 必需 H3 | 每章包含规范中定义的所有必需 H3 标题 |
| 8 | 无空内容 | contentEn 和 contentZh 均非空 |
| 9 | JSON 合法 | 所有字段类型和值域正确 |
| 10 | 无重复 | 同一 countryCode 下无重复 chapterKey |

## 8. 国家列表

### 8.1 全量国家列表（53 个）

**亚太 (18)**:
CN, HK, SG, VN, JP, KR, AU, IN, TH, MY, ID, PH, TW, NZ, PK, BD, LK, KH

**美洲 (7)**:
US, CA, MX, BR, AR, CO, CL, PE, CR

**欧洲 (18)**:
GB, DE, FR, IT, ES, NL, SE, CH, IE, PL, BE, AT, PT, NO, DK, FI, CZ, RO, HU, GR

**中东非洲 (8)**:
AE, SA, IL, TR, EG, NG, KE, ZA, GH

### 8.2 当前完成状态

已完成（26）: AR, AU, BD, BR, CA, CL, CN, CO, HK, ID, IN, JP, KH, KR, LK, MX, MY, NZ, PE, PH, PK, SG, TH, TW, US, VN

待生成（27）: CR, GB, DE, FR, IT, ES, NL, SE, CH, IE, PL, BE, AT, PT, NO, DK, FI, CZ, RO, HU, GR, AE, SA, IL, TR, EG, NG, KE, ZA, GH

> **注意**: 已完成的 26 个国家中，CN/HK/JP/SG/VN 的数据是用旧版脚本生成的，格式不符合本规范（有额外的 `benefits` 章节、overview 缺少 H3 结构等），需要重新生成。
