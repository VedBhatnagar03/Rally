import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { upsertProfileSchema } from "../modules/profile/schemas.js";
import { deactivateAccountSchema, deleteAccountSchema } from "../modules/account/schemas.js";
import { verifyPassword, hashPassword } from "../utils/password.js";
import { createOpaqueToken } from "../utils/tokens.js";
import { writeAuditLog } from "../utils/audit.js";

export async function meRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async (request) => {
    return prisma.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        profile: true,
        sportProfiles: true,
        availability: true
      }
    });
  });

  app.put("/profile", { preHandler: app.authenticate }, async (request) => {
    const body = upsertProfileSchema.parse(request.body);

    await prisma.$transaction([
      prisma.profile.upsert({
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
          profileComplete: true
        }
      }),
      prisma.sportProfile.deleteMany({ where: { userId: request.user.sub } }),
      prisma.availabilityWindow.deleteMany({ where: { userId: request.user.sub } }),
      prisma.sportProfile.createMany({
        data: body.sports.map((sport) => ({ ...sport, userId: request.user.sub }))
      }),
      prisma.availabilityWindow.createMany({
        data: body.availability.map((availability) => ({ ...availability, userId: request.user.sub }))
      })
    ]);

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

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { status: "DEACTIVATED", deactivatedAt: new Date() }
      }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);
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
    await prisma.$transaction([
      prisma.profile.deleteMany({ where: { userId: user.id } }),
      prisma.sportProfile.deleteMany({ where: { userId: user.id } }),
      prisma.availabilityWindow.deleteMany({ where: { userId: user.id } }),
      prisma.photo.deleteMany({ where: { userId: user.id } }),
      prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      prisma.analyticsEvent.deleteMany({ where: { userId: user.id } }),
      prisma.block.deleteMany({
        where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] }
      }),
      prisma.rallyFeedback.updateMany({ where: { userId: user.id }, data: { notes: null } }),
      prisma.user.update({
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

    await writeAuditLog({ userId: user.id, action: "account.delete", request });
    return reply.code(204).send();
  });
}
