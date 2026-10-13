import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { scoreCandidate } from "../modules/matching/matcher.js";

export async function recommendationRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async (request) => {
    const currentUser = await prisma.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      include: { profile: true, sportProfiles: true, availability: true }
    });

    const currentProfile = currentUser.profile;

    if (!currentProfile) {
      return { recommendations: [] };
    }

    const candidates = await prisma.user.findMany({
      where: {
        id: { not: currentUser.id },
        status: "ACTIVE",
        profile: { profileComplete: true },
        blocksReceived: {
          none: { blockerId: currentUser.id }
        },
        blocksCreated: {
          none: { blockedId: currentUser.id }
        }
      },
      include: {
        profile: { include: { prompts: { orderBy: { sortOrder: "asc" } } } },
        sportProfiles: true,
        availability: true,
        photos: { orderBy: { sortOrder: "asc" } }
      },
      orderBy: { lastActiveAt: { sort: "desc", nulls: "last" } },
      take: 50
    });

    const recommendations = candidates
      .flatMap((candidate) => {
        if (!candidate.profile) return [];

        const scored = scoreCandidate(
          {
            userId: currentUser.id,
            displayName: currentProfile.displayName,
            profile: currentProfile,
            sports: currentUser.sportProfiles,
            availability: currentUser.availability
          },
          {
            userId: candidate.id,
            displayName: candidate.profile.displayName,
            profile: candidate.profile,
            sports: candidate.sportProfiles,
            availability: candidate.availability
          }
        );

        return scored
          ? [{
              ...scored,
              profile: {
                age: candidate.profile.age,
                major: candidate.profile.major,
                classYear: candidate.profile.classYear,
                bio: candidate.profile.bio,
                gender: candidate.profile.gender,
                datingIntent: candidate.profile.datingIntent,
                campusZone: candidate.profile.campusZone,
                interests: candidate.profile.interests,
                sports: candidate.sportProfiles.map(({ sport, skillLevel, intensity, favorite }) => ({
                  sport,
                  skillLevel,
                  intensity,
                  favorite
                })),
                photos: candidate.photos.map(({ id, url, sortOrder }) => ({ id, url, sortOrder })),
                prompts: candidate.profile.prompts.map(({ promptKey, answer, sortOrder }) => ({
                  promptKey,
                  answer,
                  sortOrder
                }))
              }
            }]
          : [];
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return { recommendations };
  });
}
