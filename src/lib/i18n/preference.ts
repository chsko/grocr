import { useSyncExternalStore } from 'react';

import { readDeviceSetting, writeDeviceSetting } from '@/lib/device-setting';

import i18n, { deviceLanguage, resources, type AppLanguage } from '.';

/** The language picked in settings, or 'system' to follow the phone. Kept on this device only. */
export type LanguagePreference = AppLanguage | 'system';

const KEY = 'grocr.language';
let current: LanguagePreference = 'system';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isPreference(value: unknown): value is LanguagePreference {
  return value === 'system' || (typeof value === 'string' && value in resources);
}

function apply(pref: LanguagePreference) {
  current = pref;
  void i18n.changeLanguage(pref === 'system' ? deviceLanguage() : pref);
  for (const listener of listeners) listener();
}

/** Applies the saved language on start. A missing or unreadable value keeps the phone's. */
export async function restoreLanguage() {
  try {
    const saved = await readDeviceSetting(KEY);
    if (isPreference(saved) && saved !== current) apply(saved);
  } catch {
    // Storage unavailable: stay on the phone's language.
  }
}

export async function setLanguagePreference(pref: LanguagePreference) {
  apply(pref);
  try {
    await writeDeviceSetting(KEY, pref);
  } catch {
    // The choice still holds for this session.
  }
}

export function useLanguagePreference() {
  return useSyncExternalStore(subscribe, () => current);
}
