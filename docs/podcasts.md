# Podcasts tab

`/podcasts` lists episodes of the built-in shows in `SHOWS` (`src/lib/podcasts/model.ts`;
*Little Talk in Slow French* and *InnerFrench*) plus shows added from a pasted link
(`podcasts/shows.json`); a row of chips picks the show. Opening an episode:

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
  Follow pill after manual scroll, lock-screen controls.
- Resume: the listening position is saved on the server (`position.json` beside the
  episode, shared by phone and iPad) every 10 s while playing, on pause/seek and when
  leaving. Opening an episode shows the saved line; play resumes there even on iPhone
  Safari, which loads no audio before play. The list shows "Resume at m:ss".
## Adding a show from a link (2026-10-29)

The owner wants French subtitles for anything he'd listen to on Spotify, English
shows included, played inside the tutor (no Spotify account or player).

- Paste box at the top of `/podcasts` (empty box + **Paste** reads the clipboard).
  `POST /api/podcasts {action:"resolve", url}` (`src/lib/podcasts/links.ts`):
  - Spotify episode/show links (and `spotify.link` short links): the public
    `open.spotify.com/embed/<type>/<id>` page's `__NEXT_DATA__` gives the show name
    (`subtitle`), episode title, release date and length. No login or API key.
  - The show name is looked up in Apple's directory (`itunes.apple.com/search`) for
    its public RSS feed (name similarity ≥ 0.85, else "probably Spotify-only").
  - Apple Podcasts links use `lookup?id=` (and `entity=podcastEpisode` for `?i=`);
    a pasted RSS URL is used as is.
  - The episode is matched in the feed by title, or a close title released the same
    day (`matchEpisode`). The preview shows the show, episode and spoken language
    (feed `<language>`, changeable) before anything is saved.
- `{action:"add", feed, language}` re-reads the feed and appends to
  `podcasts/shows.json`; `{action:"remove", id}` takes an added show off the list
  (files stay). Built-in shows can't be removed.
- Every feed/audio fetch goes through `fetchPublic`: HTTPS only, no IP literals,
  tailnet/`.local` names or hosts resolving to private/loopback addresses, redirects
  re-checked, feeds capped at 40 MB.
- **English shows**: Whisper runs with `language=en`; right after transcription the
  lines are translated into French (two 40-line chunks at a time through Codex →
  Claude, starting at the saved position) into `fr.json`. The player shows the French
  large and the English small underneath (EN toggle, on by default for English
  shows); untranslated lines show the English in grey italics until the French
  arrives. Jumping into untranslated lines moves the translation there. The French
  is a translation, so it doesn't match the audio word for word (owner: fine, it's
  for translating in his head). A 13-min NPR episode: ~30 s Whisper, ~45 s French.
  Ad detection is off for English shows (ads are English too).
- Transcripts now store `text` (older files have `fr`; both are read). Lines no
  longer break after abbreviations such as "U.S." or "M." (Whisper splits them into
  pieces like " U" + ".S.").
- Short lines for every show (owner: long lines were too hard to follow in French):
  `LIMITS` in `scripts/transcribe-podcast.py` ends a line at a sentence end, at a comma
  from 12 words, at a pause from 10, and cuts anything past 24 at a comma or the longest
  pause. Whisper sometimes drops punctuation for minutes (seen on Modern Wisdom); those
  runs are cut the same way. Existing transcripts were redone on 2026-10-29 (old files
  in `~/.cache/french-tutor-podlinks-20261029/old-transcripts/`).
- Phase 2 (not built): video via YouTube links.

- Env overrides: `PODCASTS_DIR`, `PODCAST_PYTHON`, `PODCAST_WHISPER_MODEL`.
- Tests: `tests/podcasts.test.ts` (feed parsing, line lookup, chunk order, ads).
