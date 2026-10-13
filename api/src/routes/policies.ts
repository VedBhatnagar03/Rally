import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

export async function policyRoutes(app: FastifyInstance) {
  app.get("/current", async () => ({
    policy: {
      version: env.POLICY_VERSION,
      minimumAge: 18,
      privacyNoticeUrl: new URL("/privacy", env.PUBLIC_APP_URL).toString(),
      communityGuidelinesUrl: new URL("/community-guidelines", env.PUBLIC_APP_URL).toString()
    }
  }));
}
