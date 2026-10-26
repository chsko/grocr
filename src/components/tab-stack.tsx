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
    // No header background: on iOS 26 a background color hides the large title. The bar is the
    // system's (Liquid Glass) and the screen's own background shows through.
    headerTintColor: colors.tomato,
  };
}

/**
 * The large title of a tab's first screen. `Stack.Title` replaces the title styles of the
 * layout, so the font and color are set here.
 */
export function TabTitle({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Stack.Title
      large
      style={{ fontFamily: Fonts.bold, fontSize: 17, color: colors.ink }}
      largeStyle={{ fontFamily: Fonts.bold, color: colors.ink }}>
      {children}
    </Stack.Title>
  );
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
