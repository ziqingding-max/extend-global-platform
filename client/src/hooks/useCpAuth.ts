/**
 * CP Portal Auth Hook
 *
 * Completely separate from admin useAuth() and portal usePortalAuth().
 * Uses CP Portal-specific tRPC client and cookie.
 */
import { cpTrpc } from "@/lib/cpPortalTrpc";
import { useCallback } from "react";
import { cpPath } from "@/lib/cpBranding";

export function useCpAuth() {
  const {
    data: user,
    isLoading: loading,
    error,
  } = cpTrpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const logoutMutation = cpTrpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = cpPath("/login");
    },
  });

  const logout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  return {
    user: user ?? null,
    loading,
    error,
    isAuthenticated: !!user,
    logout,
  };
}
