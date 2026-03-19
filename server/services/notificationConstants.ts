
export type TemplateConfig = {
  emailSubject: string;
  emailBody: string;
  inAppMessage: string;
};

export type NotificationConfig = {
  enabled: boolean;
  channels: ("email" | "in_app")[];
  recipients: string[]; // e.g. "client:finance", "admin:operations_manager"
  audience: "admin" | "client" | "worker"; // Determines email layout footer
  templates: {
    en: TemplateConfig;
    zh: TemplateConfig;
  };
};

export const DEFAULT_RULES: Record<string, NotificationConfig> = {
  // ─────────────────────────────────────────────────────────
  // 1. INVOICE SENT — Client-facing
  // ─────────────────────────────────────────────────────────
  invoice_sent: {
    enabled: true,
    channels: ["email", "in_app"],
    recipients: ["client:finance", "client:admin", "admin:finance_manager"],
    audience: "client",
    templates: {
      en: {
        emailSubject: "Invoice #{{invoiceNumber}} from Extend Global",
        emailBody: `<p>Dear {{contactName}},</p>
<p>Thank you for your continued partnership with EG. A new invoice has been generated for your account. Please find the details below:</p>
<EG_INFO_CARD>
<EG_ROW label="Invoice Number" value="#{{invoiceNumber}}" />
<EG_ROW label="Amount Due" value="{{currency}} {{amount}}" />
<EG_ROW label="Due Date" value="{{dueDate}}" />
</EG_INFO_CARD>
<p>The invoice PDF is attached to this email for your records. If you have any questions regarding this invoice, please don't hesitate to reach out to your dedicated account manager.</p>
<EG_BUTTON text="View in Client Portal" href="https://app.extendglobal.ai" />
<p>Best regards,<br><strong>EG Finance Team</strong><br>Extend Global</p>`,
        inAppMessage: "Invoice #{{invoiceNumber}} has been sent."
      },
      zh: {
        emailSubject: "发票 #{{invoiceNumber}} — Extend Global",
        emailBody: `<p>尊敬的 {{contactName}}，</p>
<p>感谢您与 EG 的持续合作。我们已为您生成一份新的发票，详情如下：</p>
<EG_INFO_CARD>
<EG_ROW label="发票编号" value="#{{invoiceNumber}}" />
<EG_ROW label="应付金额" value="{{currency}} {{amount}}" />
<EG_ROW label="到期日" value="{{dueDate}}" />
</EG_INFO_CARD>
<p>发票 PDF 已附在此邮件中。如您对此发票有任何疑问，请随时联系您的客户经理。</p>
<EG_BUTTON text="前往客户门户查看" href="https://app.extendglobal.ai" />
<p>祝好，<br><strong>EG 财务团队</strong><br>Extend Global</p>`,
        inAppMessage: "发票 #{{invoiceNumber}} 已发送。"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 2. INVOICE OVERDUE — Client-facing (urgent)
  // ─────────────────────────────────────────────────────────
  invoice_overdue: {
    enabled: true,
    channels: ["email", "in_app"],
    recipients: ["client:finance", "client:admin", "admin:customer_manager"],
    audience: "client",
    templates: {
      en: {
        emailSubject: "Payment Overdue: Invoice #{{invoiceNumber}} — Action Required",
        emailBody: `<EG_BANNER type="warning" text="This invoice is past due. Please arrange payment at your earliest convenience." />
<p>Dear {{contactName}},</p>
<p>We would like to bring to your attention that the following invoice remains unpaid past its due date:</p>
<EG_INFO_CARD>
<EG_ROW label="Invoice Number" value="#{{invoiceNumber}}" />
<EG_ROW label="Original Due Date" value="{{dueDate}}" />
<EG_ROW label="Status" value="<span style='color:#ef4444;font-weight:bold;'>OVERDUE</span>" />
</EG_INFO_CARD>
<p>To avoid any disruption to your services, we kindly request that payment be arranged as soon as possible. If payment has already been made, please disregard this notice and accept our thanks.</p>
<p>Should you have any questions or need to discuss payment arrangements, please contact your account manager or reply to this email.</p>
<EG_BUTTON text="View Invoice Details" href="https://app.extendglobal.ai" color="#ef4444" />
<p>Best regards,<br><strong>EG Finance Team</strong><br>Extend Global</p>`,
        inAppMessage: "Invoice #{{invoiceNumber}} is overdue."
      },
      zh: {
        emailSubject: "付款逾期提醒：发票 #{{invoiceNumber}} — 请尽快处理",
        emailBody: `<EG_BANNER type="warning" text="此发票已逾期，请尽快安排付款。" />
<p>尊敬的 {{contactName}}，</p>
<p>我们注意到以下发票已超过付款期限，尚未收到款项：</p>
<EG_INFO_CARD>
<EG_ROW label="发票编号" value="#{{invoiceNumber}}" />
<EG_ROW label="原到期日" value="{{dueDate}}" />
<EG_ROW label="状态" value="<span style='color:#ef4444;font-weight:bold;'>已逾期</span>" />
</EG_INFO_CARD>
<p>为避免影响您的服务，请尽快安排付款。如您已完成付款，请忽略此通知。</p>
<p>如有任何疑问或需要讨论付款安排，请联系您的客户经理或回复此邮件。</p>
<EG_BUTTON text="查看发票详情" href="https://app.extendglobal.ai" color="#ef4444" />
<p>祝好，<br><strong>EG 财务团队</strong><br>Extend Global</p>`,
        inAppMessage: "发票 #{{invoiceNumber}} 已逾期。"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 3. PAYROLL DRAFT CREATED — Admin-only (in-app only)
  // ─────────────────────────────────────────────────────────
  payroll_draft_created: {
    enabled: true,
    channels: ["in_app"],
    recipients: ["admin:operations_manager"],
    audience: "admin",
    templates: {
      en: {
        emailSubject: "Payroll Draft Ready for Review — {{period}}",
        emailBody: `<p>Dear Admin,</p>
<p>A payroll draft for <strong>{{period}}</strong> has been automatically generated and is ready for your review.</p>
<EG_BUTTON text="Review Payroll Draft" href="https://admin.extendglobal.ai" />
<p>— EG System</p>`,
        inAppMessage: "Payroll draft for {{period}} is ready for review."
      },
      zh: {
        emailSubject: "工资单草稿已生成 — {{period}}",
        emailBody: `<p>管理员您好，</p>
<p><strong>{{period}}</strong> 的工资单草稿已自动生成，请前往后台审核。</p>
<EG_BUTTON text="审核工资单" href="https://admin.extendglobal.ai" />
<p>— EG 系统</p>`,
        inAppMessage: "{{period}} 的工资单草稿已生成，请审核。"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 4. NEW EMPLOYEE REQUEST — Admin notification
  // ─────────────────────────────────────────────────────────
  new_employee_request: {
    enabled: true,
    channels: ["email", "in_app"],
    recipients: ["admin:operations_manager"],
    audience: "admin",
    templates: {
      en: {
        emailSubject: "New Employee Onboarding Request — {{employeeName}} from {{customerName}}",
        emailBody: `<EG_BANNER type="info" text="A new employee onboarding request has been submitted and requires your review." />
<p>Dear Admin,</p>
<p>Customer <strong>{{customerName}}</strong> has submitted a new employee onboarding request through the Client Portal. Please review the details below:</p>
<EG_INFO_CARD>
<EG_ROW label="Employee Name" value="{{employeeName}}" />
<EG_ROW label="Customer" value="{{customerName}}" />
<EG_ROW label="Service Type" value="{{serviceType}}" />
<EG_ROW label="Requested Start Date" value="{{startDate}}" />
</EG_INFO_CARD>
<p>Please review this request and begin the onboarding process at your earliest convenience.</p>
<EG_BUTTON text="Review in Admin Panel" href="https://admin.extendglobal.ai" />
<p>— EG System</p>`,
        inAppMessage: "New onboarding request: {{employeeName}} from {{customerName}}."
      },
      zh: {
        emailSubject: "新员工入职申请 — {{customerName}} 的 {{employeeName}}",
        emailBody: `<EG_BANNER type="info" text="收到新的员工入职申请，请尽快审核。" />
<p>管理员您好，</p>
<p>客户 <strong>{{customerName}}</strong> 通过客户门户提交了一份新的员工入职申请，详情如下：</p>
<EG_INFO_CARD>
<EG_ROW label="员工姓名" value="{{employeeName}}" />
<EG_ROW label="客户名称" value="{{customerName}}" />
<EG_ROW label="服务类型" value="{{serviceType}}" />
<EG_ROW label="期望入职日期" value="{{startDate}}" />
</EG_INFO_CARD>
<p>请尽快审核此申请并启动入职流程。</p>
<EG_BUTTON text="前往管理后台审核" href="https://admin.extendglobal.ai" />
<p>— EG 系统</p>`,
        inAppMessage: "收到 {{customerName}} 提交的 {{employeeName}} 入职申请。"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 5. WORKER INVITE — Worker-facing
  // ─────────────────────────────────────────────────────────
  worker_invite: {
    enabled: true,
    channels: ["email"],
    recipients: ["worker:user"],
    audience: "worker",
    templates: {
      en: {
        emailSubject: "Welcome to EG — Set Up Your Worker Portal Account",
        emailBody: `<p>Dear {{workerName}},</p>
<p>Welcome to <strong>Extend Global (EG)</strong>! You have been invited to join the EG Worker Portal, where you can manage your employment information, view payslips, submit invoices, and more.</p>
<EG_INFO_CARD>
<EG_ROW label="Portal" value="EG Worker Portal" />
<EG_ROW label="Your Email" value="{{workerEmail}}" />
</EG_INFO_CARD>
<p>To get started, please click the button below to set up your password and activate your account:</p>
<EG_BUTTON text="Accept Invitation & Set Up Account" href="{{inviteLink}}" />
<EG_BANNER type="info" text="This invitation link will expire in 7 days. If you did not expect this invitation, please ignore this email." />
<p>If you have any questions about your onboarding process, feel free to reach out to us.</p>
<p>Best regards,<br><strong>EG Operations Team</strong><br>Extend Global</p>`,
        inAppMessage: "Welcome to EG Worker Portal!"
      },
      zh: {
        emailSubject: "欢迎加入 EG — 设置您的员工门户账户",
        emailBody: `<p>尊敬的 {{workerName}}，</p>
<p>欢迎加入 <strong>Extend Global (EG)</strong>！您已被邀请加入 EG 员工门户，在这里您可以管理您的雇佣信息、查看工资单、提交发票等。</p>
<EG_INFO_CARD>
<EG_ROW label="门户" value="EG 员工门户" />
<EG_ROW label="您的邮箱" value="{{workerEmail}}" />
</EG_INFO_CARD>
<p>请点击下方按钮设置密码并激活您的账户：</p>
<EG_BUTTON text="接受邀请并设置账户" href="{{inviteLink}}" />
<EG_BANNER type="info" text="此邀请链接将在 7 天后过期。如果您未预期收到此邀请，请忽略此邮件。" />
<p>如您对入职流程有任何疑问，请随时联系我们。</p>
<p>祝好，<br><strong>EG 运营团队</strong><br>Extend Global</p>`,
        inAppMessage: "欢迎来到 EG 员工门户！"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 6. WORKER INVOICE READY — Worker-facing
  // ─────────────────────────────────────────────────────────
  worker_invoice_ready: {
    enabled: true,
    channels: ["email", "in_app"],
    recipients: ["worker:user"],
    audience: "worker",
    templates: {
      en: {
        emailSubject: "Your Invoice #{{invoiceNumber}} Is Ready — {{period}}",
        emailBody: `<p>Dear {{workerName}},</p>
<p>Your invoice for the period of <strong>{{period}}</strong> has been generated and is now available in your Worker Portal.</p>
<EG_INFO_CARD>
<EG_ROW label="Invoice Number" value="#{{invoiceNumber}}" />
<EG_ROW label="Period" value="{{period}}" />
</EG_INFO_CARD>
<p>You can view and download the invoice by logging into your portal:</p>
<EG_BUTTON text="View Invoice in Portal" href="https://worker.extendglobal.ai" />
<p>If you have any questions, please don't hesitate to contact us.</p>
<p>Best regards,<br><strong>EG Operations Team</strong><br>Extend Global</p>`,
        inAppMessage: "Invoice #{{invoiceNumber}} is ready for review."
      },
      zh: {
        emailSubject: "您的发票 #{{invoiceNumber}} 已生成 — {{period}}",
        emailBody: `<p>尊敬的 {{workerName}}，</p>
<p>您 <strong>{{period}}</strong> 期间的发票已生成，可在员工门户中查看。</p>
<EG_INFO_CARD>
<EG_ROW label="发票编号" value="#{{invoiceNumber}}" />
<EG_ROW label="期间" value="{{period}}" />
</EG_INFO_CARD>
<p>请登录门户查看和下载发票：</p>
<EG_BUTTON text="前往门户查看发票" href="https://worker.extendglobal.ai" />
<p>如有任何疑问，请随时联系我们。</p>
<p>祝好，<br><strong>EG 运营团队</strong><br>Extend Global</p>`,
        inAppMessage: "发票 #{{invoiceNumber}} 已生成，请查看。"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 7. WORKER PAYMENT SENT — Worker-facing
  // ─────────────────────────────────────────────────────────
  worker_payment_sent: {
    enabled: true,
    channels: ["email", "in_app"],
    recipients: ["worker:user"],
    audience: "worker",
    templates: {
      en: {
        emailSubject: "Payment Sent: {{currency}} {{amount}} — Invoice #{{invoiceNumber}}",
        emailBody: `<EG_BANNER type="success" text="Your payment has been processed and sent successfully." />
<p>Dear {{workerName}},</p>
<p>We are pleased to confirm that a payment has been processed for your account:</p>
<EG_AMOUNT currency="{{currency}}" amount="{{amount}}" />
<EG_INFO_CARD>
<EG_ROW label="Invoice Number" value="#{{invoiceNumber}}" />
<EG_ROW label="Amount" value="{{currency}} {{amount}}" />
<EG_ROW label="Status" value="<span style='color:#22c55e;font-weight:bold;'>Sent</span>" />
</EG_INFO_CARD>
<p>Please allow 1–3 business days for the funds to arrive in your account, depending on your bank's processing time.</p>
<EG_BUTTON text="View Payment Details" href="https://worker.extendglobal.ai" />
<p>Best regards,<br><strong>EG Finance Team</strong><br>Extend Global</p>`,
        inAppMessage: "Payment of {{currency}} {{amount}} has been sent."
      },
      zh: {
        emailSubject: "付款已发送：{{currency}} {{amount}} — 发票 #{{invoiceNumber}}",
        emailBody: `<EG_BANNER type="success" text="您的付款已处理并成功发送。" />
<p>尊敬的 {{workerName}}，</p>
<p>我们很高兴确认您的账户已处理一笔付款：</p>
<EG_AMOUNT currency="{{currency}}" amount="{{amount}}" />
<EG_INFO_CARD>
<EG_ROW label="发票编号" value="#{{invoiceNumber}}" />
<EG_ROW label="金额" value="{{currency}} {{amount}}" />
<EG_ROW label="状态" value="<span style='color:#22c55e;font-weight:bold;'>已发送</span>" />
</EG_INFO_CARD>
<p>根据您银行的处理时间，资金预计将在 1-3 个工作日内到账。</p>
<EG_BUTTON text="查看付款详情" href="https://worker.extendglobal.ai" />
<p>祝好，<br><strong>EG 财务团队</strong><br>Extend Global</p>`,
        inAppMessage: "款项 {{currency}} {{amount}} 已汇出。"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 8. LEAVE POLICY COUNTRY ACTIVATED — Client-facing
  // ─────────────────────────────────────────────────────────
  leave_policy_country_activated: {
    enabled: true,
    channels: ["email", "in_app"],
    recipients: ["client:admin", "client:hr"],
    audience: "client",
    templates: {
      en: {
        emailSubject: "New Country Leave Policy Activated: {{countryName}}",
        emailBody: `<EG_BANNER type="info" text="A new country has been activated for leave policy management." />
<p>Dear {{contactName}},</p>
<p>Based on recent employee onboarding activity, a new country has been activated in your leave policy management system:</p>
<EG_INFO_CARD>
<EG_ROW label="Country" value="{{countryName}}" />
<EG_ROW label="Status" value="<span style='color:#22c55e;font-weight:bold;'>Active</span>" />
</EG_INFO_CARD>
<p>Statutory leave policies for <strong>{{countryName}}</strong> have been automatically initialized with default entitlements based on local labor regulations. We recommend reviewing and customizing these policies to align with your company's specific requirements.</p>
<EG_BUTTON text="Review Leave Policies" href="https://app.extendglobal.ai" />
<p>If you need assistance configuring leave policies, our team is here to help.</p>
<p>Best regards,<br><strong>EG Operations Team</strong><br>Extend Global</p>`,
        inAppMessage: "New country {{countryName}} activated. Please configure leave policies in Settings."
      },
      zh: {
        emailSubject: "新国家假期政策已激活：{{countryName}}",
        emailBody: `<EG_BANNER type="info" text="新国家的假期政策管理已激活。" />
<p>尊敬的 {{contactName}}，</p>
<p>基于近期的员工入职活动，您的假期政策管理系统中已激活一个新国家：</p>
<EG_INFO_CARD>
<EG_ROW label="国家" value="{{countryName}}" />
<EG_ROW label="状态" value="<span style='color:#22c55e;font-weight:bold;'>已激活</span>" />
</EG_INFO_CARD>
<p><strong>{{countryName}}</strong> 的法定假期政策已根据当地劳动法规自动初始化默认标准。建议您审核并根据贵公司的具体要求进行自定义调整。</p>
<EG_BUTTON text="审核假期政策" href="https://app.extendglobal.ai" />
<p>如需协助配置假期政策，我们的团队随时为您提供帮助。</p>
<p>祝好，<br><strong>EG 运营团队</strong><br>Extend Global</p>`,
        inAppMessage: "新国家 {{countryName}} 已激活，请在设置中配置假期政策。"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 9. EMPLOYEE TERMINATION REQUEST — Admin notification
  // ─────────────────────────────────────────────────────────
  employee_termination_request: {
    enabled: true,
    channels: ["email", "in_app"],
    recipients: ["admin:operations_manager", "admin:customer_manager"],
    audience: "admin",
    templates: {
      en: {
        emailSubject: "Employee Termination Request: {{employeeName}} ({{employeeCode}})",
        emailBody: `<EG_BANNER type="warning" text="An employee termination request has been submitted and requires your review." />
<p>Dear Admin,</p>
<p>Customer <strong>{{customerName}}</strong> has submitted a termination request through the Client Portal. Please review the details below:</p>
<EG_INFO_CARD>
<EG_ROW label="Employee Name" value="{{employeeName}}" />
<EG_ROW label="Employee Code" value="{{employeeCode}}" />
<EG_ROW label="Customer" value="{{customerName}}" />
<EG_ROW label="Requested Last Working Day" value="{{requestedEndDate}}" />
<EG_ROW label="Reason" value="{{reason}}" />
<EG_ROW label="Requested By" value="{{requestedBy}}" />
</EG_INFO_CARD>
<p>Please review this request carefully and take appropriate action in the Admin panel. Ensure all local labor law requirements are considered before processing.</p>
<EG_BUTTON text="Review in Admin Panel" href="https://admin.extendglobal.ai" />
<p>— EG System</p>`,
        inAppMessage: "Termination request: {{employeeName}} ({{employeeCode}}) from {{customerName}}. Last day: {{requestedEndDate}}."
      },
      zh: {
        emailSubject: "员工终止申请：{{employeeName}} ({{employeeCode}})",
        emailBody: `<EG_BANNER type="warning" text="收到员工终止申请，请尽快审核。" />
<p>管理员您好，</p>
<p>客户 <strong>{{customerName}}</strong> 通过客户门户提交了一份终止申请，详情如下：</p>
<EG_INFO_CARD>
<EG_ROW label="员工姓名" value="{{employeeName}}" />
<EG_ROW label="员工编号" value="{{employeeCode}}" />
<EG_ROW label="客户名称" value="{{customerName}}" />
<EG_ROW label="申请的最后工作日" value="{{requestedEndDate}}" />
<EG_ROW label="原因" value="{{reason}}" />
<EG_ROW label="申请人" value="{{requestedBy}}" />
</EG_INFO_CARD>
<p>请仔细审核此申请，并在管理后台采取相应操作。处理前请确保已考虑当地劳动法的相关要求。</p>
<EG_BUTTON text="前往管理后台审核" href="https://admin.extendglobal.ai" />
<p>— EG 系统</p>`,
        inAppMessage: "终止申请：{{customerName}} 的 {{employeeName}} ({{employeeCode}})，最后工作日：{{requestedEndDate}}。"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 10. CONTRACTOR TERMINATION REQUEST — Admin notification
  // ─────────────────────────────────────────────────────────
  contractor_termination_request: {
    enabled: true,
    channels: ["email", "in_app"],
    recipients: ["admin:operations_manager", "admin:customer_manager"],
    audience: "admin",
    templates: {
      en: {
        emailSubject: "Contractor Termination Request: {{contractorName}} ({{contractorCode}})",
        emailBody: `<EG_BANNER type="warning" text="A contractor termination request has been submitted and requires your review." />
<p>Dear Admin,</p>
<p>Customer <strong>{{customerName}}</strong> has submitted a contractor termination request through the Client Portal. Please review the details below:</p>
<EG_INFO_CARD>
<EG_ROW label="Contractor Name" value="{{contractorName}}" />
<EG_ROW label="Contractor Code" value="{{contractorCode}}" />
<EG_ROW label="Customer" value="{{customerName}}" />
<EG_ROW label="Requested End Date" value="{{requestedEndDate}}" />
<EG_ROW label="Reason" value="{{reason}}" />
<EG_ROW label="Requested By" value="{{requestedBy}}" />
</EG_INFO_CARD>
<p>Please review this request and take appropriate action in the Admin panel.</p>
<EG_BUTTON text="Review in Admin Panel" href="https://admin.extendglobal.ai" />
<p>— EG System</p>`,
        inAppMessage: "Termination request: {{contractorName}} ({{contractorCode}}) from {{customerName}}. End date: {{requestedEndDate}}."
      },
      zh: {
        emailSubject: "承包商终止申请：{{contractorName}} ({{contractorCode}})",
        emailBody: `<EG_BANNER type="warning" text="收到承包商终止申请，请尽快审核。" />
<p>管理员您好，</p>
<p>客户 <strong>{{customerName}}</strong> 通过客户门户提交了一份承包商终止申请，详情如下：</p>
<EG_INFO_CARD>
<EG_ROW label="承包商姓名" value="{{contractorName}}" />
<EG_ROW label="承包商编号" value="{{contractorCode}}" />
<EG_ROW label="客户名称" value="{{customerName}}" />
<EG_ROW label="申请的结束日期" value="{{requestedEndDate}}" />
<EG_ROW label="原因" value="{{reason}}" />
<EG_ROW label="申请人" value="{{requestedBy}}" />
</EG_INFO_CARD>
<p>请审核此申请，并在管理后台采取相应操作。</p>
<EG_BUTTON text="前往管理后台审核" href="https://admin.extendglobal.ai" />
<p>— EG 系统</p>`,
        inAppMessage: "终止申请：{{customerName}} 的 {{contractorName}} ({{contractorCode}})，结束日期：{{requestedEndDate}}。"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 11. EMPLOYEE ONBOARDING COMPLETED — Client + Admin notification
  // ─────────────────────────────────────────────────────────
  employee_onboarding_completed: {
    enabled: true,
    channels: ["email", "in_app"],
    recipients: ["client:admin", "client:hr_manager", "admin:operations_manager"],
    audience: "client",
    templates: {
      en: {
        emailSubject: "Employee Onboarding Completed: {{employeeName}}",
        emailBody: `<EG_BANNER type="success" text="An employee has completed their onboarding process." />
<p>Dear {{contactName}},</p>
<p>We're pleased to inform you that the following employee has successfully completed their onboarding:</p>
<EG_INFO_CARD>
<EG_ROW label="Employee Name" value="{{employeeName}}" />
<EG_ROW label="Position" value="{{position}}" />
<EG_ROW label="Country" value="{{country}}" />
<EG_ROW label="Start Date" value="{{startDate}}" />
</EG_INFO_CARD>
<p>The employee's information has been submitted and is now being reviewed by the EG team. You will be notified once the employee is fully activated.</p>
<EG_BUTTON text="View in Client Portal" href="https://app.extendglobal.ai" />
<p>Best regards,<br><strong>EG Operations Team</strong><br>Extend Global</p>`,
        inAppMessage: "{{employeeName}} has completed onboarding."
      },
      zh: {
        emailSubject: "员工入职完成：{{employeeName}}",
        emailBody: `<EG_BANNER type="success" text="员工已完成入职流程。" />
<p>尊敬的 {{contactName}}，</p>
<p>我们很高兴通知您，以下员工已成功完成入职流程：</p>
<EG_INFO_CARD>
<EG_ROW label="员工姓名" value="{{employeeName}}" />
<EG_ROW label="职位" value="{{position}}" />
<EG_ROW label="国家" value="{{country}}" />
<EG_ROW label="入职日期" value="{{startDate}}" />
</EG_INFO_CARD>
<p>该员工的信息已提交，EG 团队正在审核中。员工完全激活后我们会通知您。</p>
<EG_BUTTON text="前往客户门户查看" href="https://app.extendglobal.ai" />
<p>祝好，<br><strong>EG 运营团队</strong><br>Extend Global</p>`,
        inAppMessage: "{{employeeName}} 已完成入职。"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 12. EMPLOYEE ACTIVATED — Client notification
  // ─────────────────────────────────────────────────────────
  employee_activated: {
    enabled: true,
    channels: ["email", "in_app"],
    recipients: ["client:admin", "client:hr_manager"],
    audience: "client",
    templates: {
      en: {
        emailSubject: "Employee Activated: {{employeeName}} ({{employeeCode}})",
        emailBody: `<EG_BANNER type="success" text="An employee has been activated and is now fully onboarded." />
<p>Dear {{contactName}},</p>
<p>Great news! The following employee has been activated and is now fully set up in the EG system:</p>
<EG_INFO_CARD>
<EG_ROW label="Employee Name" value="{{employeeName}}" />
<EG_ROW label="Employee Code" value="{{employeeCode}}" />
<EG_ROW label="Country" value="{{country}}" />
<EG_ROW label="Start Date" value="{{startDate}}" />
</EG_INFO_CARD>
<p>Payroll and benefits are now being processed. You can view the employee's details in the Client Portal.</p>
<EG_BUTTON text="View Employee" href="https://app.extendglobal.ai" />
<p>Best regards,<br><strong>EG Operations Team</strong><br>Extend Global</p>`,
        inAppMessage: "{{employeeName}} ({{employeeCode}}) has been activated."
      },
      zh: {
        emailSubject: "员工已激活：{{employeeName}} ({{employeeCode}})",
        emailBody: `<EG_BANNER type="success" text="员工已激活，入职流程全部完成。" />
<p>尊敬的 {{contactName}}，</p>
<p>好消息！以下员工已在 EG 系统中激活：</p>
<EG_INFO_CARD>
<EG_ROW label="员工姓名" value="{{employeeName}}" />
<EG_ROW label="员工编号" value="{{employeeCode}}" />
<EG_ROW label="国家" value="{{country}}" />
<EG_ROW label="入职日期" value="{{startDate}}" />
</EG_INFO_CARD>
<p>薪资和福利正在处理中。您可以在客户门户中查看该员工的详细信息。</p>
<EG_BUTTON text="查看员工" href="https://app.extendglobal.ai" />
<p>祝好，<br><strong>EG 运营团队</strong><br>Extend Global</p>`,
        inAppMessage: "{{employeeName}} ({{employeeCode}}) 已激活。"
      }
    }
  },

  // ─────────────────────────────────────────────────────────
  // 13. ADMIN PENDING APPROVAL ALERT — Admin daily digest
  // ─────────────────────────────────────────────────────────
  admin_pending_approval_alert: {
    enabled: true,
    channels: ["email"],
    recipients: ["admin:operations_manager", "admin:customer_manager"],
    audience: "admin",
    templates: {
      en: {
        emailSubject: "Action Required: {{totalPending}} Pending Items for {{period}}",
        emailBody: `<EG_BANNER type="warning" text="You have pending items that missed the payroll lock window and require immediate attention." />
<p>Dear Admin,</p>
<p>The following items for <strong>{{period}}</strong> are still pending approval and were NOT included in the payroll lock. They will be delayed to next month's payroll unless approved immediately:</p>
<EG_INFO_CARD>
<EG_ROW label="Pending Adjustments" value="{{pendingAdjustments}}" />
<EG_ROW label="Pending Reimbursements" value="{{pendingReimbursements}}" />
<EG_ROW label="Pending Leave" value="{{pendingLeave}}" />
<EG_ROW label="Total Pending" value="{{totalPending}}" />
</EG_INFO_CARD>
<p>{{message}}</p>
<p>Please log in to the Admin Panel to review and approve these items as soon as possible.</p>
<EG_BUTTON text="Go to Admin Panel" href="https://admin.extendglobal.ai" />
<p>\u2014 EG System</p>`,
        inAppMessage: "{{totalPending}} pending items for {{period}} need approval."
      },
      zh: {
        emailSubject: "\u9700\u8981\u64cd\u4f5c\uff1a{{period}} \u6709 {{totalPending}} \u4e2a\u5f85\u5ba1\u6279\u9879\u76ee",
        emailBody: `<EG_BANNER type="warning" text="\u60a8\u6709\u672a\u5ba1\u6279\u7684\u9879\u76ee\u9519\u8fc7\u4e86\u5de5\u8d44\u9501\u5b9a\u7a97\u53e3\uff0c\u9700\u8981\u7acb\u5373\u5904\u7406\u3002" />
<p>\u7ba1\u7406\u5458\u60a8\u597d\uff0c</p>
<p><strong>{{period}}</strong> \u7684\u4ee5\u4e0b\u9879\u76ee\u4ecd\u5728\u7b49\u5f85\u5ba1\u6279\uff0c\u672a\u88ab\u7eb3\u5165\u5de5\u8d44\u9501\u5b9a\u3002\u5982\u4e0d\u5c3d\u5feb\u5ba1\u6279\uff0c\u5c06\u5ef6\u8fdf\u5230\u4e0b\u6708\u7684\u5de5\u8d44\u5355\uff1a</p>
<EG_INFO_CARD>
<EG_ROW label="\u5f85\u5904\u7406\u8c03\u6574" value="{{pendingAdjustments}}" />
<EG_ROW label="\u5f85\u5904\u7406\u62a5\u9500" value="{{pendingReimbursements}}" />
<EG_ROW label="\u5f85\u5904\u7406\u5047\u671f" value="{{pendingLeave}}" />
<EG_ROW label="\u5f85\u5904\u7406\u603b\u8ba1" value="{{totalPending}}" />
</EG_INFO_CARD>
<p>{{message}}</p>
<p>\u8bf7\u5c3d\u5feb\u767b\u5f55\u7ba1\u7406\u540e\u53f0\u5ba1\u6838\u5e76\u5904\u7406\u8fd9\u4e9b\u9879\u76ee\u3002</p>
<EG_BUTTON text="\u524d\u5f80\u7ba1\u7406\u540e\u53f0" href="https://admin.extendglobal.ai" />
<p>\u2014 EG \u7cfb\u7edf</p>`,
        inAppMessage: "{{period}} \u6709 {{totalPending}} \u4e2a\u5f85\u5ba1\u6279\u9879\u76ee\u3002"
      }
    }
  }
};
