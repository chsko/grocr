import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';

import { Basket, ChevronLeft, ChevronRight, Plus } from '@/components/icons';
import { IconButton, IconTile, TabScreen, Text } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { DEFAULT_ICON } from '@/convex/lib/recipeIcons';
import { makeStyles, useColors } from '@/lib/appearance';
import { dayShort, weekSpan, weekTitle } from '@/lib/format';
import { useFamily } from '@/lib/session';
import { addDays, defaultGroceryWeek, startOfWeek, todayIn, type Weekday } from '@/lib/week';

/** One dinner per day for a calendar week (GRO-32). Tapping a day plans or changes it. */
export default function WeekScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const family = useFamily();
  const weekStartsOn = family.weekStartsOn as Weekday;
  const today = todayIn(family.timezone);
  const thisWeek = startOfWeek(today, weekStartsOn);
  // From Friday the family plans and shops for next week, so open on that.
  const [startDate, setStartDate] = useState(
    () => defaultGroceryWeek(today, weekStartsOn).startDate,
  );
  const week = useQuery(api.mealPlan.week, { groupId: family.groupId, startDate });
  // Keep the neighbouring weeks subscribed so stepping to them shows data at once instead of
  // a frame of empty days.
  useQuery(api.mealPlan.week, { groupId: family.groupId, startDate: addDays(startDate, -7) });
  useQuery(api.mealPlan.week, { groupId: family.groupId, startDate: addDays(startDate, 7) });
  // Which way the last step went, so the new week slides in from that side. None on first show.
  const [direction, setDirection] = useState<-1 | 1 | null>(null);
  const step = (by: -1 | 1) => {
    setDirection(by);
    setStartDate(addDays(startDate, 7 * by));
  };
  // A short fade and nudge; Reanimated skips it when the system asks for reduced motion.
  const entering =
    direction === null ? undefined : (direction > 0 ? FadeInRight : FadeInLeft).duration(220);

  const offset = Math.round(
    (Date.parse(startDate) - Date.parse(thisWeek)) / (7 * 24 * 3600 * 1000),
  );
  const relative =
    offset === 0
      ? t('week.thisWeek')
      : offset === 1
        ? t('week.nextWeek')
        : offset === -1
          ? t('week.lastWeek')
          : null;
  const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  return (
    <TabScreen>
      <View style={styles.header}>
        <Animated.View key={startDate} entering={entering} style={{ gap: 4, flex: 1 }}>
          {/* The pill's line is always there so the header keeps its height on far weeks. */}
          {relative ? (
            <Text variant="label" color={colors.saffronInk} style={styles.pill}>
              {relative}
            </Text>
          ) : (
            <View style={styles.pillSpace} />
          )}
          <Text variant="display">{weekTitle(t, startDate)}</Text>
          <Text color={colors.muted} style={{ fontSize: 15 }}>
            {weekSpan(t, startDate)}
          </Text>
        </Animated.View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <IconButton outlined label={t('week.previous')} onPress={() => step(-1)}>
            <ChevronLeft size={20} />
          </IconButton>
          <IconButton outlined label={t('week.next')} onPress={() => step(1)}>
            <ChevronRight size={20} />
          </IconButton>
        </View>
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
                pressed && { opacity: 0.7 },
              ]}>
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

      {week && week.openLines > 0 ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.navigate({ pathname: '/groceries', params: { start: startDate } })}
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
  header: {
    paddingTop: 24,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: colors.saffronSoft,
    overflow: 'hidden',
    fontSize: 13,
  },
  // Same height as the pill: label line height plus its vertical padding.
  pillSpace: { height: 24 },
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
  dateTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateTileToday: { backgroundColor: colors.saffronPill },
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
