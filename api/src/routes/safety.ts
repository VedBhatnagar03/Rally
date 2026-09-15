import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { blockUserSchema, reportUserSchema } from "../modules/safety/schemas.js";
import { writeAuditLog } from "../utils/audit.js";

export async function safetyRoutes(app: FastifyInstance) {
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
