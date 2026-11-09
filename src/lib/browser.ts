"use client";

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/**
 * Read a browser-only primitive value without a hydration mismatch: the server render and
 * first client render use `server`; the browser value is used after hydration.
 */
export function useBrowserValue<T extends string | number | boolean | undefined>(get: () => T, server: T): T {
  return useSyncExternalStore(noSubscription, get, () => server);
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
