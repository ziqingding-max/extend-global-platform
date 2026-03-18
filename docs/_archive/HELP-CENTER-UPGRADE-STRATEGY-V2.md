# Client Portal Knowledge Hub — 自动化内容策略 v2.0

> **版本**: 2.0
> **日期**: 2026-02-28
> **作者**: Manus AI
> **核心理念**: 以用户为中心，将静态帮助中心升级为与系统 Apple Liquid Glass 设计语言深度融合的动态"知识中心"，并构建可扩展的邮件营销基础设施。

---

## 1. 设计哲学：从"帮助中心"到"知识中心"

### 1.1. 问题的本质

v1.0 策略解决了"如何自动更新内容"的技术问题，但一个更根本的问题是：**用户为什么要来帮助中心？** 答案不是"查找操作步骤"，而是"在正确的时间，获得与自己业务直接相关的信息"。

这意味着一个优秀的知识中心必须做到三点：**主动发现**（用户不用刻意搜索，有价值的内容会出现在他们的视野里）、**高度相关**（内容与用户所在国家、业务类型、当前关注点高度匹配）、**无缝融合**（内容呈现方式与整个 Portal 的视觉和交互体验一致，没有割裂感）。

### 1.2. 核心设计决策

基于对代码库的深度分析，本策略做出以下关键设计决策：

**决策一：废弃 Tab 布局，拥抱卡片式网格。** 当前的 Tab 式布局（操作指引 / FAQ / 更新日志）将内容强制分割，用户必须主动切换才能探索不同类型的内容。新的卡片网格布局与 `PortalDashboard.tsx` 中的 `glass-stat-card` 风格完全一致，让用户一眼即可扫描所有内容分类，体验更接近"杂志封面"而非"文件夹"。

**决策二：Dashboard 内嵌"最新洞察"时间轴，而非横幅通知。** 横幅通知（Alert Banner）是一种打断式的 UI 模式，会造成视觉干扰。更优雅的方式是将新内容作为 Dashboard 信息流的自然组成部分，采用与"最近活动 (Recent Activity)"完全相同的时间轴组件风格，让用户在查看业务动态的同时，自然地发现行业洞察。

**决策三：邮件推送不是"通知"，而是"营销"。** 邮件推送的目标不仅是告知用户"有新内容"，更是建立 GEA 作为全球雇佣领域权威信息源的品牌认知。因此，邮件基础设施应从一开始就按照**营销邮件**的标准设计，包含完整的活动管理、发送日志和退订机制。

---

## 2. 内容框架

### 2.1. 五大内容板块

知识中心的内容扩展为五个板块，覆盖"系统使用"和"行业知识"两大维度。

| 板块 | Slug | 图标颜色 | 内容定位 | 数据来源 | 更新频率 |
|:---|:---|:---|:---|:---|:---|
| **操作指引** | `guides` | 蓝色 `blue` | 系统各功能模块的操作步骤与最佳实践 | 手动编写 (Markdown) | 功能发布时 |
| **常见问题** | `faq` | 紫色 `purple` | 客户高频问题的标准化解答 | 手动编写 (Markdown) | 按需 |
| **产品更新** | `changelog` | 绿色 `green` | 系统版本更新记录，自动同步 `CHANGELOG.md` | 自动解析 | 每次部署后 |
| **全球合规动态** | `compliance-updates` | 橙色 `amber` | 全球主要国家劳动法、税务、签证政策最新变化 | 外部 RSS / API + LLM | 每日 |
| **市场洞察** | `market-insights` | 青色 `teal` | 全球雇佣、远程工作、薪酬福利行业报告与趋势 | 外部 RSS / API + LLM | 每周 |

### 2.2. 外部数据源规划

以下数据源经过筛选，均为全球雇佣领域的权威机构，内容质量高且提供公开 RSS Feed。

**P0 优先级（每日抓取）**

| 数据源 | 机构类型 | RSS Feed URL | 内容特点 |
|:---|:---|:---|:---|
| Littler Mendelson | 全球劳动法律所 | `https://www.littler.com/publication-press/publication/feed` | 覆盖 40+ 国家劳动法变化，权威性最高 |
| Fragomen | 全球移民法律所 | `https://www.fragomen.com/insights/rss.xml` | 专注签证、工作许可、移民政策 |
| SHRM | 全球最大 HR 协会 | `https://www.shrm.org/rss/pages/rss.aspx?feed=news` | 人力资源管理新闻与研究 |

**P1 优先级（每周抓取）**

