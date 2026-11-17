import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { giftStatus } from './schema';
import {
  accessError,
  getMembership,
  requireMemberOf,
  requireMembership,
  requireUserId,
} from './lib/access';
import { cardDoors, cleanDays, doorNumber, MAX_CALENDARS, MAX_RECIPIENTS } from './lib/advent';
import { cleanName } from './lib/catalog';
import { christmasYear, cleanPrice, isSpent, MAX_GIFT_YEAR, MIN_GIFT_YEAR } from './lib/gifts';
import { addDays, todayIn } from './lib/week';

// Advent calendars (#88). The adults plan together what goes behind each door, and a calendar
// is hidden from every member it is for (ADR 0003), with its doors and totals. Everything here
// reaches calendars through `loadCalendar` or `visibleCalendars`, which leave out the caller's
// own. A hidden calendar fails exactly like one that does not exist (NOT_FOUND), and no answer
// depends on whether one exists. Making yourself a recipient is refused before anything is
// looked up.

const MAX_NAME = 60;
const MAX_TITLE = 120;
const MAX_NOTE = 500;

type Ctx = QueryCtx | MutationCtx;

/**
 * Who a calendar can be for: a member (their user id) or a family member without the app (their
 * family member id, #95). A family member who joined with their invite is their user id.
 */
export type RecipientKey = Id<'users'> | Id<'familyMembers'>;

export const recipientKey = v.union(v.id('users'), v.id('familyMembers'));

function keyOf(row: Doc<'adventRecipients'>): RecipientKey {
  return (row.userId ?? row.familyMemberId)!;
}

async function recipientRowsOf(ctx: Ctx, calendarId: Id<'adventCalendars'>) {
  return await ctx.db
    .query('adventRecipients')
    .withIndex('by_calendar', (q) => q.eq('calendarId', calendarId))
    .collect();
}

async function recipientIds(ctx: Ctx, calendarId: Id<'adventCalendars'>) {
  return (await recipientRowsOf(ctx, calendarId)).map(keyOf);
}

/** Loads a calendar the caller may see; their own (or another family's) is NOT_FOUND. */
async function loadCalendar(ctx: Ctx, calendarId: Id<'adventCalendars'>) {
  const calendar = await ctx.db.get('adventCalendars', calendarId);
  const access = await requireMemberOf(ctx, calendar);
  const rows = await recipientRowsOf(ctx, calendarId);
  if (rows.some((r) => r.userId === access.userId)) throw accessError('NOT_FOUND');
  return { calendar: calendar!, recipients: rows.map(keyOf), ...access };
}

/** The ids of every calendar in the family that is for `userId`. */
async function ownCalendarIds(ctx: Ctx, groupId: Id<'groups'>, userId: Id<'users'>) {
  const rows = await ctx.db
    .query('adventRecipients')
    .withIndex('by_group_user', (q) => q.eq('groupId', groupId).eq('userId', userId))
    .collect();
  return new Set(rows.map((r) => r.calendarId));
}

/** A year's calendars the caller may see, oldest first. */
async function visibleCalendars(
  ctx: Ctx,
  groupId: Id<'groups'>,
  userId: Id<'users'>,
  year: number,
) {
  const own = await ownCalendarIds(ctx, groupId, userId);
  const all = await ctx.db
    .query('adventCalendars')
    .withIndex('by_group_year', (q) => q.eq('groupId', groupId).eq('year', year))
    .collect();
  return all.filter((c) => !own.has(c._id)).sort((a, b) => a.createdAt - b.createdAt);
}

async function doorsOf(ctx: Ctx, calendarId: Id<'adventCalendars'>) {
  return await ctx.db
    .query('adventDoors')
    .withIndex('by_calendar_day', (q) => q.eq('calendarId', calendarId))
    .collect();
}

async function doorOn(ctx: Ctx, calendarId: Id<'adventCalendars'>, day: string) {
  return await ctx.db
    .query('adventDoors')
    .withIndex('by_calendar_day', (q) => q.eq('calendarId', calendarId).eq('day', day))
    .unique();
}

async function today(ctx: Ctx, groupId: Id<'groups'>) {
  const group = (await ctx.db.get('groups', groupId))!;
  return todayIn(group.timezone);
}

