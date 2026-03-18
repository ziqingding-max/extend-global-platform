/**
 * Worker Portal Layout (Glassmorphism Redesign)
 *
 * Mobile-first design:
 *   - Top identity bar (avatar + name + role badge)
 *   - Bottom frosted glass Tab Bar (Home / Money / Time / Docs / Profile)
 * Desktop:
 *   - Top navigation bar matching Admin/Portal layout
 *   - Aurora gradient background + glass cards
 *
 * Supports: employee / contractor role switching, CP white-label branding
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { workerTrpc } from "@/lib/workerTrpc";
import { workerPath } from "@/lib/workerBasePath";
import { useCpBranding } from "@/hooks/useCpBranding";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Flag,
  User,
  LogOut,
  KeyRound,
  CalendarDays,
  Receipt,
  Wallet,
  FolderOpen,
  Menu,
  X,
  ArrowLeftRight,
  Briefcase,
  UserCheck,
  ChevronDown,
  Home,
  Clock,
  FileStack,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";

import type { LucideIcon } from "lucide-react";

/* ─── Types ─── */
type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
};

/* ─── Bottom Tab Bar Item ─── */
function TabBarItem({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-0 transition-all duration-200 cursor-pointer",
          isActive
            ? "text-primary"
            : "text-muted-foreground/60"
        )}
      >
        <div
          className={cn(
            "p-1 rounded-xl transition-all duration-200",
            isActive && "bg-primary/10"
          )}
        >
          <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5px]")} />
        </div>
        <span className={cn(
          "text-[10px] font-medium truncate max-w-[60px]",
          isActive && "font-semibold"
        )}>
          {label}
        </span>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN WORKER LAYOUT
   ═══════════════════════════════════════════════════ */
export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { branding, isCp } = useCpBranding();

  // Auth
  const { data: user, isLoading } = workerTrpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  const logoutMutation = workerTrpc.auth.logout.useMutation({
    onSuccess: () => setLocation(workerPath("/login")),
  });

  // Role switch
  const switchRoleMutation = workerTrpc.auth.switchRole.useMutation({
    onSuccess: () => {
      window.location.href = workerPath("/dashboard");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to switch role");
    },
  });

  const handleSwitchRole = () => {
    const otherRole = user?.activeRole === "contractor" ? "employee" : "contractor";
    switchRoleMutation.mutate({ role: otherRole });
  };

  // Change Password
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const changePasswordMutation = workerTrpc.auth.changePassword.useMutation({
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
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation(workerPath("/login"));
    }
  }, [user, isLoading, setLocation]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center aurora-bg">
        <div className="glass-card p-8 flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // Build navigation items based on worker type
  const allNavItems: NavItem[] = [
    { href: workerPath("/dashboard"), icon: Home, label: "Home" },
  ];

  if (user.activeRole === "contractor") {
    allNavItems.push(
      { href: workerPath("/invoices"), icon: FileText, label: "Invoices" },
      { href: workerPath("/milestones"), icon: Flag, label: "Milestones" },
    );
  }

  if (user.activeRole === "employee") {
    allNavItems.push(
      { href: workerPath("/payslips"), icon: Wallet, label: "Payslips" },
      { href: workerPath("/leave"), icon: CalendarDays, label: "Leave" },
      { href: workerPath("/reimbursements"), icon: Receipt, label: "Expenses" },
    );
  }

  allNavItems.push(
    { href: workerPath("/documents"), icon: FolderOpen, label: "Docs" },
    { href: workerPath("/profile"), icon: User, label: "Profile" },
  );

  // Bottom tab bar items (max 5 for mobile)
  const tabBarItems = allNavItems.slice(0, 5);

  const displayName = user.workerName || user.email;
  const initials = user.workerName
    ? user.workerName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();
  const workerTypeLabel = user.activeRole === "contractor" ? "Contractor" : "Employee";
  const hasDualIdentity = user.hasDualIdentity;

  return (
    <div className="flex flex-col min-h-screen aurora-bg">
      {/* ═══ Top Header Bar ═══ */}
      <header className="flex-shrink-0 top-nav z-40">
        <div className="flex items-center h-14 px-4 gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <img
              src={isCp && branding?.logoUrl ? branding.logoUrl : "/brand/gea-logo-icon.png"}
              alt={isCp && branding?.companyName ? branding.companyName : "EG"}
              className="w-7 h-7 flex-shrink-0 object-contain"
            />
            <span className="font-semibold text-sm tracking-tight text-foreground hidden sm:block">
              {isCp && branding?.companyName ? branding.companyName : "Worker Portal"}
            </span>
          </div>

          {/* Desktop Navigation Pills */}
          <nav className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto">
            {allNavItems.map((item) => {
              const isActive =
                location === item.href || location.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "nav-pill flex items-center gap-1.5 whitespace-nowrap",
                      isActive && "active"
                    )}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Spacer for mobile */}
          <div className="flex-1 md:hidden" />

          {/* Role badge */}
          <div className="flex items-center gap-1.5">
            {hasDualIdentity && (
              <button
                onClick={handleSwitchRole}
                disabled={switchRoleMutation.isPending}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary hover:bg-primary/20 transition-all duration-200"
              >
                <ArrowLeftRight className="w-3 h-3" />
                <span>{workerTypeLabel}</span>
              </button>
            )}
            {!hasDualIdentity && (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary">
                {workerTypeLabel}
              </span>
            )}

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-white/30 transition-all duration-200">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-foreground">
                      {initials}
                    </span>
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-foreground truncate max-w-[120px]">
                    {displayName}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{workerTypeLabel}</p>
                </div>
                <DropdownMenuSeparator />
                {hasDualIdentity && (
                  <>
                    <DropdownMenuItem
                      onClick={handleSwitchRole}
                      disabled={switchRoleMutation.isPending}
                    >
                      <ArrowLeftRight className="w-4 h-4 mr-2" />
                      {switchRoleMutation.isPending
                        ? "Switching..."
                        : `Switch to ${user.activeRole === "contractor" ? "Employee" : "Contractor"}`}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
                  <KeyRound className="w-4 h-4 mr-2" />
                  Change Password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => logoutMutation.mutate()}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ═══ Main Content ═══ */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div key={location} className="animate-page-in">
            {children}
          </div>
        </div>
      </main>

      {/* ═══ Mobile Bottom Tab Bar ═══ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40">
        <div
          className="mx-3 mb-3 rounded-2xl flex justify-around items-center h-16"
          style={{
            background: "rgba(255, 255, 255, 0.65)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.4)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.08)",
          }}
        >
          {tabBarItems.map((item) => {
            const isActive =
              location === item.href || location.startsWith(item.href + "/");
            return (
              <TabBarItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                isActive={isActive}
              />
            );
          })}
        </div>
      </nav>

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
