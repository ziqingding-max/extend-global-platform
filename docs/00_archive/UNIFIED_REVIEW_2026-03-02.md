# Unified Review & Execution Plan (2026-03-02)

## 1) What has been consolidated in this round

### A. Knowledge Base + AI baseline (already merged in prior steps)
- Unified Portal entry for Knowledge Base (replacing split Help/Compliance entry points).
- Admin review flow for source ingestion and publishing.
- AI-assisted source authority scoring + content draft generation.

### B. AI decoupling (this round)
- Added provider/task policy architecture:
  - `ai_provider_configs`
  - `ai_task_policies`
- Added gateway routing service (`aiGatewayService`) to pick provider by task with fallback.
- Migrated key callers to task-based routing:
  - Knowledge Base AI summary/authority
  - Vendor bill parsing route
- Added admin page and router for runtime AI policy management.

### C. Security hardening (this round)
- Added security headers middleware via Helmet.
- Added login rate-limiting for admin login and portal login.
- Updated admin bootstrap seeding policy to avoid hardcoded production password while preserving non-production convenience.

## 2) Recommendation for non-technical owner (you)

### Must-do operational actions
1. Set production bootstrap env vars (once):
   - `ADMIN_BOOTSTRAP_EMAIL`
   - `ADMIN_BOOTSTRAP_PASSWORD`
2. Rotate bootstrap admin password after first successful login.
3. Fill AI provider configs in `/ai-settings`:
   - provider base URL
   - API key env names
   - model and task policy mapping
4. Validate first source ingestion in Knowledge Base Admin and publish manually.

### Why we no longer rely on hardcoded production admin password
- Hardcoded password is the highest-impact account takeover risk.
- New approach preserves your convenience in dev/non-production while requiring explicit password setup for production.

## 3) Scope boundaries (agent behavior contract)
- No direct production data mutation via browser test flows.
- No test-data creation in shared DB unless cleanup policy is verified.
- Every release should run:
  - Type check
  - Test suite
  - Security smoke checks

## 4) Route-2 / Route-3 rollout status from prior audit
- Route-2 (security foundation): partially implemented in code
  - Helmet ✅
  - Login rate limit ✅
  - CSRF hardening: deferred to next phase
- Route-3 (stability/architecture): in-progress
  - AI decoupling gateway ✅
  - task-level provider controls ✅
  - full i18n completion: audited, pending full remediation batch

## 5) Next recommended implementation wave
1. Add explicit CSRF token validation for state-changing endpoints.
2. Introduce provider health checks and execution logs in `/ai-settings`.
3. Complete full i18n replacement of hardcoded strings page-by-page.
4. Add regression tests for AI routing policy and fallback behavior.
