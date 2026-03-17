// EG — Mock Data Store
// Provides realistic sample data for all modules

export const employees = [
  { id: "EMP-001", name: "Sarah Chen", email: "sarah.chen@techcorp.com", country: "Singapore", department: "Engineering", role: "Senior Engineer", salary: 12500, currency: "SGD", status: "active", startDate: "2023-03-15", contractType: "Full-time", manager: "David Kim", avatar: "SC" },
  { id: "EMP-002", name: "Marcus Weber", email: "m.weber@techcorp.com", country: "Germany", department: "Product", role: "Product Manager", salary: 8200, currency: "EUR", status: "active", startDate: "2022-11-01", contractType: "Full-time", manager: "Lisa Park", avatar: "MW" },
  { id: "EMP-003", name: "Priya Sharma", email: "priya.s@techcorp.com", country: "India", department: "Design", role: "UX Designer", salary: 180000, currency: "INR", status: "active", startDate: "2024-01-10", contractType: "Full-time", manager: "David Kim", avatar: "PS" },
  { id: "EMP-004", name: "James O'Brien", email: "j.obrien@techcorp.com", country: "United Kingdom", department: "Sales", role: "Account Executive", salary: 6800, currency: "GBP", status: "active", startDate: "2023-07-22", contractType: "Full-time", manager: "Lisa Park", avatar: "JO" },
  { id: "EMP-005", name: "Yuki Tanaka", email: "y.tanaka@techcorp.com", country: "Japan", department: "Engineering", role: "Backend Developer", salary: 950000, currency: "JPY", status: "onboarding", startDate: "2024-02-01", contractType: "Full-time", manager: "David Kim", avatar: "YT" },
  { id: "EMP-006", name: "Ana Rodrigues", email: "ana.r@techcorp.com", country: "Brazil", department: "Marketing", role: "Marketing Lead", salary: 18000, currency: "BRL", status: "active", startDate: "2022-06-14", contractType: "Full-time", manager: "Lisa Park", avatar: "AR" },
  { id: "EMP-007", name: "Kwame Asante", email: "k.asante@techcorp.com", country: "Ghana", department: "Finance", role: "Financial Analyst", salary: 4500, currency: "USD", status: "active", startDate: "2023-09-05", contractType: "Full-time", manager: "David Kim", avatar: "KA" },
  { id: "EMP-008", name: "Elena Popescu", email: "e.popescu@techcorp.com", country: "Romania", department: "Engineering", role: "Frontend Developer", salary: 5200, currency: "EUR", status: "active", startDate: "2023-05-18", contractType: "Full-time", manager: "David Kim", avatar: "EP" },
  { id: "EMP-009", name: "Carlos Mendez", email: "c.mendez@techcorp.com", country: "Mexico", department: "Customer Success", role: "CS Manager", salary: 65000, currency: "MXN", status: "inactive", startDate: "2021-12-01", contractType: "Full-time", manager: "Lisa Park", avatar: "CM" },
  { id: "EMP-010", name: "Fatima Al-Rashid", email: "f.alrashid@techcorp.com", country: "UAE", department: "Legal", role: "Legal Counsel", salary: 28000, currency: "AED", status: "active", startDate: "2023-02-28", contractType: "Full-time", manager: "Lisa Park", avatar: "FA" },
  { id: "EMP-011", name: "Liam Thompson", email: "l.thompson@techcorp.com", country: "Australia", department: "Engineering", role: "DevOps Engineer", salary: 14000, currency: "AUD", status: "active", startDate: "2022-08-10", contractType: "Full-time", manager: "David Kim", avatar: "LT" },
  { id: "EMP-012", name: "Mei Lin", email: "mei.lin@techcorp.com", country: "China", department: "Operations", role: "Operations Analyst", salary: 35000, currency: "CNY", status: "onboarding", startDate: "2024-02-15", contractType: "Full-time", manager: "David Kim", avatar: "ML" },
];

