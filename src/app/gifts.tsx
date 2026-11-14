import { useMutation, useQuery } from 'convex/react';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import {
  BudgetSheet,
  NameSheet,
  ProgressBar,
  StatusPill,
  useMoneyLine,
} from '@/components/gift-parts';
import { Disclosure } from '@/components/disclosure';
import { Check, ChevronLeft, ChevronRight, Person, Plus } from '@/components/icons';
import { Button, Chip, Field, IconButton, Loading, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  GIFT_STATUSES,
  isSpent,
  MAX_GIFT_YEAR,
  MIN_GIFT_YEAR,
  type GiftStatus,
} from '@/convex/lib/gifts';
import { recipeSite } from '@/convex/lib/recipeLink';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { formatKroner } from '@/lib/format';
import { useFamily } from '@/lib/session';

/**
 * Christmas gifts (#78): one list for a Christmas, grouped by gift recipient like the grocery
 * list. Recipients linked to the signed-in member never come back from the server, so nothing
 * here can show what is planned for them.
 */
export default function GiftsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const family = useFamily();
  // Null is this Christmas, which moves on by itself on 1 January.
  const [year, setYear] = useState<number | null>(null);
  const xmas = useQuery(
    api.gifts.christmas,
    year === null ? { groupId: family.groupId } : { groupId: family.groupId, year },
  );
  // Recipients picked to fill in an earlier Christmas they have nothing in yet.
  const [extra, setExtra] = useState<Id<'giftRecipients'>[]>([]);
  const addRecipient = useMutation(api.gifts.addRecipient);
  const setStatus = useSetGiftStatus();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<GiftStatus | null>(null);
  // Groups folded shut on this screen; they open again next time the screen opens.
  const [closed, setClosed] = useState<string[]>([]);
  function toggle(key: string) {
    setClosed((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));
  }
  const [budgetFor, setBudgetFor] = useState<Id<'giftRecipients'> | null>(null);
  const [tab, setTab] = useState<'christmas' | 'bank'>('christmas');
  const moneyLine = useMoneyLine();

  if (xmas === undefined) return <Loading />;
  const sorted = [...xmas.recipients].sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  // A status filter shows only matching gifts and leaves out recipients with none of them.
  const groups =
    filter === null
      ? sorted
      : sorted
          .map((r) => ({ ...r, gifts: r.gifts.filter((g) => g.status === filter) }))
          .filter((r) => r.gifts.length > 0);
  // Gift groups as headings, in name order, with everyone not in a group last.
  const sections: {
    key: string;
    title: string | null;
    done: boolean;
    people: typeof groups;
  }[] = [];
  for (const g of xmas.groups) {
    const people = groups.filter((r) => r.giftGroupId === g._id);
    if (people.length > 0) sections.push({ key: g._id, title: g.name, done: g.done, people });
  }
  const loose = groups.filter((r) => !xmas.groups.some((g) => g._id === r.giftGroupId));
  if (loose.length > 0) {
    sections.push({
      key: 'none',
      title: sections.length > 0 ? t('gifts.noGroup') : null,
      done: false,
      people: loose,
    });
  }
  const { idea, bought, wrapped } = xmas.totals;
  const total = idea + bought + wrapped;
  const totalMoney = moneyLine(xmas.totals.spent, xmas.totals.budget);
  const editing = xmas.recipients.find((r) => r._id === budgetFor);
  const past = xmas.year < xmas.currentYear;
  const picked = xmas.others.filter((r) => extra.includes(r._id));
  const unpicked = xmas.others.filter((r) => !extra.includes(r._id));
  function go(next: number | null) {
    setYear(next === xmas?.currentYear ? null : next);
    setExtra([]);
    setFilter(null);
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button
              kind="ghost"
              title={t('gifts.people')}
              icon={<Person color={colors.tomato} size={20} strokeWidth={2} />}
              onPress={() => router.push('/gift-recipients')}
            />
          ),
        }}
      />
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['christmas', 'bank'] as const).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabOn]}>
            <Text variant="label" color={tab === key ? colors.ink : colors.muted}>
              {key === 'christmas' ? t('gifts.christmasTab') : t('gifts.ideasTitle')}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'bank' ? <IdeaBank /> : null}
      {tab === 'christmas' ? (
        <View style={styles.stepper}>
          <IconButton
            label={t('gifts.previousYearLabel')}
            disabled={xmas.year <= MIN_GIFT_YEAR}
            onPress={() => go(xmas.year - 1)}>
            <ChevronLeft color={colors.ink} size={22} />
          </IconButton>
          <View style={styles.year}>
            <Text variant="heading" accessibilityRole="header">
              {t('gifts.christmasYear', { year: xmas.year })}
            </Text>
            {xmas.year !== xmas.currentYear ? (
              <Chip title={t('gifts.thisYear')} onPress={() => go(null)} />
            ) : null}
          </View>
          {xmas.year <= xmas.currentYear && xmas.year < MAX_GIFT_YEAR ? (
            <IconButton label={t('gifts.nextYearLabel')} onPress={() => go(xmas.year + 1)}>
              <ChevronRight color={colors.ink} size={22} />
            </IconButton>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>
      ) : null}

      {tab === 'christmas' && groups.length === 0 && picked.length === 0 ? (
        <Text color={colors.muted}>
          {past ? t('gifts.noPeopleThisYear') : `${t('gifts.intro')} ${t('gifts.empty')}`}
        </Text>
      ) : null}

      {tab === 'christmas' && total > 0 ? (
        <View style={styles.summary}>
          <Text variant="item">
            {t('gifts.boughtOf', { done: bought + wrapped, count: total })}
          </Text>
          <ProgressBar bought={bought} wrapped={wrapped} total={total} />
          {totalMoney ? <Text color={colors.muted}>{totalMoney}</Text> : null}
        </View>
      ) : null}

      {tab === 'christmas' && total > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          <Chip
            title={t('gifts.filterAll')}
            selected={filter === null}
            accessibilityState={{ selected: filter === null }}
            onPress={() => setFilter(null)}
          />
          {GIFT_STATUSES.map((status) => (
            <Chip
              key={status}
              title={t(`gifts.status.${status}`)}
              selected={filter === status}
              accessibilityState={{ selected: filter === status }}
              onPress={() => setFilter(filter === status ? null : status)}
            />
          ))}
        </ScrollView>
      ) : null}

      {(tab === 'christmas' ? sections : []).map((section) => (
        <View key={section.key} style={styles.section}>
          {section.title !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: !closed.includes(section.key) }}
              onPress={() => toggle(section.key)}
              style={({ pressed }) => [styles.sectionHead, pressed && { opacity: 0.7 }]}>
              <Disclosure open={!closed.includes(section.key)} color={colors.ink} />
              <Text variant="label" accessibilityRole="header" style={{ flex: 1 }}>
                {section.title.toLocaleUpperCase()}
              </Text>
              <Text variant="small" color={colors.muted}>
                {t('gifts.peopleCount', { count: section.people.length })}
              </Text>
              {section.done ? (
                <View
                  style={styles.done}
                  accessible
                  accessibilityLabel={t('gifts.groupDone', { name: section.title })}>
                  <Check color={colors.ink} size={14} strokeWidth={3} />
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {section.title !== null && closed.includes(section.key) ? null : (
            <View style={section.title !== null ? styles.members : styles.section}>
              {section.people.map((group) => (
                <View key={group._id} style={styles.group}>
                  <View style={styles.head}>
                    <Text variant="item">{group.name}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('gifts.budgetTitle', { name: group.name })}
                      hitSlop={8}
                      onPress={() => setBudgetFor(group._id)}
                      style={({ pressed }) => [
                        { alignSelf: 'flex-start' },
                        pressed && { opacity: 0.7 },
                      ]}>
                      <Text
                        variant="small"
                        color={
                          group.spent > (group.budget ?? Infinity) ? colors.tomato : colors.muted
                        }>
                        {moneyLine(group.spent, group.budget) ?? t('gifts.setBudget')}
                      </Text>
                    </Pressable>
                  </View>
                  {group.gifts.length > 0 ? (
                    <View style={styles.list}>
                      {group.gifts.map((gift, index) => (
                        <View key={gift._id} style={[styles.row, index > 0 && styles.divider]}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={gift.title}
                            onPress={() => router.push(`/gift/${gift._id}`)}
                            style={({ pressed }) => [
                              { flex: 1, gap: 2 },
                              pressed && { opacity: 0.7 },
                            ]}>
                            <Text>{gift.title}</Text>
                            <GiftLine gift={gift} />
                          </Pressable>
                          <StatusPill
                            title={gift.title}
                            status={gift.status}
                            onChange={(status) =>
                              void attempt(t, () => setStatus({ giftId: gift._id, status }))
                            }
                          />
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {filter === null ? (
                    <AddGift recipientId={group._id} name={group.name} year={xmas.year} />
                  ) : null}
                  {filter === null && group.bankCount > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={6}
                      onPress={() => setTab('bank')}
                      style={({ pressed }) => pressed && { opacity: 0.7 }}>
                      <Text variant="small" color={colors.muted}>
                        {t('gifts.bankCount', { count: group.bankCount })}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>
      ))}

      {tab === 'christmas'
        ? picked.map((r) => (
            <View key={r._id} style={styles.group}>
              <Text variant="item">{r.name}</Text>
              <AddGift recipientId={r._id} name={r.name} year={xmas.year} />
            </View>
          ))
        : null}
      {tab === 'christmas' && past && unpicked.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text variant="label" color={colors.muted}>
            {t('gifts.addPastFor')}
          </Text>
          <View style={styles.wrap}>
            {unpicked.map((r) => (
              <Chip key={r._id} dashed title={r.name} onPress={() => setExtra([...extra, r._id])} />
            ))}
          </View>
        </View>
      ) : null}

      <Button
        kind="ghost"
        title={t('gifts.addPerson')}
        icon={<Plus color={colors.tomato} size={20} strokeWidth={2.2} />}
        onPress={() => setAdding(true)}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/gift-recipients')}
        style={styles.setting}>
        <Text>{t('gifts.people')}</Text>
        <ChevronRight color={colors.muted} size={18} />
      </Pressable>

      {editing ? (
        <BudgetSheet
          recipientId={editing._id}
          name={editing.name}
          year={xmas.year}
          budget={editing.budget}
          lastBudget={editing.lastBudget}
          onClose={() => setBudgetFor(null)}
        />
      ) : null}

      {adding ? (
        <NameSheet
          title={t('gifts.addPerson')}
          label={t('gifts.people_screen.newName')}
          initial=""
          onSave={(name) => addRecipient({ groupId: family.groupId, name })}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </ScrollView>
  );
}

/** The idea bank tab: ideas per recipient, noted all year, moved into a Christmas with a tap. */
function IdeaBank() {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const bank = useQuery(api.gifts.ideas, { groupId: family.groupId });
  const moveGift = useMutation(api.gifts.moveGift);
  const setStatus = useSetGiftStatus();
  if (bank === undefined) return <Loading />;
  const groups = [...bank.recipients].sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  return (
    <>
      <Text color={colors.muted}>{t('gifts.ideasIntro')}</Text>
      {groups.map((group) => (
        <View key={group._id} style={styles.group}>
          <Text variant="item">{group.name}</Text>
          {group.ideas.length > 0 ? (
            <View style={styles.list}>
              {group.ideas.map((idea, index) => (
                <View key={idea._id} style={[styles.row, index > 0 && styles.divider]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={idea.title}
                    onPress={() => router.push(`/gift/${idea._id}`)}
                    style={({ pressed }) => [{ flex: 1, gap: 2 }, pressed && { opacity: 0.7 }]}>
                    <Text>{idea.title}</Text>
                    <GiftLine gift={idea} />
                  </Pressable>
                  <Chip
                    title={t('gifts.moveIn', { year: bank.currentYear })}
                    accessibilityLabel={`${idea.title}: ${t('gifts.moveIn', { year: bank.currentYear })}`}
                    onPress={() =>
                      void attempt(t, () => moveGift({ giftId: idea._id, year: bank.currentYear }))
                    }
                  />
                  <StatusPill
                    title={idea.title}
                    status={idea.status}
                    onChange={(status) =>
                      void attempt(t, () => setStatus({ giftId: idea._id, status }))
                    }
                  />
                </View>
              ))}
            </View>
          ) : null}
          <AddGift recipientId={group._id} name={group.name} />
        </View>
      ))}
    </>
  );
}

/** Price, buyer and shop under a gift's title, when there are any. */
function GiftLine({
  gift,
}: {
  gift: { price: number | null; buyerName: string | null; url: string | null };
}) {
  const colors = useColors();
  const { i18n } = useTranslation();
  const parts = [
    gift.price === null ? null : formatKroner(i18n.language, gift.price),
    gift.buyerName,
    gift.url === null ? null : recipeSite(gift.url),
  ].filter((part) => part !== null && part !== '');
  if (parts.length === 0) return null;
  return (
    <Text variant="small" color={colors.muted} numberOfLines={1}>
      {parts.join(' · ')}
    </Text>
  );
}

/** Moves a gift's status at once on every open Christmas list; the server's answer follows. */
function useSetGiftStatus() {
  return useMutation(api.gifts.setGiftStatus).withOptimisticUpdate((store, { giftId, status }) => {
    // A bank idea that is bought or wrapped leaves the bank for this Christmas.
    for (const { args, value } of store.getAllQueries(api.gifts.ideas)) {
      if (!value || status === 'idea') continue;
      store.setQuery(api.gifts.ideas, args, {
        ...value,
        recipients: value.recipients.map((r) => ({
          ...r,
          ideas: r.ideas.filter((g) => g._id !== giftId),
        })),
      });
    }
    for (const { args, value } of store.getAllQueries(api.gifts.christmas)) {
      const moved = value?.recipients.flatMap((r) => r.gifts).find((g) => g._id === giftId);
      if (!value || moved === undefined || moved.status === status) continue;
      const from = moved.status;
      // Spent and planned follow the price across the Idea line.
      const money = (isSpent(status) ? 1 : 0) - (isSpent(from) ? 1 : 0);
      const cost = (moved.price ?? 0) * money;
      const shift = <T extends Record<GiftStatus, number> & { spent: number; planned: number }>(
        c: T,
      ): T => ({
        ...c,
        [from]: c[from] - 1,
        [status]: c[status] + 1,
        spent: c.spent + cost,
        planned: c.planned - cost,
      });
      store.setQuery(api.gifts.christmas, args, {
        ...value,
        totals: shift(value.totals),
        recipients: value.recipients.map((r) =>
          r.gifts.some((g) => g._id === giftId)
            ? {
                ...r,
                ...(() => {
                  const next = shift({ ...r.counts, spent: r.spent, planned: r.planned });
                  const { spent, planned, ...counts } = next;
                  return { counts, spent, planned };
                })(),
                gifts: r.gifts.map((g) => (g._id === giftId ? { ...g, status } : g)),
              }
            : r,
        ),
      });
    }
  });
}

/** The add field under a recipient's gifts. Clears at once; a failed add puts the text back. */
function AddGift({
  recipientId,
  name,
  year,
}: {
  recipientId: Id<'giftRecipients'>;
  name: string;
  /** Left out for the idea bank. */
  year?: number;
}) {
  const { t } = useTranslation();
  const addGift = useMutation(api.gifts.addGift);
  const label = t(year === undefined ? 'gifts.newIdeaFor' : 'gifts.newGiftFor', { name });
  const [text, setText] = useState('');

  async function add() {
    const title = text;
    if (title.trim() === '') return;
    setText('');
    const id = await attempt(t, () =>
      addGift(year === undefined ? { recipientId, title } : { recipientId, title, year }),
    );
    if (id === undefined) setText((now) => (now === '' ? title : now));
  }

  return (
    <Field
      accessibilityLabel={label}
      value={text}
      onChangeText={setText}
      maxLength={120}
      placeholder={label}
      returnKeyType="done"
      blurOnSubmit={false}
      onSubmitEditing={() => void add()}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: 20, paddingBottom: 48, gap: 18 },
  group: { gap: 8 },
  section: { gap: 12 },
  sectionHead: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
  },
  // People in a group stand indented behind a saffron rule, so each group reads as one block.
  members: {
    gap: 18,
    marginLeft: 7,
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderLeftColor: colors.saffronPill,
  },
  done: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.saffronPill,
  },
  head: { gap: 2 },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.pill,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  tabOn: { backgroundColor: colors.raised },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  year: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  summary: { gap: 10, padding: 16, borderRadius: Radius.card, backgroundColor: colors.saffronTint },
  chips: { gap: 8 },
  list: { borderRadius: Radius.card, backgroundColor: colors.surface, paddingHorizontal: 14 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  setting: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
}));
