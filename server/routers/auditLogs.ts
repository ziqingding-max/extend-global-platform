import { z } from "zod";
import { router } from "../_core/trpc";
import { adminProcedure } from "../procedures";
import { listAuditLogs } from "../db";

export const auditLogsRouter = router({
  list: adminProcedure
    .input(
      z.object({
        entityType: z.string().optional(),
        userId: z.number().optional(),
        limit: z.number().default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const page = Math.floor(input.offset / input.limit) + 1;
      return await listAuditLogs({
        page,
        pageSize: input.limit,
        entityType: input.entityType,
        userId: input.userId,
      });
    }),
});
