import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';

import { Highlight } from '@/components/highlight';
import { Basket, ChevronRight, Plus, Sparkle } from '@/components/icons';
import { Button, IconTile, TabScreen, Text } from '@/components/ui';
import { WeekHeader } from '@/components/week-header';
import { Fonts } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { DEFAULT_ICON } from '@/convex/lib/recipeIcons';
import { makeStyles, useColors } from '@/lib/appearance';
import { dayShort } from '@/lib/format';
import { useFreshIds } from '@/lib/fresh-ids';
import { useFamily } from '@/lib/session';
import { useShownWeek } from '@/lib/shown-week';
import { addDays } from '@/lib/week';

/** One dinner per day for a calendar week (GRO-32). Tapping a day plans or changes it. */
export default function WeekScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const family = useFamily();
  // One week for Week and Groceries, remembered on this device (GRO-72).
  const shown = useShownWeek(family);
  const { startDate, today } = shown;
  const week = useQuery(api.mealPlan.week, { groupId: family.groupId, startDate });
  // Keep the neighbouring weeks subscribed so stepping to them shows data at once instead of
  // a frame of empty days.
  useQuery(api.mealPlan.week, { groupId: family.groupId, startDate: addDays(startDate, -7) });
  useQuery(api.mealPlan.week, { groupId: family.groupId, startDate: addDays(startDate, 7) });
  // Which way the last step went, so the new week slides in from that side. None on first show.
  // Kept with the week it led to, so a week changed from elsewhere (the Groceries tab, a new
  // week starting) does not slide in from a stale side.
  const [lastStep, setLastStep] = useState<{ by: -1 | 1; to: string } | null>(null);
  const direction = lastStep?.to === startDate ? lastStep.by : null;
  // A short fade and nudge; Reanimated skips it when the system asks for reduced motion.
  const entering =
    direction === null ? undefined : (direction > 0 ? FadeInRight : FadeInLeft).duration(220);

  const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  // A dinner planned or changed while the week is on screen (here, in Suggest a week, or by
  // another member) gets a saffron wash, so coming back from the picker shows what changed.
  const dinnerKey = (d: { _id: string; recipeId: string | null; title: string }) =>
    `${d._id}:${d.recipeId ?? d.title}`;
  const freshDinners = useFreshIds(startDate, week?.dinners.map(dinnerKey));
  // Suggestions fill days from today on that have no dinner yet (GRO-69).
  const canSuggest =
    week !== undefined && days.some((d) => d >= today && !week.dinners.some((x) => x.date === d));

  return (
    <TabScreen>
      <View style={styles.header}>
        <WeekHeader
          shown={shown}
          direction={direction}
          onStep={(by, to) => setLastStep({ by, to })}
        />
      </View>

      <Animated.View key={startDate} entering={entering} style={{ gap: 8 }}>
        {days.map((date, index) => {
          const dinner = week?.dinners.find((d) => d.date === date);
          const [, , dd] = date.split('-');
          return (
            <Pressable
              key={date}
              onPress={() => router.push({ pathname: '/pick-dinner', params: { date } })}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.day,
                dinner || !week ? null : styles.dayEmpty,
                date === today && styles.dayToday,
                // Days already gone are faded, so where "now" is shows at a glance.
                date < today && styles.dayGone,
                pressed && { opacity: 0.7 },
              ]}>
              {dinner && freshDinners.has(dinnerKey(dinner)) ? (
                <Highlight key={dinnerKey(dinner)} style={styles.flash} />
              ) : null}
              <View style={[styles.dateTile, date === today && styles.dateTileToday]}>
                <Text
                  variant="small"
                  // Muted is too faint on the saffron tile in dark mode.
                  color={date === today ? colors.ink : colors.muted}
                  style={{ fontFamily: Fonts.semibold, fontSize: 11 }}>
                  {dayShort(t, date).toLocaleUpperCase()}
                </Text>
                <Text variant="item" style={{ fontFamily: Fonts.bold, fontSize: 19 }}>
                  {Number(dd)}
                </Text>
              </View>
              {dinner ? (
                <>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text variant="item" numberOfLines={1}>
                      {dinner.title}
                    </Text>
                    <Text variant="small" color={colors.muted}>
                      {dinner.isNote
                        ? t('week.note')
                        : t('week.serves', { count: dinner.servings })}
                    </Text>
                  </View>
                  {dinner.isNote ? null : (
                    <IconTile
                      icon={dinner.icon ?? DEFAULT_ICON}
                      color={colors.tiles[index % colors.tiles.length]}
                      size={30}
                    />
                  )}
                </>
              ) : week ? (
                // Quiet on purpose: a mostly empty week would otherwise be a column of red.
                <View style={styles.addDinner}>
                  <Plus color={colors.tomato} size={18} strokeWidth={2.2} />
                  <Text variant="item" color={colors.muted} style={{ fontSize: 16 }}>
                    {t('week.addDinner')}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Animated.View>

      {canSuggest ? (
        <Button
          kind="ghost"
          title={t('week.suggest')}
          icon={<Sparkle size={20} color={colors.tomato} />}
          style={{ marginTop: 10 }}
          onPress={() => router.push({ pathname: '/suggest-week', params: { start: startDate } })}
        />
      ) : null}

      {week && week.openLines > 0 ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.navigate('/groceries')}
          style={({ pressed }) => [styles.banner, pressed && { opacity: 0.8 }]}>
          <Basket color={colors.tomato} size={20} />
          <Text variant="item" style={{ flex: 1, fontSize: 16 }}>
            {t('week.groceryBanner', { count: week.openLines })}
          </Text>
          <ChevronRight color={colors.tomato} size={18} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </TabScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { paddingTop: 16, paddingBottom: 14 },
  // The three day styles differ in border width, so each trims its padding by the extra
  // border to keep the date tile and text in the same place whichever style a day has.
  day: {
    minHeight: 62,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 7,
    paddingLeft: 7,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dayEmpty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
    paddingVertical: 6.5,
    paddingLeft: 6.5,
    paddingRight: 13.5,
  },
  // Today is marked in saffron, so tomato stays the colour of actions.
  dayToday: {
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: colors.saffronPill,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 13,
  },
  flash: { borderRadius: 15 },
  dateTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateTileToday: { backgroundColor: colors.saffronPill },
  dayGone: { opacity: 0.5 },
  addDinner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  banner: {
    marginTop: 16,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: colors.saffronTint,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
}));
