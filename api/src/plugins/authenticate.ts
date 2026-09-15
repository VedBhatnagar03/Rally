import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db/prisma.js";

export default fp(async (app) => {
  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });

  app.decorate("authorizeAdmin", async (request: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { status: true, role: true }
    });

    if (!user || user.status !== "ACTIVE" || user.role !== "ADMIN") {
      return reply.code(403).send({ error: "Admin access required" });
    }
  });
});

declare module "fastify" {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void | FastifyReply>;
    authorizeAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void | FastifyReply>;
  }
}
