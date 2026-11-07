"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * Reads a URL query parameter without useEffect+setState.
 * Returns `undefined` while prerendering/hydrating, then `string | null` in the browser.
 */
export function useQueryParam(name: string): string | null | undefined {
  return useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get(name),
    () => undefined,
  );
}
