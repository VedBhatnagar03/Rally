import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { deletePhotoUploadObject } from "../profile/photo-storage.js";

export type ExpiredArtifactCleanupSummary = {
  emailVerificationTokens: number;
  passwordResetTokens: number;
  refreshTokens: number;
  photoUploads: number;
  failedPhotoUploads: number;
  analyticsEvents: number;
  auditLogs: number;
  resolvedReports: number;
  resolvedIncidents: number;
  dryRun: boolean;
};

export type RetentionDays = {
  analytics: number;
  auditLogs: number;
  resolvedReports: number;
  resolvedIncidents: number;
};

const defaultRetentionDays: RetentionDays = {
  analytics: 90,
  auditLogs: 365,
  resolvedReports: 730,
  resolvedIncidents: 365
};

function retentionCutoff(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function removeInBatches(options: {
  batchSize: number;
  dryRun: boolean;
  findIds: (cursor?: string) => Promise<Array<{ id: string }>>;
  deleteIds: (ids: string[]) => Promise<{ count: number }>;
}) {
  let cursor: string | undefined;
  let total = 0;
  while (true) {
    const rows = await options.findIds(cursor);
    if (rows.length === 0) break;
    total += options.dryRun
      ? rows.length
      : (await options.deleteIds(rows.map(({ id }) => id))).count;
    cursor = rows.at(-1)?.id;
    if (rows.length < options.batchSize) break;
  }
  return total;
}

export async function cleanupExpiredArtifacts(options: {
  now?: Date;
  batchSize?: number;
  store?: PrismaClient;
  removeUploadObject?: (objectKey: string) => Promise<void>;
  retentionDays?: RetentionDays;
  dryRun?: boolean;
} = {}): Promise<ExpiredArtifactCleanupSummary> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? 100;
  const store = options.store ?? prisma;
  const removeUploadObject = options.removeUploadObject ?? deletePhotoUploadObject;
  const retentionDays = options.retentionDays ?? defaultRetentionDays;
  const dryRun = options.dryRun ?? false;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("Cleanup batch size must be an integer from 1 to 500");
  }

  let cursor: string | undefined;
  let deletedPhotoUploads = 0;
  let failedPhotoUploads = 0;

  while (true) {
    const uploads = await store.photoUpload.findMany({
      where: {
        expiresAt: { lte: now },
        ...(cursor ? { id: { gt: cursor } } : {})
      },
      select: { id: true, objectKey: true },
      orderBy: { id: "asc" },
      take: batchSize
    });
    if (uploads.length === 0) break;

    const removableIds: string[] = [];
    for (const upload of uploads) {
      if (dryRun) {
        removableIds.push(upload.id);
        continue;
      }
      try {
        await removeUploadObject(upload.objectKey);
        removableIds.push(upload.id);
      } catch {
        failedPhotoUploads += 1;
      }
    }

    if (dryRun) {
      deletedPhotoUploads += removableIds.length;
    } else if (removableIds.length > 0) {
      const deleted = await store.photoUpload.deleteMany({
        where: { id: { in: removableIds }, expiresAt: { lte: now } }
      });
      deletedPhotoUploads += deleted.count;
    }
    cursor = uploads.at(-1)?.id;
  }

  const [emailVerificationTokens, passwordResetTokens, refreshTokens] = dryRun
    ? await Promise.all([
        store.emailVerificationToken.count({ where: { expiresAt: { lte: now } } }),
        store.passwordResetToken.count({ where: { expiresAt: { lte: now } } }),
        store.refreshToken.count({ where: { expiresAt: { lte: now } } })
      ]).then((counts) => counts.map((count) => ({ count })))
    : await store.$transaction([
        store.emailVerificationToken.deleteMany({ where: { expiresAt: { lte: now } } }),
        store.passwordResetToken.deleteMany({ where: { expiresAt: { lte: now } } }),
        store.refreshToken.deleteMany({ where: { expiresAt: { lte: now } } })
      ]);

  const analyticsCutoff = retentionCutoff(now, retentionDays.analytics);
  const auditCutoff = retentionCutoff(now, retentionDays.auditLogs);
  const reportCutoff = retentionCutoff(now, retentionDays.resolvedReports);
  const incidentCutoff = retentionCutoff(now, retentionDays.resolvedIncidents);

  const analyticsEvents = await removeInBatches({
    batchSize,
    dryRun,
    findIds: (cursor) => store.analyticsEvent.findMany({
      where: { createdAt: { lt: analyticsCutoff }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
      take: batchSize
    }),
    deleteIds: (ids) => store.analyticsEvent.deleteMany({ where: { id: { in: ids } } })
  });
  const auditLogs = await removeInBatches({
    batchSize,
    dryRun,
    findIds: (cursor) => store.auditLog.findMany({
      where: { createdAt: { lt: auditCutoff }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
      take: batchSize
    }),
    deleteIds: (ids) => store.auditLog.deleteMany({ where: { id: { in: ids } } })
  });
  const resolvedReports = await removeInBatches({
    batchSize,
    dryRun,
    findIds: (cursor) => store.report.findMany({
      where: {
        status: { in: ["RESOLVED", "DISMISSED"] },
        resolvedAt: { lt: reportCutoff },
        ...(cursor ? { id: { gt: cursor } } : {})
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: batchSize
    }),
    deleteIds: (ids) => store.report.deleteMany({ where: { id: { in: ids } } })
  });
  const resolvedIncidents = await removeInBatches({
    batchSize,
    dryRun,
    findIds: (cursor) => store.operationalIncident.findMany({
      where: { resolvedAt: { lt: incidentCutoff }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
      take: batchSize
    }),
    deleteIds: (ids) => store.operationalIncident.deleteMany({ where: { id: { in: ids } } })
  });

  return {
    emailVerificationTokens: emailVerificationTokens.count,
    passwordResetTokens: passwordResetTokens.count,
    refreshTokens: refreshTokens.count,
    photoUploads: deletedPhotoUploads,
    failedPhotoUploads,
    analyticsEvents,
    auditLogs,
    resolvedReports,
    resolvedIncidents,
    dryRun
  };
}
