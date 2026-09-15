import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { type AnalyticsEventInput, analyticsEventSchema } from "../modules/analytics/schemas.js";

export async function analyticsRoutes(app: FastifyInstance) {
  app.post("/events", { preHandler: app.authenticate }, async (request, reply) => {
    const body = analyticsEventSchema.parse(request.body) as AnalyticsEventInput;
    const event = await prisma.analyticsEvent.create({
      data: {
        userId: request.user.sub,
        name: body.name,
        metadata: body.metadata
      }
    });

    return reply.code(201).send({ event });
  });
}
