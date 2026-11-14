import { useMutation, useQuery } from 'convex/react';
import { useRef, useState } from 'react';
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
import { convertQty, formatQty, parseQty, sumAmounts, UNITS, type Unit } from '@/convex/lib/units';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { formatAmounts } from '@/lib/format';
import { useSetSection, useSetStaple } from '@/lib/optimistic';
import { sectionName } from '@/lib/sections';
import { useFamily } from '@/lib/session';
import Animated from 'react-native-reanimated';
import { sheetIn } from '@/lib/motion';

/**
 * Edit or remove a merged grocery line (long press). Saving puts the new amount on one row and
 * marks it edited, so planning changes leave it alone (Product plan §5.3). Its item can also be
 * made a staple, which every week's list then offers (GRO-62). "Have at home" says how much of
 * it the family already has ("4 of the 12 carrots"), so only the rest is left to buy.
 */
export function GroceryLineEditor({
  line,
  homeLine,
  isStaple,
  onClose,
}: {
  line: GroceryLine;
  /** The part of the same item marked as at home, if any. */
  homeLine: GroceryLine | null;
  isStaple: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const editMerged = useMutation(api.grocery.editMerged);
  const setAtHomeAmount = useMutation(api.grocery.setAtHomeAmount);
  const remove = useMutation(api.grocery.remove);
  const setSection = useSetSection();
  const setStaple = useSetStaple();
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

  // What is at home is counted against the whole need (to buy + at home), which only works when
  // that adds up to one amount: "12 carrots" yes, "salt" or "1 can + 200 g" no.
  const [home] = useState(() => {
    const parts = sumAmounts([...line.amounts, ...(homeLine?.amounts ?? [])]);
    const total = parts.length === 1 ? parts[0] : undefined;
    if (total?.qty === undefined) return null;
    const had = homeLine?.amounts.length === 1 ? homeLine.amounts[0] : undefined;
    const hadQty = had?.qty !== undefined ? convertQty(had.qty, had.unit, total.unit) : undefined;
    return {
      total: { qty: total.qty, unit: total.unit },
      start: hadQty !== undefined ? formatQty(hadQty, i18n.language) : '',
    };
  });
  const [homeText, setHomeText] = useState(home?.start ?? '');
  // Blank or 0 is nothing at home; anything else that does not read as a number is ignored.
  const homeQty =
    homeText.trim() === '' || /^0+([.,]0*)?$/.test(homeText.trim()) ? 0 : parseQty(homeText);

  const [saving, setSaving] = useState(false);
  // A ref as well as state, so two taps before a re-render cannot both start a save.
  const savingRef = useRef(false);

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await saveChanges();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function saveChanges() {
    let open = itemIds;
    if (home && homeText !== home.start && homeQty !== undefined) {
      const result = await attempt(t, () =>
        setAtHomeAmount({
          itemIds: [...itemIds, ...((homeLine?.itemIds ?? []) as Id<'groceryItems'>[])],
          qty: homeQty,
          unit: home.total.unit,
        }),
      );
      if (result === undefined) return;
      open = result;
    }
    // Saving without touching the amount (e.g. after only picking a section) is no edit, so the
    // rows keep following their dinners. The line may also have grown since the editor opened.
    if ((qty !== start.qty || unit !== start.unit) && open.length > 0) {
      await attempt(t, () => editMerged({ itemIds: open, qty: parseQty(qty), unit }));
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
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('common.close')} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={sheetIn}>
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
            {home ? (
              <View style={{ gap: 6 }}>
                <Field
                  label={
                    home.total.unit
                      ? t('groceries.haveAtHomeUnit', { unit: t(`units.${home.total.unit}`) })
                      : t('groceries.haveAtHome')
                  }
                  value={homeText}
                  onChangeText={setHomeText}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
                {homeQty !== undefined && homeQty > 0 ? (
                  <Text variant="small" color={colors.muted}>
                    {t('groceries.toBuyAfterHome', {
                      total: formatAmounts(t, i18n.language, [home.total]),
                      rest: formatAmounts(t, i18n.language, [
                        {
                          qty: Math.max(0, Math.round((home.total.qty - homeQty) * 100) / 100),
                          unit: home.total.unit,
                        },
                      ]),
                    })}
                  </Text>
                ) : null}
              </View>
            ) : null}
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
            {line.ingredientId ? (
              <View style={styles.sections}>
                <Chip
                  title={t('groceries.staple')}
                  selected={isStaple}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: isStaple }}
                  onPress={() =>
                    void attempt(t, () =>
                      setStaple({
                        ingredientId: line.ingredientId as Id<'ingredients'>,
                        staple: !isStaple,
                      }),
                    )
                  }
                />
              </View>
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
            <Button
              title={t('common.save')}
              // "Have at home" must read as an amount ("4", "1,5"); anything else is not saved.
              disabled={saving || (home !== null && homeQty === undefined)}
              onPress={() => void save()}
            />
            <Button
              kind="danger"
              title={t('groceries.removeLine')}
              style={{ alignSelf: 'center' }}
              onPress={() => void removeLine()}
            />
          </View>
        </Animated.View>
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
