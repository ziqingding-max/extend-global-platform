/*
 * EG Admin — Layout Component (Glassmorphism Redesign)
 * Design: Top pill navigation bar + aurora gradient background + frosted glass surfaces
 * Navigation: Horizontal pill tabs with dropdown mega-menu for sub-items
 * i18n: Supports English/Chinese toggle
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import {
  LayoutDashboard,
  Loader2,
  Users,
  DollarSign,
  FileText,
  Globe,
  Settings,
  Bell,
  HelpCircle,
  LogOut,
  Menu,
  X,
  Building2,
  ChevronDown,
  CalendarDays,
  Receipt,
  ArrowUpDown,
  Landmark,
  ClipboardList,
  Languages,
  Truck,
  FileStack,
  BarChart3,
  Briefcase,
  BookOpen,
  Bot,
  CheckCircle,
  TrendingUp,
  Activity,
  Layers,
  PieChart,
  KeyRound,
  Handshake,
  ArrowLeftRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import NotificationCenter from "@/components/NotificationCenter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import CpContextSwitcher from "@/components/CpContextSwitcher";
import { useCpContext } from "@/_core/store/cpContextStore";

import type { LucideIcon } from "lucide-react";

/* ─── Nav Group Types ─── */
interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  roles?: string[];
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

/* ─── Build navigation groups based on user role ─── */
function useNavGroups(user: any): NavGroup[] {
  const { t } = useI18n();
  const roleStr = user?.role || "user";

  const hasRole = (allowed: string[]) => {
    const roles = roleStr.split(",").map((r: string) => r.trim());
    return allowed.some((r) => roles.includes(r));
  };

  return useMemo(
    () =>
      [
        /* ── 1. Partner Hub (B2B2B 第一公民) ── */
        {
          label: "Partner Hub",
          icon: Handshake,
          items: [
            { label: "Partners", icon: Handshake, href: "/channel-partners" },
            { label: "CP Wallets", icon: Landmark, href: "/cp-wallets" },
            { label: "CP Pricing", icon: DollarSign, href: "/channel-partners?tab=pricing" },
          ].filter(() => hasRole(["admin"])),
        },
        /* ── 2. Overview ── */
        {
          label: "Overview",
          icon: LayoutDashboard,
          items: [
            { label: t("nav.dashboard"), icon: LayoutDashboard, href: "/" },
            { label: t("nav.profit_loss"), icon: BarChart3, href: "/reports/profit-loss" },
            { label: "Reconciliation", icon: ArrowLeftRight, href: "/reports/reconciliation" },
          ].filter(() => hasRole(["admin", "finance_manager", "operations_manager"])),
        },
        /* ── 3. Operations (EG 核心交付) ── */
        {
          label: "Operations",
          icon: Layers,
          items: [
            { label: t("nav.payroll"), icon: DollarSign, href: "/payroll" },
            { label: "Contractor Invoices", icon: FileStack, href: "/admin/contractor-invoices" },
            { label: t("nav.adjustments"), icon: ArrowUpDown, href: "/adjustments" },
            { label: t("nav.reimbursements"), icon: Receipt, href: "/reimbursements" },
            { label: "Leave & Milestones", icon: CalendarDays, href: "/leave" },
          ].filter(() => hasRole(["admin", "operations_manager"])),
        },
        /* ── 4. Finance & Settlement ── */
        {
          label: "Finance",
          icon: PieChart,
          items: [
            { label: t("nav.invoices"), icon: Receipt, href: "/invoices" },
            { label: "Release Tasks", icon: CheckCircle, href: "/admin/release-tasks" },
          ].filter(() => hasRole(["admin", "finance_manager"])),
        },
        /* ── 5. Client Directory (只读检索池，EG-DIRECT 视角下解锁编辑) ── */
        {
          label: "Client Directory",
          icon: Users,
          items: [
            { label: t("nav.customers"), icon: Building2, href: "/customers" },
            { label: t("nav.people"), icon: Users, href: "/people" },
          ].filter(() => hasRole(["admin", "customer_manager", "operations_manager"])),
        },
        /* ── 6. Vendor ── */
        {
          label: "Vendor",
          icon: Truck,
          items: [
            { label: t("nav.vendors"), icon: Truck, href: "/vendors" },
            { label: t("nav.vendor_bills"), icon: Receipt, href: "/vendor-bills" },
          ].filter(() => hasRole(["admin", "finance_manager"])),
        },
        /* ── 7. Sales ── */
        {
          label: "Sales",
          icon: TrendingUp,
          items: [
            { label: t("nav.crm_pipeline"), icon: Briefcase, href: "/sales-crm" },
            { label: t("nav.quotations"), icon: FileText, href: "/quotations" },
            { label: t("nav.countryGuide"), icon: Globe, href: "/admin/country-guide" },
          ].filter(() => hasRole(["admin", "sales", "customer_manager"])),
        },
        /* ── 8. System ── */
        {
          label: "System",
          icon: Settings,
          items: [
            { label: t("nav.settings"), icon: Settings, href: "/settings", roles: ["admin"] },
            { label: t("nav.knowledge_admin"), icon: BookOpen, href: "/knowledge-base-admin", roles: ["admin"] },
            { label: t("nav.countryGuideAdmin"), icon: Globe, href: "/admin/knowledge/country-guides", roles: ["admin"] },
          ].filter((item) => !item.roles || hasRole(item.roles)),
        },
      ].filter((group) => group.items.length > 0),
    [t, roleStr]
  );
}

