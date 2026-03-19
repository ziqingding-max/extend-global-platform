import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { useCpContext } from "./_core/store/cpContextStore";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        /**
         * Inject CP Context into every Admin tRPC request.
         * The backend adminProcedure reads this header to scope queries.
         *
         * Header: x-cp-context-id
         * Values:
         * - absent / empty      → "all" mode (no filter, god view)
         * - "direct"            → EG-DIRECT mode (isInternal CP, unlocks edit rights)
         * - numeric string      → specific external CP id
         *
         * Header: x-cp-context-cp-id
         * - Only sent in "direct" mode, contains the actual CP record ID for EG-DIRECT
         */
        const state = useCpContext.getState();
        const hdrs: Record<string, string> = {};
        if (state.mode === "direct" && state.cpId) {
          hdrs["x-cp-context-id"] = "direct";
          hdrs["x-cp-context-cp-id"] = String(state.cpId);
        } else if (state.mode === "specific" && state.cpId) {
          hdrs["x-cp-context-id"] = String(state.cpId);
        }
        // "all" mode → no header → backend returns unfiltered data
        return hdrs;
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
