# Portal UX Audit Notes

## Current Architecture

### Data Model
- `customers` table: has `primaryContactName`, `primaryContactEmail`, `primaryContactPhone` (denormalized)
- `customerContacts` table: has `role` (business role like "HR Director"), `isPrimary`, `hasPortalAccess`, `portalRole` (portal permission: admin/hr_manager/finance/viewer), `isPortalActive`, `passwordHash`, `inviteToken`

### Admin UI (Customers.tsx) - Contacts Tab
- Contact form fields: contactName, email, phone, **role** (dropdown: HR Manager, Finance Manager, CEO, COO, Legal, Other), isPrimary checkbox, hasPortalAccess checkbox
- Portal Status column shows: Active (green), Invited (amber), No Access
- Actions per contact:
  - Not invited: "Invite to Portal" button
  - Invited but not active: "Resend Invite" button
  - Active: "Reset Password" + "Revoke" buttons
  - Not primary: "Set Primary" button
  - Delete button
- **Invite Dialog**: only has portalRole selector (admin/hr_manager/finance/viewer), no way to edit portalRole after invite
- **No inline edit** for contact fields (name, email, phone, role)

### Access Client Portal (generatePortalToken)
- Takes `customerId` as input
- Finds first contact with `isPortalActive && hasPortalAccess`, or fallback to first with `hasPortalAccess`
- Generates 15-min JWT token with that contact's identity
- Opens portal in new tab via impersonation URL

### Problems Identified

#### Problem 2: Fragmented UX
1. `role` field in contacts = business title (HR Manager, CEO etc.) — easily confused with `portalRole` (portal permission)
2. `portalRole` can ONLY be set during invite generation, cannot be edited afterward
3. No inline editing for contacts at all — can't update name, email, phone, role after creation
4. Contact management and portal access management are mixed in the same table

#### Problem 3: Access Client Portal Logic
1. Picks first available portal contact — could be any contact, not necessarily the primary
2. Admin has no visibility into WHICH contact they'll impersonate before clicking
3. If multiple contacts have portal access, the selection is non-deterministic
