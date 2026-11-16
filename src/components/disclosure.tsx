import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { ChevronRight } from '@/components/icons';
import { Text } from '@/components/ui';
import { useColors } from '@/lib/appearance';

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

/** "Fold all" while any group is open, "Open all" once every group is shut. */
export function FoldAll({
  allClosed,
  onPress,
}: {
  allClosed: boolean;
  onPress: (close: boolean) => void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => onPress(!allClosed)}
      style={({ pressed }) => [{ paddingVertical: 8 }, pressed && { opacity: 0.6 }]}>
      <Text variant="small" color={colors.tomato}>
        {allClosed ? t('gifts.openAll') : t('gifts.closeAll')}
      </Text>
    </Pressable>
  );
}
