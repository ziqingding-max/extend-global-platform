# i18n P0 Batch B Report (2026-03-03)

## Scope
- `client/src/pages/Invoices.tsx`（Invoice Generation Panel 区块）

## Changes
- 将生成/重生成相关 toast、按钮、占位符、描述文案切换为 `t(...)`。
- 将生成确认和重生成确认对话框中的关键提示文案切换为现有 `invoices.*` i18n key。

## Verification
- `npx tsc --noEmit`
- Playwright screenshot on `/invoices`

## Next
- 继续完成 `Invoices.tsx` 剩余区域（列表/详情/历史）的硬编码替换。
- 按 P0 顺序推进 `Employees.tsx`、`Customers.tsx`、`PortalOnboarding.tsx`、`VendorBills.tsx`。

## Incremental update
- 新增 `invoices.generation.precheck.summary`（EN/ZH）用于替换 pre-check 主提示文案。
- 将 existing invoice 检测主句切换到 `invoices.generation.dialog.existingInvoicesMessage`。

- 继续完成列表主区域：Tabs（Active/History）、导出按钮、创建按钮、分页文案、月份筛选占位符改为 i18n。
- 继续完成详情区块：Create Credit Note / Create Deposit Refund / Total Due / Invoice Month / Due Date / Application History / Confirm Payment 等文案切换至 i18n。
