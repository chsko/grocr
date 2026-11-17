import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { NameSheet, ProgressBar, Sheet } from '@/components/gift-parts';
import { Calendar, ChevronRight, More } from '@/components/icons';
import { Button, Chip, Field, Loading, Text } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  allowedDays,
  bigDoors,
  doorNumber,
  matchingTemplate,
  templateDays,
  type AdventTemplate,
} from '@/convex/lib/advent';
import { GIFT_STATUSES, parsePrice, type GiftStatus } from '@/convex/lib/gifts';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { dayLabel, dayShort, formatKroner, priceInput } from '@/lib/format';
import { useFamily } from '@/lib/session';
import { addDays, weekday } from '@/lib/week';

// Advent calendars (#88): the Kalender tab in Julegaver and the card on Week. Calendars for
// the signed-in member never come back from the server, so nothing here can show them.

/** A calendar recipient: a member, or a family member without the app (#95). */
type Person = { id: RecipientKey; name: string; withoutApp: boolean };
type RecipientKey = Id<'users'> | Id<'familyMembers'>;
type Door = {
  day: string;
  number: number;
  title: string;
  status: GiftStatus;
  price: number | null;
  note: string | null;
};
type AdventCalendar = {
  _id: Id<'adventCalendars'>;
  name: string | null;
  recipients: Person[];
  days: string[];
  doors: Door[];
  totals: {
    idea: number;
    bought: number;
    wrapped: number;
    empty: number;
    spent: number;
    planned: number;
  };
};

/** "Søndagskalender", or the recipients' names when the calendar has no name of its own. */
export function calendarName(
  t: TFunction,
  calendar: { name: string | null; recipients: Person[] },
) {
  return (
    calendar.name ??
    namesOf(
      t,
      calendar.recipients.map((r) => r.name),
    )
  );
}

function namesOf(t: TFunction, names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  return t('advent.names', {
    first: names.slice(0, -1).join(', '),
    last: names[names.length - 1],
  });
}

