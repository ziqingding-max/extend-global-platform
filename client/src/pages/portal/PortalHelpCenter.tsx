/**
 * Portal Help Center
 * Client-facing help center with guides, FAQ, changelog, and glossary
 * Client-facing help center with search
 */
import { useState, useMemo } from "react";
import PortalLayout from "@/components/PortalLayout";
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

type Lang = "en";

interface GuideSection {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: { en: string };
  steps: { en: string }[];
  tips?: { en: string }[];
}

interface FAQItem {
  id: string;
  category: string;
  question: { en: string };
  answer: { en: string };
}

interface UpdateEntry {
  version: string;
  date: string;
  title: { en: string };
  highlights: { en: string }[];
  details: {
    category: "fix" | "feature" | "change";
    description: { en: string };
  }[];
}

// ── Guide Sections ──
const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "getting-started",
    icon: BookOpen,
    title: { en: "Getting Started" },
    steps: [
      { en: "1. Log in to the Client Portal using the credentials provided by your EG account manager." },
      { en: "2. Your **Dashboard** shows an overview of your employees, pending approvals, and recent invoices." },
      { en: "3. Use the sidebar navigation to access different modules: Employees, Payroll, Adjustments, Leave, Reimbursements, Invoices, etc." },
      { en: "4. Use the notification bell in the top-right corner to stay updated on important events." },
    ],
    tips: [
      { en: "Bookmark the portal URL for quick access. Your login session persists for 7 days." },
    ],
  },
  {
    id: "employee-management",
    icon: Users,
    title: { en: "Employee Management" },
    steps: [
      { en: "1. Navigate to **Employees** to view all your employees and their current status." },
      { en: "2. Click on an employee to view their full profile including personal info, employment details, documents, contracts, and leave balances." },
      { en: "3. To onboard a new employee, go to **Onboarding** and fill in the required information, or send a self-service invite link to the employee." },
      { en: "4. For self-service onboarding, the employee will receive an email with a link to fill in their personal details." },
    ],
    tips: [
      { en: "Employee start date cannot be earlier than today when creating a new onboarding." },
      { en: "The salary currency is automatically determined by the employment country and cannot be changed." },
    ],
  },
  {
    id: "adjustments",
    icon: ArrowUpDown,
    title: { en: "Adjustments" },
    steps: [
      { en: "1. Navigate to **Adjustments** to view and manage salary adjustments for your employees." },
      { en: "2. Click **New Adjustment** to create an adjustment. Select the employee, type (bonus, allowance, deduction, etc.), and enter the amount." },
      { en: "3. Adjustments go through an approval workflow: after submission, you can **approve** or **reject** them." },
      { en: "4. Approved adjustments are then reviewed by the EG admin team for final confirmation." },
    ],
    tips: [
      { en: "Adjustments are included in the next payroll run after they are fully approved and locked." },
      { en: "Attachment upload is optional for adjustments but recommended for audit purposes." },
    ],
  },
  {
    id: "leave-management",
    icon: CalendarDays,
    title: { en: "Leave Management" },
    steps: [
      { en: "1. Navigate to **Leave** to view all leave requests for your employees." },
      { en: "2. Click **New Leave Request** to submit a leave request. Select the employee, leave type, start/end dates." },
      { en: "3. Leave days are automatically calculated based on the date range (excluding weekends)." },
      { en: "4. After submission, you can **approve** or **reject** the leave request. Approved requests go to EG admin for final confirmation." },
    ],
    tips: [
      { en: "Unpaid leave will result in a salary deduction calculated automatically during payroll." },
      { en: "Cross-month leave is automatically split by natural month for payroll purposes." },
    ],
  },
  {
    id: "reimbursements",
    icon: Receipt,
    title: { en: "Reimbursements" },
    steps: [
      { en: "1. Navigate to **Reimbursements** to view and manage expense reimbursement requests." },
      { en: "2. Click **New Reimbursement** to submit a reimbursement. Select the employee, category (travel, meals, equipment, etc.), and enter the amount." },
      { en: "3. Upload the receipt or supporting document for the reimbursement." },
      { en: "4. After submission, you can **approve** or **reject** the reimbursement. Approved items go to EG admin for final confirmation." },
    ],
    tips: [
      { en: "Reimbursements are separate from salary and do not affect Gross Pay calculations." },
      { en: "Approved reimbursements appear as a separate section on the employee's payslip." },
    ],
  },
  {
    id: "invoices",
    icon: FileText,
    title: { en: "Invoices" },
    steps: [
      { en: "1. Navigate to **Invoices** to view all invoices issued to your company." },
      { en: "2. Click on an invoice to view its details, including line items, subtotal, and total due." },
      { en: "3. Line items show amounts in **local currency**. The settlement currency total is shown in Subtotal and Total Due." },
      { en: "4. You can download the invoice as a PDF for your records." },
    ],
    tips: [
      { en: "Invoice status flow: Draft → Sent → Paid. Overdue invoices are automatically detected." },
      { en: "If a credit note has been applied, the PDF will show 'Less: Credit Note Applied' with the adjusted amount." },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    title: { en: "Account Settings" },
    steps: [
      { en: "1. Navigate to **Settings** to manage your company information and portal users." },
      { en: "2. **Company Information**: View and edit your company details. Note that legal entity name and settlement currency are read-only." },
      { en: "3. **Portal Users**: Manage who has access to the portal. You can invite new users via email." },
      { en: "4. **Primary Contact**: This information is managed by your EG account manager and is read-only in the portal." },
    ],
    tips: [
      { en: "To change your primary contact information, please contact your EG account manager." },
    ],
  },
];

