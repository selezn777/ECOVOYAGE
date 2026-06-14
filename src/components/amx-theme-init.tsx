"use client";

import { useLayoutEffect } from "react";

const STORAGE_KEY = "amx-theme";

/** Без <script> в дереве React (иначе предупреждение в React 19). До первого paint читаем localStorage. */
export function AmxThemeInit() {
  useLayoutEffect(() => {
    try {
      const t = localStorage.getItem(STORAGE_KEY);
      if (t === "dark") document.documentElement.classList.add("dark");
      else if (t === "light") document.documentElement.classList.remove("dark");
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
