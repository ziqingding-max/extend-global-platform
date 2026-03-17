# Country Guide V2 - 任务交接文档

**版本**: 1.0
**日期**: 2026-03-10
**作者**: Manus AI

## 1. 任务背景与目标

根据用户需求，我们需要对现有的 Country Guide 功能进行全面升级。目标是抓取三家主要友商（GoGlobal, Papaya Global, Rippling）的 Country Guide 内容，生成我们自己的高质量、结构化的数据，并在 Client Portal 和 Admin 后台提供美观、流畅、功能完善的界面。

**核心目标**:
1.  **内容自动化生成**: 抓取并整合友商数据，使用 AI 大模型生成覆盖多个主题的详细国家指南。
2.  **Client Portal 体验升级**: 提供类似友商的、现代化的、内容丰富的国家指南浏览体验。
3.  **Admin 后台功能增强**: 为管理员提供强大的内容审阅、编辑、发布和管理功能。

## 2. 已完成工作

### 2.1. 代码实现

所有代码变更已提交至 GitHub 的 `feature/country-guide-v2` 分支。主要变更包括：

| 模块 | 文件路径 | 主要变更内容 |
| :--- | :--- | :--- |
| **后端 API** | `server/routers/countryGuideRouter.ts` | 增加了完整的 CRUD 操作，包括删除、状态更新、批量导入、统计等 API。 |
| | `server/portal/routers/portalToolkitRouter.ts` | 增加了 `listCountriesWithGuides` 接口，用于在 Portal 端展示有指南的国家列表。 |
| **Admin 后台** | `client/src/pages/admin/CountryGuideList.tsx` | 重写了国家列表页，增加了统计卡片、搜索功能，并按有无指南进行分组。 |
| | `client/src/pages/admin/CountryGuideEditor.tsx` | 重写了编辑器页，支持 Markdown 预览、章节状态管理、批量操作、按部分分组等。 |
| **Client Portal** | `client/src/pages/portal/CountryGuide.tsx` | 全新设计了展示页面，包括美观的 Markdown 渲染、侧边栏导航、滚动高亮、国家选择等。 |
| **i18n** | `client/src/lib/i18n.ts` | 为新界面添加了完整的中英文翻译。 |
| **依赖** | `package.json` / `pnpm-lock.yaml` | 添加了 `react-markdown`, `remark-gfm`, `rehype-raw` 用于 Markdown 渲染。 |

### 2.2. 内容生成

我们已成功生成了 **26 个国家** 的完整 Country Guide 内容，每个国家包含 5 个章节，共计 **130 个章节**。这些数据已保存为 `data/country_guide_data.json`。

-   **已完成国家 (26)**: AR, AU, BD, BR, CA, CL, CN, CO, HK, ID, IN, JP, KH, KR, LK, MX, MY, NZ, PE, PH, PK, SG, TH, TW, US, VN
-   **内容结构**: 每个国家包含以下5个章节：
    1.  **Country Overview** (国家概览)
    2.  **Hiring & Employment** (招聘与雇佣)
    3.  **Compensation & Taxes** (薪酬与税务)
    4.  **Working Conditions & Leave** (工作条件与假期)
    5.  **Termination & Compliance** (终止与合规)

## 3. 如何继续

### 3.1. 继续内容生成

仍有 **27 个国家** 的内容需要生成。可以运行以下脚本继续该过程。脚本支持断点续传，会自动跳过已完成的国家。

```bash
# 切换到项目根目录
cd /home/ubuntu/geaplatform_trae

# 运行并行生成脚本
nohup python3 -u server/scripts/generateCountryGuides.py > gen_parallel_log.txt 2>&1 &
```

-   **脚本路径**: `server/scripts/generateCountryGuides.py`
-   **剩余国家 (27)**: CR, GB, DE, FR, IT, ES, NL, SE, CH, IE, PL, BE, AT, PT, NO, DK, FI, CZ, RO, HU, GR, AE, SA, IL, TR, EG, NG, KE, ZA, GH

### 3.2. 数据导入数据库

所有内容生成完毕后，可以使用 `seedCountryGuides.ts` 脚本将 `data/country_guide_data.json` 文件中的数据导入到数据库中。该脚本支持更新现有数据。

```bash
# 切换到项目根目录
cd /home/ubuntu/geaplatform_trae

# 运行数据导入脚本
npx tsx server/scripts/seedCountryGuides.ts
```

### 3.3. 本地开发与测试

1.  **启动开发环境**: 运行 `pnpm dev` 启动本地开发服务器。
2.  **测试 Admin 后台**:
    -   访问 `/admin/knowledge/country-guides` 查看新的国家列表页面。
    -   点击任一国家进入编辑器页面，测试增、删、改、发布、预览等功能。
3.  **测试 Client Portal**:
    -   访问 `/portal/country-guide` 查看新的国家指南页面。
    -   切换不同国家，测试侧边栏导航、滚动高亮、内容渲染等。

### 3.4. 提交与部署

1.  **合并代码**: 将 `feature/country-guide-v2` 分支的代码合并到主分支。
2.  **部署**: 按照项目的标准部署流程进行部署。
3.  **数据库迁移**: 确保 `country_guide_chapters` 表结构与 `drizzle/schema.ts` 中的定义一致。由于我们没有修改表结构，理论上不需要迁移，但最好进行确认。

## 4. 附件

-   **代码分支**: `feature/country-guide-v2` (https://github.com/ziqingding-max/geaplatform_trae/tree/feature/country-guide-v2)
-   **生成数据**: `data/country_guide_data.json`
-   **生成脚本**: `server/scripts/generateCountryGuides.py`
-   **导入脚本**: `server/scripts/seedCountryGuides.ts`

---
**任务结束**--
