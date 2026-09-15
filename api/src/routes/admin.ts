import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";

export async function adminRoutes(app: FastifyInstance) {
  app.get("/summary", { preHandler: app.authorizeAdmin }, async () => {
    const [
      users,
      completeProfiles,
      ralliesSent,
      acceptedRallies,
      completedRallies,
      mutualRallyAgain,
      openReports
    ] = await Promise.all([
      prisma.user.count(),
      prisma.profile.count({ where: { profileComplete: true } }),
      prisma.rally.count(),
      prisma.rally.count({ where: { status: "ACCEPTED" } }),
      prisma.rally.count({ where: { status: "COMPLETED" } }),
      prisma.rally.count({
        where: {
          feedback: {
            every: { rallyAgain: true },
            some: { rallyAgain: true }
          }
        }
      }),
      prisma.report.count({ where: { status: "OPEN" } })
    ]);

    return {
      summary: {
        users,
        completeProfiles,
        ralliesSent,
        acceptedRallies,
        completedRallies,
        mutualRallyAgain,
        openReports
      }
    };
  });

  app.get("/reports", { preHandler: app.authorizeAdmin }, async () => {
    const reports = await prisma.report.findMany({
      include: {
        reporter: { select: { id: true, email: true, profile: true } },
        reportedUser: { select: { id: true, email: true, profile: true } },
        rally: true
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return { reports };
  });
}
