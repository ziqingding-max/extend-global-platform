/**
 * Worker Role Selection Page
 *
 * Shown after login when a worker has dual identity (both Contractor and Employee).
 * The user must select which role they want to use for this session.
 * After selection, a new JWT is issued with the chosen activeRole.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { workerTrpc } from "@/lib/workerTrpc";
import { workerPath } from "@/lib/workerBasePath";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, UserCheck, Loader2, ArrowRight } from "lucide-react";

export default function WorkerRoleSelect() {
  const [, setLocation] = useLocation();
  const [selectedRole, setSelectedRole] = useState<"contractor" | "employee" | null>(null);

  // Get current user info (should already be authenticated)
  const { data: user, isLoading: userLoading } = workerTrpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  const switchRoleMutation = workerTrpc.auth.switchRole.useMutation({
    onSuccess: () => {
      // Navigate to dashboard after role switch
      setLocation(workerPath("/dashboard"));
      // Force a full page reload to refresh all cached data with new role context
      window.location.href = workerPath("/dashboard");
    },
    onError: (err) => {
      console.error("Failed to switch role:", err);
    },
  });

  // If user is not authenticated, redirect to login
  useEffect(() => {
    if (!userLoading && !user) {
      setLocation(workerPath("/login"));
    }
  }, [user, userLoading, setLocation]);

  // If user only has one identity, skip role selection
  useEffect(() => {
    if (user && !user.hasDualIdentity) {
      setLocation(workerPath("/dashboard"));
    }
  }, [user, setLocation]);

  const handleSelectRole = (role: "contractor" | "employee") => {
    setSelectedRole(role);
    switchRoleMutation.mutate({ role });
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !user.hasDualIdentity) return null;

  const availableRoles = user.availableRoles || [];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/brand/gea-logo-horizontal-green.png"
            alt="Extend Global"
            className="h-16 object-contain mb-4"
          />
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Select Your Role
          </h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            You have multiple identities. Choose which role to use for this session.
          </p>
        </div>

        <div className="space-y-4">
          {availableRoles.map((roleInfo: { role: "contractor" | "employee"; label: string }) => {
            const isContractor = roleInfo.role === "contractor";
            const Icon = isContractor ? Briefcase : UserCheck;
            const description = isContractor
              ? "View invoices, milestones, and contractor documents"
              : "View payslips, submit leave requests, and manage expenses";
            const isSelected = selectedRole === roleInfo.role;
            const isOtherSelected = selectedRole !== null && selectedRole !== roleInfo.role;

            return (
              <Card
                key={roleInfo.role}
                className={`cursor-pointer transition-all duration-200 border-2 ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-md"
                    : isOtherSelected
                    ? "opacity-50 border-muted"
                    : "border-transparent hover:border-primary/30 hover:shadow-sm"
                }`}
                onClick={() => !switchRoleMutation.isPending && handleSelectRole(roleInfo.role)}
              >
                <CardContent className="flex items-center gap-4 p-6">
                  <div className={`flex items-center justify-center w-14 h-14 rounded-xl shrink-0 ${
                    isContractor ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"
                  }`}>
                    <Icon className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base">{roleInfo.label}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                  </div>
                  <div className="shrink-0">
                    {isSelected && switchRoleMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    ) : (
                      <ArrowRight className={`w-5 h-5 ${isSelected ? "text-primary" : "text-muted-foreground/40"}`} />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          You can switch roles anytime from the menu.
        </p>
      </div>
    </div>
  );
}
