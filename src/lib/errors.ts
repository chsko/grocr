import { ConvexError } from 'convex/values';
import type { TFunction } from 'i18next';
import { Alert } from 'react-native';

export function errorCode(error: unknown): string | undefined {
  if (error instanceof ConvexError && typeof error.data === 'object' && error.data !== null) {
    const code = (error.data as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

const KNOWN = new Set([
  'NAME_REQUIRED',
  'TITLE_REQUIRED',
  'ALREADY_IN_FAMILY',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_SERVINGS',
]);

/** Shows a friendly alert for a failed mutation. */
export function showError(t: TFunction, error: unknown) {
  const code = errorCode(error);
  const message =
    code && KNOWN.has(code) ? t(`errors.${code as 'NOT_FOUND'}`) : t('errors.generic');
  Alert.alert(t('errors.title'), message);
}

/** Runs a mutation and shows an alert if it fails. */
export async function attempt<T>(t: TFunction, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    showError(t, error);
    return undefined;
  }
}