| 数据源 | 机构类型 | RSS Feed URL | 内容特点 |
|:---|:---|:---|:---|
| Papaya Global Blog | EOR 行业同行 | `https://papayaglobal.com/blog/feed/` | 全球薪酬、EOR 行业洞察 |
| Remote.com Blog | 远程工作平台 | `https://remote.com/blog/rss.xml` | 远程工作、全球雇佣趋势 |
| Deel Blog | EOR 行业同行 | `https://www.deel.com/blog/rss.xml` | 全球雇佣、合规最佳实践 |
| ILO (国际劳工组织) | 联合国机构 | `https://www.ilo.org/global/about-the-ilo/newsroom/news/lang--en/rss.xml` | 全球劳工标准和政策 |

---

## 3. 数据库架构 (v2.0)

### 3.1. `help_categories` 表

```typescript
// drizzle/schema.ts 新增
export const helpCategories = mysqlTable(
  "help_categories",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 50 }).notNull().unique(),
    nameEn: varchar("name_en", { length: 100 }).notNull(),
    nameCn: varchar("name_cn", { length: 100 }).notNull(),
    descriptionEn: text("description_en"),
    descriptionCn: text("description_cn"),
    iconColor: varchar("icon_color", { length: 30 }).default("blue"), // 卡片图标颜色
    displayOrder: int("display_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    hcSlugIdx: uniqueIndex("hc_slug_idx").on(table.slug),
  })
);
```

### 3.2. `help_articles` 表 (v2.0 优化版)

相比 v1.0，新增了 `countryCode`、`tags`、`summaryEn/Cn`、`coverImageUrl` 字段，并移除了 `isPushed`（由 `email_logs` 替代）。

```typescript
// drizzle/schema.ts 新增
export const helpArticles = mysqlTable(
  "help_articles",
  {
    id: int("id").autoincrement().primaryKey(),
    categoryId: int("category_id").notNull(),
    titleEn: varchar("title_en", { length: 255 }).notNull(),
    titleCn: varchar("title_cn", { length: 255 }),
    summaryEn: text("summary_en"),      // 英文摘要（≤250字），用于卡片预览和邮件
    summaryCn: text("summary_cn"),      // 中文摘要，由 LLM 翻译生成
    contentEn: text("content_en").notNull(), // 英文全文 (Markdown)
    contentCn: text("content_cn"),           // 中文全文 (Markdown)，由 LLM 翻译生成
    countryCode: varchar("country_code", { length: 3 }), // 关联国家，用于个性化筛选
    tags: json("tags"),                 // 标签数组，如 ["payroll", "visa", "remote-work"]
    source: varchar("source", { length: 100 }),
    sourceUrl: varchar("source_url", { length: 512 }).unique(), // 用于去重
    coverImageUrl: varchar("cover_image_url", { length: 512 }), // 封面图 URL（可选）
    publishedAt: timestamp("published_at").defaultNow().notNull(),
    isFeatured: boolean("is_featured").default(false).notNull(), // 运营置顶
    isPublished: boolean("is_published").default(true).notNull(),
    viewCount: int("view_count").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    haArticleCategoryIdIdx: index("ha_article_category_id_idx").on(table.categoryId),
    haArticlePublishedAtIdx: index("ha_article_published_at_idx").on(table.publishedAt),
    haArticleCountryCodeIdx: index("ha_article_country_code_idx").on(table.countryCode),
    haArticleSourceUrlIdx: uniqueIndex("ha_article_source_url_idx").on(table.sourceUrl),
  })
);
```

### 3.3. `notification_preferences` 表 (新增)

存储用户的订阅偏好，支持个性化内容推送。

```typescript
// drizzle/schema.ts 新增
export const notificationPreferences = mysqlTable(
  "notification_preferences",
  {
    id: int("id").autoincrement().primaryKey(),
    contactId: int("contact_id").notNull().unique(), // 关联 customer_contacts.id
    // 订阅内容分类（默认全部开启）
    subComplianceUpdates: boolean("sub_compliance_updates").default(true).notNull(),
    subMarketInsights: boolean("sub_market_insights").default(true).notNull(),
    subProductUpdates: boolean("sub_product_updates").default(true).notNull(),
    // 订阅渠道
    viaEmail: boolean("via_email").default(true).notNull(),
    viaInApp: boolean("via_in_app").default(true).notNull(),
    // 邮件频率偏好
    emailFrequency: mysqlEnum("email_frequency", ["weekly", "biweekly", "monthly", "never"])
      .default("weekly").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    npContactIdIdx: uniqueIndex("np_contact_id_idx").on(table.contactId),
  })
);
```

### 3.4. `email_campaigns` 表 (新增)

管理邮件活动，为未来的邮件营销提供完整的活动追踪能力。

