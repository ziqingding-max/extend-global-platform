# Knowledge Base 功能分析与解决方案

**版本**: 2.0
**日期**: 2026-03-12

## 一、问题诊断：为什么 Knowledge Base 不可用

### 1.1 根本原因：knowledge_items 表为空

Client Portal 的 Knowledge Base 页面 (`PortalKnowledgeBase.tsx`) 从 `knowledge_items` 表中查询 `status = 'published'` 的记录。经检查，该表以及关联的 `knowledge_sources` 表均为空，因此 Portal 端无法展示任何内容。

| 数据库表 | 记录数 | 状态 |
|---------|--------|------|
| `knowledge_items` | 0 | **致命**：无任何文章可供展示 |
| `knowledge_sources` | 0 | **致命**：无任何外部数据源配置 |
| `knowledge_feedback_events` | 0 | 正常，功能未上线无用户反馈 |

### 1.2 外部数据源抓取机制完全失效

当前的实现逻辑依赖于 `knowledgeBaseAdminRouter.ts` 中的 `ingestSourceNow` -> `pullFromSource` 函数，该函数通过 HTTP GET 请求从 `knowledge_sources` 表中配置的 URL 抓取原始内容。此机制存在以下致命缺陷：

| 环节 | 问题 | 严重程度 |
|------|------|----------|
| **数据源不可达** | 预设的 RSS/Web 源（littler.com, fragomen.com, shrm.org 等）返回 404/403 | 致命 |
| **pullFromSource 函数** | 简单 fetch + HTML 解析，无 RSS/XML 解析器，无 User-Agent，无重试机制 | 高 |
| **AI 处理链** | `knowledgeAiService.ts` 依赖 DashScope API（需要 `DASHSCOPE_API_KEY`），即使 AI 可用也需要先有原始内容 | 高 |
| **无定时任务** | `cronJobs.ts` 中没有任何 knowledge 相关的定时抓取任务 | 中 |
| **knowledge_sources 表为空** | 没有配置任何数据源，即使流程正常也无法触发抓取 | 致命 |

### 1.3 系统内已有丰富数据未被利用

系统内已经拥有大量高质量的结构化数据，完全可以用来生成 Knowledge Base 文章：

| 数据类型 | 数据量 | 来源 |
|---------|--------|------|
| **Country Guide** | 630 章节，126 国家 | `country_guide_chapters` 表（生产环境已有数据）/ `country_guide_data.json`（开发环境回退） |
| **社会保险规则** | 473 条规则，125 国家 | `country_social_insurance_items` 表 |
| **法定节假日** | 1312 条记录，97 国家 | `public_holidays` 表 |
| **假期类型** | 767 条记录，125 国家 | `leave_types` 表 |
| **国家配置** | 125 个国家（124 活跃） | `countries_config` 表 |

> **关于 Country Guide 数据**：`country_guide_chapters` 表在生产环境中已有完整数据（通过 `generateCountryGuides.py` 生成 JSON，再由 `seedCountryGuides.ts` 导入 DB）。Portal 和 Admin 端均从此表读取数据。本地开发环境中该表可能为空，生成服务会自动回退到 `data/country_guide_data.json` 文件。

---

## 二、解决方案：基于内部数据生成 Knowledge Base 文章

### 2.1 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    数据源层（系统内部）                        │
│                                                             │
│  country_guide_chapters  ←→  country_guide_data.json (回退)  │
│  country_social_insurance_items                              │
│  public_holidays                                             │
│  leave_types                                                 │
│  countries_config                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           knowledgeInternalGeneratorService.ts               │
│                                                             │
│  按国家遍历，生成 8 种类型的中英双语文章：                      │
│  1. Country Overview    5. Working Conditions                │
│  2. Hiring Guide        6. Social Insurance                  │
│  3. Compensation Guide  7. Public Holidays                   │
│  4. Termination Guide   8. Leave Entitlements                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 knowledge_items 表                           │
│  status: "published"                                        │
│  topic: payroll | compliance | leave | onboarding | general  │
│  language: en | zh                                          │
│  category: guide | article                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Client Portal Knowledge Base                    │
│              (PortalKnowledgeBase.tsx)                       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 文章类型与 Topic 映射

| 文章类型 | 数据来源 | Topic | Category |
|---------|---------|-------|----------|
| Country Overview | country_guide_chapters (overview) | general | guide |
| Hiring Guide | country_guide_chapters (hiring) | onboarding | guide |
| Compensation Guide | country_guide_chapters (compensation) | payroll | guide |
| Termination Guide | country_guide_chapters (termination) | compliance | guide |
| Working Conditions | country_guide_chapters (working-conditions) | leave | guide |
| Social Insurance | country_social_insurance_items | payroll | article |
| Public Holidays | public_holidays | leave | article |
| Leave Entitlements | leave_types + countries_config | leave | article |

---

## 三、代码变更清单

### 3.1 新增文件

| 文件 | 说明 |
|------|------|
| `server/services/knowledgeInternalGeneratorService.ts` | 核心生成服务，828 行，包含 8 种文章生成器和主函数 |
| `server/scripts/seedKnowledgeFromInternalData.ts` | 独立 seed 脚本，支持 `--dry-run` 和 `--countries=XX,YY` 参数 |

### 3.2 修改文件

| 文件 | 变更说明 |
|------|----------|
| `server/routers/knowledgeBaseAdmin.ts` | 新增 `generateFromInternalData` API 端点（adminProcedure） |
| `client/src/pages/KnowledgeBaseAdmin.tsx` | 新增"从内部数据生成"Tab，包含类型选择、国家筛选、预览/生成按钮、结果展示 |
| `client/src/lib/i18n.ts` | 新增 24 个中英文翻译键（`knowledge_admin.generate.*` 和 `knowledge_admin.tabs.generate`） |
| `package.json` | 新增 `seed:knowledge` 脚本命令 |

---

## 四、使用方式

### 4.1 通过 Admin UI（推荐）

1. 登录 Admin 后台，进入 **Knowledge Admin** 页面
2. 默认打开的就是 **"从内部数据生成"** Tab
3. 选择要生成的文章类型（默认全选 8 种）
4. 可选：输入特定国家代码（如 `AU, SG, US`），留空则生成所有国家
5. 点击 **"预览（不写入）"** 查看将生成的文章数量
6. 确认后点击 **"生成并发布文章"**
7. 生成完成后会显示详细的结果报告

### 4.2 通过命令行

```bash
# 生成所有国家的所有类型文章
pnpm seed:knowledge

# 预览模式（不写入数据库）
pnpm seed:knowledge -- --dry-run

# 只生成指定国家
pnpm seed:knowledge -- --countries=AU,SG,VN,CN
```

### 4.3 预期输出量

以 125 个活跃国家为例，每个国家最多生成 8 种类型 x 2 种语言 = 16 篇文章，理论最大值约 **2000 篇**。实际数量取决于各国数据的完整程度。

---

## 五、建议的后续优化

1. **建立自动化更新机制**：在 `cronJobs.ts` 中配置定时任务，定期运行 `generateKnowledgeFromInternalData`，确保 Knowledge Base 内容与系统数据保持同步。
2. **增量更新**：当前方案为全量生成，后续可增加增量更新逻辑（检查已有文章，只更新有变化的内容），避免重复插入。
3. **弃用旧代码**：在确认新机制稳定运行后，可以逐步移除旧的 `pullFromSource` 相关代码。
