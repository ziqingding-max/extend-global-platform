# New i18n Keys for Offboarding/Termination

## Translation blocks in i18n.ts:
- Portal EN: line 17 (ends ~1971)
- Portal ZH: line 1972 (ends ~3915)
- Admin EN: line 3917 (ends ~6363)
- Admin ZH: line 6364 (ends ~8727)

## Keys needed:

### Offboarding Dialog (Admin - Employees.tsx)
- `offboarding.dialog.title`: "Start Offboarding" / "开始离职"
- `offboarding.dialog.description`: "Set the employee's last working day to begin the offboarding process." / "设置员工的最后工作日以开始离职流程。"
- `offboarding.dialog.endDate`: "Last Working Day (required)" / "最后工作日 (必填)"
- `offboarding.dialog.confirm`: "Confirm Start Offboarding" / "确认开始离职"
- `offboarding.dialog.success`: "Offboarding started" / "已开始离职流程"

### Terminate Dialog (Admin - Employees.tsx & ContractorDetail.tsx)
- `terminate.dialog.title`: "Terminate Employee" / "终止员工"
- `terminate.dialog.title.contractor`: "Terminate Contractor" / "终止承包商"
- `terminate.dialog.description`: "Set the termination date and optionally provide a reason." / "设置终止日期并可选择提供原因。"
- `terminate.dialog.description.contractor`: "Set the termination date and optionally provide a reason for this contractor." / "设置承包商的终止日期并可选择提供原因。"
- `terminate.dialog.endDate`: "Termination Date" / "终止日期"
- `terminate.dialog.reason`: "Reason (optional)" / "终止原因 (可选)"
- `terminate.dialog.reasonPlaceholder`: "Enter reason for termination..." / "请输入终止原因..."
- `terminate.dialog.confirm`: "Confirm Terminate" / "确认终止"
- `terminate.dialog.success`: "Employee terminated" / "员工已终止"
- `terminate.dialog.success.contractor`: "Contractor terminated" / "承包商已终止"

### Portal Termination Request (Portal - PortalEmployeeDetail.tsx & PortalContractorDetail.tsx)
- `portal.termination.requestButton`: "Request Termination" / "请求终止"
- `portal.termination.dialog.title.employee`: "Request Employee Termination" / "请求终止员工"
- `portal.termination.dialog.title.contractor`: "Request Contractor Termination" / "请求终止承包商"
- `portal.termination.dialog.description`: "Submit a termination request to the admin. They will review and process it." / "向管理员提交终止请求，管理员将审核并处理。"
- `portal.termination.dialog.endDate`: "Requested End Date (required)" / "期望结束日期 (必填)"
- `portal.termination.dialog.reason`: "Reason (optional)" / "原因 (可选)"
- `portal.termination.dialog.reasonPlaceholder`: "Enter reason for termination..." / "请输入终止原因..."
- `portal.termination.dialog.submit`: "Submit Request" / "提交申请"
- `portal.termination.dialog.success`: "Termination request submitted" / "终止申请已提交"

### Common
- `common.processing`: "Processing..." / "处理中..."
- `common.submitting`: "Submitting..." / "提交中..." (already exists)

### Notification Settings
- `notifications.group.offboarding`: "Offboarding" / "离职"