```typescript
// drizzle/schema.ts 新增
export const emailCampaigns = mysqlTable(
  "email_campaigns",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),    // 例: "2026-W10 Global Compliance Digest"
    subject: varchar("subject", { length: 255 }).notNull(),
    templateName: varchar("template_name", { length: 100 }).notNull(), // 对应邮件模板文件名
    campaignType: mysqlEnum("campaign_type", [
      "weekly_digest",     // 每周知识摘要
      "compliance_alert",  // 重大合规变化即时提醒
      "product_update",    // 产品更新通知
      "onboarding",        // 新用户引导邮件
      "manual",            // 手动创建的营销邮件
    ]).notNull(),
    status: mysqlEnum("status", ["draft", "scheduled", "sending", "sent", "failed"])
      .default("draft").notNull(),
    scheduledAt: timestamp("scheduled_at"),
    sentAt: timestamp("sent_at"),
    recipientCount: int("recipient_count").default(0),
    sentCount: int("sent_count").default(0),
    openCount: int("open_count").default(0),
    clickCount: int("click_count").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);
```

### 3.5. `email_logs` 表 (新增)

记录每封邮件的发送状态，支持追踪和重试。

```typescript
// drizzle/schema.ts 新增
export const emailLogs = mysqlTable(
  "email_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaign_id").notNull(),
    contactId: int("contact_id").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    status: mysqlEnum("status", [
      "pending", "sent", "delivered", "opened", "clicked", "bounced", "unsubscribed"
    ]).default("pending").notNull(),
    sentAt: timestamp("sent_at"),
    providerMessageId: varchar("provider_message_id", { length: 255 }), // Resend 返回的 Message ID
    errorMessage: text("error_message"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    elCampaignIdIdx: index("el_campaign_id_idx").on(table.campaignId),
    elContactIdIdx: index("el_contact_id_idx").on(table.contactId),
    elStatusIdx: index("el_status_idx").on(table.status),
  })
);
```

---

## 4. 自动化内容聚合引擎

### 4.1. `helpContentService.ts` 核心逻辑

```typescript
// server/services/helpContentService.ts
/**
 * Help Content Service
 *
 * 1. fetchAndStoreExternalContent() — RSS 抓取 + LLM 处理 + 入库
 * 2. syncChangelogToHelpCenter()    — 解析 CHANGELOG.md + 入库
 * 3. processArticleWithLLM()        — 摘要生成 + 双语翻译
 * 4. extractCountryAndTags()        — 从文章内容提取国家代码和标签
 */

// RSS 数据源配置
const RSS_SOURCES = [
  // P0: 每日抓取
  { url: "https://www.littler.com/publication-press/publication/feed",
    name: "Littler Mendelson", category: "compliance-updates", priority: 0 },
  { url: "https://www.fragomen.com/insights/rss.xml",
    name: "Fragomen", category: "compliance-updates", priority: 0 },
  { url: "https://www.shrm.org/rss/pages/rss.aspx?feed=news",
    name: "SHRM", category: "market-insights", priority: 0 },
  // P1: 每周抓取
  { url: "https://papayaglobal.com/blog/feed/",
    name: "Papaya Global", category: "market-insights", priority: 1 },
  { url: "https://remote.com/blog/rss.xml",
    name: "Remote.com", category: "market-insights", priority: 1 },
  { url: "https://www.deel.com/blog/rss.xml",
    name: "Deel", category: "market-insights", priority: 1 },
];

// LLM Prompt — 摘要 + 翻译 + 国家/标签提取
const PROCESSING_PROMPT = `
You are a professional content editor for GEA, a global Employer of Record (EOR) company.
Given the article below, respond in JSON with:
{
  "summaryEn": "Concise 2-3 sentence summary in English (max 200 words), focusing on implications for global employers",
  "titleCn": "Translated title in Simplified Chinese",
  "summaryCn": "Translated summary in Simplified Chinese",
  "countryCode": "ISO 3166-1 alpha-2 code if article is country-specific (e.g. 'SG'), or null",
  "tags": ["array", "of", "relevant", "tags", "from: payroll, visa, labor-law, remote-work, benefits, tax, hiring, termination, compliance"]
}
Article Title: {title}
Article Content: {content}
`;
```

### 4.2. 内容处理流水线

```
RSS Feed → XML 解析 → 去重检查(sourceUrl) → 关键词过滤 → LLM 处理
    ↓                                                           ↓
  跳过                                              摘要 + 翻译 + 标签 + 国家
                                                               ↓
                                                        写入 help_articles
```

关键词过滤列表（用于剔除不相关文章）：

