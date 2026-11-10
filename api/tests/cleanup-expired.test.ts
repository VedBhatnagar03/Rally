import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { cleanupExpiredArtifacts } from "../src/modules/maintenance/cleanup.js";

function cleanupStore(uploads: Array<{ id: string; objectKey: string }>) {
  const remaining = new Map(uploads.map((upload) => [upload.id, upload]));
  const retainedRows = {
    analyticsEvent: [{ id: "analytics-old" }],
    auditLog: [{ id: "audit-old" }],
    report: [{ id: "report-old" }],
    operationalIncident: [{ id: "incident-old" }]
  };
  const retainedDelegate = (key: keyof typeof retainedRows) => ({
    findMany: vi.fn(async ({ where, take }) =>
      retainedRows[key]
        .filter((row) => !where.id || row.id > where.id.gt)
        .slice(0, take)
    ),
    deleteMany: vi.fn(async ({ where }) => {
      const ids = new Set(where.id.in as string[]);
      const before = retainedRows[key].length;
      retainedRows[key] = retainedRows[key].filter(({ id }) => !ids.has(id));
      return { count: before - retainedRows[key].length };
    })
  });
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
    emailVerificationToken: {
      count: vi.fn(async () => 2),
      deleteMany: vi.fn(async () => ({ count: 2 }))
    },
    passwordResetToken: {
      count: vi.fn(async () => 3),
      deleteMany: vi.fn(async () => ({ count: 3 }))
    },
    refreshToken: {
      count: vi.fn(async () => 4),
      deleteMany: vi.fn(async () => ({ count: 4 }))
    },
    analyticsEvent: retainedDelegate("analyticsEvent"),
    auditLog: retainedDelegate("auditLog"),
    report: retainedDelegate("report"),
    operationalIncident: retainedDelegate("operationalIncident"),
    $transaction: vi.fn(async (operations) => Promise.all(operations))
  };
  return { remaining, retainedRows, store: store as unknown as PrismaClient };
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
      failedPhotoUploads: 0,
      analyticsEvents: 1,
      auditLogs: 1,
      resolvedReports: 1,
      resolvedIncidents: 1,
      dryRun: false
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

  it("reports eligible rows without deleting data during a dry run", async () => {
    const { remaining, retainedRows, store } = cleanupStore([
      { id: "a", objectKey: "incoming/user/a.jpg" }
    ]);
    const removeUploadObject = vi.fn(async () => undefined);

    const summary = await cleanupExpiredArtifacts({
      dryRun: true,
      batchSize: 10,
      store,
      removeUploadObject
    });

    expect(summary).toMatchObject({
      emailVerificationTokens: 2,
      passwordResetTokens: 3,
      refreshTokens: 4,
      photoUploads: 1,
      analyticsEvents: 1,
      auditLogs: 1,
      resolvedReports: 1,
      resolvedIncidents: 1,
      dryRun: true
    });
    expect(removeUploadObject).not.toHaveBeenCalled();
    expect(remaining.size).toBe(1);
    expect(Object.values(retainedRows).every((rows) => rows.length === 1)).toBe(true);
  });
});
