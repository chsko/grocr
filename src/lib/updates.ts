import * as Updates from 'expo-updates';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/** How long to wait between update checks when the app comes back to the foreground. */
export const FOREGROUND_CHECK_INTERVAL_MS = 10 * 60 * 1000;

// The launch check runs on its own (checkAutomatically ON_LOAD), so the first foreground check
// waits a full interval after start.
let lastCheck = Date.now();

/**
 * Checks for and downloads a new over-the-air update. expo-updates already does this on every
 * cold start, so this only covers an app that stays open in the background for days.
 */
export async function checkForUpdateNow(now = Date.now()) {
  if (!Updates.isEnabled || now - lastCheck < FOREGROUND_CHECK_INTERVAL_MS) return;
  lastCheck = now;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // Offline or the update server is down: try again on a later foreground.
  }
}

/** Checks for updates whenever the app returns to the foreground, at most once per interval. */
export function useForegroundUpdateCheck() {
  useEffect(() => {
    if (!Updates.isEnabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForUpdateNow();
    });
    return () => sub.remove();
  }, []);
}

// The banner shows on every tab, so closing it on one hides it on all of them.
let dismissedUpdate: string | null = null;
const listeners = new Set<() => void>();

export function dismissUpdate(key: string) {
  dismissedUpdate = key;
  for (const listener of listeners) listener();
}

export function useDismissedUpdate() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => dismissedUpdate,
  );
}

// Every visited tab keeps its banner mounted, so screen readers hear it once per update.
let announcedUpdate: string | null = null;

/** True the first time it's called for this update, so only one banner announces it. */
export function claimAnnouncement(key: string) {
  if (announcedUpdate === key) return false;
  announcedUpdate = key;
  return true;
}
