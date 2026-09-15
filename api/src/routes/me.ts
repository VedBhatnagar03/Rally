import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { upsertProfileSchema } from "../modules/profile/schemas.js";

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
}
