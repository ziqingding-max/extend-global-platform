import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { workerTrpc } from "@/lib/workerTrpc";
import { workerPath } from "@/lib/workerBasePath";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";

type NavItem = {
  href: string;
  icon: any;
  label: string;
};

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Check auth
  const { data: user, isLoading } = workerTrpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  const logoutMutation = workerTrpc.auth.logout.useMutation({
    onSuccess: () => setLocation(workerPath("/login")),
  });

  // Role switch mutation
  const switchRoleMutation = workerTrpc.auth.switchRole.useMutation({
    onSuccess: () => {
      // Full reload to refresh all data with new role context
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

  // Change Password state
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
    if (newPassword.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (newPassword !== confirmNewPassword) { toast.error("Passwords do not match"); return; }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation(workerPath("/login"));
    }
  }, [user, isLoading, setLocation]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  // Build navigation items based on worker type
  const navItems: NavItem[] = [
    { href: workerPath("/dashboard"), icon: LayoutDashboard, label: "Dashboard" },
  ];

  if (user.activeRole === "contractor") {
    navItems.push(
      { href: workerPath("/invoices"), icon: FileText, label: "Invoices" },
      { href: workerPath("/milestones"), icon: Flag, label: "Milestones" },
    );
  }

  if (user.activeRole === "employee") {
    navItems.push(
      { href: workerPath("/payslips"), icon: Wallet, label: "Payslips" },
      { href: workerPath("/leave"), icon: CalendarDays, label: "Leave" },
      { href: workerPath("/reimbursements"), icon: Receipt, label: "Expenses" },
    );
  }

  navItems.push(
    { href: workerPath("/documents"), icon: FolderOpen, label: "Documents" },
    { href: workerPath("/profile"), icon: User, label: "Profile" },
  );

  const displayName = user.workerName || user.email;
  const initials = user.workerName
    ? user.workerName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();
  const workerTypeLabel = user.activeRole === "contractor" ? "Contractor" : "Employee";
  const hasDualIdentity = user.hasDualIdentity;
  const availableRoles = user.availableRoles || [];

  return (
    <div className="min-h-screen bg-muted/20">
      {/* ===== Desktop Sidebar (hidden on mobile) ===== */}
      <aside className="hidden md:flex w-64 bg-background border-r flex-col fixed h-full z-30">
        <div className="px-4 border-b h-16 flex items-center gap-2">
          <img
            src="/brand/gea-logo-icon-green.png"
            alt="GEA"
            className="w-8 h-8 flex-shrink-0 object-contain"
          />
          <span className="font-bold text-lg">Worker Portal</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{workerTypeLabel}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <User className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {hasDualIdentity && (
                  <>
                    <DropdownMenuItem onClick={handleSwitchRole} disabled={switchRoleMutation.isPending}>
                      <ArrowLeftRight className="w-4 h-4 mr-2" />
                      {switchRoleMutation.isPending ? "Switching..." : `Switch to ${user.activeRole === "contractor" ? "Employee" : "Contractor"}`}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
                  <KeyRound className="w-4 h-4 mr-2" />
                  Change Password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => logoutMutation.mutate()}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* ===== Mobile Header (hidden on desktop) ===== */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-background border-b flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <img
            src="/brand/gea-logo-icon-green.png"
            alt="GEA"
            className="w-7 h-7 flex-shrink-0 object-contain"
          />
          <span className="font-bold text-lg">Worker Portal</span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{workerTypeLabel}</p>
              </div>
              <DropdownMenuSeparator />
              {hasDualIdentity && (
                <>
                  <DropdownMenuItem onClick={handleSwitchRole} disabled={switchRoleMutation.isPending}>
                    <ArrowLeftRight className="w-4 h-4 mr-2" />
                    {switchRoleMutation.isPending ? "Switching..." : `Switch to ${user.activeRole === "contractor" ? "Employee" : "Contractor"}`}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
                <KeyRound className="w-4 h-4 mr-2" />
                Change Password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => logoutMutation.mutate()}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      {/* ===== Mobile Menu Overlay ===== */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-20">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <nav className="absolute top-14 left-0 right-0 bg-background border-b shadow-lg p-4 space-y-1">
            {navItems.map((item) => (
              <NavLink key={item.href} href={item.href} icon={item.icon}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* ===== Mobile Bottom Navigation ===== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t z-30 safe-area-bottom">
        <div className="flex justify-around items-center h-16">
          {navItems.slice(0, 5).map((item) => (
            <BottomNavLink key={item.href} href={item.href} icon={item.icon} label={item.label} />
          ))}
        </div>
      </nav>

      {/* ===== Change Password Dialog ===== */}
      <Dialog open={changePasswordOpen} onOpenChange={(open) => { setChangePasswordOpen(open); if (!open) { setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); } }}>
        <DialogContent className="sm:max-w-md">
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

      {/* ===== Main Content ===== */}
      <main className="md:ml-64 pt-14 md:pt-0 pb-20 md:pb-0 min-h-screen">
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

// ===== Desktop Sidebar Nav Link =====
function NavLink({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) {
  const [location] = useLocation();
  const isActive = location === href || location.startsWith(href + "/");

  return (
    <Link href={href}>
      <a className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      }`}>
        <Icon className="w-4 h-4 shrink-0" />
        {children}
      </a>
    </Link>
  );
}

// ===== Mobile Bottom Nav Link =====
function BottomNavLink({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  const [location] = useLocation();
  const isActive = location === href || location.startsWith(href + "/");

  return (
    <Link href={href}>
      <a className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-w-0 ${
        isActive ? "text-primary" : "text-muted-foreground"
      }`}>
        <Icon className="w-5 h-5" />
        <span className="text-[10px] font-medium truncate max-w-[60px]">{label}</span>
      </a>
    </Link>
  );
}
