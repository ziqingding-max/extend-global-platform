/**
 * Portal Help Center
 * Client-facing help center with guides, FAQ, changelog, and glossary
 * Bilingual (EN/ZH) with search
 */
import { useState, useMemo } from "react";
import PortalLayout from "@/components/PortalLayout";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Search,
  BookOpen,
  HelpCircle,
  BookText,
  Users,
  DollarSign,
  CalendarDays,
  ArrowUpDown,
  Receipt,
  FileText,
  Settings,
  UserPlus,
  History,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";

type Lang = "en" | "cn";

interface GuideSection {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: { en: string; cn: string };
  steps: { en: string; cn: string }[];
  tips?: { en: string; cn: string }[];
}

interface FAQItem {
  id: string;
  category: string;
  question: { en: string; cn: string };
  answer: { en: string; cn: string };
}

interface UpdateEntry {
  version: string;
  date: string;
  title: { en: string; cn: string };
  highlights: { en: string; cn: string }[];
  details: {
    category: "fix" | "feature" | "change";
    description: { en: string; cn: string };
  }[];
}

// ── Guide Sections ──
const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "getting-started",
    icon: BookOpen,
    title: { en: "Getting Started", cn: "快速入门" },
    steps: [
      { en: "1. Log in to the Client Portal using the credentials provided by your EG account manager.", cn: "1. 使用GEA客户经理提供的凭据登录客户门户。" },
      { en: "2. Your **Dashboard** shows an overview of your employees, pending approvals, and recent invoices.", cn: "2. **仪表板**显示员工概览、待审批项和最近发票。" },
      { en: "3. Use the sidebar navigation to access different modules: Employees, Payroll, Adjustments, Leave, Reimbursements, Invoices, etc.", cn: "3. 使用侧边栏导航访问不同模块：员工、工资、调整项、假期、报销、发票等。" },
      { en: "4. You can switch between English and Chinese using the language switcher in the top-right corner.", cn: "4. 您可以使用右上角的语言切换器在中英文之间切换。" },
    ],
    tips: [
      { en: "Bookmark the portal URL for quick access. Your login session persists for 7 days.", cn: "收藏门户URL以便快速访问。您的登录会话保持7天有效。" },
    ],
  },
  {
    id: "employee-management",
    icon: Users,
    title: { en: "Employee Management", cn: "员工管理" },
    steps: [
      { en: "1. Navigate to **Employees** to view all your employees and their current status.", cn: "1. 进入**员工**页面查看所有员工及其当前状态。" },
      { en: "2. Click on an employee to view their full profile including personal info, employment details, documents, contracts, and leave balances.", cn: "2. 点击员工查看完整档案，包括个人信息、雇佣详情、文件、合同和假期余额。" },
      { en: "3. To onboard a new employee, go to **Onboarding** and fill in the required information, or send a self-service invite link to the employee.", cn: "3. 要入职新员工，进入**入职**页面填写所需信息，或发送自助邀请链接给员工。" },
      { en: "4. For self-service onboarding, the employee will receive an email with a link to fill in their personal details.", cn: "4. 对于自助入职，员工将收到一封包含链接的邮件，用于填写个人信息。" },
    ],
    tips: [
      { en: "Employee start date cannot be earlier than today when creating a new onboarding.", cn: "创建新入职时，员工入职日期不能早于今天。" },
      { en: "The salary currency is automatically determined by the employment country and cannot be changed.", cn: "薪资币种由就业国家自动确定，不可更改。" },
    ],
  },
  {
    id: "adjustments",
    icon: ArrowUpDown,
    title: { en: "Adjustments", cn: "调整项" },
    steps: [
      { en: "1. Navigate to **Adjustments** to view and manage salary adjustments for your employees.", cn: "1. 进入**调整项**页面查看和管理员工的薪资调整。" },
      { en: "2. Click **New Adjustment** to create an adjustment. Select the employee, type (bonus, allowance, deduction, etc.), and enter the amount.", cn: "2. 点击**新建调整项**创建调整。选择员工、类型（奖金、津贴、扣款等）并输入金额。" },
      { en: "3. Adjustments go through an approval workflow: after submission, you can **approve** or **reject** them.", cn: "3. 调整项经过审批流程：提交后，您可以**批准**或**驳回**。" },
      { en: "4. Approved adjustments are then reviewed by the EG admin team for final confirmation.", cn: "4. 批准的调整项随后由EG管理团队进行最终确认。" },
    ],
    tips: [
      { en: "Adjustments are included in the next payroll run after they are fully approved and locked.", cn: "调整项在完全批准并锁定后纳入下一次工资批次。" },
      { en: "Attachment upload is optional for adjustments but recommended for audit purposes.", cn: "调整项的附件上传是可选的，但建议用于审计目的。" },
    ],
  },
  {
    id: "leave-management",
    icon: CalendarDays,
    title: { en: "Leave Management", cn: "假期管理" },
    steps: [
      { en: "1. Navigate to **Leave** to view all leave requests for your employees.", cn: "1. 进入**假期**页面查看所有员工的假期申请。" },
      { en: "2. Click **New Leave Request** to submit a leave request. Select the employee, leave type, start/end dates.", cn: "2. 点击**新建假期申请**提交假期。选择员工、假期类型、开始/结束日期。" },
      { en: "3. Leave days are automatically calculated based on the date range (excluding weekends).", cn: "3. 假期天数根据日期范围自动计算（不含周末）。" },
      { en: "4. After submission, you can **approve** or **reject** the leave request. Approved requests go to EG admin for final confirmation.", cn: "4. 提交后，您可以**批准**或**驳回**假期申请。批准的申请将提交EG管理员最终确认。" },
    ],
    tips: [
      { en: "Unpaid leave will result in a salary deduction calculated automatically during payroll.", cn: "无薪假将在工资处理时自动计算扣款。" },
      { en: "Cross-month leave is automatically split by natural month for payroll purposes.", cn: "跨月假期会按自然月自动拆分用于工资计算。" },
    ],
  },
  {
    id: "reimbursements",
    icon: Receipt,
    title: { en: "Reimbursements", cn: "报销" },
    steps: [
      { en: "1. Navigate to **Reimbursements** to view and manage expense reimbursement requests.", cn: "1. 进入**报销**页面查看和管理费用报销申请。" },
      { en: "2. Click **New Reimbursement** to submit a reimbursement. Select the employee, category (travel, meals, equipment, etc.), and enter the amount.", cn: "2. 点击**新建报销**提交报销。选择员工、类别（差旅、餐饮、设备等）并输入金额。" },
      { en: "3. Upload the receipt or supporting document for the reimbursement.", cn: "3. 上传报销的收据或支持文件。" },
      { en: "4. After submission, you can **approve** or **reject** the reimbursement. Approved items go to EG admin for final confirmation.", cn: "4. 提交后，您可以**批准**或**驳回**报销。批准的项目将提交EG管理员最终确认。" },
    ],
    tips: [
      { en: "Reimbursements are separate from salary and do not affect Gross Pay calculations.", cn: "报销与薪资分开，不影响Gross Pay计算。" },
      { en: "Approved reimbursements appear as a separate section on the employee's payslip.", cn: "批准的报销在员工工资条上作为独立部分显示。" },
    ],
  },
  {
    id: "invoices",
    icon: FileText,
    title: { en: "Invoices", cn: "发票" },
    steps: [
      { en: "1. Navigate to **Invoices** to view all invoices issued to your company.", cn: "1. 进入**发票**页面查看所有向贵公司开具的发票。" },
      { en: "2. Click on an invoice to view its details, including line items, subtotal, and total due.", cn: "2. 点击发票查看详情，包括明细项、小计和应付总额。" },
      { en: "3. Line items show amounts in **local currency**. The settlement currency total is shown in Subtotal and Total Due.", cn: "3. 明细项显示**本地币种**金额。结算币种总额在小计和应付总额中显示。" },
      { en: "4. You can download the invoice as a PDF for your records.", cn: "4. 您可以下载发票PDF用于存档。" },
    ],
    tips: [
      { en: "Invoice status flow: Draft → Sent → Paid. Overdue invoices are automatically detected.", cn: "发票状态流程：草稿 → 已发送 → 已付款。逾期发票会自动检测。" },
      { en: "If a credit note has been applied, the PDF will show 'Less: Credit Note Applied' with the adjusted amount.", cn: "如果已应用贷项通知单，PDF将显示『减：已抵扣贷项通知单』及调整后的金额。" },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    title: { en: "Account Settings", cn: "账户设置" },
    steps: [
      { en: "1. Navigate to **Settings** to manage your company information and portal users.", cn: "1. 进入**设置**页面管理公司信息和门户用户。" },
      { en: "2. **Company Information**: View and edit your company details. Note that legal entity name and settlement currency are read-only.", cn: "2. **公司信息**：查看和编辑公司详情。注意法律实体名称和结算币种为只读。" },
      { en: "3. **Portal Users**: Manage who has access to the portal. You can invite new users via email.", cn: "3. **门户用户**：管理谁可以访问门户。您可以通过邮件邀请新用户。" },
      { en: "4. **Primary Contact**: This information is managed by your EG account manager and is read-only in the portal.", cn: "4. **主要联系人**：此信息由EG客户经理管理，在门户中为只读。" },
    ],
    tips: [
      { en: "To change your primary contact information, please contact your EG account manager.", cn: "要更改主要联系人信息，请联系您的EG客户经理。" },
    ],
  },
];

