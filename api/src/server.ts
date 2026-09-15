import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";

const app = buildApp();

async function main() {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, "Shutting down Rally backend");
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", (signal) => {
  void shutdown(signal);
});
process.once("SIGTERM", (signal) => {
  void shutdown(signal);
});

main().catch(async (error) => {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
