import type { Prisma } from "@prisma/client";
import { z } from "zod";

export const analyticsEventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  metadata: z.record(z.unknown()).optional()
});

export type AnalyticsEventInput = Omit<z.infer<typeof analyticsEventSchema>, "metadata"> & {
  metadata?: Prisma.InputJsonObject;
};
