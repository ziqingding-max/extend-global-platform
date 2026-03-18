/**
 * Portal Layout — Client/CP-facing top navigation layout (Glassmorphism Redesign)
 *
 * Design: Top navigation bar with company name + pill tabs + user avatar
 * Aurora gradient background + frosted glass cards
 * Supports CP white-label branding (logo, colors)
 * i18n: EN/ZH language switching
 */

import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { useCpBranding } from "@/hooks/useCpBranding";
import { useI18n } from "@/lib/i18n";
import { portalPath, getPortalBasePath } from "@/lib/portalBasePath";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ArrowUpDown,
  CalendarDays,
  Receipt,
  Settings,
  LogOut,
  Menu,
  X,
  KeyRound,
  Building2,
  Loader2,
  DollarSign,
  Globe,
  HelpCircle,
  Calculator,
  BookOpen,
  Wallet,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { portalTrpc } from "@/lib/portalTrpc";
import { toast } from "sonner";

import type { LucideIcon } from "lucide-react";

/* ─── Types ─── */
interface NavItem {
  labelKey: string;
  icon: LucideIcon;
  href: string;
}

interface NavGroup {
  labelKey: string;
  icon: LucideIcon;
  items: NavItem[];
}

/* ─── Build navigation groups ─── */
function buildPortalNavGroups(): NavGroup[] {
  return [
    {
      labelKey: "nav.overview",
      icon: LayoutDashboard,
      items: [
        { labelKey: "nav.dashboard", icon: LayoutDashboard, href: portalPath("/") },
      ],
    },
    {
      labelKey: "nav.people",
      icon: Users,
      items: [
        { labelKey: "nav.onboarding", icon: UserPlus, href: portalPath("/onboarding") },
        { labelKey: "nav.people", icon: Users, href: portalPath("/people") },
      ],
    },
    {
      labelKey: "nav.operations",
      icon: DollarSign,
      items: [
        { labelKey: "nav.payroll", icon: DollarSign, href: portalPath("/payroll") },
        { labelKey: "nav.adjustments", icon: ArrowUpDown, href: portalPath("/adjustments") },
        { labelKey: "nav.reimbursements", icon: Receipt, href: portalPath("/reimbursements") },
        { labelKey: "nav.leave", icon: CalendarDays, href: portalPath("/leave") },
      ],
    },
    {
      labelKey: "nav.finance",
      icon: Wallet,
      items: [
        { labelKey: "nav.invoices", icon: Receipt, href: portalPath("/invoices") },
        { labelKey: "nav.wallet", icon: Wallet, href: portalPath("/wallet") },
      ],
    },
    {
      labelKey: "nav.toolkit",
      icon: Calculator,
      items: [
        { labelKey: "nav.costSimulator", icon: Calculator, href: portalPath("/cost-simulator") },
        { labelKey: "nav.countryGuide", icon: BookOpen, href: portalPath("/country-guide") },
      ],
    },
    {
      labelKey: "nav.resources",
      icon: HelpCircle,
      items: [
        { labelKey: "nav.knowledgeBase", icon: HelpCircle, href: portalPath("/knowledge-base") },
      ],
    },
  ];
}

