// Client-side text-to-speech dispatcher.
//
// Two backends:
//   - "browser" — window.speechSynthesis (free, instant, quality depends on OS)
//   - "openai" — POST /api/ai/tts (costs $, higher quality, cached per text)
//
// The OpenAI path memoizes audio URLs per text for the session so clicking
// the same form twice only round-trips once.

export type TtsMode = "browser" | "openai";

const audioCache = new Map<string, string>(); // text+voice → objectURL
let currentAudio: HTMLAudioElement | null = null;

function normalizeText(text: string): string {
  // Expand "j'" / "t'" etc. so the browser TTS doesn't mangle them,
  // and join the pronoun if passed as "je|parle" helper.
  return text.trim();
}

/** Stop any in-flight speech (both paths). */
export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {}
    currentAudio = null;
  }
}

function pickFrenchVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  // Prefer fr-FR
  const fr = voices.find((v) => v.lang === "fr-FR");
  if (fr) return fr;
  return voices.find((v) => v.lang.startsWith("fr")) ?? null;
}

export function speakBrowser(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(normalizeText(text));
  u.lang = "fr-FR";
  const voice = pickFrenchVoice();
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
}

export async function speakOpenAI(text: string, voice = "alloy"): Promise<void> {
  stopSpeaking();
  const key = `${voice}|${text}`;
  let url = audioCache.get(key);
  if (!url) {
    const res = await fetch("/api/ai/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: normalizeText(text), voice }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const blob = await res.blob();
    url = URL.createObjectURL(blob);
    audioCache.set(key, url);
  }
  const audio = new Audio(url);
  currentAudio = audio;
  await audio.play();
}

export async function speak(
  mode: TtsMode,
  text: string,
  voice = "alloy"
): Promise<void> {
  try {
    if (mode === "openai") {
      await speakOpenAI(text, voice);
    } else {
      speakBrowser(text);
    }
  } catch (err) {
    console.warn("TTS failed, falling back to browser:", err);
    speakBrowser(text);
  }
}
