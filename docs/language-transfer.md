# Language Transfer French audio

Topics links to `/topics/language-transfer`, with all 40 numbered lessons from Language Transfer's
official Introduction to French download: https://www.languagetransfer.org/french.
The official archive URL is https://downloads.languagetransfer.org/french/french.zip (currently
redirecting to https://media-legacy.languagetransferapp.org/french.zip).

The player uses local MP3s, native audio controls, 15-second seeking, playback speed and Media Session
controls where supported. It saves the selected lesson, per-lesson position, listened status and speed
in this browser's localStorage. Playback does not auto-start or auto-advance. Finishing a lesson marks
it listened; replay starts at zero. Listening never changes grammar scores, reviews or topic mastery.
Changing browser/device does not transfer listening progress, and navigating away stops this player.

## Installation / recovery

Audio files are deliberately Git-ignored under `audio/language-transfer-french/`. The course is about
364 MiB and 6 hours 37 minutes. The code and manifest are in Git; the recordings are installed from
the official download for this personal app. A fresh checkout needs this installation step:

```sh
python3 scripts/install-language-transfer.py
```

Alternatively pass `--archive /path/to/french.zip` for an existing official download. Python 3 and
`ffprobe` are required. The installer validates all 40 expected archive entries, stores numbered
MP3s, and records durations, byte counts and SHA-256 hashes in
`src/lib/language-transfer-lessons.json`. It resolves paths relative to the repository root.
The app credits Language Transfer and links to the official course and donation page.

`/api/language-transfer/1` through `/40` serve the installed MP3s with HEAD and HTTP single-range
support, including suffix/open ranges and 416 responses. Only these numeric IDs can access files.
No AI calls or database migration are involved.

## Verification

```sh
node --import tsx tests/language-transfer.test.ts
node --import tsx scripts/verify-language-transfer.ts
```

The integration check verifies every installed file hash and its HEAD/range/error responses.
`scripts/verify-language-transfer-browser.mjs` uses an isolated app on :8097 and disposable Chromium
on :9236. It checks the Topics link, all 40 lessons, real media playback, seeking, speed, switching,
resume after reload, completion persistence and mobile layout. Its completion flags are stored only
in the disposable browser. Screenshots: `~/snap/chromium/common/shots/language-transfer-*.png`.
