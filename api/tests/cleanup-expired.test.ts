import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { cleanupExpiredArtifacts } from "../src/modules/maintenance/cleanup.js";

function cleanupStore(uploads: Array<{ id: string; objectKey: string }>) {
  const remaining = new Map(uploads.map((upload) => [upload.id, upload]));
  const store = {
    photoUpload: {
      findMany: vi.fn(async ({ where, take }) =>
        [...remaining.values()]
          .filter((upload) => !where.id || upload.id > where.id.gt)
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, take)
      ),
      deleteMany: vi.fn(async ({ where }) => {
        let count = 0;
        for (const id of where.id.in) {
          if (remaining.delete(id)) count += 1;
        }
        return { count };
      })
    },
    emailVerificationToken: { deleteMany: vi.fn(async () => ({ count: 2 })) },
    passwordResetToken: { deleteMany: vi.fn(async () => ({ count: 3 })) },
    refreshToken: { deleteMany: vi.fn(async () => ({ count: 4 })) },
    $transaction: vi.fn(async (operations) => Promise.all(operations))
  };
  return { remaining, store: store as unknown as PrismaClient };
}

describe("expired artifact cleanup", () => {
  it("removes expired token rows and staging uploads in bounded batches", async () => {
    const { remaining, store } = cleanupStore([
      { id: "a", objectKey: "incoming/user/a.jpg" },
      { id: "b", objectKey: "incoming/user/b.jpg" }
    ]);
    const removeUploadObject = vi.fn(async () => undefined);

    const summary = await cleanupExpiredArtifacts({
      now: new Date("2026-10-16T12:00:00.000Z"),
      batchSize: 1,
      store,
      removeUploadObject
    });

    expect(summary).toEqual({
      emailVerificationTokens: 2,
      passwordResetTokens: 3,
      refreshTokens: 4,
      photoUploads: 2,
      failedPhotoUploads: 0
    });
    expect(removeUploadObject).toHaveBeenCalledTimes(2);
    expect(remaining.size).toBe(0);
  });

  it("retains upload rows whose private object could not be removed", async () => {
    const { remaining, store } = cleanupStore([
      { id: "a", objectKey: "incoming/user/a.jpg" },
      { id: "b", objectKey: "incoming/user/b.jpg" }
    ]);
    const removeUploadObject = vi.fn(async (objectKey: string) => {
      if (objectKey.endsWith("a.jpg")) throw new Error("storage unavailable");
    });

    const summary = await cleanupExpiredArtifacts({ batchSize: 1, store, removeUploadObject });

    expect(summary.photoUploads).toBe(1);
    expect(summary.failedPhotoUploads).toBe(1);
    expect([...remaining.keys()]).toEqual(["a"]);
  });

  it("rejects unsafe batch sizes", async () => {
    await expect(cleanupExpiredArtifacts({ batchSize: 0 })).rejects.toThrow(
      "Cleanup batch size must be an integer from 1 to 500"
    );
  });
});
