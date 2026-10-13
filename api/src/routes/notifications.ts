import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  notificationListQuerySchema,
  notificationParamsSchema
} from "../modules/notifications/schemas.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async (request) => {
    const { limit, unreadOnly } = notificationListQuerySchema.parse(request.query);
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: request.user.sub, readAt: unreadOnly ? null : undefined },
        include: {
          rally: {
            select: { id: true, status: true, sport: true, proposedStartAt: true, venue: true }
          }
        },
        orderBy: { createdAt: "desc" },
        take: limit
      }),
      prisma.notification.count({ where: { userId: request.user.sub, readAt: null } })
    ]);
    return { notifications, unreadCount };
  });

  app.patch("/:notificationId/read", { preHandler: app.authenticate }, async (request, reply) => {
    const { notificationId } = notificationParamsSchema.parse(request.params);
    const updated = await prisma.notification.updateMany({
      where: { id: notificationId, userId: request.user.sub },
      data: { readAt: new Date() }
    });
    if (updated.count !== 1) return reply.code(404).send({ error: "Notification not found" });
    return reply.code(204).send();
  });

  app.post("/read-all", { preHandler: app.authenticate }, async (request) => {
    const updated = await prisma.notification.updateMany({
      where: { userId: request.user.sub, readAt: null },
      data: { readAt: new Date() }
    });
    return { updated: updated.count };
  });
}
