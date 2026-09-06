import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { TOPIC_BY_ID } from "./catalog";
import type { Theory, Topic } from "./types";

export const TheorySchema = z.object({ meaning: z.string().min(1).max(1000), usage: z.string().min(1).max(1000), formation: z.string().min(1).max(1500), caution: z.string().max(1000), examples: z.array(z.object({ french: z.string().min(1).max(300), english: z.string().min(1).max(300) })).min(2).max(4), teachBack: z.string().max(300) });
const CachedTheory = z.object({ theory: TheorySchema, provider: z.string() });
type Result = z.infer<typeof CachedTheory>;
const pending = new Map<string, Promise<Result>>();

/** Reference reading never starts a session or changes learner progress. */
export async function readReferenceTheory(
  topicId: string,
  generate: (topic: Topic) => Promise<{ theory: Theory; provider: string }>,
  directory = path.join(process.cwd(), "topic-theory-cache"),
): Promise<Result> {
  const topic = TOPIC_BY_ID.get(topicId);
  if (!topic) throw new Error("Topic not found.");
  const version = createHash("sha256").update(JSON.stringify({ version: 1, topic })).digest("hex").slice(0, 16);
  const filename = path.join(directory, `${topic.id}-${version}.json`);
  const existing = pending.get(filename);
  if (existing) return existing;
  const work = (async () => {
    try { return CachedTheory.parse(JSON.parse(await readFile(filename, "utf8"))); }
    catch (error) {
      if (!(error instanceof SyntaxError) && !(error instanceof z.ZodError) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const result = CachedTheory.parse(await generate(topic));
    await mkdir(directory, { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(result), "utf8");
    await rename(temporary, filename);
    return result;
  })();
  pending.set(filename, work);
  try { return await work; }
  finally { pending.delete(filename); }
}