// ── FAQ Items ──
const FAQ_ITEMS: FAQItem[] = [
  {
    id: "faq-1",
    category: "approval",
    question: { en: "How does the approval workflow work?", cn: "审批工作流如何运作？" },
    answer: {
      en: "Leave requests, adjustments, and reimbursements follow a two-level approval process: **1)** After submission, you (the client) can approve or reject the item. **2)** Once you approve, it goes to the EG admin team for final confirmation. Only after both levels of approval will the item be locked and included in payroll.",
      cn: "假期申请、调整项和报销遵循两级审批流程：**1)** 提交后，您（客户）可以批准或驳回。**2)** 您批准后，将提交GEA管理团队最终确认。只有两级审批都通过后，该项才会被锁定并纳入工资单。",
    },
  },
  {
    id: "faq-2",
    category: "payroll",
    question: { en: "When is the payroll cutoff date?", cn: "工资截止日期是什么时候？" },
    answer: {
      en: "The payroll cutoff is on the **4th of each month at 23:59 (Beijing time)**. All approved adjustments, leave records, and reimbursements for the current month are automatically locked after this date.",
      cn: "工资截止日期为**每月4日23:59（北京时间）**。当月所有已批准的调整项、假期记录和报销在此日期后自动锁定。",
    },
  },
  {
    id: "faq-3",
    category: "payroll",
    question: { en: "What is the difference between Gross Pay, Net Pay, and Total Payout?", cn: "Gross Pay、Net Pay和实发总额有什么区别？" },
    answer: {
      en: "**Gross Pay** = Base Salary + Bonuses + Allowances (does NOT include reimbursements). **Net Pay** = Gross Pay - Deductions (tax, social insurance, unpaid leave, etc.). **Total Payout** = Net Pay + Reimbursements — this is the actual amount the employee receives.",
      cn: "**Gross Pay** = 基本工资 + 奖金 + 津贴（不包含报销）。**Net Pay** = Gross Pay - 扣款（税、社保、无薪假等）。**实发总额** = Net Pay + 报销 —— 这是员工实际收到的金额。",
    },
  },
  {
    id: "faq-4",
    category: "employee",
    question: { en: "How do I onboard a new employee?", cn: "如何入职新员工？" },
    answer: {
      en: "Go to **Onboarding** in the sidebar. You can either fill in the employee details directly, or send a **self-service invite link** to the employee so they can fill in their own information. The start date must be today or later, and the salary currency is automatically set based on the employment country.",
      cn: "进入侧边栏的**入职**页面。您可以直接填写员工信息，或发送**自助邀请链接**给员工让他们自行填写。入职日期必须是今天或之后，薪资币种根据就业国家自动设置。",
    },
  },
  {
    id: "faq-5",
    category: "invoice",
    question: { en: "Why do invoice line items show different currencies?", cn: "为什么发票明细项显示不同的币种？" },
    answer: {
      en: "Invoice line items display amounts in the **local currency** of the employee's work country (e.g., SGD for Singapore, JPY for Japan). The settlement currency (e.g., USD) is only shown in the Subtotal and Total Due, which includes exchange rate conversion.",
      cn: "发票明细项显示员工工作国家的**本地币种**金额（如新加坡的SGD、日本的JPY）。结算币种（如USD）仅在小计和应付总额中显示，其中包含汇率转换。",
    },
  },
  {
    id: "faq-6",
    category: "account",
    question: { en: "How do I change my primary contact information?", cn: "如何更改主要联系人信息？" },
    answer: {
      en: "Primary contact information is managed by your EG account manager for security reasons. Please contact your EG representative to make changes.",
      cn: "出于安全考虑，主要联系人信息由EG客户经理管理。请联系您的GEA代表进行更改。",
    },
  },
  {
    id: "faq-7",
    category: "account",
    question: { en: "I forgot my password. How do I reset it?", cn: "我忘记了密码，如何重置？" },
    answer: {
      en: "Click **Forgot Password** on the login page and enter your email address. You will receive a reset link via email. If you don't receive the email, contact your EG account manager who can reset your password directly.",
      cn: "在登录页面点击**忘记密码**并输入邮箱地址。您将通过邮件收到重置链接。如果没有收到邮件，请联系GEA客户经理直接重置密码。",
    },
  },
  {
    id: "faq-8",
    category: "reimbursement",
    question: { en: "What categories are available for reimbursements?", cn: "报销有哪些类别？" },
    answer: {
      en: "Available categories include: **Travel**, **Meals & Entertainment**, **Office Supplies**, **Equipment**, **Training & Education**, **Healthcare**, **Communication**, **Transportation**, and **Other**.",
      cn: "可用类别包括：**差旅**、**餐饮娱乐**、**办公用品**、**设备**、**培训教育**、**医疗保健**、**通讯**、**交通**和**其他**。",
    },
  },
];

