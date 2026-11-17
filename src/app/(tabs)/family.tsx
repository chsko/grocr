import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronRight, Clock, More, Plus } from '@/components/icons';
import { Avatar, Button, Field, IconButton, TabScreen, Text } from '@/components/ui';
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
import { accountLabel, dayMonth } from '@/lib/format';
import { setLanguagePreference, useLanguagePreference } from '@/lib/i18n/preference';
import { useMe } from '@/lib/session';
import { unseenEntries } from '@/lib/whats-new';
import Animated from 'react-native-reanimated';
import { sheetIn } from '@/lib/motion';

// Each language is named in itself, so it can be found from either.
const LANGUAGE_NAMES = { nb: 'Norsk', en: 'English' } as const;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Members, invites and settings (GRO-26). The owner manages members; anyone can leave. */
export default function FamilyScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const { user, family } = useMe();
  const groupId = family!.groupId;
  const isOwner = family!.role === 'owner';
  const members = useQuery(api.groups.members, { groupId });
  const people = useQuery(api.family.people, { groupId });
  const personInvites = useQuery(api.invites.forPeople, { groupId });
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState<{ _id: Id<'familyMembers'>; name: string } | null>(null);
  const invite = useQuery(api.invites.active, { groupId });
  const revoke = useMutation(api.invites.revoke);
  const removeMember = useMutation(api.groups.removeMember);
  const transferOwnership = useMutation(api.groups.transferOwnership);
  const leave = useMutation(api.groups.leave);
  const deleteAccount = useMutation(api.account.deleteAccount);
  const { signOut } = useAuthActions();
  const [now] = useState(() => Date.now());
  const [renaming, setRenaming] = useState(false);
  const hasNews = unseenEntries(user.whatsNewSeen).length > 0;
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
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('family.rename')}
          onPress={() => setRenaming(true)}>
          <Text variant="title">{family!.name}</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHead}>
        <Text variant="section" color={colors.muted}>
          {t('family.members', { count: (members?.length ?? 0) + (people?.length ?? 0) })}
        </Text>
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.invite, pressed && { opacity: 0.8 }]}>
          <Plus color={colors.onTomato} size={18} strokeWidth={2.2} />
          <Text variant="item" color={colors.onTomato} style={{ fontSize: 15 }}>
            {t('family.add')}
          </Text>
        </Pressable>
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
      {people?.map((p) => {
        const sent = personInvites?.find((i) => i.familyMemberId === p._id);
        return (
          <View key={p._id} style={styles.member}>
            <Avatar name={p.name} color={colors.saffronSoft} ink={colors.saffronInk} />
            <View style={{ flex: 1, gap: 4, alignItems: 'flex-start' }}>
              <Text variant="item">{p.name}</Text>
              {sent ? (
                <Text variant="small" color={colors.muted}>
                  {t('family.personInvited', {
                    count: Math.max(1, Math.round((sent.expiresAt - now) / 3600000)),
                  })}
                </Text>
              ) : (
                <Text variant="label" color={colors.muted} style={styles.noApp}>
                  {t('family.withoutApp')}
                </Text>
              )}
            </View>
            {isOwner ? (
              <Button
                kind="ghost"
                title={t('family.invite')}
                onPress={() => router.push({ pathname: '/invite', params: { person: p._id } })}
              />
            ) : null}
            <IconButton label={t('family.manage', { name: p.name })} onPress={() => setPerson(p)}>
              <More color={colors.muted} />
            </IconButton>
          </View>
        );
      })}
      <Text variant="small" color={colors.muted} style={{ marginTop: 10 }}>
        {t('family.everyoneHint')}
      </Text>
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
      <Pressable
        accessibilityRole="button"
        onPress={() => setRenaming(true)}
        style={styles.setting}>
        <Text>{t('family.name')}</Text>
        <Text color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
          {family!.name}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/week-start')}
        style={styles.setting}>
        <Text>{t('family.weekStarts')}</Text>
        <View style={styles.settingEnd}>
          <Text color={colors.muted}>
            {t(`dates.dayLong.${DAY_KEYS[family!.weekStartsOn] ?? 'mon'}`)}
          </Text>
          <ChevronRight color={colors.muted} size={18} />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/tour')}
        style={styles.setting}>
        <Text>{t('tour.open')}</Text>
        <ChevronRight color={colors.muted} size={18} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          hasNews ? `${t('family.whatsNew')}, ${t('whatsNew.unseen')}` : t('family.whatsNew')
        }
        onPress={() => router.push('/whats-new')}
        style={styles.setting}>
        <Text>{t('family.whatsNew')}</Text>
        <View style={styles.settingEnd}>
          {hasNews ? <View style={styles.newDot} /> : null}
          <ChevronRight color={colors.muted} size={18} />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/sections')}
        style={styles.setting}>
        <Text>{t('family.storeOrder')}</Text>
        <ChevronRight color={colors.muted} size={18} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/items')}
        style={styles.setting}>
        <Text>{t('family.items')}</Text>
        <ChevronRight color={colors.muted} size={18} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/staples')}
        style={styles.setting}>
        <Text>{t('family.staples')}</Text>
        <ChevronRight color={colors.muted} size={18} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/gifts')}
        style={styles.setting}>
        <Text>{t('family.gifts')}</Text>
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
          {accountLabel(user, t('account.hiddenAppleEmail'))}
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
      {renaming ? (
        <FamilyNameEditor
          groupId={groupId}
          current={family!.name}
          onClose={() => setRenaming(false)}
        />
      ) : null}
      {adding ? (
        <AddPersonSheet groupId={groupId} isOwner={isOwner} onClose={() => setAdding(false)} />
      ) : null}
      {person ? (
        <PersonSheet person={person} isOwner={isOwner} onClose={() => setPerson(null)} />
      ) : null}
    </TabScreen>
  );
}

