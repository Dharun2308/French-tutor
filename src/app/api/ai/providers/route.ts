// GET  /api/ai/providers          → each provider: enabled, installed, last attempt
// POST /api/ai/providers {provider} → run a tiny structured call through ONLY that
//                                     provider and report the result (Settings "Test")

import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { providerEvents } from "@/lib/db/schema";
import {
  getEnabledProviders,
  providerInstalled,
  runStructured,
  type ProviderAttempt,
} from "@/lib/ai/providers";
import { jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { PROVIDER_LABELS, PROVIDER_ORDER, type ProviderId } from "@/types";

export const runtime = "nodejs";

export async function GET() {
  const enabled = await getEnabledProviders();
  const providers = await Promise.all(
    PROVIDER_ORDER.map(async (id) => {
      const [last] = await db
        .select()
        .from(providerEvents)
        .where(eq(providerEvents.provider, id))
        .orderBy(desc(providerEvents.at))
        .limit(1);
      return {
        id,
        label: PROVIDER_LABELS[id],
        enabled: enabled[id],
        installed: await providerInstalled(id),
        last: last
          ? {
              ok: last.ok,
              at: last.at,
              ms: last.ms,
              model: last.model,
              error: last.error,
              purpose: last.purpose,
            }
          : null,
      };
    })
  );
  return jsonOk({ providers });
}

const TestSchema = z.object({ ok: z.boolean(), french: z.string() });
const TestJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "french"],
  properties: { ok: { type: "boolean" }, french: { type: "string" } },
};

const Body = z.object({ provider: z.enum(PROVIDER_ORDER) });

export async function POST(req: NextRequest) {
  const rl = rateLimit("provider_test", 10, 60_000);
  if (!rl.allowed) return jsonError("Too many tests. Wait a minute.", 429);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  const only = Object.fromEntries(
    PROVIDER_ORDER.map((p) => [p, p === body.provider])
  ) as Record<ProviderId, boolean>;

  let attempt: ProviderAttempt;
  try {
    const r = await runStructured(
      {
        purpose: "test",
        system: "You are a connectivity check. Answer exactly as instructed.",
        user: 'Reply with ok=true and french="ça marche".',
        schemaName: "provider_test",
        jsonSchema: TestJsonSchema,
        timeoutMs: 60_000,
      },
      TestSchema,
      only
    );
    attempt = r.attempts[r.attempts.length - 1];
  } catch (err) {
    const attempts = (err as { attempts?: ProviderAttempt[] }).attempts ?? [];
    attempt = attempts[attempts.length - 1] ?? {
      provider: body.provider,
      ok: false,
      ms: 0,
      model: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return jsonOk({ attempt });
}
