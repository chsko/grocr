import { useMutation, useQuery } from 'convex/react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Loading, Text } from '@/components/ui';
import { Colors, Fonts } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { attempt } from '@/lib/errors';
import { formatAmounts } from '@/lib/format';
import { isUnit } from '@/convex/lib/units';

/** One recipe: ingredients and steps, with edit and archive (GRO-30). */
export default function RecipeScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: Id<'recipes'> }>();
  const recipe = useQuery(api.recipes.get, { recipeId: id });
  const setArchived = useMutation(api.recipes.setArchived);

  if (recipe === undefined) return <Loading />;
  const archived = recipe.archivedAt !== undefined;

  return (
    <ScrollView
      style={{ backgroundColor: Colors.background }}
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
      <Text variant="title">{recipe.title}</Text>
      <Text color={Colors.muted}>{t('recipes.servings', { count: recipe.servings })}</Text>

      <Text variant="section" color={Colors.muted} style={styles.section}>
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
            {line.note ? <Text color={Colors.muted}>{`, ${line.note}`}</Text> : null}
          </Text>
        </View>
      ))}

      {recipe.steps.length > 0 ? (
        <Text variant="section" color={Colors.muted} style={styles.section}>
          {t('recipeEdit.steps')}
        </Text>
      ) : null}
      {recipe.steps.map((step, index) => (
        <View key={index} style={styles.step}>
          <Text variant="label" color={Colors.tomatoDeep} style={styles.stepNumber}>
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
        <Text variant="small" color={Colors.muted} style={{ textAlign: 'center' }}>
          {t('recipes.archiveHint')}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48, gap: 6 },
  section: { marginTop: 24, marginBottom: 6 },
  ingredient: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.saffronSoft,
    textAlign: 'center',
    lineHeight: 26,
    overflow: 'hidden',
  },
});
