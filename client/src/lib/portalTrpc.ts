import { createTRPCReact } from "@trpc/react-query";
import type { PortalAppRouter } from "../../../server/portal/portalRouter";

export const portalTrpc = createTRPCReact<PortalAppRouter>();
