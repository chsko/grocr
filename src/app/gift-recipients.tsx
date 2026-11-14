import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { More } from '@/components/icons';
import { Button, Field, Loading, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { useFamily } from '@/lib/session';

type Recipient = {
  _id: Id<'giftRecipients'>;
  name: string;
  linkedUserId: Id<'users'> | null;
  linkedName: string | null;
};

/**
 * The people the family gives gifts to (#78). Linking one to a family member hides them from
 * that member. You are never offered as a link yourself (ADR 0002).
 */
export default function GiftRecipientsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const data = useQuery(api.gifts.recipients, { groupId: family.groupId });
  const addRecipient = useMutation(api.gifts.addRecipient);
  const linkRecipient = useMutation(api.gifts.linkRecipient);
  const [name, setName] = useState('');

  if (data === undefined) return <Loading />;
  const people = [...data.recipients].sort((a, b) => a.name.localeCompare(b.name, i18n.language));

  async function add() {
    const typed = name;
    if (typed.trim() === '') return;
    setName('');
    const id = await attempt(t, () => addRecipient({ groupId: family.groupId, name: typed }));
    if (id === undefined) setName((now) => (now === '' ? typed : now));
  }

  function pickMember(recipient: Recipient) {
    const free = data!.members.filter((m) => !m.linked);
    Alert.alert(
      t('gifts.people_screen.linkTitle', { name: recipient.name }),
      t('gifts.people_screen.linkBody', { name: recipient.name }),
      [
        ...free.map((m) => ({
          text: m.name,
          onPress: () =>
            void attempt(t, () =>
              linkRecipient({ recipientId: recipient._id, memberUserId: m.userId }),
            ),
        })),
        { text: t('common.cancel'), style: 'cancel' as const },
      ],
    );
  }

  function manage(recipient: Recipient) {
    Alert.alert(recipient.name, undefined, [
      recipient.linkedName === null
        ? { text: t('gifts.people_screen.link'), onPress: () => pickMember(recipient) }
        : {
            text: t('gifts.people_screen.unlink', { name: recipient.linkedName }),
            onPress: () =>
              Alert.alert(
                t('gifts.people_screen.unlinkTitle'),
                t('gifts.people_screen.unlinkBody', {
                  member: recipient.linkedName,
                  name: recipient.name,
                }),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('gifts.people_screen.unlinkConfirm'),
                    style: 'destructive',
                    onPress: () =>
                      void attempt(t, () =>
                        linkRecipient({ recipientId: recipient._id, memberUserId: null }),
                      ),
                  },
                ],
              ),
          },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Text color={colors.muted}>{t('gifts.people_screen.intro')}</Text>
      {people.length > 0 ? (
        <View style={styles.list}>
          {people.map((r, index) => (
            <Pressable
              key={r._id}
              accessibilityRole="button"
              onPress={() => manage(r)}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.divider,
                pressed && { opacity: 0.7 },
              ]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="item">{r.name}</Text>
                <Text variant="small" color={colors.muted}>
                  {r.linkedName
                    ? t('gifts.people_screen.linked', { name: r.linkedName })
                    : t('gifts.people_screen.notLinked')}
                </Text>
              </View>
              <More color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.addRow}>
        <Field
          label={t('gifts.people_screen.newName')}
          value={name}
          onChangeText={setName}
          maxLength={60}
          placeholder={t('gifts.people_screen.newPlaceholder')}
          returnKeyType="done"
          onSubmitEditing={() => void add()}
          style={{ flex: 1 }}
        />
        <Button
          kind="secondary"
          title={t('gifts.add')}
          disabled={name.trim() === ''}
          onPress={() => void add()}
        />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  list: { borderRadius: Radius.card, backgroundColor: colors.surface, paddingHorizontal: 14 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
}));
