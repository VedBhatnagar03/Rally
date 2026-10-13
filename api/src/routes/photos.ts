import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  photoOrderSchema,
  photoParamsSchema,
  photoUploadIntentSchema,
  photoUploadParamsSchema
} from "../modules/profile/schemas.js";
import {
  createPhotoObjectKey,
  createPhotoUploadPost,
  deletePhotoObject,
  deletePhotoUploadObject,
  photoPublicUrl,
  photoUploadExpiresAt,
  processPhotoObject,
  processedPhotoObjectKey
} from "../modules/profile/photo-storage.js";

class PhotoLimitError extends Error {}
class UploadUnavailableError extends Error {}

export async function photoRoutes(app: FastifyInstance) {
  app.post("/upload-intents", { preHandler: app.authenticate }, async (request, reply) => {
    const body = photoUploadIntentSchema.parse(request.body);
    const [photoCount, pendingCount] = await Promise.all([
      prisma.photo.count({ where: { userId: request.user.sub } }),
      prisma.photoUpload.count({
        where: { userId: request.user.sub, completedAt: null, expiresAt: { gt: new Date() } }
      })
    ]);
    if (photoCount >= 6) return reply.code(409).send({ error: "A profile can have at most 6 photos" });
    if (pendingCount >= 6) return reply.code(429).send({ error: "Too many pending photo uploads" });

    const objectKey = createPhotoObjectKey(request.user.sub, body.contentType);
    const expiresAt = photoUploadExpiresAt();
    try {
      const upload = await prisma.photoUpload.create({
        data: { userId: request.user.sub, objectKey, expiresAt, ...body }
      });
      const post = await createPhotoUploadPost({ objectKey, ...body });
      return reply.code(201).send({
        upload: { id: upload.id, url: post.url, fields: post.fields, expiresAt }
      });
    } catch (error) {
      request.log.error({ err: error }, "Could not create profile photo upload intent");
      return reply.code(503).send({ error: "Photo uploads are temporarily unavailable" });
    }
  });

  app.post(
    "/upload-intents/:uploadId/complete",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { uploadId } = photoUploadParamsSchema.parse(request.params);
      const upload = await prisma.photoUpload.findFirst({
        where: { id: uploadId, userId: request.user.sub }
      });
      if (!upload) return reply.code(404).send({ error: "Photo upload not found" });
      if (upload.expiresAt <= new Date() && !upload.completedAt) {
        return reply.code(410).send({ error: "Photo upload has expired" });
      }

      const existing = upload.completedAt
        ? await prisma.photo.findUnique({
            where: { storageKey: processedPhotoObjectKey(request.user.sub, upload.id) }
          })
        : null;
      if (existing) return { photo: existing };

      const outputKey = processedPhotoObjectKey(request.user.sub, upload.id);
      let published = false;
      try {
        const processed = await processPhotoObject({ ...upload, outputKey });
        published = true;
        const result = await prisma.$transaction(
          async (tx) => {
            const current = await tx.photoUpload.findFirst({
              where: { id: upload.id, userId: request.user.sub }
            });
            if (!current || current.expiresAt <= new Date()) throw new UploadUnavailableError();
            if (current.completedAt) {
              const completed = await tx.photo.findUnique({ where: { storageKey: outputKey } });
              if (completed) return { photo: completed, created: false };
              throw new UploadUnavailableError();
            }

            const count = await tx.photo.count({ where: { userId: request.user.sub } });
            if (count >= 6) throw new PhotoLimitError();

            const claimed = await tx.photoUpload.updateMany({
              where: { id: current.id, completedAt: null, expiresAt: { gt: new Date() } },
              data: { completedAt: new Date() }
            });
            if (claimed.count !== 1) throw new UploadUnavailableError();

            const photo = await tx.photo.create({
              data: {
                userId: request.user.sub,
                url: photoPublicUrl(outputKey),
                storageKey: outputKey,
                contentType: processed.contentType,
                sizeBytes: processed.sizeBytes,
                sortOrder: count
              }
            });
            return { photo, created: true };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        await deletePhotoUploadObject(upload.objectKey).catch((error) => {
          request.log.warn({ err: error }, "Could not remove finalized photo upload object");
        });
        return reply.code(result.created ? 201 : 200).send({ photo: result.photo });
      } catch (error) {
        const retained = published
          ? await prisma.photo.findUnique({ where: { storageKey: outputKey } })
          : null;
        if (published) {
          if (!retained) await deletePhotoObject(outputKey).catch(() => undefined);
        }
        if (error instanceof PhotoLimitError) {
          return reply.code(409).send({ error: "A profile can have at most 6 photos" });
        }
        if (
          error instanceof UploadUnavailableError ||
          (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
        ) {
          if (retained) return reply.code(200).send({ photo: retained });
          return reply.code(409).send({ error: "Photo upload could not be finalized; retry" });
        }
        request.log.warn({ err: error }, "Profile photo upload verification failed");
        return reply.code(400).send({ error: "Uploaded photo could not be verified" });
      }
    }
  );

  app.patch("/order", { preHandler: app.authenticate }, async (request, reply) => {
    const { photoIds } = photoOrderSchema.parse(request.body);
    const owned = await prisma.photo.findMany({
      where: { userId: request.user.sub },
      select: { id: true }
    });
    const ownedIds = new Set(owned.map(({ id }) => id));
    if (owned.length !== photoIds.length || photoIds.some((id) => !ownedIds.has(id))) {
      return reply.code(400).send({ error: "photoIds must contain every profile photo exactly once" });
    }
    await prisma.$transaction(
      photoIds.map((id, sortOrder) =>
        prisma.photo.update({ where: { id }, data: { sortOrder } })
      )
    );
    const photos = await prisma.photo.findMany({
      where: { userId: request.user.sub },
      orderBy: { sortOrder: "asc" }
    });
    return { photos };
  });

  app.delete("/:photoId", { preHandler: app.authenticate }, async (request, reply) => {
    const { photoId } = photoParamsSchema.parse(request.params);
    const photo = await prisma.photo.findFirst({
      where: { id: photoId, userId: request.user.sub }
    });
    if (!photo) return reply.code(404).send({ error: "Photo not found" });

    try {
      if (photo.storageKey) await deletePhotoObject(photo.storageKey);
      await prisma.photo.delete({ where: { id: photo.id } });
      const remaining = await prisma.photo.findMany({
        where: { userId: request.user.sub },
        orderBy: { sortOrder: "asc" },
        select: { id: true }
      });
      await prisma.$transaction(
        remaining.map(({ id }, sortOrder) =>
          prisma.photo.update({ where: { id }, data: { sortOrder } })
        )
      );
      return reply.code(204).send();
    } catch (error) {
      request.log.error({ err: error }, "Could not delete profile photo");
      return reply.code(503).send({ error: "Photo deletion is temporarily unavailable" });
    }
  });
}
