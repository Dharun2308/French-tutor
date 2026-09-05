import lessons from "./language-transfer-lessons.json";

export const FRENCH_LESSONS = lessons;
export const LT_STORAGE_KEY = "french-tutor:language-transfer:v1";
export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5] as const;
export interface ListeningProgress { position: number; completed: boolean }
export interface ListeningLibrary { selected: number; speed: number; tracks: Record<number, ListeningProgress> }
export const EMPTY_LIBRARY: ListeningLibrary = { selected: 1, speed: 1, tracks: {} };

export function readListeningLibrary(raw: string | null): ListeningLibrary {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return { ...EMPTY_LIBRARY, tracks: {} };
    const tracks: ListeningLibrary["tracks"] = {};
    for (const lesson of lessons) {
      const saved = value.tracks?.[lesson.number];
      if (saved && typeof saved.position === "number" && Number.isFinite(saved.position)) {
        tracks[lesson.number] = { position: Math.max(0, Math.min(saved.position, lesson.duration)), completed: saved.completed === true };
      }
    }
    return { selected: lessons.some((l) => l.number === value.selected) ? value.selected : 1,
      speed: PLAYBACK_SPEEDS.includes(value.speed) ? value.speed : 1, tracks };
  } catch { return { ...EMPTY_LIBRARY, tracks: {} }; }
}

export function audioTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
