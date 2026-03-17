/**
 * CP Portal Layout
 *
 * Sidebar navigation layout for the Channel Partner portal.
 * White-labeled with CP's logo and brand colors.
 * Mirrors the PortalLayout design language but with CP-specific navigation.
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
  ChevronLeft,
  ChevronRight,
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
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function buildCpNavGroups(): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        { label: "Dashboard", icon: LayoutDashboard, href: cpPath("/") },
      ],
    },
    {
      label: "Management",
      items: [
        { label: "Clients", icon: Users, href: cpPath("/clients") },
        { label: "Pricing", icon: DollarSign, href: cpPath("/pricing") },
      ],
    },
    {
      label: "Finance",
      items: [
        { label: "Invoices", icon: Receipt, href: cpPath("/invoices") },
        { label: "Wallet", icon: Wallet, href: cpPath("/wallet") },
      ],
    },
    {
      label: "Configuration",
      items: [
        { label: "Settings", icon: Settings, href: cpPath("/settings") },
      ],
    },
  ];
}

interface CpPortalLayoutProps {
  children: ReactNode;
}

export default function CpPortalLayout({ children }: CpPortalLayoutProps) {
  const { user, loading, logout } = useCpAuth();
  const { branding } = useBranding();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navGroups = useMemo(() => buildCpNavGroups(), []);

  const companyName = branding?.companyName || "Partner Portal";
  const logoUrl = branding?.logoUrl;

  // Auth guard — redirect to login if not authenticated
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full bg-card border-r border-border transition-all duration-300 flex flex-col",
          sidebarOpen ? "w-64" : "w-[68px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo area */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 min-w-0">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={companyName}
                  className="h-8 w-auto object-contain flex-shrink-0"
                />
              ) : (
                <Building2 className="h-8 w-8 text-primary flex-shrink-0" />
              )}
              <span className="font-semibold text-sm truncate">{companyName}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center w-full">
              {logoUrl ? (
                <img src={logoUrl} alt={companyName} className="h-8 w-8 object-contain" />
              ) : (
                <Building2 className="h-6 w-6 text-primary" />
              )}
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex items-center justify-center w-6 h-6 rounded hover:bg-muted"
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              {sidebarOpen && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-2">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer mb-0.5",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      onClick={() => setMobileOpen(false)}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {sidebarOpen && <span className="truncate">{item.label}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User menu at bottom */}
        <div className="border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm",
                  !sidebarOpen && "justify-center"
                )}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {user.contactName?.charAt(0)?.toUpperCase() || "U"}
                </div>
                {sidebarOpen && (
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-medium truncate">{user.contactName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {user.cpRole}
                    </p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.contactName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
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
      </aside>

      {/* Main content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300",
          sidebarOpen ? "lg:ml-64" : "lg:ml-[68px]"
        )}
      >
        {/* Mobile header */}
        <div className="lg:hidden h-14 flex items-center px-4 border-b border-border bg-card">
          <button onClick={() => setMobileOpen(true)} className="mr-3">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm">{companyName}</span>
        </div>

        {/* Page content */}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