function checkYear(year: number) {
  if (!Number.isInteger(year) || year < MIN_GIFT_YEAR || year > MAX_GIFT_YEAR) {
    throw new ConvexError({ code: 'INVALID_YEAR' });
  }
}

function checkDays(year: number, days: string[]) {
  const clean = cleanDays(year, days);
  if (clean === null) throw new ConvexError({ code: 'INVALID_DAYS' });
  return clean;
}

/** An empty name means "use the recipients' names". */
function checkName(name: string | undefined) {
  if (name === undefined) return undefined;
  const clean = cleanName(name).slice(0, MAX_NAME);
  return clean === '' ? undefined : clean;
}

function checkTitle(title: string) {
  const clean = cleanName(title).slice(0, MAX_TITLE);
  if (clean === '') throw new ConvexError({ code: 'DOOR_TITLE_REQUIRED' });
  return clean;
}

function checkPrice(price: number | null) {
  if (price === null) return undefined;
  const clean = cleanPrice(price);
  if (clean === null) throw new ConvexError({ code: 'INVALID_PRICE' });
  return clean;
}

function checkNote(note: string) {
  const clean = note.trim().slice(0, MAX_NOTE);
  return clean === '' ? undefined : clean;
}

/**
 * Recipients are one to ten other members of the family. Call `refuseSelf` first, before
 * anything is loaded, so the answer can't tell the caller whether a calendar exists.
 */
function refuseSelf(userId: Id<'users'>, ids: RecipientKey[]) {
  if ((ids as string[]).includes(userId)) throw new ConvexError({ code: 'RECIPIENT_IS_YOU' });
}

/**
 * New recipients must be in the family now: members, or family members without the app.
 * Recipients a calendar already has may stay after leaving, so it stays hidden from them if
 * they come back (`keep`).
 */
async function checkRecipients(
  ctx: Ctx,
  groupId: Id<'groups'>,
  ids: RecipientKey[],
  keep: RecipientKey[] = [],
) {
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > MAX_RECIPIENTS) {
    throw new ConvexError({ code: 'INVALID_CALENDAR_RECIPIENTS' });
  }
  for (const id of unique) {
    if (keep.includes(id)) continue;
    const userId = ctx.db.normalizeId('users', id);
    const ok =
      userId !== null
        ? (await getMembership(ctx, groupId, userId)) !== null
        : await isWithoutApp(ctx, groupId, id as Id<'familyMembers'>);
    if (!ok) throw new ConvexError({ code: 'INVALID_CALENDAR_RECIPIENTS' });
  }
  return unique;
}

/** A family member of `groupId` who has not joined with an account (yet). */
async function isWithoutApp(ctx: Ctx, groupId: Id<'groups'>, id: Id<'familyMembers'>) {
  const person = await ctx.db.get('familyMembers', id);
  return person !== null && person.groupId === groupId && person.userId === undefined;
}

async function keyName(ctx: Ctx, key: RecipientKey) {
  const userId = ctx.db.normalizeId('users', key);
  if (userId !== null) return (await ctx.db.get('users', userId))?.name ?? '';
  return (await ctx.db.get('familyMembers', key as Id<'familyMembers'>))?.name ?? '';
}

function round(amount: number) {
  return Math.round(amount * 100) / 100;
}

/** Counts and money for a calendar's doors; spent is Bought and Wrapped, planned all doors. */
function tally(days: string[], doors: Doc<'adventDoors'>[]) {
  const counts = { idea: 0, bought: 0, wrapped: 0 };
  let spent = 0;
  let planned = 0;
  for (const door of doors) {
    counts[door.status] += 1;
    planned += door.price ?? 0;
    if (isSpent(door.status)) spent += door.price ?? 0;
  }
  return {
    ...counts,
    empty: days.length - doors.length,
    spent: round(spent),
    planned: round(planned),
  };
}

function doorRow(calendar: Doc<'adventCalendars'>, door: Doc<'adventDoors'>) {
  return {
    _id: door._id,
    day: door.day,
    number: doorNumber(calendar.year, calendar.days, door.day),
    title: door.title,
    status: door.status,
    price: door.price ?? null,
    note: door.note ?? null,
  };
}

