import { useMutation } from 'convex/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Field, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { parsePrice, type GiftStatus } from '@/convex/lib/gifts';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { formatKroner, priceInput } from '@/lib/format';
import { sheetIn } from '@/lib/motion';

/** A bottom sheet over a dimmed screen, for one small edit. */
export function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('common.close')} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={sheetIn}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>{children}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One text field and Save, for a name. */
export function NameSheet({
  title,
  label,
  initial,
  allowEmpty,
  onSave,
  onClose,
}: {
  title: string;
  label: string;
  initial: string;
  /** An empty name is a choice too (e.g. "use the recipients' names"). */
  allowEmpty?: boolean;
  onSave: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const blocked = name.trim() === '' && !allowEmpty;
  async function save() {
    if (blocked) return;
    if (name.trim() !== initial) {
      setBusy(true);
      const ok = await attempt(t, () => onSave(name).then(() => true));
      setBusy(false);
      if (!ok) return;
    }
    onClose();
  }
  return (
    <Sheet onClose={onClose}>
      <Text variant="heading">{title}</Text>
      <Field
        label={label}
        value={name}
        onChangeText={setName}
        maxLength={60}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void save()}
      />
      <Button
        title={t('common.save')}
        loading={busy}
        disabled={blocked}
        onPress={() => void save()}
      />
    </Sheet>
  );
}

const NEXT: Record<GiftStatus, GiftStatus> = { idea: 'bought', bought: 'wrapped', wrapped: 'idea' };

/** A gift's status as a small pill; tapping moves it on (Idea → Bought → Wrapped → Idea). */
export function StatusPill({
  title,
  status,
  onChange,
}: {
  title: string;
  status: GiftStatus;
  onChange: (status: GiftStatus) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const next = NEXT[status];
  const look =
    status === 'wrapped'
      ? { fill: colors.saffronPill, text: colors.ink, border: colors.saffronPill }
      : status === 'bought'
        ? { fill: colors.saffronSoft, text: colors.saffronInk, border: colors.saffronSoft }
        : { fill: colors.background, text: colors.muted, border: colors.borderStrong };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${t(`gifts.status.${status}`)}`}
      accessibilityHint={t('gifts.statusHint', { status: t(`gifts.status.${next}`) })}
      hitSlop={8}
      onPress={() => onChange(next)}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: look.fill, borderColor: look.border },
        pressed && { opacity: 0.7 },
      ]}>
      <Text variant="label" color={look.text} style={{ fontSize: 13 }}>
        {t(`gifts.status.${status}`)}
      </Text>
    </Pressable>
  );
}

/** How far the gifts are: wrapped first, then bought, on a saffron track. */
export function ProgressBar({
  bought,
  wrapped,
  total,
}: {
  bought: number;
  wrapped: number;
  total: number;
}) {
  const styles = useStyles();
  const share = (n: number) => `${total === 0 ? 0 : (n / total) * 100}%` as const;
  return (
    <View style={styles.track} accessible={false}>
      <View style={[styles.wrapped, { width: share(wrapped) }]} />
      <View style={[styles.bought, { width: share(bought) }]} />
    </View>
  );
}

/** A recipient's budget for one Christmas, with last year's amount one tap away. */
export function BudgetSheet({
  recipientId,
  name,
  year,
  budget,
  lastBudget,
  onClose,
}: {
  recipientId: Id<'giftRecipients'>;
  name: string;
  year: number;
  budget: number | null;
  lastBudget: number | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const setBudget = useMutation(api.gifts.setBudget);
  const [text, setText] = useState(() => priceInput(i18n.language, budget));
  const [busy, setBusy] = useState(false);
  const parsed = parsePrice(text);

  async function save(amount: number | null) {
    setBusy(true);
    const ok = await attempt(t, () => setBudget({ recipientId, year, amount }).then(() => true));
    setBusy(false);
    if (ok) onClose();
  }
  function submit() {
    if (parsed === null) return;
    if (parsed === undefined && budget === null) return onClose();
    void save(parsed ?? null);
  }

  return (
    <Sheet onClose={onClose}>
      <Text variant="heading">{t('gifts.budgetTitle', { name })}</Text>
      <Field
        label={t('gifts.budgetLabel')}
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        autoFocus
        maxLength={14}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {lastBudget !== null && lastBudget !== budget ? (
        <View style={{ flexDirection: 'row' }}>
          <Chip
            title={t('gifts.lastYear', { amount: formatKroner(i18n.language, lastBudget) })}
            onPress={() => setText(priceInput(i18n.language, lastBudget))}
          />
        </View>
      ) : null}
      <Button title={t('common.save')} loading={busy} disabled={parsed === null} onPress={submit} />
      {budget !== null ? (
        <Button kind="danger" title={t('gifts.removeBudget')} onPress={() => void save(null)} />
      ) : null}
    </Sheet>
  );
}

/** "300 kr av 1 000 kr · 700 kr igjen", or what fits when there is no budget. */
export function useMoneyLine() {
  const { t, i18n } = useTranslation();
  const kr = (amount: number) => formatKroner(i18n.language, amount);
  return (spent: number, budget: number | null) => {
    if (budget === null) return spent > 0 ? t('gifts.spentOnly', { spent: kr(spent) }) : null;
    const rest = Math.round((budget - spent) * 100) / 100;
    const tail =
      rest >= 0
        ? t('gifts.left', { amount: kr(rest) })
        : t('gifts.over', { amount: kr(Math.abs(rest)) });
    return `${t('gifts.spentOf', { spent: kr(spent), budget: kr(budget) })} · ${tail}`;
  };
}

const useStyles = makeStyles((colors) => ({
  pill: {
    minHeight: 30,
    minWidth: 68,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: colors.saffronSoft,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  wrapped: { height: '100%', backgroundColor: colors.saffronInk },
  bought: { height: '100%', backgroundColor: colors.saffronInk, opacity: 0.5 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.raised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
    // The website's column on big screens (phones are narrower anyway).
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
}));
