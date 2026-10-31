import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/lib/appearance';

/**
 * A saffron wash behind something that just arrived (a grocery line, a planned dinner) that
 * fades away, so the eye finds what changed. Place it first inside the row; it fills the row
 * unless `style` says otherwise. It is only a fade, so it plays with Reduce Motion on too.
 * Key it by what it marks so it plays once per arrival.
 */
export function Highlight({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withDelay(
      700,
      withTiming(0, { duration: 900, reduceMotion: ReduceMotion.Never }),
      ReduceMotion.Never,
    );
  }, [opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      testID="added-flash"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.saffronSoft }, style, fade]}
    />
  );
}
