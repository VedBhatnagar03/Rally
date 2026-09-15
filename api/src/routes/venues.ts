import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";

export async function venueRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async () => {
    const venues = await prisma.venue.findMany({
      orderBy: [{ campusArea: "asc" }, { name: "asc" }]
    });

    return { venues };
  });
}
