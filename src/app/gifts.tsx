import { useMutation, useQuery } from 'convex/react';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, type StyleProp, View, type ViewStyle } from 'react-native';

import {
  BudgetSheet,
  NameSheet,
  ProgressBar,
  StatusPill,
  useMoneyLine,
} from '@/components/gift-parts';
import { CardGrid } from '@/components/card-grid';
import { Disclosure, FoldAll } from '@/components/disclosure';
import { Check, ChevronLeft, ChevronRight, Plus } from '@/components/icons';
import { Button, Chip, Field, IconButton, Loading, QuietField, Text } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
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
import { useDesktop } from '@/lib/desktop';
import { matchesSearch } from '@/lib/search';
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
  const [search, setSearch] = useState('');
  // Groups folded shut on this screen; they open again next time the screen opens.
  const [closed, setClosed] = useState<string[]>([]);
  function toggle(key: string) {
    setClosed((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));
  }
  const [budgetFor, setBudgetFor] = useState<Id<'giftRecipients'> | null>(null);
  const [tab, setTab] = useState<'christmas' | 'bank'>('christmas');
  const moneyLine = useMoneyLine();
  const desktop = useDesktop();

  if (xmas === undefined) return <Loading />;
  const sorted = [...xmas.recipients].sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  // A status filter shows only matching gifts and leaves out recipients with none of them.
  const groups =
    filter === null
      ? sorted
      : sorted
          .map((r) => ({ ...r, gifts: r.gifts.filter((g) => g.status === filter) }))
          .filter((r) => r.gifts.length > 0);
  // A search keeps the people whose own name or group name matches.
  const searching = search.trim() !== '';
  const groupNames = new Map(xmas.groups.map((g) => [g._id, g.name]));
  const found = groups.filter((r) =>
    matchesSearch(search, r.name, r.giftGroupId ? groupNames.get(r.giftGroupId) : null),
  );
  // Gift groups as headings, in name order, with everyone not in a group last.
  const sections: {
    key: string;
    title: string | null;
    done: boolean;
    people: typeof groups;
  }[] = [];
  for (const g of xmas.groups) {
    const people = found.filter((r) => r.giftGroupId === g._id);
    if (people.length > 0) sections.push({ key: g._id, title: g.name, done: g.done, people });
  }
  const loose = found.filter((r) => !xmas.groups.some((g) => g._id === r.giftGroupId));
  if (loose.length > 0) {
    sections.push({
      key: 'none',
      title: sections.length > 0 ? t('gifts.noGroup') : null,
      done: false,
      people: loose,
    });
  }
  const foldable = sections.filter((x) => x.title !== null).map((x) => x.key);
  // Fold all shows from two real groups, as on Personer; it still folds "No group" too.
  const groupKeys = foldable.filter((k) => k !== 'none');
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
    setSearch('');
  }

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push('/gift-recipients')}
            style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.6 }]}>
            <Text variant="item" color={colors.tomato}>
              {t('gifts.people')}
            </Text>
          </Pressable>
        ),
      }}
    />
  );

  const tabs = (
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
  );

  // Year, progress and filters: above the list on a phone, in a side column on a big screen.
  const overview = (
    <>
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

      {tab === 'christmas' && sorted.length === 0 && picked.length === 0 ? (
        <Text color={colors.muted}>
          {past ? t('gifts.noPeopleThisYear') : `${t('gifts.intro')} ${t('gifts.empty')}`}
        </Text>
      ) : null}

      {/* Kept while a filter is on, so it can always be turned off again. */}
      {tab === 'christmas' && (total > 0 || filter !== null) ? (
        <View style={styles.summary}>
          <Text variant="item">
            {t('gifts.boughtOf', { done: bought + wrapped, count: total })}
          </Text>
          <ProgressBar bought={bought} wrapped={wrapped} total={total} />
          {totalMoney ? <Text color={colors.muted}>{totalMoney}</Text> : null}
          {/* The counts are the legend of the bar and the status filter in one. */}
          <View style={styles.filters}>
            {GIFT_STATUSES.map((status) => {
              const on = filter === status;
              const count = xmas.totals[status];
              return (
                <Pressable
                  key={status}
                  accessibilityRole="button"
                  accessibilityLabel={t(`gifts.statusCount.${status}`, { count })}
                  accessibilityHint={t('gifts.filterBy', { status: t(`gifts.status.${status}`) })}
                  accessibilityState={{ selected: on, disabled: count === 0 && !on }}
                  disabled={count === 0 && !on}
                  hitSlop={4}
                  onPress={() => setFilter(on ? null : status)}
                  style={({ pressed }) => [
                    styles.filter,
                    on && styles.filterOn,
                    pressed && { opacity: 0.7 },
                  ]}>
                  <View style={[styles.dot, styles[`dot_${status}`], on && styles.dotOn]} />
                  <Text
                    variant="label"
                    color={on ? colors.background : count === 0 ? colors.muted : colors.ink}>
                    {t(`gifts.statusCount.${status}`, { count })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {tab === 'christmas' && (xmas.recipients.length >= SEARCH_FROM || searching) ? (
        <Field
          value={search}
          onChangeText={setSearch}
          placeholder={t('gifts.searchPeople')}
          accessibilityLabel={t('gifts.searchPeople')}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          maxLength={60}
        />
      ) : null}
      {tab === 'christmas' && searching && sections.length === 0 ? (
        <Text color={colors.muted}>{t('gifts.noSearchMatch')}</Text>
      ) : null}
      {tab === 'christmas' && !searching && filter !== null && sections.length === 0 ? (
        <Text color={colors.muted}>{t('gifts.noFilterMatch')}</Text>
      ) : null}
    </>
  );

  const addPerson = (
    <Button
      kind="ghost"
      title={t('gifts.addPerson')}
      icon={<Plus color={colors.tomato} size={20} strokeWidth={2.2} />}
      onPress={() => setAdding(true)}
    />
  );

  const list = (
    <>
      {tab === 'bank' ? <IdeaBank desktop={desktop} /> : null}
      {tab === 'christmas' && groupKeys.length >= 2 && !searching ? (
        <FoldAll
          count={groupKeys.length}
          allClosed={foldable.every((k) => closed.includes(k))}
          onPress={(close) => setClosed(close ? foldable : [])}
        />
      ) : null}
      {(tab === 'christmas' ? sections : []).map((section) => (
        <View key={section.key} style={styles.section}>
          {section.title !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: searching || !closed.includes(section.key) }}
              onPress={() => toggle(section.key)}
              style={({ pressed }) => [styles.sectionHead, pressed && { opacity: 0.7 }]}>
              <Disclosure open={searching || !closed.includes(section.key)} color={colors.ink} />
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                {section.title}
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
          {section.title !== null && !searching && closed.includes(section.key) ? null : (
            <People
              desktop={desktop}
              style={section.title !== null ? styles.members : styles.section}>
              {section.people.map((group) => (
                <View key={group._id} style={[styles.group, desktop && styles.card]}>
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
                  {group.gifts.length > 0 || filter === null ? (
                    <View style={[styles.list, desktop && styles.flat]}>
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
                            <GiftLine gift={gift} forId={group._id} />
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
                      {filter === null ? (
                        <AddGift
                          recipientId={group._id}
                          name={group.name}
                          year={xmas.year}
                          divider={group.gifts.length > 0}
                        />
                      ) : null}
                    </View>
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
            </People>
          )}
        </View>
      ))}

      {tab === 'christmas'
        ? picked.map((r) => (
            <View key={r._id} style={styles.group}>
              <Text variant="item">{r.name}</Text>
              <View style={styles.list}>
                <AddGift recipientId={r._id} name={r.name} year={xmas.year} />
              </View>
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
    </>
  );

  const sheets = (
    <>
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
    </>
  );

  if (desktop) {
    return (
      <View style={styles.desktop}>
        {header}
        <ScrollView style={styles.side} contentContainerStyle={styles.sideContent}>
          {tabs}
          {overview}
          {addPerson}
        </ScrollView>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={styles.main}>
          {list}
        </ScrollView>
        {sheets}
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      {header}
      {tabs}
      {tab === 'bank' ? null : overview}
      {list}
      {addPerson}
      {sheets}
    </ScrollView>
  );
}

/** A group's people: indented under the heading on a phone, cards in columns on a big screen. */
function People({
  desktop,
  style,
  children,
}: {
  desktop: boolean;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (desktop) return <CardGrid>{children}</CardGrid>;
  return <View style={style}>{children}</View>;
}

/** The idea bank tab: ideas per recipient, noted all year, moved into a Christmas with a tap. */
function IdeaBank({ desktop }: { desktop: boolean }) {
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
      <Text color={colors.muted} style={desktop && { maxWidth: 640 }}>
        {t('gifts.ideasIntro')}
      </Text>
      <People desktop={desktop} style={styles.section}>
        {groups.map((group) => (
          <View key={group._id} style={[styles.group, desktop && styles.card]}>
            <Text variant="item">{group.name}</Text>
            <View style={[styles.list, desktop && styles.flat]}>
              {group.ideas.map((idea, index) => (
                <View key={idea._id} style={[styles.idea, index > 0 && styles.divider]}>
                  <View style={styles.ideaTop}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={idea.title}
                      onPress={() => router.push(`/gift/${idea._id}`)}
                      style={({ pressed }) => [{ flex: 1, gap: 2 }, pressed && { opacity: 0.7 }]}>
                      <Text>{idea.title}</Text>
                      <GiftLine gift={idea} forId={group._id} />
                    </Pressable>
                    <StatusPill
                      title={idea.title}
                      status={idea.status}
                      onChange={(status) =>
                        void attempt(t, () => setStatus({ giftId: idea._id, status }))
                      }
                    />
                  </View>
                  {/* Under the title, so a long idea never has to break mid-word beside it. */}
                  <View style={{ alignItems: 'flex-start' }}>
                    <Chip
                      title={t('gifts.moveIn', { year: bank.currentYear })}
                      accessibilityLabel={`${idea.title}: ${t('gifts.moveIn', { year: bank.currentYear })}`}
                      onPress={() =>
                        void attempt(t, () =>
                          moveGift({ giftId: idea._id, year: bank.currentYear }),
                        )
                      }
                    />
                  </View>
                </View>
              ))}
              <AddGift recipientId={group._id} name={group.name} divider={group.ideas.length > 0} />
            </View>
          </View>
        ))}
      </People>
    </>
  );
}

/** Who else a joint gift is for, price, buyer and shop under a gift's title, when any. */
function GiftLine({
  gift,
  forId,
}: {
  gift: {
    price: number | null;
    buyerName: string | null;
    url: string | null;
    recipients: { _id: Id<'giftRecipients'>; name: string }[];
  };
  /** The person the gift is listed under. */
  forId: Id<'giftRecipients'>;
}) {
  const colors = useColors();
  const { t, i18n } = useTranslation();
  const others = gift.recipients.filter((r) => r._id !== forId).map((r) => r.name);
  const parts = [
    others.length === 0
      ? null
      : t('gifts.jointWith', {
          names: others.join(', '),
        }),
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
        split = 1,
      ): T => ({
        ...c,
        [from]: c[from] - 1,
        [status]: c[status] + 1,
        spent: c.spent + cost / split,
        planned: c.planned - cost / split,
      });
      store.setQuery(api.gifts.christmas, args, {
        ...value,
        totals: shift(value.totals),
        recipients: value.recipients.map((r) =>
          r.gifts.some((g) => g._id === giftId)
            ? {
                ...r,
                ...(() => {
                  // A joint gift moves only this person's share of the price.
                  const share = moved.recipients.length;
                  const next = shift({ ...r.counts, spent: r.spent, planned: r.planned }, share);
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

/**
 * The last line of a recipient's gifts: a quiet "+ New gift" that takes typing in place, so the
 * gifts stay what the eye lands on. Clears at once; a failed add puts the text back.
 */
function AddGift({
  recipientId,
  name,
  year,
  divider,
}: {
  recipientId: Id<'giftRecipients'>;
  name: string;
  /** Left out for the idea bank. */
  year?: number;
  /** A rule above it, when gifts stand over it. */
  divider?: boolean;
}) {
  const styles = useStyles();
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
    <QuietField
      accessibilityLabel={label}
      value={text}
      onChangeText={setText}
      maxLength={120}
      placeholder={t(year === undefined ? 'gifts.newIdea' : 'gifts.newGift')}
      returnKeyType="done"
      blurOnSubmit={false}
      onSubmitEditing={() => void add()}
      style={divider && styles.divider}
    />
  );
}

/** With no groups, the search shows once the list is this long. */
const SEARCH_FROM = 8;

const useStyles = makeStyles((colors) => ({
  // Room on both sides, so the label sits centred in the header's own button shape.
  headerButton: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center' },
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
  // A group's name outranks the people in it, so the group reads as the level above them.
  sectionTitle: { flex: 1, fontFamily: Fonts.bold, fontSize: 20, lineHeight: 26 },
  // People in a group stand indented behind a thin rule, so each group reads as one block.
  members: {
    gap: 18,
    marginLeft: 7,
    paddingLeft: 14,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderStrong,
  },
  idea: { gap: 8, paddingVertical: 12 },
  ideaTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  // The counts in the summary: legend and filter at once.
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: colors.raised,
  },
  filterOn: { backgroundColor: colors.ink },
  dot: { width: 10, height: 10, borderRadius: 5 },
  // On the dark selected pill the dot keeps a light ring, so it still reads.
  dotOn: { borderWidth: 1.5, borderColor: colors.background, opacity: 1 },
  dot_idea: { backgroundColor: colors.saffronSoft, borderWidth: 1, borderColor: colors.saffronInk },
  dot_bought: { backgroundColor: colors.saffronInk, opacity: 0.5 },
  dot_wrapped: { backgroundColor: colors.saffronInk },
  // In a desktop card the card is the box; the gifts stand straight in it.
  flat: { backgroundColor: 'transparent', paddingHorizontal: 0 },
  list: { borderRadius: Radius.card, backgroundColor: colors.surface, paddingHorizontal: 14 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  // Big screens: overview in a side column, the people as cards in columns beside it.
  desktop: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  side: { width: 340, flexGrow: 0, borderRightWidth: 1, borderRightColor: colors.border },
  sideContent: { padding: 24, gap: 18 },
  main: { padding: 24, paddingBottom: 48, gap: 24 },
  card: {
    padding: 16,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
  },
}));
