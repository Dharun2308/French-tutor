/** Run with the app stopped and an explicit TURSO_DATABASE_URL. Safe to repeat on fresh/restored DBs. */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

export async function migrateTopics(url: string) {
  const client = createClient({ url });
  try {
    await client.executeMultiple(readFileSync("scripts/migrate-2026-09-05-topics.sql", "utf8"));
    const columns = await client.execute("PRAGMA table_info(topic_progress)");
    const statements: string[] = [];
    if (!columns.rows.some((r) => r.name === "maintenance_due_at")) {
      statements.push(...readFileSync("scripts/migrate-2026-09-05-topics-review.sql", "utf8").split(";").filter((s) => s.trim()));
    }
    if (!columns.rows.some((r) => r.name === "needs_theory")) {
      statements.push(...readFileSync("scripts/migrate-2026-09-05-topics-review-state.sql", "utf8").split(";").filter((s) => s.trim()));
    }
    if (statements.length) await client.batch(statements, "write");
  } finally { client.close(); }
}

if (process.argv[1]?.endsWith("/migrate-topics.ts")) {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url?.startsWith("file:")) throw new Error("Set TURSO_DATABASE_URL explicitly to a local database; stop the app and back up first.");
  migrateTopics(url).then(() => console.log("Topics migrations applied.")).catch((e) => { console.error(e); process.exitCode = 1; });
}
