import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { Prisma } from "@prisma/client";
import Fastify from "fastify";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import authenticate from "./plugins/authenticate.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { meRoutes } from "./routes/me.js";
import { policyRoutes } from "./routes/policies.js";
import { rallyRoutes } from "./routes/rallies.js";
import { recommendationRoutes } from "./routes/recommendations.js";
import { safetyRoutes } from "./routes/safety.js";
import { venueRoutes } from "./routes/venues.js";
import { devRoutes } from "./routes/dev.js";
import { InvalidEmailDomainError } from "./utils/email.js";
import { describeOperationalIncident } from "./utils/operational-incident.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: ["req.headers.authorization", "password", "passwordHash"]
    },
    bodyLimit: 1_000_000,
    genReqId: () => crypto.randomUUID()
  });

  app.setErrorHandler(async (error, request, reply) => {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : null;

    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid request", issues: error.flatten() });
    }

    if (error instanceof InvalidEmailDomainError) {
      return reply.code(400).send({ error: error.message });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return reply.code(409).send({ error: "Resource already exists" });
    }

    if (statusCode === 429) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: "Invalid request" });
    }

    app.log.error({ error, requestId: request.id }, "Unhandled request error");
    try {
      await prisma.operationalIncident.create({
        data: describeOperationalIncident(request, error)
      });
    } catch (incidentError) {
      app.log.error({ error: incidentError, requestId: request.id }, "Failed to persist incident");
    }
    return reply.code(500).send({ error: "Internal server error" });
  });

  app.register(helmet);
  app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true
  });
  app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });
  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN
    }
  });
  app.register(authenticate);

  app.get("/health", async () => ({ ok: true, service: "rally-backend" }));
  app.get("/ready", async (_request, reply) => {
    await prisma.$queryRaw`SELECT 1`;
    return reply.code(200).send({ ok: true, dependencies: { database: "ok" } });
  });
  app.register(authRoutes, { prefix: "/v1/auth" });
  app.register(policyRoutes, { prefix: "/v1/policies" });
  app.register(meRoutes, { prefix: "/v1/me" });
  app.register(recommendationRoutes, { prefix: "/v1/recommendations" });
  app.register(rallyRoutes, { prefix: "/v1/rallies" });
  app.register(venueRoutes, { prefix: "/v1/venues" });
  app.register(safetyRoutes, { prefix: "/v1/safety" });
  app.register(feedbackRoutes, { prefix: "/v1/feedback" });
  app.register(analyticsRoutes, { prefix: "/v1/analytics" });
  app.register(adminRoutes, { prefix: "/v1/admin" });
  app.register(devRoutes, { prefix: "/v1/dev" });

  return app;
}
