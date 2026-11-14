import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { NameSheet, Sheet } from '@/components/gift-parts';
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
  archived: boolean;
};

/**
 * The people the family gives gifts to (#78). Linking one to a family member hides them from
 * that member. You are never offered as a link yourself, nor suggested (ADR 0002).
 */
export default function GiftRecipientsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const data = useQuery(api.gifts.recipients, { groupId: family.groupId });
  const addRecipient = useMutation(api.gifts.addRecipient);
  const linkRecipient = useMutation(api.gifts.linkRecipient);
  const renameRecipient = useMutation(api.gifts.renameRecipient);
  const [name, setName] = useState('');
  const [open, setOpen] = useState<{
    id: Id<'giftRecipients'>;
    mode: 'menu' | 'link' | 'rename';
  }>();

  if (data === undefined) return <Loading />;
  const sorted = [...data.recipients].sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  const active = sorted.filter((r) => !r.archived);
  const archived = sorted.filter((r) => r.archived);
  const unlinked = data.members.filter((m) => !m.linked);
  const current = sorted.find((r) => r._id === open?.id);

  async function add() {
    const typed = name;
    if (typed.trim() === '') return;
    setName('');
    const id = await attempt(t, () => addRecipient({ groupId: family.groupId, name: typed }));
    if (id === undefined) setName((now) => (now === '' ? typed : now));
  }

  function rows(list: Recipient[]) {
    return (
      <View style={styles.list}>
        {list.map((r, index) => (
          <Pressable
            key={r._id}
            accessibilityRole="button"
            onPress={() => setOpen({ id: r._id, mode: 'menu' })}
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
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Text color={colors.muted}>{t('gifts.people_screen.intro')}</Text>

      {unlinked.length > 0 ? (
        <View style={styles.suggest}>
          <Text variant="item">{t('gifts.people_screen.suggestTitle')}</Text>
          <Text color={colors.muted}>{t('gifts.people_screen.suggestBody')}</Text>
          {unlinked.map((m) => (
            <Button
              key={m.userId}
              kind="secondary"
              title={
                m.match
                  ? t('gifts.people_screen.suggestLink', { name: m.name })
                  : t('gifts.people_screen.suggestAdd', { name: m.name })
              }
              onPress={() =>
                void attempt(t, () =>
                  m.match
                    ? linkRecipient({ recipientId: m.match, memberUserId: m.userId })
                    : addRecipient({
                        groupId: family.groupId,
                        name: m.name,
                        memberUserId: m.userId,
                      }),
                )
              }
            />
          ))}
        </View>
      ) : null}

      {active.length > 0 ? rows(active) : null}
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

      {archived.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text variant="label" color={colors.muted} accessibilityRole="header">
            {t('gifts.people_screen.archivedTitle')}
          </Text>
          {rows(archived)}
        </View>
      ) : null}

      {current && open?.mode === 'menu' ? (
        <ManageSheet
          recipient={current}
          canLink={unlinked.length > 0}
          onLink={() => setOpen({ id: current._id, mode: 'link' })}
          onRename={() => setOpen({ id: current._id, mode: 'rename' })}
          onClose={() => setOpen(undefined)}
        />
      ) : null}
      {current && open?.mode === 'link' ? (
        <Sheet onClose={() => setOpen(undefined)}>
          <Text variant="heading">
            {t('gifts.people_screen.linkTitle', { name: current.name })}
          </Text>
          <Text color={colors.muted}>
            {t('gifts.people_screen.linkBody', { name: current.name })}
          </Text>
          {unlinked.map((m) => (
            <Button
              key={m.userId}
              kind="secondary"
              title={m.name}
              onPress={async () => {
                setOpen(undefined);
                await attempt(t, () =>
                  linkRecipient({ recipientId: current._id, memberUserId: m.userId }),
                );
              }}
            />
          ))}
        </Sheet>
      ) : null}
      {current && open?.mode === 'rename' ? (
        <NameSheet
          title={t('gifts.people_screen.renameTitle', { name: current.name })}
          label={t('gifts.people_screen.newName')}
          initial={current.name}
          onSave={(next) => renameRecipient({ recipientId: current._id, name: next })}
          onClose={() => setOpen(undefined)}
        />
      ) : null}
    </ScrollView>
  );
}

/** What can be done with one person: link or unlink, rename, archive or restore, delete. */
function ManageSheet({
  recipient,
  canLink,
  onLink,
  onRename,
  onClose,
}: {
  recipient: Recipient;
  canLink: boolean;
  onLink: () => void;
  onRename: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const linkRecipient = useMutation(api.gifts.linkRecipient);
  const setArchived = useMutation(api.gifts.setRecipientArchived);
  const removeRecipient = useMutation(api.gifts.removeRecipient);
  const recipientId = recipient._id;

  function unlink() {
    Alert.alert(
      t('gifts.people_screen.unlinkTitle'),
      t('gifts.people_screen.unlinkBody', { member: recipient.linkedName, name: recipient.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('gifts.people_screen.unlinkConfirm'),
          style: 'destructive',
          onPress: () => {
            onClose();
            void attempt(t, () => linkRecipient({ recipientId, memberUserId: null }));
          },
        },
      ],
    );
  }

  function remove() {
    Alert.alert(
      t('gifts.people_screen.deleteTitle', { name: recipient.name }),
      t('gifts.people_screen.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('gifts.people_screen.delete'),
          style: 'destructive',
          onPress: () => {
            onClose();
            void attempt(t, () => removeRecipient({ recipientId }));
          },
        },
      ],
    );
  }

  return (
    <Sheet onClose={onClose}>
      <Text variant="heading">{recipient.name}</Text>
      {recipient.linkedName !== null ? (
        <Button
          kind="secondary"
          title={t('gifts.people_screen.unlink', { name: recipient.linkedName })}
          onPress={unlink}
        />
      ) : canLink ? (
        <Button kind="secondary" title={t('gifts.people_screen.link')} onPress={onLink} />
      ) : null}
      <Button kind="secondary" title={t('gifts.people_screen.rename')} onPress={onRename} />
      <Button
        kind="secondary"
        title={t(
          recipient.archived ? 'gifts.people_screen.restore' : 'gifts.people_screen.archive',
        )}
        onPress={() => {
          onClose();
          void attempt(t, () => setArchived({ recipientId, archived: !recipient.archived }));
        }}
      />
      <Button kind="danger" title={t('gifts.people_screen.delete')} onPress={remove} />
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  list: { borderRadius: Radius.card, backgroundColor: colors.surface, paddingHorizontal: 14 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  suggest: { gap: 10, padding: 16, borderRadius: Radius.card, backgroundColor: colors.saffronTint },
}));
