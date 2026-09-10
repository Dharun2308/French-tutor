"use client";

import { useRef, useState } from "react";

/** Keep the current answer on screen until its review has been acknowledged. */
export function useReviewSave() {
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function saveReview(save: () => Promise<unknown>) {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await save();
      return true;
    } catch {
      setSaveError("Could not confirm that your review was saved. Your answer is still here. Reload to check your progress before trying again.");
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return { saveReview, saving, saveError };
}
