import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * A web export built for click-through tests and screenshots: the whole app plus the dev
 * deployment's test users. The public website (grocr.io/app) is built without it.
 */
const webTesting = process.env.EXPO_PUBLIC_GROCR_WEB_TESTING === 'enabled';

/**
 * Whether this copy of the app may offer the dev deployment's test users: Expo Go, dev builds
 * and a web testing export. TestFlight, store builds and the public website never show them.
 */
export function isDevBuild(): boolean {
  if (__DEV__) return true;
  if (Platform.OS === 'web') return webTesting;
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** The public website, which only carries the Christmas gift lists (see app/_layout.tsx). */
export const isWebSite = Platform.OS === 'web' && !webTesting;
