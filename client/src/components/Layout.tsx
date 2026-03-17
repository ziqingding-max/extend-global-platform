/*
 * GEA Admin — Layout Component
 * Design: Fixed left sidebar (deep slate) + top header + main content area
 * Sidebar: 240px fixed, collapsible to 64px icon-only mode
 * i18n: Supports English/Chinese toggle
 */

import { useState, useLayoutEffect, useRef, useEffect } from "react";
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
  ChevronLeft,
  ChevronRight,
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
  KeyRound
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

import { useMemo } from "react";

function useNavGroups(user: any) {
  const { t } = useI18n();
  const roleStr = user?.role || "user";
  
  const hasRole = (allowed: string[]) => {
    const roles = roleStr.split(",").map((r: string) => r.trim());
    return allowed.some(r => roles.includes(r));
  };

  return useMemo(() => [
    {
      label: "Overview",
      icon: LayoutDashboard,
      items: [
        { label: t("nav.dashboard"), icon: LayoutDashboard, href: "/" },
        { label: t("nav.profit_loss"), icon: BarChart3, href: "/reports/profit-loss" },
      ].filter(() => hasRole(["admin", "finance_manager", "operations_manager"])),
    },
    {
      label: "Sales",
      icon: TrendingUp,
      items: [
        { label: t("nav.crm_pipeline"), icon: Briefcase, href: "/sales-crm" },
        { label: t("nav.quotations"), icon: FileText, href: "/quotations" },
        { label: t("nav.countryGuide"), icon: Globe, href: "/admin/country-guide" },
      ].filter(() => hasRole(["admin", "sales", "customer_manager"])),
    },
    {
      label: "Client Management",
      icon: Users,
      items: [
        { label: t("nav.customers"), icon: Building2, href: "/customers" },
        { label: t("nav.people"), icon: Users, href: "/people" },
      ].filter(() => hasRole(["admin", "customer_manager", "operations_manager"])),
    },
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
    {
      label: "Finance",
      icon: PieChart,
      items: [
        { label: t("nav.invoices"), icon: Receipt, href: "/invoices" },
        { label: "Release Tasks", icon: CheckCircle, href: "/admin/release-tasks" },
      ].filter(() => hasRole(["admin", "finance_manager"])),
    },
    {
      label: "Vendor",
      icon: Truck,
      items: [
        { label: t("nav.vendors"), icon: Truck, href: "/vendors" },
        { label: t("nav.vendor_bills"), icon: Receipt, href: "/vendor-bills" },
      ].filter(() => hasRole(["admin", "finance_manager"])),
    },
    {
      label: "System",
      icon: Settings,
      items: [
        { label: t("nav.settings"), icon: Settings, href: "/settings", roles: ["admin"] },
        { label: t("nav.knowledge_admin"), icon: BookOpen, href: "/knowledge-base-admin", roles: ["admin"] },
        { label: t("nav.countryGuideAdmin"), icon: Globe, href: "/admin/knowledge/country-guides", roles: ["admin"] },
      ].filter(item => !item.roles || hasRole(item.roles)),
    },
  ].filter(group => group.items.length > 0), [t, roleStr]);
}

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumb?: string[];
}

