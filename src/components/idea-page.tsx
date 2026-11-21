import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Close } from '@/components/icons';
import { Button, Field, IconButton, IconTile, IdeaPill, Text } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { isUnit } from '@/convex/lib/units';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { dayLabel, formatAmounts, weekTitle } from '@/lib/format';
import { parseItemInput } from '@/lib/parse-item';
import { useFamily } from '@/lib/session';
import { startOfWeek, type Weekday } from '@/lib/week';

type Idea = NonNullable<FunctionReturnType<typeof api.recipes.get>>;

/**
 * A dinner idea's page (#107, prototype C): what it is and who added it, a nudge to make it a
 * recipe, the items that go on the grocery list (added right here), and the days it is planned.
 */
export function IdeaPage({ idea }: { idea: Idea }) {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const addIngredient = useMutation(api.recipes.addIngredient);
  const removeIngredient = useMutation(api.recipes.removeIngredient);
  const setArchived = useMutation(api.recipes.setArchived);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    const item = parseItemInput(text);
    // Return pressed twice quickly must not add the item twice.
    if (!item.name || busy) return;
    setBusy(true);
    setText('');
    const ok = await attempt(t, async () => {
      await addIngredient({ recipeId: idea._id, ...item });
      return true;
    });
    setBusy(false);
    if (!ok) setText(text);
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.head}>
        <IconTile icon={idea.shownIcon} color={colors.tiles[0]} size={56} idea />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title">{idea.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IdeaPill />
            {idea.createdByName ? (
              <Text variant="small" color={colors.muted}>
                {t('ideas.addedBy', { name: idea.createdByName.split(' ')[0] })}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.banner}>
        <Text variant="item" style={{ fontFamily: Fonts.bold }}>
          {t('ideas.madeIt')}
        </Text>
        <Text variant="small" color={colors.muted}>
          {t('ideas.madeItBody')}
        </Text>
        <Button
          title={t('ideas.makeRecipe')}
          style={{ marginTop: 8 }}
          onPress={() =>
            router.push({ pathname: '/recipe/edit', params: { id: idea._id, makeRecipe: '1' } })
          }
        />
      </View>

      <Text variant="section" color={colors.muted} style={styles.section}>
        {t('ideas.itemsFor', { count: idea.servings })}
      </Text>
      {idea.ingredients.map((line, index) => (
        <View key={`${index}-${line.ingredientId}`} style={styles.item}>
          <Text style={{ flex: 1 }}>{line.name}</Text>
          <Text variant="small" color={colors.muted}>
            {formatAmounts(t, i18n.language, [
              { qty: line.qty, unit: line.unit && isUnit(line.unit) ? line.unit : undefined },
            ])}
          </Text>
          <IconButton
            label={t('ideas.removeItem', { name: line.name })}
            onPress={() =>
              void attempt(t, () =>
                removeIngredient({ recipeId: idea._id, index, ingredientId: line.ingredientId }),
              )
            }>
            <Close size={18} color={colors.muted} />
          </IconButton>
        </View>
      ))}
      <View style={styles.addRow}>
        <Field
          value={text}
          onChangeText={setText}
          placeholder={t('ideas.addItemPlaceholder')}
          accessibilityLabel={t('ideas.addItem')}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={() => void add()}
          style={{ flex: 1 }}
        />
        <Button
          kind="secondary"
          title={t('ideas.addItem')}
          disabled={busy || !text.trim()}
          onPress={() => void add()}
        />
      </View>

      <Text variant="section" color={colors.muted} style={styles.section}>
        {t('ideas.planned')}
      </Text>
      {idea.plannedDates.length === 0 ? (
        <Text color={colors.muted}>{t('ideas.notPlanned')}</Text>
      ) : (
        idea.plannedDates.map((date) => (
          <Text key={date}>
            {`${dayLabel(t, date)} · ${weekTitle(t, startOfWeek(date, family.weekStartsOn as Weekday))}`}
          </Text>
        ))
      )}

      <Button
        kind="danger"
        title={t('ideas.remove')}
        style={{ marginTop: 32, alignSelf: 'center' }}
        onPress={() =>
          void attempt(t, async () => {
            await setArchived({ recipeId: idea._id, archived: true });
            router.back();
          })
        }
      />
      <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
        {t('ideas.removeHint')}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  banner: {
    marginTop: 16,
    padding: 14,
    borderRadius: Radius.card,
    backgroundColor: colors.saffronSoft,
    gap: 4,
  },
  section: { marginTop: 24, marginBottom: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
}));
