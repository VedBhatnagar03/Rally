import { ReportStatus, UserStatus } from "@prisma/client";
import { z } from "zod";

const boundedListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const dataScopeSchema = z.enum(["REAL", "TEST", "ALL"]).default("REAL");

export const adminListQuerySchema = boundedListQuerySchema.extend({
  dataScope: dataScopeSchema
});

export const adminSummaryQuerySchema = z.object({
  dataScope: dataScopeSchema,
  windowDays: z.coerce.number().int().min(1).max(90).default(7)
});

export const incidentListQuerySchema = boundedListQuerySchema.extend({
  status: z.enum(["OPEN", "RESOLVED", "ALL"]).default("OPEN")
});

export const auditLogListQuerySchema = boundedListQuerySchema.extend({
  cursor: z.string().cuid().optional(),
  actorUserId: z.string().cuid().optional(),
  action: z.string().trim().min(1).max(120).optional()
});

export const resolveIncidentSchema = z.object({
  resolutionNote: z.string().trim().min(3).max(1200)
});

export const updateUserStatusSchema = z.object({
  status: z.enum([UserStatus.ACTIVE, UserStatus.SUSPENDED]),
  reason: z.string().trim().min(3).max(280)
});

export const updateReportSchema = z.object({
  status: z.enum([ReportStatus.REVIEWING, ReportStatus.RESOLVED, ReportStatus.DISMISSED]),
  resolutionNote: z.string().trim().min(3).max(1200)
});
