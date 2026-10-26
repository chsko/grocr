import { useMutation, useQuery } from 'convex/react';
import { Link, router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { Plus, Search } from '@/components/icons';
import { TabTitle } from '@/components/tab-stack';
import { Button, IconButton, IconTile, TabScreen, Text } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
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
  const recipes = useQuery(api.recipes.list, { groupId: family.groupId, archived });
  const setArchivedMutation = useMutation(api.recipes.setArchived);
  const archivedCount =
    useQuery(api.recipes.list, { groupId: family.groupId, archived: true })?.length ?? 0;

  const today = todayIn(family.timezone);
  // Show the planned day only when it is within this or next week.
  const horizon = addDays(startOfWeek(today, family.weekStartsOn as Weekday), 13);
  const needle = search.trim().toLocaleLowerCase();
  const shown = (recipes ?? []).filter((r) => r.title.toLocaleLowerCase().includes(needle));

  const title = archived ? t('recipes.archivedTitle') : t('recipes.title');
  const searchPlaceholder = t('recipes.search', { count: recipes?.length ?? 0 });
  const newRecipe = () => router.push('/recipe/edit');

  // The native header: large title, a search field under it, and New on the right. Web has no
  // native search field, so it keeps the field in the list.
  const header = (
    <>
      <TabTitle>{title}</TabTitle>
      {Platform.OS === 'web' ? null : (
        <Stack.SearchBar
          placeholder={searchPlaceholder}
          hideWhenScrolling
          tintColor={colors.tomato}
          onChangeText={(e) => setSearch(e.nativeEvent.text)}
          onCancelButtonPress={() => setSearch('')}
        />
      )}
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="plus"
            hidden={archived}
            accessibilityLabel={t('recipes.new')}
            tintColor={colors.tomato}
            onPress={newRecipe}
          />
        </Stack.Toolbar>
      ) : (
        <Stack.Screen
          options={{
            headerRight: archived
              ? () => null
              : () => (
                  <IconButton onPress={newRecipe} filled label={t('recipes.new')}>
                    <Plus color={colors.onTomato} strokeWidth={2.2} />
                  </IconButton>
                ),
          }}
        />
      )}
    </>
  );

  return (
    <TabScreen nativeHeader>
      {header}
      {Platform.OS === 'web' ? (
        <View style={styles.search}>
          <Search color={colors.muted} size={18} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.checkbox}
            accessibilityLabel={t('recipes.searchLabel')}
            style={styles.searchInput}
          />
        </View>
      ) : null}
      {recipes && recipes.length === 0 && !archived ? (
        <View style={{ marginTop: 24, gap: 12 }}>
          <Text color={colors.muted}>{t('recipes.empty')}</Text>
          <Button onPress={newRecipe} title={t('recipes.addFirst')} />
        </View>
      ) : null}
      {shown.map((r, index) => {
        const planned =
          r.nextPlanned && r.nextPlanned <= horizon ? dayShort(t, r.nextPlanned) : null;
        return (
          <Link key={r._id} href={{ pathname: '/recipes/[id]', params: { id: r._id } }} asChild>
            <Link.Trigger>
              <Pressable accessibilityRole="link" style={styles.row}>
                <IconTile icon={r.icon} color={colors.tiles[index % colors.tiles.length]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="item">{r.title}</Text>
                  <Text variant="small" color={colors.muted}>
                    {[
                      t('recipes.servings', { count: r.servings }),
                      r.lastCooked
                        ? t('recipes.cooked', { when: relativeDay(t, r.lastCooked, today) })
                        : t('recipes.neverCooked'),
                    ].join(' · ')}
                  </Text>
                </View>
                {planned ? (
                  <Text variant="small" color={colors.tomatoDeep} style={styles.badge}>
                    {planned}
                  </Text>
                ) : null}
              </Pressable>
            </Link.Trigger>
            {/* Long-press: a peek at the recipe with Edit and Archive under it (iOS). */}
            <Link.Preview />
            <Link.Menu>
              <Link.MenuAction
                title={t('common.edit')}
                icon="pencil"
                onPress={() => router.push({ pathname: '/recipe/edit', params: { id: r._id } })}
              />
              <Link.MenuAction
                title={archived ? t('recipes.restore') : t('recipes.archive')}
                icon={archived ? 'arrow.uturn.backward' : 'archivebox'}
                destructive={!archived}
                onPress={() =>
                  void attempt(t, () =>
                    setArchivedMutation({ recipeId: r._id, archived: !archived }),
                  )
                }
              />
            </Link.Menu>
          </Link>
        );
      })}
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
  search: {
    marginTop: 8,
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
