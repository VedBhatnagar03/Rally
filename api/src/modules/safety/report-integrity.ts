import { createHash } from "node:crypto";

export const manualReportLimit = 5;
export const manualReportWindowMs = 24 * 60 * 60 * 1000;

export function reportDedupeKey(input: {
  reporterId: string;
  reportedUserId: string;
  rallyId?: string;
  category: string;
  details: string;
  now: Date;
}) {
  const utcDay = Math.floor(input.now.getTime() / manualReportWindowMs);
  return createHash("sha256")
    .update(
      JSON.stringify({
        reporterId: input.reporterId,
        reportedUserId: input.reportedUserId,
        rallyId: input.rallyId ?? null,
        category: input.category,
        details: input.details,
        utcDay
      })
    )
    .digest("hex");
}
