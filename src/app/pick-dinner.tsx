import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Check, Close, Search } from '@/components/icons';
import { Button, Chip, Field, IconButton, Stepper, Text } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { attempt } from '@/lib/errors';
import { dayLabel, weekTitle } from '@/lib/format';
import { relativeDay } from '@/lib/relative';
import { useFamily } from '@/lib/session';
import { isLocalDate, startOfWeek, todayIn, type Weekday } from '@/lib/week';

const NOTES = ['leftovers', 'pizzaNight', 'eatingOut'] as const;

/** Plan, change or remove the dinner for one day (GRO-33). */
export default function PickDinnerScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const family = useFamily();
  const { date: dateParam } = useLocalSearchParams<{ date: string }>();
  const date = dateParam && isLocalDate(dateParam) ? dateParam : todayIn(family.timezone);
  const startDate = startOfWeek(date, family.weekStartsOn as Weekday);
  const week = useQuery(api.mealPlan.week, { groupId: family.groupId, startDate });
  const recipes = useQuery(api.recipes.list, { groupId: family.groupId });
  const setDinner = useMutation(api.mealPlan.set);
  const setServings = useMutation(api.mealPlan.setServings);
  const removeDinner = useMutation(api.mealPlan.remove);

  const existing = week?.dinners.find((d) => d.date === date);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Id<'recipes'> | null>(null);
  const [servings, setServingsState] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedId = picked ?? existing?.recipeId ?? null;
  const selected = recipes?.find((r) => r._id === selectedId);
  const currentServings =
    servings ??
    (picked === null && existing && !existing.isNote
      ? existing.servings
      : (selected?.servings ?? 4));

  const shown = useMemo(() => {
    if (!recipes) return [];
    const needle = search.trim().toLocaleLowerCase();
    if (needle) return recipes.filter((r) => r.title.toLocaleLowerCase().includes(needle));
    // Most recently cooked first; never cooked ones after, by title.
    return [...recipes].sort(
      (a, b) =>
        (b.lastCooked ?? '').localeCompare(a.lastCooked ?? '') || a.title.localeCompare(b.title),
    );
  }, [recipes, search]);

  async function save(run: () => Promise<unknown>) {
    setBusy(true);
    const ok = (await attempt(t, async () => (await run(), true))) ?? false;
    setBusy(false);
    if (ok) router.back();
  }

  function planRecipe() {
    if (!selectedId) return;
    if (existing && existing.recipeId === selectedId) {
      // Same dinner, new servings: rescale instead of replacing, so ticked lines stay put.
      return void save(() => setServings({ entryId: existing._id, servings: currentServings }));
    }
    void save(() =>
      setDinner({ groupId: family.groupId, date, recipeId: selectedId, servings: currentServings }),
    );
  }

  function planNote(text: string) {
    void save(() => setDinner({ groupId: family.groupId, date, freeText: text }));
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text variant="heading" style={{ flex: 1 }}>
            {t('pick.title', { day: dayLabel(t, date) })}
          </Text>
          <IconButton label={t('common.close')} onPress={() => router.back()}>
            <Close />
          </IconButton>
        </View>
        {existing ? (
          <View style={styles.current}>
            <Text style={{ flex: 1 }} numberOfLines={1}>
              {t('pick.current', { title: existing.title })}
            </Text>
            <Button
              kind="danger"
              title={t('pick.remove')}
              disabled={busy}
              onPress={() => void save(() => removeDinner({ entryId: existing._id }))}
            />
          </View>
        ) : null}

        <View style={styles.search}>
          <Search color={Colors.muted} size={18} />
          <Field
            value={search}
            onChangeText={setSearch}
            placeholder={t('pick.search')}
            label={undefined}
            accessibilityLabel={t('pick.search')}
            style={{ flex: 1 }}
            inputStyle={styles.searchInput}
          />
        </View>

        <Text variant="section" color={Colors.muted} style={{ marginTop: 18, marginBottom: 4 }}>
          {search ? t('pick.results') : t('pick.recipes')}
        </Text>
        {recipes && recipes.length === 0 ? (
          <Text color={Colors.muted}>{t('pick.noRecipes')}</Text>
        ) : null}
        {shown.map((r) => {
          const isSelected = r._id === selectedId;
          return (
            <Pressable
              key={r._id}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => {
                setPicked(r._id);
                setServingsState(null);
              }}
              style={[styles.recipe, isSelected && styles.recipeSelected]}>
              <View style={{ flex: 1 }}>
                <Text variant="item">{r.title}</Text>
                <Text variant="small" color={isSelected ? Colors.tomatoDeep : Colors.muted}>
                  {r.lastCooked
                    ? t('recipes.cooked', {
                        when: relativeDay(t, r.lastCooked, todayIn(family.timezone)),
                      })
                    : t('recipes.neverCooked')}
                </Text>
              </View>
              {isSelected ? <Check color={Colors.tomato} /> : null}
            </Pressable>
          );
        })}

        <Text variant="section" color={Colors.muted} style={{ marginTop: 18, marginBottom: 8 }}>
          {t('pick.orNote')}
        </Text>
        <View style={styles.chips}>
          {NOTES.map((key) => (
            <Chip
              key={key}
              title={t(`pick.notes.${key}`)}
              disabled={busy}
              onPress={() => planNote(t(`pick.notes.${key}`))}
            />
          ))}
          <Chip dashed title={t('pick.writeNote')} onPress={() => setWriting(true)} />
        </View>
        {writing ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <Field
              value={note}
              onChangeText={setNote}
              autoFocus
              placeholder={t('pick.notePlaceholder')}
              maxLength={80}
              style={{ flex: 1 }}
              returnKeyType="done"
              onSubmitEditing={() => note.trim() && planNote(note)}
            />
            <Button
              title={t('common.save')}
              disabled={!note.trim() || busy}
              onPress={() => planNote(note)}
            />
          </View>
        ) : null}
      </ScrollView>

      {selected ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.servingsRow}>
            <Text variant="item" style={{ fontSize: 16 }}>
              {t('common.servings')}
            </Text>
            <Stepper value={currentServings} onChange={setServingsState} />
          </View>
          <Button
            title={t('pick.plan', { title: selected.title })}
            loading={busy}
            onPress={planRecipe}
          />
          <Text variant="small" color={Colors.muted} style={{ textAlign: 'center' }}>
            {t('pick.footer', { count: selected.ingredientCount, week: weekTitle(t, startDate) })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  current: {
    marginTop: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: Radius.field,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  search: {
    marginTop: 10,
    paddingLeft: 14,
    borderRadius: Radius.field,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchInput: { borderWidth: 0, backgroundColor: 'transparent', minHeight: 46, fontSize: 16 },
  recipe: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    marginHorizontal: -12,
    borderRadius: 12,
  },
  recipeSelected: { backgroundColor: Colors.saffronSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    backgroundColor: Colors.background,
  },
  servingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
