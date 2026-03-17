import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      window.location.href = "/login";
    }
  }, [logoutMutation]);

  const state = useMemo(() => {
    const user = meQuery.data ?? null;
    const loading = meQuery.isLoading;
    const error =
      meQuery.error instanceof TRPCClientError ? meQuery.error : null;

    if (user) {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify(user)
      );
    }

    return {
      user,
      loading,
      error,
      isAuthenticated: !!user,
    };
  }, [meQuery.data, meQuery.isLoading, meQuery.error]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (state.loading) return;
    if (!state.isAuthenticated) {
      window.location.href = redirectPath;
    }
  }, [redirectOnUnauthenticated, state.loading, state.isAuthenticated, redirectPath]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
