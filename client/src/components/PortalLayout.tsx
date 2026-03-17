/**
 * Portal Layout — Client-facing sidebar layout
 *
 * Design: Apple Liquid Glass design language with backdrop-blur,
 * semi-transparent surfaces, and smooth animations.
 * Integrated with i18n for EN/ZH language switching.
 */

import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { usePortalAuth } from "@/hooks/usePortalAuth";
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
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Building2,
  Loader2,
  DollarSign,
  Globe,
  HelpCircle,
  Calculator,
  BookOpen,
  Wallet,
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

interface NavItem {
  labelKey: string;
  icon: LucideIcon;
  href: string;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

function buildPortalNavGroups(): NavGroup[] {
  return [
    {
      labelKey: "nav.overview",
      items: [
        { labelKey: "nav.dashboard", icon: LayoutDashboard, href: portalPath("/") },
      ],
    },
    {
      labelKey: "nav.people",
      items: [
        { labelKey: "nav.onboarding", icon: UserPlus, href: portalPath("/onboarding") },
        { labelKey: "nav.people", icon: Users, href: portalPath("/people") },
      ],
    },
    {
      labelKey: "nav.operations",
      items: [
        { labelKey: "nav.payroll", icon: DollarSign, href: portalPath("/payroll") },
        { labelKey: "nav.adjustments", icon: ArrowUpDown, href: portalPath("/adjustments") },
        { labelKey: "nav.reimbursements", icon: Receipt, href: portalPath("/reimbursements") },
        { labelKey: "nav.leave", icon: CalendarDays, href: portalPath("/leave") },
      ],
    },
    {
      labelKey: "nav.finance",
      items: [
        { labelKey: "nav.invoices", icon: Receipt, href: portalPath("/invoices") },
        { labelKey: "nav.wallet", icon: Wallet, href: portalPath("/wallet") },
      ],
    },
    {
      labelKey: "nav.toolkit",
      items: [
        { labelKey: "nav.costSimulator", icon: Calculator, href: portalPath("/cost-simulator") },
        { labelKey: "nav.countryGuide", icon: BookOpen, href: portalPath("/country-guide") },
      ],
    },
    {
      labelKey: "nav.resources",
      items: [
        { labelKey: "nav.knowledgeBase", icon: HelpCircle, href: portalPath("/knowledge-base") },
      ],
    },
  ];
}

interface PortalLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function PortalLayout({ children, title }: PortalLayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading, logout } = usePortalAuth();
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
    if (newPassword.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (newPassword !== confirmNewPassword) { toast.error("Passwords do not match"); return; }
    changePasswordMutation.mutate({ currentPassword, newPassword, confirmNewPassword });
  };
  const navGroups = useMemo(() => buildPortalNavGroups(), []);

  // Loading state — minimal screen to avoid "dashboard flash" before login redirect
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not authenticated — redirect to portal login
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

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Company Logo / Name */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-4 border-b border-white/10"
      )}>
        {collapsed ? (
          <img 
            src="/brand/gea-logo-icon.png" 
            alt="EG" 
            className="w-8 h-8 flex-shrink-0 object-contain"
          />
        ) : (
          <div className="min-w-0">
            <img 
              src="/brand/gea-logo-horizontal-white.png" 
              alt="GEA - Global Employment Advisors" 
              className="h-10 object-contain"
            />
            <div className="text-xs text-white/50 leading-tight mt-1">{user.companyName} · {t("nav.clientPortal")}</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navGroups.map((group) => (
          <div key={group.labelKey}>
            {!collapsed && (
              <div className="px-3 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  {t(group.labelKey)}
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const dashboardHref = portalPath("/");
                const isActive = location === item.href || (item.href !== dashboardHref && location.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
                        collapsed ? "justify-center" : "",
                        isActive
                          ? "bg-white/20 text-white shadow-sm backdrop-blur-sm"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <item.icon className={cn("flex-shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4")} />
                      {!collapsed && (
                        <span className="flex-1 truncate">{t(item.labelKey)}</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/10 p-2 space-y-0.5">
        {/* Language switcher */}
        <button
          onClick={() => setLocale(locale === "en" ? "zh" : "en")}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer w-full",
            collapsed ? "justify-center" : "",
            "text-white/70 hover:bg-white/10 hover:text-white"
          )}
        >
          <Globe className={cn("flex-shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4")} />
          {!collapsed && <span>{locale === "en" ? "中文" : "English"}</span>}
        </button>

        <Link href={portalPath("/settings")}>
          <div className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
            collapsed ? "justify-center" : "",
            location.startsWith(portalPath("/settings"))
              ? "bg-white/20 text-white shadow-sm backdrop-blur-sm"
              : "text-white/70 hover:bg-white/10 hover:text-white"
          )}>
            <Settings className={cn("flex-shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4")} />
            {!collapsed && <span>{t("nav.settings")}</span>}
          </div>
        </Link>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className={cn(
              "flex items-center gap-3 px-3 py-2 mt-2 rounded-xl cursor-pointer",
              "hover:bg-white/10 transition-all duration-200"
            )}>
              <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-white">{userInitials}</span>
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{user.contactName}</div>
                  <div className="text-xs text-white/50 truncate">{user.email}</div>
                </div>
              )}
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              {user.portalRole === "admin" ? "Administrator" : user.portalRole === "hr_manager" ? "HR Manager" : user.portalRole === "finance" ? "Finance" : "Viewer"}
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

          {/* Change Password Dialog */}
          <Dialog open={changePasswordOpen} onOpenChange={(open) => { setChangePasswordOpen(open); if (!open) { setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Password</DialogTitle>
                <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <Input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="Re-enter new password" />
                  {confirmNewPassword && newPassword !== confirmNewPassword && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setChangePasswordOpen(false)}>Cancel</Button>
                <Button onClick={handleChangePassword} disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || newPassword !== confirmNewPassword || newPassword.length < 8}>
                  {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DropdownMenu>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center justify-center w-full py-2 border-t border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden portal-glass-bg">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out glass-sidebar",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-60 flex flex-col z-50 glass-sidebar">
            <button
              className="absolute top-3 right-3 text-white/60 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header - Glass effect */}
        <header className="flex-shrink-0 h-14 glass-header flex items-center px-4 gap-4 z-10">
          {/* Mobile menu button */}
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Title */}
          <div className="flex-1 min-w-0">
            {title && (
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            )}
          </div>

          {/* User quick info */}
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="w-4 h-4" />
            <span>{user.companyName}</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto portal-content">
          {children}
        </main>
      </div>
    </div>
  );
}
