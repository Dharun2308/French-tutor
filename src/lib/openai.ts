// OpenAI client wrapper with strict JSON schema output.
//
// gpt-5-mini supports structured outputs. We always ask for strict JSON and
// validate with a zod schema server-side. On any failure we throw — callers
// turn that into a friendly "AI unavailable" response rather than crashing.

import OpenAI from "openai";
import { z, type ZodTypeAny } from "zod";

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY missing. Add it to .env.local or your Vercel environment."
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

export function getModel(): string {
  return process.env.OPENAI_MODEL || "gpt-5-mini";
}

export interface ChatJSONOptions<T extends ZodTypeAny> {
  system: string;
  user: string;
  schema: T;
  schemaName: string;
  /** The raw JSON Schema (compatible with OpenAI strict mode). */
  jsonSchema: Record<string, unknown>;
  model?: string;
  temperature?: number;
}

/**
 * Run a chat completion that must return JSON matching the given schema.
 * Returns the zod-parsed result, or throws on any failure.
 */
export async function chatJSON<T extends ZodTypeAny>(
  opts: ChatJSONOptions<T>
): Promise<z.infer<T>> {
  const client = getOpenAI();
  const model = opts.model ?? getModel();

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: opts.schemaName,
        strict: true,
        schema: opts.jsonSchema,
      },
    },
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI returned empty content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const result = opts.schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `OpenAI JSON did not match schema: ${result.error.message}`
    );
  }
  return result.data;
}
