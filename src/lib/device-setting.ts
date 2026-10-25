import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** A small setting kept on this device only (language, appearance). */
export async function readDeviceSetting(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  return await SecureStore.getItemAsync(key);
}

export async function writeDeviceSetting(key: string, value: string) {
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}
