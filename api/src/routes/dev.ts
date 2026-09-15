import type { FastifyInstance, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

function unavailable(reply: FastifyReply) {
  return reply.code(404).send({ error: "Not found" });
}

function assertDevTools(reply: FastifyReply) {
  if (!env.DEV_TOOLS_ENABLED || env.NODE_ENV === "production") {
    unavailable(reply);
    return false;
  }
  return true;
}

const profileInclude = {
  profile: true,
  sportProfiles: true,
  availability: true,
  photos: { orderBy: { sortOrder: "asc" as const } }
};

export async function devRoutes(app: FastifyInstance) {
  app.get("/profiles", async (_request, reply) => {
    if (!assertDevTools(reply)) return;

    const users = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        profile: { profileComplete: true }
      },
      include: profileInclude,
      orderBy: { createdAt: "asc" }
    });

    return { profiles: users };
  });

  app.get("/profiles/:userId", async (request, reply) => {
    if (!assertDevTools(reply)) return;
    const { userId } = request.params as { userId: string };

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        status: "ACTIVE",
        profile: { profileComplete: true }
      },
      include: profileInclude
    });

    if (!user) {
      return reply.code(404).send({ error: "Profile not found" });
    }

    return { profile: user };
  });

  app.post("/sessions", async (request, reply) => {
    if (!assertDevTools(reply)) return;
    const body = request.body as { userId?: string };

    if (!body.userId) {
      return reply.code(400).send({ error: "userId is required" });
    }

    const user = await prisma.user.findFirst({
      where: {
        id: body.userId,
        status: "ACTIVE",
        profile: { profileComplete: true }
      },
      select: { id: true, email: true, role: true }
    });

    if (!user) {
      return reply.code(404).send({ error: "Profile not found" });
    }

    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { token, user };
  });
}
