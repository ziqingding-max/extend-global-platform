# i18n P0 Batch A Report (2026-03-03)

## Scope
- `client/src/pages/portal/PortalLogin.tsx`
- `client/src/pages/portal/PortalRegister.tsx`
- `client/src/pages/portal/PortalForgotPassword.tsx`
- `client/src/pages/portal/PortalResetPassword.tsx`

## Result
- Portal Auth 四页用户可见文案已接入 i18n key（`t(...)`），本批未发现新增硬编码用户文案。
- 本批用于确认 P0 起始面可视文案已收口，后续批次继续推进高体量页面（Invoices / Employees / Customers / PortalOnboarding / VendorBills）。

## Verification commands
- `rg -n "Login failed|Forgot password\?|Sign in|Send Reset Link|Reset Password|Go to Dashboard|Back to Login" client/src/pages/portal/PortalLogin.tsx client/src/pages/portal/PortalRegister.tsx client/src/pages/portal/PortalForgotPassword.tsx client/src/pages/portal/PortalResetPassword.tsx`
- `npx tsc --noEmit`
