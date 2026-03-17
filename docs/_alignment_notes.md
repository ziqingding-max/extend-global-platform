# Contractor Termination Flow - Alignment Analysis

## Current State (BEFORE changes)

### Admin Backend (`server/routers/contractors.ts`)
- `contractors.terminate`: Takes only `{ id }`, hardcodes `endDate = today`, no reason field
- `contractors.update`: Takes `{ id, data: { status, endDate, ... } }`, can set status to "terminated" directly, no reason

### Admin Frontend (`client/src/pages/ContractorDetail.tsx`)
- Uses `contractorTransitions` map: active → "Terminate" button
- Clicking "Terminate" calls `statusUpdateMutation.mutate({ id, data: { status: "terminated" } })` via `contractors.update`
- Uses browser `confirm()` dialog — no endDate or reason input
- The dedicated `contractors.terminate` endpoint is NOT used by the frontend at all!

### Portal Backend (`server/portal/routers/portalContractorsRouter.ts`)
- No termination endpoint exists

### Portal Frontend (`client/src/pages/portal/PortalContractorDetail.tsx`)
- No termination button exists
- Only has delete button for `pending_review` contractors

### DB Schema (`drizzle/aor-schema.ts`)
- `contractors` table: has `endDate`, `notes`, `status` fields
- No `terminationReason` column
- Status enum: `pending_review`, `active`, `terminated` (no offboarding)

## Gaps Identified
1. Admin frontend uses `contractors.update` not `contractors.terminate` — the terminate endpoint is dead code
2. No dialog for endDate/reason on admin terminate
3. No portal termination request at all
4. No terminationReason column in DB — we can use `notes` or audit log `changes` field

## Solution: Aligned Flow

### Option A: Use `notes` field for reason (no schema migration)
- Store reason in the audit log `changes` JSON field
- Display reason from audit log when needed

### Option B: Add `terminationReason` + `terminationDate` columns (requires migration)

### Recommendation: Option A (no migration needed)
- Store termination reason in audit log changes: `{ reason: "...", endDate: "..." }`
- Both admin and portal flows will record the same data structure