// ── FAQ Items ──
const FAQ_ITEMS: FAQItem[] = [
  {
    id: "faq-1",
    category: "approval",
    question: { en: "How does the approval workflow work?" },
    answer: {
      en: "Leave requests, adjustments, and reimbursements follow a two-level approval process: **1)** After submission, you (the client) can approve or reject the item. **2)** Once you approve, it goes to the EG admin team for final confirmation. Only after both levels of approval will the item be locked and included in payroll.",
    },
  },
  {
    id: "faq-2",
    category: "payroll",
    question: { en: "When is the payroll cutoff date?" },
    answer: {
      en: "The payroll cutoff is on the **4th of each month at 23:59 (Beijing time)**. All approved adjustments, leave records, and reimbursements for the current month are automatically locked after this date.",
    },
  },
  {
    id: "faq-3",
    category: "payroll",
    question: { en: "What is the difference between Gross Pay, Net Pay, and Total Payout?" },
    answer: {
      en: "**Gross Pay** = Base Salary + Bonuses + Allowances (does NOT include reimbursements). **Net Pay** = Gross Pay - Deductions (tax, social insurance, unpaid leave, etc.). **Total Payout** = Net Pay + Reimbursements — this is the actual amount the employee receives.",
    },
  },
  {
    id: "faq-4",
    category: "employee",
    question: { en: "How do I onboard a new employee?" },
    answer: {
      en: "Go to **Onboarding** in the sidebar. You can either fill in the employee details directly, or send a **self-service invite link** to the employee so they can fill in their own information. The start date must be today or later, and the salary currency is automatically set based on the employment country.",
    },
  },
  {
    id: "faq-5",
    category: "invoice",
    question: { en: "Why do invoice line items show different currencies?" },
    answer: {
      en: "Invoice line items display amounts in the **local currency** of the employee's work country (e.g., SGD for Singapore, JPY for Japan). The settlement currency (e.g., USD) is only shown in the Subtotal and Total Due, which includes exchange rate conversion.",
    },
  },
  {
    id: "faq-6",
    category: "account",
    question: { en: "How do I change my primary contact information?" },
    answer: {
      en: "Primary contact information is managed by your EG account manager for security reasons. Please contact your EG representative to make changes.",
    },
  },
  {
    id: "faq-7",
    category: "account",
    question: { en: "I forgot my password. How do I reset it?" },
    answer: {
      en: "Click **Forgot Password** on the login page and enter your email address. You will receive a reset link via email. If you don't receive the email, contact your EG account manager who can reset your password directly.",
    },
  },
  {
    id: "faq-8",
    category: "reimbursement",
    question: { en: "What categories are available for reimbursements?" },
    answer: {
      en: "Available categories include: **Travel**, **Meals & Entertainment**, **Office Supplies**, **Equipment**, **Training & Education**, **Healthcare**, **Communication**, **Transportation**, and **Other**.",
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
    },
    highlights: [
      { en: "**Reimbursement** is now a standalone module, separated from Adjustments" },
      { en: "Two-level approval workflow for Leave, Adjustments, and Reimbursements" },
      { en: "Invoice line items now display **local currency** amounts" },
      { en: "Payslip redesigned with clearer breakdown" },
    ],
    details: [
      { category: "feature", description: { en: "New standalone **Reimbursements** module with category classification, receipt upload, and approval workflow." } },
      { category: "feature", description: { en: "Two-level approval: submit → client approve/reject → admin confirm for all Leave, Adjustments, and Reimbursements." } },
      { category: "feature", description: { en: "Self-service onboarding invites now support **resend** functionality." } },
      { category: "change", description: { en: "Payslip redesigned: Reimbursements separated from Earnings. New **Total Payout** = Net Pay + Reimbursements." } },
      { category: "change", description: { en: "Invoice line items now show **local currency** amounts. Settlement currency only on Subtotal/Total Due." } },
      { category: "change", description: { en: "Primary Contact information is now read-only. Contact your EG account manager for changes." } },
      { category: "change", description: { en: "Employee detail page redesigned with unified layout and consistent field display." } },
      { category: "change", description: { en: "Onboarding validation: start date must be today or later, salary currency locked to country's currency." } },
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
  const lang: Lang = "en";
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

  const categoryLabels: Record<string, { en: string }> = {
    approval: { en: "Approval" },
    payroll: { en: "Payroll" },
    employee: { en: "Employee" },
    invoice: { en: "Invoice" },
    account: { en: "Account" },
    reimbursement: { en: "Reimbursement" },
  };

  return (
    <PortalLayout title={"Help Center"}>
      <div className="p-6 space-y-6 page-enter max-w-4xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {"Help Center"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {"Guides, FAQ, and changelog"}
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={"Search help content..."}
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
              {"Guides"}
            </TabsTrigger>
            <TabsTrigger value="faq" className="gap-1.5">
              <HelpCircle className="w-4 h-4" />
              FAQ
            </TabsTrigger>
            <TabsTrigger value="updates" className="gap-1.5">
              <History className="w-4 h-4" />
              {"Changelog"}
            </TabsTrigger>
          </TabsList>

          {/* Guides Tab */}
          <TabsContent value="guides" className="mt-4 space-y-4">
            {filteredGuides.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <BookOpen className="w-10 h-10 mx-auto mb-3" />
                  <p>{"No matching guides found"}</p>
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
                              {"Tips"}
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
                  <p>{"No matching questions found"}</p>
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
                            ? "New"
                            : d.category === "fix"
                            ? "Fix"
                            : "Change"}
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
