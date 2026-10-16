import { prisma } from "../db/prisma.js";
import { cleanupExpiredArtifacts } from "../modules/maintenance/cleanup.js";

async function main() {
  const summary = await cleanupExpiredArtifacts();
  console.log(JSON.stringify({ ok: summary.failedPhotoUploads === 0, cleanup: summary }));
  if (summary.failedPhotoUploads > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    const details =
      typeof error === "object" && error !== null
        ? {
            name: "name" in error && typeof error.name === "string" ? error.name : "Error",
            code: "code" in error && typeof error.code === "string" ? error.code : undefined
          }
        : { name: "Error", code: undefined };
    console.error(JSON.stringify({ ok: false, error: details }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
