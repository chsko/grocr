import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { GroceryLineEditor } from '@/components/grocery-line-editor';
import { Check, ChevronDown, ChevronRight, Plus } from '@/components/icons';
import { Button, TabScreen, Text } from '@/components/ui';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { mergeRows, type GroceryLine } from '@/convex/lib/merge';
import { attempt } from '@/lib/errors';
import { dayShort, formatAmounts, weekSpan, weekTitle } from '@/lib/format';
import { parseItemInput } from '@/lib/parse-item';
import { useFamily } from '@/lib/session';
import { addDays, defaultGroceryWeek, startOfWeek, todayIn, type Weekday } from '@/lib/week';

/**
 * The week's shared grocery list (GRO-36, GRO-37): lines of the same ingredient merged, grouped
 * by store section, tap to tick. Opens on next week's list Fri-Sun (the family shops then).
 */
export default function GroceriesScreen() {
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const { start } = useLocalSearchParams<{ start?: string }>();
  const weekStartsOn = family.weekStartsOn as Weekday;
  const thisWeek = startOfWeek(todayIn(family.timezone), weekStartsOn);
  const nextWeek = addDays(thisWeek, 7);
  // The Week tab's banner opens a given week; a later banner tap wins over the switcher.
  const [picked, setPicked] = useState<string | null>(null);
  const [seenStart, setSeenStart] = useState(start);
  if (start !== seenStart) {
    setSeenStart(start);
    setPicked(null);
  }
  const fromBanner = start === thisWeek || start === nextWeek ? start : null;
  const startDate =
    picked ?? fromBanner ?? defaultGroceryWeek(todayIn(family.timezone), weekStartsOn).startDate;
  const setStartDate = setPicked;

  const args = { groupId: family.groupId, startDate };
  const data = useQuery(api.grocery.listForWeek, args);
  const setChecked = useMutation(api.grocery.setChecked).withOptimisticUpdate(
    (store, { itemIds, checked }) => {
      const current = store.getQuery(api.grocery.listForWeek, args);
      if (!current) return;
      const ids = new Set<string>(itemIds);
      store.setQuery(api.grocery.listForWeek, args, {
        ...current,
        items: current.items.map((i) => (ids.has(i._id) ? { ...i, checked } : i)),
      });
    },
  );
  const addManual = useMutation(api.grocery.addManual);
  const clearChecked = useMutation(api.grocery.clearChecked);
  const carryOver = useMutation(api.grocery.carryOver);

  const [text, setText] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [editing, setEditing] = useState<GroceryLine | null>(null);

  const lines = useMemo(() => mergeRows(data?.items ?? []), [data]);
  const open = lines.filter((l) => !l.checked);
  const cart = lines.filter((l) => l.checked);
  const sections = useMemo(() => {
    const groups: { section: string; lines: GroceryLine[] }[] = [];
    for (const line of open) {
      const last = groups[groups.length - 1];
      if (last?.section === line.section) last.lines.push(line);
      else groups.push({ section: line.section, lines: [line] });
    }
    return groups;
  }, [open]);

  function sourceText(line: GroceryLine) {
    const meals = line.entryIds
      .map((id) => data?.sources[id])
      .filter((s) => s !== undefined)
      .map((s) => `${s.title} (${dayShort(t, s.date)})`);
    const people = line.addedBy
      .map((id) => data?.addedBy[id])
      .filter(Boolean)
      .map((name) => t('groceries.addedBy', { name }));
    return [...meals, ...people].join(' · ');
  }

  function toggle(line: GroceryLine) {
    void attempt(t, () =>
      setChecked({ itemIds: line.itemIds as Id<'groceryItems'>[], checked: !line.checked }),
    );
  }

  async function add() {
    const parsed = parseItemInput(text);
    if (!parsed.name) return;
    setText('');
    await attempt(t, () => addManual({ ...args, ...parsed }));
  }

  function confirmClear() {
    Alert.alert(t('groceries.clearTitle'), t('groceries.clearBody', { count: cart.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groceries.clear'),
        style: 'destructive',
        onPress: () => void attempt(t, () => clearChecked(args)),
      },
    ]);
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text variant="title">{t('groceries.title')}</Text>
        <Text color={Colors.muted} style={{ fontSize: 15 }}>
          {`${weekTitle(t, startDate)} · ${weekSpan(t, startDate)}`}
        </Text>
      </View>
      <View accessibilityRole="tablist" style={styles.switcher}>
        {[
          { date: thisWeek, label: t('groceries.thisWeek') },
          { date: nextWeek, label: t('groceries.nextWeek') },
        ].map((option) => (
          <Pressable
            key={option.date}
            accessibilityRole="tab"
            accessibilityState={{ selected: startDate === option.date }}
            onPress={() => setStartDate(option.date)}
            style={[styles.switch, startDate === option.date && styles.switchOn]}>
            <Text variant="item" style={{ fontSize: 15 }}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.add}>
        <Plus color={Colors.muted} size={20} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('groceries.addPlaceholder')}
          placeholderTextColor={Colors.checkbox}
          accessibilityLabel={t('groceries.addLabel')}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={() => void add()}
          style={styles.addInput}
        />
      </View>
    </View>
  );

  return (
    <TabScreen header={header}>
      {startDate === thisWeek && data?.carryOver ? (
        <View style={styles.carry}>
          <Text style={{ fontSize: 15 }}>
            <Text style={{ fontFamily: Fonts.bold, fontSize: 15 }}>
              {t('groceries.carryTitle', { count: data.carryOver.count })}
            </Text>{' '}
            {t('groceries.carryBody')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              title={t('groceries.carryMove', { count: data.carryOver.count })}
              style={styles.carryButton}
              onPress={() => void attempt(t, () => carryOver({ ...args, move: true }))}
            />
            <Button
              kind="ghost"
              title={t('groceries.carryDismiss')}
              style={{ minHeight: 40, paddingHorizontal: 8 }}
              onPress={() => void attempt(t, () => carryOver({ ...args, move: false }))}
            />
          </View>
        </View>
      ) : null}

      {data && lines.length === 0 ? (
        <Text color={Colors.muted} style={{ marginTop: 24 }}>
          {t('groceries.empty')}
        </Text>
      ) : null}

      {sections.map(({ section, lines: sectionLines }) => (
        <View key={section} style={{ marginTop: 14 }}>
          <Text variant="section" color={Colors.muted} style={{ marginBottom: 4 }}>
            {t(`sections.${section as 'other'}`, { defaultValue: section })}
          </Text>
          {sectionLines.map((line) => (
            <Pressable
              key={line.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: false }}
              onPress={() => toggle(line)}
              onLongPress={() => setEditing(line)}
              style={({ pressed }) => [styles.line, pressed && { opacity: 0.6 }]}>
              <View style={styles.box} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="item">{line.name}</Text>
                {sourceText(line) ? (
                  <Text variant="small" color={Colors.muted}>
                    {sourceText(line)}
                  </Text>
                ) : null}
              </View>
              <Text variant="item" style={{ fontSize: 16 }}>
                {formatAmounts(t, i18n.language, line.amounts)}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}

      {cart.length > 0 ? (
        <View style={styles.cart}>
          <View style={styles.cartHead}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: cartOpen }}
              onPress={() => setCartOpen(!cartOpen)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
              {cartOpen ? (
                <ChevronDown size={16} strokeWidth={2.2} />
              ) : (
                <ChevronRight size={16} strokeWidth={2.2} />
              )}
              <Text variant="item" style={{ fontSize: 15, fontFamily: Fonts.bold }}>
                {t('groceries.inCart', { count: cart.length })}
              </Text>
            </Pressable>
            <Button kind="ghost" title={t('groceries.clearChecked')} onPress={confirmClear} />
          </View>
          {cartOpen
            ? cart.map((line) => (
                <Pressable
                  key={line.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: true }}
                  onPress={() => toggle(line)}
                  style={styles.cartLine}>
                  <View style={styles.boxOn}>
                    <Check color="#FFFFFF" size={14} strokeWidth={3} />
                  </View>
                  <Text
                    color={Colors.muted}
                    style={{ flex: 1, textDecorationLine: 'line-through', fontSize: 16 }}>
                    {line.name}
                  </Text>
                  <Text color={Colors.muted} style={{ fontSize: 15 }}>
                    {formatAmounts(t, i18n.language, line.amounts)}
                  </Text>
                </Pressable>
              ))
            : null}
        </View>
      ) : null}

      {editing ? (
        <GroceryLineEditor key={editing.key} line={editing} onClose={() => setEditing(null)} />
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 24, gap: 12, paddingBottom: 4 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  switcher: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: Radius.field,
    backgroundColor: Colors.surface,
  },
  switch: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  switchOn: { backgroundColor: '#FFFFFF' },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: Radius.field,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  addInput: { flex: 1, fontFamily: Fonts.medium, fontSize: 16, color: Colors.ink, height: '100%' },
  carry: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: Colors.warningSurface,
    padding: 14,
    gap: 10,
  },
  carryButton: { minHeight: 40, borderRadius: 10, backgroundColor: '#A3462B' },
  line: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  box: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Colors.checkbox },
  boxOn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.tomato,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cart: {
    marginTop: 22,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  cartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cartLine: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
