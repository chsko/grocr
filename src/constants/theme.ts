/**
 * Design tokens from the chosen direction, toned-down "A Market day" (design canvas
 * "All screens (toned-down A)"): white ground, Bricolage Grotesque, tomato for actions and
 * checks, saffron only as soft tints. Light only for now (app.json userInterfaceStyle).
 */

export const Colors = {
  background: '#FFFFFF',
  ink: '#1E1A16',
  muted: '#5C5249',
  tomato: '#B8361E',
  tomatoDeep: '#7A2414',
  danger: '#B03A1F',
  saffronTint: '#FFF6DC',
  saffronSoft: '#FFF0C2',
  saffronPill: '#FFE59A',
  saffronInk: '#6B4F00',
  herb: '#2F8F4E',
  surface: '#F7F3EE',
  warningSurface: '#FBEDE7',
  border: '#EEE7DF',
  borderStrong: '#E6DFD6',
  divider: '#F3EDE6',
  dashed: '#D9D2C9',
  checkbox: '#B5ABA0',
  overlay: 'rgba(20, 24, 19, 0.45)',
} as const;

/** Soft tiles behind recipe initials, picked by position. */
export const TileColors = ['#FFF0C2', '#F6E3DC', '#E2EAF2', '#F3EBD6'] as const;

/** Member avatar colors, picked by position. */
export const AvatarColors = ['#B8361E', '#2F5D8A', '#A3462B', '#2F8F4E', '#6B4F00'] as const;

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