/** The Kalender tab: one calendar at a time as a grid of doors, picked with chips. */
export function AdventTab({ year }: { year: number }) {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const data = useQuery(api.advent.calendars, { groupId: family.groupId, year });
  const [picked, setPicked] = useState<Id<'adventCalendars'> | null>(null);
  // Sheets remember which calendar they were opened for, so a calendar someone else deletes
  // meanwhile closes its sheet instead of the sheet acting on the next calendar.
  const [door, setDoor] = useState<{ calendarId: Id<'adventCalendars'>; day: string } | null>(null);
  const [sheet, setSheet] = useState<'new' | 'days' | 'recipients' | 'rename' | 'menu' | null>(
    null,
  );
  const [sheetFor, setSheetFor] = useState<Id<'adventCalendars'> | null>(null);
  const renameCalendar = useMutation(api.advent.renameCalendar);
  const removeCalendar = useMutation(api.advent.removeCalendar);

  if (data === undefined) return <Loading />;
  const calendar = data.calendars.find((c) => c._id === picked) ?? data.calendars[0] ?? null;
  const doorCalendar = door ? data.calendars.find((c) => c._id === door.calendarId) : undefined;
  const target = data.calendars.find((c) => c._id === sheetFor) ?? null;
  const kr = (amount: number) => formatKroner(i18n.language, amount);
  const past = data.year < data.currentYear;

  function confirmDelete(c: AdventCalendar) {
    setSheet(null);
    Alert.alert(t('advent.deleteTitle', { name: calendarName(t, c) }), t('advent.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('advent.delete'),
        style: 'destructive',
        onPress: () => void attempt(t, () => removeCalendar({ calendarId: c._id })),
      },
    ]);
  }

  return (
    <>
      {data.calendars.length === 0 ? (
        <Text color={colors.muted}>{past ? t('advent.noneThisYear') : t('advent.intro')}</Text>
      ) : null}
      <View style={styles.chips}>
        {data.calendars.map((c) => (
          <Chip
            key={c._id}
            title={calendarName(t, c)}
            selected={c._id === calendar?._id}
            accessibilityState={{ selected: c._id === calendar?._id }}
            onPress={() => setPicked(c._id)}
          />
        ))}
        {data.members.length > 0 ? (
          <Chip dashed title={t('advent.new')} onPress={() => setSheet('new')} />
        ) : null}
      </View>
      {data.members.length === 0 && data.calendars.length === 0 ? (
        <Text color={colors.muted}>{t('advent.noMembers')}</Text>
      ) : null}

      {calendar ? (
        <View style={{ gap: 14 }}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading" accessibilityRole="header">
                {calendarName(t, calendar)}
              </Text>
              <Text variant="small" color={colors.muted}>
                {t('advent.forWhom', {
                  names: namesOf(
                    t,
                    calendar.recipients.map((r) => r.name),
                  ),
                  count: calendar.days.length,
                })}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('advent.menu', { name: calendarName(t, calendar) })}
              hitSlop={8}
              onPress={() => {
                setSheetFor(calendar._id);
                setSheet('menu');
              }}
              style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}>
              <More color={colors.ink} size={22} />
            </Pressable>
          </View>
          <View style={{ gap: 8 }}>
            <Text variant="item">
              {t('advent.wrappedOf', {
                done: calendar.totals.wrapped,
                count: calendar.days.length,
              })}
              {calendar.totals.empty > 0
                ? ` · ${t('advent.emptyCount', { count: calendar.totals.empty })}`
                : ''}
            </Text>
            <ProgressBar
              bought={calendar.totals.bought}
              wrapped={calendar.totals.wrapped}
              total={calendar.days.length}
            />
            {calendar.totals.planned > 0 ? (
              <Text color={colors.muted}>
                {t('advent.spentOf', {
                  spent: kr(calendar.totals.spent),
                  planned: kr(calendar.totals.planned),
                })}
              </Text>
            ) : null}
          </View>
          <DoorGrid
            calendar={calendar}
            year={data.year}
            today={data.today}
            onOpen={(day) => setDoor({ calendarId: calendar._id, day })}
          />
          <Legend />
          <Text variant="small" color={colors.muted}>
            {t('advent.hiddenFrom', {
              names: namesOf(
                t,
                calendar.recipients.map((r) => r.name),
              ),
            })}
          </Text>
        </View>
      ) : null}

      {door && doorCalendar ? (
        <DoorSheet
          calendar={doorCalendar}
          year={data.year}
          day={door.day}
          onClose={() => setDoor(null)}
        />
      ) : null}
      {sheet === 'new' ? (
        <CalendarSheet
          mode="new"
          year={data.year}
          members={data.members}
          onDone={(id) => {
            if (id) setPicked(id);
            setSheet(null);
          }}
        />
      ) : null}
      {target && (sheet === 'days' || sheet === 'recipients') ? (
        <CalendarSheet
          mode={sheet}
          year={data.year}
          members={data.members}
          calendar={target}
          onDone={() => setSheet(null)}
        />
      ) : null}
      {target && sheet === 'rename' ? (
        <NameSheet
          title={t('advent.renameTitle')}
          label={t('advent.nameLabel')}
          initial={target.name ?? ''}
          allowEmpty
          onSave={(name) => renameCalendar({ calendarId: target._id, name })}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {target && sheet === 'menu' ? (
        <Sheet onClose={() => setSheet(null)}>
          <Text variant="heading">{calendarName(t, target)}</Text>
          <Button
            kind="secondary"
            title={t('advent.changeDays')}
            onPress={() => setSheet('days')}
          />
          <Button
            kind="secondary"
            title={t('advent.changeRecipients')}
            onPress={() => setSheet('recipients')}
          />
          <Button kind="secondary" title={t('advent.rename')} onPress={() => setSheet('rename')} />
          <Button kind="danger" title={t('advent.delete')} onPress={() => confirmDelete(target)} />
        </Sheet>
      ) : null}
    </>
  );
}

