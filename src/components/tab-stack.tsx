import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { Fonts } from '@/constants/theme';
import { useColors } from '@/lib/appearance';

/** The native header for screens pushed over a list: a plain back chevron and a bold title. */
export function useHeaderOptions() {
  const colors = useColors();
  return {
    headerShown: true,
    headerShadowVisible: false,
    headerTintColor: colors.ink,
    headerTitleStyle: { fontFamily: Fonts.bold, fontSize: 17 },
    headerBackButtonDisplayMode: 'minimal' as const,
  };
}

/**
 * The native large title on a tab's first screen: big on top, shrinking into the bar as the list
 * scrolls (iOS). The screen sets the text with `Stack.Title`.
 */
function useLargeTitleOptions() {
  const colors = useColors();
  return {
    headerShown: true,
    headerLargeTitleEnabled: true,
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    headerLargeStyle: { backgroundColor: colors.background },
    headerTintColor: colors.tomato,
    headerTitleStyle: { fontFamily: Fonts.bold, fontSize: 17, color: colors.ink },
    headerLargeTitleStyle: { fontFamily: Fonts.bold, color: colors.ink },
  };
}

/**
 * The Stack inside a tab, so screens opened from a tab stay in it with the tab bar showing and
 * each tab keeps its own history. With `largeTitle` the first screen gets the native header;
 * otherwise it draws its own title row.
 */
export function TabStack({ children, largeTitle }: { children?: ReactNode; largeTitle?: boolean }) {
  const colors = useColors();
  const largeTitleOptions = useLargeTitleOptions();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" options={largeTitle ? largeTitleOptions : undefined} />
      {children}
    </Stack>
  );
}
