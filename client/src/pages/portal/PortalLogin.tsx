/**
 * Portal Login Page (Glassmorphism Redesign)
 *
 * Centered frosted glass login card on aurora gradient background.
 * Supports CP white-label branding on CP subdomains.
 */

import { useState } from "react";
import { portalPath } from "@/lib/portalBasePath";
import { Link, useLocation } from "wouter";
import { portalTrpc } from "@/lib/portalTrpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useCpBranding } from "@/hooks/useCpBranding";

import { useI18n } from "@/lib/i18n";

export default function PortalLogin() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { branding, isCp } = useCpBranding();

  const loginMutation = portalTrpc.auth.login.useMutation({
    onSuccess: () => {
      setLocation(portalPath("/"));
    },
    onError: (err) => {
      setError(err.message || t("portal_login.alert.login_failed"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ email: email.trim(), password });
  };

  const displayName = isCp && branding?.companyName ? branding.companyName : "Extend Global";
  const logoSrc = isCp && branding?.logoUrl ? branding.logoUrl : "/brand/gea-logo-icon.png";
  const logoAlt = isCp && branding?.companyName ? branding.companyName : "Extend Global";

  return (
    <div className="min-h-screen flex items-center justify-center aurora-bg p-4">
      <div className="w-full max-w-md">
        {/* Logo & Brand */}
        <div className="flex flex-col items-center mb-8">
          <img
            src={logoSrc}
            alt={logoAlt}
            className={isCp ? "h-14 object-contain mb-4" : "w-14 h-14 object-contain mb-4"}
          />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {isCp ? `${displayName} Portal` : t("portal_login.header.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("portal_login.header.subtitle")}
          </p>
        </div>

        {/* Login Card — Frosted Glass */}
        <div className="glass-card p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">
              {t("portal_login.form.title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("portal_login.form.description")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                {t("portal_login.form.email_label")}
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder={t("portal_login.form.email_placeholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 glass-input"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  {t("portal_login.form.password_label")}
                </Label>
                <Link
                  href={portalPath("/forgot-password")}
                  className="text-xs text-primary hover:underline"
                >
                  {t("portal_login.form.forgot_password_link")}
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("portal_login.form.password_placeholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 glass-input"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full btn-gradient h-11 text-sm font-semibold"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("portal_login.form.signing_in_button")}
                </>
              ) : (
                t("portal_login.form.sign_in_button")
              )}
            </Button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-xs text-muted-foreground">
              {t("portal_login.help.no_account")}
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          {isCp ? `Powered by Extend Global` : t("portal_login.footer.powered_by")}
        </p>
      </div>
    </div>
  );
}
