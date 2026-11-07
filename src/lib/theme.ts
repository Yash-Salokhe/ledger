"use client";
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/** Applies and persists the theme. Lives outside components so React state stays pure. */
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("ledger-theme", t); } catch {}
}

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

/** Current theme, kept in sync with <html data-theme> (set before first paint in the root layout). */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => (document.documentElement.dataset.theme as Theme) ?? "light", () => "light");
}
