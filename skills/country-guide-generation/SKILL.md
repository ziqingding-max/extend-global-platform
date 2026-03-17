# Skill: Country Guide Generation

**版本**: 1.0
**维护者**: GEA Platform Team

## 1. 技能目标

本 Skill 的目标是指导 Manus Task **持续、稳定、高质量**地生成和维护 Country Guide 内容。所有执行本 Skill 的 Task 必须严格遵循以下流程和规范。

## 2. 核心原则

- **规范优先**: 所有操作必须以 `docs/COUNTRY_GUIDE_SPEC.md` 为唯一标准。
- **工具驱动**: 必须使用 `server/scripts/generateCountryGuides.py` 脚本进行生成和验证。
- **质量可控**: 任何生成的内容都必须通过脚本的验证，不接受任何带有"FAIL"状态的交付。
- **可追溯性**: 所有变更必须通过 Git 提交，所有验证结果必须生成报告并存档。

## 3. 标准操作流程 (SOP)

### 步骤 1: 环境准备与同步

1.  **克隆仓库**: `$ git clone ziqingding-max/geaplatform_trae`
2.  **切换分支**: `$ cd geaplatform_trae && git checkout main && git pull origin main`
3.  **安装依赖**: `$ sudo pip3 install openai`

### 步骤 2: 检查当前状态

1.  **运行验证**: `$ python3 -u server/scripts/generateCountryGuides.py --validate-only`
2.  **分析报告**: 查看 `data/reports/` 目录下最新的验证报告，了解当前哪些国家已完成、哪些失败、哪些待生成。

### 步骤 3: 内容生成

1.  **重新生成失败的国家**: 如果验证报告中有失败的国家，必须优先重新生成它们。
    - **命令**: `$ python3 -u server/scripts/generateCountryGuides.py --countries CN,JP,BD --force --with-validation`
    - **说明**: 使用 `--force` 会覆盖旧数据，`--with-validation` 会在生成后自动运行验证。

2.  **生成剩余的国家**: 确认所有已有数据都通过验证后，开始生成未完成的国家。
    - **命令**: `$ python3 -u server/scripts/generateCountryGuides.py --with-validation`
    - **说明**: 脚本会自动找出所有未完成的国家并分批生成。

### 步骤 4: 最终验证与交付

1.  **运行最终验证**: 确保所有国家都已生成完毕后，再次运行最终验证。
    - **命令**: `$ python3 -u server/scripts/generateCountryGuides.py --validate-only`

2.  **确认通过**: 打开最新的验证报告，确认 **Passed** 列表包含所有 53 个国家，**Failed** 列表为 `None`，**Total Issues** 为 `0`。

3.  **提交变更**: 确认所有内容都符合规范后，将以下文件提交到 Git。
    - `data/country_guide_data.json`
    - `data/reports/` 目录下的所有新报告
    - **Commit Message**: `feat(content): update country guides for [COUNTRY_CODES]`

4.  **推送分支**: `$ git push origin main`

## 4. 关键工具说明

### `generateCountryGuides.py`

这是本 Skill 的核心工具，封装了所有生成和验证逻辑。

**常用参数**:

- `--countries <CODES>`: 指定要操作的国家，逗号分隔 (e.g., `GB,DE,FR`)。
- `--force`: 强制重新生成，会删除指定国家的旧数据。
- `--validate-only`: 只运行验证，不生成内容。用于检查现有数据质量。
- `--with-validation`: 在生成任务结束后，自动运行一次完整的验证。
- `--workers <N>`: 设置并行生成的线程数（默认为3）。

## 5. 常见问题 (FAQ)

- **Q: 生成过程很慢怎么办？**
  - A: 这是正常的。脚本默认使用 3 个并行线程。你可以根据沙箱性能适当增加 `--workers` 数量，但不建议超过 5。

- **Q: 生成中断了怎么办？**
  - A: 直接重新运行 `$ python3 -u server/scripts/generateCountryGuides.py` 即可。脚本支持断点续传，会自动跳过已完成的国家。

- **Q: 验证报告中出现大量问题怎么办？**
  - A: 仔细阅读报告中的问题描述。如果是 Prompt 问题，需要修改脚本中的 Prompt 模板；如果是数据问题，需要使用 `--force` 重新生成相关国家。

- **Q: 我可以手动修改 `country_guide_data.json` 吗？**
  - A: **绝对禁止**。任何手动修改都可能破坏数据一致性。所有内容变更必须通过脚本生成。
