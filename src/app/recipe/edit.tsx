import { useMutation, useQuery } from 'convex/react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';

import { Close, More } from '@/components/icons';
import { Button, Chip, Field, IconButton, IconTile, Loading, Stepper, Text } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { cleanName } from '@/convex/lib/catalog';
import { isRecipeIcon, RECIPE_ICONS, recipeIcon, type RecipeIcon } from '@/convex/lib/recipeIcons';
import { formatQty, isUnit, parseQty, UNITS, type Unit } from '@/convex/lib/units';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { useSectionName } from '@/lib/sections';
import { useItemSuggestions } from '@/lib/item-suggestions';
import {
  addSection,
  type EditorSection,
  fromLines,
  moveRow,
  removeSection,
  rowsIn,
  sectionLines,
} from '@/lib/recipe-editor';
import { MAX_SECTION_NAME } from '@/convex/lib/recipeSections';
import { useFamily } from '@/lib/session';

type Row = {
  key: number;
  ingredientId?: Id<'ingredients'>;
  name: string;
  qty: string;
  unit?: Unit;
  note?: string;
  /** The recipe section's key (#101), or null above every section. */
  section: number | null;
};

let nextKey = 1;
const newKey = () => nextKey++;
const emptyRow = (section: number | null): Row => ({ key: newKey(), name: '', qty: '', section });

/**
 * Create or edit a recipe with structured ingredients and steps (GRO-29), or a link to the
 * recipe on the web instead of steps (GRO-71). `?id=` edits. Ingredients can be grouped in
 * recipe sections (#101), each on its own card; ⋯ on a row moves it to another section.
 */
