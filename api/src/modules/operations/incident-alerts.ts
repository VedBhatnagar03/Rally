import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";

const maxAttempts = 10;
type AlertStore = Pick<PrismaClient, "operationalIncident">;
type AlertFetch = (input: string | URL | globalThis.Request, init?: RequestInit) => Promise<Response>;

export type IncidentAlertSummary = {
  enabled: boolean;
  claimed: number;
  delivered: number;
  failed: number;
};

function retryDelayMs(previousAttempts: number) {
  return Math.min(60, 2 ** Math.min(previousAttempts, 6)) * 60 * 1000;
}

function failureCode(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  if (error instanceof Error && /^http_\d{3}$/.test(error.message)) return error.message;
  return "network_error";
}

export function signIncidentAlert(payload: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export async function deliverIncidentAlerts(options: {
  incidentId?: string;
  now?: Date;
  batchSize?: number;
  store?: AlertStore;
  fetcher?: AlertFetch;
  webhookUrl?: string;
  webhookSecret?: string;
  timeoutMs?: number;
} = {}): Promise<IncidentAlertSummary> {
  const webhookUrl = options.webhookUrl ?? env.INCIDENT_ALERT_WEBHOOK_URL;
  const webhookSecret = options.webhookSecret ?? env.INCIDENT_ALERT_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) {
    return { enabled: false, claimed: 0, delivered: 0, failed: 0 };
  }

  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? 25;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error("Incident alert batch size must be an integer from 1 to 100");
  }
  const store = options.store ?? prisma;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? env.INCIDENT_ALERT_TIMEOUT_MS;
  const incidents = await store.operationalIncident.findMany({
    where: {
      ...(options.incidentId ? { id: options.incidentId } : {}),
      alertDeliveredAt: null,
      alertAttempts: { lt: maxAttempts },
      OR: [{ alertNextAttemptAt: null }, { alertNextAttemptAt: { lte: now } }]
    },
    select: {
      id: true,
      requestId: true,
      method: true,
      route: true,
      statusCode: true,
      errorName: true,
      errorCode: true,
      createdAt: true,
      alertAttempts: true
    },
    orderBy: { createdAt: "asc" },
    take: batchSize
  });

  const summary: IncidentAlertSummary = { enabled: true, claimed: 0, delivered: 0, failed: 0 };
  for (const incident of incidents) {
    const claimed = await store.operationalIncident.updateMany({
      where: {
        id: incident.id,
        alertDeliveredAt: null,
        alertAttempts: incident.alertAttempts,
        OR: [{ alertNextAttemptAt: null }, { alertNextAttemptAt: { lte: now } }]
      },
      data: {
        alertAttempts: { increment: 1 },
        alertLastAttemptAt: now,
        alertNextAttemptAt: new Date(now.getTime() + retryDelayMs(incident.alertAttempts))
      }
    });
    if (claimed.count !== 1) continue;
    summary.claimed += 1;

    const payload = JSON.stringify({
      event: "operational_incident.created",
      incident: {
        id: incident.id,
        requestId: incident.requestId,
        method: incident.method,
        route: incident.route,
        statusCode: incident.statusCode,
        errorName: incident.errorName,
        errorCode: incident.errorCode,
        createdAt: incident.createdAt.toISOString()
      }
    });
    try {
      const response = await fetcher(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rally-event-id": incident.id,
          "x-rally-signature": signIncidentAlert(payload, webhookSecret)
        },
        body: payload,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw new Error(`http_${response.status}`);
      await store.operationalIncident.updateMany({
        where: { id: incident.id, alertDeliveredAt: null },
        data: { alertDeliveredAt: now, alertNextAttemptAt: null, alertLastError: null }
      });
      summary.delivered += 1;
    } catch (error) {
      await store.operationalIncident.updateMany({
        where: { id: incident.id, alertDeliveredAt: null },
        data: { alertLastError: failureCode(error) }
      });
      summary.failed += 1;
    }
  }
  return summary;
}