/** The doors in date order: six to a row, or two big ones for a short calendar. */
function DoorGrid({
  calendar,
  year,
  today,
  onOpen,
}: {
  calendar: AdventCalendar;
  year: number;
  today: string;
  onOpen: (day: string) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const big = bigDoors(calendar.days);
  const doors = new Map(calendar.doors.map((d) => [d.day, d]));
  return (
    <View style={styles.grid}>
      {calendar.days.map((day) => {
        const door = doors.get(day);
        const number = door?.number ?? doorNumber(year, calendar.days, day);
        const look = door ? doorLook(colors, door.status) : null;
        return (
          <View key={day} style={big ? styles.cellBig : styles.cell}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('advent.doorLabel', {
                number,
                date: dayLabel(t, day),
                what: door
                  ? `${door.title}, ${t(`gifts.status.${door.status}`)}`
                  : t('advent.emptyDoor'),
              })}
              onPress={() => onOpen(day)}
              style={({ pressed }) => [
                styles.door,
                big && styles.doorBig,
                look
                  ? { backgroundColor: look.fill, borderColor: look.border, borderStyle: 'solid' }
                  : null,
                day === today && styles.today,
                pressed && { opacity: 0.7 },
              ]}>
              {big ? (
                <Text style={styles.doorDate} color={look?.muted ?? colors.muted}>
                  {dayLabel(t, day)}
                </Text>
              ) : null}
              <Text style={big ? styles.numberBig : styles.number}>{number}</Text>
              <Text
                style={big ? styles.doorTitleBig : styles.doorTitle}
                color={look?.muted ?? colors.muted}
                numberOfLines={2}>
                {door?.title ?? ''}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function doorLook(colors: ReturnType<typeof useColors>, status: GiftStatus) {
  if (status === 'wrapped') {
    return { fill: colors.saffronPill, border: colors.saffronPill, muted: colors.ink };
  }
  if (status === 'bought') {
    return { fill: colors.saffronSoft, border: colors.saffronSoft, muted: colors.saffronInk };
  }
  return { fill: colors.background, border: colors.borderStrong, muted: colors.muted };
}

function Legend() {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const items: { key: string; label: string; style: object }[] = [
    { key: 'empty', label: t('advent.empty'), style: styles.swatchEmpty },
    ...GIFT_STATUSES.map((s) => {
      const look = doorLook(colors, s);
      return {
        key: s,
        label: t(`gifts.status.${s}`),
        style: { backgroundColor: look.fill, borderColor: look.border },
      };
    }),
  ];
  return (
    <View style={styles.legend} accessible={false}>
      {items.map((item) => (
        <View key={item.key} style={styles.legendItem}>
          <View style={[styles.swatch, item.style]} />
          <Text variant="small" color={colors.muted}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** What is behind one door: title, status, price and note, or empty it. */
function DoorSheet({
  calendar,
  year,
  day,
  onClose,
}: {
  calendar: AdventCalendar;
  year: number;
  day: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const door = calendar.doors.find((d) => d.day === day) ?? null;
  const number = door?.number ?? doorNumber(year, calendar.days, day);
  const [title, setTitle] = useState(door?.title ?? '');
  const [status, setStatus] = useState<GiftStatus>(door?.status ?? 'idea');
  const [price, setPrice] = useState(() => priceInput(i18n.language, door?.price ?? null));
  const [note, setNote] = useState(door?.note ?? '');
  const [busy, setBusy] = useState(false);
  const setDoor = useMutation(api.advent.setDoor);
  const clearDoor = useMutation(api.advent.clearDoor);
  const parsed = parsePrice(price);

  async function save() {
    if (title.trim() === '' || parsed === null) return;
    setBusy(true);
    const ok = await attempt(t, () =>
      setDoor({
        calendarId: calendar._id,
        day,
        title,
        status,
        price: parsed ?? null,
        note,
      }).then(() => true),
    );
    setBusy(false);
    if (ok) onClose();
  }

  async function clear() {
    setBusy(true);
    const ok = await attempt(t, () =>
      clearDoor({ calendarId: calendar._id, day }).then(() => true),
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet onClose={onClose}>
      <View style={{ gap: 2 }}>
        <Text variant="heading">
          {t('advent.doorTitle', { number, name: calendarName(t, calendar) })}
        </Text>
        <Text variant="small" color={colors.muted}>
          {dayLabel(t, day)}
        </Text>
      </View>
      <Field
        label={t('advent.whatLabel')}
        placeholder={t('advent.whatPlaceholder')}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        autoFocus={door === null}
      />
      <View style={styles.statuses} accessibilityRole="radiogroup">
        {GIFT_STATUSES.map((s) => (
          <Chip
            key={s}
            title={t(`gifts.status.${s}`)}
            selected={status === s}
            accessibilityRole="radio"
            accessibilityState={{ selected: status === s }}
            onPress={() => setStatus(s)}
          />
        ))}
      </View>
      <Field
        label={t('gifts.edit.price')}
        placeholder={t('gifts.edit.pricePlaceholder')}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        maxLength={14}
      />
      {parsed === null ? (
        <Text variant="small" color={colors.danger}>
          {t('errors.INVALID_PRICE')}
        </Text>
      ) : null}
      <Field
        label={t('gifts.edit.note')}
        placeholder={t('advent.notePlaceholder')}
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
      />
      <Button
        title={t('common.save')}
        loading={busy}
        disabled={title.trim() === '' || parsed === null}
        onPress={() => void save()}
      />
      {door ? (
        <Button kind="danger" title={t('advent.clearDoor')} onPress={() => void clear()} />
      ) : null}
    </Sheet>
  );
}

/**
 * A new calendar (recipients, name, days), or changing an existing one's days or recipients.
 * Days start from a template and are then added or removed one by one in a date grid.
 */
function CalendarSheet({
  mode,
  year,
  members,
  calendar,
  onDone,
}: {
  mode: 'new' | 'days' | 'recipients';
  year: number;
  members: Person[];
  calendar?: AdventCalendar;
  onDone: (id?: Id<'adventCalendars'>) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const family = useFamily();
  const createCalendar = useMutation(api.advent.createCalendar);
  const setDays = useMutation(api.advent.setDays);
  const setRecipients = useMutation(api.advent.setRecipients);
  const [who, setWho] = useState<RecipientKey[]>(calendar?.recipients.map((r) => r.id) ?? []);
  const [name, setName] = useState('');
  const [days, setDayList] = useState<string[]>(calendar?.days ?? templateDays(year, 'december'));
  const [busy, setBusy] = useState(false);
  // The date grid makes this sheet tall; on small phones it scrolls above the button.
  const { height } = useWindowDimensions();
  const template = matchingTemplate(year, days) ?? (days.length === 0 ? 'own' : null);
  // Members who left the family can stay recipients, so they are listed too.
  const people = [
    ...members,
    ...(calendar?.recipients ?? []).filter((r) => !members.some((m) => m.id === r.id)),
  ];

  function toggleDay(day: string) {
    setDayList((now) => (now.includes(day) ? now.filter((d) => d !== day) : [...now, day].sort()));
  }

  async function save() {
    setBusy(true);
    if (mode === 'new') {
      const id = await attempt(t, () =>
        createCalendar({ groupId: family.groupId, year, recipientIds: who, days, name }),
      );
      setBusy(false);
      if (id !== undefined) onDone(id);
      return;
    }
    if (mode === 'recipients') {
      const ok = await attempt(t, () =>
        setRecipients({ calendarId: calendar!._id, recipientIds: who }).then(() => true),
      );
      setBusy(false);
      if (ok) onDone();
      return;
    }
    const lost = calendar!.doors.filter((d) => !days.includes(d.day));
    // The server only empties the doors listed here, so a door someone filled meanwhile is
    // refused instead of lost unseen.
    const run = async () => {
      const ok = await attempt(t, () =>
        setDays({ calendarId: calendar!._id, days, drop: lost.map((d) => d.day) }).then(() => true),
      );
      setBusy(false);
      if (ok) onDone();
    };
    if (lost.length === 0) return void run();
    Alert.alert(
      t('advent.loseDoorsTitle', { count: lost.length }),
      lost.map((d) => `${dayLabel(t, d.day)}: ${d.title}`).join('\n'),
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => setBusy(false) },
        { text: t('advent.loseDoors'), style: 'destructive', onPress: () => void run() },
      ],
    );
  }

  const ready = (mode === 'days' || who.length > 0) && (mode === 'recipients' || days.length > 0);
  const title =
    mode === 'new'
      ? t('advent.newTitle')
      : mode === 'days'
        ? t('advent.daysTitle', { name: calendarName(t, calendar!) })
        : t('advent.recipientsTitle', { name: calendarName(t, calendar!) });

  return (
    <Sheet onClose={() => onDone()}>
      <ScrollView
        style={{ maxHeight: height * 0.7 }}
        contentContainerStyle={{ gap: 14 }}
        keyboardShouldPersistTaps="handled">
        <Text variant="heading">{title}</Text>
        {mode !== 'days' ? (
          <View style={{ gap: 6 }}>
            <Text variant="label" color={colors.muted}>
              {t('advent.toLabel')}
            </Text>
            <View style={styles.chips}>
              {people.map((m) => {
                const on = who.includes(m.id);
                return (
                  <Chip
                    key={m.id}
                    title={m.name}
                    selected={on}
                    accessibilityState={{ selected: on }}
                    onPress={() =>
                      setWho((now) => (on ? now.filter((id) => id !== m.id) : [...now, m.id]))
                    }
                  />
                );
              })}
            </View>
            <Text variant="small" color={colors.muted}>
              {t('advent.toHint')}
            </Text>
          </View>
        ) : null}
        {mode === 'new' ? (
          <Field
            label={t('advent.nameLabel')}
            placeholder={
              namesOf(
                t,
                people.filter((p) => who.includes(p.id)).map((p) => p.name),
              ) || t('advent.namePlaceholder')
            }
            value={name}
            onChangeText={setName}
            maxLength={60}
          />
        ) : null}
        {mode !== 'recipients' ? (
          <View style={{ gap: 10 }}>
            <Text variant="label" color={colors.muted}>
              {t('advent.startFrom')}
            </Text>
            <View style={styles.chips}>
              {(['december', 'sundays', 'own'] as AdventTemplate[]).map((key) => (
                <Chip
                  key={key}
                  title={t(`advent.template.${key}`)}
                  selected={template === key}
                  accessibilityState={{ selected: template === key }}
                  onPress={() => setDayList(templateDays(year, key))}
                />
              ))}
            </View>
            <DayGrid year={year} days={days} onToggle={toggleDay} />
            <Text variant="small" color={colors.muted}>
              {t('advent.daysPicked', { count: days.length })}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <Button
        title={mode === 'new' ? t('advent.create') : t('common.save')}
        loading={busy}
        disabled={!ready}
        onPress={() => void save()}
      />
    </Sheet>
  );
}

/** Monday-first weeks from the first Sunday in Advent to Christmas Eve; tap a day to toggle it. */
function DayGrid({
  year,
  days,
  onToggle,
}: {
  year: number;
  days: string[];
  onToggle: (day: string) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { t } = useTranslation();
  const allowed = allowedDays(year);
  const first = allowed[0];
  const last = allowed[allowed.length - 1];
  const start = addDays(first, -((weekday(first) + 6) % 7));
  const end = addDays(last, (7 - weekday(last)) % 7);
  const cells: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) cells.push(day);
  return (
    <View style={styles.month}>
      {cells.slice(0, 7).map((day) => (
        <View key={`h${day}`} style={styles.monthCell}>
          <Text variant="small" color={colors.muted}>
            {dayShort(t, day)}
          </Text>
        </View>
      ))}
      {cells.map((day) => {
        const can = day >= first && day <= last;
        const on = days.includes(day);
        return (
          <View key={day} style={styles.monthCell}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={dayLabel(t, day)}
              accessibilityState={{ checked: on, disabled: !can }}
              disabled={!can}
              hitSlop={2}
              onPress={() => onToggle(day)}
              style={({ pressed }) => [
                styles.dayDot,
                on && { backgroundColor: colors.tomatoFill },
                pressed && { opacity: 0.7 },
              ]}>
              <Text
                variant="label"
                color={on ? colors.onTomato : can ? colors.ink : colors.checkbox}>
                {Number(day.slice(8))}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The Advent calendar card on Week, from the day before a calendar's first door until its last:
 * today's and tomorrow's door per calendar (or the next one), with tomorrow's in warning
 * colours when it is empty or not wrapped yet.
 */
export function AdventWeekCard() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const family = useFamily();
  const card = useQuery(api.advent.weekCard, { groupId: family.groupId });
  if (!card) return null;
  type Shown = { day: string; number: number; title: string | null; status: GiftStatus | null };
  const what = (door: Shown) =>
    door.title === null
      ? t('advent.emptyDoor')
      : `${door.title} · ${t(`gifts.status.${door.status!}`)}`;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/gifts', params: { tab: 'calendar' } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}>
      <Calendar color={colors.saffronInk} size={22} />
      <View style={{ flex: 1, gap: 10 }}>
        <Text variant="item" style={{ fontSize: 16 }}>
          {t('advent.weekCard')}
        </Text>
        {card.calendars.map((c) => {
          const late = c.tomorrow !== null && c.tomorrow.status !== 'wrapped';
          return (
            <View key={c._id} style={{ gap: 2 }}>
              <Text variant="label">{calendarName(t, c)}</Text>
              {c.today ? (
                <Text variant="small" color={colors.muted}>
                  {t('advent.todayDoor', { number: c.today.number, what: what(c.today) })}
                </Text>
              ) : null}
              {c.tomorrow ? (
                <Text
                  variant="small"
                  color={late ? colors.tomato : colors.muted}
                  style={late && { fontFamily: Fonts.semibold }}>
                  {t('advent.tomorrowDoor', { number: c.tomorrow.number, what: what(c.tomorrow) })}
                  {late ? ` · ${t('advent.notWrapped')}` : ''}
                </Text>
              ) : null}
              {c.next ? (
                <Text variant="small" color={colors.muted}>
                  {t('advent.nextDoor', {
                    number: c.next.number,
                    date: dayLabel(t, c.next.day),
                    what: what(c.next),
                  })}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // Capped, so doors stay door-sized in the wide column on the web.
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, maxWidth: 720 },
  cell: { width: `${100 / 6}%`, padding: 3 },
  cellBig: { width: '50%', padding: 5 },
  door: {
    aspectRatio: 0.92,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
    backgroundColor: colors.background,
    paddingHorizontal: 5,
    paddingVertical: 4,
    justifyContent: 'space-between',
  },
  doorBig: { aspectRatio: 1.45, borderRadius: 14, padding: 10 },
  // Today in ink, since the doors themselves carry the saffron.
  today: { borderWidth: 2.5, borderStyle: 'solid', borderColor: colors.ink },
  number: { fontFamily: Fonts.bold, fontSize: 16, lineHeight: 20 },
  numberBig: { fontFamily: Fonts.bold, fontSize: 24, lineHeight: 28 },
  doorTitle: { fontFamily: Fonts.regular, fontSize: 10, lineHeight: 12 },
  doorTitleBig: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 18 },
  doorDate: {
    fontFamily: Fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5 },
  swatchEmpty: { borderStyle: 'dashed', borderColor: colors.dashed },
  statuses: { flexDirection: 'row', gap: 8 },
  month: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  dayDot: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: colors.saffronTint,
  },
}));
