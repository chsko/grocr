import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Platform, ScrollView, type ScrollViewInstance, View } from 'react-native';

import { Close } from '@/components/icons';
import { Button, Chip, Field, IconButton, Loading, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { normalizeName } from '@/convex/lib/catalog';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { useItemSuggestions } from '@/lib/item-suggestions';
import { addStapleUpdate, isPendingStaple, useSetStaple } from '@/lib/optimistic';
import { useSectionName } from '@/lib/sections';
import { useFamily } from '@/lib/session';

/**
 * The family's staples (GRO-62): things bought most weeks. Each week's grocery list offers the
 * ones not on it yet. Typing suggests the family's items, so "melk" doesn't become a second milk.
 */
export default function StaplesScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const sectionName = useSectionName();
  const staples = useQuery(api.staples.list, { groupId: family.groupId });
  const [picked] = useState(() => new Map<string, { name: string; section: string }>());
  // A new staple shows in the list at once; the server's answer then puts its real item there.
  const add = useMutation(api.staples.add).withOptimisticUpdate(
    addStapleUpdate(
      family.sections.map((s) => s.key),
      picked,
    ),
  );
  const set = useSetStaple();
  const [text, setText] = useState('');
  const matches = useItemSuggestions(family.groupId, text);

  // Keep the field and its suggestions just above the keyboard as the list grows. iOS insets the
  // scroll view by what the keyboard covers; Android gets the same room as bottom padding.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const focused = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (e) => {
      if (Platform.OS === 'android') setKeyboardHeight(e.endCoordinates.height);
      if (focused.current) scrollRef.current?.scrollToEnd({ animated: true });
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  if (staples === undefined) return <Loading />;

  const isStaple = new Set<string>(staples.map((s) => s._id));
  const suggestions = matches.filter((m) => !isStaple.has(m._id));
  const sorted = [...staples].sort((a, b) => a.name.localeCompare(b.name, i18n.language));

  async function addStaple(pick?: { _id: Id<'ingredients'>; name: string; section: string }) {
    const typed = text;
    const name = pick?.name ?? typed;
    if (name.trim() === '') return;
    // The field clears at once; a failed add puts the text back.
    setText('');
    // A typed name that is already a staple needs no round trip.
    if (!pick && staples!.some((s) => normalizeName(s.name) === normalizeName(name))) return;
    // A typed name that is one of the suggestions is that item.
    const item = pick ?? matches.find((m) => normalizeName(m.name) === normalizeName(name));
    if (item) picked.set(item._id, item);
    const id = await attempt(t, () =>
      add({ groupId: family.groupId, name, ingredientId: item?._id }),
    );
    if (id === undefined) setText((now) => (now === '' ? typed : now));
  }

  return (
    <ScrollView
      ref={scrollRef}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      onContentSizeChange={() => {
        if (focused.current && Keyboard.isVisible()) {
          scrollRef.current?.scrollToEnd({ animated: true });
        }
      }}
      contentContainerStyle={[styles.content, { paddingBottom: 20 + keyboardHeight }]}>
      <Text color={colors.muted}>{t('staples.intro')}</Text>
      {sorted.length === 0 ? (
        <Text color={colors.muted}>{t('staples.empty')}</Text>
      ) : (
        <View style={styles.list}>
          {sorted.map((staple, index) => (
            <View key={staple._id} style={[styles.row, index > 0 && styles.divider]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="item">{staple.name}</Text>
                <Text variant="small" color={colors.muted}>
                  {sectionName(staple.section)}
                </Text>
              </View>
              <IconButton
                label={t('staples.remove', { name: staple.name })}
                onPress={() => {
                  // A staple still on its way has no item to change yet.
                  if (isPendingStaple(staple._id)) return;
                  void attempt(t, () => set({ ingredientId: staple._id, staple: false }));
                }}>
                <Close color={colors.muted} size={20} />
              </IconButton>
            </View>
          ))}
        </View>
      )}
      <View style={styles.addRow}>
        <Field
          label={t('staples.newLabel')}
          value={text}
          onChangeText={setText}
          maxLength={80}
          placeholder={t('staples.newPlaceholder')}
          returnKeyType="done"
          onSubmitEditing={() => void addStaple()}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
          }}
          style={{ flex: 1 }}
        />
        <Button
          kind="secondary"
          title={t('staples.add')}
          disabled={text.trim() === ''}
          onPress={() => void addStaple()}
        />
      </View>
      {suggestions.length > 0 ? (
        <View style={styles.chips}>
          {suggestions.map((m) => (
            <Chip key={m._id} title={m.name} onPress={() => void addStaple(m)} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: 20, gap: 16 },
  list: { borderRadius: Radius.card, backgroundColor: colors.surface, paddingHorizontal: 14 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
