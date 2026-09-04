# Phase 4 — listening and contextual practice

Status: implemented design, 2026-09-02.

## Learning contract

- Listening starts with sound only. French and English stay hidden until the learner submits or reveals.
- One recording is reused at 1×, 0.85×, and 0.7×; speed changes playback, not the generated audio.
- Listening answers are logged as evidence with `direction=listening` and update the listening counters, but they never advance the FSRS schedule. A failed dictation makes the item due for production immediately; a passed one leaves the schedule untouched (changed 2026-09-03; production > recognition).
- AI variations are cached A2 micro-contexts for repeatedly missed personal items. They never become lesson items.
- Conversation practice receives a hidden set of weak items and creates natural openings for them. It does not show a checklist until the session ends.

## Boundaries

- Browser speech remains the free default. OpenAI speech is opt-in in Settings and is cached on disk by text, voice, and model.
- No microphone or speech recognition in this phase: the learner listens and types. This avoids fragile browser recognition and makes errors inspectable.
- Generated variations and conversations are practice aids, not evidence until the learner submits and rates an answer.

