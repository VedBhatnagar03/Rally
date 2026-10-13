import type { FastifyInstance } from "fastify";
import { profilePrompts } from "../modules/profile/prompts.js";

export async function profileOptionRoutes(app: FastifyInstance) {
  app.get("/prompts", async () => ({ prompts: profilePrompts }));
}
