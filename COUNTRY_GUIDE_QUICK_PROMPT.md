# Country Guide - 快速继续 Prompt

> 直接复制以下内容发送给新的 Manus Task 即可。

---

请帮我继续一个 Country Guide 功能的开发任务。GitHub 仓库是 `ziqingding-max/geaplatform_trae`，工作分支是 `feature/country-guide-v2`。

**请先执行以下操作：**
1. 克隆仓库并切换到 `feature/country-guide-v2` 分支
2. 阅读 `docs/` 文件夹下的所有规范文档

**背景说明：**
前一个 Task 已经完成了 Country Guide 功能的全面升级，包括：
- 后端 API 改造（`server/routers/countryGuideRouter.ts` 和 `server/portal/routers/portalToolkitRouter.ts`）
- Admin 后台页面重写（列表页 + 编辑器，支持 Markdown 预览、状态管理、批量操作）
- Client Portal 展示页面重写（参考 GoGlobal/Papaya/Rippling 设计，美观的 Markdown 渲染、侧边栏导航）
- 已生成 26 个国家的内容（每国 5 章节，数据在 `data/country_guide_data.json`）

**你需要完成的工作：**

1. **继续生成剩余 27 个国家的内容**：运行 `python3 -u server/scripts/generateCountryGuides.py`（需要先 `sudo pip3 install openai`）。剩余国家：CR, GB, DE, FR, IT, ES, NL, SE, CH, IE, PL, BE, AT, PT, NO, DK, FI, CZ, RO, HU, GR, AE, SA, IL, TR, EG, NG, KE, ZA, GH。生成完成后将 `/home/ubuntu/country_guide_data.json` 复制到 `data/country_guide_data.json`。

2. **将数据导入数据库**：运行 `npx tsx server/scripts/seedCountryGuides.ts`。

3. **测试验证**：启动 `pnpm dev`，测试 Admin 后台（`/admin/knowledge/country-guides`）和 Client Portal（`/portal/country-guide`）的功能是否正常。

4. **提交代码**：将所有变更提交到 `feature/country-guide-v2` 分支并推送。

**关键文件索引请参考** `COUNTRY_GUIDE_CONTINUATION_PROMPT.md`（在仓库根目录）。
