# Topics curriculum — 2026-09-05

Owner supplied a detailed ChatGPT learning handoff. Preserve coverage as self-reported history;
never turn it into invented scores or automatic mastery. Grammar level: late A1 / early A2;
long-term TCF Canada NCLC 7 / B2 goal, not a certified current level.

Entry: replace dashboard “View Active 10” with “Topics”; remove the requested explanatory sentence.
Browse by family/search: covered grammar, next grammar, later grammar, pronunciation, communication.
Previously practiced topics begin with production checks; partial topics start controlled practice;
new topics start concise theory. Every topic supports voluntary targeted revisit and theory refresh.

Persistent additive tables: topic progress, sessions with server-side answer keys, attempts, error tags.
Theory understanding, controlled accuracy, independent production and oral practice remain separate.
Theory confirmation is self-reported. Oral prompts allow speaking aloud then entering the response;
without microphone assessment, do not claim pronunciation or conversational automaticity.

New topic: short AI theory → 5 controlled questions → 20 independent questions. At >=85%, offer
maintenance; 70–84% gets 5 targeted questions; below 70% gets a brief rule refresh and controlled
practice. Remediation and hinted answers cannot inflate independent-production accuracy.
Maintenance intervals: 1, 3, 7, 14, then 30 days. Returning errors shorten review intervals.
After mistakes, show submitted/corrected text and a brief explanation, then a similar new question.
Three repeated category errors trigger three targeted questions and delayed review (~15 min, next day).

Daily mix: roughly 20% old retrieval, 40% current topic, 20% unpredictable mixed production,
20% oral-style prompts. Never introduce an unstudied advanced topic through mixed review.
Persistent error weights rise with misses and decay with successful retrieval of the same subrule.

AI: existing structured provider pipeline, Codex gpt-5.6-sol/medium → Claude opus/high → API.
API fallback is now explicitly authorized. Cache generated theory/questions in resumable sessions;
generate only on user actions, never speculative background calls. Validate generated topics and tags,
hide model answers until grading/reveal, and preserve questions/attempts across reloads and retries.

Verification: pure progression/selection/schema tests; disposable database integration covering
resume, grading isolation, retries, thresholds, remediation, scheduling and prerequisite selection;
real provider smoke check; production build; phone UI including answer/reveal states.
Back up SQLite, apply only new CREATE TABLE/INDEX statements, preserve imported lesson data.
