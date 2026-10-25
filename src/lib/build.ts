import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Whether this copy of the app may offer the dev deployment's test users: Expo Go, dev builds
 * and the web export used for click-through tests. TestFlight and store builds talk to the same
 * backend for now but never show them.
 */
export function isDevBuild(): boolean {
  return (
    __DEV__ ||
    Platform.OS === 'web' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  );
}
