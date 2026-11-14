import Animated, { useReducedMotion } from 'react-native-reanimated';

import { ChevronRight } from '@/components/icons';

/** The chevron of a group that folds open: it turns a quarter instead of swapping icons. */
export function Disclosure({ open, color }: { open: boolean; color?: string }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      style={{
        transform: [{ rotate: open ? '90deg' : '0deg' }],
        transitionProperty: 'transform',
        transitionDuration: reduced ? 0 : 150,
        transitionTimingFunction: 'ease-out',
      }}>
      <ChevronRight size={16} strokeWidth={2.2} color={color} />
    </Animated.View>
  );
}
