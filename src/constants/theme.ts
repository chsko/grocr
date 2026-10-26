/**
 * Design tokens from the chosen direction, toned-down "A Market day" (design canvas
 * "All screens (toned-down A)"): white ground, Bricolage Grotesque, tomato for actions and
 * checks, saffron only as soft tints. The dark palette keeps the same roles on a warm
 * near-black ground: tomato is lifted so text and icons stay readable, and the saffron tints
 * become dim warm surfaces. Screens read the active palette with `useColors()`.
 */

const light = {
  background: '#FFFFFF',
  /** Sheets, popups and white cards that sit above the background. */
  raised: '#FFFFFF',
  ink: '#1E1A16',
  muted: '#5C5249',
  /** Tomato for text, icons and borders. */
  tomato: '#B8361E',
  /** Tomato behind white text: buttons, checked boxes, the logo bag. */
  tomatoFill: '#B8361E',
  /** Text and icons on a tomato fill. */
  onTomato: '#FFFFFF',
  tomatoDeep: '#7A2414',
  danger: '#B03A1F',
  saffronTint: '#FFF6DC',
  saffronSoft: '#FFF0C2',
  saffronPill: '#FFE59A',
  saffronInk: '#6B4F00',
  /** A picked chip (unit, section). */
  chipSelected: '#FFF0C2',
  herb: '#2F8F4E',
  surface: '#F7F3EE',
  warningSurface: '#FBEDE7',
  /** The carry-over button on the warning surface. */
  warningFill: '#A3462B',
  border: '#EEE7DF',
  borderStrong: '#E6DFD6',
  divider: '#F3EDE6',
  dashed: '#D9D2C9',
  /** Empty checkboxes, placeholders and disabled icons; 3:1 on background and surface. */
  checkbox: '#958A7F',
  overlay: 'rgba(20, 24, 19, 0.45)',
  /** Soft tiles behind recipe icons, picked by position. */
  tiles: ['#FFF0C2', '#F6E3DC', '#E2EAF2', '#F3EBD6'],
  /** Member avatar colors (white initial on top), picked by position. */
  avatars: ['#B8361E', '#2F5D8A', '#A3462B', '#277A42', '#6B4F00'],
};

export type Palette = { [K in keyof typeof light]: (typeof light)[K] };
export type Scheme = 'light' | 'dark';

const dark: Palette = {
  background: '#17130F',
  raised: '#2E2620',
  ink: '#F5EEE6',
  muted: '#B3A89C',
  tomato: '#EC7458',
  tomatoFill: '#C9402A',
  onTomato: '#FFFFFF',
  tomatoDeep: '#F4A08A',
  danger: '#F07A5E',
  saffronTint: '#2A2216',
  saffronSoft: '#3A2E16',
  saffronPill: '#5A4718',
  saffronInk: '#F2CC6B',
  chipSelected: '#5A4718',
  herb: '#5CB97A',
  surface: '#221D18',
  warningSurface: '#3A211A',
  warningFill: '#B5503A',
  border: '#2E2722',
  borderStrong: '#3B332C',
  divider: '#26201B',
  dashed: '#4A4038',
  checkbox: '#8A7F74',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tiles: ['#3A2E16', '#3A2620', '#1F2A36', '#332B1C'],
  avatars: ['#C9402A', '#3A6D9C', '#B5503A', '#277A42', '#8A6A12'],
};

export const Palettes: Record<Scheme, Palette> = { light, dark };

export const Fonts = {
  regular: 'BricolageGrotesque_400Regular',
  medium: 'BricolageGrotesque_500Medium',
  semibold: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  field: 12,
  button: 14,
  card: 18,
  pill: 999,
} as const;
