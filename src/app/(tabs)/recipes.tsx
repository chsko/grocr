import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';

import { Plus, Search } from '@/components/icons';
import {
  Button,
  IconButton,
  IconTile,
  IdeaPill,
  QuietField,
  RatingBadge,
  TabScreen,
  Text,
} from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { normalizeName } from '@/convex/lib/catalog';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { dayShort } from '@/lib/format';
import { relativeDay } from '@/lib/relative';
import { useFamily } from '@/lib/session';
import { addDays, startOfWeek, todayIn, type Weekday } from '@/lib/week';

/** The family's recipes with search (GRO-30). Archived ones are one tap away. */
export default function RecipesScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const family = useFamily();
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [newIdea, setNewIdea] = useState('');
  const createIdea = useMutation(api.recipes.createIdea);
  const recipes = useQuery(api.recipes.list, { groupId: family.groupId, archived });
  const archivedCount =
    useQuery(api.recipes.list, { groupId: family.groupId, archived: true })?.length ?? 0;

  const today = todayIn(family.timezone);
  // Show the planned day only when it is within this or next week.
  const horizon = addDays(startOfWeek(today, family.weekStartsOn as Weekday), 13);
  const needle = search.trim().toLocaleLowerCase();
  const shown = (recipes ?? []).filter((r) => r.title.toLocaleLowerCase().includes(needle));
  // Dinner ideas (#106) get their own section above the recipes.
  const shownIdeas = shown.filter((r) => r.isIdea);
  const shownRecipes = shown.filter((r) => !r.isIdea);
  const hasAny = (recipes?.length ?? 0) > 0;
  // The Ideas heading and "+ New idea" show in the full list, and while a search matches ideas.
  const ideasHeading = !archived && (shownIdeas.length > 0 || (hasAny && !needle));

  async function addIdea() {
    if (!newIdea.trim()) return;
    // A recipe of that name already exists: open it instead of making an idea twin.
    const same = recipes?.find((r) => normalizeName(r.title) === normalizeName(newIdea));
    if (same) {
      setNewIdea('');
      router.push({ pathname: '/recipe/[id]', params: { id: same._id } });
      return;
    }
    const id = await attempt(t, () => createIdea({ groupId: family.groupId, title: newIdea }));
    if (id === undefined) return;
    setNewIdea('');
    router.push({ pathname: '/recipe/[id]', params: { id } });
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text variant="title">{archived ? t('recipes.archivedTitle') : t('recipes.title')}</Text>
        {archived ? null : (
          <IconButton onPress={() => router.push('/recipe/edit')} filled label={t('recipes.new')}>
            <Plus color={colors.onTomato} strokeWidth={2.2} />
          </IconButton>
        )}
      </View>
      <View style={styles.search}>
        <Search color={colors.muted} size={18} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('recipes.search', { count: recipes?.length ?? 0 })}
          placeholderTextColor={colors.checkbox}
          accessibilityLabel={t('recipes.searchLabel')}
          style={styles.searchInput}
        />
      </View>
    </View>
  );

  function renderRow(r: NonNullable<typeof recipes>[number], index: number) {
    const planned = r.nextPlanned && r.nextPlanned <= horizon ? dayShort(t, r.nextPlanned) : null;
    return (
      <Pressable
        key={r._id}
        onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: r._id } })}
        accessibilityRole="link"
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
        <IconTile icon={r.icon} color={colors.tiles[index % colors.tiles.length]} idea={r.isIdea} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="item">{r.title}</Text>
          <View style={styles.meta}>
            {r.isIdea ? <IdeaPill /> : <RatingBadge average={r.rating.average} />}
            <Text variant="small" color={colors.muted} style={{ flexShrink: 1 }}>
              {r.isIdea
                ? [
                    planned ? t('ideas.plannedOn', { day: planned }) : null,
                    t('ideas.items', { count: r.ingredientCount }),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : [
                    t('recipes.servings', { count: r.servings }),
                    r.lastCooked
                      ? t('recipes.cooked', { when: relativeDay(t, r.lastCooked, today) })
                      : t('recipes.neverCooked'),
                  ].join(' · ')}
            </Text>
          </View>
        </View>
        {r.isIdea && !archived ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() =>
              router.push({ pathname: '/recipe/edit', params: { id: r._id, makeRecipe: '1' } })
            }>
            <Text variant="small" color={colors.tomato} style={{ fontFamily: Fonts.semibold }}>
              {t('ideas.makeRecipe')}
            </Text>
          </Pressable>
        ) : planned ? (
          <Text variant="small" color={colors.tomatoDeep} style={styles.badge}>
            {planned}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <TabScreen header={header}>
      {recipes && recipes.length === 0 && !archived ? (
        <View style={{ marginTop: 24, gap: 12 }}>
          <Text color={colors.muted}>{t('recipes.empty')}</Text>
          <Button onPress={() => router.push('/recipe/edit')} title={t('recipes.addFirst')} />
        </View>
      ) : null}
      {ideasHeading ? (
        <Text variant="section" color={colors.muted} style={styles.section}>
          {t('ideas.section', { count: shownIdeas.length })}
        </Text>
      ) : null}
      {shownIdeas.map(renderRow)}
      {/* A new idea without a day (#110), typed in place like "+ New gift". */}
      {hasAny && !archived && !needle ? (
        <QuietField
          accessibilityLabel={t('ideas.new')}
          value={newIdea}
          onChangeText={setNewIdea}
          maxLength={120}
          placeholder={t('ideas.new')}
          returnKeyType="done"
          onSubmitEditing={() => void addIdea()}
        />
      ) : null}
      {ideasHeading && shownRecipes.length > 0 ? (
        <Text variant="section" color={colors.muted} style={styles.section}>
          {t('ideas.recipesSection', { count: shownRecipes.length })}
        </Text>
      ) : null}
      {shownRecipes.map(renderRow)}
      {archived || archivedCount > 0 ? (
        <Button
          kind="ghost"
          title={
            archived
              ? t('recipes.backToRecipes')
              : t('recipes.archivedLink', { count: archivedCount })
          }
          style={{ marginTop: 10 }}
          onPress={() => setArchived(!archived)}
        />
      ) : null}
    </TabScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { marginTop: 14, marginBottom: 2 },
  header: { paddingHorizontal: 20, paddingTop: 24, gap: 14, paddingBottom: 8 },
  // minHeight keeps the row as tall when the New button is hidden (archived view), and matches
  // the Groceries title row.
  titleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: Radius.field,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: colors.ink,
    height: '100%',
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  badge: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: colors.saffronSoft,
    overflow: 'hidden',
  },
}));
