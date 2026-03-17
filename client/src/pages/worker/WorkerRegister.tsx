import { useState, useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { workerTrpc } from "@/lib/workerTrpc";
import { workerPath, getWorkerBasePath } from "@/lib/workerBasePath";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, Loader2, Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react";

export default function WorkerRegister() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute(`${getWorkerBasePath()}/invite/:token`);
  const token = params?.token || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(true);
  const [inviteData, setInviteData] = useState<{ email: string } | null>(null);

  // Validate token on mount
  const validateQuery = workerTrpc.onboarding.validateInvite.useQuery(
    { token },
    {
      enabled: !!token,
      retry: false,
    }
  );

  useEffect(() => {
    if (validateQuery.isError) {
      setError(validateQuery.error.message || "Invalid or expired invite link");
      setIsValidating(false);
    } else if (validateQuery.data) {
      setInviteData(validateQuery.data);
      setIsValidating(false);
    }
  }, [validateQuery.isError, validateQuery.data, validateQuery.error]);

  const registerMutation = workerTrpc.auth.register.useMutation({
    onSuccess: () => {
      setLocation(workerPath("/dashboard"));
    },
    onError: (err) => {
      setError(err.message || "Registration failed");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    registerMutation.mutate({ token, password });
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Link</CardTitle>
            <CardDescription>This invite link is missing a token.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={workerPath("/login")}>
              <Button className="w-full">Back to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isValidating || validateQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
            Join Worker Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set up your account to get started
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Create Password</CardTitle>
            <CardDescription>
              {inviteData?.email ? `Setting up account for ${inviteData.email}` : "Set a secure password for your account"}
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
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
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
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm your password"
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
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by Extend Global
        </p>
      </div>
    </div>
  );
}
