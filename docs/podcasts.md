# Podcasts tab

`/podcasts` lists episodes of the shows in `SHOWS` (`src/lib/podcasts/model.ts`;
currently *Little Talk in Slow French*, public Spreaker RSS). Opening an episode:

1. downloads the feed's MP3 to `podcasts/<show>/<episode>/audio.mp3` (gitignored);
2. transcribes it once with faster-whisper `large-v3-turbo` on the GPU
   (`scripts/transcribe-podcast.py`, Hermes venv python, `HF_HUB_OFFLINE=1`;
   ~40 s for 20–30 min) into sentence-shaped timed lines (`lines.json`);
3. plays the same file in the page (`/api/podcasts/:show/:episode/media`), so line
   timings match. Spotify's stream is DRM-protected; the RSS file is the same episode.

- The feed inserts different English ads into each download (casino, Shopify…).
  `markAds` flags runs of English lines; the player shows one "Ad · Skip" row.
  Single-line glosses by the host ("Éviter, to avoid") stay.
- English is off by default (owner: French only pushes him). The first time EN is
  switched on for an episode, lines are translated in 40-line chunks through the
  normal provider chain (Codex → Claude), starting at the line being played, and
  saved to `en.json`.
- Jobs run in the server process, one Whisper run at a time. A restart drops a
  running job; reopening the episode restarts it. No database tables.
- Player: tap a line to play it, previous/next/replay line, speed 0.75–1.25×,
  Follow pill after manual scroll, lock-screen controls, position saved per episode
  in localStorage.
- Env overrides: `PODCASTS_DIR`, `PODCAST_PYTHON`, `PODCAST_WHISPER_MODEL`.
- Tests: `tests/podcasts.test.ts` (feed parsing, line lookup, chunk order, ads).
