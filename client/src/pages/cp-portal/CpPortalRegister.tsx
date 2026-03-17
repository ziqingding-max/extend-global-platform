/**
 * CP Portal Register Page
 *
 * Invite-based registration for CP portal users.
 * Validates the invite token and allows setting a password.
 */
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { useBranding } from "@/hooks/useBranding";
import { cpPath } from "@/lib/cpBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Eye, EyeOff, Lock, CheckCircle, XCircle } from "lucide-react";

export default function CpPortalRegister() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { branding, loading: brandingLoading } = useBranding();
  const token = new URLSearchParams(search).get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // Validate the invite token
  const {
    data: tokenData,
    isLoading: tokenLoading,
    error: tokenError,
  } = cpTrpc.auth.validateInvite.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const registerMutation = cpTrpc.auth.register.useMutation({
    onSuccess: () => {
      setLocation(cpPath("/login"));
    },
    onError: (err) => {
      setError(err.message || "Registration failed. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    registerMutation.mutate({ token, password, confirmPassword });
  };

  if (brandingLoading || tokenLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const companyName = branding?.companyName || "Extend Global";
  const logoUrl = branding?.logoUrl || "/brand/gea-logo-horizontal-green.png";

  // Invalid or expired token
  if (!token || tokenError || !tokenData?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <img src={logoUrl} alt={companyName} className="h-16 object-contain mb-4" />
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <XCircle className="w-12 h-12 text-destructive" />
                <h2 className="text-xl font-semibold">Invalid or Expired Invite</h2>
                <p className="text-sm text-muted-foreground">
                  This invitation link is no longer valid. Please contact your administrator
                  to receive a new invite.
                </p>
                <Button variant="outline" onClick={() => setLocation(cpPath("/login"))}>
                  Go to Login
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src={logoUrl} alt={companyName} className="h-16 object-contain mb-4" />
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Set Up Your Account
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome to {companyName} Partner Portal
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Create Password</CardTitle>
            <CardDescription>
              You're registering as <strong>{tokenData.email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    minLength={8}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={8}
                  />
                  {confirmPassword && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {password === confirmPassword ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                    </span>
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Already have an account?{" "}
          <a href={cpPath("/login")} className="text-primary hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
