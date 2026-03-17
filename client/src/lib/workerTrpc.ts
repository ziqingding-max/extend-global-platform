import { createTRPCReact } from "@trpc/react-query";
import type { AppWorkerRouter } from "../../../server/worker/workerRouter";

export const workerTrpc = createTRPCReact<AppWorkerRouter>();
