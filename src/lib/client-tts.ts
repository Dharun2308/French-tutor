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
  const isExactFrench = (voice: SpeechSynthesisVoice) =>
    voice.lang.toLowerCase().replace("_", "-") === "fr-fr";
  const isFrench = (voice: SpeechSynthesisVoice) =>
    voice.lang.toLowerCase().startsWith("fr");

  // Local/system voices are more likely than remote browser voices to honor
  // rate and pitch on mobile. Keep fr-FR first when the device provides it.
  return voices.find((voice) => isExactFrench(voice) && voice.localService)
    ?? voices.find((voice) => isFrench(voice) && voice.localService)
    ?? voices.find(isExactFrench)
    ?? voices.find(isFrench)
    ?? null;
}

/**
 * Mobile speech engines commonly compress nearby sub-1 rates into the same
 * preset. Spread our two learner-facing slow speeds farther apart so 0.85x
 * and 0.7x remain audibly distinct. OpenAI audio keeps its exact rate.
 */
export function effectiveBrowserRate(rate: number): number {
  const requested = Math.min(1.25, Math.max(0.5, rate));
  if (requested >= 1) return requested;
  if (requested <= 0.7) return 0.5;
  if (requested <= 0.85) return 0.7;
  return requested;
}

export function speakBrowser(text: string, rate = 1) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(normalizeText(text));
  u.lang = "fr-FR";
  const voice = pickFrenchVoice();
  if (voice) {
    u.voice = voice;
    // Android Chrome needs the utterance language to match the selected voice.
    u.lang = voice.lang;
  }
  u.rate = effectiveBrowserRate(rate);
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
}

export async function speakOpenAI(text: string, voice = "alloy", rate = 1): Promise<void> {
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
  audio.playbackRate = Math.min(1.25, Math.max(0.5, rate));
  currentAudio = audio;
  await audio.play();
}

export async function speak(
  mode: TtsMode,
  text: string,
  voice = "alloy",
  rate = 1
): Promise<void> {
  try {
    if (mode === "openai") {
      await speakOpenAI(text, voice, rate);
    } else {
      speakBrowser(text, rate);
    }
  } catch (err) {
    console.warn("TTS failed, falling back to browser:", err);
    speakBrowser(text, rate);
  }
}
