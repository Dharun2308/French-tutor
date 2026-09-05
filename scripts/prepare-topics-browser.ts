import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db/client';
import { settings } from '../src/lib/db/schema';
import { topicProgress } from '../src/lib/curriculum/schema';
import { curriculumOverview, startTopicSession, actOnTopicSession } from '../src/lib/curriculum/service';
import type { CurriculumAI } from '../src/lib/curriculum/ai';
async function main() {
  if (!process.env.TURSO_DATABASE_URL?.startsWith('file:/tmp/')) throw new Error('Disposable DB required');
  let n = 0;
  const ai: CurriculumAI = {
    theory: async () => ({ provider: 'fixture', theory: { meaning: 'Direct object pronouns replace a person or thing receiving the action.', usage: 'Use them when the person or thing is already known.', formation: 'Place le, la, or les before the conjugated verb.', caution: 'Use l’ before a vowel.', examples: [{ french: 'Je la vois.', english: 'I see her.' }, { french: 'Je les vois.', english: 'I see them.' }], teachBack: 'Where does the pronoun go?' } }),
    questions: async (plan, previous, tags, remediation = false) => ({ provider: 'fixture', questions: plan.map((p) => ({ ...p, id: randomUUID(), prompt: `Translate the full sentence: I see her. (Practice ${++n})`, answer: 'Je la vois.', hint: 'Put the pronoun before the verb.', rule: 'The object pronoun comes before the conjugated verb.', tag: p.tag ?? 'PRONOUN_PLACEMENT', audio: '', remediation, hinted: false })) }),
    grade: async () => { throw new Error('Use the real local grader in the browser'); },
  };
  await curriculumOverview();
  const initial = await startTopicSession('direct-objects', 'learn', ai);
  await actOnTopicSession({ action: 'confirm', sessionId: initial.id }, ai);
  await db.update(topicProgress).set({ state: 'REVISIT_REQUIRED' }).where(eq(topicProgress.topicId, 'present'));
  await startTopicSession('present', 'learn', ai);
  await startTopicSession('communication-1', 'theory', ai);
  await startTopicSession('mixed', 'mixed', ai);
  await db.update(settings).set({ extractProviders: { codex: false, claude: false, openai: false } }).where(eq(settings.id, 1));
  console.log('Browser fixture sessions ready; paid AI disabled in disposable database.');
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