export default function RecipeEditScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const sectionName = useSectionName();
  const { id, makeRecipe } = useLocalSearchParams<{ id?: Id<'recipes'>; makeRecipe?: string }>();
  // Making a dinner idea a recipe (#108): its items arrive as the ingredients.
  const making = makeRecipe === '1' && id !== undefined;
  const existing = useQuery(api.recipes.get, id ? { recipeId: id } : 'skip');
  const saveRecipe = useMutation(api.recipes.save);

  const [title, setTitle] = useState('');
  // null follows the title's guess until someone picks an icon.
  const [icon, setIcon] = useState<RecipeIcon | null>(null);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [servings, setServings] = useState(4);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow(null)]);
  const [sections, setSections] = useState<EditorSection[]>([]);
  // The row whose ⋯ sheet is open.
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [steps, setSteps] = useState<string[]>(['']);
  const [link, setLink] = useState('');
  const [active, setActive] = useState<number | null>(null);
  const [unitFor, setUnitFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);
  // Ingredient inputs by `qty-<key>` / `name-<key>`, so Return can move to the next one.
  const fields = useRef(new Map<string, TextInputInstance>());
  // A row added by Return focuses its qty input as soon as it mounts.
  const focusOnMount = useRef<string | null>(null);

  useEffect(() => {
    if (!existing || loaded.current) return;
    loaded.current = true;
    setTitle(existing.title);
    setIcon(isRecipeIcon(existing.icon) ? existing.icon : null);
    setServings(existing.servings);
    const saved = fromLines(
      existing.ingredients.map((line) => ({
        ingredientId: line.ingredientId,
        name: line.name,
        qty: line.qty !== undefined ? formatQty(line.qty, i18n.language) : '',
        unit: line.unit && isUnit(line.unit) ? line.unit : undefined,
        note: line.note,
        recipeSection: line.recipeSection,
      })),
      newKey,
    );
    setSections(saved.sections);
    setRows(saved.rows.map(({ recipeSection: _, ...row }) => row));
    setSteps(existing.steps.length > 0 ? existing.steps : ['']);
    setLink(existing.sourceUrl ?? '');
  }, [existing, i18n.language]);

  const activeRow = rows.find((r) => r.key === active);
  const suggestions = useItemSuggestions(
    family.groupId,
    activeRow && !activeRow.ingredientId ? activeRow.name : '',
    active,
  );

  function update(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function fieldRef(id: string) {
    return (input: TextInputInstance | null) => {
      if (!input) {
        fields.current.delete(id);
        return;
      }
      fields.current.set(id, input);
      if (focusOnMount.current === id) {
        focusOnMount.current = null;
        input.focus();
      }
    };
  }

  function addRow(section: number | null) {
    const row = emptyRow(section);
    focusOnMount.current = `qty-${row.key}`;
    setRows((current) => [...current, row]);
  }

  /** A new, empty section card, its name field focused unless a sheet is closing; returns its key. */
  function newSection(focus = true) {
    const key = newKey();
    if (focus) focusOnMount.current = `section-${key}`;
    setSections((current) => addSection(current, key));
    return key;
  }

  const isBlank = (row: Row) => !row.qty.trim() && !row.unit && !row.name.trim();

  /** Return in a name goes to the next row's qty in the same section, or adds a row after its
   * last one. A blank last row puts the keyboard away instead, so holding Return never piles up
   * empty rows. */
  function nameSubmitted(row: Row) {
    const group = rowsIn(rows, row.section);
    const next = group[group.findIndex((r) => r.key === row.key) + 1];
    if (next) fields.current.get(`qty-${next.key}`)?.focus();
    else if (isBlank(row)) Keyboard.dismiss();
    else addRow(row.section);
  }

  async function save() {
    setBusy(true);
    const recipeId = await attempt(t, () =>
      saveRecipe({
        groupId: family.groupId,
        recipeId: id,
        title,
        icon: icon ?? '',
        servings,
        steps,
        sourceUrl: link,
        withSections: true,
        ...(making ? { makeRecipe: true } : {}),
        ingredients: sectionLines(rows, sections)
          .filter((r) => r.ingredientId || r.name.trim())
          .map((r) => ({
            ingredientId: r.ingredientId,
            name: r.name,
            qty: parseQty(r.qty),
            unit: r.unit,
            note: r.note,
            recipeSection: r.recipeSection,
          })),
      }),
    );
    setBusy(false);
    if (recipeId === undefined) return;
    if (id) router.back();
    else router.replace({ pathname: '/recipe/[id]', params: { id: recipeId } });
  }

  const isLast = (row: Row) => {
    const group = rowsIn(rows, row.section);
    return group[group.length - 1]?.key === row.key;
  };

  function renderRow(row: Row) {
    return (
      <View key={row.key} style={{ zIndex: row.key === active ? 2 : 0 }}>
        <View style={styles.ingredientRow}>
          <TextInput
            ref={fieldRef(`qty-${row.key}`)}
            value={row.qty}
            onChangeText={(qty) => update(row.key, { qty })}
            // iOS's decimal pad has no Return key; this one has, and also allows "1/2".
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
            // Return skips the unit picker and goes on to the name, even with no qty.
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => fields.current.get(`name-${row.key}`)?.focus()}
            placeholder={t('recipeEdit.qtyPlaceholder')}
            placeholderTextColor={colors.checkbox}
            accessibilityLabel={t('recipeEdit.qty')}
            style={[styles.cell, styles.qtyCell]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('recipeEdit.unit')}
            onPress={() => setUnitFor(row.key)}
            style={[styles.cell, styles.unitCell]}>
            <Text color={row.unit ? colors.ink : colors.checkbox} style={{ fontSize: 16 }}>
              {row.unit ? t(`units.${row.unit}`) : t('recipeEdit.unit')}
            </Text>
          </Pressable>
          <TextInput
            ref={fieldRef(`name-${row.key}`)}
            value={row.name}
            onChangeText={(name) => update(row.key, { name, ingredientId: undefined })}
            onFocus={() => setActive(row.key)}
            returnKeyType={isLast(row) && isBlank(row) ? 'done' : 'next'}
            submitBehavior="submit"
            onSubmitEditing={() => nameSubmitted(row)}
            placeholder={t('recipeEdit.ingredientPlaceholder')}
            placeholderTextColor={colors.checkbox}
            accessibilityLabel={t('recipeEdit.ingredient')}
            style={[styles.cell, styles.nameCell, row.key === active && styles.cellActive]}
          />
          <IconButton
            label={t('recipeEdit.rowMenu', { name: row.name || t('recipeEdit.ingredient') })}
            style={{ width: 32 }}
            onPress={() => {
              Keyboard.dismiss();
              setMenuFor(row.key);
            }}>
            <More size={20} color={colors.muted} />
          </IconButton>
        </View>
        {row.key === active && suggestions.length > 0 ? (
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
                  pressed && { backgroundColor: colors.surface },
                ]}>
                <Text variant="item" style={{ fontSize: 16 }}>
                  {s.name}
                </Text>
                <Text variant="small" color={colors.muted} style={{ fontSize: 12 }}>
                  {sectionName(s.section)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  const menuRow = rows.find((r) => r.key === menuFor);

  if (id && existing === undefined) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: making
            ? t('ideas.makeRecipe')
            : id
              ? t('recipeEdit.editTitle')
              : t('recipeEdit.newTitle'),
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
      {/* iOS insets the scroll view by exactly what the keyboard covers. A KeyboardAvoidingView
          guessed the sheet's offset and left a blank strip above the keyboard. */}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('recipeEdit.icon')}
            onPress={() => setPickingIcon(true)}
            style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <IconTile
              icon={
                icon ??
                recipeIcon({
                  title,
                  // jev's guess holds only for the title it was asked about.
                  guessedIcon:
                    existing && cleanName(title) === existing.title
                      ? existing.guessedIcon
                      : undefined,
                })
              }
              color={colors.tiles[0]}
              size={50}
            />
          </Pressable>
          <Field
            label={t('recipeEdit.titleLabel')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('recipeEdit.titlePlaceholder')}
            autoFocus={!id}
            style={{ flex: 1 }}
            inputStyle={{ fontFamily: Fonts.semibold, fontSize: 18 }}
          />
        </View>
        <View style={styles.servingsRow}>
          <Text variant="item" style={{ fontSize: 16 }}>
            {t('common.servings')}
          </Text>
          <Stepper value={servings} onChange={setServings} />
        </View>

        <Text variant="section" color={colors.muted}>
          {t('recipeEdit.ingredients')}
        </Text>
        <View style={{ gap: 8 }}>
          {rowsIn(rows, null).map(renderRow)}
          <Button kind="ghost" title={t('recipeEdit.addIngredient')} onPress={() => addRow(null)} />
        </View>
        {sections.map((section) => (
          <View key={section.key} style={styles.sectionCard}>
            <View style={styles.sectionNameRow}>
              <TextInput
                ref={fieldRef(`section-${section.key}`)}
                value={section.name}
                onChangeText={(name) =>
                  setSections((current) =>
                    current.map((s) => (s.key === section.key ? { ...s, name } : s)),
                  )
                }
                maxLength={MAX_SECTION_NAME}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => {
                  const first = rowsIn(rows, section.key)[0];
                  if (first) fields.current.get(`qty-${first.key}`)?.focus();
                  else addRow(section.key);
                }}
                placeholder={t('recipeEdit.sectionPlaceholder')}
                placeholderTextColor={colors.checkbox}
                accessibilityLabel={t('recipeEdit.sectionName')}
                style={styles.sectionName}
              />
              <IconButton
                label={t('recipeEdit.removeSection', {
                  name: section.name || t('recipeEdit.unnamedSection'),
                })}
                style={{ width: 32 }}
                onPress={() => {
                  const after = removeSection(sections, rows, section.key);
                  setSections(after.sections);
                  setRows(after.rows);
                }}>
                <Close size={18} color={colors.muted} />
              </IconButton>
            </View>
            {rowsIn(rows, section.key).map(renderRow)}
            <Button
              kind="ghost"
              title={t('recipeEdit.addIngredient')}
              onPress={() => addRow(section.key)}
            />
          </View>
        ))}
        <View style={{ flexDirection: 'row' }}>
          <Chip title={t('recipeEdit.addSection')} dashed onPress={() => newSection()} />
        </View>

        <View style={{ gap: 6 }}>
          <Field
            label={t('recipeEdit.link')}
            value={link}
            onChangeText={setLink}
            placeholder={t('recipeEdit.linkPlaceholder')}
            keyboardType="url"
            textContentType="URL"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            inputStyle={{ fontSize: 16 }}
          />
          <Text variant="small" color={colors.muted}>
            {t('recipeEdit.linkHint')}
          </Text>
        </View>

        <Text variant="section" color={colors.muted}>
          {t('recipeEdit.steps')}
        </Text>
        <View style={{ gap: 8 }}>
          {steps.map((step, index) => (
            <View key={index} style={styles.stepRow}>
              <Text variant="label" color={colors.tomatoDeep} style={styles.stepNumber}>
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
                inputStyle={{ fontSize: 16 }}
              />
              <IconButton
                label={t('recipeEdit.removeStep')}
                style={{ width: 32 }}
                onPress={() => setSteps((current) => current.filter((_, i) => i !== index))}>
                <Close size={18} color={colors.muted} />
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
        visible={menuRow !== undefined}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuFor(null)}>
          {menuRow ? (
            <View style={styles.unitSheet}>
              <Text variant="heading" numberOfLines={1}>
                {menuRow.name.trim() || t('recipeEdit.ingredient')}
              </Text>
              <Text variant="label" color={colors.muted}>
                {t('recipeEdit.moveTo')}
              </Text>
              <View style={styles.unitGrid}>
                {[
                  { key: null, name: t('recipeEdit.noSection') },
                  ...sections.map((s) => ({
                    key: s.key as number | null,
                    name: s.name.trim() || t('recipeEdit.unnamedSection'),
                  })),
                ].map((option) => (
                  <Chip
                    key={option.key ?? 'none'}
                    title={option.name}
                    selected={menuRow.section === option.key}
                    accessibilityState={{ selected: menuRow.section === option.key }}
                    onPress={() => {
                      if (menuRow.section !== option.key) {
                        setRows((current) => moveRow(current, menuRow.key, option.key));
                      }
                      setMenuFor(null);
                    }}
                  />
                ))}
                <Chip
                  title={t('recipeEdit.addSection')}
                  dashed
                  onPress={() => {
                    // The sheet is still fading out, so the keyboard waits for a tap on the name.
                    const key = newSection(false);
                    setRows((current) => moveRow(current, menuRow.key, key));
                    setMenuFor(null);
                  }}
                />
              </View>
              <Button
                kind="danger"
                title={t('recipeEdit.removeIngredient')}
                onPress={() => {
                  setRows((current) => current.filter((r) => r.key !== menuRow.key));
                  setMenuFor(null);
                }}
              />
            </View>
          ) : null}
        </Pressable>
      </Modal>

      <Modal
        visible={pickingIcon}
        transparent
        animationType="fade"
        onRequestClose={() => setPickingIcon(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickingIcon(false)}>
          <View style={styles.unitSheet}>
            <Text variant="heading">{t('recipeEdit.icon')}</Text>
            <View style={styles.iconGrid}>
              {RECIPE_ICONS.map(({ icon: option }) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={option}
                  accessibilityState={{ selected: option === icon }}
                  onPress={() => {
                    setIcon(option);
                    setPickingIcon(false);
                  }}
                  style={[styles.iconOption, option === icon && styles.iconSelected]}>
                  <Text style={{ fontSize: 26, lineHeight: 34 }}>{option}</Text>
                </Pressable>
              ))}
            </View>
            <Chip
              title={t('recipeEdit.iconAuto')}
              selected={icon === null}
              onPress={() => {
                setIcon(null);
                setPickingIcon(false);
              }}
            />
          </View>
        </Pressable>
      </Modal>

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
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: 20, gap: 18, paddingBottom: 64 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSelected: { backgroundColor: colors.saffronSoft, borderWidth: 2, borderColor: colors.tomato },
  servingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ingredientRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  // A recipe section (#101): a bordered card with its name in a saffron field.
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  sectionNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionName: {
    flex: 1,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.saffronTint,
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  cell: {
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surface,
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: colors.ink,
  },
  qtyCell: { width: 56, paddingHorizontal: 4, textAlign: 'center' },
  unitCell: { width: 64, alignItems: 'center', justifyContent: 'center' },
  nameCell: { flex: 1, minWidth: 0, paddingHorizontal: 12 },
  cellActive: { borderWidth: 2, borderColor: colors.tomato, backgroundColor: colors.raised },
  suggestions: {
    marginTop: 4,
    marginLeft: 126,
    borderRadius: Radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
    overflow: 'hidden',
  },
  suggestion: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNumber: {
    marginTop: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.saffronSoft,
    textAlign: 'center',
    lineHeight: 26,
    overflow: 'hidden',
  },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 },
  unitSheet: { backgroundColor: colors.raised, borderRadius: 20, padding: 20, gap: 14 },
  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
