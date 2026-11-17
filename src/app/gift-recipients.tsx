import { useMutation, useQuery } from 'convex/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Disclosure, FoldAll } from '@/components/disclosure';
import { DragRow, DragZones, DropZone } from '@/components/drag-to-group';
import { NameSheet, Sheet } from '@/components/gift-parts';
import { ChevronLeft, ChevronRight, More, Plus } from '@/components/icons';
import { Button, Field, IconButton, Loading, QuietField, Text } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { daysInMonth, DEFAULT_GIFT_CARD_START, GIFT_CARD_END } from '@/convex/lib/gifts';
import { makeStyles, useColors } from '@/lib/appearance';
import { useDesktop } from '@/lib/desktop';
import { matchesSearch } from '@/lib/search';
import { attempt } from '@/lib/errors';
import { dayMonth } from '@/lib/format';
import { useFamily } from '@/lib/session';

type Recipient = {
  _id: Id<'giftRecipients'>;
  name: string;
  linkedUserId: Id<'users'> | null;
  linkedName: string | null;
  archived: boolean;
  giftGroupId: Id<'giftGroups'> | null;
};

/**
 * The people the family gives gifts to (#78). Linking one to a family member hides them from
 * that member. You are never offered as a link yourself, nor suggested (ADR 0002).
 */
