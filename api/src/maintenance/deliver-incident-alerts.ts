import { prisma } from "../db/prisma.js";
import { deliverIncidentAlerts } from "../modules/operations/incident-alerts.js";

async function main() {
  const summary = await deliverIncidentAlerts();
  console.log(JSON.stringify({ ok: summary.failed === 0, alerts: summary }));
  if (summary.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    const name = error instanceof Error ? error.name : "Error";
    console.error(JSON.stringify({ ok: false, error: { name } }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
