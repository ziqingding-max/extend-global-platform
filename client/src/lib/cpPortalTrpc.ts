import { createTRPCReact } from "@trpc/react-query";
import type { CpPortalAppRouter } from "../../../server/cp-portal/cpPortalRouter";

export const cpTrpc = createTRPCReact<CpPortalAppRouter>();
