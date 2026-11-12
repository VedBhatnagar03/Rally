import type { Prisma } from "@prisma/client";
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
import {
  isIncidentResolutionRetry,
  isReportUpdateRetry,
  reportUpdateData
} from "../modules/admin/integrity.js";
import { presentReport } from "../modules/safety/presentation.js";
import { cancelActiveRalliesForUnavailableUser } from "../modules/safety/cancellation.js";
import { writeAuditLog } from "../utils/audit.js";

type DataScope = "REAL" | "TEST" | "ALL";

function userScopeWhere(dataScope: DataScope): Prisma.UserWhereInput {
  return {
    role: "USER",
    ...(dataScope === "ALL" ? {} : { isTestAccount: dataScope === "TEST" })
  };
}

function rallyScopeWhere(dataScope: DataScope): Prisma.RallyWhereInput {
  const accountScope = {
    role: "USER" as const,
    ...(dataScope === "ALL" ? {} : { isTestAccount: dataScope === "TEST" })
  };
  return {
    sender: accountScope,
    receiver: accountScope
  };
}

function reportScopeWhere(dataScope: DataScope): Prisma.ReportWhereInput {
  const accountScope = {
    role: "USER" as const,
    ...(dataScope === "ALL" ? {} : { isTestAccount: dataScope === "TEST" })
  };
  return {
    reporter: accountScope,
    reportedUser: accountScope
  };
}

