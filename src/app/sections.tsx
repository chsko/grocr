import { useMutation } from 'convex/react';
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

import { ChevronDown, ChevronUp } from '@/components/icons';
import { Button, Field, IconButton, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import {
  isSection,
  MAX_SECTION_NAME,
  MAX_SECTIONS,
  normalizeName,
  reorderSections,
  type FamilySection,
} from '@/convex/lib/catalog';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { sectionName } from '@/lib/sections';
import { useFamily } from '@/lib/session';

/**
 * The family's grocery list sections (GRO-51): add their own, rename or delete any but "other",
 * and put them in the order they walk through their store. jev sorts items into them.
 */
export default function SectionsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const family = useFamily();
  const reorder = useMutation(api.sections.reorder);
  const add = useMutation(api.sections.add);
  // A move still being saved, so it shows at once. When the save ends (or fails) the screen goes
  // back to the server's order, including other members' changes.
  const [pending, setPending] = useState<string[] | null>(null);
  // Only the latest move's save ends the pending state, so quick taps don't jump back and forth.
  const saves = useRef(0);
  const sections = pending ? reorderSections(family.sections, pending) : family.sections;
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<FamilySection | null>(null);

  /** False, after telling them, when another section already has this name. */
  function nameIsFree(name: string, except?: string) {
    const taken = sections.some(
      (s) => s.key !== except && normalizeName(sectionName(t, s)) === normalizeName(name),
    );
    if (taken) Alert.alert(t('errors.title'), t('errors.SECTION_EXISTS'));
    return !taken;
  }

  async function move(index: number, by: -1 | 1) {
    const next = sections.map((s) => s.key);
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setPending(next);
    const save = ++saves.current;
    await attempt(t, () => reorder({ groupId: family.groupId, keys: next }));
    if (save === saves.current) setPending(null);
  }

  async function addSection() {
    if (newName.trim() === '' || !nameIsFree(newName)) return;
    const key = await attempt(t, () => add({ groupId: family.groupId, name: newName }));
    if (key !== undefined) setNewName('');
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Text color={colors.muted}>{t('storeOrder.intro')}</Text>
      <View style={styles.list}>
        {sections.map((section, index) => {
          const name = sectionName(t, section);
          return (
            <View key={section.key} style={[styles.row, index > 0 && styles.divider]}>
              <Text variant="label" color={colors.muted} style={styles.number}>
                {index + 1}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('storeOrder.edit', { section: name })}
                onPress={() => setEditing(section)}
                style={({ pressed }) => [styles.name, pressed && { opacity: 0.6 }]}>
                <Text variant="item">{name}</Text>
              </Pressable>
              <IconButton
                label={t('storeOrder.up', { section: name })}
                disabled={index === 0}
                onPress={() => void move(index, -1)}>
                <ChevronUp color={index === 0 ? colors.checkbox : colors.ink} />
              </IconButton>
              <IconButton
                label={t('storeOrder.down', { section: name })}
                disabled={index === sections.length - 1}
                onPress={() => void move(index, 1)}>
                <ChevronDown color={index === sections.length - 1 ? colors.checkbox : colors.ink} />
              </IconButton>
            </View>
          );
        })}
      </View>
      {sections.length < MAX_SECTIONS ? (
        <View style={styles.addRow}>
          <Field
            label={t('storeOrder.newLabel')}
            value={newName}
            onChangeText={setNewName}
            maxLength={MAX_SECTION_NAME}
            placeholder={t('storeOrder.newPlaceholder')}
            returnKeyType="done"
            onSubmitEditing={() => void addSection()}
            style={{ flex: 1 }}
          />
          <Button
            kind="secondary"
            title={t('storeOrder.add')}
            disabled={newName.trim() === ''}
            onPress={() => void addSection()}
          />
        </View>
      ) : null}
      <Text variant="small" color={colors.muted}>
        {t('storeOrder.jevNote')}
      </Text>
      {editing ? (
        <SectionEditor section={editing} nameIsFree={nameIsFree} onClose={() => setEditing(null)} />
      ) : null}
    </ScrollView>
  );
}

/** Rename or delete one section. */
function SectionEditor({
  section,
  nameIsFree,
  onClose,
}: {
  section: FamilySection;
  nameIsFree: (name: string, except?: string) => boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const family = useFamily();
  const rename = useMutation(api.sections.rename);
  const remove = useMutation(api.sections.remove);
  const current = sectionName(t, section);
  const [name, setName] = useState(current);
  const builtIn = isSection(section.key);
  const standard = sectionName(t, { key: section.key });

  async function save(next: string) {
    const trimmed = next.trim();
    if (!builtIn && trimmed === '') return;
    // Nothing, or a built-in section's standard name, gives it back its translated name.
    const stored = builtIn && (trimmed === '' || trimmed === standard) ? '' : trimmed;
    if ((stored === '' ? undefined : stored) !== section.name) {
      if (stored !== '' && !nameIsFree(stored, section.key)) return;
      await attempt(t, () => rename({ groupId: family.groupId, key: section.key, name: stored }));
    }
    onClose();
  }

  function confirmRemove() {
    Alert.alert(
      t('storeOrder.deleteTitle', { section: current }),
      t('storeOrder.deleteBody', { section: current }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('storeOrder.delete'),
          style: 'destructive',
          onPress: () => {
            onClose();
            void attempt(t, () => remove({ groupId: family.groupId, key: section.key }));
          },
        },
      ],
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('common.close')} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text variant="heading">{current}</Text>
          <Field
            label={t('storeOrder.nameLabel')}
            value={name}
            onChangeText={setName}
            maxLength={MAX_SECTION_NAME}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void save(name)}
          />
          {builtIn && section.name !== undefined ? (
            <Button
              kind="ghost"
              title={t('storeOrder.standardName', { name: standard })}
              style={{ alignSelf: 'flex-start' }}
              onPress={() => void save('')}
            />
          ) : null}
          <Button
            title={t('common.save')}
            disabled={!builtIn && name.trim() === ''}
            onPress={() => void save(name)}
          />
          {section.key === 'other' ? (
            <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
              {t('storeOrder.otherStays')}
            </Text>
          ) : (
            <Button
              kind="danger"
              title={t('storeOrder.delete')}
              style={{ alignSelf: 'center' }}
              onPress={confirmRemove}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: 20, gap: 16 },
  list: { borderRadius: Radius.card, backgroundColor: colors.surface, paddingHorizontal: 14 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  number: { width: 20, textAlign: 'center' },
  name: { flex: 1, minHeight: 44, justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.raised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
  },
}));
