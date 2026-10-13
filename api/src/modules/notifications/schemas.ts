import { z } from "zod";

export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  unreadOnly: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
});

export const notificationParamsSchema = z.object({
  notificationId: z.string().cuid()
});