// ── Update Entries ──
const UPDATE_ENTRIES: UpdateEntry[] = [
  {
    version: "v2.5.0",
    date: "2026-02-27",
    title: {
      en: "Approval Workflow, Reimbursement Module & UX Improvements",
      cn: "审批工作流、报销模块与体验优化",
    },
    highlights: [
      { en: "**Reimbursement** is now a standalone module, separated from Adjustments", cn: "**报销**现在是独立模块，从调整项中分离" },
      { en: "Two-level approval workflow for Leave, Adjustments, and Reimbursements", cn: "假期、调整项和报销的两级审批工作流" },
      { en: "Invoice line items now display **local currency** amounts", cn: "发票明细项现在显示**本地币种**金额" },
      { en: "Payslip redesigned with clearer breakdown", cn: "工资条重新设计，分项更清晰" },
    ],
    details: [
      { category: "feature", description: { en: "New standalone **Reimbursements** module with category classification, receipt upload, and approval workflow.", cn: "新增独立**报销**模块，支持分类、收据上传和审批工作流。" } },
      { category: "feature", description: { en: "Two-level approval: submit → client approve/reject → admin confirm for all Leave, Adjustments, and Reimbursements.", cn: "两级审批：提交 → 客户批准/驳回 → 管理员确认，适用于所有假期、调整项和报销。" } },
      { category: "feature", description: { en: "Self-service onboarding invites now support **resend** functionality.", cn: "自助入职邀请现在支持**重新发送**功能。" } },
      { category: "change", description: { en: "Payslip redesigned: Reimbursements separated from Earnings. New **Total Payout** = Net Pay + Reimbursements.", cn: "工资条重新设计：报销从收入中分离。新增**实发总额** = 净工资 + 报销。" } },
      { category: "change", description: { en: "Invoice line items now show **local currency** amounts. Settlement currency only on Subtotal/Total Due.", cn: "发票明细项现在显示**本地币种**金额。结算币种仅在小计/应付总额显示。" } },
      { category: "change", description: { en: "Primary Contact information is now read-only. Contact your EG account manager for changes.", cn: "主要联系人信息现在为只读。如需更改请联系GEA客户经理。" } },
      { category: "change", description: { en: "Employee detail page redesigned with unified layout and consistent field display.", cn: "员工详情页重新设计，统一布局和一致的字段显示。" } },
      { category: "change", description: { en: "Onboarding validation: start date must be today or later, salary currency locked to country's currency.", cn: "入职验证：入职日期必须为今天或之后，薪资币种锁定为国家币种。" } },
    ],
  },
];

