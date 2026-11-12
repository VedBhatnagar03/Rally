import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { adminEmails } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import {
  runSerializableTransaction,
  SerializableTransactionExhaustedError
} from "../db/serializable.js";
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
import {
  clearRefreshCookie,
  isAllowedBrowserOrigin,
  isAllowedSessionIssuanceOrigin,
  publicSession,
  refreshCredential,
  setRefreshCookie
} from "../modules/auth/browser-session.js";

export async function authRoutes(app: FastifyInstance) {
  async function issueSession(
    user: { id: string; email: string; role: "USER" | "ADMIN"; authVersion: number },
    reply: FastifyReply,
    request?: FastifyRequest,
    auditAction?: string
  ) {
    const accessToken = app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      av: user.authVersion
    });
    const refreshToken = createOpaqueToken();
    const familyId = crypto.randomUUID();

    const issued = await runSerializableTransaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: user.id },
        select: { email: true, role: true, status: true, authVersion: true }
      });
      if (
        !current ||
        current.status !== "ACTIVE" ||
        current.authVersion !== user.authVersion ||
        current.email !== user.email ||
        current.role !== user.role
      ) {
        return false;
      }

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          familyId,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000)
        }
      });
      await tx.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
      if (auditAction) {
        await writeAuditLog({ userId: user.id, action: auditAction, request }, tx);
      }
      return true;
    });

    if (!issued) return null;

    setRefreshCookie(reply, refreshToken);
    return publicSession({
      token: accessToken,
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role }
    });
  }

  app.post("/register", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    if (body.policyVersion !== env.POLICY_VERSION) {
      return reply.code(409).send({ error: "Policy version is outdated; review the current policies" });
    }
    const email = assertUiucEmail(body.email);
    const verificationToken = createOpaqueToken();
    const verificationTokenHash = hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const role = adminEmails().has(email) ? "ADMIN" : "USER";

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          status: "PENDING_EMAIL_VERIFICATION",
          role,
          ageAttestedAt: new Date(),
          policyAcceptedAt: new Date(),
          policyVersion: env.POLICY_VERSION,
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
        userId: created.id,
        action: "auth.register",
        metadata: { policyVersion: env.POLICY_VERSION, minimumAge: 18 },
        request
      }, tx);
      return created;
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
      let devVerificationToken: string | undefined;
      const token = createOpaqueToken();
      const result = await runSerializableTransaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { email },
          select: { id: true, email: true, status: true }
        });
        if (user?.status !== "PENDING_EMAIL_VERIFICATION") return null;

        await tx.emailVerificationToken.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: { consumedAt: new Date() }
        });
        const created = await tx.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        });

        await writeAuditLog({ userId: user.id, action: "auth.resend_verification", request }, tx);
        return { user, created };
      });

      if (result) {
        await sendVerificationEmail({
          email: result.user.email,
          token,
          idempotencyKey: `verify-resend/${result.created.id}`
        });
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
    if (!isAllowedSessionIssuanceOrigin(request.headers.origin)) {
      return reply.code(403).send({ error: "Invalid request origin" });
    }
    const body = verifyEmailSchema.parse(request.body);
    const tokenHash = hashToken(body.token);

    const verifiedUser = await runSerializableTransaction(async (tx) => {
      const verification = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        include: { user: true }
      });
      const now = new Date();
      if (
        !verification ||
        verification.consumedAt ||
        verification.expiresAt <= now ||
        verification.user.status !== "PENDING_EMAIL_VERIFICATION"
      ) {
        return null;
      }

      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: verification.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now }
      });
      if (consumed.count !== 1) return null;

      const activated = await tx.user.updateMany({
        where: { id: verification.userId, status: "PENDING_EMAIL_VERIFICATION" },
        data: { status: "ACTIVE" }
      });
      if (activated.count !== 1) return null;

      await writeAuditLog({
        userId: verification.userId,
        action: "auth.verify_email",
        request
      }, tx);

      return {
        id: verification.userId,
        email: verification.user.email,
        role: verification.user.role,
        authVersion: verification.user.authVersion
      };
    });

    if (!verifiedUser) {
      return reply.code(400).send({ error: "Invalid or expired verification token" });
    }

      const session = await issueSession(verifiedUser, reply);
      if (!session) {
        return reply.code(409).send({ error: "Account state changed; sign in to continue" });
      }
      return session;
    }
  );

  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
    if (!isAllowedSessionIssuanceOrigin(request.headers.origin)) {
      return reply.code(403).send({ error: "Invalid request origin" });
    }
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

      const session = await issueSession({
        id: user.id,
        email: user.email,
        role: user.role,
        authVersion: user.authVersion
      }, reply, request, "auth.login");
      if (!session) {
        return reply.code(403).send({ error: "Account unavailable" });
      }
      return session;
    }
  );

  app.post(
    "/forgot-password",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const body = forgotPasswordSchema.parse(request.body);
      const email = normalizeEmail(body.email);
      let devResetToken: string | undefined;
      const token = createOpaqueToken();
      let result;
      try {
        result = await runSerializableTransaction(async (tx) => {
          const user = await tx.user.findUnique({
            where: { email },
            select: { id: true, email: true, status: true }
          });
          if (user?.status !== "ACTIVE") return null;

          await tx.passwordResetToken.updateMany({
            where: { userId: user.id, consumedAt: null },
            data: { consumedAt: new Date() }
          });
          const created = await tx.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: hashToken(token),
              expiresAt: new Date(Date.now() + 60 * 60 * 1000)
            }
          });
          await writeAuditLog({ userId: user.id, action: "auth.password_reset_requested", request }, tx);
          return { user, created };
        });
      } catch (error) {
        if (error instanceof SerializableTransactionExhaustedError) {
          return reply.code(503).send({ error: "Password recovery is temporarily unavailable" });
        }
        throw error;
      }

      if (result) {
        await sendPasswordResetEmail({
          email: result.user.email,
          token,
          idempotencyKey: `password-reset/${result.created.id}`
        });
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
      let reset;
      try {
        reset = await runSerializableTransaction(async (tx) => {
          const current = await tx.passwordResetToken.findUnique({
            where: { id: resetToken.id },
            include: { user: { select: { id: true, passwordHash: true, status: true } } }
          });
          const now = new Date();
          if (
            !current ||
            current.consumedAt ||
            current.expiresAt <= now ||
            current.user.status !== "ACTIVE" ||
            current.user.passwordHash !== resetToken.user.passwordHash
          ) {
            return false;
          }

          const consumed = await tx.passwordResetToken.updateMany({
            where: { id: current.id, consumedAt: null, expiresAt: { gt: now } },
            data: { consumedAt: now }
          });
          if (consumed.count !== 1) return false;

          const updated = await tx.user.updateMany({
            where: {
              id: current.user.id,
              status: "ACTIVE",
              passwordHash: current.user.passwordHash
            },
            data: { passwordHash, authVersion: { increment: 1 } }
          });
          if (updated.count !== 1) return false;

          await tx.refreshToken.updateMany({
            where: { userId: current.user.id, revokedAt: null },
            data: { revokedAt: now, revokedReason: "PASSWORD_RESET" }
          });
          await writeAuditLog({ userId: current.user.id, action: "auth.password_reset", request }, tx);
          return true;
        });
      } catch (error) {
        if (error instanceof SerializableTransactionExhaustedError) {
          return reply.code(503).send({ error: "Password recovery is temporarily unavailable" });
        }
        throw error;
      }

      if (!reset) {
        return reply.code(400).send({ error: "Invalid or expired password reset token" });
      }

      return reply.code(204).send();
    }
  );

  app.post(
    "/refresh",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const body = refreshSessionSchema.parse(request.body ?? {});
    const credential = refreshCredential(request, body.refreshToken);
    if (!credential.token) {
      clearRefreshCookie(reply);
      return reply.code(401).send({ error: "Invalid or expired refresh token" });
    }
    if (credential.cookieBacked && !isAllowedBrowserOrigin(request.headers.origin)) {
      return reply.code(403).send({ error: "Invalid request origin" });
    }
    const currentHash = hashToken(credential.token);
    const nextRefreshToken = createOpaqueToken();
    const outcome = await runSerializableTransaction(async (tx) => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash: currentHash },
        include: {
          user: { select: { id: true, email: true, role: true, status: true, authVersion: true } }
        }
      });
      if (!current || current.user.status !== "ACTIVE" || current.expiresAt <= new Date()) {
        return { kind: "invalid" as const };
      }

      if (current.revokedAt) {
        if (current.revokedReason === "ROTATED") {
          const revoked = await tx.refreshToken.updateMany({
            where: { familyId: current.familyId, revokedAt: null },
            data: { revokedAt: new Date(), revokedReason: "REUSE_DETECTED" }
          });
          if (revoked.count > 0) {
            await writeAuditLog({
              userId: current.user.id,
              action: "auth.refresh_reuse_detected",
              metadata: { familyId: current.familyId },
              request
            }, tx);
          }
        }
        return { kind: "invalid" as const };
      }

      const revoked = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "ROTATED" }
      });
      if (revoked.count !== 1) return { kind: "invalid" as const };

      await tx.refreshToken.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: hashToken(nextRefreshToken),
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000)
        }
      });
      await writeAuditLog({ userId: current.user.id, action: "auth.refresh", request }, tx);
      return { kind: "rotated" as const, user: current.user };
    });

    if (outcome.kind === "invalid") {
      clearRefreshCookie(reply);
      return reply.code(401).send({ error: "Invalid or expired refresh token" });
    }

    const accessToken = app.jwt.sign({
      sub: outcome.user.id,
      email: outcome.user.email,
      role: outcome.user.role,
      av: outcome.user.authVersion
    });

      setRefreshCookie(reply, nextRefreshToken);
      return publicSession({
        token: accessToken,
        accessToken,
        refreshToken: nextRefreshToken,
        user: { id: outcome.user.id, email: outcome.user.email, role: outcome.user.role }
      });
    }
  );

  app.post("/logout", async (request, reply) => {
    const body = refreshSessionSchema.parse(request.body ?? {});
    const credential = refreshCredential(request, body.refreshToken);
    if (credential.cookieBacked && !isAllowedBrowserOrigin(request.headers.origin)) {
      return reply.code(403).send({ error: "Invalid request origin" });
    }
    clearRefreshCookie(reply);
    if (!credential.token) return reply.code(204).send();
    await runSerializableTransaction(async (tx) => {
      const session = await tx.refreshToken.findUnique({
        where: { tokenHash: hashToken(credential.token!) },
        select: { id: true, userId: true, revokedAt: true }
      });
      if (!session || session.revokedAt) return;

      await tx.refreshToken.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: "LOGOUT" }
      });
      await writeAuditLog({ userId: session.userId, action: "auth.logout", request }, tx);
    });

    return reply.code(204).send();
  });
}