export default function Layout({ children, title, breadcrumb }: LayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const { user, loading, logout } = useAuth();
  const { lang, setLang, t } = useI18n();
  const navGroups = useNavGroups(user);

  const navRef = useRef<HTMLElement>(null);
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

  // Auto-expand group based on current location
  useEffect(() => {
    const activeGroup = navGroups.find(group => 
      group.items.some(item => location === item.href || (item.href !== "/" && location.startsWith(item.href)))
    );
    if (activeGroup && !openGroups.includes(activeGroup.label)) {
      setOpenGroups(prev => [...prev, activeGroup.label]);
    }
  }, [location, navGroups]);

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => 
      prev.includes(label) 
        ? prev.filter(l => l !== label) 
        : [...prev, label]
    );
  };

  // Auth guard: show minimal loading state while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // Not authenticated — redirect to login
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

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-4 border-b",
        "border-sidebar-border"
      )}>
        {collapsed ? (
          <img 
            src="/brand/gea-logo-icon.png" 
            alt="GEA" 
            className="w-8 h-8 flex-shrink-0 object-contain"
          />
        ) : (
          <img 
            src="/brand/gea-logo-horizontal-white.png" 
            alt="GEA - Global Employment Advisors" 
            className="h-10 object-contain"
          />
        )}
      </div>

      {/* Navigation */}
      <nav ref={navRef} className="flex-1 overflow-y-auto py-3 px-2 space-y-2">
        {navGroups.map((group) => {
          const isOpen = openGroups.includes(group.label);
          const isActiveGroup = group.items.some(item => location === item.href || (item.href !== "/" && location.startsWith(item.href)));

          if (collapsed) {
             // Collapsed mode: Show group icon with tooltip/popover logic could be added here
             // For now, we just show the items flat or icons if we want strictly 64px
             // But to keep it simple and usable:
             return (
               <div key={group.label} className="mb-2">
                 <div className="flex justify-center p-2 text-muted-foreground">
                   <group.icon className="w-5 h-5" />
                 </div>
                 {group.items.map(item => {
                   const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                   return (
                    <Link key={item.href} href={item.href}>
                      <div className={cn(
                        "flex justify-center py-2 rounded-md transition-all duration-150 cursor-pointer mb-1",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )} title={item.label}>
                        <item.icon className="w-4 h-4" />
                      </div>
                    </Link>
                   );
                 })}
               </div>
             );
          }

          return (
            <Collapsible
              key={group.label}
              open={isOpen}
              onOpenChange={() => toggleGroup(group.label)}
              className="space-y-1"
            >
              <CollapsibleTrigger asChild>
                <div className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors",
                  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActiveGroup && !isOpen && "bg-sidebar-accent/50"
                )}>
                  <div className="flex items-center gap-3">
                    <group.icon className="w-4 h-4 text-muted-foreground" />
                    <span>{group.label}</span>
                  </div>
                  <ChevronRight className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-90"
                  )} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1">
                {group.items.map((item) => {
                  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 ml-4 rounded-md text-sm transition-all duration-150 cursor-pointer border-l-2",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-primary font-medium shadow-sm"
                            : "border-transparent text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/40"
                        )}
                      >
                        {/* <item.icon className="w-3.5 h-3.5 flex-shrink-0 opacity-70" /> */}
                        <span className="flex-1 truncate">{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-sidebar-border p-2 space-y-0.5">
        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className={cn(
              "flex items-center gap-3 px-3 py-2 mt-2 rounded-md cursor-pointer",
              "hover:bg-sidebar-accent transition-all duration-150"
            )}>
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary-foreground">{userInitials}</span>
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-sidebar-accent-foreground truncate">{user?.name || "Admin"}</div>
                  <div className="text-xs text-sidebar-foreground/60 truncate">{user?.email || ""}</div>
                </div>
              )}
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-48">
            <DropdownMenuItem onClick={() => setShowChangePassword(true)}>
              <KeyRound className="w-4 h-4 mr-2" />
              {t("common.changePassword")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => logout()}>
              <LogOut className="w-4 h-4 mr-2" />
              {t("common.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center justify-center w-full py-2 border-t border-sidebar-border text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-150"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col flex-shrink-0 transition-all duration-250 ease-in-out",
          collapsed ? "w-16" : "w-60"
        )}
        style={{ background: "var(--sidebar)" }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-60 flex flex-col z-50" style={{ background: "var(--sidebar)" }}>
            <button
              className="absolute top-3 right-3 text-sidebar-foreground/60 hover:text-sidebar-foreground"
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
        {/* Top Header */}
        <header className="flex-shrink-0 h-14 bg-card border-b border-border flex items-center px-4 gap-4">
          {/* Mobile menu button */}
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Breadcrumb */}
          <div className="flex-1 min-w-0">
            {breadcrumb && breadcrumb.length > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                {breadcrumb.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-muted-foreground">/</span>}
                    <span className={i === breadcrumb.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"}>
                      {crumb}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>



          {/* Language Toggle */}
          <button
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={() => setLang(lang === "en" ? "zh" : "en")}
            title={lang === "en" ? "切换到中文" : "Switch to English"}
          >
            <Languages className="w-4 h-4" />
            <span className="text-xs font-medium">{lang === "en" ? "EN" : "中"}</span>
          </button>

          {/* Notifications */}
          <NotificationCenter />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors">
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-foreground">{userInitials}</span>
                </div>
                <span className="hidden md:block text-sm font-medium">{user?.name || "Admin"}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setShowChangePassword(true)}>
                <KeyRound className="w-4 h-4 mr-2" />
                {t("common.changePassword")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => logout()}>
                <LogOut className="w-4 h-4 mr-2" />
                {t("common.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div key={location} className="animate-page-in">
            {children}
          </div>
        </main>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={showChangePassword} onOpenChange={(open) => {
        setShowChangePassword(open);
        if (!open) setPwForm({ current: "", new: "", confirm: "" });
      }}>
        <DialogContent className="sm:max-w-md">
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
                onChange={(e) => setPwForm(prev => ({ ...prev, current: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("common.changePassword.newPassword")}</Label>
              <Input
                type="password"
                placeholder={t("common.changePassword.placeholder.new")}
                value={pwForm.new}
                onChange={(e) => setPwForm(prev => ({ ...prev, new: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("common.changePassword.confirmPassword")}</Label>
              <Input
                type="password"
                placeholder={t("common.changePassword.placeholder.confirm")}
                value={pwForm.confirm}
                onChange={(e) => setPwForm(prev => ({ ...prev, confirm: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangePassword(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={changePasswordMutation.isPending || !pwForm.current || !pwForm.new || !pwForm.confirm}
            >
              {changePasswordMutation.isPending ? t("common.changePassword.submitting") : t("common.changePassword.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
