// GET /api/settings — read the singleton settings row.
// PUT /api/settings — merge-update the singleton settings row.

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { getSettings, jsonError, jsonOk } from "@/lib/api";
import {
  TENSES,
  LEVELS,
  PHRASE_CATEGORIES,
  LEARNING_STAGES,
} from "@/types";

export const runtime = "nodejs";

const UpdateBody = z.object({
  dailyTarget: z.number().int().min(1).max(500).optional(),
  // activeTenses can be empty now (Newcomer / Foundations stages have no verbs).
  activeTenses: z.array(z.enum(TENSES)).optional(),
  activeLevels: z.array(z.enum(LEVELS)).min(1).optional(),
  preferredRegister: z.enum(["formal", "neutral", "informal", "all"]).optional(),
  modelOverride: z.string().max(64).nullable().optional(),
  ttsMode: z.enum(["browser", "openai"]).optional(),
  ttsVoice: z
    .enum(["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"])
    .optional(),
  learningStage: z.enum(LEARNING_STAGES).optional(),
  activePhraseCategories: z.array(z.enum(PHRASE_CATEGORIES)).optional(),
  timezone: z.string().max(64).optional(),
});

export async function GET() {
  const s = await getSettings();
  return jsonOk(s);
}

export async function PUT(req: NextRequest) {
  let patch: z.infer<typeof UpdateBody>;
  try {
    patch = UpdateBody.parse(await req.json());
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  // Ensure singleton exists.
  await getSettings();

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.dailyTarget !== undefined) update.dailyTarget = patch.dailyTarget;
  if (patch.activeTenses !== undefined) update.activeTenses = patch.activeTenses;
  if (patch.activeLevels !== undefined) update.activeLevels = patch.activeLevels;
  if (patch.preferredRegister !== undefined)
    update.preferredRegister = patch.preferredRegister;
  if (patch.modelOverride !== undefined) update.modelOverride = patch.modelOverride;
  if (patch.ttsMode !== undefined) update.ttsMode = patch.ttsMode;
  if (patch.ttsVoice !== undefined) update.ttsVoice = patch.ttsVoice;
  if (patch.learningStage !== undefined) update.learningStage = patch.learningStage;
  if (patch.activePhraseCategories !== undefined)
    update.activePhraseCategories = patch.activePhraseCategories;
  if (patch.timezone !== undefined) update.timezone = patch.timezone;

  await db.update(settings).set(update).where(eq(settings.id, 1));

  const fresh = await getSettings();
  return jsonOk(fresh);
}
