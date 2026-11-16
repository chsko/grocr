import { Platform, useWindowDimensions } from 'react-native';

/** The website on a wide screen (laptop or desktop), where screens spread into columns. */
export const DESKTOP_MIN_WIDTH = 960;

export function useDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}
