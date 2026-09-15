import type { FastifyInstance } from "fastify";
import { adminEmails } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { loginSchema, registerSchema, verifyEmailSchema } from "../modules/auth/schemas.js";
import { env } from "../config/env.js";
import { writeAuditLog } from "../utils/audit.js";
import { assertUiucEmail, normalizeEmail } from "../utils/email.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { createOpaqueToken, hashToken } from "../utils/tokens.js";

export async function authRoutes(app: FastifyInstance) {
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

    const token = app.jwt.sign({
      sub: verification.userId,
      email: verification.user.email,
      role: verification.user.role
    });

    return { token, user: { id: verification.userId, email: verification.user.email, role: verification.user.role } };
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

    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role });

    await writeAuditLog({
      userId: user.id,
      action: "auth.login",
      request
    });

    return { token, user: { id: user.id, email: user.email, role: user.role } };
  });
}
