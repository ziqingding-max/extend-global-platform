# Country Guide V2 - 后续 Task 指令文档

> 本文档用于发送给 Manus 的其他 Task，使其能够无缝继续 Country Guide 的开发工作。
> 请将本文档的全部内容作为 Prompt 发送给新的 Task。

---

## 给新 Task 的指令

你好，我需要你继续一个 Country Guide 功能的开发任务。前一个 Task 已经完成了大部分工作，代码已提交到 GitHub。请按照以下步骤操作：

### 第一步：克隆代码库并切换到工作分支

```bash
gh repo clone ziqingding-max/geaplatform_trae
cd geaplatform_trae
git checkout feature/country-guide-v2
```

**重要**：请先阅读 `docs/` 文件夹下的所有规范文档（特别是 `CONVENTIONS.md`、`PROJECT-INSTRUCTIONS.md`、`PRODUCT.md`），确保你的修改符合项目规范。

### 第二步：了解已完成的工作

前一个 Task 已经完成了以下工作：

**1. 后端 API 改造** (`server/routers/countryGuideRouter.ts`)
- 新增了 `deleteChapter`、`updateChapterStatus`、`bulkUpdateStatus`、`getCountryStats`、`bulkImport` 等 API 端点
- 支持完整的 CRUD 操作和批量管理

**2. Portal 后端 API** (`server/portal/routers/portalToolkitRouter.ts`)
- 新增了 `listCountriesWithGuides` 接口，返回有已发布指南的国家列表及章节数量

**3. Admin 后台页面** (`client/src/pages/admin/CountryGuideList.tsx` 和 `CountryGuideEditor.tsx`)
- 列表页：统计卡片、搜索过滤、按指南可用性分组
- 编辑器：Markdown 预览（react-markdown）、章节状态管理、批量发布/取消发布、删除确认

**4. Client Portal 页面** (`client/src/pages/portal/CountryGuide.tsx`)
- 参考 GoGlobal/Papaya Global/Rippling 三家友商设计
- 渐变色 Hero 区域、国家选择器带搜索、侧边栏导航、滚动高亮、Markdown 渲染、免责声明

**5. 内容生成** (`data/country_guide_data.json`)
- 已完成 26 个国家的内容生成（每国 5 章节，共 130 章节）
- 已完成国家：AR, AU, BD, BR, CA, CL, CN, CO, HK, ID, IN, JP, KH, KR, LK, MX, MY, NZ, PE, PH, PK, SG, TH, TW, US, VN

**6. i18n 翻译** (`client/src/lib/i18n.ts`)
- 已添加 portal country guide 相关的中英文翻译 key

**7. 依赖** (`package.json`)
- 已添加 `react-markdown`、`remark-gfm`、`rehype-raw`

### 第三步：你需要完成的工作

#### 任务 A：继续生成剩余 27 个国家的内容

剩余国家列表：CR, GB, DE, FR, IT, ES, NL, SE, CH, IE, PL, BE, AT, PT, NO, DK, FI, CZ, RO, HU, GR, AE, SA, IL, TR, EG, NG, KE, ZA, GH

生成脚本已经准备好，支持断点续传：

```bash
# 安装 openai 库（如果未安装）
sudo pip3 install openai

# 运行并行生成脚本（会自动跳过已完成的国家）
cd /home/ubuntu/geaplatform_trae
python3 -u server/scripts/generateCountryGuides.py
```

**生成脚本说明** (`server/scripts/generateCountryGuides.py`)：
- 使用 `gpt-4.1-mini` 模型通过 OpenAI 兼容 API 生成内容
- 每个国家生成 5 个章节（overview, hiring, compensation, working-conditions, termination）
- 每个章节包含中英文双语内容（Markdown 格式）
- 3 个并发线程同时处理 3 个国家
- 输出文件：`/home/ubuntu/country_guide_data.json`（与 `data/country_guide_data.json` 同步）
- 支持断点续传：自动检测已完成的国家并跳过

**JSON 数据格式**：
```json
{
  "countryCode": "GB",
  "part": 1,
  "chapterKey": "overview",
  "titleEn": "Country Overview",
  "titleZh": "国家概览",
  "contentEn": "## Country Overview\n\n...(Markdown content)...",
  "contentZh": "## 国家概览\n\n...(Markdown内容)...",
  "sortOrder": 1,
  "version": "2026-Q1",
  "status": "published"
}
```

