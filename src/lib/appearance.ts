import { createContext, useContext, useSyncExternalStore } from 'react';
import { Appearance, Platform, StyleSheet, useColorScheme } from 'react-native';

import { Palettes, type Palette, type Scheme } from '@/constants/theme';
import { readDeviceSetting, writeDeviceSetting } from '@/lib/device-setting';

/** Light or dark picked in settings, or 'system' to follow the phone. Kept on this device only. */
export type AppearancePreference = Scheme | 'system';

const KEY = 'grocr.appearance';
let current: AppearancePreference = 'system';
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

function isPreference(value: unknown): value is AppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function apply(pref: AppearancePreference) {
  current = pref;
  // Native headers, tab bar, alerts and the keyboard follow the override too. Web has no
  // override, so screens there use the picked palette over the browser's own scheme.
  if (Platform.OS !== 'web') Appearance.setColorScheme?.(pref === 'system' ? 'auto' : pref);
  notify();
}

/**
 * Applies the saved appearance on start. A missing or unreadable value follows the phone. It
 * always applies, so an override left behind in Expo Go (which shares it across apps) is reset.
 */
export async function restoreAppearance() {
  let saved: string | null = null;
  try {
    saved = await readDeviceSetting(KEY);
  } catch {
    // Storage unavailable: follow the phone.
  }
  restored = true;
  apply(isPreference(saved) ? saved : current);
}

export async function setAppearancePreference(pref: AppearancePreference) {
  apply(pref);
  try {
    await writeDeviceSetting(KEY, pref);
  } catch {
    // The choice still holds for this session.
  }
}

export function useAppearancePreference() {
  return useSyncExternalStore(subscribe, () => current);
}

/** False until the saved appearance is applied; the splash stays up until then. */
export function useAppearanceRestored() {
  return useSyncExternalStore(subscribe, () => restored);
}

/** The scheme to draw the app in: the picked one, or the phone's. Read once, at the root. */
export function useResolvedScheme(): Scheme {
  const pref = useAppearancePreference();
  const system = useColorScheme();
  if (pref !== 'system') return pref;
  return system === 'dark' ? 'dark' : 'light';
}

/** Provided by the root layout; screens rendered on their own (tests) draw light. */
export const SchemeContext = createContext<Scheme>('light');

export function useScheme(): Scheme {
  return useContext(SchemeContext);
}

export function useColors(): Palette {
  return Palettes[useScheme()];
}

type NamedStyles = Parameters<typeof StyleSheet.create>[0];

/**
 * Builds a screen's styles once per scheme and returns a hook that picks the active set, so
 * style sheets can keep reading palette colors: `const useStyles = makeStyles((c) => ({...}))`.
 */
export function makeStyles<T extends NamedStyles>(
  // Typed like StyleSheet.create, so literal values such as flexDirection: 'row' stay literal.
  factory: (colors: Palette) => T & NamedStyles,
) {
  const sheets: Record<Scheme, Readonly<T>> = {
    light: StyleSheet.create(factory(Palettes.light)),
    dark: StyleSheet.create(factory(Palettes.dark)),
  };
  return function useStyles(): Readonly<T> {
    return sheets[useScheme()];
  };
}