/* ─── Nav Pill with Dropdown ─── */
function PortalNavPill({
  group,
  isActive,
  t,
}: {
  group: NavGroup;
  isActive: boolean;
  t: (key: string) => string;
}) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const dashboardHref = portalPath("/");

  // Single item group — direct link
  if (group.items.length === 1) {
    const item = group.items[0];
    const active = location === item.href || (item.href !== dashboardHref && location.startsWith(item.href));
    return (
      <Link href={item.href}>
        <div
          className={cn(
            "nav-pill flex items-center gap-1.5 whitespace-nowrap",
            active && "active"
          )}
        >
          <group.icon className="w-3.5 h-3.5" />
          <span>{t(group.labelKey)}</span>
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
          <span>{t(group.labelKey)}</span>
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
            (item.href !== dashboardHref && location.startsWith(item.href));
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-sm cursor-pointer",
                    active ? "text-primary font-medium" : "text-foreground/80"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0 opacity-70" />
                  <span>{t(item.labelKey)}</span>
                </div>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Mobile Nav Sheet ─── */
function PortalMobileNav({
  navGroups,
  open,
  onClose,
  t,
}: {
  navGroups: NavGroup[];
  open: boolean;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const [location] = useLocation();
  const dashboardHref = portalPath("/");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
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
            <div key={group.labelKey}>
              <div className="px-2 mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {t(group.labelKey)}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    location === item.href ||
                    (item.href !== dashboardHref && location.startsWith(item.href));
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
                        <span className="truncate">{t(item.labelKey)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Settings link in mobile nav */}
          <div>
            <div className="px-2 mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {t("nav.settings")}
              </span>
            </div>
            <Link href={portalPath("/settings")}>
              <div
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
                  location.startsWith(portalPath("/settings"))
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground/70 hover:bg-white/30 hover:text-foreground"
                )}
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
                <span>{t("nav.settings")}</span>
              </div>
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN PORTAL LAYOUT
   ═══════════════════════════════════════════════════ */
interface PortalLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function PortalLayout({ children, title }: PortalLayoutProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading, logout } = usePortalAuth();
  const { branding, isCp } = useCpBranding();
  const { t, locale, setLocale } = useI18n();

  // Change Password state
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const changePasswordMutation = portalTrpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully");
      setChangePasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to change password");
    },
  });
  const handleChangePassword = () => {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword, confirmNewPassword });
  };

  const navGroups = useMemo(() => buildPortalNavGroups(), []);
  const dashboardHref = portalPath("/");

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen aurora-bg">
        <div className="glass-card p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    window.location.href = portalPath("/login");
    return null;
  }

  const userInitials = user.contactName
    ? user.contactName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <div className="flex flex-col h-screen overflow-hidden aurora-bg">
      {/* ═══ Top Navigation Bar ═══ */}
      <header className="flex-shrink-0 top-nav z-40">
        <div className="flex items-center h-14 px-4 lg:px-6 gap-2">
          {/* Company Logo / Name — supports CP white-label branding */}
          <Link href={portalPath("/")}>
            <div className="flex items-center gap-2.5 mr-4 cursor-pointer flex-shrink-0">
              {isCp && branding?.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.companyName}
                  className="h-7 object-contain"
                />
              ) : (
                <img
                  src="/brand/gea-logo-icon.png"
                  alt="EG"
                  className="w-7 h-7 object-contain"
                />
              )}
              <span className="hidden md:block font-semibold text-sm tracking-tight text-foreground">
                {user.companyName}
              </span>
            </div>
          </Link>

          {/* Desktop Pill Navigation */}
          <nav className="hidden lg:flex items-center gap-1 flex-1 overflow-x-auto">
            {navGroups.map((group) => {
              const isActive = group.items.some(
                (item) =>
                  location === item.href ||
                  (item.href !== dashboardHref && location.startsWith(item.href))
              );
              return (
                <PortalNavPill
                  key={group.labelKey}
                  group={group}
                  isActive={isActive}
                  t={t}
                />
              );
            })}

            {/* Settings pill */}
            <Link href={portalPath("/settings")}>
              <div
                className={cn(
                  "nav-pill flex items-center gap-1.5 whitespace-nowrap",
                  location.startsWith(portalPath("/settings")) && "active"
                )}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{t("nav.settings")}</span>
              </div>
            </Link>
          </nav>

          {/* Spacer for mobile */}
          <div className="flex-1 lg:hidden" />

          {/* Right side actions */}
          <div className="flex items-center gap-1.5">
            {/* Language Toggle */}
            <button
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/30 transition-all duration-200"
              onClick={() => setLocale(locale === "en" ? "zh" : "en")}
              title={locale === "en" ? "切换到中文" : "Switch to English"}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{locale === "en" ? "EN" : "中"}</span>
            </button>

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
                    {user.contactName}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground hidden md:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  {user.portalRole === "admin"
                    ? "Administrator"
                    : user.portalRole === "hr_manager"
                    ? "HR Manager"
                    : user.portalRole === "finance"
                    ? "Finance"
                    : "Viewer"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
                  <KeyRound className="w-4 h-4 mr-2" />
                  Change Password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={logout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  {t("nav.signOut")}
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
      </header>

      {/* ═══ Mobile Navigation Sheet ═══ */}
      <PortalMobileNav
        navGroups={navGroups}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        t={t}
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
        open={changePasswordOpen}
        onOpenChange={(open) => {
          setChangePasswordOpen(open);
          if (!open) {
            setCurrentPassword("");
            setNewPassword("");
            setConfirmNewPassword("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md glass-card">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="glass-input"
              />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="glass-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="glass-input"
              />
              {confirmNewPassword && newPassword !== confirmNewPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              className="btn-gradient"
              onClick={handleChangePassword}
              disabled={
                changePasswordMutation.isPending ||
                !currentPassword ||
                !newPassword ||
                newPassword !== confirmNewPassword ||
                newPassword.length < 8
              }
            >
              {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