生成完成后，将最新的 JSON 复制到项目目录：
```bash
cp /home/ubuntu/country_guide_data.json /home/ubuntu/geaplatform_trae/data/country_guide_data.json
```

#### 任务 B：将数据导入数据库

数据库导入脚本已准备好 (`server/scripts/seedCountryGuides.ts`)。该脚本会：
- 读取 `data/country_guide_data.json`
- 对每条记录执行 upsert（按 countryCode + chapterKey 匹配）
- 支持更新已有数据

```bash
cd /home/ubuntu/geaplatform_trae
npx tsx server/scripts/seedCountryGuides.ts
```

**数据库表结构** (`countryGuideChapters` 表，定义在 `drizzle/schema.ts`)：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| countryCode | varchar(10) | 国家代码（如 CN, US） |
| part | integer | 章节编号（1-6） |
| chapterKey | varchar(100) | 章节标识（如 overview, hiring） |
| titleEn | text | 英文标题 |
| titleZh | text | 中文标题 |
| contentEn | text | 英文内容（Markdown） |
| contentZh | text | 中文内容（Markdown） |
| sortOrder | integer | 排序顺序 |
| version | varchar(20) | 版本号 |
| status | varchar(20) | 状态（published/draft/archived） |
| createdAt | timestamp | 创建时间 |
| updatedAt | timestamp | 更新时间 |

#### 任务 C：测试与验证

1. 启动开发环境：`pnpm dev`
2. 测试 Admin 后台：访问 `/admin/knowledge/country-guides`
3. 测试 Client Portal：访问 `/portal/country-guide`
4. 验证以下功能：
   - Admin 列表页的统计数据是否正确
   - Admin 编辑器的 Markdown 预览是否正常
   - Admin 批量发布/取消发布功能
   - Portal 国家选择和内容展示
   - Portal 侧边栏导航和滚动高亮
   - 中英文切换是否正常

#### 任务 D：提交代码

```bash
cd /home/ubuntu/geaplatform_trae
git add -A
git commit -m "feat(country-guide): add remaining country content and fixes"
git push origin feature/country-guide-v2
```

### 第四步：关键文件索引

| 文件路径 | 用途 |
|---------|------|
| `server/routers/countryGuideRouter.ts` | Admin 端 Country Guide API |
| `server/portal/routers/portalToolkitRouter.ts` | Portal 端 Country Guide API |
| `client/src/pages/admin/CountryGuideList.tsx` | Admin 国家列表页 |
| `client/src/pages/admin/CountryGuideEditor.tsx` | Admin 编辑器页 |
| `client/src/pages/portal/CountryGuide.tsx` | Portal 展示页 |
| `client/src/lib/i18n.ts` | 中英文翻译 |
| `drizzle/schema.ts` | 数据库表定义（搜索 `countryGuideChapters`） |
| `drizzle/relations.ts` | 数据库关系定义 |
| `data/country_guide_data.json` | 生成的内容数据 |
| `server/scripts/generateCountryGuides.py` | 内容生成脚本 |
| `server/scripts/seedCountryGuides.ts` | 数据库导入脚本 |

### 第五步：注意事项

1. **项目规范**：所有修改必须遵循 `docs/CONVENTIONS.md` 中的规范，包括：
   - TypeScript 严格模式
   - 使用 Drizzle ORM 操作数据库
   - 使用 tRPC 定义 API
   - 使用 shadcn/ui 组件库
   - 使用 Tailwind CSS 样式

2. **内容质量**：生成的内容应该是专业、准确、详尽的。中文内容的长度通常是英文的 30%-50%（因为中文表达更简洁）。

3. **数据库连接**：导入脚本需要正确的数据库连接配置。请确保 `.env` 文件中有正确的 `DATABASE_URL`。

4. **友商参考**：
   - GoGlobal: https://goglobal.com/country/hire-in-algeria/
   - Papaya Global: https://www.papayaglobal.com/countrypedia/
   - Rippling: https://www.rippling.com/country-hiring

---

**GitHub 分支**: `feature/country-guide-v2`
**仓库**: `ziqingding-max/geaplatform_trae`
