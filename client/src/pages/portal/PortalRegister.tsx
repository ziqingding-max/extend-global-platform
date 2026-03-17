/**
 * Portal Register Page
 *
 * Accepts invite token, verifies it, and lets the user set a password.
 */

import { useState } from "react";
import { portalPath } from "@/lib/portalBasePath";
import { useLocation, useSearch } from "wouter";
import { portalTrpc } from "@/lib/portalTrpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, Loader2, Lock, CheckCircle, XCircle } from "lucide-react";

import { useI18n } from "@/lib/i18n";
export default function PortalRegister() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  // Verify invite token
  const { data: invite, isLoading: verifying } = portalTrpc.auth.verifyInvite.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const registerMutation = portalTrpc.auth.register.useMutation({
    onSuccess: () => {
      setLocation(portalPath("/"));
    },
    onError: (err) => {
      setError(err.message || t("portal_register.error.registration_failed"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("portal_register.error.password_too_short"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("portal_register.error.passwords_do_not_match"));
      return;
    }

    registerMutation.mutate({ token, password, confirmPassword });
  };

  // No token
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="w-12 h-12 text-destructive" />
              <h2 className="text-xl font-semibold">{t("portal_register.invalid_link.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("portal_register.invalid_link.description")}
              </p>
              <Button variant="outline" onClick={() => setLocation(portalPath("/login"))}>
                {t("portal_register.invalid_link.go_to_login")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verifying
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("portal_register.verifying_invite.message")}</p>
        </div>
      </div>
    );
  }

  // Invalid invite
  if (invite && !invite.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="w-12 h-12 text-destructive" />
              <h2 className="text-xl font-semibold">{t("portal_register.invite_not_valid.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {invite.reason || t("portal_register.invite_not_valid.reason_fallback")}
              </p>
              <Button variant="outline" onClick={() => setLocation(portalPath("/login"))}>
                {t("portal_register.invalid_link.go_to_login")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            {t("portal_register.header.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("portal_register.header.subtitle")}
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">{t("portal_register.welcome.title").replace("{contactName}", invite?.contactName || "User")}</CardTitle>
            <CardDescription>
              {t("portal_register.welcome.description").replace("<strong>{companyName}</strong>", invite?.companyName || "")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Email (read-only) */}
              <div className="space-y-2">
                <Label>{t("portal_register.form.email_label")}</Label>
                <Input
                  value={invite?.email || ""}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("portal_register.form.password_label")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={t("portal_register.form.password_placeholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("portal_register.form.confirm_password_label")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder={t("portal_register.form.confirm_password_placeholder")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                {password && confirmPassword && password === confirmPassword && (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="w-3 h-3" />
                    {t("portal_register.form.passwords_match")}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t("portal_register.form.button_activating")}
                  </>
                ) : (
                  t("portal_register.form.button_activate")
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-xs text-muted-foreground">
                {t("portal_register.login_prompt.text")} 
                <button
                  className="text-primary hover:underline"
                  onClick={() => setLocation(portalPath("/login"))}
                >
                  {t("portal_register.login_prompt.sign_in")}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
