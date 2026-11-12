import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      role: "USER" | "ADMIN";
      av: number;
    };
    user: {
      sub: string;
      email: string;
      role: "USER" | "ADMIN";
      av: number;
    };
  }
}