```typescript
const RELEVANT_KEYWORDS = [
  "employment", "labor", "labour", "payroll", "salary", "wage",
  "visa", "work permit", "immigration", "compliance", "regulation",
  "EOR", "employer of record", "remote work", "hiring", "termination",
  "benefits", "social security", "tax", "HR", "human resources"
];
```

---

## 5. 定时任务调度策略

### 5.1. 完整 Cron Job 时间表（含新增任务）

| 执行时间 (北京时间) | 任务名称 | Cron 表达式 | 说明 |
|:---|:---|:---|:---|
| 每日 00:01 | 员工自动激活 | `1 0 * * *` | 现有任务 |
| 每日 00:02 | 假期状态转换 | `2 0 * * *` | 现有任务 |
| 每日 00:03 | 逾期发票检测 | `3 0 * * *` | 现有任务 |
| 每日 00:05 | 汇率自动抓取 | `5 0 * * *` | 现有任务 |
| **每日 02:00** | **合规动态抓取 (P0)** | `0 2 * * *` | **新增：抓取 P0 RSS + LLM 处理入库** |
| 每月 1 日 00:10 | 假期余额累计 | `10 0 1 * *` | 现有任务 |
| 每月 5 日 00:00 | 数据自动锁定 | `0 0 5 * *` | 现有任务 |
| 每月 5 日 00:01 | 薪酬单自动创建 | `1 0 5 * *` | 现有任务 |
| **每周一 03:00** | **市场洞察抓取 (P1)** | `0 3 * * 1` | **新增：抓取 P1 RSS + LLM 处理入库** |
| **每周二 10:00** | **知识摘要邮件发送** | `0 10 * * 2` | **新增：发送 Weekly Knowledge Digest 邮件** |

### 5.2. 容灾与限流策略

每次 Cron Job 运行遵循以下约束，防止 LLM 调用成本失控：

- **每次最多处理 15 篇**新文章（通过 `MAX_ARTICLES_PER_RUN = 15` 常量控制）。
- **LLM 输入截断**：超过 2000 字的文章内容截断后再传入 LLM。
- **LLM 降级**：若 LLM 调用失败，直接存储原始英文内容，`summaryCn` / `contentCn` 留空，不阻塞入库。
- **单源失败不影响整体**：每个 RSS Feed 独立 `try/catch`，一个 Feed 失败不影响其他 Feed。
- **请求超时**：每个 RSS 请求使用 `AbortSignal.timeout(15000)`（15 秒超时）。

---

## 6. 前端 UI/UX 实现方案

### 6.1. 页面结构：`PortalKnowledgeHub.tsx`

新页面将完全替换 `PortalHelpCenter.tsx`，采用以下布局结构：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Knowledge Hub                                                              │
│  全球雇佣洞察 · 操作指引 · 产品更新                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  [🔍 搜索...]  [分类 ▼]  [国家/地区 ▼]  [标签 ▼]                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  📌 精选文章 (glass-card, 宽版)                                      │   │
│  │  "新加坡 2026 年就业法修订：雇主必知的 5 项关键变化"                  │   │
│  │  来源: Littler Mendelson · 2026-02-27 · 🇸🇬 新加坡 · #labor-law    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ 🟠 全球合规动态       │  │ 🔵 操作指引           │  │ 🟢 产品更新      │  │
│  │ (glass-card)         │  │ (glass-card)          │  │ (glass-card)     │  │
│  │ 3 篇最新文章摘要...   │  │ 7 个功能模块指引...   │  │ v2.5.0 更新...   │  │
│  │ [查看全部 →]          │  │ [查看全部 →]          │  │ [查看全部 →]     │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────┘  │
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐                        │
│  │ 🟡 市场洞察           │  │ 🟣 常见问题           │                        │
│  │ (glass-card)         │  │ (glass-card)          │                        │
│  │ 本周 EOR 行业动态...  │  │ 8 个高频问题...       │                        │
│  │ [查看全部 →]          │  │ [查看全部 →]          │                        │
│  └──────────────────────┘  └──────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2. 分类卡片的 Glass 风格实现

每个分类卡片使用 `glass-card` 样式，并通过 `iconColor` 字段实现差异化的颜色主题：

