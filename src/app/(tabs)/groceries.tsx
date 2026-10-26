import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Alert,
  Keyboard,
  Pressable,
  type ScrollViewInstance,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { GroceryLineEditor } from '@/components/grocery-line-editor';
import { AtHome, Check, ChevronDown, ChevronRight, Plus } from '@/components/icons';
import { Button, TabScreen, Text } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { mergeRows, type GroceryLine } from '@/convex/lib/merge';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { dayShort, formatAmounts, weekSpan, weekTitle } from '@/lib/format';
import { parseItemInput } from '@/lib/parse-item';
import { useSectionName } from '@/lib/sections';
import { useFamily } from '@/lib/session';
import { addDays, defaultGroceryWeek, startOfWeek, todayIn, type Weekday } from '@/lib/week';

/**
 * The week's shared grocery list (GRO-36, GRO-37): lines of the same ingredient merged, grouped
 * by store section, tap to tick. The house button on a line marks it as already at home (checked
 * in the fridge before going out), which moves it to its own group instead of the cart. Opens on
 * next week's list Fri-Sun (the family shops then).
 */
export default function GroceriesScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const sectionName = useSectionName();
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
        items: current.items.map((i) =>
          ids.has(i._id) ? { ...i, checked, atHome: checked ? false : i.atHome } : i,
        ),
      });
    },
  );
  const setAtHome = useMutation(api.grocery.setAtHome).withOptimisticUpdate(
    (store, { itemIds, atHome }) => {
      const current = store.getQuery(api.grocery.listForWeek, args);
      if (!current) return;
      const ids = new Set<string>(itemIds);
      store.setQuery(api.grocery.listForWeek, args, {
        ...current,
        items: current.items.map((i) =>
          ids.has(i._id) && !(atHome && i.checked) ? { ...i, atHome } : i,
        ),
      });
    },
  );
  const addManual = useMutation(api.grocery.addManual);
  const clearChecked = useMutation(api.grocery.clearChecked);
  const carryOver = useMutation(api.grocery.carryOver);

  const [text, setText] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [homeOpen, setHomeOpen] = useState(false);
  // The line being edited, by key, so it picks up rows added while the editor is open.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const [typing, setTyping] = useState(false);
  // The row just added from the field: its line flashes and is scrolled into view.
  const [added, setAdded] = useState<string | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const viewHeight = useRef(0);
  const sectionY = useRef(new Map<string, number>());
  const lineLayout = useRef(new Map<string, { y: number; height: number }>());
  const revealed = useRef<string | null>(null);

  const lines = useMemo(() => mergeRows(data?.items ?? [], data?.sectionOrder), [data]);
  const open = lines.filter((l) => !l.checked && !l.atHome);
  const home = lines.filter((l) => l.atHome);
  const editing = lines.find((l) => l.key === editingKey) ?? null;
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

  // With a single dinner on the list every line would name it, so the names only show once
  // there are two or more dinners to tell apart.
  const dinnerCount = useMemo(() => new Set(lines.flatMap((l) => l.entryIds)).size, [lines]);

  function sourceText(line: GroceryLine) {
    const meals = (dinnerCount > 1 ? line.entryIds : [])
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

  function markAtHome(line: GroceryLine, atHome: boolean) {
    if (atHome) void Haptics.selectionAsync().catch(() => {});
    void attempt(t, () => setAtHome({ itemIds: line.itemIds as Id<'groceryItems'>[], atHome }));
  }

  async function add() {
    const parsed = parseItemInput(text);
    if (!parsed.name) return;
    setText('');
    const id = await attempt(t, () => addManual({ ...args, ...parsed }));
    if (!id) return;
    setAdded(id);
    setTimeout(() => setAdded((current) => (current === id ? null : current)), 2500);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    AccessibilityInfo.announceForAccessibility(t('groceries.added', { name: parsed.name }));
  }

  /** Leaves typing mode; anything still in the field is added first. */
  function done() {
    if (text.trim()) void add();
    inputRef.current?.blur();
    Keyboard.dismiss();
  }

  /** Scrolls the just-added line into view once both it and its section have a position. */
  function reveal(line: GroceryLine) {
    if (!added || revealed.current === added || !line.itemIds.includes(added)) return;
    const top = sectionY.current.get(line.section);
    const box = lineLayout.current.get(line.key);
    if (top === undefined || !box) return;
    revealed.current = added;
    const y = top + box.y;
    const keyboard = Keyboard.isVisible() ? (Keyboard.metrics()?.height ?? 0) : 0;
    const visible = viewHeight.current - keyboard;
    if (y >= scrollY.current && y + box.height <= scrollY.current + visible) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  }

  // The new line often renders before the mutation resolves, so look for it after each render
  // too, not only when it lays out.
  useEffect(() => {
    open.forEach(reveal);
  });

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
        <Text color={colors.muted} style={{ fontSize: 15 }}>
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
      <View style={styles.addRow}>
        <View style={[styles.add, typing && styles.addTyping]}>
          <Plus color={typing ? colors.tomato : colors.muted} size={20} />
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            placeholder={t('groceries.addPlaceholder')}
            placeholderTextColor={colors.checkbox}
            accessibilityLabel={t('groceries.addLabel')}
            // Return adds the item and keeps the keyboard up for the next one; Done puts it away.
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => void add()}
            style={styles.addInput}
          />
        </View>
        {typing ? (
          <Pressable
            accessibilityRole="button"
            onPress={done}
            hitSlop={8}
            style={({ pressed }) => [styles.done, pressed && { opacity: 0.6 }]}>
            <Text variant="item" color={colors.tomato} style={{ fontFamily: Fonts.bold }}>
              {t('groceries.done')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <TabScreen
      header={header}
      scrollRef={scrollRef}
      onScroll={(e) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
      }}
      onLayout={(e) => {
        viewHeight.current = e.nativeEvent.layout.height;
      }}>
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
        <Text color={colors.muted} style={{ marginTop: 24 }}>
          {t('groceries.empty')}
        </Text>
      ) : null}

      {sections.map(({ section, lines: sectionLines }) => (
        <View
          key={section}
          style={{ marginTop: 14 }}
          onLayout={(e) => {
            sectionY.current.set(section, e.nativeEvent.layout.y);
            sectionLines.forEach(reveal);
          }}>
          <Text variant="section" color={colors.muted} style={{ marginBottom: 4 }}>
            {sectionName(section)}
          </Text>
          {sectionLines.map((line) => (
            <Pressable
              key={line.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: false }}
              // The row is one element to VoiceOver, so the house button is offered as an action.
              accessibilityActions={[
                { name: 'atHome', label: t('groceries.markAtHome', { name: line.name }) },
              ]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'atHome') markAtHome(line, true);
              }}
              onPress={() => toggle(line)}
              onLongPress={() => setEditingKey(line.key)}
              onLayout={(e) => {
                const { y, height } = e.nativeEvent.layout;
                lineLayout.current.set(line.key, { y, height });
                reveal(line);
              }}
              style={({ pressed }) => [styles.line, pressed && { opacity: 0.6 }]}>
              {added && line.itemIds.includes(added) ? <AddedFlash key={added} /> : null}
              <View style={styles.box} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="item">{line.name}</Text>
                {sourceText(line) ? (
                  <Text variant="small" color={colors.muted}>
                    {sourceText(line)}
                  </Text>
                ) : null}
              </View>
              <Text variant="item" style={{ fontSize: 16 }}>
                {formatAmounts(t, i18n.language, line.amounts)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('groceries.markAtHome', { name: line.name })}
                onPress={() => markAtHome(line, true)}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
                style={({ pressed }) => [styles.homeButton, pressed && { opacity: 0.5 }]}>
                <AtHome color={colors.muted} size={20} strokeWidth={1.8} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      ))}

      {home.length > 0 ? (
        <View style={styles.cart}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: homeOpen }}
            onPress={() => setHomeOpen(!homeOpen)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
            {homeOpen ? (
              <ChevronDown size={16} strokeWidth={2.2} />
            ) : (
              <ChevronRight size={16} strokeWidth={2.2} />
            )}
            <Text variant="item" style={{ fontSize: 15, fontFamily: Fonts.bold }}>
              {t('groceries.atHome', { count: home.length })}
            </Text>
          </Pressable>
          {homeOpen
            ? home.map((line) => (
                <Pressable
                  key={line.key}
                  accessibilityRole="button"
                  accessibilityLabel={t('groceries.backOnList', { name: line.name })}
                  onPress={() => markAtHome(line, false)}
                  style={styles.cartLine}>
                  <AtHome color={colors.muted} size={22} strokeWidth={1.8} />
                  <Text color={colors.muted} style={{ flex: 1, fontSize: 16 }}>
                    {line.name}
                  </Text>
                  <Text color={colors.muted} style={{ fontSize: 15 }}>
                    {formatAmounts(t, i18n.language, line.amounts)}
                  </Text>
                </Pressable>
              ))
            : null}
        </View>
      ) : null}

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
                    <Check color={colors.onTomato} size={14} strokeWidth={3} />
                  </View>
                  <Text
                    color={colors.muted}
                    style={{ flex: 1, textDecorationLine: 'line-through', fontSize: 16 }}>
                    {line.name}
                  </Text>
                  <Text color={colors.muted} style={{ fontSize: 15 }}>
                    {formatAmounts(t, i18n.language, line.amounts)}
                  </Text>
                </Pressable>
              ))
            : null}
        </View>
      ) : null}

      {editing ? (
        <GroceryLineEditor key={editing.key} line={editing} onClose={() => setEditingKey(null)} />
      ) : null}
    </TabScreen>
  );
}

