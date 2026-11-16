import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
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

/**
 * A slim line above the groups: how many there are, and "Fold all" while any is open or
 * "Open all" once every one is shut. It sits with the groups it folds, never by the search.
 */
export function FoldAll({
  count,
  allClosed,
  onPress,
}: {
  /** Groups on screen. */
  count: number;
  allClosed: boolean;
  onPress: (close: boolean) => void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center' }}>
      <Text variant="small" color={colors.muted} style={{ flex: 1 }}>
        {t('gifts.groupCount', { count })}
      </Text>
      <Pressable
        accessibilityRole="button"
        hitSlop={10}
        onPress={() => onPress(!allClosed)}
        style={({ pressed }) => [{ paddingVertical: 6 }, pressed && { opacity: 0.6 }]}>
        <Text variant="label" color={colors.tomato}>
          {allClosed ? t('gifts.openAll') : t('gifts.closeAll')}
        </Text>
      </Pressable>
    </View>
  );
}
