"""Transcribe one podcast episode into timed lines with faster-whisper.

Usage: transcribe-podcast.py <audio> <out.json> [fr|en]   (default fr)

Writes {"model", "language", "duration", "lines": [{"start", "end", "text"}]} atomically. Whisper
segments can run for several sentences, so lines are re-cut at sentence ends using
word timestamps. Progress goes to stderr as `progress <seconds>`.
"""
import json
import os
import re
import sys

from faster_whisper import WhisperModel

MODEL = os.environ.get("PODCAST_WHISPER_MODEL", "mobiuslabsgmbh/faster-whisper-large-v3-turbo")
PAUSE = 0.35  # seconds of silence between words
CLAUSE_END = (",", ";", ":")
# Line lengths in words, kept short so each line can be followed while it plays
# (owner, 2026-10-29: long lines were too hard to follow in French; all shows).
#   clause:  end the line at a comma from this many words
#   pause:   end it at a pause from this many words
#   hard:    longest line; past it, cut at a comma or the longest pause
#   unpunctuated: Whisper sometimes drops punctuation for minutes; cut such runs here
#   cut_from: shortest piece such a cut leaves
LIMITS = {"clause": 12, "pause": 10, "hard": 24, "unpunctuated": 24, "cut_from": 9}
SENTENCE_END = (".", "?", "!", "…")
# "U.S.", "Mr." or "M." end in a full stop without ending the sentence.
ABBREVIATION = re.compile(r"^(?:(?:[A-Za-z]\.){2,3}|[B-HJ-Z]\.|Mr|Mrs|Ms|Dr|St|Jr|Sr|Mme|Mlle|vs)\.?$")


def sentence_end(words):
    # Whisper can split a word into pieces (" U", ".S."), so look at the whole last word.
    last = "".join(w.word for w in words[-3:]).split()[-1:]
    return bool(last) and last[0].endswith(SENTENCE_END) and not ABBREVIATION.match(last[0])


def lines_from(segments, limits):
    lines, words = [], []

    def flush(upto=None):
        cut = words[:upto] if upto is not None else words[:]
        text = "".join(w.word for w in cut).strip()
        if text:
            lines.append({"start": round(cut[0].start, 2), "end": round(cut[-1].end, 2), "text": text})
        del words[:len(cut)]

    def gap(k):
        return words[k].start - words[k - 1].end

    def unpunctuated():
        return not any(w.word.strip().endswith(SENTENCE_END + CLAUSE_END) for w in words)

    def best_cut():
        span = range(limits["cut_from"], len(words) - 3)
        commas = [k for k in span if words[k - 1].word.strip().endswith(CLAUSE_END)]
        return max(commas or span, key=gap)

    for segment in segments:
        print(f"progress {segment.end:.1f}", file=sys.stderr, flush=True)
        for word in segment.words or []:
            if len(words) >= limits["pause"] and word.start - words[-1].end >= PAUSE:
                flush()
            words.append(word)
            token = word.word.strip()
            if sentence_end(words) or (len(words) >= limits["clause"] and token.endswith(CLAUSE_END)):
                flush()
            elif len(words) >= limits["hard"] or (len(words) >= limits["unpunctuated"] and unpunctuated()):
                flush(best_cut())
        # A segment boundary is a pause: end a long line there at a clause break.
        if words and len(words) >= limits["pause"] and words[-1].word.strip().endswith(CLAUSE_END):
            flush()
    flush()
    return lines


def main():
    audio, out = sys.argv[1], sys.argv[2]
    language = sys.argv[3] if len(sys.argv) > 3 else "fr"
    if language not in ("fr", "en"):
        sys.exit(f"unsupported language {language}")
    try:
        model = WhisperModel(MODEL, device="cuda", compute_type="float16")
    except Exception as error:  # GPU busy or unavailable: slower, but still works.
        print(f"cuda unavailable ({error}); using cpu", file=sys.stderr, flush=True)
        model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        audio,
        language=language,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,
        beam_size=5,
    )
    print(f"duration {info.duration:.1f}", file=sys.stderr, flush=True)
    result = {"model": MODEL, "language": language, "duration": round(info.duration, 2), "lines": lines_from(segments, LIMITS)}
    tmp = f"{out}.tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False)
    os.replace(tmp, out)


if __name__ == "__main__":
    main()
