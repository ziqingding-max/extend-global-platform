/**
 * Portal Reset Password Page
 *
 * Allows portal users to set a new password using a reset token.
 */

import { useState, useMemo } from "react";
import { portalPath } from "@/lib/portalBasePath";
import { Link, useSearch, useLocation } from "wouter";
import { portalTrpc } from "@/lib/portalTrpc";
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
import { ArrowLeft, KeyRound, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
export default function PortalResetPassword() {
  const { t } = useI18n();
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  const token = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("token") || "";
  }, [searchString]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetComplete, setResetComplete] = useState(false);

  // Verify the reset token
  const { data: tokenInfo, isLoading: verifying } =
    portalTrpc.auth.verifyResetToken.useQuery(
      { token },
      { enabled: !!token, retry: false }
    );

  const resetPasswordMutation = portalTrpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setResetComplete(true);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t("portal_reset_password.toast.password_length_error"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("portal_reset_password.form.passwords_no_match_error"));
      return;
    }
    resetPasswordMutation.mutate({ token, password, confirmPassword });
  };

  // No token provided
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle className="text-xl">{t("portal_reset_password.invalid_link.title")}</CardTitle>
            <CardDescription>
              {t("portal_reset_password.invalid_link.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={portalPath("/forgot-password")}>
              <Button className="w-full">{t("portal_reset_password.invalid_link.request_button")}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verifying token
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">{t("portal_reset_password.verifying.title")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Token invalid or expired
  if (tokenInfo && !tokenInfo.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle className="text-xl">{t("portal_reset_password.expired_link.title")}</CardTitle>
            <CardDescription>
              {tokenInfo.reason || t("portal_reset_password.expired_link.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href={portalPath("/forgot-password")}>
              <Button className="w-full">{t("portal_reset_password.invalid_link.request_button")}</Button>
            </Link>
            <Link href={portalPath("/login")}>
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("portal_reset_password.actions.back_to_login")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Reset complete — auto-logged in
  if (resetComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-xl">{t("portal_reset_password.success.title")}</CardTitle>
            <CardDescription>
              {t("portal_reset_password.success.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => setLocation(portalPath("/"))}
            >
              {t("portal_reset_password.success.dashboard_button")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{t("portal_reset_password.form.title")}</CardTitle>
          <CardDescription>
            {tokenInfo?.valid && tokenInfo.email
              ? t("portal_reset_password.form.description_email").replace("{email}", tokenInfo.email)
              : t("portal_reset_password.form.description_default")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t("portal_reset_password.form.new_password_label")}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t("portal_reset_password.form.new_password_placeholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("portal_reset_password.form.confirm_password_label")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder={t("portal_reset_password.form.confirm_password_placeholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-destructive">{t("portal_reset_password.form.passwords_no_match_error")}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={
                resetPasswordMutation.isPending ||
                !password ||
                !confirmPassword ||
                password !== confirmPassword ||
                password.length < 8
              }
            >
              {resetPasswordMutation.isPending ? t("portal_reset_password.form.resetting_button") : t("portal_reset_password.form.reset_button")}
            </Button>

            <Link href={portalPath("/login")}>
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("portal_reset_password.actions.back_to_login")}
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