export const payrollRuns = [
  { id: "PAY-2024-02", period: "February 2024", status: "processing", totalAmount: 892450, currency: "USD", employeeCount: 11, dueDate: "2024-02-28", processedDate: null },
  { id: "PAY-2024-01", period: "January 2024", status: "completed", totalAmount: 875200, currency: "USD", employeeCount: 10, dueDate: "2024-01-31", processedDate: "2024-01-30" },
  { id: "PAY-2023-12", period: "December 2023", status: "completed", totalAmount: 868900, currency: "USD", employeeCount: 10, dueDate: "2023-12-31", processedDate: "2023-12-29" },
  { id: "PAY-2023-11", period: "November 2023", status: "completed", totalAmount: 861500, currency: "USD", employeeCount: 9, dueDate: "2023-11-30", processedDate: "2023-11-29" },
  { id: "PAY-2023-10", period: "October 2023", status: "completed", totalAmount: 854200, currency: "USD", employeeCount: 9, dueDate: "2023-10-31", processedDate: "2023-10-30" },
];

export const complianceItems = [
  { id: "COMP-001", title: "Singapore MOM Work Pass Renewal", country: "Singapore", employee: "Sarah Chen", category: "Work Authorization", dueDate: "2024-03-15", status: "due_soon", priority: "high", description: "Employment Pass renewal required 30 days before expiry." },
  { id: "COMP-002", title: "Germany Social Security Registration", country: "Germany", employee: "Marcus Weber", category: "Social Security", dueDate: "2024-04-01", status: "pending", priority: "medium", description: "Annual social security contribution report submission." },
  { id: "COMP-003", title: "UK HMRC PAYE Filing", country: "United Kingdom", employee: "James O'Brien", category: "Tax Filing", dueDate: "2024-02-28", status: "overdue", priority: "critical", description: "Monthly PAYE Real Time Information submission overdue." },
  { id: "COMP-004", title: "India PF Annual Return", country: "India", employee: "Priya Sharma", category: "Provident Fund", dueDate: "2024-04-30", status: "pending", priority: "medium", description: "Annual provident fund return filing with EPFO." },
  { id: "COMP-005", title: "Brazil FGTS Monthly Deposit", country: "Brazil", employee: "Ana Rodrigues", category: "Labor Fund", dueDate: "2024-02-07", status: "completed", priority: "high", description: "Monthly FGTS deposit completed successfully." },
  { id: "COMP-006", title: "Japan Health Insurance Renewal", country: "Japan", employee: "Yuki Tanaka", category: "Health Insurance", dueDate: "2024-03-31", status: "pending", priority: "medium", description: "Annual health insurance enrollment renewal." },
  { id: "COMP-007", title: "UAE Labour Contract Registration", country: "UAE", employee: "Fatima Al-Rashid", category: "Labor Contract", dueDate: "2024-03-10", status: "due_soon", priority: "high", description: "New employment contract registration with MOHRE." },
  { id: "COMP-008", title: "Australia Super Contribution Q1", country: "Australia", employee: "Liam Thompson", category: "Superannuation", dueDate: "2024-04-28", status: "pending", priority: "medium", description: "Q1 2024 superannuation guarantee contribution." },
];

export const contracts = [
  { id: "CON-001", employee: "Sarah Chen", type: "Employment Agreement", country: "Singapore", startDate: "2023-03-15", endDate: null, status: "active", lastUpdated: "2023-03-10", signedDate: "2023-03-12" },
  { id: "CON-002", employee: "Marcus Weber", type: "Employment Agreement", country: "Germany", startDate: "2022-11-01", endDate: null, status: "active", lastUpdated: "2022-10-28", signedDate: "2022-10-30" },
  { id: "CON-003", employee: "James O'Brien", type: "Employment Agreement", country: "United Kingdom", startDate: "2023-07-22", endDate: null, status: "active", lastUpdated: "2023-07-18", signedDate: "2023-07-20" },
  { id: "CON-004", employee: "Yuki Tanaka", type: "Employment Agreement", country: "Japan", startDate: "2024-02-01", endDate: null, status: "pending_signature", lastUpdated: "2024-01-25", signedDate: null },
  { id: "CON-005", employee: "Mei Lin", type: "Employment Agreement", country: "China", startDate: "2024-02-15", endDate: null, status: "pending_signature", lastUpdated: "2024-02-01", signedDate: null },
  { id: "CON-006", employee: "Carlos Mendez", type: "Termination Agreement", country: "Mexico", startDate: "2021-12-01", endDate: "2024-01-31", status: "terminated", lastUpdated: "2024-01-15", signedDate: "2024-01-16" },
];