async function recipientRows(ctx: Ctx, ids: RecipientKey[]) {
  return await Promise.all(
    ids.map(async (id) => ({
      id,
      // The old name of `id`, for apps from before #95.
      userId: id,
      withoutApp: ctx.db.normalizeId('familyMembers', id) !== null,
      name: await keyName(ctx, id),
    })),
  );
}

/**
 * One year's Advent calendars the caller may see, each with its days, doors and totals, and the
 * members they can make a calendar for (everyone but themselves).
 */
export const calendars = query({
  args: { groupId: v.id('groups'), year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { userId } = await requireMembership(ctx, args.groupId);
    const now = await today(ctx, args.groupId);
    const currentYear = christmasYear(now);
    const year = args.year ?? currentYear;
    checkYear(year);
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .collect();
    memberships.sort((a, b) => a.joinedAt - b.joinedAt);
    const people = await ctx.db
      .query('familyMembers')
      .withIndex('by_group', (q) => q.eq('groupId', args.groupId))
      .collect();
    // Everyone in the family but the caller: members, then those without the app.
    const members = await recipientRows(ctx, [
      ...memberships.map((m) => m.userId).filter((id) => id !== userId),
      ...people
        .filter((p) => p.userId === undefined)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((p) => p._id),
    ]);
    const rows = [];
    for (const calendar of await visibleCalendars(ctx, args.groupId, userId, year)) {
      const doors = (await doorsOf(ctx, calendar._id)).filter((d) => calendar.days.includes(d.day));
      rows.push({
        _id: calendar._id,
        name: calendar.name ?? null,
        recipients: await recipientRows(ctx, await recipientIds(ctx, calendar._id)),
        days: calendar.days,
        doors: doors.map((d) => doorRow(calendar, d)),
        totals: tally(calendar.days, doors),
      });
    }
    return { year, currentYear, today: now, members, calendars: rows };
  },
});

/**
 * The Advent calendar card on Week: for each calendar the caller may see that is under way,
 * today's and tomorrow's door (or the next one). Null when there is nothing to show.
 */
export const weekCard = query({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }) => {
    const { userId } = await requireMembership(ctx, groupId);
    const now = await today(ctx, groupId);
    const rows = [];
    for (const calendar of await visibleCalendars(ctx, groupId, userId, christmasYear(now))) {
      const shown = cardDoors(calendar.days, now);
      if (shown === null) continue;
      const door = async (day: string | null) => {
        if (day === null) return null;
        const found = await doorOn(ctx, calendar._id, day);
        return {
          day,
          number: doorNumber(calendar.year, calendar.days, day),
          title: found?.title ?? null,
          status: found?.status ?? null,
        };
      };
      rows.push({
        _id: calendar._id,
        name: calendar.name ?? null,
        recipients: await recipientRows(ctx, await recipientIds(ctx, calendar._id)),
        today: await door(shown.today),
        tomorrow: await door(shown.tomorrow),
        next: await door(shown.next),
      });
    }
    return rows.length === 0 ? null : { today: now, tomorrow: addDays(now, 1), calendars: rows };
  },
});

async function setRecipientRows(
  ctx: MutationCtx,
  calendar: Doc<'adventCalendars'>,
  ids: RecipientKey[],
) {
  const rows = await recipientRowsOf(ctx, calendar._id);
  for (const row of rows) {
    if (!ids.includes(keyOf(row))) await ctx.db.delete('adventRecipients', row._id);
  }
  const had = new Set<string>(rows.map(keyOf));
  for (const id of ids) {
    if (had.has(id)) continue;
    const userId = ctx.db.normalizeId('users', id);
    await ctx.db.insert('adventRecipients', {
      groupId: calendar.groupId,
      calendarId: calendar._id,
      ...(userId !== null ? { userId } : { familyMemberId: id as Id<'familyMembers'> }),
    });
  }
}