export default function GiftRecipientsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const desktop = useDesktop();
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const data = useQuery(api.gifts.recipients, { groupId: family.groupId });
  const addRecipient = useMutation(api.gifts.addRecipient);
  const linkRecipient = useMutation(api.gifts.linkRecipient);
  const renameRecipient = useMutation(api.gifts.renameRecipient);
  const addGiftGroup = useMutation(api.gifts.addGiftGroup);
  const setRecipientGroup = useMutation(api.gifts.setRecipientGroup);
  // The sheet for a new person or a new group, opened from the buttons at the top.
  const [adding, setAdding] = useState<'person' | 'group' | null>(null);
  const [openGroup, setOpenGroup] = useState<{
    id: Id<'giftGroups'>;
    mode: 'menu' | 'rename';
  }>();
  const [pickingStart, setPickingStart] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Groups folded shut on this screen; a folded group still takes people dropped on its name.
  const [closed, setClosed] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  function toggle(key: string) {
    setClosed((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));
  }
  // Letting go of a dragged row also ends a press on it; that press must not open the menu.
  const draggedAt = useRef(0);
  function dragChanged(now: boolean) {
    setDragging(now);
    draggedAt.current = Date.now();
  }
  const [open, setOpen] = useState<{
    id: Id<'giftRecipients'>;
    mode: 'menu' | 'link' | 'rename' | 'group';
  }>();

  if (data === undefined) return <Loading />;
  const sorted = [...data.recipients].sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  const active = sorted.filter((r) => !r.archived);
  const archived = sorted.filter((r) => r.archived);
  const unlinked = data.members.filter((m) => !m.linked);
  const giftGroups = data.groups;
  const groupNameOf = (id: Id<'giftGroups'> | null) =>
    giftGroups.find((g) => g._id === id)?.name ?? null;
  const currentGroup = giftGroups.find((g) => g._id === openGroup?.id);

  const current = sorted.find((r) => r._id === open?.id);

  function row(r: Recipient, index: number) {
    return (
      <Pressable
        key={r._id}
        accessibilityRole="button"
        accessibilityHint={r.archived ? undefined : t('gifts.dragHint')}
        onPress={() => {
          if (dragging || Date.now() - draggedAt.current < 500) return;
          setOpen({ id: r._id, mode: 'menu' });
        }}
        style={({ pressed }) => [
          styles.row,
          index > 0 && styles.divider,
          pressed && { opacity: 0.7 },
        ]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="item">{r.name}</Text>
          <Text variant="small" color={colors.muted}>
            {[
              r.linkedName
                ? t('gifts.people_screen.linked', { name: r.linkedName })
                : t('gifts.people_screen.notLinked'),
              // Active people already stand under their group's heading.
              r.archived ? groupNameOf(r.giftGroupId) : null,
            ]
              .filter((part) => part !== null)
              .join(' · ')}
          </Text>
        </View>
        <More color={colors.muted} />
      </Pressable>
    );
  }

  function rows(list: Recipient[]) {
    return <View style={styles.list}>{list.map(row)}</View>;
  }

  /** People who can be dragged to a group: a card of rows, each lifted on a long press. */
  function dragRows(list: Recipient[]) {
    return (
      <View style={styles.list}>
        {list.map((r, index) => (
          <DragRow key={r._id} id={r._id} liftedStyle={styles.lifted}>
            {row(r, index)}
          </DragRow>
        ))}
      </View>
    );
  }

  function drop(id: string, zone: string) {
    const recipient = active.find((r) => r._id === id);
    const giftGroupId = zone === NO_GROUP ? null : (zone as Id<'giftGroups'>);
    if (!recipient || recipient.giftGroupId === giftGroupId) return;
    void attempt(t, () => setRecipientGroup({ recipientId: recipient._id, giftGroupId }));
  }
  const loose = active.filter((r) => !giftGroups.some((g) => g._id === r.giftGroupId));
  // A search keeps groups whose name matches (with everyone in them) and people whose name does.
  const searching = search.trim() !== '';
  const looseShown = loose.filter((r) => matchesSearch(search, r.name));
  const groupsShown = giftGroups
    .map((g) => {
      const people = active.filter((r) => r.giftGroupId === g._id);
      const whole = matchesSearch(search, g.name);
      return {
        ...g,
        people: whole ? people : people.filter((r) => matchesSearch(search, r.name)),
        whole,
      };
    })
    .filter((g) => !searching || g.whole || g.people.length > 0);
  const archivedShown = archived.filter((r) => matchesSearch(search, r.name));
  const isOpen = (id: string) => searching || !closed.includes(id);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DragZones onDrop={drop} onDragChange={dragChanged}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!dragging}
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={[styles.content, desktop && styles.column]}>
          <Text color={colors.muted}>{t('gifts.people_screen.intro')}</Text>
          {/* Same pattern as "Add person" on the gift list: a button that opens a small sheet. */}
          <View style={styles.addRow}>
            <Button
              kind="secondary"
              title={t('gifts.newPersonButton')}
              icon={<Plus color={colors.tomato} size={18} strokeWidth={2.2} />}
              onPress={() => setAdding('person')}
              style={{ flex: 1 }}
            />
            <Button
              kind="secondary"
              title={t('gifts.newGroupButton')}
              icon={<Plus color={colors.tomato} size={18} strokeWidth={2.2} />}
              onPress={() => setAdding('group')}
              style={{ flex: 1 }}
            />
          </View>

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
                      : t('gifts.people_screen.suggestAdd', { name: firstName(m.name) })
                  }
                  onPress={() =>
                    void attempt(t, () =>
                      m.match
                        ? linkRecipient({ recipientId: m.match, memberUserId: m.userId })
                        : addRecipient({
                            groupId: family.groupId,
                            name: firstName(m.name),
                            memberUserId: m.userId,
                          }),
                    )
                  }
                />
              ))}
            </View>
          ) : null}

          {sorted.length >= SEARCH_FROM || searching ? (
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
          {searching &&
          looseShown.length === 0 &&
          groupsShown.length === 0 &&
          archivedShown.length === 0 ? (
            <Text color={colors.muted}>{t('gifts.noSearchMatch')}</Text>
          ) : null}

          {searching && looseShown.length === 0 ? null : (
            <>
              {giftGroups.length > 0 ? (
                <Text variant="label" color={colors.muted} accessibilityRole="header">
                  {t('gifts.noGroup')}
                </Text>
              ) : null}
              <DropZone
                zone={NO_GROUP}
                holds={looseShown.map((r) => r._id)}
                style={styles.zone}
                highlight={styles.zoneOver}>
                {looseShown.length > 0 ? (
                  dragRows(looseShown)
                ) : giftGroups.length > 0 ? (
                  <View style={styles.empty}>
                    <Text color={colors.muted}>{t('gifts.dropNoGroup')}</Text>
                  </View>
                ) : null}
              </DropZone>
            </>
          )}

          <View style={{ gap: 12 }}>
            {giftGroups.length > 0 && !searching ? (
              <Text variant="small" color={colors.muted}>
                {t(desktop ? 'gifts.dragIntroDesktop' : 'gifts.dragIntro')}
              </Text>
            ) : null}
            {giftGroups.length >= 2 && !searching ? (
              <FoldAll
                count={giftGroups.length}
                allClosed={giftGroups.every((g) => closed.includes(g._id))}
                onPress={(close) => setClosed(close ? giftGroups.map((g) => g._id) : [])}
              />
            ) : null}
            {groupsShown.map((g) => {
              const people = g.people;
              return (
                <DropZone
                  key={g._id}
                  zone={g._id}
                  holds={people.map((r) => r._id)}
                  style={styles.zone}
                  highlight={styles.zoneOver}>
                  <View style={styles.groupHead}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={g.name}
                      accessibilityState={{ expanded: isOpen(g._id) }}
                      onPress={() => {
                        if (dragging || Date.now() - draggedAt.current < 500) return;
                        toggle(g._id);
                      }}
                      style={({ pressed }) => [styles.groupToggle, pressed && { opacity: 0.7 }]}>
                      <Disclosure open={isOpen(g._id)} color={colors.ink} />
                      <Text variant="item" accessibilityRole="header" style={styles.groupName}>
                        {g.name}
                      </Text>
                      <Text variant="small" color={colors.muted}>
                        {t('gifts.peopleCount', { count: people.length })}
                      </Text>
                    </Pressable>
                    <IconButton
                      label={t('gifts.groupMenu', { name: g.name })}
                      onPress={() => setOpenGroup({ id: g._id, mode: 'menu' })}>
                      <More color={colors.muted} />
                    </IconButton>
                  </View>
                  {!isOpen(g._id) ? null : (
                    <View style={styles.members}>
                      {people.length > 0 ? (
                        dragRows(people)
                      ) : (
                        <View style={styles.empty}>
                          <Text color={colors.muted}>{t('gifts.dropHere')}</Text>
                        </View>
                      )}
                      <AddToGroup giftGroupId={g._id} name={g.name} />
                    </View>
                  )}
                </DropZone>
              );
            })}
          </View>

          {archivedShown.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text variant="label" color={colors.muted} accessibilityRole="header">
                {t('gifts.people_screen.archivedTitle')}
              </Text>
              {rows(archivedShown)}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('gifts.cardStart')}
            onPress={() => setPickingStart(true)}
            style={({ pressed }) => [styles.setting, pressed && { opacity: 0.7 }]}>
            <Text style={{ flex: 1 }}>{t('gifts.cardStart')}</Text>
            <Text color={colors.muted}>{dayMonth(t, `2000-${data.cardStart}`)}</Text>
            <ChevronRight color={colors.muted} size={18} />
          </Pressable>
          {adding !== null ? (
            <NameSheet
              title={t(adding === 'person' ? 'gifts.newPersonButton' : 'gifts.newGroupButton')}
              label={t('gifts.people_screen.newName')}
              initial=""
              onSave={(typed) =>
                adding === 'person'
                  ? addRecipient({ groupId: family.groupId, name: typed })
                  : addGiftGroup({ groupId: family.groupId, name: typed })
              }
              onClose={() => setAdding(null)}
            />
          ) : null}
          {pickingStart ? (
            <CardStartSheet current={data.cardStart} onClose={() => setPickingStart(false)} />
          ) : null}

          {current && open?.mode === 'menu' ? (
            <ManageSheet
              recipient={current}
              canLink={unlinked.length > 0}
              onLink={() => setOpen({ id: current._id, mode: 'link' })}
              onRename={() => setOpen({ id: current._id, mode: 'rename' })}
              groupName={groupNameOf(current.giftGroupId)}
              onGroup={() => setOpen({ id: current._id, mode: 'group' })}
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
          {current && open?.mode === 'group' ? (
            <Sheet onClose={() => setOpen(undefined)}>
              <Text variant="heading">{t('gifts.pickGroupTitle', { name: current.name })}</Text>
              {[{ _id: null, name: t('gifts.noGroupChoice') }, ...giftGroups].map((g) => (
                <Button
                  key={g._id ?? 'none'}
                  kind={current.giftGroupId === g._id ? 'primary' : 'secondary'}
                  title={g.name}
                  onPress={async () => {
                    setOpen(undefined);
                    await attempt(t, () =>
                      setRecipientGroup({ recipientId: current._id, giftGroupId: g._id }),
                    );
                  }}
                />
              ))}
            </Sheet>
          ) : null}
          {currentGroup && openGroup?.mode === 'menu' ? (
            <GroupSheet
              name={currentGroup.name}
              giftGroupId={currentGroup._id}
              onRename={() => setOpenGroup({ id: currentGroup._id, mode: 'rename' })}
              onClose={() => setOpenGroup(undefined)}
            />
          ) : null}
          {currentGroup && openGroup?.mode === 'rename' ? (
            <GroupRename
              name={currentGroup.name}
              giftGroupId={currentGroup._id}
              onClose={() => setOpenGroup(undefined)}
            />
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
      </DragZones>
    </GestureHandlerRootView>
  );
}

const NO_GROUP = 'none';

/** "Emma" from "Emma Hansen": what the family calls them on a gift list. */
/** With no groups, the search shows once the list is this long. */
const SEARCH_FROM = 8;

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

/** Day and month the Week card starts showing, no later than Christmas Eve. */
function CardStartSheet({ current, onClose }: { current: string; onClose: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const family = useFamily();
  const setCardStart = useMutation(api.gifts.setCardStart);
  const [month, setMonth] = useState(Number(current.slice(0, 2)));
  const [day, setDay] = useState(Number(current.slice(3)));
  const [busy, setBusy] = useState(false);
  const lastDay = month === 12 ? Number(GIFT_CARD_END.slice(3)) : daysInMonth(month);
  const shownDay = Math.min(day, lastDay);
  const value = `${String(month).padStart(2, '0')}-${String(shownDay).padStart(2, '0')}`;

  async function save(start: string) {
    setBusy(true);
    const ok = await attempt(t, () =>
      setCardStart({ groupId: family.groupId, start }).then(() => true),
    );
    setBusy(false);
    if (ok) onClose();
  }

  function stepper(label: string, text: string, onStep: (by: -1 | 1) => void) {
    return (
      <View style={styles.stepRow}>
        <Text color={colors.muted} style={{ width: 70 }}>
          {label}
        </Text>
        <IconButton label={`${label} −`} onPress={() => onStep(-1)}>
          <ChevronLeft color={colors.ink} />
        </IconButton>
        <Text variant="item" style={{ flex: 1, textAlign: 'center' }}>
          {text}
        </Text>
        <IconButton label={`${label} +`} onPress={() => onStep(1)}>
          <ChevronRight color={colors.ink} />
        </IconButton>
      </View>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <Text variant="heading">{t('gifts.cardStartTitle')}</Text>
      <Text color={colors.muted}>{t('gifts.cardStartBody')}</Text>
      {stepper(t('gifts.day'), String(shownDay), (by) =>
        setDay(((shownDay - 1 + by + lastDay) % lastDay) + 1),
      )}
      {stepper(t('gifts.month'), t(`dates.monthShort.${MONTH_KEYS[month - 1]}`), (by) =>
        setMonth(((month - 1 + by + 12) % 12) + 1),
      )}
      <Button title={t('common.save')} loading={busy} onPress={() => void save(value)} />
      {current !== DEFAULT_GIFT_CARD_START ? (
        <Button
          kind="ghost"
          title={dayMonth(t, `2000-${DEFAULT_GIFT_CARD_START}`)}
          onPress={() => void save(DEFAULT_GIFT_CARD_START)}
        />
      ) : null}
    </Sheet>
  );
}

/** A gift group: rename it, or delete it (its people stay, without a group). */
function GroupSheet({
  name,
  giftGroupId,
  onRename,
  onClose,
}: {
  name: string;
  giftGroupId: Id<'giftGroups'>;
  onRename: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const removeGiftGroup = useMutation(api.gifts.removeGiftGroup);
  function remove() {
    Alert.alert(t('gifts.deleteGroupTitle', { name }), t('gifts.deleteGroupBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('gifts.deleteGroup'),
        style: 'destructive',
        onPress: () => {
          onClose();
          void attempt(t, () => removeGiftGroup({ giftGroupId }));
        },
      },
    ]);
  }
  return (
    <Sheet onClose={onClose}>
      <Text variant="heading">{name}</Text>
      <Button kind="secondary" title={t('gifts.people_screen.rename')} onPress={onRename} />
      <Button kind="danger" title={t('gifts.deleteGroup')} onPress={remove} />
    </Sheet>
  );
}

function GroupRename({
  name,
  giftGroupId,
  onClose,
}: {
  name: string;
  giftGroupId: Id<'giftGroups'>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const renameGiftGroup = useMutation(api.gifts.renameGiftGroup);
  return (
    <NameSheet
      title={t('gifts.renameGroupTitle', { name })}
      label={t('gifts.groupLabel')}
      initial={name}
      onSave={(next) => renameGiftGroup({ giftGroupId, name: next })}
      onClose={onClose}
    />
  );
}

/** What can be done with one person: link or unlink, group, rename, archive or restore, delete. */
function ManageSheet({
  recipient,
  canLink,
  onLink,
  onRename,
  groupName,
  onGroup,
  onClose,
}: {
  recipient: Recipient;
  canLink: boolean;
  onLink: () => void;
  onRename: () => void;
  groupName: string | null;
  onGroup: () => void;
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
      <Button
        kind="secondary"
        title={t('gifts.groupOf', { name: groupName ?? t('gifts.noGroupChoice') })}
        onPress={onGroup}
      />
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

/** Adds a person straight into a gift group. */
function AddToGroup({ giftGroupId, name }: { giftGroupId: Id<'giftGroups'>; name: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const family = useFamily();
  const addRecipient = useMutation(api.gifts.addRecipient);
  const [text, setText] = useState('');
  const label = t('gifts.addToGroup', { name });

  async function add() {
    const typed = text;
    if (typed.trim() === '') return;
    setText('');
    const id = await attempt(t, () =>
      addRecipient({ groupId: family.groupId, name: typed, giftGroupId }),
    );
    if (id === undefined) setText((now) => (now === '' ? typed : now));
  }

  return (
    <QuietField
      accessibilityLabel={label}
      value={text}
      onChangeText={setText}
      maxLength={60}
      placeholder={t('gifts.addToGroupShort')}
      returnKeyType="done"
      blurOnSubmit={false}
      onSubmitEditing={() => void add()}
      style={styles.addTo}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  // The website on a big screen: a readable column rather than the full width.
  column: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  list: { borderRadius: Radius.card, backgroundColor: colors.surface, paddingHorizontal: 14 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  addRow: { flexDirection: 'row', gap: 10 },
  // A quiet last line under a group's people, lined up with the names in the rows.
  addTo: { paddingLeft: 14 },
  setting: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  zone: { gap: 8, borderRadius: Radius.card },
  zoneOver: { backgroundColor: colors.saffronTint },
  lifted: {
    borderRadius: Radius.card,
    backgroundColor: colors.raised,
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  groupHead: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
  },
  groupToggle: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupName: { flex: 1, fontFamily: Fonts.bold, fontSize: 20, lineHeight: 26 },
  // People in a group stand indented behind a thin rule, so each group reads as one block.
  members: {
    gap: 8,
    marginLeft: 11,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderStrong,
  },
  empty: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  suggest: { gap: 10, padding: 16, borderRadius: Radius.card, backgroundColor: colors.saffronTint },
}));
