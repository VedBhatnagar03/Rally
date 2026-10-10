import { ReportStatus, UserStatus } from "@prisma/client";
import { z } from "zod";

export const adminListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const updateUserStatusSchema = z.object({
  status: z.enum([UserStatus.ACTIVE, UserStatus.SUSPENDED]),
  reason: z.string().trim().min(3).max(280)
});

export const updateReportSchema = z.object({
  status: z.enum([ReportStatus.REVIEWING, ReportStatus.RESOLVED, ReportStatus.DISMISSED]),
  resolutionNote: z.string().trim().min(3).max(1200)
});
