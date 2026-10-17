import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  runSerializableTransaction,
  SerializableTransactionExhaustedError
} from "../db/serializable.js";
import {
  blockedUserParamsSchema,
  blockUserSchema,
  reportUserSchema
} from "../modules/safety/schemas.js";
import { cancelActiveRalliesForSafetyAction } from "../modules/safety/cancellation.js";
import {
  manualReportLimit,
  manualReportWindowMs,
  reportDedupeKey
} from "../modules/safety/report-integrity.js";
import { presentReport } from "../modules/safety/presentation.js";
import { writeAuditLog } from "../utils/audit.js";

export async function safetyRoutes(app: FastifyInstance) {
  app.get("/blocks", { preHandler: app.authenticate }, async (request) => {
    const blocks = await prisma.block.findMany({
      where: { blockerId: request.user.sub },
      select: {
        id: true,
        blockedId: true,
        reason: true,
        createdAt: true,
        blocked: { select: { profile: { select: { displayName: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
    return { blocks };
  });

  app.post("/blocks", { preHandler: app.authenticate }, async (request, reply) => {
    const body = blockUserSchema.parse(request.body);

    if (body.blockedUserId === request.user.sub) {
      return reply.code(400).send({ error: "You cannot block yourself" });
    }

    const blockedUser = await prisma.user.findUnique({
      where: { id: body.blockedUserId },
      select: { id: true, status: true }
    });
    if (!blockedUser || blockedUser.status === "DELETED") {
      return reply.code(404).send({ error: "User not found" });
    }

    const now = new Date();
    let block;
    try {
      block = await runSerializableTransaction(async (tx) => {
        const created = await tx.block.upsert({
          where: {
            blockerId_blockedId: {
              blockerId: request.user.sub,
              blockedId: body.blockedUserId
            }
          },
          create: {
            blockerId: request.user.sub,
            blockedId: body.blockedUserId,
            reason: body.reason
          },
          update: {
            reason: body.reason
          }
        });
        await cancelActiveRalliesForSafetyAction(
          tx,
          request.user.sub,
          body.blockedUserId,
          now
        );
        return created;
      });
    } catch (error) {
      if (error instanceof SerializableTransactionExhaustedError) {
        return reply.code(503).send({ error: "Block is temporarily unavailable" });
      }
      throw error;
    }

    await writeAuditLog({
      userId: request.user.sub,
      action: "safety.block_user",
      metadata: { blockedUserId: body.blockedUserId },
      request
    });

    return reply.code(201).send({ block });
  });

  app.delete("/blocks/:blockedUserId", { preHandler: app.authenticate }, async (request, reply) => {
    const { blockedUserId } = blockedUserParamsSchema.parse(request.params);
    const removed = await prisma.block.deleteMany({
      where: { blockerId: request.user.sub, blockedId: blockedUserId }
    });

    if (removed.count === 0) {
      return reply.code(404).send({ error: "Block not found" });
    }

    await writeAuditLog({
      userId: request.user.sub,
      action: "safety.unblock_user",
      metadata: { blockedUserId },
      request
    });
    return reply.code(204).send();
  });

  app.post("/reports", {
    preHandler: app.authenticate,
    config: { rateLimit: { max: 10, timeWindow: "1 hour" } }
  }, async (request, reply) => {
    const body = reportUserSchema.parse(request.body);

    if (body.reportedUserId === request.user.sub) {
      return reply.code(400).send({ error: "You cannot report yourself" });
    }

    const reportedUser = await prisma.user.findUnique({
      where: { id: body.reportedUserId },
      select: { id: true, status: true }
    });
    if (!reportedUser || reportedUser.status === "DELETED") {
      return reply.code(404).send({ error: "User not found" });
    }

    if (body.rallyId) {
      const rally = await prisma.rally.findUnique({
        where: { id: body.rallyId },
        select: { senderId: true, receiverId: true }
      });
      const expectedParticipants = new Set([request.user.sub, body.reportedUserId]);
      if (
        !rally ||
        !expectedParticipants.has(rally.senderId) ||
        !expectedParticipants.has(rally.receiverId) ||
        rally.senderId === rally.receiverId
      ) {
        return reply.code(400).send({ error: "Rally does not belong to these users" });
      }
    }

    const now = new Date();
    const dedupeKey = reportDedupeKey({ reporterId: request.user.sub, ...body, now });
    let result:
      | { report: Awaited<ReturnType<typeof prisma.report.create>>; created: boolean }
      | { rateLimited: true }
      | undefined;

    for (let attempt = 0; attempt < 3 && !result; attempt += 1) {
      try {
        result = await prisma.$transaction(
          async (tx) => {
            const existing = await tx.report.findUnique({ where: { dedupeKey } });
            if (existing) return { report: existing, created: false };

            const recentReports = await tx.report.count({
              where: {
                reporterId: request.user.sub,
                sourceFeedbackId: null,
                createdAt: { gte: new Date(now.getTime() - manualReportWindowMs) }
              }
            });
            if (recentReports >= manualReportLimit) return { rateLimited: true as const };

            const report = await tx.report.create({
              data: {
                dedupeKey,
                reporterId: request.user.sub,
                reportedUserId: body.reportedUserId,
                rallyId: body.rallyId,
                category: body.category,
                details: body.details
              }
            });
            await cancelActiveRalliesForSafetyAction(
              tx,
              request.user.sub,
              body.reportedUserId,
              now
            );
            return { report, created: true };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const existing = await prisma.report.findUnique({ where: { dedupeKey } });
          if (existing) result = { report: existing, created: false };
          else throw error;
        } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
          if (attempt < 2) continue;
          break;
        } else {
          throw error;
        }
      }
    }

    if (!result) return reply.code(503).send({ error: "Report submission is temporarily unavailable" });
    if ("rateLimited" in result) {
      return reply.code(429).send({ error: "Report limit reached; contact Rally support for help" });
    }

    if (result.created) {
      await writeAuditLog({
        userId: request.user.sub,
        action: "safety.report_user",
        metadata: { reportedUserId: body.reportedUserId, category: body.category },
        request
      });
    }

    return reply.code(result.created ? 201 : 200).send({
      report: presentReport(result.report),
      deduplicated: !result.created
    });
  });
}
