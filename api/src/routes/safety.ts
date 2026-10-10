import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  blockedUserParamsSchema,
  blockUserSchema,
  reportUserSchema
} from "../modules/safety/schemas.js";
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

    const block = await prisma.block.upsert({
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

  app.post("/reports", { preHandler: app.authenticate }, async (request, reply) => {
    const body = reportUserSchema.parse(request.body);

    if (body.reportedUserId === request.user.sub) {
      return reply.code(400).send({ error: "You cannot report yourself" });
    }

    const report = await prisma.report.create({
      data: {
        reporterId: request.user.sub,
        reportedUserId: body.reportedUserId,
        rallyId: body.rallyId,
        category: body.category,
        details: body.details
      }
    });

    await writeAuditLog({
      userId: request.user.sub,
      action: "safety.report_user",
      metadata: { reportedUserId: body.reportedUserId, category: body.category },
      request
    });

    return reply.code(201).send({ report });
  });
}