/** Makes a calendar for one or more other members, with its days and an optional name. */
export const createCalendar = mutation({
  args: {
    groupId: v.id('groups'),
    year: v.number(),
    recipientIds: v.array(recipientKey),
    days: v.array(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    refuseSelf(userId, args.recipientIds);
    await requireMembership(ctx, args.groupId);
    checkYear(args.year);
    const days = checkDays(args.year, args.days);
    const recipients = await checkRecipients(ctx, args.groupId, args.recipientIds);
    // Only calendars the caller can see count, so the limit can't hint at one for them.
    const existing = await visibleCalendars(ctx, args.groupId, userId, args.year);
    if (existing.length >= MAX_CALENDARS) throw new ConvexError({ code: 'TOO_MANY_CALENDARS' });
    const calendarId = await ctx.db.insert('adventCalendars', {
      groupId: args.groupId,
      year: args.year,
      name: checkName(args.name),
      days,
      createdBy: userId,
      createdAt: Date.now(),
    });
    await setRecipientRows(ctx, (await ctx.db.get('adventCalendars', calendarId))!, recipients);
    return calendarId;
  },
});

/** Renames a calendar; an empty name goes back to the recipients' names. */
export const renameCalendar = mutation({
  args: { calendarId: v.id('adventCalendars'), name: v.string() },
  handler: async (ctx, args) => {
    const { calendar } = await loadCalendar(ctx, args.calendarId);
    await ctx.db.patch('adventCalendars', calendar._id, { name: checkName(args.name) });
  },
});

/** Sets who a calendar is for. Making yourself one of them is refused. */
export const setRecipients = mutation({
  args: { calendarId: v.id('adventCalendars'), recipientIds: v.array(recipientKey) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    refuseSelf(userId, args.recipientIds);
    const { calendar, recipients } = await loadCalendar(ctx, args.calendarId);
    const ids = await checkRecipients(ctx, calendar.groupId, args.recipientIds, recipients);
    await setRecipientRows(ctx, calendar, ids);
  },
});

/**
 * Sets a calendar's days. Removing a day whose door has something in it deletes that door, so
 * it is refused with DAYS_HAVE_DOORS unless the day is in `drop`: the filled days the member
 * was shown and agreed to lose. A door filled on another phone meanwhile is never lost unseen.
 */
export const setDays = mutation({
  args: {
    calendarId: v.id('adventCalendars'),
    days: v.array(v.string()),
    drop: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { calendar } = await loadCalendar(ctx, args.calendarId);
    const days = checkDays(calendar.year, args.days);
    const dropped = (await doorsOf(ctx, calendar._id)).filter((d) => !days.includes(d.day));
    const agreed = new Set(args.drop ?? []);
    if (dropped.some((d) => !agreed.has(d.day))) {
      throw new ConvexError({ code: 'DAYS_HAVE_DOORS', count: dropped.length });
    }
    for (const door of dropped) await ctx.db.delete('adventDoors', door._id);
    await ctx.db.patch('adventCalendars', calendar._id, { days });
  },
});

async function deleteCalendar(ctx: MutationCtx, calendarId: Id<'adventCalendars'>) {
  for (const door of await doorsOf(ctx, calendarId)) await ctx.db.delete('adventDoors', door._id);
  const rows = await ctx.db
    .query('adventRecipients')
    .withIndex('by_calendar', (q) => q.eq('calendarId', calendarId))
    .collect();
  for (const row of rows) await ctx.db.delete('adventRecipients', row._id);
  await ctx.db.delete('adventCalendars', calendarId);
}

/** Deletes a calendar with all its doors. */
export const removeCalendar = mutation({
  args: { calendarId: v.id('adventCalendars') },
  handler: async (ctx, args) => {
    const { calendar } = await loadCalendar(ctx, args.calendarId);
    await deleteCalendar(ctx, calendar._id);
  },
});

function checkDay(calendar: Doc<'adventCalendars'>, day: string) {
  if (!calendar.days.includes(day)) throw new ConvexError({ code: 'INVALID_DAYS' });
}

/** Sets what is behind one door, from the door sheet. Sets absolute state. */
export const setDoor = mutation({
  args: {
    calendarId: v.id('adventCalendars'),
    day: v.string(),
    title: v.string(),
    status: giftStatus,
    price: v.union(v.number(), v.null()),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const { calendar } = await loadCalendar(ctx, args.calendarId);
    checkDay(calendar, args.day);
    const fields = {
      title: checkTitle(args.title),
      status: args.status,
      price: checkPrice(args.price),
      note: checkNote(args.note),
    };
    const door = await doorOn(ctx, calendar._id, args.day);
    if (door === null) {
      await ctx.db.insert('adventDoors', {
        groupId: calendar.groupId,
        calendarId: calendar._id,
        day: args.day,
        ...fields,
      });
    } else {
      await ctx.db.patch('adventDoors', door._id, fields);
    }
  },
});

/** Sets a filled door's status (Idea, Bought, Wrapped). */
export const setDoorStatus = mutation({
  args: { calendarId: v.id('adventCalendars'), day: v.string(), status: giftStatus },
  handler: async (ctx, args) => {
    const { calendar } = await loadCalendar(ctx, args.calendarId);
    const door = await doorOn(ctx, calendar._id, args.day);
    if (door === null || !calendar.days.includes(door.day)) throw accessError('NOT_FOUND');
    await ctx.db.patch('adventDoors', door._id, { status: args.status });
  },
});

/** Empties a door. Emptying an empty door does nothing. */
export const clearDoor = mutation({
  args: { calendarId: v.id('adventCalendars'), day: v.string() },
  handler: async (ctx, args) => {
    const { calendar } = await loadCalendar(ctx, args.calendarId);
    checkDay(calendar, args.day);
    const door = await doorOn(ctx, calendar._id, args.day);
    if (door !== null) await ctx.db.delete('adventDoors', door._id);
  },
});

// Clean-up, shared with groups.ts and account.ts.

/** Deletes every Advent calendar of a family that is being deleted. */
export async function deleteFamilyAdvent(ctx: MutationCtx, groupId: Id<'groups'>) {
  const calendars = await ctx.db
    .query('adventCalendars')
    .withIndex('by_group_year', (q) => q.eq('groupId', groupId))
    .collect();
  for (const calendar of calendars) await deleteCalendar(ctx, calendar._id);
}

/**
 * A deleted account is taken off every calendar it was a recipient of, in every family, also
 * ones left earlier. A calendar left without recipients is deleted (it was only for them).
 */
export async function forgetAdventRecipient(ctx: MutationCtx, userId: Id<'users'>) {
  const rows = await ctx.db
    .query('adventRecipients')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete('adventRecipients', row._id);
    if ((await recipientIds(ctx, row.calendarId)).length === 0) {
      await deleteCalendar(ctx, row.calendarId);
    }
  }
}

