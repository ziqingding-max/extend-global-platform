/**
 * Admin Invite Accept Page
 *
 * Allows invited users to set their password and activate their account.
 * URL: /invite?token=xxx
 */

import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Eye, EyeOff, Lock, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";

import { useI18n } from "@/lib/i18n";
export default function AdminInvite() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // Verify invite token
  const verifyQuery = trpc.userManagement.verifyInvite.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const acceptMutation = trpc.userManagement.acceptInvite.useMutation({
    onSuccess: () => {
      // Redirect to dashboard after successful activation
      window.location.href = "/";
    },
    onError: (err) => {
      setError(err.message || t("admin_invite.error.activation_failed"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("admin_invite.error.password_length"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("admin_invite.error.password_mismatch"));
      return;
    }

    acceptMutation.mutate({ token, password });
  };

  // No token provided
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">{t("admin_invite.invalid_link.title")}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t("admin_invite.invalid_link.description")}
            </p>
            <Button variant="outline" onClick={() => setLocation("/login")}>
              {t("admin_invite.invalid_link.go_to_login")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading
  if (verifyQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Invalid token
  if (verifyQuery.data && !verifyQuery.data.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">{t("admin_invite.invalid_token.title")}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {verifyQuery.data.reason}
            </p>
            <Button variant="outline" onClick={() => setLocation("/login")}>
              {t("admin_invite.invalid_link.go_to_login")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const inviteData = verifyQuery.data;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img 
            src="/brand/gea-logo-horizontal-green.png" 
            alt="Extend Global" 
            className="h-16 object-contain mb-4"
          />
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            EG Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("admin_invite.header.title")}
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">{t("admin_invite.welcome.title", { name: inviteData?.name || "User" })}</CardTitle>
            <CardDescription>
              {t("admin_invite.welcome.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inviteData?.email && (
              <div className="mb-4 p-3 rounded-lg bg-muted/50 border">
                <p className="text-sm text-muted-foreground">{t("admin_invite.form.email_label")}</p>
                <p className="font-medium">{inviteData.email}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">{t("admin_invite.form.password_label")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("admin_invite.form.password_placeholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    autoFocus
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("admin_invite.form.confirm_password_label")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("admin_invite.form.confirm_password_placeholder")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t("admin_invite.button.activating")}
                  </>
                ) : (
                  t("admin_invite.button.activate_account")
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          {t("admin_invite.footer.powered_by")}
        </p>
      </div>
    </div>
  );
}
