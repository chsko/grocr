import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';

import { ChevronRight, Clock, More, Plus } from '@/components/icons';
import { Avatar, Button, IconButton, TabScreen, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  makeStyles,
  setAppearancePreference,
  useAppearancePreference,
  useColors,
} from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { dayMonth } from '@/lib/format';
import { setLanguagePreference, useLanguagePreference } from '@/lib/i18n/preference';
import { useMe } from '@/lib/session';

// Each language is named in itself, so it can be found from either.
const LANGUAGE_NAMES = { nb: 'Norsk', en: 'English' } as const;

/** Members, invites and settings (GRO-26). The owner manages members; anyone can leave. */
export default function FamilyScreen() {
  const colors = useColors();
  const styles = useStyles();
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
  const deleteAccount = useMutation(api.account.deleteAccount);
  const { signOut } = useAuthActions();
  const [now] = useState(() => Date.now());
  const language = useLanguagePreference();
  const appearance = useAppearancePreference();
  const appearanceNames = {
    system: t('family.languageValue'),
    light: t('family.appearanceLight'),
    dark: t('family.appearanceDark'),
  };

  function pickLanguage() {
    Alert.alert(t('family.language'), undefined, [
      { text: t('family.languageValue'), onPress: () => void setLanguagePreference('system') },
      { text: LANGUAGE_NAMES.nb, onPress: () => void setLanguagePreference('nb') },
      { text: LANGUAGE_NAMES.en, onPress: () => void setLanguagePreference('en') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function pickAppearance() {
    Alert.alert(t('family.appearance'), undefined, [
      ...(['system', 'light', 'dark'] as const).map((pref) => ({
        text: appearanceNames[pref],
        onPress: () => void setAppearancePreference(pref),
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
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

  function confirmDeleteAccount() {
    Alert.alert(t('account.deleteTitle'), t('account.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.delete'),
        style: 'destructive',
        onPress: () =>
          void attempt(t, async () => {
            await deleteAccount({});
            // The session is already gone; this just clears the tokens on the device.
            await signOut().catch(() => undefined);
          }),
      },
    ]);
  }

  const hoursLeft = invite ? Math.max(1, Math.round((invite.expiresAt - now) / 3600000)) : 0;

  return (
    <TabScreen>
      <View style={{ paddingTop: 24 }}>
        <Text variant="label" color={colors.muted}>
          {t('family.title')}
        </Text>
        <Text variant="title">{family!.name}</Text>
      </View>

      <View style={styles.sectionHead}>
        <Text variant="section" color={colors.muted}>
          {t('family.members', { count: members?.length ?? 0 })}
        </Text>
        {isOwner ? (
          <Pressable
            onPress={() => router.push('/invite')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.invite, pressed && { opacity: 0.8 }]}>
            <Plus color={colors.onTomato} size={18} strokeWidth={2.2} />
            <Text variant="item" color={colors.onTomato} style={{ fontSize: 15 }}>
              {t('family.invite')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {members?.map((m, index) => (
        <View key={m.membershipId} style={styles.member}>
          <Avatar name={m.name} color={colors.avatars[index % colors.avatars.length]} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="item">{m.name}</Text>
            <Text variant="small" color={colors.muted}>
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
              <More color={colors.muted} />
            </IconButton>
          ) : null}
        </View>
      ))}
      {invite ? (
        <View style={styles.pending}>
          <Clock color={colors.tomato} size={20} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="item" style={{ fontSize: 15 }}>
              {t('family.pendingInvite')}
            </Text>
            <Text variant="small" color={colors.muted}>
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

      <Text variant="section" color={colors.muted} style={{ marginTop: 28, marginBottom: 4 }}>
        {t('family.settings')}
      </Text>
      <View style={styles.setting}>
        <Text>{t('family.weekStarts')}</Text>
        <Text color={colors.muted}>{t('dates.dayLong.mon')}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/store-order')}
        style={styles.setting}>
        <Text>{t('family.storeOrder')}</Text>
        <ChevronRight color={colors.muted} size={18} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={pickLanguage} style={styles.setting}>
        <Text>{t('family.language')}</Text>
        <Text color={colors.muted}>
          {language === 'system' ? t('family.languageValue') : LANGUAGE_NAMES[language]}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={pickAppearance} style={styles.setting}>
        <Text>{t('family.appearance')}</Text>
        <Text color={colors.muted}>{appearanceNames[appearance]}</Text>
      </Pressable>
      <View style={styles.setting}>
        <Text>{t('family.account')}</Text>
        <Text color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
          {user.email ?? user.name}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.setting}>
        <Text>{t('account.signOut')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={confirmLeave} style={styles.setting}>
        <Text color={colors.danger}>{t('family.leave')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={confirmDeleteAccount}
        style={[styles.setting, { borderBottomWidth: 0 }]}>
        <Text color={colors.danger}>{t('account.delete')}</Text>
      </Pressable>
    </TabScreen>
  );
}

const useStyles = makeStyles((colors) => ({
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
    backgroundColor: colors.tomatoFill,
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
    borderBottomColor: colors.divider,
  },
  pending: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
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
    borderBottomColor: colors.divider,
  },
}));