/**
 * A family member without the app who is removed from the family is taken off its calendars,
 * and a calendar left without recipients is deleted.
 */
export async function forgetAdventFamilyMember(ctx: MutationCtx, id: Id<'familyMembers'>) {
  const rows = await ctx.db
    .query('adventRecipients')
    .withIndex('by_family_member', (q) => q.eq('familyMemberId', id))
    .collect();
  for (const row of rows) {
    if (row.userId !== undefined) continue;
    await ctx.db.delete('adventRecipients', row._id);
    if ((await recipientIds(ctx, row.calendarId)).length === 0) {
      await deleteCalendar(ctx, row.calendarId);
    }
  }
}

/**
 * A family member without the app joined with their invite: their calendars now carry their
 * user id, which hides them from them (ADR 0003). If a calendar already had them by user id
 * too, the second row goes.
 */
export async function claimAdventRecipient(
  ctx: MutationCtx,
  id: Id<'familyMembers'>,
  userId: Id<'users'>,
) {
  const rows = await ctx.db
    .query('adventRecipients')
    .withIndex('by_family_member', (q) => q.eq('familyMemberId', id))
    .collect();
  for (const row of rows) {
    const twin = (await recipientRowsOf(ctx, row.calendarId)).find(
      (r) => r._id !== row._id && r.userId === userId,
    );
    if (twin !== undefined) await ctx.db.delete('adventRecipients', twin._id);
    await ctx.db.patch('adventRecipients', row._id, { userId });
  }
}

/** A deleted account leaves no name behind on calendars it made, in any family. */
export async function forgetAdventCreator(ctx: MutationCtx, userId: Id<'users'>) {
  const made = await ctx.db
    .query('adventCalendars')
    .withIndex('by_creator', (q) => q.eq('createdBy', userId))
    .collect();
  for (const calendar of made) {
    await ctx.db.patch('adventCalendars', calendar._id, { createdBy: undefined });
  }
}
