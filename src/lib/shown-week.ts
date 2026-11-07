import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { readDeviceSetting, writeDeviceSetting } from '@/lib/device-setting';
import { addDays, defaultGroceryWeek, startOfWeek, todayIn, weeksBetween } from '@/lib/week';
import type { LocalDate, Weekday } from '@/lib/week';

/**
 * The week the Week and Groceries tabs show (GRO-72). One week for both tabs, remembered on this
 * device, so the app opens where you left it. When this week or the shopping week has moved on
 * since then (a new week began, or its last three days started), it opens on the shopping week.
 */
type Saved = {
  startDate: LocalDate;
  /** This week and the shopping week when it was picked, to tell when they moved on. */
  thisWeek: LocalDate;
  shoppingWeek: LocalDate;
  weekStartsOn: number;
  /** The family it was picked in, so another family never opens on it. */
  groupId: string;
};

const KEY = 'grocr.shownWeek';
let saved: Saved | null = null;
let restored = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function isSaved(value: unknown): value is Saved {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.startDate === 'string' &&
    typeof v.thisWeek === 'string' &&
    typeof v.shoppingWeek === 'string' &&
    typeof v.weekStartsOn === 'number' &&
    typeof v.groupId === 'string'
  );
}

/** Reads the remembered week on start. Missing or unreadable means the shopping week. */
export async function restoreShownWeek() {
  try {
    const raw = await readDeviceSetting(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (saved === null && isSaved(parsed)) saved = parsed;
  } catch {
    // Storage unavailable: open on the shopping week.
  }
  restored = true;
  notify();
}

export function useShownWeekRestored() {
  return useSyncExternalStore(subscribe, () => restored);
}

function remember(next: Saved) {
  saved = next;
  notify();
  void writeDeviceSetting(KEY, JSON.stringify(next)).catch(() => {});
}

/** For tests: forget the remembered week. */
export function resetShownWeek() {
  saved = null;
  now = Date.now();
  notify();
}

/**
 * The clock the tabs share, looked at again whenever the app comes back to the foreground, so
 * a phone left open over the weekend catches up and both tabs always agree on today.
 */
let now = Date.now();
let watching = false;

function watchForeground() {
  if (watching) return;
  watching = true;
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    now = Date.now();
    notify();
  });
}

function subscribeClock(listener: () => void) {
  watchForeground();
  return subscribe(listener);
}

/** Today in the family's timezone, the same for every screen. */
export function useToday(timeZone: string): LocalDate {
  const at = useSyncExternalStore(subscribeClock, () => now);
  return todayIn(timeZone, new Date(at));
}

export type WeekKind = 'past' | 'this' | 'future';

export type ShownWeek = {
  startDate: LocalDate;
  setStartDate: (startDate: LocalDate) => void;
  today: LocalDate;
  thisWeek: LocalDate;
  shoppingWeek: LocalDate;
  kind: WeekKind;
  /** Weeks from this week: -2 is two weeks ago. */
  offset: number;
};

/** Pure: which week to show, given what was remembered. */
export function pickShownWeek(
  remembered: Saved | null,
  today: LocalDate,
  weekStartsOn: Weekday,
  groupId: string,
): { startDate: LocalDate; thisWeek: LocalDate; shoppingWeek: LocalDate } {
  const thisWeek = startOfWeek(today, weekStartsOn);
  const shoppingWeek = defaultGroceryWeek(today, weekStartsOn).startDate;
  const stillValid =
    remembered !== null &&
    remembered.groupId === groupId &&
    remembered.weekStartsOn === weekStartsOn &&
    remembered.thisWeek === thisWeek &&
    remembered.shoppingWeek === shoppingWeek &&
    startOfWeek(remembered.startDate, weekStartsOn) === remembered.startDate;
  return { startDate: stillValid ? remembered.startDate : shoppingWeek, thisWeek, shoppingWeek };
}

export function weekKind(startDate: LocalDate, thisWeek: LocalDate): WeekKind {
  return startDate < thisWeek ? 'past' : startDate > thisWeek ? 'future' : 'this';
}

export function useShownWeek(family: {
  groupId: string;
  timezone: string;
  weekStartsOn: number;
}): ShownWeek {
  const weekStartsOn = family.weekStartsOn as Weekday;
  const today = useToday(family.timezone);
  const remembered = useSyncExternalStore(subscribe, () => saved);
  const { startDate, thisWeek, shoppingWeek } = pickShownWeek(
    remembered,
    today,
    weekStartsOn,
    family.groupId,
  );
  const setStartDate = (next: LocalDate) =>
    remember({ startDate: next, thisWeek, shoppingWeek, weekStartsOn, groupId: family.groupId });
  return {
    startDate,
    setStartDate,
    today,
    thisWeek,
    shoppingWeek,
    kind: weekKind(startDate, thisWeek),
    offset: weeksBetween(thisWeek, startDate),
  };
}

/** The shopping week as the jump-back button names it: this week, or next week. */
export function shoppingWeekIsNext(shown: Pick<ShownWeek, 'thisWeek' | 'shoppingWeek'>) {
  return shown.shoppingWeek === addDays(shown.thisWeek, 7);
}
