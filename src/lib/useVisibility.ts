import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

function getSnapshot() {
  return document.visibilityState === "visible";
}

export function useIsVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
