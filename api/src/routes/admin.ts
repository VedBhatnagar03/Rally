import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  runSerializableTransaction,
  SerializableTransactionExhaustedError
} from "../db/serializable.js";
import {
  adminListQuerySchema,
  adminSummaryQuerySchema,
  auditLogListQuerySchema,
  incidentListQuerySchema,
  resolveIncidentSchema,
  updateReportSchema,
  updateUserStatusSchema
} from "../modules/admin/schemas.js";
import { buildFunnelRates, perActiveUser } from "../modules/admin/metrics.js";
import { presentReport } from "../modules/safety/presentation.js";
import { cancelActiveRalliesForUnavailableUser } from "../modules/safety/cancellation.js";
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
      staleOpenReports,
      openIncidents
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
      }),
      prisma.operationalIncident.count({ where: { resolvedAt: null } })
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
          unresolvedReportsOver24Hours: staleOpenReports,
          openIncidents
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
        ageAttestedAt: true,
        policyAcceptedAt: true,
        policyVersion: true,
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

    const now = new Date();
    let user;
    try {
      user = await runSerializableTransaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: userId },
          data: { status: body.status },
          select: { id: true, email: true, status: true, role: true, updatedAt: true }
        });
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now, revokedReason: "ACCOUNT_CHANGE" }
        });
        if (body.status === "SUSPENDED") {
          await cancelActiveRalliesForUnavailableUser(tx, userId, now);
        }
        return updated;
      });
    } catch (error) {
      if (error instanceof SerializableTransactionExhaustedError) {
        return reply.code(503).send({ error: "Account status update is temporarily unavailable" });
      }
      throw error;
    }

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
    return { reports: reports.map(presentReport) };
  });

  app.get("/incidents", { preHandler: app.authorizeAdmin }, async (request) => {
    const { limit, status } = incidentListQuerySchema.parse(request.query);
    const incidents = await prisma.operationalIncident.findMany({
      where:
        status === "ALL"
          ? undefined
          : { resolvedAt: status === "OPEN" ? null : { not: null } },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return { incidents };
  });

  app.get("/audit-logs", { preHandler: app.authorizeAdmin }, async (request, reply) => {
    const { action, actorUserId, cursor, limit } = auditLogListQuerySchema.parse(request.query);
    const where = {
      ...(action ? { action } : {}),
      ...(actorUserId ? { userId: actorUserId } : {})
    };

    if (cursor) {
      const cursorExists = await prisma.auditLog.count({ where: { id: cursor, ...where } });
      if (cursorExists !== 1) return reply.code(400).send({ error: "Invalid audit log cursor" });
    }

    const auditLogs = await prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        metadata: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        user: { select: { id: true, email: true, status: true, role: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : undefined
    });
    const hasMore = auditLogs.length > limit;
    const page = hasMore ? auditLogs.slice(0, limit) : auditLogs;

    return {
      auditLogs: page,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null
    };
  });

  app.patch("/incidents/:incidentId/resolve", { preHandler: app.authorizeAdmin }, async (request, reply) => {
    const { incidentId } = request.params as { incidentId: string };
    const body = resolveIncidentSchema.parse(request.body);
    const existing = await prisma.operationalIncident.findUnique({
      where: { id: incidentId },
      select: { id: true }
    });
    if (!existing) return reply.code(404).send({ error: "Incident not found" });

    const incident = await prisma.operationalIncident.update({
      where: { id: incidentId },
      data: {
        resolvedAt: new Date(),
        resolvedById: request.user.sub,
        resolutionNote: body.resolutionNote
      }
    });

    await writeAuditLog({
      userId: request.user.sub,
      action: "admin.incident_resolved",
      metadata: { incidentId },
      request
    });
    return { incident };
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
    return { report: presentReport(report) };
  });
}
