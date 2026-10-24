import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import i18n, { deviceLanguage, resources, type AppLanguage } from '.';

/** The language picked in settings, or 'system' to follow the phone. Kept on this device only. */
export type LanguagePreference = AppLanguage | 'system';

const KEY = 'grocr.language';
let current: LanguagePreference = 'system';
const listeners = new Set<(pref: LanguagePreference) => void>();

function isPreference(value: unknown): value is LanguagePreference {
  return value === 'system' || (typeof value === 'string' && value in resources);
}

async function read(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
  return await SecureStore.getItemAsync(KEY);
}

async function write(value: LanguagePreference) {
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, value);
  else await SecureStore.setItemAsync(KEY, value);
}

function apply(pref: LanguagePreference) {
  current = pref;
  void i18n.changeLanguage(pref === 'system' ? deviceLanguage() : pref);
  for (const listener of listeners) listener(pref);
}

/** Applies the saved language on start. A missing or unreadable value keeps the phone's. */
export async function restoreLanguage() {
  try {
    const saved = await read();
    if (isPreference(saved) && saved !== current) apply(saved);
  } catch {
    // Storage unavailable: stay on the phone's language.
  }
}

export async function setLanguagePreference(pref: LanguagePreference) {
  apply(pref);
  try {
    await write(pref);
  } catch {
    // The choice still holds for this session.
  }
}

export function useLanguagePreference() {
  const [pref, setPref] = useState(current);
  useEffect(() => {
    listeners.add(setPref);
    return () => {
      listeners.delete(setPref);
    };
  }, []);
  return pref;
}
