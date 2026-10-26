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
 * The Stack inside a tab, so screens opened from a tab stay in it with the tab bar showing and
 * each tab keeps its own history. The tab's first screen draws its own title row.
 */
export function TabStack({ children }: { children?: ReactNode }) {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      {children}
    </Stack>
  );
}