```tsx
// 颜色映射，与 PortalDashboard.tsx 中的 accent 系统保持一致
const categoryColors: Record<string, { icon: string; badge: string; border: string }> = {
  "compliance-updates": {
    icon: "bg-amber-500/15 text-amber-600",
    badge: "bg-amber-100 text-amber-700",
    border: "hover:border-amber-200/60",
  },
  "market-insights": {
    icon: "bg-teal-500/15 text-teal-600",
    badge: "bg-teal-100 text-teal-700",
    border: "hover:border-teal-200/60",
  },
  "guides": {
    icon: "bg-blue-500/15 text-blue-600",
    badge: "bg-blue-100 text-blue-700",
    border: "hover:border-blue-200/60",
  },
  "changelog": {
    icon: "bg-emerald-500/15 text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700",
    border: "hover:border-emerald-200/60",
  },
  "faq": {
    icon: "bg-purple-500/15 text-purple-600",
    badge: "bg-purple-100 text-purple-700",
    border: "hover:border-purple-200/60",
  },
};
```

### 6.3. Dashboard"最新洞察"组件

在 `PortalDashboard.tsx` 中，紧接"最近活动 (Recent Activity)"组件之后，新增"最新洞察 (Latest Insights)"组件。两个组件使用完全相同的 `glass-card p-6` 容器和时间轴条目风格，视觉上高度统一。

```tsx
// 组件示意（风格与 RecentActivityCard 完全一致）
function LatestInsightsCard() {
  const { data: articles, isLoading } = portalTrpc.helpCenter.latestInsights.useQuery();

  const categoryColors: Record<string, string> = {
    "compliance-updates": "bg-amber-500/10 text-amber-600",
    "market-insights": "bg-teal-500/10 text-teal-600",
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-base font-semibold">Latest Insights</h3>
        <Link href={portalPath("/knowledge")} className="ml-auto text-xs text-primary hover:underline">
          View all →
        </Link>
      </div>
      {/* 时间轴条目，风格与 RecentActivityCard 完全一致 */}
      <div className="space-y-1">
        {articles?.slice(0, 5).map((article) => (
          <Link key={article.id} href={portalPath(`/knowledge/${article.id}`)}>
            <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/40 transition-colors duration-200 cursor-pointer">
              <div className={cn("p-1.5 rounded-lg flex-shrink-0", categoryColors[article.categorySlug])}>
                <Globe className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{article.titleEn}</p>
                <p className="text-xs text-muted-foreground">
                  {article.source} · {formatDate(article.publishedAt)}
                </p>
              </div>
              {article.countryCode && (
                <span className="text-sm flex-shrink-0">{countryFlag(article.countryCode)}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

### 6.4. 通知偏好设置

在 `PortalSettings.tsx` 的"设置"页面新增"通知偏好 (Notification Preferences)"板块，允许用户管理：

- **订阅内容**：勾选/取消勾选"全球合规动态"、"市场洞察"、"产品更新"。
- **接收渠道**：选择"站内通知"和/或"邮件推送"。
- **邮件频率**：选择"每周"、"每两周"、"每月"或"不接收"。

---

## 7. 邮件推送架构

### 7.1. 技术选型

**邮件发送服务**：[**Resend**](https://resend.com)（`resend` npm 包）。理由：API 设计简洁，对 React Email 原生支持，免费额度（3,000 封/月）足够初期使用，且在国内网络环境下可达性良好。

**邮件模板引擎**：[**React Email**](https://react.email)（`@react-email/components` npm 包）。理由：允许使用 React 组件构建响应式邮件，与现有技术栈完全一致，模板可复用。

### 7.2. `emailService.ts` 服务层

```typescript
// server/services/emailService.ts
/**
 * Email Service — 统一邮件发送出口
 *
 * 封装 Resend API，提供：
 * 1. sendEmail()          — 发送单封邮件
 * 2. sendBulkEmails()     — 批量发送（带速率限制）
 * 3. sendWeeklyDigest()   — 发送每周知识摘要
 * 4. sendComplianceAlert() — 发送重大合规变化即时提醒
 *
 * 所有发送操作均记录到 email_logs 表。
 * 所有邮件包含退订链接（符合 CAN-SPAM / GDPR 要求）。
 */

import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(payload: {
  to: string;
  subject: string;
  react: React.ReactElement;
  campaignId?: number;
  contactId?: number;
}): Promise<{ success: boolean; messageId?: string }> {
  // 1. 调用 Resend API 发送邮件
  // 2. 更新 email_logs 状态
  // 3. 返回结果
}