/** Rename the family; any member can. */
function FamilyNameEditor({
  groupId,
  current,
  onClose,
}: {
  groupId: Id<'groups'>;
  current: string;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rename = useMutation(api.groups.rename);
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (name.trim() === '') return;
    if (name.trim() !== current) {
      setBusy(true);
      const saved = await attempt(t, () => rename({ groupId, name }).then(() => true));
      setBusy(false);
      if (!saved) return;
    }
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('common.close')} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={sheetIn}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text variant="heading">{t('family.rename')}</Text>
            <Field
              label={t('family.name')}
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
              disabled={name.trim() === ''}
              onPress={() => void save()}
            />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Adds a family member without the app; the owner can invite someone with a phone instead. */
function AddPersonSheet({
  groupId,
  isOwner,
  onClose,
}: {
  groupId: Id<'groups'>;
  isOwner: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const addPerson = useMutation(api.family.addPerson);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (name.trim() === '') return;
    setBusy(true);
    const saved = await attempt(t, () => addPerson({ groupId, name }).then(() => true));
    setBusy(false);
    if (saved) onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('common.close')} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={sheetIn}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text variant="heading">{t('family.addTitle')}</Text>
            <Text color={colors.muted}>{t('family.addIntro')}</Text>
            <Field
              label={t('family.personName')}
              value={name}
              onChangeText={setName}
              maxLength={60}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void save()}
            />
            <Button
              title={t('family.addWithoutApp')}
              loading={busy}
              disabled={name.trim() === ''}
              onPress={() => void save()}
            />
            {isOwner ? (
              <Button
                kind="ghost"
                title={t('family.inviteWithPhone')}
                onPress={() => {
                  onClose();
                  router.push('/invite');
                }}
              />
            ) : null}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A family member without the app: rename, invite to the app (owner) or remove (owner). */
function PersonSheet({
  person,
  isOwner,
  onClose,
}: {
  person: { _id: Id<'familyMembers'>; name: string };
  isOwner: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rename = useMutation(api.family.renamePerson);
  const remove = useMutation(api.family.removePerson);
  const [name, setName] = useState(person.name);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (name.trim() === '') return;
    if (name.trim() !== person.name) {
      setBusy(true);
      const saved = await attempt(t, () =>
        rename({ familyMemberId: person._id, name }).then(() => true),
      );
      setBusy(false);
      if (!saved) return;
    }
    onClose();
  }

  function confirmRemove() {
    Alert.alert(
      t('family.removeTitle', { name: person.name }),
      t('family.removePersonBody', { name: person.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('family.remove'),
          style: 'destructive',
          onPress: () =>
            void attempt(t, async () => {
              await remove({ familyMemberId: person._id });
              onClose();
            }),
        },
      ],
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('common.close')} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={sheetIn}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar
                name={person.name}
                color={colors.saffronSoft}
                ink={colors.saffronInk}
                size={52}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">{person.name}</Text>
                <Text variant="small" color={colors.muted}>
                  {t('family.withoutApp')}
                </Text>
              </View>
            </View>
            <View style={styles.note}>
              <Text variant="small" color={colors.muted} style={{ fontSize: 14 }}>
                {t('family.personNote', { name: person.name })}
              </Text>
            </View>
            <Field
              label={t('family.personName')}
              value={name}
              onChangeText={setName}
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={() => void save()}
            />
            <Button
              kind={isOwner ? 'secondary' : 'primary'}
              title={t('common.save')}
              loading={busy}
              disabled={name.trim() === ''}
              onPress={() => void save()}
            />
            {isOwner ? (
              <>
                <Button
                  title={t('family.invitePerson', { name: person.name })}
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/invite', params: { person: person._id } });
                  }}
                />
                <Button kind="danger" title={t('family.remove')} onPress={confirmRemove} />
              </>
            ) : (
              <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
                {t('family.onlyOwnerInvites')}
              </Text>
            )}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  noApp: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 12,
    overflow: 'hidden',
  },
  note: { backgroundColor: colors.surface, borderRadius: 14, padding: 12 },
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
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.raised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
  },
  settingEnd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newDot: { width: 8, height: 8, borderRadius: Radius.pill, backgroundColor: colors.tomato },
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
