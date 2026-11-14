import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { NameSheet } from '@/components/gift-parts';
import { ChevronRight, Plus } from '@/components/icons';
import { Button, Field, Loading, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
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
  const [adding, setAdding] = useState(false);

  if (xmas === undefined) return <Loading />;
  const groups = [...xmas.recipients].sort((a, b) => a.name.localeCompare(b.name, i18n.language));

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

      {groups.map((group) => (
        <View key={group._id} style={styles.group}>
          <Text variant="item">{group.name}</Text>
          {group.gifts.length > 0 ? (
            <View style={styles.list}>
              {group.gifts.map((gift, index) => (
                <View key={gift._id} style={[styles.row, index > 0 && styles.divider]}>
                  <Text style={{ flex: 1 }}>{gift.title}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <AddGift recipientId={group._id} name={group.name} year={xmas.year} />
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
