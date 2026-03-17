/**
 * Portal Auth Hook
 *
 * Completely separate from admin useAuth().
 * Uses portal-specific tRPC client and cookie.
 */

import { portalTrpc } from "@/lib/portalTrpc";
import { useCallback } from "react";
import { portalPath } from "@/lib/portalBasePath";

export function usePortalAuth() {
  const { data: user, isLoading: loading, error } = portalTrpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const logoutMutation = portalTrpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = portalPath("/login");
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
