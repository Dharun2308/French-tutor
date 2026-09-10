import { z } from "zod";
import type { SmartSource } from "./types";

const normalized = (value: string) => value.normalize("NFC").toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function smartExerciseSchema(source: SmartSource, history: Array<{ prompt: string; target: string }>) {
  return z.object({
    sourceKey: z.literal(source.key),
    prompt: z.string().trim().min(8).max(500),
    target: z.string().trim().min(2).max(500),
    rubric: z.string().trim().min(4).max(700),
  }).superRefine((value, context) => {
    const prompt = normalized(value.prompt), target = normalized(value.target);
    if (history.concat(source).some(old => normalized(old.prompt) === prompt || normalized(old.target) === target)) {
      context.addIssue({ code: "custom", message: "Use a fresh prompt and answer, not a previous exercise." });
    }
    if (` ${prompt} `.includes(` ${target} `)) context.addIssue({ code: "custom", message: "Do not reveal the target answer in the prompt." });
    if (source.verb && !` ${target} `.includes(` ${normalized(source.verb.form)} `)) {
      context.addIssue({ code: "custom", message: "The answer must contain the required conjugated form as a complete word or phrase." });
    }
  });
}