/* ─── Nav Pill with Dropdown ─── */
function NavPill({
  group,
  isActive,
}: {
  group: NavGroup;
  isActive: boolean;
}) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  // Single item group — no dropdown needed
  if (group.items.length === 1) {
    const item = group.items[0];
    const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
    return (
      <Link href={item.href}>
        <div
          className={cn(
            "nav-pill flex items-center gap-1.5 whitespace-nowrap",
            active && "active"
          )}
        >
          <group.icon className="w-3.5 h-3.5" />
          <span>{group.label}</span>
        </div>
      </Link>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <div
          className={cn(
            "nav-pill flex items-center gap-1.5 whitespace-nowrap cursor-pointer",
            isActive && "active"
          )}
        >
          <group.icon className="w-3.5 h-3.5" />
          <span>{group.label}</span>
          <ChevronDown
            className={cn(
              "w-3 h-3 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="min-w-[200px] glass-card p-1"
      >
        {group.items.map((item) => {
          const active =
            location === item.href ||
            (item.href !== "/" && location.startsWith(item.href));
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-sm cursor-pointer",
                    active
                      ? "text-primary font-medium"
                      : "text-foreground/80"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0 opacity-70" />
                  <span>{item.label}</span>
                </div>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── CP Context Banner ─── */
function CpContextBanner() {
  const { mode, cpName, setAll } = useCpContext();
  if (mode === "all") return null;

  const label = mode === "direct" ? "EG-DIRECT" : cpName || "Selected CP";
  const bgClass = mode === "direct"
    ? "bg-amber-500/15 border-amber-500/30 text-amber-700"
    : "bg-primary/10 border-primary/30 text-primary";

  return (
    <div className={cn("flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium border-b", bgClass)}>
      <Building2 className="w-3.5 h-3.5" />
      <span>
        Viewing as: <strong>{label}</strong>
        {mode === "direct" && " (Direct Clients — Full Edit Access)"}
      </span>
      <button
        onClick={() => setAll()}
        className="ml-2 underline hover:no-underline opacity-80 hover:opacity-100"
      >
        Clear
      </button>
    </div>
  );
}

/* ─── Mobile Nav Sheet ─── */
function MobileNavSheet({
  navGroups,
  open,
  onClose,
}: {
  navGroups: NavGroup[];
  open: boolean;
  onClose: () => void;
}) {
  const [location] = useLocation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="fixed top-0 right-0 h-full w-72 glass-card rounded-none border-l border-r-0 overflow-y-auto animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-white/20">
          <span className="font-semibold text-sm">Navigation</span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="p-3 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2 mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {group.label}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    location === item.href ||
                    (item.href !== "/" && location.startsWith(item.href));
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-foreground/70 hover:bg-white/30 hover:text-foreground"
                        )}
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN LAYOUT COMPONENT
   ═══════════════════════════════════════════════════ */
interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumb?: string[];
}

export default function Layout({ children, title, breadcrumb }: LayoutProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading, logout } = useAuth();
  const { lang, setLang, t } = useI18n();
  const navGroups = useNavGroups(user);

  // Change Password
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", new: "", confirm: "" });
  const changePasswordMutation = trpc.userManagement.changePassword.useMutation({
    onSuccess: () => {
      toast.success(t("common.changePassword.success"));
      setShowChangePassword(false);
      setPwForm({ current: "", new: "", confirm: "" });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to change password");
    },
  });

  const handleChangePassword = () => {
    if (pwForm.new.length < 8) {
      toast.error(t("common.changePassword.error.tooShort"));
      return;
    }
    if (pwForm.new !== pwForm.confirm) {
      toast.error(t("common.changePassword.error.mismatch"));
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: pwForm.current,
      newPassword: pwForm.new,
    });
  };

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  // Auth guard
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen aurora-bg">
        <div className="glass-card p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    window.location.href = "/login";
    return null;
  }

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "AD";

  return (
    <div className="flex flex-col h-screen overflow-hidden aurora-bg">
      {/* ═══ Top Navigation Bar ═══ */}
      <header className="flex-shrink-0 top-nav z-40">
        <div className="flex items-center h-14 px-4 lg:px-6 gap-2">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-2.5 mr-4 cursor-pointer flex-shrink-0">
              <img
                src="/brand/gea-logo-icon.png"
                alt="EG"
                className="w-7 h-7 object-contain"
              />
              <span className="hidden md:block font-semibold text-sm tracking-tight text-foreground">
                Extend Global
              </span>
            </div>
          </Link>

          {/* Desktop Pill Navigation */}
          <nav className="hidden lg:flex items-center gap-1 flex-1 overflow-x-auto">
            {navGroups.map((group) => {
              const isActive = group.items.some(
                (item) =>
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href))
              );
              return (
                <NavPill key={group.label} group={group} isActive={isActive} />
              );
            })}
          </nav>

          {/* Spacer for mobile */}
          <div className="flex-1 lg:hidden" />

          {/* Right side actions */}
          <div className="flex items-center gap-1.5">
            {/* CP Context Switcher (Task Group B) */}
            <CpContextSwitcher />

            {/* Language Toggle */}
            <button
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/30 transition-all duration-200"
              onClick={() => setLang(lang === "en" ? "zh" : "en")}
              title={lang === "en" ? "切换到中文" : "Switch to English"}
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{lang === "en" ? "EN" : "中"}</span>
            </button>

            {/* Notifications */}
            <NotificationCenter />

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-white/30 transition-all duration-200">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-foreground">
                      {userInitials}
                    </span>
                  </div>
                  <span className="hidden md:block text-sm font-medium text-foreground">
                    {user?.name || "Admin"}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground hidden md:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setShowChangePassword(true)}>
                  <KeyRound className="w-4 h-4 mr-2" />
                  {t("common.changePassword")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => logout()}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {t("common.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/30 transition-all duration-200"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Breadcrumb bar (only if breadcrumb provided) */}
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="px-4 lg:px-6 pb-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {breadcrumb.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span>/</span>}
                  <span
                    className={
                      i === breadcrumb.length - 1
                        ? "text-foreground font-medium"
                        : ""
                    }
                  >
                    {crumb}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ═══ CP Context Banner (Task Group B) ═══ */}
      <CpContextBanner />

      {/* ═══ Mobile Navigation Sheet ═══ */}
      <MobileNavSheet
        navGroups={navGroups}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {/* ═══ Main Content ═══ */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6">
          <div key={location} className="animate-page-in">
            {children}
          </div>
        </div>
      </main>

      {/* ═══ Change Password Dialog ═══ */}
      <Dialog
        open={showChangePassword}
        onOpenChange={(open) => {
          setShowChangePassword(open);
          if (!open) setPwForm({ current: "", new: "", confirm: "" });
        }}
      >
        <DialogContent className="sm:max-w-md glass-card">
          <DialogHeader>
            <DialogTitle>{t("common.changePassword.title")}</DialogTitle>
            <DialogDescription>
              {t("common.changePassword.placeholder.new")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("common.changePassword.currentPassword")}</Label>
              <Input
                type="password"
                placeholder={t("common.changePassword.placeholder.current")}
                value={pwForm.current}
                onChange={(e) =>
                  setPwForm((prev) => ({ ...prev, current: e.target.value }))
                }
                className="glass-input"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("common.changePassword.newPassword")}</Label>
              <Input
                type="password"
                placeholder={t("common.changePassword.placeholder.new")}
                value={pwForm.new}
                onChange={(e) =>
                  setPwForm((prev) => ({ ...prev, new: e.target.value }))
                }
                className="glass-input"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("common.changePassword.confirmPassword")}</Label>
              <Input
                type="password"
                placeholder={t("common.changePassword.placeholder.confirm")}
                value={pwForm.confirm}
                onChange={(e) =>
                  setPwForm((prev) => ({ ...prev, confirm: e.target.value }))
                }
                className="glass-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowChangePassword(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="btn-gradient"
              onClick={handleChangePassword}
              disabled={
                changePasswordMutation.isPending ||
                !pwForm.current ||
                !pwForm.new ||
                !pwForm.confirm
              }
            >
              {changePasswordMutation.isPending
                ? t("common.changePassword.submitting")
                : t("common.changePassword.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
