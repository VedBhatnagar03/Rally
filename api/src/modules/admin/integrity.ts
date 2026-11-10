import type { ReportStatus } from "@prisma/client";

type ReportUpdate = {
  status: Extract<ReportStatus, "REVIEWING" | "RESOLVED" | "DISMISSED">;
  resolutionNote: string;
};

export function reportUpdateData(body: ReportUpdate, adminUserId: string, now: Date) {
  const isReviewing = body.status === "REVIEWING";
  return {
    status: body.status,
    resolutionNote: body.resolutionNote,
    resolvedAt: isReviewing ? null : now,
    resolvedById: isReviewing ? null : adminUserId
  };
}

export function isReportUpdateRetry(
  existing: { status: ReportStatus; resolutionNote: string | null },
  body: ReportUpdate
) {
  return existing.status === body.status && existing.resolutionNote === body.resolutionNote;
}

export function isIncidentResolutionRetry(
  existing: { resolvedAt: Date | null; resolutionNote: string | null },
  resolutionNote: string
) {
  return existing.resolvedAt !== null && existing.resolutionNote === resolutionNote;
}
