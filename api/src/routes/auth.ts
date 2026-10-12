import type { FastifyInstance } from "fastify";
import { adminEmails } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSessionSchema,
  registerSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  verifyEmailSchema
} from "../modules/auth/schemas.js";
import { env } from "../config/env.js";
import { writeAuditLog } from "../utils/audit.js";
import { assertUiucEmail, normalizeEmail } from "../utils/email.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { sendPasswordResetEmail } from "../utils/password-reset-email.js";
import { createOpaqueToken, hashToken } from "../utils/tokens.js";
import { sendVerificationEmail } from "../utils/verification-email.js";

export async function authRoutes(app: FastifyInstance) {
  async function issueSession(user: { id: string; email: string; role: "USER" | "ADMIN" }) {
    const accessToken = app.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    const refreshToken = createOpaqueToken();

    await prisma.$transaction([
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000)
        }
      }),
      prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
    ]);

    return { token: accessToken, accessToken, refreshToken, user };
  }

  app.post("/register", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
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

    await sendVerificationEmail({
      email: user.email,
      token: verificationToken,
      idempotencyKey: `verify-registration/${user.id}`
    });

    return reply.code(201).send({
      user,
      emailVerificationRequired: true,
      devVerificationToken: env.NODE_ENV === "production" ? undefined : verificationToken
    });
  });

  app.post(
    "/resend-verification",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const body = resendVerificationSchema.parse(request.body);
      const email = normalizeEmail(body.email);
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, status: true }
      });

      let devVerificationToken: string | undefined;
      if (user?.status === "PENDING_EMAIL_VERIFICATION") {
        const token = createOpaqueToken();
        const created = await prisma.$transaction(async (tx) => {
          await tx.emailVerificationToken.updateMany({
            where: { userId: user.id, consumedAt: null },
            data: { consumedAt: new Date() }
          });
          return tx.emailVerificationToken.create({
            data: {
              userId: user.id,
              tokenHash: hashToken(token),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            }
          });
        });

        await sendVerificationEmail({
          email: user.email,
          token,
          idempotencyKey: `verify-resend/${created.id}`
        });
        await writeAuditLog({ userId: user.id, action: "auth.resend_verification", request });
        devVerificationToken = env.NODE_ENV === "production" ? undefined : token;
      }

      return reply.code(202).send({
        message: "If an unverified Rally account exists, a verification email has been sent.",
        devVerificationToken
      });
    }
  );

  app.post(
    "/verify-email",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (request, reply) => {
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
    }
  );

  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const email = normalizeEmail(body.email);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    if (user.status === "PENDING_EMAIL_VERIFICATION") {
      return reply.code(403).send({ error: "Email verification required" });
    }

    if (user.status !== "ACTIVE") {
      return reply.code(403).send({ error: "Account unavailable" });
    }

    await writeAuditLog({
      userId: user.id,
      action: "auth.login",
      request
    });

      return issueSession({ id: user.id, email: user.email, role: user.role });
    }
  );

  app.post(
    "/forgot-password",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const body = forgotPasswordSchema.parse(request.body);
      const email = normalizeEmail(body.email);
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, status: true }
      });

      let devResetToken: string | undefined;
      if (user?.status === "ACTIVE") {
        const token = createOpaqueToken();
        const created = await prisma.$transaction(async (tx) => {
          await tx.passwordResetToken.updateMany({
            where: { userId: user.id, consumedAt: null },
            data: { consumedAt: new Date() }
          });
          return tx.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: hashToken(token),
              expiresAt: new Date(Date.now() + 60 * 60 * 1000)
            }
          });
        });

        await sendPasswordResetEmail({
          email: user.email,
          token,
          idempotencyKey: `password-reset/${created.id}`
        });
        await writeAuditLog({ userId: user.id, action: "auth.password_reset_requested", request });
        devResetToken = env.NODE_ENV === "production" ? undefined : token;
      }

      return reply.code(202).send({
        message: "If an active Rally account exists, a password reset email has been sent.",
        devResetToken
      });
    }
  );

  app.post(
    "/reset-password",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const body = resetPasswordSchema.parse(request.body);
      const tokenHash = hashToken(body.token);
      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: { select: { id: true, passwordHash: true, status: true } } }
      });

      if (
        !resetToken ||
        resetToken.consumedAt ||
        resetToken.expiresAt <= new Date() ||
        resetToken.user.status !== "ACTIVE"
      ) {
        return reply.code(400).send({ error: "Invalid or expired password reset token" });
      }

      if (await verifyPassword(resetToken.user.passwordHash, body.password)) {
        return reply.code(400).send({ error: "New password must be different from the current password" });
      }

      const passwordHash = await hashPassword(body.password);
      const reset = await prisma.$transaction(async (tx) => {
        const consumed = await tx.passwordResetToken.updateMany({
          where: { id: resetToken.id, consumedAt: null, expiresAt: { gt: new Date() } },
          data: { consumedAt: new Date() }
        });
        if (consumed.count !== 1) return false;

        await tx.user.update({
          where: { id: resetToken.user.id },
          data: { passwordHash }
        });
        await tx.refreshToken.updateMany({
          where: { userId: resetToken.user.id, revokedAt: null },
          data: { revokedAt: new Date() }
        });
        return true;
      });

      if (!reset) {
        return reply.code(400).send({ error: "Invalid or expired password reset token" });
      }

      await writeAuditLog({ userId: resetToken.user.id, action: "auth.password_reset", request });
      return reply.code(204).send();
    }
  );

  app.post(
    "/refresh",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
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
    }
  );

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
