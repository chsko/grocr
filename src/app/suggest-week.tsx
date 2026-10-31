import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Close, Plus, Shuffle } from '@/components/icons';
import { Button, IconButton, IconTile, Loading, RatingBadge, Text } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { firstPicks, SKIPPED, swapPick, type Picks } from '@/convex/lib/suggest';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { dayLabel, dayShort, weekTitle } from '@/lib/format';
import { fadeIn } from '@/lib/motion';
import { relativeDay } from '@/lib/relative';
import { useFamily } from '@/lib/session';
import { isLocalDate, startOfWeek, todayIn, type Weekday } from '@/lib/week';

/**
 * "Suggest a week" (GRO-69): one recipe for each empty day from today on, well rated and not had
 * recently. Each can be swapped or skipped before planning them all at once.
 */
export default function SuggestWeekScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const family = useFamily();
  const { start } = useLocalSearchParams<{ start: string }>();
  const today = todayIn(family.timezone);
  const startDate = startOfWeek(
    start && isLocalDate(start) ? start : today,
    family.weekStartsOn as Weekday,
  );
  // A new seed reshuffles; picked once per opening.
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const live = useQuery(api.mealPlan.suggestions, { groupId: family.groupId, startDate, seed });
  const planSuggested = useMutation(api.mealPlan.planSuggested);
  // The list holds still while it is open: the first answer for each seed is kept, so a rating
  // or dinner planned on another phone doesn't throw away swaps and skips, and Shuffle keeps
  // showing the old list until the new one is in. Planning skips days taken meanwhile.
  const [shown, setShown] = useState<{ seed: number; result: NonNullable<typeof live> } | null>(
    null,
  );
  if (live !== undefined && shown?.seed !== seed) setShown({ seed, result: live });
  const [state, setState] = useState<{ seed: number; picks: Picks } | null>(null);
  const [busy, setBusy] = useState(false);

  const result = shown?.result ?? live;
  if (result === undefined) return <Loading />;
  const { days, candidates } = result;
  const picks =
    state !== null && state.seed === shown?.seed
      ? state.picks
      : firstPicks(days, candidates.length);
  const setPicks = (next: Picks) => {
    void Haptics.selectionAsync().catch(() => {});
    setState({ seed: shown?.seed ?? seed, picks: next });
  };
  const kept = days.flatMap((date) => {
    const index = picks[date];
    return index === undefined || index === SKIPPED
      ? []
      : [{ date, recipeId: candidates[index].recipeId }];
  });
  const free = candidates.length > kept.length;

  async function plan() {
    setBusy(true);
    const ok =
      (await attempt(t, async () => {
        const planned = await planSuggested({ groupId: family.groupId, dinners: kept });
        // The list holds still while open, so someone may have planned a day meanwhile.
        if (planned < kept.length) {
          Alert.alert(t('suggest.someTaken', { count: kept.length - planned }));
        } else {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        return true;
      })) ?? false;
    setBusy(false);
    if (ok) router.back();
  }

  const empty =
    days.length === 0 ? t('suggest.noDays') : candidates.length === 0 ? t('suggest.noRecipes') : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Rows show at once when the screen opens; a swapped, skipped or shuffled row then fades
          its new recipe in, so it is clear which day changed. */}
      <LayoutAnimationConfig skipEntering>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" color={colors.muted}>
                {weekTitle(t, startDate)}
              </Text>
              <Text variant="heading">{t('suggest.title')}</Text>
            </View>
            <IconButton label={t('common.close')} onPress={() => router.back()}>
              <Close />
            </IconButton>
          </View>

          {empty ? (
            <Text color={colors.muted} style={{ marginTop: 12 }}>
              {empty}
            </Text>
          ) : (
            <>
              <Text color={colors.muted} style={{ marginTop: 6, marginBottom: 14 }}>
                {t('suggest.intro')}
              </Text>
              {days.map((date, row) => {
                const index = picks[date];
                const recipe =
                  index === undefined || index === SKIPPED ? undefined : candidates[index];
                const day = dayLabel(t, date);
                return (
                  <View key={date} style={[styles.day, recipe ? null : styles.daySkipped]}>
                    <View style={styles.dateTile}>
                      <Text
                        variant="small"
                        color={colors.muted}
                        style={{ fontFamily: Fonts.semibold, fontSize: 11 }}>
                        {dayShort(t, date).toLocaleUpperCase()}
                      </Text>
                      <Text variant="item" style={{ fontFamily: Fonts.bold, fontSize: 19 }}>
                        {Number(date.slice(8))}
                      </Text>
                    </View>
                    <Animated.View
                      key={recipe?.recipeId ?? (index === SKIPPED ? 'skipped' : 'open')}
                      entering={fadeIn}
                      style={styles.dayBody}>
                      {recipe ? (
                        <>
                          <IconTile
                            icon={recipe.icon}
                            color={colors.tiles[row % colors.tiles.length]}
                            size={34}
                          />
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text variant="item" numberOfLines={1}>
                              {recipe.title}
                            </Text>
                            <View style={styles.meta}>
                              <RatingBadge average={recipe.rating} />
                              <Text variant="small" color={colors.muted} numberOfLines={1}>
                                {recipe.lastCooked
                                  ? t('recipes.cooked', {
                                      when: relativeDay(t, recipe.lastCooked, today),
                                    })
                                  : t('suggest.newRecipe')}
                              </Text>
                            </View>
                          </View>
                          {free ? (
                            <IconButton
                              label={t('suggest.swap', { day })}
                              onPress={() => setPicks(swapPick(picks, date, candidates.length))}>
                              <Shuffle size={20} color={colors.tomato} />
                            </IconButton>
                          ) : null}
                          <IconButton
                            label={t('suggest.skip', { day })}
                            onPress={() => setPicks({ ...picks, [date]: SKIPPED })}>
                            <Close size={20} color={colors.muted} />
                          </IconButton>
                        </>
                      ) : (
                        <>
                          <Text color={colors.muted} style={{ flex: 1 }}>
                            {!free
                              ? t('suggest.noneLeft')
                              : index === SKIPPED
                                ? t('suggest.skipped')
                                : t('suggest.open')}
                          </Text>
                          {free ? (
                            <IconButton
                              label={t('suggest.bringBack', { day })}
                              onPress={() => setPicks(swapPick(picks, date, candidates.length))}>
                              <Plus size={20} color={colors.tomato} />
                            </IconButton>
                          ) : null}
                        </>
                      )}
                    </Animated.View>
                  </View>
                );
              })}
              {candidates.length > days.length ? (
                <Button
                  kind="ghost"
                  title={t('suggest.shuffle')}
                  icon={<Shuffle size={18} color={colors.tomato} />}
                  style={{ marginTop: 6 }}
                  onPress={() => {
                    void Haptics.selectionAsync().catch(() => {});
                    setSeed(seed + 1);
                  }}
                />
              ) : null}
            </>
          )}
        </ScrollView>
      </LayoutAnimationConfig>

      {kept.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Button
            title={t('suggest.plan', { count: kept.length })}
            loading={busy}
            onPress={() => void plan()}
          />
          <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
            {t('suggest.footer', { week: weekTitle(t, startDate) })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  day: {
    minHeight: 62,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 7,
    paddingLeft: 7,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  daySkipped: { borderStyle: 'dashed', borderColor: colors.dashed },
  dateTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.background,
  },
}));
