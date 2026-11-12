import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  deliverIncidentAlerts,
  signIncidentAlert
} from "../src/modules/operations/incident-alerts.js";

const now = new Date("2026-11-11T18:00:00.000Z");
const incident = {
  id: "incident-1",
  requestId: "request-1",
  method: "POST",
  route: "/v1/rallies/:rallyId/respond",
  statusCode: 500,
  errorName: "PrismaClientKnownRequestError",
  errorCode: "P2024",
  createdAt: new Date("2026-11-11T17:59:00.000Z"),
  alertAttempts: 0
};

function alertStore() {
  const updates: unknown[] = [];
  return {
    updates,
    store: {
      operationalIncident: {
        findMany: vi.fn(async () => [incident]),
        updateMany: vi.fn(async (args) => {
          updates.push(args);
          return { count: 1 };
        })
      }
    } as unknown as Pick<PrismaClient, "operationalIncident">
  };
}

describe("incident alert delivery", () => {
  it("signs the exact serialized payload", () => {
    const payload = '{"event":"test"}';
    const secret = "an-alert-secret-with-at-least-32-characters";
    expect(signIncidentAlert(payload, secret)).toBe(
      `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`
    );
  });

  it("delivers a privacy-shaped signed payload and marks it complete", async () => {
    const { store, updates } = alertStore();
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      void url;
      void init;
      return new Response(null, { status: 204 });
    });
    const secret = "an-alert-secret-with-at-least-32-characters";

    const summary = await deliverIncidentAlerts({
      now,
      store,
      fetcher,
      webhookUrl: "https://alerts.example.com/rally",
      webhookSecret: secret
    });

    expect(summary).toEqual({ enabled: true, claimed: 1, delivered: 1, failed: 0 });
    const init = fetcher.mock.calls[0]?.[1];
    const body = String(init?.body);
    expect(JSON.parse(body)).toEqual({
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
    expect(body).not.toContain("userId");
    expect(body).not.toContain("authorization");
    expect(body).not.toContain("stack");
    expect(new Headers(init?.headers).get("x-rally-signature")).toBe(
      signIncidentAlert(body, secret)
    );
    expect(init?.redirect).toBe("error");
    expect(updates).toHaveLength(2);
  });

  it("records a bounded failure code and leaves the alert retryable", async () => {
    const { store, updates } = alertStore();
    const summary = await deliverIncidentAlerts({
      now,
      store,
      fetcher: vi.fn(async () => new Response(null, { status: 503 })),
      webhookUrl: "https://alerts.example.com/rally",
      webhookSecret: "an-alert-secret-with-at-least-32-characters"
    });

    expect(summary).toEqual({ enabled: true, claimed: 1, delivered: 0, failed: 1 });
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({ data: { alertLastError: "http_503" } });
  });

  it("does nothing when alert delivery is not configured", async () => {
    await expect(deliverIncidentAlerts({ webhookUrl: "", webhookSecret: "" })).resolves.toEqual({
      enabled: false,
      claimed: 0,
      delivered: 0,
      failed: 0
    });
  });
});
