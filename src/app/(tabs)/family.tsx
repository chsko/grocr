import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Clock, More, Plus } from '@/components/icons';
import { Avatar, Button, IconButton, TabScreen, Text } from '@/components/ui';
import { AvatarColors, Colors, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { attempt } from '@/lib/errors';
import { dayMonth } from '@/lib/format';
import { setLanguagePreference, useLanguagePreference } from '@/lib/i18n/preference';
import { useMe } from '@/lib/session';

// Each language is named in itself, so it can be found from either.
const LANGUAGE_NAMES = { nb: 'Norsk', en: 'English' } as const;

/** Members, invites and settings (GRO-26). The owner manages members; anyone can leave. */
export default function FamilyScreen() {
  const { t } = useTranslation();
  const { user, family } = useMe();
  const groupId = family!.groupId;
  const isOwner = family!.role === 'owner';
  const members = useQuery(api.groups.members, { groupId });
  const invite = useQuery(api.invites.active, { groupId });
  const revoke = useMutation(api.invites.revoke);
  const removeMember = useMutation(api.groups.removeMember);
  const transferOwnership = useMutation(api.groups.transferOwnership);
  const leave = useMutation(api.groups.leave);
  const { signOut } = useAuthActions();
  const [now] = useState(() => Date.now());
  const language = useLanguagePreference();

  function pickLanguage() {
    Alert.alert(t('family.language'), undefined, [
      { text: t('family.languageValue'), onPress: () => void setLanguagePreference('system') },
      { text: LANGUAGE_NAMES.nb, onPress: () => void setLanguagePreference('nb') },
      { text: LANGUAGE_NAMES.en, onPress: () => void setLanguagePreference('en') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function manage(member: { membershipId: Id<'memberships'>; name: string }) {
    Alert.alert(member.name, undefined, [
      {
        text: t('family.makeOwner'),
        onPress: () =>
          Alert.alert(
            t('family.makeOwnerTitle', { name: member.name }),
            t('family.makeOwnerBody'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('family.makeOwner'),
                onPress: () =>
                  void attempt(t, () => transferOwnership({ membershipId: member.membershipId })),
              },
            ],
          ),
      },
      {
        text: t('family.remove'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('family.removeTitle', { name: member.name }), t('family.removeBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('family.remove'),
              style: 'destructive',
              onPress: () =>
                void attempt(t, () => removeMember({ membershipId: member.membershipId })),
            },
          ]),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function confirmLeave() {
    const alone = members?.length === 1;
    Alert.alert(t('family.leaveTitle'), alone ? t('family.leaveLastBody') : t('family.leaveBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('family.leave'),
        style: 'destructive',
        onPress: () => void attempt(t, () => leave({ groupId })),
      },
    ]);
  }

  const hoursLeft = invite ? Math.max(1, Math.round((invite.expiresAt - now) / 3600000)) : 0;

  return (
    <TabScreen>
      <View style={{ paddingTop: 24 }}>
        <Text variant="label" color={Colors.muted}>
          {t('family.title')}
        </Text>
        <Text variant="title">{family!.name}</Text>
      </View>

      <View style={styles.sectionHead}>
        <Text variant="section" color={Colors.muted}>
          {t('family.members', { count: members?.length ?? 0 })}
        </Text>
        {isOwner ? (
          <Pressable
            onPress={() => router.push('/invite')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.invite, pressed && { opacity: 0.8 }]}>
            <Plus color="#FFFFFF" size={18} strokeWidth={2.2} />
            <Text variant="item" color="#FFFFFF" style={{ fontSize: 15 }}>
              {t('family.invite')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {members?.map((m, index) => (
        <View key={m.membershipId} style={styles.member}>
          <Avatar name={m.name} color={AvatarColors[index % AvatarColors.length]} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="item">{m.name}</Text>
            <Text variant="small" color={Colors.muted}>
              {[
                m.role === 'owner' ? t('family.owner') : t('family.member'),
                m.isMe
                  ? t('family.you')
                  : t('family.joined', {
                      date: dayMonth(t, new Date(m.joinedAt).toISOString().slice(0, 10)),
                    }),
              ].join(' · ')}
            </Text>
          </View>
          {isOwner && !m.isMe ? (
            <IconButton label={t('family.manage', { name: m.name })} onPress={() => manage(m)}>
              <More color={Colors.muted} />
            </IconButton>
          ) : null}
        </View>
      ))}
      {invite ? (
        <View style={styles.pending}>
          <Clock color={Colors.tomato} size={20} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="item" style={{ fontSize: 15 }}>
              {t('family.pendingInvite')}
            </Text>
            <Text variant="small" color={Colors.muted}>
              {t('family.pendingDetail', {
                code: `${invite.code.slice(0, 3)} ${invite.code.slice(3)}`,
                count: hoursLeft,
              })}
            </Text>
          </View>
          <Button
            kind="danger"
            title={t('family.revoke')}
            onPress={() => void attempt(t, () => revoke({ inviteId: invite.inviteId }))}
          />
        </View>
      ) : null}

      <Text variant="section" color={Colors.muted} style={{ marginTop: 28, marginBottom: 4 }}>
        {t('family.settings')}
      </Text>
      <View style={styles.setting}>
        <Text>{t('family.weekStarts')}</Text>
        <Text color={Colors.muted}>{t('dates.dayLong.mon')}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={pickLanguage} style={styles.setting}>
        <Text>{t('family.language')}</Text>
        <Text color={Colors.muted}>
          {language === 'system' ? t('family.languageValue') : LANGUAGE_NAMES[language]}
        </Text>
      </Pressable>
      <View style={styles.setting}>
        <Text>{t('family.account')}</Text>
        <Text color={Colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
          {user.email ?? user.name}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.setting}>
        <Text>{t('account.signOut')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={confirmLeave}
        style={[styles.setting, { borderBottomWidth: 0 }]}>
        <Text color={Colors.danger}>{t('family.leave')}</Text>
      </Pressable>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  invite: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tomato,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  member: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  pending: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.dashed,
    paddingVertical: 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  setting: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
});
