import { act, renderHook } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { createElement } from 'react';
import { Appearance } from 'react-native';

import { Palettes, type Palette, type Scheme } from '@/constants/theme';

import {
  makeStyles,
  restoreAppearance,
  SchemeContext,
  setAppearancePreference,
  useAppearancePreference,
  useAppearanceRestored,
  useColors,
  useResolvedScheme,
} from './appearance';

const mockSystemScheme = jest.fn<'light' | 'dark' | null, []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockSystemScheme(),
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
  };
});

function wrapper(scheme: Scheme) {
  return function SchemeRoot({ children }: { children: React.ReactNode }) {
    return createElement(SchemeContext.Provider, { value: scheme }, children);
  };
}

describe('palette and styles', () => {
  test('screens get the palette of the scheme the root provides', async () => {
    expect((await renderHook(useColors, { wrapper: wrapper('dark') })).result.current).toBe(
      Palettes.dark,
    );
    expect((await renderHook(useColors, { wrapper: wrapper('light') })).result.current).toBe(
      Palettes.light,
    );
    // Without a provider (screens rendered alone) the app draws light.
    expect((await renderHook(useColors)).result.current).toBe(Palettes.light);
  });

  test('makeStyles builds one sheet per scheme', async () => {
    const useStyles = makeStyles((c) => ({ box: { backgroundColor: c.background } }));
    const dark = (await renderHook(useStyles, { wrapper: wrapper('dark') })).result.current;
    const light = (await renderHook(useStyles, { wrapper: wrapper('light') })).result.current;
    expect(dark.box.backgroundColor).toBe(Palettes.dark.background);
    expect(light.box.backgroundColor).toBe(Palettes.light.background);
  });

  test('both palettes have the same tokens', () => {
    expect(Object.keys(Palettes.dark).sort()).toEqual(Object.keys(Palettes.light).sort());
    expect(Palettes.dark.tiles).toHaveLength(Palettes.light.tiles.length);
    expect(Palettes.dark.avatars).toHaveLength(Palettes.light.avatars.length);
  });
});

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text pairs the screens use, held to WCAG AA for normal text (4.5:1).
const textPairs: [keyof Palette, keyof Palette][] = [
  ['ink', 'background'],
  ['ink', 'raised'],
  ['ink', 'surface'],
  ['muted', 'background'],
  ['muted', 'surface'],
  ['tomato', 'background'],
  ['tomato', 'raised'],
  ['danger', 'background'],
  ['onTomato', 'tomatoFill'],
  ['onTomato', 'warningFill'],
  ['saffronInk', 'saffronPill'],
  ['tomatoDeep', 'saffronSoft'],
  ['ink', 'warningSurface'],
  ['saffronInk', 'saffronSoft'],
  ['tomato', 'warningSurface'],
  ['tomato', 'saffronTint'],
  ['tomato', 'surface'],
  ['ink', 'chipSelected'],
];

describe.each(['light', 'dark'] as const)('%s palette contrast', (scheme) => {
  const c = Palettes[scheme];
  test.each(textPairs)('%s on %s is readable', (fg, bg) => {
    expect(contrast(c[fg] as string, c[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });

  // Empty grocery checkboxes are controls, so they need WCAG's 3:1 for non-text contrast.
  test.each(['background', 'surface'] as const)('checkbox stands out on %s', (bg) => {
    expect(contrast(c.checkbox, c[bg])).toBeGreaterThanOrEqual(3);
  });

  test('white initials stay readable on every avatar color', () => {
    for (const color of c.avatars) expect(contrast('#FFFFFF', color)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('appearance preference', () => {
  const setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
  beforeEach(() => setAppearancePreference('system'));

  test('a pick is applied natively, shared with every screen and saved on the device', async () => {
    const { result } = await renderHook(useAppearancePreference);
    expect(result.current).toBe('system');

    await act(() => setAppearancePreference('dark'));
    expect(result.current).toBe('dark');
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith('grocr.appearance', 'dark');

    // Back to the phone's appearance removes the override.
    await act(() => setAppearancePreference('system'));
    expect(setColorScheme).toHaveBeenLastCalledWith('auto');
  });

  test('the root follows the phone unless a scheme is picked', async () => {
    const { result, rerender } = await renderHook(useResolvedScheme);
    expect(result.current).toBe('light');
    mockSystemScheme.mockReturnValue('dark');
    await rerender({});
    expect(result.current).toBe('dark');
    mockSystemScheme.mockReturnValue(null);
    await rerender({});
    expect(result.current).toBe('light');

    await act(() => setAppearancePreference('dark'));
    expect(result.current).toBe('dark');
    mockSystemScheme.mockReturnValue('light');
    await act(() => setAppearancePreference('light'));
    expect(result.current).toBe('light');
  });

  test('restore always applies, so a stale native override is cleared', async () => {
    await SecureStore.setItemAsync('grocr.appearance', 'system');
    setColorScheme.mockClear();
    await restoreAppearance();
    expect(setColorScheme).toHaveBeenCalledWith('auto');
    expect((await renderHook(useAppearanceRestored)).result.current).toBe(true);
  });

  test('restores the saved pick and ignores junk', async () => {
    await SecureStore.setItemAsync('grocr.appearance', 'light');
    await restoreAppearance();
    expect((await renderHook(useAppearancePreference)).result.current).toBe('light');

    await SecureStore.setItemAsync('grocr.appearance', 'sepia');
    await restoreAppearance();
    expect((await renderHook(useAppearancePreference)).result.current).toBe('light');
  });
});
