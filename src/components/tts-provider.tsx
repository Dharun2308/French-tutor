"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { TtsMode } from "@/lib/client-tts";

interface TtsContextValue {
  mode: TtsMode;
  voice: string;
  ready: boolean;
  setMode: (m: TtsMode) => void;
  setVoice: (v: string) => void;
}

const TtsContext = createContext<TtsContextValue>({
  mode: "browser",
  voice: "alloy",
  ready: false,
  setMode: () => {},
  setVoice: () => {},
});

export function TtsProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<TtsMode>("browser");
  const [voice, setVoiceState] = useState<string>("alloy");
  const [ready, setReady] = useState(false);

  // Load settings once on mount. If the request fails, we just keep defaults —
  // pages should still work without TTS.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) return;
        const s = await res.json();
        if (cancelled) return;
        if (s.ttsMode === "openai" || s.ttsMode === "browser") {
          setModeState(s.ttsMode);
        }
        if (typeof s.ttsVoice === "string" && s.ttsVoice) {
          setVoiceState(s.ttsVoice);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((m: TtsMode) => {
    setModeState(m);
  }, []);
  const setVoice = useCallback((v: string) => {
    setVoiceState(v);
  }, []);

  return (
    <TtsContext.Provider value={{ mode, voice, ready, setMode, setVoice }}>
      {children}
    </TtsContext.Provider>
  );
}

export function useTts() {
  return useContext(TtsContext);
}