/** A saffron wash behind a just-added line that fades away, so the eye finds the new item. */
function AddedFlash() {
  const styles = useStyles();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withDelay(700, withTiming(0, { duration: 900 }));
  }, [opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View testID="added-flash" pointerEvents="none" style={[styles.flash, fade]} />;
}

const useStyles = makeStyles((colors) => ({
  header: { paddingHorizontal: 20, paddingTop: 24, gap: 12, paddingBottom: 4 },
  // Same height and alignment as the Recipes title row (which has a 44pt button), so the
  // title does not jump when switching between the two tabs.
  titleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  switcher: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: Radius.field,
    backgroundColor: colors.surface,
  },
  switch: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  switchOn: { backgroundColor: colors.raised },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  add: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: Radius.field,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  addTyping: { borderColor: colors.tomato },
  done: { minHeight: 44, justifyContent: 'center' },
  flash: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -10,
    right: -10,
    borderRadius: 10,
    backgroundColor: colors.saffronSoft,
  },
  addInput: { flex: 1, fontFamily: Fonts.medium, fontSize: 16, color: colors.ink, height: '100%' },
  carry: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: colors.warningSurface,
    padding: 14,
    gap: 10,
  },
  carryButton: { minHeight: 40, borderRadius: 10, backgroundColor: colors.warningFill },
  line: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  // Pulls the 44pt target to the row's edge so it lines up with the amounts above and below.
  homeButton: {
    width: 36,
    minHeight: 44,
    marginLeft: -6,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.checkbox },
  boxOn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.tomatoFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cart: {
    marginTop: 22,
    borderRadius: 14,
    backgroundColor: colors.surface,
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
    borderTopColor: colors.border,
  },
}));
