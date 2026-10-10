import { ReportCategory } from "@prisma/client";
import { z } from "zod";

export const blockUserSchema = z.object({
  blockedUserId: z.string().cuid(),
  reason: z.string().trim().max(240).optional()
});

export const blockedUserParamsSchema = z.object({
  blockedUserId: z.string().cuid()
});

export const reportUserSchema = z.object({
  reportedUserId: z.string().cuid(),
  rallyId: z.string().cuid().optional(),
  category: z.nativeEnum(ReportCategory),
  details: z.string().trim().min(10).max(1200)
});
