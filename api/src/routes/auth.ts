import type { FastifyInstance } from "fastify";
import { adminEmails } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import {
  loginSchema,
  refreshSessionSchema,
  registerSchema,
  verifyEmailSchema
} from "../modules/auth/schemas.js";
import { env } from "../config/env.js";
import { writeAuditLog } from "../utils/audit.js";
import { assertUiucEmail, normalizeEmail } from "../utils/email.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { createOpaqueToken, hashToken } from "../utils/tokens.js";

export async function authRoutes(app: FastifyInstance) {
  async function issueSession(user: { id: string; email: string; role: "USER" | "ADMIN" }) {
    const accessToken = app.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    const refreshToken = createOpaqueToken();

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000)
      }
    });

    return { token: accessToken, accessToken, refreshToken, user };
  }

  app.post("/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const email = assertUiucEmail(body.email);
    const verificationToken = createOpaqueToken();
    const verificationTokenHash = hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const role = adminEmails().has(email) ? "ADMIN" : "USER";

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(body.password),
        status: "PENDING_EMAIL_VERIFICATION",
        role,
        emailVerificationTokens: {
          create: {
            tokenHash: verificationTokenHash,
            expiresAt
          }
        },
        profile: {
          create: {
            displayName: body.displayName,
            profileComplete: false
          }
        }
      },
      select: { id: true, email: true, role: true }
    });

    await writeAuditLog({
      userId: user.id,
      action: "auth.register",
      request
    });

    return reply.code(201).send({
      user,
      emailVerificationRequired: true,
      devVerificationToken: env.NODE_ENV === "production" ? undefined : verificationToken
    });
  });

  app.post("/verify-email", async (request, reply) => {
    const body = verifyEmailSchema.parse(request.body);
    const tokenHash = hashToken(body.token);

    const verification = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!verification || verification.consumedAt || verification.expiresAt < new Date()) {
      return reply.code(400).send({ error: "Invalid or expired verification token" });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: verification.userId },
        data: { status: "ACTIVE" }
      }),
      prisma.emailVerificationToken.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() }
      })
    ]);

    await writeAuditLog({
      userId: verification.userId,
      action: "auth.verify_email",
      request
    });

    return issueSession({
      id: verification.userId,
      email: verification.user.email,
      role: verification.user.role
    });
  });

  app.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const email = normalizeEmail(body.email);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    if (user.status !== "ACTIVE") {
      return reply.code(403).send({ error: "Email verification required" });
    }

    await writeAuditLog({
      userId: user.id,
      action: "auth.login",
      request
    });

    return issueSession({ id: user.id, email: user.email, role: user.role });
  });

  app.post("/refresh", async (request, reply) => {
    const body = refreshSessionSchema.parse(request.body);
    const currentHash = hashToken(body.refreshToken);
    const current = await prisma.refreshToken.findUnique({
      where: { tokenHash: currentHash },
      include: { user: { select: { id: true, email: true, role: true, status: true } } }
    });

    if (!current || current.revokedAt || current.expiresAt <= new Date() || current.user.status !== "ACTIVE") {
      return reply.code(401).send({ error: "Invalid or expired refresh token" });
    }

    const nextRefreshToken = createOpaqueToken();
    const rotated = await prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date() }
      });

      if (revoked.count !== 1) return false;

      await tx.refreshToken.create({
        data: {
          userId: current.userId,
          tokenHash: hashToken(nextRefreshToken),
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000)
        }
      });
      return true;
    });

    if (!rotated) {
      return reply.code(401).send({ error: "Invalid or expired refresh token" });
    }

    const accessToken = app.jwt.sign({
      sub: current.user.id,
      email: current.user.email,
      role: current.user.role
    });

    await writeAuditLog({ userId: current.user.id, action: "auth.refresh", request });

    return {
      token: accessToken,
      accessToken,
      refreshToken: nextRefreshToken,
      user: { id: current.user.id, email: current.user.email, role: current.user.role }
    };
  });

  app.post("/logout", async (request, reply) => {
    const body = refreshSessionSchema.parse(request.body);
    const session = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(body.refreshToken) },
      select: { id: true, userId: true, revokedAt: true }
    });

    if (session && !session.revokedAt) {
      await prisma.refreshToken.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      });
      await writeAuditLog({ userId: session.userId, action: "auth.logout", request });
    }

    return reply.code(204).send();
  });
}
