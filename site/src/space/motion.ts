// The "pause animations" switch, shared by the pause button (MotionToggle.tsx)
// and both space scenes. It's a tiny external store: a value outside React,
// a way to change it, and a way to subscribe to changes. usePaused() reads it
// with useSyncExternalStore (see hooks.ts), so every component using it
// re-renders when it flips. It's false on the server (nothing animates there).
import { useSyncExternalStore } from "react";

let paused = false;
const listeners = new Set<() => void>();

export function setPaused(value: boolean): void {
  paused = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the visitor paused the space animations. */
export function usePaused(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => paused,
    () => false,
  );
}
