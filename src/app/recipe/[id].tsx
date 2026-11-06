import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { External } from '@/components/icons';
import { Button, IconTile, Loading, StarPicker, Text } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { fadeIn } from '@/lib/motion';
import { dayLabel, formatAmounts } from '@/lib/format';
import { relativeDay } from '@/lib/relative';
import { useFamily } from '@/lib/session';
import { todayIn } from '@/lib/week';
import { recipeSite } from '@/convex/lib/recipeLink';
import { isUnit } from '@/convex/lib/units';

/**
 * One recipe: when it was last cooked, the family's stars (GRO-68), ingredients, a link to the
 * recipe on the web (GRO-71) and steps, with edit and archive (GRO-30).
 */
export default function RecipeScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: Id<'recipes'> }>();
  const recipe = useQuery(api.recipes.get, { recipeId: id });
  const setArchived = useMutation(api.recipes.setArchived);
  const rate = useMutation(api.recipes.rate).withOptimisticUpdate((store, { recipeId, stars }) => {
    const current = store.getQuery(api.recipes.get, { recipeId });
    if (current) store.setQuery(api.recipes.get, { recipeId }, withMyStars(current, stars));
  });
  const family = useFamily();

  if (recipe === undefined) return <Loading />;
  const archived = recipe.archivedAt !== undefined;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Button
              onPress={() => router.push({ pathname: '/recipe/edit', params: { id } })}
              kind="ghost"
              title={t('common.edit')}
            />
          ),
        }}
      />
      <IconTile icon={recipe.shownIcon} color={colors.tiles[0]} size={64} />
      <Text variant="title" style={{ marginTop: 12 }}>
        {recipe.title}
      </Text>
      <Text color={colors.muted}>
        {[
          t('recipes.servings', { count: recipe.servings }),
          recipe.lastCooked
            ? t('recipes.lastCooked', {
                when: relativeDay(t, recipe.lastCooked, todayIn(family.timezone)),
              })
            : t('recipes.neverCookedLong'),
          recipe.timesCooked > 0 ? t('recipes.timesCooked', { count: recipe.timesCooked }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {recipe.nextPlanned ? (
        <Text color={colors.tomatoDeep}>
          {t('recipes.nextPlanned', { day: dayLabel(t, recipe.nextPlanned) })}
        </Text>
      ) : null}

      <View style={styles.rating}>
        <Text variant="section" color={colors.muted}>
          {t('rating.yours')}
        </Text>
        <View style={{ marginHorizontal: -7 }}>
          <StarPicker
            value={recipe.rating.mine}
            onChange={(stars) => void attempt(t, () => rate({ recipeId: id, stars }))}
          />
        </View>
        {/* The family line fades to its new numbers when a rating changes. */}
        <Animated.View key={`${recipe.rating.average}-${recipe.rating.count}`} entering={fadeIn}>
          <Text variant="small" color={colors.muted}>
            {recipe.rating.average === null
              ? t('rating.nobody')
              : [
                  t('rating.family', {
                    count: recipe.rating.count,
                    rating: recipe.rating.average.toLocaleString(i18n.language),
                  }),
                  ...recipe.ratings
                    .filter((r) => !r.isMe)
                    .map((r) => `${r.name.split(' ')[0] || '?'} ${r.stars}★`),
                ].join(' · ')}
          </Text>
        </Animated.View>
      </View>

      <Text variant="section" color={colors.muted} style={styles.section}>
        {t('recipeEdit.ingredients')}
      </Text>
      {recipe.ingredients.map((line, index) => (
        <View key={index} style={styles.ingredient}>
          <Text variant="item" style={{ width: 90, fontFamily: Fonts.semibold }}>
            {formatAmounts(t, i18n.language, [
              { qty: line.qty, unit: line.unit && isUnit(line.unit) ? line.unit : undefined },
            ])}
          </Text>
          <Text style={{ flex: 1 }}>
            {line.name}
            {line.note ? <Text color={colors.muted}>{`, ${line.note}`}</Text> : null}
          </Text>
        </View>
      ))}

      {recipe.steps.length > 0 || recipe.sourceUrl ? (
        <Text variant="section" color={colors.muted} style={styles.section}>
          {t('recipeEdit.steps')}
        </Text>
      ) : null}
      {recipe.sourceUrl ? <RecipeLink url={recipe.sourceUrl} /> : null}
      {recipe.steps.map((step, index) => (
        <View key={index} style={styles.step}>
          <Text variant="label" color={colors.tomatoDeep} style={styles.stepNumber}>
            {index + 1}
          </Text>
          <Text style={{ flex: 1 }}>{step}</Text>
        </View>
      ))}

      <Button
        kind={archived ? 'secondary' : 'danger'}
        title={archived ? t('recipes.restore') : t('recipes.archive')}
        style={{ marginTop: 32, alignSelf: archived ? 'stretch' : 'center' }}
        onPress={() => void attempt(t, () => setArchived({ recipeId: id, archived: !archived }))}
      />
      {archived ? null : (
        <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
          {t('recipes.archiveHint')}
        </Text>
      )}
    </ScrollView>
  );
}

/** The recipe's page on the web, opened in the in-app browser. */
function RecipeLink({ url }: { url: string }) {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const site = recipeSite(url);
  async function open() {
    try {
      await WebBrowser.openBrowserAsync(url, {
        controlsColor: colors.tomato,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      // No in-app browser (rare on Android): hand the link to the system.
      await Linking.openURL(url).catch(() =>
        Alert.alert(t('errors.title'), t('recipes.openLinkFailed', { site })),
      );
    }
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('recipes.openLink')}
      accessibilityHint={t('recipes.openLinkHint', { site })}
      onPress={() => void open()}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="item" style={{ fontFamily: Fonts.semibold }}>
          {t('recipes.openLink')}
        </Text>
        <Text variant="small" color={colors.muted} numberOfLines={1}>
          {site}
        </Text>
      </View>
      <External size={20} color={colors.tomato} />
    </Pressable>
  );
}

type RecipeDetail = NonNullable<FunctionReturnType<typeof api.recipes.get>>;

/** The recipe as it will look once the member's new stars are saved. */
function withMyStars(recipe: RecipeDetail, stars: number | null): RecipeDetail {
  const others = recipe.ratings.filter((r) => !r.isMe);
  const mine = recipe.ratings.find((r) => r.isMe);
  const ratings =
    stars === null ? others : [{ name: mine?.name ?? '', stars, isMe: true }, ...others];
  const average =
    ratings.length === 0
      ? null
      : Math.round((ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length) * 10) / 10;
  return { ...recipe, ratings, rating: { average, count: ratings.length, mine: stars } };
}

const useStyles = makeStyles((colors) => ({
  content: { padding: 20, paddingBottom: 48, gap: 6 },
  rating: {
    marginTop: 18,
    padding: 14,
    paddingBottom: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    gap: 4,
  },
  section: { marginTop: 24, marginBottom: 6 },
  ingredient: {
    flexDirection: 'row',
    // The amount and the name use different line heights; share the baseline, not the top.
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.saffronSoft,
    textAlign: 'center',
    lineHeight: 26,
    overflow: 'hidden',
  },
}));
