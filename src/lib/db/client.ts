import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing env ${name}. Copy .env.example to .env.local and fill in your credentials.`
    );
  }
  return v;
}

// Cache across hot reloads in dev to avoid reconnect storms.
declare global {
  // eslint-disable-next-line no-var
  var __dbClient: ReturnType<typeof createClient> | undefined;
}

const client =
  globalThis.__dbClient ??
  createClient({
    url: requireEnv("TURSO_DATABASE_URL"),
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
