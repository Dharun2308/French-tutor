"use client";
import { useEffect } from "react";

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/**
 * Bind keyboard shortcuts.
 * Keys are case-sensitive; use "Enter", "Escape", "ArrowRight", etc.
 * Modifiers: prefix with "ctrl+", "alt+", "shift+", "meta+" (combine with "+").
 * Example: `{ "Enter": submit, "1": rate1, "shift+Enter": next }`
 *
 * Hotkeys are ignored when the event target is inside an <input> or
 * <textarea> unless the binding key starts with a modifier.
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField =
        tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable;
      for (const [combo, fn] of Object.entries(map)) {
        const parts = combo.split("+");
        const key = parts[parts.length - 1];
        const needsCtrl = parts.includes("ctrl");
        const needsAlt = parts.includes("alt");
        const needsShift = parts.includes("shift");
        const needsMeta = parts.includes("meta");
        const isModified = needsCtrl || needsAlt || needsShift || needsMeta;

        if (inField && !isModified) continue;

        if (needsCtrl !== e.ctrlKey) continue;
        if (needsAlt !== e.altKey) continue;
        if (needsShift !== e.shiftKey) continue;
        if (needsMeta !== e.metaKey) continue;

        const keyMatches =
          e.key === key ||
          (key.length === 1 && e.key.toLowerCase() === key.toLowerCase());
        if (keyMatches) {
          fn(e);
          e.preventDefault();
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map, enabled]);
}
