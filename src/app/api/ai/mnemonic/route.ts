// POST /api/ai/mnemonic
// { kind: "phrase" | "card", id: number }
//
// Generates (and caches on the row) a short memory hook for a leech — an
// item the user has failed repeatedly. The client triggers this after a
// wrong answer on a struggling card; the result is stored so it's free on
// every later encounter.

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { cards, conjugations, phrases, verbs } from "@/lib/db/schema";
import { chatJSON } from "@/lib/openai";
import {
  MnemonicSchema,
  MnemonicJsonSchema,
  mnemonicSystemPrompt,
} from "@/lib/prompts";
import { jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { ensureSeeded } from "@/lib/seed/ensure-seeded";
import { PERSON_PRONOUNS, TENSE_LABELS, type Person, type Tense } from "@/types";

export const runtime = "nodejs";

/** Minimum lifetime wrong count before we spend an AI call on a mnemonic. */
const LEECH_MIN_WRONG = 3;

const Body = z.object({
  kind: z.enum(["phrase", "card"]),
  id: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit("ai_mnemonic", 20, 60_000);
  if (!rl.allowed) {
    return jsonError("Too many AI requests. Slow down a moment.", 429);
  }

  await ensureSeeded();

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  if (body.kind === "phrase") {
    const rows = await db
      .select()
      .from(phrases)
      .where(eq(phrases.id, body.id))
      .limit(1);
    if (rows.length === 0) return jsonError("Phrase not found", 404);
    const p = rows[0];
    if (p.mnemonic) return jsonOk({ mnemonic: p.mnemonic });
    if (p.wrongCount < LEECH_MIN_WRONG) {
      return jsonError("Not a leech yet — keep practicing.", 400);
    }

    try {
      const result = await chatJSON({
        system: mnemonicSystemPrompt(),
        user: [
          `French: "${p.french}"`,
          `English: "${p.english}"`,
          p.notes ? `Existing note: "${p.notes}"` : "",
          "The learner keeps failing this flashcard (English → French). Give a hook for recalling the French.",
        ]
          .filter(Boolean)
          .join("\n"),
        schema: MnemonicSchema,
        schemaName: "mnemonic",
        jsonSchema: MnemonicJsonSchema as Record<string, unknown>,
      });
      await db
        .update(phrases)
        .set({ mnemonic: result.mnemonic })
        .where(eq(phrases.id, p.id));
      return jsonOk({ mnemonic: result.mnemonic });
    } catch (err) {
      console.error("AI mnemonic error:", err);
      return jsonError("AI unavailable. Try again in a moment.", 502);
    }
  }

  // kind === "card" — a specific conjugation the user keeps failing.
  const rows = await db
    .select({
      cardId: cards.id,
      wrongCount: cards.wrongCount,
      mnemonic: cards.mnemonic,
      tense: conjugations.tense,
      person: conjugations.person,
      form: conjugations.form,
      infinitive: verbs.infinitive,
      english: verbs.english,
    })
    .from(cards)
    .innerJoin(conjugations, eq(conjugations.id, cards.conjugationId))
    .innerJoin(verbs, eq(verbs.id, conjugations.verbId))
    .where(eq(cards.id, body.id))
    .limit(1);
  if (rows.length === 0) return jsonError("Card not found", 404);
  const c = rows[0];
  if (c.mnemonic) return jsonOk({ mnemonic: c.mnemonic });
  if (c.wrongCount < LEECH_MIN_WRONG) {
    return jsonError("Not a leech yet — keep practicing.", 400);
  }

  try {
    const result = await chatJSON({
      system: mnemonicSystemPrompt(),
      user: [
        `Verb: "${c.infinitive}" (${c.english})`,
        `Tense: ${TENSE_LABELS[c.tense as Tense]}`,
        `Target form: "${PERSON_PRONOUNS[c.person as Person]} ${c.form}"`,
        "The learner keeps failing this conjugation. Give a hook for recalling this exact form.",
      ].join("\n"),
      schema: MnemonicSchema,
      schemaName: "mnemonic",
      jsonSchema: MnemonicJsonSchema as Record<string, unknown>,
    });
    await db
      .update(cards)
      .set({ mnemonic: result.mnemonic })
      .where(eq(cards.id, c.cardId));
    return jsonOk({ mnemonic: result.mnemonic });
  } catch (err) {
    console.error("AI mnemonic error:", err);
    return jsonError("AI unavailable. Try again in a moment.", 502);
  }
}
