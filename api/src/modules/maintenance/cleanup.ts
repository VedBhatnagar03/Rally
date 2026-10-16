import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { deletePhotoUploadObject } from "../profile/photo-storage.js";

export type ExpiredArtifactCleanupSummary = {
  emailVerificationTokens: number;
  passwordResetTokens: number;
  refreshTokens: number;
  photoUploads: number;
  failedPhotoUploads: number;
};

export async function cleanupExpiredArtifacts(options: {
  now?: Date;
  batchSize?: number;
  store?: PrismaClient;
  removeUploadObject?: (objectKey: string) => Promise<void>;
} = {}): Promise<ExpiredArtifactCleanupSummary> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? 100;
  const store = options.store ?? prisma;
  const removeUploadObject = options.removeUploadObject ?? deletePhotoUploadObject;
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
      try {
        await removeUploadObject(upload.objectKey);
        removableIds.push(upload.id);
      } catch {
        failedPhotoUploads += 1;
      }
    }

    if (removableIds.length > 0) {
      const deleted = await store.photoUpload.deleteMany({
        where: { id: { in: removableIds }, expiresAt: { lte: now } }
      });
      deletedPhotoUploads += deleted.count;
    }
    cursor = uploads.at(-1)?.id;
  }

  const [emailVerificationTokens, passwordResetTokens, refreshTokens] = await store.$transaction([
    store.emailVerificationToken.deleteMany({ where: { expiresAt: { lte: now } } }),
    store.passwordResetToken.deleteMany({ where: { expiresAt: { lte: now } } }),
    store.refreshToken.deleteMany({ where: { expiresAt: { lte: now } } })
  ]);

  return {
    emailVerificationTokens: emailVerificationTokens.count,
    passwordResetTokens: passwordResetTokens.count,
    refreshTokens: refreshTokens.count,
    photoUploads: deletedPhotoUploads,
    failedPhotoUploads
  };
}
