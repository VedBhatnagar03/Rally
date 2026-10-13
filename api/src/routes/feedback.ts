import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { isSameFeedback } from "../modules/feedback/integrity.js";
import { rallyFeedbackSchema } from "../modules/feedback/schemas.js";
import { writeAuditLog } from "../utils/audit.js";

export async function feedbackRoutes(app: FastifyInstance) {
  app.get("/rallies/:rallyId/outcome", { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { rallyId: string };

    const rally = await prisma.rally.findUnique({
      where: { id: params.rallyId },
      include: { feedback: true }
    });

    if (!rally || (rally.senderId !== request.user.sub && rally.receiverId !== request.user.sub)) {
      return reply.code(404).send({ error: "Rally not found" });
    }

    const bothResponded = rally.feedback.length >= 2;

    return {
      outcome: {
        rallyId: rally.id,
        bothResponded,
        isMutualMatch: bothResponded && rally.feedback.every((feedback) => feedback.rallyAgain)
      }
    };
  });

  app.post("/rallies/:rallyId", { preHandler: app.authenticate }, async (request, reply) => {
    const params = request.params as { rallyId: string };
    const body = rallyFeedbackSchema.parse(request.body);

    const rally = await prisma.rally.findUnique({ where: { id: params.rallyId } });

    if (!rally || (rally.senderId !== request.user.sub && rally.receiverId !== request.user.sub)) {
      return reply.code(404).send({ error: "Rally not found" });
    }

    if (rally.status !== "COMPLETED") {
      return reply.code(409).send({ error: "Feedback can only be submitted after a completed Rally" });
    }

    const feedbackKey = {
      rallyId_userId: { rallyId: rally.id, userId: request.user.sub }
    };
    const existing = await prisma.rallyFeedback.findUnique({ where: feedbackKey });
    if (existing) {
      if (!isSameFeedback(existing, body)) {
        return reply.code(409).send({ error: "Rally feedback is final once submitted" });
      }
      return { feedback: existing, safetyFollowUpCreated: !existing.feltSafe };
    }

    let feedback;
    try {
      feedback = await prisma.$transaction(async (tx) => {
        const saved = await tx.rallyFeedback.create({
          data: {
            rallyId: rally.id,
            userId: request.user.sub,
            ...body
          }
        });
        if (!body.feltSafe) {
          const reportedUserId =
            request.user.sub === rally.senderId ? rally.receiverId : rally.senderId;
          const details = body.notes
            ? `Post-Rally safety check was negative. Participant note: ${body.notes}`
            : "Post-Rally safety check was negative. Follow up confidentially with the reporting participant.";

          await tx.report.upsert({
            where: { sourceFeedbackId: saved.id },
            create: {
              reporterId: request.user.sub,
              reportedUserId,
              rallyId: rally.id,
              sourceFeedbackId: saved.id,
              category: "UNSAFE_BEHAVIOR",
              details
            },
            update: { details }
          });
        }
        const responses = await tx.rallyFeedback.findMany({ where: { rallyId: rally.id } });
        if (responses.length >= 2 && responses.every((response) => response.rallyAgain)) {
          await tx.notification.createMany({
            data: [rally.senderId, rally.receiverId].map((userId) => ({
              userId,
              type: "MUTUAL_RALLY_AGAIN" as const,
              rallyId: rally.id
            })),
            skipDuplicates: true
          });
        }
        return saved;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }

      const concurrent = await prisma.rallyFeedback.findUnique({ where: feedbackKey });
      if (!concurrent || !isSameFeedback(concurrent, body)) {
        return reply.code(409).send({ error: "Rally feedback is final once submitted" });
      }
      feedback = concurrent;
    }

    await writeAuditLog({
      userId: request.user.sub,
      action: "rally.feedback",
      metadata: { rallyId: rally.id, played: body.played, rallyAgain: body.rallyAgain },
      request
    });

    return { feedback, safetyFollowUpCreated: !body.feltSafe };
  });
}
