/**
 * Portal Forgot Password Page
 *
 * Allows portal users to request a password reset link.
 */

import { useState } from "react";
import { portalPath } from "@/lib/portalBasePath";
import { Link } from "wouter";
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
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
export default function PortalForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const forgotPasswordMutation = portalTrpc.auth.forgotPassword.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    forgotPasswordMutation.mutate({
      email: email.trim(),
      origin: window.location.origin,
    });
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-xl">{t("portal_forgot_password.submitted.title")}</CardTitle>
            <CardDescription>
              {t("portal_forgot_password.submitted.description").replace("{email}", email)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              {t("portal_forgot_password.submitted.instructions")}
            </p>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSubmitted(false);
                }}
                className="w-full"
              >
                {t("portal_forgot_password.button.try_different_email")}
              </Button>
              <Link href={portalPath("/login")}>
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t("portal_forgot_password.button.back_to_login")}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{t("portal_forgot_password.title")}</CardTitle>
          <CardDescription>
            {t("portal_forgot_password.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("portal_forgot_password.form.email_label")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("portal_forgot_password.form.email_placeholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={forgotPasswordMutation.isPending || !email.trim()}
            >
              {forgotPasswordMutation.isPending ? t("portal_forgot_password.button.sending") : t("portal_forgot_password.button.send_reset_link")}
            </Button>

            <Link href={portalPath("/login")}>
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("portal_forgot_password.button.back_to_login")}
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
