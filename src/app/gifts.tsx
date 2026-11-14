import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
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
import { ChevronRight, Plus } from '@/components/icons';
import { Button, Chip, Field, Loading, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { GIFT_STATUSES, isSpent, type GiftStatus } from '@/convex/lib/gifts';
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
  const xmas = useQuery(api.gifts.christmas, { groupId: family.groupId });
  const addRecipient = useMutation(api.gifts.addRecipient);
  const setStatus = useSetGiftStatus();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<GiftStatus | null>(null);
  const [budgetFor, setBudgetFor] = useState<Id<'giftRecipients'> | null>(null);
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
  const { idea, bought, wrapped } = xmas.totals;
  const total = idea + bought + wrapped;
  const totalMoney = moneyLine(xmas.totals.spent, xmas.totals.budget);
  const editing = xmas.recipients.find((r) => r._id === budgetFor);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Text variant="heading" accessibilityRole="header">
        {t('gifts.christmasYear', { year: xmas.year })}
      </Text>
      {groups.length === 0 ? (
        <Text color={colors.muted}>{`${t('gifts.intro')} ${t('gifts.empty')}`}</Text>
      ) : null}

      {total > 0 ? (
        <View style={styles.summary}>
          <Text variant="item">
            {t('gifts.boughtOf', { done: bought + wrapped, count: total })}
          </Text>
          <ProgressBar bought={bought} wrapped={wrapped} total={total} />
          {totalMoney ? <Text color={colors.muted}>{totalMoney}</Text> : null}
        </View>
      ) : null}

      {total > 0 ? (
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

      {groups.map((group) => (
        <View key={group._id} style={styles.group}>
          <View style={styles.head}>
            <Text variant="item" style={{ flexShrink: 1 }}>
              {group.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('gifts.budgetTitle', { name: group.name })}
              hitSlop={8}
              onPress={() => setBudgetFor(group._id)}
              style={({ pressed }) => pressed && { opacity: 0.7 }}>
              <Text
                variant="small"
                color={group.spent > (group.budget ?? Infinity) ? colors.tomato : colors.muted}>
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
                    style={({ pressed }) => [{ flex: 1, gap: 2 }, pressed && { opacity: 0.7 }]}>
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
        </View>
      ))}

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
  year: number;
}) {
  const { t } = useTranslation();
  const addGift = useMutation(api.gifts.addGift);
  const [text, setText] = useState('');

  async function add() {
    const title = text;
    if (title.trim() === '') return;
    setText('');
    const id = await attempt(t, () => addGift({ recipientId, title, year }));
    if (id === undefined) setText((now) => (now === '' ? title : now));
  }

  return (
    <Field
      accessibilityLabel={t('gifts.newGiftFor', { name })}
      value={text}
      onChangeText={setText}
      maxLength={120}
      placeholder={t('gifts.newGiftFor', { name })}
      returnKeyType="done"
      blurOnSubmit={false}
      onSubmitEditing={() => void add()}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: 20, paddingBottom: 48, gap: 18 },
  group: { gap: 8 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
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