// ── Helpers ──
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ── Main Component ──
export default function PortalHelpCenter() {
  const { t, locale } = useI18n();
  const lang: Lang = locale === "zh" ? "cn" : "en";
  const [search, setSearch] = useState("");

  const filteredGuides = useMemo(() => {
    if (!search.trim()) return GUIDE_SECTIONS;
    const q = search.toLowerCase();
    return GUIDE_SECTIONS.filter(
      (g) =>
        g.title[lang].toLowerCase().includes(q) ||
        g.steps.some((s) => s[lang].toLowerCase().includes(q)) ||
        g.tips?.some((t) => t[lang].toLowerCase().includes(q))
    );
  }, [search, lang]);

  const filteredFAQ = useMemo(() => {
    if (!search.trim()) return FAQ_ITEMS;
    const q = search.toLowerCase();
    return FAQ_ITEMS.filter(
      (f) =>
        f.question[lang].toLowerCase().includes(q) ||
        f.answer[lang].toLowerCase().includes(q)
    );
  }, [search, lang]);

  const categoryLabels: Record<string, { en: string; cn: string }> = {
    approval: { en: "Approval", cn: "审批" },
    payroll: { en: "Payroll", cn: "工资" },
    employee: { en: "Employee", cn: "员工" },
    invoice: { en: "Invoice", cn: "发票" },
    account: { en: "Account", cn: "账户" },
    reimbursement: { en: "Reimbursement", cn: "报销" },
  };

  return (
    <PortalLayout title={lang === "cn" ? "帮助中心" : "Help Center"}>
      <div className="p-6 space-y-6 page-enter max-w-4xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {lang === "cn" ? "帮助中心" : "Help Center"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "cn" ? "操作指引、常见问题和更新日志" : "Guides, FAQ, and changelog"}
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={lang === "cn" ? "搜索帮助内容..." : "Search help content..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 placeholder:text-muted-foreground/70"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="guides">
          <TabsList>
            <TabsTrigger value="guides" className="gap-1.5">
              <BookOpen className="w-4 h-4" />
              {lang === "cn" ? "操作指引" : "Guides"}
            </TabsTrigger>
            <TabsTrigger value="faq" className="gap-1.5">
              <HelpCircle className="w-4 h-4" />
              FAQ
            </TabsTrigger>
            <TabsTrigger value="updates" className="gap-1.5">
              <History className="w-4 h-4" />
              {lang === "cn" ? "更新日志" : "Changelog"}
            </TabsTrigger>
          </TabsList>

          {/* Guides Tab */}
          <TabsContent value="guides" className="mt-4 space-y-4">
            {filteredGuides.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <BookOpen className="w-10 h-10 mx-auto mb-3" />
                  <p>{lang === "cn" ? "未找到匹配的指引" : "No matching guides found"}</p>
                </CardContent>
              </Card>
            ) : (
              <Accordion type="multiple" className="space-y-3">
                {filteredGuides.map((guide) => (
                  <AccordionItem key={guide.id} value={guide.id} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <guide.icon className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-medium text-left">{guide.title[lang]}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 pb-4">
                      <div className="space-y-2 ml-11">
                        {guide.steps.map((step, i) => (
                          <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                            <RichText text={step[lang]} />
                          </p>
                        ))}
                        {guide.tips && guide.tips.length > 0 && (
                          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {lang === "cn" ? "提示" : "Tips"}
                            </p>
                            {guide.tips.map((tip, i) => (
                              <p key={i} className="text-xs text-amber-700/80 leading-relaxed">
                                <RichText text={tip[lang]} />
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>

          {/* FAQ Tab */}
          <TabsContent value="faq" className="mt-4">
            {filteredFAQ.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <HelpCircle className="w-10 h-10 mx-auto mb-3" />
                  <p>{lang === "cn" ? "未找到匹配的问题" : "No matching questions found"}</p>
                </CardContent>
              </Card>
            ) : (
              <Accordion type="multiple" className="space-y-3">
                {filteredFAQ.map((faq) => (
                  <AccordionItem key={faq.id} value={faq.id} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {categoryLabels[faq.category]?.[lang] || faq.category}
                        </Badge>
                        <span className="font-medium text-left">{faq.question[lang]}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 pb-4 ml-[72px]">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        <RichText text={faq.answer[lang]} />
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>

          {/* Changelog Tab */}
          <TabsContent value="updates" className="mt-4 space-y-6">
            {UPDATE_ENTRIES.map((entry) => (
              <Card key={entry.version}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Badge className="bg-primary text-primary-foreground">{entry.version}</Badge>
                    <span className="text-sm text-muted-foreground">{entry.date}</span>
                  </div>
                  <h3 className="text-lg font-semibold mb-3">{entry.title[lang]}</h3>

                  {/* Highlights */}
                  <div className="space-y-2 mb-4">
                    {entry.highlights.map((h, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <p className="text-sm"><RichText text={h[lang]} /></p>
                      </div>
                    ))}
                  </div>

                  {/* Details */}
                  <div className="border-t pt-4 space-y-2">
                    {entry.details.map((d, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Badge
                          variant="outline"
                          className={
                            d.category === "feature"
                              ? "bg-blue-50 text-blue-700 border-blue-200 text-[10px]"
                              : d.category === "fix"
                              ? "bg-red-50 text-red-700 border-red-200 text-[10px]"
                              : "bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                          }
                        >
                          {d.category === "feature"
                            ? lang === "cn" ? "新功能" : "New"
                            : d.category === "fix"
                            ? lang === "cn" ? "修复" : "Fix"
                            : lang === "cn" ? "变更" : "Change"}
                        </Badge>
                        <p className="text-sm text-muted-foreground">
                          <RichText text={d.description[lang]} />
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </PortalLayout>
  );
}
