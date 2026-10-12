type IncidentRequestContext = {
  id: string;
  method: string;
  url: string;
  routeOptions: { url?: string };
  user?: { sub?: string };
};

function safeErrorProperty(error: unknown, property: "name" | "code") {
  if (typeof error !== "object" || error === null || !(property in error)) return undefined;
  const value = (error as Record<string, unknown>)[property];
  return typeof value === "string" ? value.slice(0, 100) : undefined;
}

export function describeOperationalIncident(request: IncidentRequestContext, error: unknown) {
  const userId = request.user && typeof request.user.sub === "string" ? request.user.sub : undefined;

  return {
    requestId: request.id,
    method: request.method,
    route: request.routeOptions.url ?? request.url.split("?", 1)[0],
    statusCode: 500,
    errorName: safeErrorProperty(error, "name") ?? "UnknownError",
    errorCode: safeErrorProperty(error, "code"),
    userId
  };
}
