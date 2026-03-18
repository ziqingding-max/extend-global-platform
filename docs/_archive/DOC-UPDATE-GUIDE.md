# Document Update Guide

> **Purpose**: Ensure the AI Agent knowledge base stays synchronized with the codebase. Every significant code change must trigger corresponding documentation updates.

---

## 1. When to Update Documents

The following changes **require** documentation updates. This is a blocking requirement — the checkpoint cannot be saved until the relevant documents are updated.

| Change Type | Documents to Update |
|:---|:---|
| New database table or column | `AGENTS.md` (Section 8), `docs/ARCHITECTURE.md` (Section 3), `docs/data-dictionary.md` |
| New tRPC router | `AGENTS.md` (Key File Map), `docs/ARCHITECTURE.md` (Section 2) |
| New cron job | `AGENTS.md` (Section 7), `docs/ARCHITECTURE.md` (Section 5) |
| New status enum or state transition | `docs/BUSINESS-RULES.md` (relevant state machine) |
| New role or permission change | `docs/rbac-matrix.md`, `docs/ARCHITECTURE.md` (Section 4) |
| New business calculation or formula | `docs/BUSINESS-RULES.md` (relevant section) |
| New coding pattern or convention | `docs/CONVENTIONS.md` (relevant section) |
| New sidebar navigation item | `AGENTS.md` (Key File Map) |
| Bug fix with root cause lesson | `docs/CONVENTIONS.md` (Anti-patterns section) |
| New feature module | `docs/PRODUCT.md`, `CHANGELOG.md` |
| Test pattern change | `docs/TESTING.md` |

---

## 2. Version Tracking

Each document includes a version header. When updating a document, increment the version and update the date:

```markdown
> Version: 3.6 | Last Updated: 2026-03-05
```

The version follows `MAJOR.MINOR` format where MAJOR increments for structural changes (new sections, reorganization) and MINOR increments for content updates within existing sections.

---

## 3. CHANGELOG.md Update Rules

Every checkpoint that introduces user-visible changes must add an entry to `CHANGELOG.md`. Follow the Keep a Changelog format:

```markdown
## [v3.3] - 2026-02-28

### Added
- New feature description

### Changed
- Modified behavior description

### Fixed
- Bug fix description
```

Group entries under `Added`, `Changed`, `Fixed`, `Removed`, or `Security` as appropriate.

---

## 4. Skill Reference Sync

When updating any of these project documents, the corresponding file in the `gea-eor-knowledge` Skill's `references/` directory must also be updated:

| Project File | Skill Reference |
|:---|:---|
| `AGENTS.md` | `/home/ubuntu/skills/gea-eor-knowledge/references/AGENTS.md` |
| `docs/ARCHITECTURE.md` | `/home/ubuntu/skills/gea-eor-knowledge/references/ARCHITECTURE.md` |
| `docs/CONVENTIONS.md` | `/home/ubuntu/skills/gea-eor-knowledge/references/CONVENTIONS.md` |
| `docs/BUSINESS-RULES.md` | `/home/ubuntu/skills/gea-eor-knowledge/references/BUSINESS-RULES.md` |
| `docs/TESTING.md` | `/home/ubuntu/skills/gea-eor-knowledge/references/TESTING.md` |

After updating a project document, copy it to the Skill directory:

```bash
cp /home/ubuntu/geaplatform_trae/AGENTS.md /home/ubuntu/skills/gea-eor-knowledge/references/AGENTS.md
cp /home/ubuntu/geaplatform_trae/docs/<FILE>.md /home/ubuntu/skills/gea-eor-knowledge/references/<FILE>.md
```

---

## 5. Pre-Checkpoint Documentation Checklist

Before saving a checkpoint, verify:

1. **CHANGELOG.md** — Updated if any user-visible changes were made
2. **todo.md** — All completed items marked `[x]`, new items added for any follow-up work
3. **Relevant docs** — Updated per the table in Section 1
4. **Skill references** — Synced per Section 4 if any reference docs changed
5. **Version headers** — Incremented in any updated documents

---

## 6. Document Quality Standards

When updating documents, maintain these standards:

**Accuracy**: Every statement must reflect the current codebase. If a document says "48 tables" and a new table was added, update it to "49 tables."

**Completeness**: New features must appear in all relevant documents. A new invoice status must appear in BUSINESS-RULES.md (state machine), ARCHITECTURE.md (data model), and AGENTS.md (if it affects critical rules).

**Conciseness**: Documents are consumed by AI Agents with limited context windows. Every sentence must justify its token cost. Prefer tables over prose for structured information. Prefer code examples over lengthy explanations.

**Consistency**: Use the same terminology across all documents. If the schema calls it `payrollRun`, don't call it "payroll batch" in the docs.
