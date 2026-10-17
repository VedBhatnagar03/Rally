import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  runSerializableTransaction,
  SerializableTransactionExhaustedError
} from "../db/serializable.js";
import { upsertProfileSchema } from "../modules/profile/schemas.js";
import { deactivateAccountSchema, deleteAccountSchema } from "../modules/account/schemas.js";
import { verifyPassword, hashPassword } from "../utils/password.js";
import { createOpaqueToken } from "../utils/tokens.js";
import { writeAuditLog } from "../utils/audit.js";
import { policyConsentSchema } from "../modules/policies/schemas.js";
import { env } from "../config/env.js";
import { deletePhotoObject, deletePhotoUploadObject } from "../modules/profile/photo-storage.js";
import { cancelActiveRalliesForUnavailableUser } from "../modules/safety/cancellation.js";

export async function meRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async (request) => {
    return prisma.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        ageAttestedAt: true,
        policyAcceptedAt: true,
        policyVersion: true,
        profile: { include: { prompts: { orderBy: { sortOrder: "asc" } } } },
        sportProfiles: true,
        availability: true,
        photos: { orderBy: { sortOrder: "asc" } }
      }
    });
  });

  app.post("/policy-consent", { preHandler: app.authenticate }, async (request, reply) => {
    const body = policyConsentSchema.parse(request.body);
    if (body.policyVersion !== env.POLICY_VERSION) {
      return reply.code(409).send({ error: "Policy version is outdated; review the current policies" });
    }

    const acceptedAt = new Date();
    const user = await prisma.user.update({
      where: { id: request.user.sub },
      data: {
        ageAttestedAt: acceptedAt,
        policyAcceptedAt: acceptedAt,
        policyVersion: env.POLICY_VERSION
      },
      select: { ageAttestedAt: true, policyAcceptedAt: true, policyVersion: true }
    });
    await writeAuditLog({
      userId: request.user.sub,
      action: "account.policy_consent",
      metadata: { policyVersion: env.POLICY_VERSION },
      request
    });
    return { consent: user };
  });

  app.get(
    "/export",
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 3, timeWindow: "1 day" } }
    },
    async (request, reply) => {
      await writeAuditLog({ userId: request.user.sub, action: "account.data_export", request });

      const [account, rallies, feedback, blocks, reports, notifications, analyticsEvents, auditLogs] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: request.user.sub },
          select: {
            id: true,
            email: true,
            status: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            lastActiveAt: true,
            deactivatedAt: true,
            ageAttestedAt: true,
            policyAcceptedAt: true,
            policyVersion: true,
            profile: { include: { prompts: { orderBy: { sortOrder: "asc" } } } },
            sportProfiles: true,
            availability: true,
            photos: { orderBy: { sortOrder: "asc" } }
          }
        }),
        prisma.rally.findMany({
          where: {
            OR: [{ senderId: request.user.sub }, { receiverId: request.user.sub }]
          },
          select: {
            id: true,
            senderId: true,
            receiverId: true,
            sport: true,
            proposedStartAt: true,
            proposedEndAt: true,
            status: true,
            courtStatus: true,
            courtNumber: true,
            bookingOwnerId: true,
            bookingReference: true,
            cancelledAt: true,
            cancelledById: true,
            cancellationReason: true,
            acceptedAt: true,
            scheduledAt: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true,
            venue: true,
            sender: { select: { id: true, profile: { select: { displayName: true } } } },
            receiver: { select: { id: true, profile: { select: { displayName: true } } } }
          },
          orderBy: { createdAt: "desc" }
        }),
        prisma.rallyFeedback.findMany({
          where: { userId: request.user.sub },
          orderBy: { createdAt: "desc" }
        }),
        prisma.block.findMany({
          where: { blockerId: request.user.sub },
          select: { blockedId: true, reason: true, createdAt: true },
          orderBy: { createdAt: "desc" }
        }),
        prisma.report.findMany({
          where: { reporterId: request.user.sub },
          select: {
            id: true,
            reportedUserId: true,
            rallyId: true,
            category: true,
            status: true,
            details: true,
            resolutionNote: true,
            resolvedAt: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: { createdAt: "desc" }
        }),
        prisma.notification.findMany({
          where: { userId: request.user.sub },
          orderBy: { createdAt: "desc" }
        }),
        prisma.analyticsEvent.findMany({
          where: { userId: request.user.sub },
          orderBy: { createdAt: "desc" }
        }),
        prisma.auditLog.findMany({
          where: { userId: request.user.sub },
          select: { action: true, metadata: true, createdAt: true },
          orderBy: { createdAt: "desc" }
        })
      ]);

      const date = new Date().toISOString().slice(0, 10);
      reply.header("cache-control", "no-store");
      reply.header("content-disposition", `attachment; filename="rally-data-export-${date}.json"`);
      return {
        exportedAt: new Date(),
        account,
        rallies,
        feedback,
        blocks,
        reports,
        notifications,
        analyticsEvents,
        auditLogs
      };
    }
  );

  app.put("/profile", { preHandler: app.authenticate }, async (request) => {
    const body = upsertProfileSchema.parse(request.body);

    await prisma.$transaction(async (tx) => {
      const profile = await tx.profile.upsert({
        where: { userId: request.user.sub },
        create: {
          userId: request.user.sub,
          displayName: body.displayName,
          major: body.major,
          classYear: body.classYear,
          bio: body.bio,
          age: body.age,
          preferredAgeMin: body.preferredAgeMin,
          preferredAgeMax: body.preferredAgeMax,
          gender: body.gender,
          datingIntent: body.datingIntent,
          interestedIn: body.interestedIn,
          campusZone: body.campusZone,
          interests: body.interests,
          profileComplete: true
        },
        update: {
          displayName: body.displayName,
          major: body.major,
          classYear: body.classYear,
          bio: body.bio,
          age: body.age,
          preferredAgeMin: body.preferredAgeMin,
          preferredAgeMax: body.preferredAgeMax,
          gender: body.gender,
          datingIntent: body.datingIntent,
          interestedIn: body.interestedIn,
          campusZone: body.campusZone,
          interests: body.interests,
          profileComplete: true
        }
      });
      await tx.sportProfile.deleteMany({ where: { userId: request.user.sub } });
      await tx.availabilityWindow.deleteMany({ where: { userId: request.user.sub } });
      await tx.profilePrompt.deleteMany({ where: { profileId: profile.id } });
      await tx.sportProfile.createMany({
        data: body.sports.map((sport) => ({ ...sport, userId: request.user.sub }))
      });
      await tx.availabilityWindow.createMany({
        data: body.availability.map((availability) => ({ ...availability, userId: request.user.sub }))
      });
      await tx.profilePrompt.createMany({
        data: body.prompts.map((prompt, sortOrder) => ({
          profileId: profile.id,
          ...prompt,
          sortOrder
        }))
      });
    });

    return { ok: true };
  });

  app.post("/deactivate", { preHandler: app.authenticate }, async (request, reply) => {
    const body = deactivateAccountSchema.parse(request.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.sub } });

    if (user.role === "ADMIN") {
      return reply.code(409).send({ error: "Transfer administrator access before deactivating" });
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      return reply.code(401).send({ error: "Invalid password" });
    }

    const deactivatedAt = new Date();
    try {
      await runSerializableTransaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { status: "DEACTIVATED", deactivatedAt }
        });
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: deactivatedAt, revokedReason: "ACCOUNT_CHANGE" }
        });
        await cancelActiveRalliesForUnavailableUser(tx, user.id, deactivatedAt);
      });
    } catch (error) {
      if (error instanceof SerializableTransactionExhaustedError) {
        return reply.code(503).send({ error: "Account deactivation is temporarily unavailable" });
      }
      throw error;
    }
    await writeAuditLog({
      userId: user.id,
      action: "account.deactivate",
      metadata: body.reason ? { reason: body.reason } : undefined,
      request
    });

    return { ok: true };
  });

  app.delete("/", { preHandler: app.authenticate }, async (request, reply) => {
    const body = deleteAccountSchema.parse(request.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.sub } });

    if (user.role === "ADMIN") {
      return reply.code(409).send({ error: "Transfer administrator access before deleting" });
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      return reply.code(401).send({ error: "Invalid password" });
    }

    const deletedAt = new Date();
    const unusablePasswordHash = await hashPassword(createOpaqueToken());
    const storedObjects = await prisma.photo.findMany({
      where: { userId: user.id, storageKey: { not: null } },
      select: { storageKey: true }
    });
    const uploadObjects = await prisma.photoUpload.findMany({
      where: { userId: user.id },
      select: { objectKey: true }
    });
    try {
      await Promise.all([
        ...storedObjects.flatMap(({ storageKey }) => storageKey ? [deletePhotoObject(storageKey)] : []),
        ...uploadObjects.map(({ objectKey }) => deletePhotoUploadObject(objectKey))
      ]);
    } catch (error) {
      request.log.error({ err: error }, "Could not clean up account photo storage");
      return reply.code(503).send({ error: "Account deletion is temporarily unavailable" });
    }
    try {
      await runSerializableTransaction(async (tx) => {
        await cancelActiveRalliesForUnavailableUser(tx, user.id, deletedAt);
        await Promise.all([
          tx.profile.deleteMany({ where: { userId: user.id } }),
          tx.sportProfile.deleteMany({ where: { userId: user.id } }),
          tx.availabilityWindow.deleteMany({ where: { userId: user.id } }),
          tx.photo.deleteMany({ where: { userId: user.id } }),
          tx.photoUpload.deleteMany({ where: { userId: user.id } }),
          tx.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
          tx.passwordResetToken.deleteMany({ where: { userId: user.id } }),
          tx.refreshToken.deleteMany({ where: { userId: user.id } }),
          tx.analyticsEvent.deleteMany({ where: { userId: user.id } }),
          tx.notification.deleteMany({ where: { userId: user.id } }),
          tx.block.deleteMany({
            where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] }
          }),
          tx.rallyFeedback.updateMany({ where: { userId: user.id }, data: { notes: null } }),
          tx.user.update({
            where: { id: user.id },
            data: {
              email: `deleted+${user.id}@deleted.invalid`,
              passwordHash: unusablePasswordHash,
              status: "DELETED",
              role: "USER",
              deletedAt,
              deactivatedAt: deletedAt
            }
          })
        ]);
      });
    } catch (error) {
      if (error instanceof SerializableTransactionExhaustedError) {
        return reply.code(503).send({ error: "Account deletion is temporarily unavailable" });
      }
      throw error;
    }

    await writeAuditLog({ userId: user.id, action: "account.delete", request });
    return reply.code(204).send();
  });
}
