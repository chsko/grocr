import '@/lib/i18n';

import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { convex, tokenStorage } from '@/lib/convex';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ConvexAuthProvider client={convex} storage={tokenStorage}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </ConvexAuthProvider>
  );
}