export async function adminRoutes(app: FastifyInstance) {
  app.get("/summary", { preHandler: app.authorizeAdmin }, async (request) => {
    const { dataScope, windowDays } = adminSummaryQuerySchema.parse(request.query);
    const userScope = userScopeWhere(dataScope);
    const rallyScope = rallyScopeWhere(dataScope);
    const reportScope = reportScopeWhere(dataScope);
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
      prisma.user.count({ where: userScope }),
      prisma.user.count({ where: { ...userScope, status: "ACTIVE" } }),
      prisma.profile.count({ where: { profileComplete: true, user: userScope } }),
      prisma.user.count({
        where: {
          ...userScope,
          status: "ACTIVE",
          profile: { profileComplete: true },
          sportProfiles: { some: {} },
          availability: { some: {} }
        }
      }),
      prisma.rally.count({ where: rallyScope }),
      prisma.rally.count({ where: { ...rallyScope, acceptedAt: { not: null } } }),
      prisma.rally.count({ where: { ...rallyScope, scheduledAt: { not: null } } }),
      prisma.rally.count({ where: { ...rallyScope, completedAt: { not: null } } }),
      prisma.rally.findMany({
        where: {
          ...rallyScope,
          feedback: {
            every: { rallyAgain: true },
            some: { rallyAgain: true }
          }
        },
        select: { completedAt: true, feedback: { select: { id: true } } }
      }),
      prisma.report.count({
        where: { ...reportScope, status: { in: ["OPEN", "REVIEWING"] } }
      }),
      prisma.user.count({
        where: { ...userScope, status: "ACTIVE", lastActiveAt: { gte: windowStart } }
      }),
      prisma.rally.count({ where: { ...rallyScope, createdAt: { gte: windowStart } } }),
      prisma.rally.count({
        where: { ...rallyScope, createdAt: { gte: windowStart }, acceptedAt: { not: null } }
      }),
      prisma.rally.count({
        where: { ...rallyScope, createdAt: { gte: windowStart }, scheduledAt: { not: null } }
      }),
      prisma.rally.count({
        where: { ...rallyScope, createdAt: { gte: windowStart }, completedAt: { not: null } }
      }),
      prisma.rally.count({ where: { ...rallyScope, completedAt: { gte: windowStart } } }),
      prisma.rally.count({ where: { ...rallyScope, cancelledAt: { gte: windowStart } } }),
      prisma.report.count({ where: { ...reportScope, createdAt: { gte: windowStart } } }),
      prisma.rally.count({
        where: { ...rallyScope, status: "PENDING", createdAt: { lt: stalePendingBefore } }
      }),
      prisma.rally.count({
        where: { ...rallyScope, status: "ACCEPTED", acceptedAt: { lt: staleAcceptedBefore } }
      }),
      prisma.rally.count({
        where: { ...rallyScope, status: "SCHEDULED", proposedEndAt: { lt: now } }
      }),
      prisma.report.count({
        where: {
          ...reportScope,
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
        dataScope,
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
    const { dataScope, limit } = adminListQuerySchema.parse(request.query);
    const users = await prisma.user.findMany({
      where: userScopeWhere(dataScope),
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        isTestAccount: true,
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
    return { dataScope, users };
  });

  app.patch("/users/:userId/status", { preHandler: app.authorizeAdmin }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const body = updateUserStatusSchema.parse(request.body);

    if (userId === request.user.sub && body.status === "SUSPENDED") {
      return reply.code(400).send({ error: "You cannot suspend your own admin account" });
    }

    const now = new Date();
    let outcome;
    try {
      outcome = await runSerializableTransaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            status: true,
            role: true,
            updatedAt: true
          }
        });
        if (!target) return { kind: "not-found" as const };
        if (target.status === "DELETED") return { kind: "deleted" as const };
        if (target.status === body.status) {
          return { kind: "unchanged" as const, user: target };
        }

        const updated = await tx.user.update({
          where: { id: userId },
          data: { status: body.status, authVersion: { increment: 1 } },
          select: { id: true, email: true, status: true, role: true, updatedAt: true }
        });
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now, revokedReason: "ACCOUNT_CHANGE" }
        });
        if (body.status === "SUSPENDED") {
          await cancelActiveRalliesForUnavailableUser(tx, userId, now);
        }
        await writeAuditLog(
          {
            userId: request.user.sub,
            action: "admin.user_status_updated",
            metadata: { targetUserId: userId, status: body.status, reason: body.reason },
            request
          },
          tx
        );
        return { kind: "updated" as const, user: updated };
      });
    } catch (error) {
      if (error instanceof SerializableTransactionExhaustedError) {
        return reply.code(503).send({ error: "Account status update is temporarily unavailable" });
      }
      throw error;
    }

    if (outcome.kind === "not-found") return reply.code(404).send({ error: "User not found" });
    if (outcome.kind === "deleted") {
      return reply.code(409).send({ error: "Deleted accounts cannot be reactivated" });
    }
    return { user: outcome.user };
  });

  app.get("/rallies", { preHandler: app.authorizeAdmin }, async (request) => {
    const { dataScope, limit } = adminListQuerySchema.parse(request.query);
    const rallies = await prisma.rally.findMany({
      where: rallyScopeWhere(dataScope),
      include: {
        sender: { select: { id: true, email: true, profile: true } },
        receiver: { select: { id: true, email: true, profile: true } },
        venue: true,
        _count: { select: { feedback: true, reports: true } }
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return { dataScope, rallies };
  });

  app.get("/reports", { preHandler: app.authorizeAdmin }, async (request) => {
    const { dataScope, limit } = adminListQuerySchema.parse(request.query);
    const reports = await prisma.report.findMany({
      where: reportScopeWhere(dataScope),
      include: {
        reporter: { select: { id: true, email: true, profile: true } },
        reportedUser: { select: { id: true, email: true, profile: true } },
        rally: true
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return { dataScope, reports: reports.map(presentReport) };
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
    const outcome = await prisma.$transaction(async (tx) => {
      const existing = await tx.operationalIncident.findUnique({ where: { id: incidentId } });
      if (!existing) return { kind: "not-found" as const };
      if (isIncidentResolutionRetry(existing, body.resolutionNote)) {
        return { kind: "unchanged" as const, incident: existing };
      }
      if (existing.resolvedAt !== null) return { kind: "conflict" as const };

      const updated = await tx.operationalIncident.updateMany({
        where: { id: incidentId, resolvedAt: null },
        data: {
          resolvedAt: new Date(),
          resolvedById: request.user.sub,
          resolutionNote: body.resolutionNote
        }
      });
      if (updated.count !== 1) {
        const concurrent = await tx.operationalIncident.findUniqueOrThrow({
          where: { id: incidentId }
        });
        return isIncidentResolutionRetry(concurrent, body.resolutionNote)
          ? { kind: "unchanged" as const, incident: concurrent }
          : { kind: "conflict" as const };
      }

      await writeAuditLog(
        {
          userId: request.user.sub,
          action: "admin.incident_resolved",
          metadata: { incidentId },
          request
        },
        tx
      );
      const incident = await tx.operationalIncident.findUniqueOrThrow({
        where: { id: incidentId }
      });
      return { kind: "updated" as const, incident };
    });
    if (outcome.kind === "not-found") {
      return reply.code(404).send({ error: "Incident not found" });
    }
    if (outcome.kind === "conflict") {
      return reply.code(409).send({ error: "Incident has already been resolved" });
    }
    return { incident: outcome.incident };
  });

  app.patch("/reports/:reportId", { preHandler: app.authorizeAdmin }, async (request, reply) => {
    const { reportId } = request.params as { reportId: string };
    const body = updateReportSchema.parse(request.body);
    const outcome = await prisma.$transaction(async (tx) => {
      const existing = await tx.report.findUnique({ where: { id: reportId } });
      if (!existing) return { kind: "not-found" as const };
      if (isReportUpdateRetry(existing, body)) {
        return { kind: "unchanged" as const, report: existing };
      }

      const updated = await tx.report.updateMany({
        where: { id: reportId, updatedAt: existing.updatedAt },
        data: reportUpdateData(body, request.user.sub, new Date())
      });
      if (updated.count !== 1) {
        const concurrent = await tx.report.findUniqueOrThrow({ where: { id: reportId } });
        return isReportUpdateRetry(concurrent, body)
          ? { kind: "unchanged" as const, report: concurrent }
          : { kind: "conflict" as const };
      }

      await writeAuditLog(
        {
          userId: request.user.sub,
          action: "admin.report_updated",
          metadata: { reportId, status: body.status },
          request
        },
        tx
      );
      const report = await tx.report.findUniqueOrThrow({ where: { id: reportId } });
      return { kind: "updated" as const, report };
    });
    if (outcome.kind === "not-found") return reply.code(404).send({ error: "Report not found" });
    if (outcome.kind === "conflict") {
      return reply.code(409).send({ error: "Report was updated by another administrator" });
    }
    return { report: presentReport(outcome.report) };
  });
}
