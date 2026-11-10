import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";

export const refreshCookieName = "rally_refresh";

const allowedOrigins = new Set(
  env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
);

const refreshCookieOptions = {
  path: "/v1/auth",
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const
};

export function setRefreshCookie(reply: FastifyReply, refreshToken: string) {
  reply.setCookie(refreshCookieName, refreshToken, {
    ...refreshCookieOptions,
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60
  });
}

export function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(refreshCookieName, refreshCookieOptions);
}

export function isAllowedBrowserOrigin(origin: string | undefined) {
  return origin !== undefined && allowedOrigins.has(origin);
}

export function isAllowedSessionIssuanceOrigin(origin: string | undefined) {
  return env.NODE_ENV !== "production" || isAllowedBrowserOrigin(origin);
}

export function refreshCredential(
  request: FastifyRequest,
  bodyToken: string | undefined
): { token?: string; cookieBacked: boolean } {
  const cookieToken = request.cookies[refreshCookieName];
  if (cookieToken) return { token: cookieToken, cookieBacked: true };
  return {
    token: env.NODE_ENV === "production" ? undefined : bodyToken,
    cookieBacked: false
  };
}

export function publicSession<T extends object>(
  session: T & { refreshToken: string },
  exposeRefreshToken = env.NODE_ENV !== "production"
): T & { refreshToken?: string } {
  if (!exposeRefreshToken) {
    const publicFields = { ...session } as T & { refreshToken?: string };
    delete publicFields.refreshToken;
    return publicFields as T;
  }
  return session;
}