export async function sendWeeklyDigest(
  articles: HelpArticle[],
  recipients: Array<{ email: string; contactId: number; name: string; lang: "en" | "cn" }>
): Promise<{ sent: number; failed: number }> {
  // 1. 创建 email_campaigns 记录
  // 2. 渲染 WeeklyDigestEmail React 模板
  // 3. 批量发送（每批 50 封，间隔 1 秒）
  // 4. 记录所有发送结果到 email_logs
}
```

### 7.3. 邮件模板设计

**Weekly Knowledge Digest 模板**（`server/email-templates/weekly-digest.tsx`）：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [GEA Logo]                                    [app.extendglobal.ai]              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Hi [Name],                                                                 │
│                                                                             │
│  本周全球雇佣动态摘要 / This Week in Global Employment                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🟠 全球合规动态 / Compliance Updates                               │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  📌 新加坡 2026 年就业法修订：雇主必知的 5 项关键变化               │   │
│  │     来源: Littler Mendelson · 2026-02-27                           │   │
│  │     [摘要内容 2-3 句话...]                                          │   │
│  │     [阅读全文 →]                                                    │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  📄 日本 2026 年最低工资调整通知                                    │   │
│  │     [阅读全文 →]                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🔵 市场洞察 / Market Insights                                      │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  📄 2026 年全球远程工作薪酬报告：亚太区增长最快                     │   │
│  │     [阅读全文 →]                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [前往知识中心查看更多 →]                                                    │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  © 2026 GEA Global Employment Advisors                                      │
│  [退订] · [管理邮件偏好] · [隐私政策]                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.4. 退订与合规机制

所有营销邮件必须包含以下合规元素：

- **退订链接**：每封邮件底部包含一键退订链接，点击后自动将 `notification_preferences.viaEmail` 设为 `false`，且 `emailFrequency` 设为 `"never"`。
- **退订处理路由**：新增 `GET /api/portal/unsubscribe?token=<JWT>` 路由，处理退订请求。
- **发件人标识**：使用 `noreply@updates.extendglobal.ai` 作为发件人地址，需在 Resend 中完成域名验证。
- **物理地址**：邮件底部包含 GEA 公司物理地址（符合 CAN-SPAM 要求）。

---

## 8. 后端 tRPC 路由设计

### 8.1. `portalHelpCenterRouter.ts`

```typescript
// server/portal/routers/portalHelpCenterRouter.ts
export const portalHelpCenterRouter = portalRouter({
  // ── 公开过程（无需登录）──
  listCategories: portalPublicProcedure
    .query(async () => { /* 返回所有活跃分类 */ }),

  // ── 受保护过程（需要登录）──
  listArticles: protectedPortalProcedure
    .input(z.object({
      categorySlug: z.string().optional(),
      countryCode: z.string().optional(),
      tags: z.array(z.string()).optional(),
      search: z.string().optional(),
      featuredOnly: z.boolean().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input }) => { /* 返回文章列表 + 分页信息 */ }),

  getArticle: protectedPortalProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      // 返回文章详情，同时 viewCount + 1
    }),

  // Dashboard 最新洞察（最新 5 篇合规/洞察文章）
  latestInsights: protectedPortalProcedure
    .query(async () => { /* 返回最新 5 篇 compliance-updates + market-insights */ }),

  // 通知偏好
  getNotificationPreferences: protectedPortalProcedure
    .query(async ({ ctx }) => { /* 返回当前用户的偏好设置 */ }),

  updateNotificationPreferences: protectedPortalProcedure
    .input(z.object({
      subComplianceUpdates: z.boolean().optional(),
      subMarketInsights: z.boolean().optional(),
      subProductUpdates: z.boolean().optional(),
      viaEmail: z.boolean().optional(),
      viaInApp: z.boolean().optional(),
      emailFrequency: z.enum(["weekly", "biweekly", "monthly", "never"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => { /* 更新偏好设置 */ }),
});
```

---

## 9. 实施路线图

### 第一阶段：数据库与后端基础（预计 3-4 小时）

1. 在 `drizzle/schema.ts` 中新增 5 张表（`help_categories`, `help_articles`, `notification_preferences`, `email_campaigns`, `email_logs`），执行 `pnpm db:push`。
2. 插入初始 5 个分类的 Seed 数据，并将 `PortalHelpCenter.tsx` 中的现有静态内容迁移到数据库。
3. 在 `server/db.ts` 中添加所有相关 CRUD 辅助函数。
4. 创建 `server/portal/routers/portalHelpCenterRouter.ts` 并实现所有 tRPC 过程。
5. 在 `server/portal/portalRouter.ts` 中注册 `helpCenter` 路由。

### 第二阶段：自动化内容引擎（预计 3-4 小时）

1. 安装 `fast-xml-parser` 依赖（用于 RSS 解析）。
2. 创建 `server/services/helpContentService.ts`，实现 RSS 抓取、LLM 处理、`CHANGELOG.md` 解析和数据库写入。
3. 在 `server/cronJobs.ts` 中新增 3 个定时任务（合规动态抓取、市场洞察抓取、邮件发送）。
4. 在服务器启动时调用 `syncChangelogToHelpCenter()`。

### 第三阶段：前端 UI/UX 重塑（预计 3-4 小时）

1. 创建 `client/src/pages/portal/PortalKnowledgeHub.tsx`，实现卡片式网格布局、精选文章区域和筛选功能。
2. 创建文章详情页 `PortalKnowledgeArticle.tsx`。
3. 在 `PortalDashboard.tsx` 中新增"最新洞察"时间轴组件。
4. 在 `PortalSettings.tsx` 中新增"通知偏好"设置板块。
5. 更新 `App.tsx` 路由和 `PortalLayout.tsx` 侧边栏导航。
6. 在 `client/src/lib/i18n.ts` 中添加所有新增 UI 文本的中英文翻译键。

### 第四阶段：邮件推送实现（预计 2-3 小时）

1. 安装 `resend` 和 `@react-email/components` 依赖。
2. 配置 `RESEND_API_KEY` 环境变量，完成 `updates.extendglobal.ai` 域名验证。
3. 创建 `server/services/emailService.ts` 服务层。
4. 创建 `server/email-templates/weekly-digest.tsx` 邮件模板（含双语支持）。
5. 实现退订路由 `GET /api/portal/unsubscribe`。
6. 编写 Vitest 测试，覆盖所有新增 tRPC 过程（使用 `TestCleanup` 清理测试数据）。

---

## 10. 注意事项

### 10.1. 遵循项目规范

所有代码变更必须严格遵循以下规范（见 `AGENTS.md`）：

- **双语翻译**：所有新增 UI 文本必须在 `client/src/lib/i18n.ts` 中添加中英文翻译键，使用 `t("key")` 调用，不得硬编码。
- **Vitest 测试**：所有新增 tRPC 过程必须有对应的测试，并使用 `TestCleanup` 清理测试数据，`afterAll` 必须包含 `cleanup.run()`。
- **Portal 数据隔离**：`help_articles` 和 `help_categories` 是全局共享内容，使用 `portalPublicProcedure` 或 `protectedPortalProcedure` 均可，无需按 `customerId` 过滤。`notification_preferences` 必须按 `contactId` 隔离。
- **不修改 `server/_core/`**：所有新增服务文件放在 `server/services/` 目录下，邮件模板放在 `server/email-templates/` 目录下。

### 10.2. 免责声明

自动抓取的外部内容仅作为参考信息展示，建议在"全球合规动态"和"市场洞察"板块顶部添加以下免责声明：

> "以下内容由系统自动聚合自公开资讯源，仅供参考，不构成法律或税务建议。如需专业咨询，请联系您的 GEA 客户经理。"

### 10.3. 邮件发送成本估算

以 GEA 当前规模（约 31 个客户，每个客户平均 2 个门户用户）估算，每周邮件发送量约 62 封，远低于 Resend 免费额度（3,000 封/月）。随着客户规模增长，可按需升级到付费计划。


---

## 11. 内容治理与审查发布工作流 (Content Governance & Review Workflow)

为确保所有自动化聚合的内容在发布前都经过人工审核，保障内容质量与品牌声誉，v2.0 策略引入一套完整的后台内容治理与审查发布工作流。

### 11.1. 内容状态机 (Content Status State Machine)

`help_articles` 表将新增一个 `status` 字段，用于管理文章的生命周期。所有自动化生成的内容默认状态为 `draft`。

| 状态 (Status) | 描述 | 触发条件 | 可见范围 |
|:---|:---|:---|:---|
| `draft` | **草稿** | 内容由 Cron Job 自动生成并入库 | 仅限 Admin 后台 |
| `pending_review` | **待审查** | Admin 用户手动点击"提交审查" | 仅限 Admin 后台 |
| `published` | **已发布** | 内容审查员点击"批准并发布" | Client Portal (公开) |
| `archived` | **已归档** | 内容审查员手动归档已发布的文章 | 仅限 Admin 后台 |
| `rejected` | **已拒绝** | 内容审查员拒绝发布的草稿 | 仅限 Admin 后台 |

### 11.2. 数据库架构扩展

为支持审查工作流，`help_articles` 表需进一步扩展：

```typescript
// drizzle/schema.ts -> help_articles 表新增字段
export const helpArticles = mysqlTable(
  "help_articles",
  {
    // ... (所有 v2.0 字段)
    status: mysqlEnum("status", [
      "draft",
      "pending_review",
      "published",
      "archived",
      "rejected",
    ]).default("draft").notNull(),
    reviewedBy: int("reviewed_by"), // 关联 users.id
    reviewedAt: timestamp("reviewed_at"),
    reviewNotes: text("review_notes"), // 存储拒绝原因或修改建议
  },
  (table) => ({
    // ... (所有 v2.0 索引)
    haStatusIdx: index("ha_status_idx").on(table.status),
  })
);
```

### 11.3. Admin 后台"内容管理"模块

将在 Admin 后台新增一个名为"**内容管理 (Content Management)**"的独立页面 (`/content-management`)，作为内容审查的核心枢纽。

**页面 UI 布局:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Content Management                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  [待审查 (12)] [已发布 (150)] [草稿 (8)] [已归档 (20)] [已拒绝 (5)]       │
├─────────────────────────────────────────────────────────────────────────────┤
│  [🔍 搜索文章标题...] [分类 ▼] [国家 ▼] [来源 ▼]                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  📄 文章列表 (Table)                                                 │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  [ ] 标题                  分类             状态         国家  来源  │   │
│  │  [ ] "日本最低工资调整"    合规动态         [待审查]     🇯🇵    SHRM  │   │
│  │  [ ] "远程工作薪酬报告"    市场洞察         [草稿]         -     Deel  │   │
│  │  ...                                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**核心交互:**

1.  **主视图**: 采用与 `Adjustments.tsx` 类似的**表格 (Table) + 筛选器**布局。顶部是按状态分类的**标签页 (Tabs)**，用于快速切换视图。
2.  **审查操作**: 点击任意一篇文章行，会从右侧滑出一个**侧边抽屉 (Sheet)**，用于内容预览和编辑。
3.  **侧边抽屉 (Review Sheet)**: 该抽屉是审查工作流的核心，包含：
    *   **预览模式**: 完美复刻 Client Portal 的文章详情页样式，让审查员看到最终用户将看到的完全一致的预览。
    *   **编辑模式**: 提供表单，允许审查员修改**标题 (中/英)**、**摘要 (中/英)**、**分类**、**国家代码**、**标签**和**封面图 URL**。
    *   **操作按钮**: 抽屉底部包含"**批准并发布 (Approve & Publish)**"、"**拒绝 (Reject)**"和"**保存修改 (Save Changes)**"按钮。
    *   **审计日志**: 显示该文章的所有历史操作记录（创建、修改、状态变更）。

### 11.4. 审查工作流 tRPC 路由 (`adminContentRouter.ts`)

在 `server/routers/` 目录下创建 `adminContentRouter.ts`，包含以下专用于 Admin 后台的 procedure：

```typescript
// server/routers/adminContentRouter.ts
export const adminContentRouter = router({
  // 获取文章列表（带分页和筛选）
  listArticles: operationsManagerProcedure
    .input(/* Zod schema for filters */)
    .query(async ({ input }) => { /* ... */ }),

  // 获取单篇文章用于审查（包含所有字段）
  getArticleForReview: operationsManagerProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => { /* ... */ }),

  // 更新文章内容（保存草稿）
  updateArticle: operationsManagerProcedure
    .input(/* Zod schema for editable fields */)
    .mutation(async ({ ctx, input }) => {
      // 更新数据库
      // 记录审计日志: logAuditAction({ action: "update", entityType: "help_article" ... })
    }),

  // 批准并发布
  approveAndPublishArticle: operationsManagerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // 更新 status 为 "published", reviewedBy, reviewedAt
      // 记录审计日志: logAuditAction({ action: "approve", entityType: "help_article" ... })
    }),

  // 拒绝文章
  rejectArticle: operationsManagerProcedure
    .input(z.object({ id: z.number(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // 更新 status 为 "rejected", reviewNotes, reviewedBy, reviewedAt
      // 记录审计日志: logAuditAction({ action: "reject", entityType: "help_article" ... })
    }),

  // 归档已发布的文章
  archiveArticle: operationsManagerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // 更新 status 为 "archived"
      // 记录审计日志: logAuditAction({ action: "archive", entityType: "help_article" ... })
    }),
});
```

### 11.5. 通知机制

-   **站内通知**: 当 Cron Job 生成新的 `draft` 文章后，可以调用 `notifyOwner` 函数，向指定的 Admin 用户（如内容运营角色）发送站内通知，提醒有新的内容待审查。
-   **通知内容**: "[Knowledge Hub] 有 N 篇新的内容草稿已生成，请前往内容管理后台进行审查。"

通过这套机制，所有自动化内容都将经过严格的内部审查流程，确保了发布到 Client Portal 的信息质量，同时所有操作都有完整的审计记录，实现了企业级的内容治理。
