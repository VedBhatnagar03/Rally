import type { Prisma } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { prisma } from "../db/prisma.js";

type AuditInput = {
  userId?: string;
  action: string;
  metadata?: Prisma.InputJsonObject;
  request?: FastifyRequest;
};

export async function writeAuditLog({ userId, action, metadata, request }: AuditInput) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      metadata,
      ipAddress: request?.ip,
      userAgent: normalizeHeader(request?.headers["user-agent"])
    }
  });
}

function normalizeHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(", ") : value;
}
