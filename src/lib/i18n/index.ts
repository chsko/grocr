import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import nb from './locales/nb.json';

export const resources = {
  en: { translation: en },
  nb: { translation: nb },
} as const;

export type AppLanguage = keyof typeof resources;

const NORWEGIAN_CODES = new Set(['nb', 'no', 'nn']);

/** Picks the app language from the device's preferred languages. Any Norwegian variant maps to bokmål. */
export function pickLanguage(languageCodes: (string | null | undefined)[]): AppLanguage {
  for (const code of languageCodes) {
    if (!code) continue;
    const base = code.toLowerCase().split('-')[0];
    if (NORWEGIAN_CODES.has(base)) return 'nb';
    if (base === 'en') return 'en';
  }
  return 'en';
}

export function deviceLanguage(): AppLanguage {
  return pickLanguage(getLocales().map((locale) => locale.languageCode));
}

// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
