# AOR Fix Working Notes

## Files to Modify

### 1. PortalSelfOnboarding.tsx (Worker self-fill)
- Line 153: Remove `s.id !== 4` from activeSteps filter (keep bank details, still skip documents for AOR)
- Line 333: Change `STEPS.map` to `activeSteps.map` for step indicator (bug: shows 4 steps even for AOR)
- Line 357: Change `STEPS.length` to `activeSteps.length` for connector
- Line 563: Remove `!isAorInvite` condition from step 4 bank details rendering
- Line 596: Add bank details validation for step 3 (which is now bank details for AOR, since docs is skipped)
- AOR labels: "provided by employer" → "provided by client", employer_prefilled_notice → client variant
- Step 2 title for AOR: "Employment" → "Engagement" (or use i18n key)
- Country label for AOR: "Country/Region" → "Onboarding Country/Region"

### 2. PortalOnboarding.tsx (Client portal)
#### Employer-Fill Flow:
- Line 114: Add step 5 "Bank Details" to EMPLOYER_FILL_STEPS_AOR
- Line 1300: Update renderCurrentStep case 5 for AOR to render bank details
- Line 466-481: Add bankDetails to submitAorMutation call
- Line 1265-1268: Update canProceedStep case 5 for AOR bank details validation
- renderPersonalInfo: For AOR, add address fields (currently hidden with !isAor)
- renderEmployment: Change "Employment Country/Region" label to "Onboarding Country/Region" for AOR
- renderBankDetails: Change "employee's bank account" to "contractor's bank account" for AOR, use contractorCurrency

#### Invite Flow:
- Line 122: Change INVITE_STEPS step 2 title from "Employer Info" to dynamic (AOR: "Client Info")
- renderInviteEmployerInfo: Change labels for AOR context
- renderInviteSend: Change "Employer Info" to "Client Info" for AOR

### 3. portalContractorsRouter.ts (Backend)
- Line 147-169: Add bankDetails to submitOnboarding input schema and insert
- Accept bankDetails as z.any().optional() or z.string().optional()

### 4. portalEmployeesRouter.ts (Backend)
- Line 739-753: AOR self-onboarding - add bankDetails to createContractor call
- Line 433-445: AOR invite email check should also check contractors table, not just employees

### 5. i18n.ts
- Add new AOR-specific i18n keys for:
  - "Onboarding Country/Region" (EN + ZH)
  - "Client Info" step title (EN + ZH)
  - "provided by client" (EN + ZH)
  - "Some fields have been pre-filled by your client" (EN + ZH)
  - "Engagement" step title for self-onboarding (EN + ZH)

### 6. ContractorCreateDialog.tsx (Admin)
- Already has bankDetails - looks complete
- Missing: phone, dateOfBirth, nationality, idType, idNumber, address, city, state, postalCode, endDate, gender
- Need to add these fields to match the other entry points

## Bug Analysis: AOR Invite Not Displaying
The code logic for filtering and rendering looks correct:
- listOnboardingInvites returns all invites (no serviceType filter)
- activeInvites filters only completed/cancelled (keeps pending+expired)
- filteredItems maps all activeInvites
- Rendering iterates filteredItems and shows AOR badge

Possible root cause: The sendOnboardingInvite checks employees table for email conflicts (line 434-445), but for AOR it should check contractors table. If an AOR worker email exists in employees table, it would block. But more importantly, the invite IS being created (the count shows "2 awaiting response, 1 expired"), so the issue is in rendering, not creation.

Wait - re-reading the user's report: "页面提示2 awaiting response 1 expired，但是实际上不显示AOR的worker邀请情况" - the counts show but the cards don't render. This is very strange since the rendering code iterates filteredItems which includes all active invites.

Actually, looking more carefully: the AOR invite IS being sent and counted, but the user says it doesn't display. The rendering code looks correct. Let me check if there's a conditional rendering issue or if the invite list section is hidden when in wizard mode.
