"""Transcribe one French audio file into timed lines with faster-whisper.

Usage: transcribe-podcast.py <audio> <out.json>

Writes {"model", "duration", "lines": [{"start", "end", "fr"}]} atomically. Whisper
segments can run for several sentences, so lines are re-cut at sentence ends using
word timestamps. Progress goes to stderr as `progress <seconds>`.
"""
import json
import os
import sys

from faster_whisper import WhisperModel

MODEL = os.environ.get("PODCAST_WHISPER_MODEL", "mobiuslabsgmbh/faster-whisper-large-v3-turbo")
MAX_WORDS = 28
SENTENCE_END = (".", "?", "!", "…")


def lines_from(segments):
    lines, words = [], []

    def flush():
        text = "".join(w.word for w in words).strip()
        if text:
            lines.append({"start": round(words[0].start, 2), "end": round(words[-1].end, 2), "fr": text})
        words.clear()

    for segment in segments:
        print(f"progress {segment.end:.1f}", file=sys.stderr, flush=True)
        for word in segment.words or []:
            words.append(word)
            token = word.word.strip()
            if token.endswith(SENTENCE_END) or (len(words) >= MAX_WORDS and token.endswith((",", ";", ":"))) or len(words) >= 2 * MAX_WORDS:
                flush()
        # A segment boundary is a pause: end a long line there at a clause break.
        if words and len(words) >= MAX_WORDS // 2 and words[-1].word.strip().endswith((",", ";", ":")):
            flush()
    flush()
    return lines


def main():
    audio, out = sys.argv[1], sys.argv[2]
    try:
        model = WhisperModel(MODEL, device="cuda", compute_type="float16")
    except Exception as error:  # GPU busy or unavailable: slower, but still works.
        print(f"cuda unavailable ({error}); using cpu", file=sys.stderr, flush=True)
        model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        audio,
        language="fr",
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,
        beam_size=5,
    )
    print(f"duration {info.duration:.1f}", file=sys.stderr, flush=True)
    result = {"model": MODEL, "duration": round(info.duration, 2), "lines": lines_from(segments)}
    tmp = f"{out}.tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False)
    os.replace(tmp, out)


if __name__ == "__main__":
    main()
