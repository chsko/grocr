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
  SectionList,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronRight } from '@/components/icons';
import { Button, Chip, Field, Loading, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { cleanName, normalizeName, placeSection } from '@/convex/lib/catalog';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { sectionName } from '@/lib/sections';
import { useFamily } from '@/lib/session';

// Same cap as the server (ingredients.MAX_ITEM_NAME); function files can't be imported here.
const MAX_ITEM_NAME = 80;

type Item = {
  _id: Id<'ingredients'>;
  name: string;
  normalizedName: string;
  section: string;
  aliases: string[];
  recipeCount: number;
};

/** True when the item is called, or answers to, the normalized text (or contains it). */
function matches(item: Item, needle: string, exact = false) {
  const names = [item.normalizedName, ...item.aliases];
  return exact ? names.includes(needle) : names.some((n) => n.includes(needle));
}

/**
 * The family's items (GRO-63): every name recipes and grocery lists have used, by section. Tap
 * one to rename it, move it to another section, or merge it into an item that is the same thing.
 */
export default function ItemsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const family = useFamily();
  const items = useQuery(api.ingredients.list, { groupId: family.groupId });
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState<Id<'ingredients'> | null>(null);

  if (items === undefined) return <Loading />;

  const needle = normalizeName(filter);
  const shown = needle === '' ? items : items.filter((i) => matches(i, needle));
  const keys = family.sections.map((s) => s.key);
  const sections = family.sections
    .map((section) => ({
      key: section.key,
      title: sectionName(t, section),
      data: shown.filter((i) => placeSection(i.section, keys) === section.key),
    }))
    .filter((s) => s.data.length > 0);
  // Gone once it is merged into another item, and the editor closes with it.
  const editing = items.find((i) => i._id === editingId);

  return (
    <>
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(item) => item._id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={{ gap: 14, paddingBottom: 4 }}>
            <Text color={colors.muted}>{t('items.intro')}</Text>
            {items.length > 0 ? (
              <Field
                value={filter}
                onChangeText={setFilter}
                placeholder={t('items.search')}
                accessibilityLabel={t('items.search')}
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text color={colors.muted} style={{ marginTop: 12 }}>
            {items.length === 0 ? t('items.empty') : t('items.noMatch', { text: filter.trim() })}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text variant="section" color={colors.muted} style={styles.sectionHead}>
            {`${section.title} · ${section.data.length}`}
          </Text>
        )}
        renderItem={({ item, index, section }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t('items.editHint')}
            onPress={() => setEditingId(item._id)}
            style={({ pressed }) => [
              styles.row,
              index > 0 && styles.divider,
              index === 0 && styles.first,
              index === section.data.length - 1 && styles.last,
              pressed && { opacity: 0.6 },
            ]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="item">{item.name}</Text>
              <Text variant="small" color={colors.muted} numberOfLines={1}>
                {details(t, item)}
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={18} />
          </Pressable>
        )}
      />
      {editing ? (
        <ItemEditor item={editing} items={items} onClose={() => setEditingId(null)} />
      ) : null}
    </>
  );
}

/** "In 2 recipes · also mlek, h-melk" */
function details(t: ReturnType<typeof useTranslation>['t'], item: Item) {
  const parts = [
    item.recipeCount > 0 ? t('items.inRecipes', { count: item.recipeCount }) : t('items.noRecipes'),
  ];
  if (item.aliases.length > 0)
    parts.push(t('items.alsoCalled', { names: item.aliases.join(', ') }));
  return parts.join(' · ');
}

/** Rename, re-section or merge one item. */
function ItemEditor({ item, items, onClose }: { item: Item; items: Item[]; onClose: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const family = useFamily();
  const rename = useMutation(api.ingredients.rename);
  const setSection = useMutation(api.ingredients.setSection);
  const merge = useMutation(api.ingredients.merge);
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const [mergeText, setMergeText] = useState<string | null>(null);
  const keys = family.sections.map((s) => s.key);
  const section = placeSection(item.section, keys);
  const mergeNeedle = normalizeName(mergeText ?? '');
  const candidates =
    mergeNeedle === ''
      ? []
      : items.filter((i) => i._id !== item._id && matches(i, mergeNeedle)).slice(0, 8);

  function confirmMerge(into: Item) {
    Alert.alert(
      t('groceries.mergeTitle', { from: item.name, into: into.name }),
      t('groceries.mergeBody', { from: item.name, into: into.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('groceries.merge'),
          // The item disappears from the list, which closes this editor.
          onPress: () => void attempt(t, () => merge({ fromId: item._id, intoId: into._id })),
        },
      ],
    );
  }

  async function save() {
    const next = cleanName(name).slice(0, MAX_ITEM_NAME);
    if (next === '') return;
    if (next !== item.name) {
      const normalized = normalizeName(next);
      const taken =
        normalized === item.normalizedName
          ? undefined
          : items.find((i) => i._id !== item._id && matches(i, normalized, true));
      if (taken) {
        Alert.alert(t('items.takenTitle', { name: taken.name }), t('items.takenBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('groceries.merge'), onPress: () => confirmMerge(taken) },
        ]);
        return;
      }
      setBusy(true);
      const saved = await attempt(t, () =>
        rename({ ingredientId: item._id, name: next }).then(() => true),
      );
      setBusy(false);
      if (!saved) return;
    }
    onClose();
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('common.close')} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="handled"
          style={[styles.sheetScroll, { maxHeight: height * 0.85 }]}
          contentContainerStyle={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={{ gap: 2 }}>
            <Text variant="heading">{item.name}</Text>
            <Text variant="small" color={colors.muted}>
              {details(t, item)}
            </Text>
          </View>
          <Field
            label={t('items.nameLabel')}
            value={name}
            onChangeText={setName}
            maxLength={MAX_ITEM_NAME}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
          />
          <Text variant="label" color={colors.muted}>
            {t('groceries.section')}
          </Text>
          <View style={styles.chips}>
            {family.sections.map((s) => (
              <Chip
                key={s.key}
                title={sectionName(t, s)}
                selected={section === s.key}
                accessibilityState={{ selected: section === s.key }}
                onPress={() =>
                  void attempt(t, () => setSection({ ingredientId: item._id, section: s.key }))
                }
              />
            ))}
          </View>
          {mergeText === null ? (
            <Button
              kind="ghost"
              title={t('groceries.sameAs')}
              style={{ alignSelf: 'flex-start' }}
              onPress={() => setMergeText('')}
            />
          ) : (
            <View style={{ gap: 6 }}>
              <Field
                label={t('groceries.sameAsLabel', { name: item.name })}
                value={mergeText}
                onChangeText={setMergeText}
                autoFocus
                autoCorrect={false}
                placeholder={t('groceries.sameAsPlaceholder')}
              />
              <View style={styles.chips}>
                {candidates.map((m) => (
                  <Chip key={m._id} title={m.name} onPress={() => confirmMerge(m)} />
                ))}
              </View>
            </View>
          )}
          <Button
            title={t('common.save')}
            loading={busy}
            disabled={name.trim() === ''}
            onPress={() => void save()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: 20, paddingBottom: 40 },
  sectionHead: { marginTop: 22, marginBottom: 6 },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  first: { borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card },
  last: { borderBottomLeftRadius: Radius.card, borderBottomRightRadius: Radius.card },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheetScroll: {
    flexGrow: 0,
    backgroundColor: colors.raised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheet: { padding: 20, gap: 14 },
}));
