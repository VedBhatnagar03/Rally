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
      include: { profile: true, sportProfiles: true, availability: true },
      take: 50
    });

    const recommendations = candidates
      .flatMap((candidate) => {
        if (!candidate.profile) return [];

        const scored = scoreCandidate(
          {
            userId: currentUser.id,
            displayName: currentProfile.displayName,
            sports: currentUser.sportProfiles,
            availability: currentUser.availability,
            trustScore: currentProfile.trustScore
          },
          {
            userId: candidate.id,
            displayName: candidate.profile.displayName,
            sports: candidate.sportProfiles,
            availability: candidate.availability,
            trustScore: candidate.profile.trustScore
          }
        );

        return scored ? [scored] : [];
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return { recommendations };
  });
}
