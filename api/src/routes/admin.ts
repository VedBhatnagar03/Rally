import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  adminListQuerySchema,
  adminSummaryQuerySchema,
  updateReportSchema,
  updateUserStatusSchema
} from "../modules/admin/schemas.js";
import { buildFunnelRates, perActiveUser } from "../modules/admin/metrics.js";
import { writeAuditLog } from "../utils/audit.js";

export async function adminRoutes(app: FastifyInstance) {
  app.get("/summary", { preHandler: app.authorizeAdmin }, async (request) => {
    const { windowDays } = adminSummaryQuerySchema.parse(request.query);
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const stalePendingBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const staleAcceptedBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const staleReportBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      users,
      activeUsers,
      completeProfiles,
      viableUsers,
      ralliesSent,
      acceptedRallies,
      scheduledRallies,
      completedRallies,
      mutualCandidates,
      openReports,
      activeUsersInWindow,
      ralliesSentInWindow,
      acceptedFromSentCohort,
      scheduledFromSentCohort,
      completedFromSentCohort,
      completedInWindow,
      cancelledInWindow,
      reportsInWindow,
      stalePendingRallies,
      staleAcceptedRallies,
      overdueScheduledRallies,
      staleOpenReports
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.profile.count({ where: { profileComplete: true } }),
      prisma.user.count({
        where: {
          status: "ACTIVE",
          profile: { profileComplete: true },
          sportProfiles: { some: {} },
          availability: { some: {} }
        }
      }),
      prisma.rally.count(),
      prisma.rally.count({ where: { acceptedAt: { not: null } } }),
      prisma.rally.count({ where: { scheduledAt: { not: null } } }),
      prisma.rally.count({ where: { completedAt: { not: null } } }),
      prisma.rally.findMany({
        where: {
          feedback: {
            every: { rallyAgain: true },
            some: { rallyAgain: true }
          }
        },
        select: { completedAt: true, feedback: { select: { id: true } } }
      }),
      prisma.report.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }),
      prisma.user.count({ where: { status: "ACTIVE", lastActiveAt: { gte: windowStart } } }),
      prisma.rally.count({ where: { createdAt: { gte: windowStart } } }),
      prisma.rally.count({
        where: { createdAt: { gte: windowStart }, acceptedAt: { not: null } }
      }),
      prisma.rally.count({
        where: { createdAt: { gte: windowStart }, scheduledAt: { not: null } }
      }),
      prisma.rally.count({
        where: { createdAt: { gte: windowStart }, completedAt: { not: null } }
      }),
      prisma.rally.count({ where: { completedAt: { gte: windowStart } } }),
      prisma.rally.count({ where: { cancelledAt: { gte: windowStart } } }),
      prisma.report.count({ where: { createdAt: { gte: windowStart } } }),
      prisma.rally.count({ where: { status: "PENDING", createdAt: { lt: stalePendingBefore } } }),
      prisma.rally.count({ where: { status: "ACCEPTED", acceptedAt: { lt: staleAcceptedBefore } } }),
      prisma.rally.count({ where: { status: "SCHEDULED", proposedEndAt: { lt: now } } }),
      prisma.report.count({
        where: {
          status: { in: ["OPEN", "REVIEWING"] },
          createdAt: { lt: staleReportBefore }
        }
      })
    ]);

    const mutualRallyAgain = mutualCandidates.filter(({ feedback }) => feedback.length >= 2).length;
    const mutualRallyAgainInWindow = mutualCandidates.filter(
      ({ completedAt, feedback }) =>
        feedback.length >= 2 && completedAt !== null && completedAt >= windowStart
    ).length;

    return {
      summary: {
        users,
        activeUsers,
        completeProfiles,
        viableUsers,
        ralliesSent,
        acceptedRallies,
        scheduledRallies,
        completedRallies,
        mutualRallyAgain,
        openReports,
        window: {
          days: windowDays,
          startsAt: windowStart,
          activeUsers: activeUsersInWindow,
          funnel: {
            ralliesSent: ralliesSentInWindow,
            acceptedRallies: acceptedFromSentCohort,
            scheduledRallies: scheduledFromSentCohort,
            completedRallies: completedFromSentCohort,
            conversionPercent: buildFunnelRates({
              sent: ralliesSentInWindow,
              accepted: acceptedFromSentCohort,
              scheduled: scheduledFromSentCohort,
              completed: completedFromSentCohort
            })
          },
          outcomes: {
            completedRallies: completedInWindow,
            cancelledRallies: cancelledInWindow,
            mutualRallyAgain: mutualRallyAgainInWindow,
            reports: reportsInWindow,
            completedRalliesPerActiveUser: perActiveUser(completedInWindow, activeUsersInWindow)
          }
        },
        operations: {
          pendingOver48Hours: stalePendingRallies,
          acceptedUnscheduledOver24Hours: staleAcceptedRallies,
          scheduledPastEnd: overdueScheduledRallies,
          unresolvedReportsOver24Hours: staleOpenReports
        }
      }
    };
  });

  app.get("/users", { preHandler: app.authorizeAdmin }, async (request) => {
    const { limit } = adminListQuerySchema.parse(request.query);
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        lastActiveAt: true,
        profile: true,
        sportProfiles: true,
        availability: true,
        _count: {
          select: {
            sentRallies: true,
            receivedRallies: true,
            reportsReceived: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return { users };
  });

  app.patch("/users/:userId/status", { preHandler: app.authorizeAdmin }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const body = updateUserStatusSchema.parse(request.body);

    if (userId === request.user.sub && body.status === "SUSPENDED") {
      return reply.code(400).send({ error: "You cannot suspend your own admin account" });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true }
    });
    if (!target) return reply.code(404).send({ error: "User not found" });
    if (target.status === "DELETED") {
      return reply.code(409).send({ error: "Deleted accounts cannot be reactivated" });
    }

    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { status: body.status },
        select: { id: true, email: true, status: true, role: true, updatedAt: true }
      }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);

    await writeAuditLog({
      userId: request.user.sub,
      action: "admin.user_status_updated",
      metadata: { targetUserId: userId, status: body.status, reason: body.reason },
      request
    });
    return { user };
  });

  app.get("/rallies", { preHandler: app.authorizeAdmin }, async (request) => {
    const { limit } = adminListQuerySchema.parse(request.query);
    const rallies = await prisma.rally.findMany({
      include: {
        sender: { select: { id: true, email: true, profile: true } },
        receiver: { select: { id: true, email: true, profile: true } },
        venue: true,
        _count: { select: { feedback: true, reports: true } }
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return { rallies };
  });

  app.get("/reports", { preHandler: app.authorizeAdmin }, async (request) => {
    const { limit } = adminListQuerySchema.parse(request.query);
    const reports = await prisma.report.findMany({
      include: {
        reporter: { select: { id: true, email: true, profile: true } },
        reportedUser: { select: { id: true, email: true, profile: true } },
        rally: true
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return { reports };
  });

  app.patch("/reports/:reportId", { preHandler: app.authorizeAdmin }, async (request, reply) => {
    const { reportId } = request.params as { reportId: string };
    const body = updateReportSchema.parse(request.body);
    const existing = await prisma.report.findUnique({ where: { id: reportId }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: "Report not found" });

    const report = await prisma.report.update({
      where: { id: reportId },
      data: {
        status: body.status,
        resolutionNote: body.resolutionNote,
        resolvedAt: body.status === "REVIEWING" ? null : new Date(),
        resolvedById: body.status === "REVIEWING" ? null : request.user.sub
      }
    });

    await writeAuditLog({
      userId: request.user.sub,
      action: "admin.report_updated",
      metadata: { reportId, status: body.status },
      request
    });
    return { report };
  });
}
