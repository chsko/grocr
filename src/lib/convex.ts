import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) {
  throw new Error('EXPO_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` to create .env.local.');
}

export const convex = new ConvexReactClient(url, { unsavedChangesWarning: false });

/** Convex Auth tokens live in the device keychain/keystore. */
export const tokenStorage =
  Platform.OS === 'web'
    ? undefined
    : {
        getItem: SecureStore.getItemAsync,
        setItem: SecureStore.setItemAsync,
        removeItem: SecureStore.deleteItemAsync,
      };
