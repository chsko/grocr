import '@/lib/i18n';

import { BricolageGrotesque_400Regular } from '@expo-google-fonts/bricolage-grotesque/400Regular';
import { BricolageGrotesque_500Medium } from '@expo-google-fonts/bricolage-grotesque/500Medium';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Colors, Fonts } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { convex, tokenStorage } from '@/lib/convex';
import { SessionContext } from '@/lib/session';

void SplashScreen.preventAutoHideAsync();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: Colors.background, primary: Colors.tomato },
};

export default function RootLayout() {
  return (
    <ConvexAuthProvider client={convex} storage={tokenStorage}>
      <ThemeProvider value={theme}>
        <StatusBar style="dark" />
        <AppStack />
      </ThemeProvider>
    </ConvexAuthProvider>
  );
}

/**
 * Routes by sign-in state: signed out sees sign-in, signed in without a family sees onboarding,
 * everyone else the app. Guards drop the other screens, so the back stack never leaks across.
 */
function AppStack() {
  const { t } = useTranslation();
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
  });
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : 'skip');
  const ready = fontsLoaded && !isLoading && (!isAuthenticated || me !== undefined);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const signedIn = isAuthenticated && me != null;
  const hasFamily = signedIn && me.family !== null;
  const header = {
    headerShown: true,
    headerShadowVisible: false,
    headerTintColor: Colors.ink,
    headerTitleStyle: { fontFamily: Fonts.bold, fontSize: 17 },
    headerBackButtonDisplayMode: 'minimal' as const,
  };

  return (
    <SessionContext.Provider value={signedIn ? me : null}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
        }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !hasFamily}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="join" options={{ ...header, title: '' }} />
        </Stack.Protected>
        <Stack.Protected guard={hasFamily}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="recipe/[id]" options={{ ...header, title: '' }} />
          <Stack.Screen
            name="recipe/edit"
            options={{ ...header, presentation: 'modal', title: t('recipeEdit.newTitle') }}
          />
          <Stack.Screen
            name="pick-dinner"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.92],
              sheetGrabberVisible: true,
            }}
          />
          <Stack.Screen name="invite" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </SessionContext.Provider>
  );
}
