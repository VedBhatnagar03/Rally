import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  adminListQuerySchema,
  updateReportSchema,
  updateUserStatusSchema
} from "../modules/admin/schemas.js";
import { writeAuditLog } from "../utils/audit.js";

export async function adminRoutes(app: FastifyInstance) {
  app.get("/summary", { preHandler: app.authorizeAdmin }, async () => {
    const [
      users,
      activeUsers,
      completeProfiles,
      viableUsers,
      ralliesSent,
      acceptedRallies,
      scheduledRallies,
      completedRallies,
      mutualRallyAgain,
      openReports
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
      prisma.rally.count({
        where: {
          feedback: {
            every: { rallyAgain: true },
            some: { rallyAgain: true }
          }
        }
      }),
      prisma.report.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } })
    ]);

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
        openReports
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

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) return reply.code(404).send({ error: "User not found" });

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
