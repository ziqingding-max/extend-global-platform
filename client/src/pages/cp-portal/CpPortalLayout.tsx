/**
 * CP Portal Layout (Glassmorphism Redesign)
 *
 * Top navigation bar with frosted glass effect.
 * White-labeled with CP's logo and brand colors.
 * Aurora gradient background with glass cards.
 */
import { useState, useMemo, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useCpAuth } from "@/hooks/useCpAuth";
import { useBranding } from "@/hooks/useBranding";
import { cpPath } from "@/lib/cpBranding";
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Receipt,
  Wallet,
  Settings,
  LogOut,
  Menu,
  X,
  Loader2,
  Building2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

function buildCpNavItems(): NavItem[] {
  return [
    { label: "Dashboard", icon: LayoutDashboard, href: cpPath("/") },
    { label: "Clients", icon: Users, href: cpPath("/clients") },
    { label: "Pricing", icon: DollarSign, href: cpPath("/pricing") },
    { label: "Invoices", icon: Receipt, href: cpPath("/invoices") },
    { label: "Wallet", icon: Wallet, href: cpPath("/wallet") },
    { label: "Settings", icon: Settings, href: cpPath("/settings") },
  ];
}

interface CpPortalLayoutProps {
  children: ReactNode;
}

export default function CpPortalLayout({ children }: CpPortalLayoutProps) {
  const { user, loading, logout } = useCpAuth();
  const { branding } = useBranding();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = useMemo(() => buildCpNavItems(), []);

  const companyName = branding?.companyName || "Partner Portal";
  const logoUrl = branding?.logoUrl;

  // Auth guard
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center aurora-bg">
        <div className="glass-card p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    window.location.href = cpPath("/login");
    return null;
  }

  const isActive = (href: string) => {
    if (href === cpPath("/")) return location === cpPath("/");
    return location.startsWith(href);
  };

  return (
    <div className="min-h-screen aurora-bg">
      {/* ─── Top Navigation Bar ─── */}
      <header className="sticky top-0 z-50 glass-nav">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Left: Logo + Company Name */}
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={companyName}
                className="h-8 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <Building2 className="h-7 w-7 text-primary" />
            )}
            <span className="font-semibold text-sm text-foreground hidden sm:block">
              {companyName}
            </span>
          </div>

          {/* Center: Navigation Pills (Desktop) */}
          <nav className="hidden lg:flex items-center gap-1 glass-pill px-1.5 py-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <button
                    className={cn(
                      "flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-white/90 text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/40"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                </Link>
              );
            })}
          </nav>

          {/* Right: User Menu */}
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-white/20 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* User avatar dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 p-1.5 rounded-full hover:bg-white/20 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                    {user.contactName?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                  <span className="text-sm font-medium hidden md:block">
                    {user.contactName}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 glass-dropdown">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{user.contactName}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {user.cpRole}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => (window.location.href = cpPath("/settings"))}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ─── Mobile Navigation Drawer ─── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed top-16 left-0 right-0 z-50 lg:hidden glass-card mx-4 mt-2 rounded-2xl p-3">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <button
                      className={cn(
                        "flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-white/40 hover:text-foreground"
                      )}
                      onClick={() => setMobileOpen(false)}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </button>
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}

      {/* ─── Page Content ─── */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