export const onboardingTasks = [
  { id: "ONB-001", employee: "Yuki Tanaka", country: "Japan", step: "Document Collection", status: "in_progress", progress: 60, tasks: [
    { name: "Passport Copy", done: true },
    { name: "Residence Certificate", done: true },
    { name: "Bank Account Details", done: false },
    { name: "Emergency Contact", done: false },
  ]},
  { id: "ONB-002", employee: "Mei Lin", country: "China", step: "Contract Signing", status: "pending", progress: 30, tasks: [
    { name: "Offer Letter Sent", done: true },
    { name: "Contract Review", done: false },
    { name: "Contract Signature", done: false },
    { name: "Benefits Enrollment", done: false },
  ]},
];

export const countries = [
  { code: "SG", name: "Singapore", employees: 1, flag: "🇸🇬" },
  { code: "DE", name: "Germany", employees: 1, flag: "🇩🇪" },
  { code: "IN", name: "India", employees: 1, flag: "🇮🇳" },
  { code: "GB", name: "United Kingdom", employees: 1, flag: "🇬🇧" },
  { code: "JP", name: "Japan", employees: 1, flag: "🇯🇵" },
  { code: "BR", name: "Brazil", employees: 1, flag: "🇧🇷" },
  { code: "GH", name: "Ghana", employees: 1, flag: "🇬🇭" },
  { code: "RO", name: "Romania", employees: 1, flag: "🇷🇴" },
  { code: "MX", name: "Mexico", employees: 1, flag: "🇲🇽" },
  { code: "AE", name: "UAE", employees: 1, flag: "🇦🇪" },
  { code: "AU", name: "Australia", employees: 1, flag: "🇦🇺" },
  { code: "CN", name: "China", employees: 1, flag: "🇨🇳" },
];

export const monthlyPayrollData = [
  { month: "Sep", amount: 832000 },
  { month: "Oct", amount: 854200 },
  { month: "Nov", amount: 861500 },
  { month: "Dec", amount: 868900 },
  { month: "Jan", amount: 875200 },
  { month: "Feb", amount: 892450 },
];

export const headcountData = [
  { month: "Sep", count: 8 },
  { month: "Oct", count: 9 },
  { month: "Nov", count: 9 },
  { month: "Dec", count: 10 },
  { month: "Jan", count: 10 },
  { month: "Feb", count: 12 },
];

export const departmentData = [
  { name: "Engineering", count: 5, color: "#4f46e5" },
  { name: "Product", count: 1, color: "#0891b2" },
  { name: "Design", count: 1, color: "#059669" },
  { name: "Sales", count: 1, color: "#d97706" },
  { name: "Marketing", count: 1, color: "#dc2626" },
  { name: "Finance", count: 1, color: "#7c3aed" },
  { name: "Others", count: 2, color: "#6b7280" },
];

export const recentActivities = [
  { id: 1, type: "employee_added", message: "Mei Lin added as Operations Analyst in China", time: "2 hours ago", icon: "user-plus" },
  { id: 2, type: "payroll_processed", message: "January 2024 payroll processed for 10 employees", time: "1 day ago", icon: "banknote" },
  { id: 3, type: "compliance_alert", message: "UK HMRC PAYE Filing is overdue — action required", time: "2 days ago", icon: "alert-triangle" },
  { id: 4, type: "contract_signed", message: "Termination agreement signed by Carlos Mendez", time: "3 days ago", icon: "file-check" },
  { id: 5, type: "onboarding_started", message: "Onboarding initiated for Yuki Tanaka in Japan", time: "4 days ago", icon: "clipboard-list" },
  { id: 6, type: "compliance_completed", message: "Brazil FGTS Monthly Deposit completed", time: "5 days ago", icon: "check-circle" },
];
