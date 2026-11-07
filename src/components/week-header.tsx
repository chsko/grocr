import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';

import { ChevronLeft, ChevronRight } from '@/components/icons';
import { IconButton, Text } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/appearance';
import { weekSpan, weekTitle } from '@/lib/format';
import { shoppingWeekIsNext, type ShownWeek } from '@/lib/shown-week';
import { addDays } from '@/lib/week';

/** "This week", "Next week", "In 3 weeks", "2 weeks ago": every week gets one (GRO-72). */
export function relativeWeek(t: TFunction, offset: number) {
  if (offset === 0) return t('week.thisWeek');
  if (offset === 1) return t('week.nextWeek');
  if (offset === -1) return t('week.lastWeek');
  return offset > 1 ? t('week.inWeeks', { count: offset }) : t('week.weeksAgo', { count: -offset });
}

/**
 * The week being shown, with a look for each kind of week so it is hard to be in the wrong
 * one: past weeks are grey, this week is a saffron band, future weeks are outlined. Off the
 * shopping week, a link goes back to it.
 */
export function WeekHeader({
  shown,
  compact,
  direction,
  onStep,
}: {
  shown: ShownWeek;
  /** The Groceries tab's smaller band, under its own title. */
  compact?: boolean;
  /** Which way the last step went, so the week slides in from that side. */
  direction?: -1 | 1 | null;
  /** Told before the week changes by an arrow or the jump link. */
  onStep?: (by: -1 | 1, to: string) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const { startDate, kind, offset, shoppingWeek, setStartDate } = shown;
  const entering =
    direction === null || direction === undefined
      ? undefined
      : (direction > 0 ? FadeInRight : FadeInLeft).duration(220);
  const step = (by: -1 | 1) => {
    const to = addDays(startDate, 7 * by);
    onStep?.(by, to);
    setStartDate(to);
  };
  const jump =
    startDate === shoppingWeek
      ? null
      : shoppingWeekIsNext(shown)
        ? t('week.goToNext')
        : t('week.goToThis');
  const titleColor = kind === 'past' ? colors.muted : colors.ink;

  return (
    <View
      testID={`week-header-${kind}`}
      style={[
        styles.band,
        compact && styles.bandCompact,
        kind === 'this' && styles.bandThis,
        kind === 'past' && styles.bandPast,
        kind === 'future' && styles.bandFuture,
      ]}>
      <View style={styles.topRow}>
        <Animated.View key={startDate} entering={entering} style={styles.titles}>
          <Text
            variant="label"
            color={
              kind === 'this' ? colors.saffronInk : kind === 'past' ? colors.muted : colors.ink
            }
            style={[
              styles.pill,
              kind === 'this' && styles.pillThis,
              kind === 'past' && styles.pillPast,
              kind === 'future' && styles.pillFuture,
            ]}>
            {relativeWeek(t, offset)}
          </Text>
          <Text
            variant={compact ? 'item' : 'display'}
            color={titleColor}
            style={compact ? { fontFamily: Fonts.bold, fontSize: 19 } : undefined}>
            {compact
              ? `${weekTitle(t, startDate)} · ${weekSpan(t, startDate)}`
              : weekTitle(t, startDate)}
          </Text>
        </Animated.View>
        <View style={styles.arrows}>
          <IconButton
            outlined
            label={t('week.previous')}
            onPress={() => step(-1)}
            style={compact && styles.arrowCompact}>
            <ChevronLeft size={20} color={titleColor} />
          </IconButton>
          <IconButton
            outlined
            label={t('week.next')}
            onPress={() => step(1)}
            style={compact && styles.arrowCompact}>
            <ChevronRight size={20} color={titleColor} />
          </IconButton>
        </View>
      </View>
      {/* The bottom line is always there, so the band keeps its height whichever week it is. */}
      <View style={styles.bottomRow}>
        {compact ? (
          <View />
        ) : (
          <Text color={colors.muted} style={{ fontSize: 15 }}>
            {weekSpan(t, startDate)}
          </Text>
        )}
        {jump ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onStep?.(startDate < shoppingWeek ? 1 : -1, shoppingWeek);
              setStartDate(shoppingWeek);
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.jump, pressed && { opacity: 0.6 }]}>
            {startDate > shoppingWeek ? <ChevronLeft color={colors.tomato} size={16} /> : null}
            <Text variant="label" color={colors.tomato}>
              {jump}
            </Text>
            {startDate < shoppingWeek ? <ChevronRight color={colors.tomato} size={16} /> : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  // Every kind has a 2pt border (transparent where it does not show), so they line up.
  band: {
    borderRadius: Radius.card,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 14,
    gap: 2,
  },
  bandCompact: { paddingTop: 8, paddingBottom: 6, paddingHorizontal: 12 },
  bandThis: { backgroundColor: colors.saffronSoft, borderColor: colors.saffronPill },
  bandPast: { backgroundColor: colors.surface, borderColor: colors.surface },
  // Solid, so it does not read as one of the dashed empty days below it.
  bandFuture: { borderColor: colors.borderStrong },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titles: { gap: 4, flex: 1 },
  arrows: { flexDirection: 'row', gap: 6 },
  arrowCompact: { width: 38, height: 38 },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillThis: { backgroundColor: colors.saffronPill },
  pillPast: { backgroundColor: colors.background, borderColor: colors.borderStrong },
  pillFuture: { borderColor: colors.ink },
  bottomRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jump: { flexDirection: 'row', alignItems: 'center', gap: 2 },
}));
