import '@/lib/i18n';
import '@/lib/web-alert';

import { BricolageGrotesque_400Regular } from '@expo-google-fonts/bricolage-grotesque/400Regular';
import { BricolageGrotesque_500Medium } from '@expo-google-fonts/bricolage-grotesque/500Medium';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Fonts, Palettes } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import {
  restoreAppearance,
  SchemeContext,
  useAppearanceRestored,
  useColors,
  useResolvedScheme,
} from '@/lib/appearance';
import { isWebSite } from '@/lib/build';
import { convex, tokenStorage } from '@/lib/convex';
import { restoreLanguage } from '@/lib/i18n/preference';
import { SessionContext } from '@/lib/session';
import { APP_ONLY_ROUTES } from '@/lib/web-site';
import { WebNoFamily, WebSignOut } from '@/components/web-only';
import { restoreShownWeek, useShownWeekRestored } from '@/lib/shown-week';
import { useForegroundUpdateCheck } from '@/lib/updates';

void restoreLanguage();
void restoreAppearance();
void restoreShownWeek();

void SplashScreen.preventAutoHideAsync();
// The splash is saffron and light screens are white, so fade rather than cut between them.
SplashScreen.setOptions({ fade: true, duration: 250 });

const themes = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: Palettes.light.background,
      card: Palettes.light.background,
      text: Palettes.light.ink,
      border: Palettes.light.border,
      primary: Palettes.light.tomato,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: Palettes.dark.background,
      card: Palettes.dark.background,
      text: Palettes.dark.ink,
      border: Palettes.dark.border,
      primary: Palettes.dark.tomato,
    },
  },
};

export default function RootLayout() {
  const scheme = useResolvedScheme();
  useEffect(() => {
    // The root view shows behind modals and while screens slide.
    void SystemUI.setBackgroundColorAsync(Palettes[scheme].background);
  }, [scheme]);
  return (
    <ConvexAuthProvider client={convex} storage={tokenStorage}>
      <SchemeContext.Provider value={scheme}>
        <ThemeProvider value={themes[scheme]}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <AppStack />
        </ThemeProvider>
      </SchemeContext.Provider>
    </ConvexAuthProvider>
  );
}

/**
 * Routes by sign-in state: signed out sees sign-in, signed in without a family sees onboarding,
 * everyone else the app. Guards drop the other screens, so the back stack never leaks across.
 */
function AppStack() {
  const { t } = useTranslation();
  const colors = useColors();
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
  });
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : 'skip');
  const appearanceRestored = useAppearanceRestored();
  const weekRestored = useShownWeekRestored();
  useForegroundUpdateCheck();
  const ready =
    fontsLoaded &&
    appearanceRestored &&
    weekRestored &&
    !isLoading &&
    (!isAuthenticated || me !== undefined);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const signedIn = isAuthenticated && me != null;
  const hasFamily = signedIn && me.family !== null;
  const header = {
    headerShown: true,
    headerShadowVisible: false,
    headerTintColor: colors.ink,
    headerTitleStyle: { fontFamily: Fonts.bold, fontSize: 17 },
    headerBackButtonDisplayMode: 'minimal' as const,
    headerTitleAlign: 'center' as const,
  };

  if (isWebSite) {
    return (
      <SessionContext.Provider value={signedIn ? me : null}>
        {/* A phone-wide column on big screens, like the app. */}
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
            {signedIn && !hasFamily ? (
              <WebNoFamily />
            ) : (
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}>
                <Stack.Screen name="index" />
                <Stack.Protected guard={!signedIn}>
                  <Stack.Screen name="sign-in" />
                </Stack.Protected>
                {/* The website (grocr.io/app) only carries the Christmas gift lists. */}
                <Stack.Protected guard={hasFamily}>
                  <Stack.Screen
                    name="gifts"
                    options={{
                      ...header,
                      title: t('gifts.title'),
                      headerLeft: () => <WebSignOut />,
                    }}
                  />
                  <Stack.Screen
                    name="gift/[id]"
                    options={{ ...header, title: t('gifts.edit.title') }}
                  />
                  <Stack.Screen
                    name="gift-recipients"
                    options={{ ...header, title: t('gifts.people_screen.title') }}
                  />
                </Stack.Protected>
                {/* Expo Router registers every route file; keep the rest of the app unreachable. */}
                <Stack.Protected guard={false}>
                  {APP_ONLY_ROUTES.map((name) => (
                    <Stack.Screen key={name} name={name} />
                  ))}
                </Stack.Protected>
              </Stack>
            )}
          </View>
        </View>
      </SessionContext.Provider>
    );
  }

  return (
    <SessionContext.Provider value={signedIn ? me : null}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
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
          <Stack.Screen name="tour" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="recipe/[id]" options={{ ...header, title: '' }} />
          <Stack.Screen
            name="recipe/edit"
            options={{ ...header, presentation: 'modal', title: t('recipeEdit.newTitle') }}
          />
          <Stack.Screen
            name="pick-dinner"
            // A plain modal: a formSheet with a flex root renders empty on iOS.
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen name="suggest-week" options={{ presentation: 'modal' }} />
          <Stack.Screen name="invite" options={{ presentation: 'modal' }} />
          <Stack.Screen name="sections" options={{ ...header, title: t('storeOrder.title') }} />
          <Stack.Screen name="items" options={{ ...header, title: t('items.title') }} />
          <Stack.Screen name="staples" options={{ ...header, title: t('staples.title') }} />
          <Stack.Screen name="gifts" options={{ ...header, title: t('gifts.title') }} />
          <Stack.Screen
            name="gift/[id]"
            options={{ ...header, presentation: 'modal', title: t('gifts.edit.title') }}
          />
          <Stack.Screen
            name="gift-recipients"
            options={{ ...header, title: t('gifts.people_screen.title') }}
          />
          <Stack.Screen name="week-start" options={{ ...header, title: t('family.weekStarts') }} />
          <Stack.Screen name="whats-new" options={{ ...header, title: t('whatsNew.title') }} />
        </Stack.Protected>
      </Stack>
    </SessionContext.Provider>
  );
}
