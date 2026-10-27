import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Field, Text } from '@/components/ui';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { GroceryLine } from '@/convex/lib/merge';
import { formatQty, parseQty, UNITS, type Unit } from '@/convex/lib/units';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { sectionName } from '@/lib/sections';
import { useFamily } from '@/lib/session';

/**
 * Edit or remove a merged grocery line (long press). Saving puts the new amount on one row and
 * marks it edited, so planning changes leave it alone (Product plan §5.3).
 */
export function GroceryLineEditor({ line, onClose }: { line: GroceryLine; onClose: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const editMerged = useMutation(api.grocery.editMerged);
  const remove = useMutation(api.grocery.remove);
  const setSection = useMutation(api.ingredients.setSection);
  const mergeIngredients = useMutation(api.ingredients.merge);
  const family = useFamily();
  const [mergeText, setMergeText] = useState<string | null>(null);
  const matches = useQuery(
    api.ingredients.search,
    mergeText?.trim() ? { groupId: family.groupId, text: mergeText } : 'skip',
  );
  // Lines with mixed units ("1 can + 200 g") start from the first part.
  const first = line.amounts[0];
  const [start] = useState(() => ({
    qty: first?.qty !== undefined ? formatQty(first.qty, i18n.language) : '',
    unit: first?.unit,
  }));
  const [qty, setQty] = useState(start.qty);
  const [unit, setUnit] = useState<Unit | undefined>(start.unit);
  const itemIds = line.itemIds as Id<'groceryItems'>[];

  async function save() {
    // Saving without touching the amount (e.g. after only picking a section) is no edit, so the
    // rows keep following their dinners. The line may also have grown since the editor opened.
    if (qty !== start.qty || unit !== start.unit) {
      await attempt(t, () => editMerged({ itemIds, qty: parseQty(qty), unit }));
    }
    onClose();
  }

  function confirmMerge(into: { _id: Id<'ingredients'>; name: string }) {
    Alert.alert(
      t('groceries.mergeTitle', { from: line.name, into: into.name }),
      t('groceries.mergeBody', { from: line.name, into: into.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('groceries.merge'),
          // The line changes ingredient, so the editor closes on its own once the list updates.
          onPress: () =>
            void attempt(t, () =>
              mergeIngredients({
                fromId: line.ingredientId as Id<'ingredients'>,
                intoId: into._id,
              }),
            ),
        },
      ],
    );
  }

  async function removeLine() {
    await attempt(t, () => remove({ itemIds }));
    onClose();
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('common.close')} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text variant="heading">{line.name}</Text>
          <Field
            label={t('groceries.amount')}
            value={qty}
            onChangeText={setQty}
            keyboardType="decimal-pad"
            placeholder="1"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}>
            <Chip
              title={t('units.none')}
              selected={unit === undefined}
              onPress={() => setUnit(undefined)}
            />
            {UNITS.map((u) => (
              <Chip
                key={u}
                title={t(`units.${u}`)}
                selected={unit === u}
                onPress={() => setUnit(u)}
              />
            ))}
          </ScrollView>
          {line.ingredientId ? (
            <>
              <Text variant="label" color={colors.muted}>
                {t('groceries.section')}
              </Text>
              <View style={styles.sections}>
                {family.sections.map((s) => (
                  <Chip
                    key={s.key}
                    title={sectionName(t, s)}
                    selected={line.section === s.key}
                    onPress={() =>
                      void attempt(t, () =>
                        setSection({
                          ingredientId: line.ingredientId as Id<'ingredients'>,
                          section: s.key,
                        }),
                      )
                    }
                  />
                ))}
              </View>
            </>
          ) : null}
          {line.ingredientId && mergeText === null ? (
            <Button
              kind="ghost"
              title={t('groceries.sameAs')}
              style={{ alignSelf: 'flex-start' }}
              onPress={() => setMergeText('')}
            />
          ) : null}
          {mergeText !== null ? (
            <View style={{ gap: 6 }}>
              <Field
                label={t('groceries.sameAsLabel', { name: line.name })}
                value={mergeText}
                onChangeText={setMergeText}
                autoFocus
                placeholder={t('groceries.sameAsPlaceholder')}
              />
              <View style={styles.sections}>
                {matches
                  ?.filter((m) => m._id !== line.ingredientId)
                  .map((m) => (
                    <Chip key={m._id} title={m.name} onPress={() => confirmMerge(m)} />
                  ))}
              </View>
            </View>
          ) : null}
          <Button title={t('common.save')} onPress={() => void save()} />
          <Button
            kind="danger"
            title={t('groceries.removeLine')}
            style={{ alignSelf: 'center' }}
            onPress={() => void removeLine()}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sections: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheet: {
    backgroundColor: colors.raised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
  },
}));
