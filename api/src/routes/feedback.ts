import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { rallyFeedbackSchema } from "../modules/feedback/schemas.js";
import { writeAuditLog } from "../utils/audit.js";

export async function feedbackRoutes(app: FastifyInstance) {
  app.post("/rallies/:rallyId", { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { rallyId: string };
    const body = rallyFeedbackSchema.parse(request.body);

    const rally = await prisma.rally.findUnique({ where: { id: params.rallyId } });

    if (!rally || (rally.senderId !== request.user.sub && rally.receiverId !== request.user.sub)) {
      return reply.code(404).send({ error: "Rally not found" });
    }

    if (rally.status !== "ACCEPTED" && rally.status !== "COMPLETED") {
      return reply.code(409).send({ error: "Feedback can only be submitted after an accepted Rally" });
    }

    const feedback = await prisma.rallyFeedback.upsert({
      where: {
        rallyId_userId: {
          rallyId: rally.id,
          userId: request.user.sub
        }
      },
      create: {
        rallyId: rally.id,
        userId: request.user.sub,
        ...body
      },
      update: body
    });

    const bothFeedback = await prisma.rallyFeedback.count({ where: { rallyId: rally.id } });
    if (bothFeedback >= 2) {
      await prisma.rally.update({
        where: { id: rally.id },
        data: { status: "COMPLETED" }
      });
    }

    await writeAuditLog({
      userId: request.user.sub,
      action: "rally.feedback",
      metadata: { rallyId: rally.id, played: body.played, rallyAgain: body.rallyAgain },
      request
    });

    return { feedback };
  });
}
