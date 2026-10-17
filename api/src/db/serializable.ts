import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const maxSerializableAttempts = 3;

export class SerializableTransactionExhaustedError extends Error {
  constructor() {
    super("Serializable transaction retry limit reached");
    this.name = "SerializableTransactionExhaustedError";
  }
}

export async function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < maxSerializableAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034";
      if (!retryable) throw error;
      if (attempt === maxSerializableAttempts - 1) {
        throw new SerializableTransactionExhaustedError();
      }
    }
  }

  throw new SerializableTransactionExhaustedError();
}
