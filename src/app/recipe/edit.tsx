import { useMutation, useQuery } from 'convex/react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Close } from '@/components/icons';
import { Button, Chip, Field, IconButton, Loading, Stepper, Text } from '@/components/ui';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { formatQty, isUnit, parseQty, UNITS, type Unit } from '@/convex/lib/units';
import { attempt } from '@/lib/errors';
import { useFamily } from '@/lib/session';

type Row = {
  key: number;
  ingredientId?: Id<'ingredients'>;
  name: string;
  qty: string;
  unit?: Unit;
  note?: string;
};

let nextKey = 1;
const emptyRow = (): Row => ({ key: nextKey++, name: '', qty: '' });

/** Create or edit a recipe with structured ingredients and steps (GRO-29). `?id=` edits. */
export default function RecipeEditScreen() {
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const { id } = useLocalSearchParams<{ id?: Id<'recipes'> }>();
  const existing = useQuery(api.recipes.get, id ? { recipeId: id } : 'skip');
  const saveRecipe = useMutation(api.recipes.save);

  const [title, setTitle] = useState('');
  const [servings, setServings] = useState(4);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [active, setActive] = useState<number | null>(null);
  const [unitFor, setUnitFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!existing || loaded.current) return;
    loaded.current = true;
    setTitle(existing.title);
    setServings(existing.servings);
    setRows(
      existing.ingredients.map((line) => ({
        key: nextKey++,
        ingredientId: line.ingredientId,
        name: line.name,
        qty: line.qty !== undefined ? formatQty(line.qty, i18n.language) : '',
        unit: line.unit && isUnit(line.unit) ? line.unit : undefined,
        note: line.note,
      })),
    );
    setSteps(existing.steps.length > 0 ? existing.steps : ['']);
  }, [existing, i18n.language]);

  const activeRow = rows.find((r) => r.key === active);
  const suggestions = useQuery(
    api.ingredients.search,
    activeRow && activeRow.name.trim() && !activeRow.ingredientId
      ? { groupId: family.groupId, text: activeRow.name }
      : 'skip',
  );

  function update(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    const recipeId = await attempt(t, () =>
      saveRecipe({
        groupId: family.groupId,
        recipeId: id,
        title,
        servings,
        steps,
        ingredients: rows
          .filter((r) => r.ingredientId || r.name.trim())
          .map((r) => ({
            ingredientId: r.ingredientId,
            name: r.name,
            qty: parseQty(r.qty),
            unit: r.unit,
            note: r.note,
          })),
      }),
    );
    setBusy(false);
    if (recipeId === undefined) return;
    if (id) router.back();
    else router.replace({ pathname: '/recipe/[id]', params: { id: recipeId } });
  }

  if (id && existing === undefined) return <Loading />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}>
      <Stack.Screen
        options={{
          title: id ? t('recipeEdit.editTitle') : t('recipeEdit.newTitle'),
          headerLeft: () => (
            <Button kind="ghost" title={t('common.cancel')} onPress={() => router.back()} />
          ),
          headerRight: () => (
            <Button
              kind="ghost"
              title={t('common.save')}
              loading={busy}
              disabled={title.trim() === ''}
              onPress={() => void save()}
            />
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        <Field
          label={t('recipeEdit.titleLabel')}
          value={title}
          onChangeText={setTitle}
          placeholder={t('recipeEdit.titlePlaceholder')}
          autoFocus={!id}
          inputStyle={{ fontFamily: Fonts.semibold, fontSize: 18 }}
        />
        <View style={styles.servingsRow}>
          <Text variant="item" style={{ fontSize: 16 }}>
            {t('common.servings')}
          </Text>
          <Stepper value={servings} onChange={setServings} />
        </View>

        <Text variant="section" color={Colors.muted}>
          {t('recipeEdit.ingredients')}
        </Text>
        <View style={{ gap: 8 }}>
          {rows.map((row) => (
            <View key={row.key} style={{ zIndex: row.key === active ? 2 : 0 }}>
              <View style={styles.ingredientRow}>
                <TextInput
                  value={row.qty}
                  onChangeText={(qty) => update(row.key, { qty })}
                  keyboardType="decimal-pad"
                  placeholder={t('recipeEdit.qty')}
                  placeholderTextColor={Colors.checkbox}
                  accessibilityLabel={t('recipeEdit.qty')}
                  style={[styles.cell, styles.qtyCell]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('recipeEdit.unit')}
                  onPress={() => setUnitFor(row.key)}
                  style={[styles.cell, styles.unitCell]}>
                  <Text color={row.unit ? Colors.ink : Colors.checkbox} style={{ fontSize: 16 }}>
                    {row.unit ? t(`units.${row.unit}`) : t('recipeEdit.unit')}
                  </Text>
                </Pressable>
                <TextInput
                  value={row.name}
                  onChangeText={(name) => update(row.key, { name, ingredientId: undefined })}
                  onFocus={() => setActive(row.key)}
                  placeholder={t('recipeEdit.ingredientPlaceholder')}
                  placeholderTextColor={Colors.checkbox}
                  accessibilityLabel={t('recipeEdit.ingredient')}
                  style={[styles.cell, styles.nameCell, row.key === active && styles.cellActive]}
                />
                <IconButton
                  label={t('recipeEdit.removeIngredient')}
                  style={{ width: 32 }}
                  onPress={() => setRows((current) => current.filter((r) => r.key !== row.key))}>
                  <Close size={18} color={Colors.muted} />
                </IconButton>
              </View>
              {row.key === active && suggestions && suggestions.length > 0 ? (
                <View style={styles.suggestions} accessibilityRole="list">
                  {suggestions.map((s) => (
                    <Pressable
                      key={s._id}
                      accessibilityRole="button"
                      onPress={() => {
                        update(row.key, { ingredientId: s._id, name: s.name });
                        setActive(null);
                      }}
                      style={({ pressed }) => [
                        styles.suggestion,
                        pressed && { backgroundColor: Colors.surface },
                      ]}>
                      <Text variant="item" style={{ fontSize: 16 }}>
                        {s.name}
                      </Text>
                      <Text variant="small" color={Colors.muted} style={{ fontSize: 12 }}>
                        {t(`sections.${s.section as 'other'}`, { defaultValue: s.section })}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          <Button
            kind="ghost"
            title={t('recipeEdit.addIngredient')}
            onPress={() => {
              const row = emptyRow();
              setRows((current) => [...current, row]);
              setActive(row.key);
            }}
          />
        </View>

        <Text variant="section" color={Colors.muted}>
          {t('recipeEdit.steps')}
        </Text>
        <View style={{ gap: 8 }}>
          {steps.map((step, index) => (
            <View key={index} style={styles.stepRow}>
              <Text variant="label" color={Colors.tomatoDeep} style={styles.stepNumber}>
                {index + 1}
              </Text>
              <Field
                value={step}
                onChangeText={(text) =>
                  setSteps((current) => current.map((s, i) => (i === index ? text : s)))
                }
                placeholder={t('recipeEdit.stepPlaceholder')}
                multiline
                style={{ flex: 1 }}
                inputStyle={{ paddingTop: 12, paddingBottom: 12, fontSize: 16 }}
              />
              <IconButton
                label={t('recipeEdit.removeStep')}
                style={{ width: 32 }}
                onPress={() => setSteps((current) => current.filter((_, i) => i !== index))}>
                <Close size={18} color={Colors.muted} />
              </IconButton>
            </View>
          ))}
          <Button
            kind="ghost"
            title={t('recipeEdit.addStep')}
            onPress={() => setSteps((s) => [...s, ''])}
          />
        </View>
      </ScrollView>

      <Modal
        visible={unitFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setUnitFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setUnitFor(null)}>
          <View style={styles.unitSheet}>
            <Text variant="heading">{t('recipeEdit.unit')}</Text>
            <View style={styles.unitGrid}>
              <Chip
                title={t('units.none')}
                onPress={() => {
                  if (unitFor !== null) update(unitFor, { unit: undefined });
                  setUnitFor(null);
                }}
              />
              {UNITS.map((u) => (
                <Chip
                  key={u}
                  title={t(`units.${u}`)}
                  selected={rows.find((r) => r.key === unitFor)?.unit === u}
                  onPress={() => {
                    if (unitFor !== null) update(unitFor, { unit: u });
                    setUnitFor(null);
                  }}
                />
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, paddingBottom: 64 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ingredientRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  cell: {
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: Colors.ink,
  },
  qtyCell: { width: 56, textAlign: 'center' },
  unitCell: { width: 64, alignItems: 'center', justifyContent: 'center' },
  nameCell: { flex: 1, minWidth: 0, paddingHorizontal: 12 },
  cellActive: { borderWidth: 2, borderColor: Colors.tomato, backgroundColor: '#FFFFFF' },
  suggestions: {
    marginTop: 4,
    marginLeft: 126,
    borderRadius: Radius.field,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  suggestion: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNumber: {
    marginTop: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.saffronSoft,
    textAlign: 'center',
    lineHeight: 26,
    overflow: 'hidden',
  },
  backdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: 24 },
  unitSheet: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 14 },
  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
